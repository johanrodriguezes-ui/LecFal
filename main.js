const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const { Readable } = require('stream');
const DatabaseManager = require('./src/core/db');
const LibraryScanner = require('./src/scanner/scanner');
const logger = require('./src/core/logger');
const storage = require('./src/core/storage');
const cbzProvider = require('./src/readers/cbz-provider');
const thumbnailGenerator = require('./src/media/thumbnail-generator');

let mainWindow = null;
let db = null;
let scanner = null;

// Register custom privileges for local media protocols
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lecfal-cover',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  },
  {
    scheme: 'lecfal-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  },
  {
    scheme: 'lecfal-cbz',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

async function createWindow() {
  // Initialize storage layer. This reads the persisted storage mode and,
  // if Portable mode is active, the persisted Portable data path from an
  // external config file (~/.config/lecfal/portable.json on Linux).
  // It NEVER falls back to <appDir>/data, because in a packaged AppImage
  // that directory lives inside a read-only mount.
  storage.init();

  // If Portable mode is active but no usable data path is configured,
  // we cannot initialize the database yet. Surface the problem to the
  // user and open a minimal window that lets them choose a folder in
  // Settings > Ubicación de datos.
  const storageRoot = storage.getStorageRoot();
  if (!storageRoot) {
    logger.init(path.join(storage.getStandardDataPath(), 'logs', 'lecfal.log'));
    logger.warn('APP', `Modo portable activo pero sin directorio de datos configurado. Se requiere selección del usuario.`);

    mainWindow = new BrowserWindow({
      width: 900,
      height: 640,
      minWidth: 720,
      minHeight: 480,
      backgroundColor: '#0c0f17',
      title: 'LecFal - Configuración de almacenamiento requerida',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'src', 'preload', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    return;
  }

  // Initialize logger with centralized log path inside the active storage root
  logger.init(storage.getLogFilePath());
  logger.info('APP', `Iniciando LecFal v${app.getVersion()}`);
  logger.info('APP', `Storage Mode: ${storage.getStorageMode()}`);
  logger.info('APP', `Data Root: ${storage.getDataRoot()}`);
  logger.info('APP', `Archivo de base de datos: ${storage.getDatabasePath()}`);
  logger.info('APP', `Directorio de thumbnails: ${storage.getThumbnailsPath()}`);

  db = new DatabaseManager(storage.getDatabasePath());
  await db.init();
  logger.info('DATABASE', 'Base de datos SQLite inicializada correctamente con Series y Capítulos');

  scanner = new LibraryScanner(storage.getThumbnailsPath());

  // Restore saved window size or default
  const savedBounds = db.getSetting('window_bounds', { width: 1240, height: 820 });

  mainWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    minWidth: 850,
    minHeight: 580,
    backgroundColor: '#0c0f17',
    title: 'LecFal - Tu biblioteca de mangas y comics',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', () => {
    if (mainWindow && db) {
      try {
        db.setSetting('window_bounds', mainWindow.getBounds());
      } catch (_) {}
    }
  });

  mainWindow.on('enter-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:fullscreen-changed', true);
    }
  });
  mainWindow.on('leave-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:fullscreen-changed', false);
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  // Schedule background thumbnail generation for existing covers without blocking UI
  setTimeout(() => {
    thumbnailGenerator.backfill().catch(err => {
      logger.warn('THUMBNAIL', `Error durante el backfill de miniaturas: ${err.message}`);
    });
  }, 2000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}


// App lifecycle
app.whenReady().then(() => {
  // Helper to safely extract local filesystem path from custom protocol URL across all OS and mount types
  function resolveCustomProtocolPath(requestUrl) {
    try {
      const parsed = new URL(requestUrl);
      let targetPath = parsed.searchParams.get('path');

      // Backward compatibility if path was passed in pathname
      if (!targetPath) {
        let p = decodeURIComponent(parsed.pathname);
        if (parsed.hostname && parsed.hostname !== 'cover' && parsed.hostname !== 'file' && parsed.hostname !== 'local') {
          p = (process.platform === 'win32' ? '' : '/') + parsed.hostname + p;
        }
        targetPath = p;
      }

      if (targetPath && !targetPath.startsWith('/') && process.platform !== 'win32') {
        targetPath = '/' + targetPath;
      }
      return targetPath;
    } catch (err) {
      return null;
    }
  }

  // Handle custom media protocol for covers (supports full-resolution and ?type=grid thumbnails)
  protocol.handle('lecfal-cover', (request) => {
    try {
      const targetPath = resolveCustomProtocolPath(request.url);
      if (!targetPath) {
        logger.warn('PROTOCOL', `Solicitud lecfal-cover sin ruta válida: ${request.url}`);
        return new Response('Invalid path', { status: 400 });
      }

      if (!fs.existsSync(targetPath)) {
        logger.warn('PROTOCOL', `Archivo de portada no encontrado en disco: "${targetPath}"`);
        return new Response('Not found', { status: 404 });
      }

      let fileToServe = targetPath;
      try {
        const parsedUrl = new URL(request.url);
        if (parsedUrl.searchParams.get('type') === 'grid') {
          const gridThumb = thumbnailGenerator.getExistingThumbnailPath(targetPath);
          if (gridThumb) {
            fileToServe = gridThumb;
          } else {
            // Queue thumbnail generation with high priority, but immediately serve original cover to avoid UI stalls
            thumbnailGenerator.enqueue(targetPath, true);
          }
        }
      } catch (_) {}

      return net.fetch(url.pathToFileURL(fileToServe).toString());
    } catch (e) {
      logger.error('PROTOCOL', `Error sirviendo lecfal-cover (${request.url}): ${e.message}`);
      return new Response('Server error', { status: 500 });
    }
  });

  // Handle custom media protocol for reading files (PDFs, etc.)
  protocol.handle('lecfal-file', (request) => {
    try {
      const targetPath = resolveCustomProtocolPath(request.url);
      if (!targetPath) {
        logger.warn('PROTOCOL', `Solicitud lecfal-file sin ruta válida: ${request.url}`);
        return new Response('Invalid path', { status: 400 });
      }

      if (!fs.existsSync(targetPath)) {
        logger.warn('PROTOCOL', `Archivo no encontrado en disco: "${targetPath}"`);
        return new Response('Not found', { status: 404 });
      }

      return net.fetch(url.pathToFileURL(targetPath).toString());
    } catch (e) {
      logger.error('PROTOCOL', `Error sirviendo lecfal-file (${request.url}): ${e.message}`);
      return new Response('Server error', { status: 500 });
    }
  });

  // Handle custom media protocol for streaming individual CBZ pages on demand
  protocol.handle('lecfal-cbz', async (request) => {
    try {
      const parsed = new URL(request.url);
      const chapterId = parsed.searchParams.get('chapterId');
      const entryName = parsed.searchParams.get('entry');
      const pageIndexStr = parsed.searchParams.get('page');
      const pageIndex = (pageIndexStr !== null && pageIndexStr !== '') ? parseInt(pageIndexStr, 10) : null;

      let filePath = null;
      if (chapterId && db) {
        const chapter = db.getChapterById(chapterId);
        if (chapter && chapter.file_path) {
          filePath = chapter.file_path;
        }
      }

      // Fallback: direct path parameter if chapterId was not supplied
      if (!filePath) {
        filePath = resolveCustomProtocolPath(request.url);
      }

      if (!filePath || !fs.existsSync(filePath)) {
        logger.warn('CBZ_PROTOCOL', `Archivo CBZ no encontrado para solicitud: ${request.url}`);
        return new Response('Chapter archive not found', { status: 404 });
      }

      if (!entryName && pageIndex === null) {
        return new Response('Entry name or page index missing', { status: 400 });
      }

      const streamInfo = await cbzProvider.getEntryStream(filePath, entryName, pageIndex);
      const webStream = Readable.toWeb(streamInfo.stream);

      return new Response(webStream, {
        headers: {
          'Content-Type': streamInfo.mimeType,
          'Content-Length': String(streamInfo.size),
          'Cache-Control': 'public, max-age=3600'
        }
      });
    } catch (err) {
      logger.error('CBZ_PROTOCOL', `Error sirviendo página CBZ (${request.url}): ${err.message}`);
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('APP', 'Todas las ventanas cerradas. Saliendo...');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==================== IPC HANDLERS ====================

// Select folder dialog
ipcMain.handle('dialog:select-folder', async () => {
  if (!mainWindow) return null;
  logger.info('DIALOG', 'Abriendo selector de directorio nativo');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar carpeta de mangas y cómics',
    properties: ['openDirectory'],
    buttonLabel: 'Añadir a la biblioteca'
  });

  if (result.canceled || !result.filePaths.length) {
    logger.info('DIALOG', 'Selección cancelada por el usuario');
    return null;
  }
  logger.info('DIALOG', `Carpeta seleccionada: ${result.filePaths[0]}`);
  return result.filePaths[0];
});

// Library folders
ipcMain.handle('library:get-folders', async () => {
  const folders = db.getFolders();
  return folders.map(f => ({
    ...f,
    accessible: fs.existsSync(f.path)
  }));
});

ipcMain.handle('library:add-folder', async (event, folderPath) => {
  if (!folderPath) return null;
  const folder = db.addFolder(folderPath);
  if (!folder) return null;
  logger.info('LIBRARY', `Carpeta añadida: ${folder.name} (${folder.path})`);
  return {
    ...folder,
    accessible: fs.existsSync(folder.path)
  };
});

ipcMain.handle('library:remove-folder', async (event, folderId) => {
  db.removeFolder(Number(folderId));
  logger.info('LIBRARY', `Carpeta eliminada ID: ${folderId}`);
  return true;
});

// ==================== TAG MANAGEMENT IPC ====================
ipcMain.handle('tags:get-all', async () => {
  return db.getAllTags();
});

ipcMain.handle('tags:create', async (event, name) => {
  const newTag = db.createTag(name);
  if (newTag) {
    logger.info('TAGS', `Tag creado: "${newTag.name}" (ID ${newTag.id})`);
  }
  return newTag;
});

ipcMain.handle('tags:rename', async (event, { id, name }) => {
  db.renameTag(id, name);
  logger.info('TAGS', `Tag ID ${id} renombrado a: "${name}"`);
  return true;
});

ipcMain.handle('tags:delete', async (event, id) => {
  db.deleteTag(id);
  logger.info('TAGS', `Tag eliminado ID: ${id}`);
  return true;
});

ipcMain.handle('tags:set-series-tags', async (event, { seriesId, tagIds }) => {
  const updatedTags = db.setSeriesTags(seriesId, tagIds);
  logger.info('TAGS', `Tags actualizados para serie ID ${seriesId}: ${updatedTags.map(t => t.name).join(', ')}`);
  return updatedTags;
});

// ==================== AUTHOR MANAGEMENT IPC ====================
ipcMain.handle('authors:get-all', async () => {
  return db.getAllAuthors();
});

ipcMain.handle('authors:create', async (event, name) => {
  const newAuthor = db.createAuthor(name);
  if (newAuthor) {
    logger.info('AUTHORS', `Autor creado: "${newAuthor.name}" (ID ${newAuthor.id})`);
  }
  return newAuthor;
});

ipcMain.handle('authors:rename', async (event, { id, name }) => {
  db.renameAuthor(id, name);
  logger.info('AUTHORS', `Autor ID ${id} renombrado a: "${name}"`);
  return true;
});

ipcMain.handle('authors:delete', async (event, id) => {
  db.deleteAuthor(id);
  logger.info('AUTHORS', `Autor eliminado ID: ${id}`);
  return true;
});

ipcMain.handle('authors:set-series-authors', async (event, { seriesId, authorIds }) => {
  const updated = db.setSeriesAuthors(seriesId, authorIds);
  logger.info('AUTHORS', `Autores actualizados para serie ID ${seriesId}: ${updated.map(a => a.name).join(', ')}`);
  return updated;
});

ipcMain.handle('authors:ignore', async (event, name) => {
  const result = db.ignoreAuthor(name);
  logger.info('AUTHORS', `Autor ignorado: "${name}"`);
  return result;
});

ipcMain.handle('authors:unignore', async (event, name) => {
  const result = db.unignoreAuthor(name);
  logger.info('AUTHORS', `Autor des-ignorado: "${name}"`);
  return result;
});

ipcMain.handle('authors:get-all-ignored', async () => {
  return db.getAllIgnoredAuthors();
});

// ==================== LANGUAGE MANAGEMENT IPC ====================
ipcMain.handle('languages:get-all', async () => {
  return db.getAllLanguages();
});

ipcMain.handle('languages:create', async (event, name) => {
  const newLang = db.createLanguage(name);
  if (newLang) {
    logger.info('LANGUAGES', `Idioma creado: "${newLang.name}" (ID ${newLang.id})`);
  }
  return newLang;
});

ipcMain.handle('languages:rename', async (event, { id, name }) => {
  db.renameLanguage(id, name);
  logger.info('LANGUAGES', `Idioma ID ${id} renombrado a: "${name}"`);
  return true;
});

ipcMain.handle('languages:delete', async (event, id) => {
  db.deleteLanguage(id);
  logger.info('LANGUAGES', `Idioma eliminado ID: ${id}`);
  return true;
});

ipcMain.handle('languages:set-series-languages', async (event, { seriesId, languageIds }) => {
  const updated = db.setSeriesLanguages(seriesId, languageIds);
  logger.info('LANGUAGES', `Idiomas actualizados para serie ID ${seriesId}: ${updated.map(l => l.name).join(', ')}`);
  return updated;
});

// ==================== SERIES / PARODY MANAGEMENT IPC ====================
ipcMain.handle('parodies:get-all', async () => {
  return db.getAllParodies();
});

ipcMain.handle('parodies:create', async (event, name) => {
  const newParody = db.createParody(name);
  if (newParody) {
    logger.info('PARODIES', `Serie/Parodia creada: "${newParody.name}" (ID ${newParody.id})`);
  }
  return newParody;
});

ipcMain.handle('parodies:rename', async (event, { id, name }) => {
  db.renameParody(id, name);
  logger.info('PARODIES', `Serie/Parodia ID ${id} renombrada a: "${name}"`);
  return true;
});

ipcMain.handle('parodies:delete', async (event, id) => {
  db.deleteParody(id);
  logger.info('PARODIES', `Serie/Parodia eliminada ID: ${id}`);
  return true;
});

ipcMain.handle('parodies:set-series-parodies', async (event, { seriesId, parodyIds }) => {
  const updated = db.setSeriesParodies(seriesId, parodyIds);
  logger.info('PARODIES', `Series/Parodias actualizadas para serie ID ${seriesId}: ${updated.map(p => p.name).join(', ')}`);
  return updated;
});

// ==================== GROUP MANAGEMENT IPC ====================
ipcMain.handle('groups:get-all', async () => {
  return db.getAllGroups();
});

ipcMain.handle('groups:create', async (event, name) => {
  const newGroup = db.createGroup(name);
  if (newGroup) {
    logger.info('GROUPS', `Grupo creado: "${newGroup.name}" (ID ${newGroup.id})`);
  }
  return newGroup;
});

ipcMain.handle('groups:rename', async (event, { id, name }) => {
  db.renameGroup(id, name);
  logger.info('GROUPS', `Grupo ID ${id} renombrado a: "${name}"`);
  return true;
});

ipcMain.handle('groups:delete', async (event, id) => {
  db.deleteGroup(id);
  logger.info('GROUPS', `Grupo eliminado ID: ${id}`);
  return true;
});

ipcMain.handle('groups:set-series-groups', async (event, { seriesId, groupIds }) => {
  const updated = db.setSeriesGroups(seriesId, groupIds);
  logger.info('GROUPS', `Grupos actualizados para serie ID ${seriesId}: ${updated.map(g => g.name).join(', ')}`);
  return updated;
});

// ==================== LIBRARY MANAGEMENT IPC ====================
ipcMain.handle('libraries:get-all', async () => {
  return db.getLibraries();
});

ipcMain.handle('libraries:get-by-id', async (event, id) => {
  return db.getLibraryById(id);
});

ipcMain.handle('libraries:create', async (event, payload) => {
  const name = typeof payload === 'object' && payload !== null ? payload.name : payload;
  const options = typeof payload === 'object' && payload !== null ? payload.options : undefined;
  const newLib = db.createLibrary(name, options);
  if (newLib) {
    logger.info('LIBRARIES', `Biblioteca creada: "${newLib.name}" (ID ${newLib.id})`);
  }
  return newLib;
});

ipcMain.handle('libraries:rename', async (event, { id, name }) => {
  const result = db.renameLibrary(id, name);
  logger.info('LIBRARIES', `Biblioteca ID ${id} renombrada a: "${name}"`);
  return result;
});

ipcMain.handle('libraries:delete', async (event, id) => {
  const result = db.deleteLibrary(id);
  logger.info('LIBRARIES', `Biblioteca eliminada ID: ${id}`);
  return result;
});

ipcMain.handle('libraries:assign-folder', async (event, { folderId, libraryId }) => {
  const result = db.assignFolderToLibrary(folderId, libraryId);
  logger.info('LIBRARIES', `Carpeta ID ${folderId} asignada a biblioteca ID: ${libraryId}`);
  return result;
});

ipcMain.handle('libraries:get-folders-by-library', async (event, libraryId) => {
  return db.getFoldersByLibrary(libraryId);
});

// Helper for scanning a folder and saving Series + Chapters with progressive UI updates
async function scanFolderWithSeries(folder, options = {}) {
  const mode = options.mode || 'incremental';

  // Check if folder is accessible (handles unmounted external drives or VeraCrypt volumes gracefully)
  if (!fs.existsSync(folder.path)) {
    logger.warn('SCANNER', `La carpeta "${folder.name}" (${folder.path}) no está accesible actualmente (disco o volumen desmontado).`);
    return {
      totalSeries: 0,
      newFiles: 0,
      modifiedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0,
      totalProcessed: 0,
      totalDiscovered: 0,
      totalScanTime: '0.0s',
      durationSeconds: 0,
      unavailable: true,
      cancelled: false
    };
  }

  logger.info('SCANNER', `Iniciando escaneo (${mode.toUpperCase()}) de carpeta "${folder.name}" (${folder.path})`);

  let changedSeriesCount = 0;
  let lastProgressTime = 0;
  let lastBatchNotifyTime = 0;
  let pendingBatchCount = 0;

  const registeredChapters = db.getRegisteredChaptersMap(folder.id);
  const registeredSeries = db.getRegisteredSeriesMap(folder.id);

  const onProgress = (data) => {
    const now = Date.now();
    // Throttle progress IPC to ~80ms to avoid flooding renderer, but always deliver 100% completion
    if (now - lastProgressTime >= 80 || data.current === data.total) {
      lastProgressTime = now;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scan:progress', {
          folderId: folder.id,
          folderName: folder.name,
          file: `${data.seriesTitle} (${data.chapterCount} caps)`,
          current: data.current,
          total: data.total,
          durationMs: data.durationMs,
          hasChanges: data.hasChanges
        });
      }
    }
  };

  const onSeries = (seriesData, current, total) => {
    // If cancellation was requested, immediately discard new DB operations
    if (scanner.isCancelled) return;

    // In incremental mode, skip DB upserts if series and all its chapters are unchanged
    if (!seriesData.hasChanges && seriesData.seriesId && mode !== 'full') {
      return;
    }

    changedSeriesCount++;
    pendingBatchCount++;

    // Save series into DB
    const seriesId = db.upsertSeries({
      folder_id: folder.id,
      title: seriesData.title,
      author: seriesData.author,
      path: seriesData.path,
      cover_path: seriesData.cover_path,
      chapter_count: seriesData.chapter_count,
      primary_format: seriesData.primary_format
    });

    // Save its changed/new chapters
    for (const ch of seriesData.chapters) {
      if (scanner.isCancelled) return;
      if (mode === 'full' || ch.status !== 'unchanged') {
        db.upsertChapter({
          series_id: seriesId,
          title: ch.title,
          file_name: ch.file_name,
          file_path: ch.file_path,
          format: ch.format,
          file_size: ch.file_size,
          mtime_ms: ch.mtime_ms,
          chapter_number: ch.chapter_number
        });
      }
    }

    // Periodic in-memory transaction commit every 50 changed series (avoids export/fs overhead)
    if (changedSeriesCount % 50 === 0) {
      db.commit();
      db.beginTransaction();
    }

    // Stream batched live update notification to UI (throttled to at most once every 500ms)
    const now = Date.now();
    if (now - lastBatchNotifyTime >= 500 || current === total) {
      lastBatchNotifyTime = now;
      if (mainWindow && !mainWindow.isDestroyed() && !scanner.isCancelled) {
        mainWindow.webContents.send('library:series-batch', {
          seriesId,
          title: seriesData.title,
          current,
          total,
          count: pendingBatchCount
        });
        pendingBatchCount = 0;
      }
    }
  };

  db.beginTransaction();

  let report;
  try {
    report = await scanner.scanDirectory(folder.path, {
      mode,
      registeredChapters,
      registeredSeries,
      onProgress,
      onSeries
    });

    if (report.cancelled || scanner.isCancelled) {
      db.commit();
      logger.info('SCANNER', `Escaneo cancelado en carpeta "${folder.name}".`);
      return { ...report, cancelled: true };
    }

    if (report.failed) {
      db.rollback();
      logger.error('SCANNER', `Escaneo fallido en carpeta "${folder.name}".`);
      return { ...report, failed: true };
    }

    // Prune missing records ONLY on complete, successful scan
    const pruneStats = db.pruneFolder(
      folder.id,
      report.discoveredChapterPaths,
      report.discoveredSeriesPaths
    );
    report.prunedChapters = pruneStats.prunedChapters;
    report.prunedSeries = pruneStats.prunedSeries;

    db.commit();
    db.updateFolderScanTime(folder.id);
    logger.info('SCANNER', `Finalizado: ${report.totalSeries} series evaluadas en "${folder.name}" (${report.newFiles} nuevos, ${report.modifiedFiles} modificados, ${report.skippedFiles} omitidos, ${report.prunedChapters} capítulos eliminados, ${report.prunedSeries} series eliminadas).`);
    return report;
  } catch (err) {
    db.rollback();
    logger.error('SCANNER', `Error escaneando carpeta "${folder.name}": ${err.message}`);
    throw err;
  }
}

// Scanning IPC
ipcMain.handle('library:scan-folder', async (event, folderId, options = {}) => {
  const folders = db.getFolders();
  const folder = folders.find(f => f.id === folderId);
  if (!folder) throw new Error('Carpeta no encontrada');

  scanner.reset();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scan:status', { status: 'scanning' });
  }

  const report = await scanFolderWithSeries(folder, options);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scan:status', {
      status: report.cancelled ? 'cancelled' : 'completed'
    });
  }

  return { count: report.totalSeries, ...report };
});

ipcMain.handle('library:scan-all', async (event, options = {}) => {
  const folders = db.getFolders();
  let totalScanned = 0;
  let newFiles = 0;
  let modifiedFiles = 0;
  let skippedFiles = 0;
  let failedFiles = 0;
  let prunedChapters = 0;
  let prunedSeries = 0;
  let totalProcessed = 0;
  let cancelled = false;

  scanner.reset();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scan:status', { status: 'scanning' });
  }

  logger.info('SCANNER', `Escaneando todas las carpetas (${folders.length} registradas)`);
  for (const folder of folders) {
    if (scanner.isCancelled) {
      cancelled = true;
      break;
    }
    const report = await scanFolderWithSeries(folder, options);
    totalScanned += report.totalSeries;
    newFiles += report.newFiles;
    modifiedFiles += report.modifiedFiles;
    skippedFiles += report.skippedFiles;
    failedFiles += report.failedFiles;
    prunedChapters += report.prunedChapters || 0;
    prunedSeries += report.prunedSeries || 0;
    totalProcessed += report.totalProcessed;
    if (report.cancelled || scanner.isCancelled) {
      cancelled = true;
      break;
    }
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scan:status', {
      status: cancelled ? 'cancelled' : 'completed'
    });
  }

  logger.info('SCANNER', `
========================================
RESUMEN GENERAL DE BIBLIOTECA (${(options.mode || 'incremental').toUpperCase()})
----------------------------------------
Total series evaluadas: ${totalScanned}
Nuevos archivos:        ${newFiles}
Archivos modificados:   ${modifiedFiles}
Archivos omitidos:      ${skippedFiles}
Archivos con error:     ${failedFiles}
Capítulos eliminados:   ${prunedChapters}
Series eliminadas:      ${prunedSeries}
Total procesados:       ${totalProcessed}
Carpetas escaneadas:    ${folders.length}
Estado final:           ${cancelled ? 'CANCELADO' : 'COMPLETADO'}
========================================
  `.trim());

  return {
    count: totalScanned,
    totalScanned,
    foldersCount: folders.length,
    newFiles,
    modifiedFiles,
    skippedFiles,
    failedFiles,
    prunedChapters,
    prunedSeries,
    totalProcessed,
    cancelled
  };
});

ipcMain.handle('library:cancel-scan', async () => {
  if (scanner) {
    scanner.cancel();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan:status', { status: 'cancelling' });
    }
    return true;
  }
  return false;
});

// ==================== SERIES & CHAPTERS IPC ====================
ipcMain.handle('library:get-series', async (event, filters) => {
  return db.getSeriesList(filters);
});

ipcMain.handle('library:get-series-detail', async (event, { seriesId, sortOrder = 'asc' }) => {
  const series = db.getSeriesById(seriesId);
  if (!series) return null;
  const chapters = db.getChapters(seriesId, { sortOrder });
  return {
    ...series,
    chapters
  };
});

ipcMain.handle('library:update-series-metadata', async (event, data) => {
  logger.info('METADATA', `Actualizando metadatos para serie ID ${data.seriesId}: ${data.title || ''}`);
  return db.updateSeriesMetadata(data.seriesId, data);
});

ipcMain.handle('library:toggle-series-fav', async (event, seriesId) => {
  return db.toggleSeriesFavorite(seriesId);
});

ipcMain.handle('library:toggle-chapter-read', async (event, chapterId) => {
  return db.toggleChapterRead(chapterId);
});

ipcMain.handle('library:mark-all-read', async (event, { seriesId, isRead }) => {
  return db.markAllChaptersRead(seriesId, isRead);
});

// Remove series from library (preserve original files)
ipcMain.handle('series:remove-from-library', async (event, seriesId) => {
  logger.info('LIBRARY', `Quitando manga ID ${seriesId} de la biblioteca (conservando archivos)`);
  try {
    return db.removeFromLibrary(seriesId);
  } catch (err) {
    logger.error('LIBRARY', `Error al quitar manga ID ${seriesId}: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// Permanently delete series and associated files from disk
ipcMain.handle('series:delete-permanently', async (event, seriesId) => {
  logger.info('LIBRARY', `Eliminando definitivamente manga ID ${seriesId} y sus archivos`);
  try {
    return db.deletePermanently(seriesId);
  } catch (err) {
    logger.error('LIBRARY', `Error al eliminar definitivamente manga ID ${seriesId}: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// Save PDF cover for series
ipcMain.handle('library:save-series-cover', async (event, { seriesId, filePath, dataUrl }) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stats = fs.statSync(filePath);
    const hash = scanner.getFileHash(filePath, stats);
    const targetCoverPath = storage.getThumbnailFilePath(hash);

    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(targetCoverPath, buffer);

    db.db.run('UPDATE series SET cover_path = ? WHERE id = ?', [targetCoverPath, seriesId]);
    db.save();

    // Enqueue downsampled grid thumbnail generation in background
    thumbnailGenerator.enqueue(targetCoverPath, true);

    logger.info('PDF', `Portada de serie generada y asignada para ID ${seriesId}`);
    return targetCoverPath;
  } catch (err) {
    logger.error('PDF', `Error guardando portada de serie: ${err.message}`);
    return null;
  }
});

// Library thumbnail management IPC handlers
ipcMain.handle('thumbnails:backfill', async () => {
  return thumbnailGenerator.backfill();
});

ipcMain.handle('thumbnails:get-stats', async () => {
  return thumbnailGenerator.getStats();
});

// Open chapter file with default system application
ipcMain.handle('library:open-file', async (event, filePath) => {
  if (!fs.existsSync(filePath)) {
    logger.warn('SHELL', `Archivo no encontrado al intentar abrir: ${filePath}`);
    throw new Error('El archivo no existe en el disco.');
  }
  logger.info('SHELL', `Abriendo capítulo con lector predeterminado: ${path.basename(filePath)}`);
  return shell.openPath(filePath);
});

// Show file/folder in system file explorer
ipcMain.handle('library:show-in-folder', async (event, targetPath) => {
  if (fs.existsSync(targetPath)) {
    logger.info('SHELL', `Mostrando en explorador: ${targetPath}`);
    shell.showItemInFolder(targetPath);
    return true;
  }
  return false;
});

// Settings
ipcMain.handle('settings:get', async (event, key, defaultValue) => {
  return db.getSetting(key, defaultValue);
});

ipcMain.handle('settings:set', async (event, key, value) => {
  db.setSetting(key, value);
  return true;
});

// Storage & Portability IPC

// Opens a native folder picker dedicated to storage location selection.
// Kept separate from dialog:select-folder (which is library-specific) to avoid
// overloading unrelated IPC semantics.
ipcMain.handle('storage:select-directory', async () => {
  if (!mainWindow) return null;
  logger.info('STORAGE', 'Abriendo selector nativo de directorio para datos portables');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar directorio de datos portables de LecFal',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Usar esta carpeta'
  });

  if (result.canceled || !result.filePaths.length) {
    logger.info('STORAGE', 'Selección de directorio portable cancelada por el usuario');
    return null;
  }
  logger.info('STORAGE', `Directorio portable seleccionado: ${result.filePaths[0]}`);
  return result.filePaths[0];
});

// Persists a user-chosen portable data path via StorageManager.
// Does NOT copy, migrate, or delete any data; migration must be triggered
// separately via the existing storage:migrate handler.
ipcMain.handle('storage:set-portable-path', async (event, payload = {}) => {
  const targetPath = payload && typeof payload === 'object' ? payload.path : payload;
  if (!targetPath || typeof targetPath !== 'string') {
    return { success: false, error: 'Ruta no especificada' };
  }

  const result = storage.setPortableDataPath(targetPath);
  if (result.success) {
    logger.info('STORAGE', `Ruta portable configurada: ${result.path}`);

    // If the app was started without a usable storage root (portable mode
    // requested but unconfigured), we now need to (re)initialize the DB
    // on the newly selected path. Simplest safe path: request a relaunch.
    if (!db || !db.db) {
      setTimeout(() => {
        try {
          if (app && typeof app.relaunch === 'function') {
            app.relaunch();
            app.exit(0);
          }
        } catch (e) {
          logger.error('STORAGE', `Error al reiniciar tras configurar la ruta portable: ${e.message}`);
        }
      }, 600);
    }
  } else {
    logger.warn('STORAGE', `Fallo al configurar ruta portable: ${result.error}`);
  }
  return result;
});

ipcMain.handle('storage:get-info', async () => {
  return {
    mode: storage.getStorageMode(),
    isPortable: storage.isPortableMode(),
    storageRoot: storage.getStorageRoot(),
    standardPath: storage.getStandardDataPath(),
    portablePath: storage.getPortableDataPath(),          // string | null
    defaultPortablePath: storage.getDefaultPortableDataPath(), // legacy, no usar
    configuredPortablePath: storage.getConfiguredPortablePath(),
    portablePathConfigured: storage.hasConfiguredPortablePath(),
    portablePathError: storage.getPortablePathError(),
    isPortableAvailable: storage.isPortableModeAvailable(),
    appDir: storage.getAppDirectory()
  };
});

ipcMain.handle('storage:check-destination', async (event, { targetMode } = {}) => {
  const mode = targetMode || (storage.isPortableMode() ? 'standard' : 'portable');

  let targetPath;
  if (mode === 'portable') {
    // Prefer the configured path; fall back to the legacy default only as a
    // display hint (NOT as an active root). If null, the UI must prompt.
    targetPath = storage.getConfiguredPortablePath() || storage.getDefaultPortableDataPath();
  } else {
    targetPath = storage.getStandardDataPath();
  }

  const isWritable = storage.isWritable(targetPath);
  let hasExistingData = false;
  const existingFiles = [];

  if (fs.existsSync(targetPath)) {
    try {
      const entries = fs.readdirSync(targetPath);
      if (entries.length > 0) {
        hasExistingData = true;
        for (const e of entries) existingFiles.push(e);
      }
    } catch (_) {}
  }

  return { targetMode: mode, targetPath, isWritable, hasExistingData, existingFiles };
});

ipcMain.handle('storage:migrate', async (event, options = {}) => {
  const targetMode = options.targetMode || (storage.isPortableMode() ? 'standard' : 'portable');

  let targetRoot;
  if (targetMode === 'portable') {
    const configured = storage.getConfiguredPortablePath();
    if (!configured) {
      return {
        success: false,
        error: 'No hay un directorio portable configurado. Selecciona una carpeta antes de migrar.',
        copied: [], skipped: [], errors: ['No hay un directorio portable configurado.']
      };
    }
    targetRoot = configured;
  } else {
    targetRoot = storage.getStandardDataPath();
  }

  const sourceRoot = storage.getStorageRoot();
  if (!sourceRoot) {
    return {
      success: false,
      error: 'No hay un directorio de almacenamiento activo.',
      copied: [], skipped: [], errors: ['No hay un directorio de almacenamiento activo.']
    };
  }

  if (!storage.isWritable(targetRoot)) {
    return {
      success: false,
      error: `El directorio de destino no tiene permisos de escritura: ${targetRoot}`,
      copied: [], skipped: [], errors: [`El directorio de destino no tiene permisos de escritura: ${targetRoot}`]
    };
  }

  const result = storage.migrateStorage(sourceRoot, targetRoot, {
    includeRegenerable: options.includeRegenerable !== false,
    includeLogs: options.includeLogs !== false,
    dryRun: options.dryRun === true
  });

  if (result.success && options.switchModeAfter === true) {
    try {
      storage.setStorageMode(targetMode); // persists mode externally
    } catch (modeErr) {
      console.warn('[main] Error updating storage mode after migration:', modeErr.message);
    }
  }

  return result;
});

ipcMain.handle('storage:set-mode', async (event, { mode } = {}) => {
  if (mode !== 'standard' && mode !== 'portable') {
    return { success: false, error: `Modo de almacenamiento inválido: "${mode}"` };
  }

  if (mode === 'portable') {
    const configured = storage.getConfiguredPortablePath();
    if (!configured) {
      return {
        success: false,
        needsPortablePath: true,
        error: 'El modo Portable requiere seleccionar un directorio de datos. Usa "Elegir carpeta…" para configurarlo.'
      };
    }
    if (!storage.isWritable(configured)) {
      return {
        success: false,
        portablePathUnavailable: true,
        error: `El directorio portable configurado no está disponible o no es escribible: ${configured}`
      };
    }
  }

  try {
    // NEVER write .portable / portable.flag into the application directory.
    // In a packaged AppImage that directory is a read-only mount.
    // The mode is persisted externally by StorageManager.persistStorageMode().
    storage.setStorageMode(mode);
    return {
      success: true,
      mode: storage.getStorageMode(),
      storageRoot: storage.getStorageRoot()
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// System info
ipcMain.handle('system:get-version', () => {
  return app.getVersion();
});

// Complete application reset
ipcMain.handle('system:reset-application', async () => {
  logger.info('APP', 'Iniciando restablecimiento completo de la aplicación LecFal');
  try {
    // 1. Gather all registered library folder paths to protect against accidental overlap
    const registeredFolders = [];
    try {
      const folders = db.getFolders();
      for (const f of folders) {
        if (f && f.path) registeredFolders.push(f.path);
      }
    } catch (_) {}

    // 2. Safely close database connection
    db.close();

    // 3. Reset application storage
    const resetResult = storage.resetApplicationStorage(registeredFolders);

    // 4. Initialize fresh database
    db = new DatabaseManager(storage.getDatabasePath());
    await db.init();

    // 5. Initialize clean scanner instance
    scanner = new LibraryScanner(storage.getThumbnailsPath());

    logger.info('APP', 'Restablecimiento de la aplicación completado con éxito');

    // 6. Relaunch application cleanly if in packaged/electron runtime
    setTimeout(() => {
      try {
        if (app && typeof app.relaunch === 'function') {
          app.relaunch();
          app.exit(0);
        }
      } catch (e) {
        logger.error('APP', `Error al reiniciar tras reset: ${e.message}`);
      }
    }, 500);

    return {
      success: true,
      restarted: true,
      storageRoot: resetResult.storageRoot
    };
  } catch (err) {
    logger.error('APP', `Fallo al restablecer la aplicación: ${err.message}`);
    // If DB was closed but reset failed, try to recover DB connection
    try {
      if (!db.db) {
        db = new DatabaseManager(storage.getDatabasePath());
        await db.init();
      }
    } catch (_) {}
    return {
      success: false,
      error: err.message
    };
  }
});

// Fullscreen controls
ipcMain.handle('system:toggle-fullscreen', async () => {
  if (mainWindow) {
    const isFull = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(isFull);
    return isFull;
  }
  return false;
});

ipcMain.handle('system:is-fullscreen', async () => {
  return mainWindow ? mainWindow.isFullScreen() : false;
});

// Reader IPC
ipcMain.handle('reader:get-chapter', async (event, chapterId) => {
  if (!chapterId) {
    throw new Error('ID de capítulo no especificado');
  }

  // Direct PDF virtual ID or path
  if (typeof chapterId === 'string' && chapterId.startsWith('pdf:')) {
    const pdfPath = chapterId.substring(4);
    if (!fs.existsSync(pdfPath)) {
      logger.warn('READER', `Archivo PDF no encontrado: ${pdfPath}`);
      throw new Error('El archivo del capítulo no existe en el disco.');
    }
    return {
      chapter: {
        id: chapterId,
        seriesId: null,
        seriesTitle: 'Documento PDF',
        title: path.basename(pdfPath, path.extname(pdfPath)),
        fileName: path.basename(pdfPath),
        filePath: pdfPath,
        format: 'pdf',
        pageCount: 0,
        isRead: 0,
        chapterNumber: 1,
        estimatedAspectRatio: 1.414,
        firstPageDimensions: null,
        readingPosition: parseFloat(db.getSetting(`pos:${chapterId}`, '0')) || 0
      },
      pages: [],
      prevChapter: null,
      nextChapter: null
    };
  }

  const chapter = db.getChapterById(chapterId);
  if (!chapter) {
    throw new Error('Capítulo no encontrado en la base de datos');
  }

  if (!fs.existsSync(chapter.file_path)) {
    logger.warn('READER', `Archivo no encontrado: ${chapter.file_path}`);
    throw new Error('El archivo del capítulo no existe en el disco.');
  }
  // Record that the user opened this chapter, so it appears in "Recientemente leído"
  // regardless of reading progress. Does not affect reading_position or is_read.
  db.recordChapterOpened(chapter.id);

  let pages = [];
  let estimatedAspectRatio = 1.414;
  let firstPageDimensions = null;
  if (chapter.format === 'cbz') {
    const manifest = await cbzProvider.getManifest(chapter.file_path);
    pages = manifest.pages;
    if (manifest.estimatedAspectRatio) {
      estimatedAspectRatio = manifest.estimatedAspectRatio;
    }
    firstPageDimensions = manifest.firstPageDimensions || null;
    if (chapter.page_count !== manifest.pageCount) {
      db.updateChapterPageCount(chapter.id, manifest.pageCount);
      chapter.page_count = manifest.pageCount;
    }
  }

  const adjacent = db.getAdjacentChapters(chapter.id);

  logger.info('READER', `Cargando capítulo ID ${chapter.id} "${chapter.title}" (${chapter.format.toUpperCase()})`);

  return {
    chapter: {
      id: chapter.id,
      seriesId: chapter.series_id,
      seriesTitle: chapter.series_title || 'Manga',
      title: chapter.title,
      fileName: chapter.file_name,
      filePath: chapter.file_path,
      format: chapter.format,
      pageCount: chapter.page_count,
      isRead: chapter.is_read,
      chapterNumber: chapter.chapter_number,
      estimatedAspectRatio,
      firstPageDimensions,
      readingPosition: (chapter.reading_position !== undefined && chapter.reading_position !== null) ? chapter.reading_position : 0
    },
    pages,
    prevChapter: adjacent.prev ? { id: adjacent.prev.id, title: adjacent.prev.title } : null,
    nextChapter: adjacent.next ? { id: adjacent.next.id, title: adjacent.next.title } : null
  };
});

ipcMain.handle('reader:set-read', async (event, { chapterId, isRead }) => {
  return db.setChapterRead(chapterId, isRead);
});

ipcMain.handle('reader:get-reading-position', async (event, chapterId) => {
  if (!chapterId) return 0;
  if (typeof chapterId === 'string' && chapterId.startsWith('pdf:')) {
    return parseFloat(db.getSetting(`pos:${chapterId}`, '0')) || 0;
  }
  return db.getChapterReadingPosition(Number(chapterId) || chapterId);
});

ipcMain.handle('reader:set-reading-position', async (event, { chapterId, position }) => {
  if (!chapterId) return 0;
  let pos = Number(position);
  if (isNaN(pos)) pos = 0;
  pos = Math.max(0, Math.min(1.0, pos));

  if (typeof chapterId === 'string' && chapterId.startsWith('pdf:')) {
    if (pos >= 0.90) pos = 1.0;
    db.setSetting(`pos:${chapterId}`, String(pos));
    return pos;
  }
  return db.setChapterReadingPosition(Number(chapterId) || chapterId, pos);
});

// History & Continue Reading IPC
ipcMain.handle('history:get-continue-reading', async (event, limit = 20) => {
  return db.getContinueReading(limit);
});

ipcMain.handle('history:get-reading-history', async (event, limit = 50) => {
  return db.getReadingHistory(limit);
});

ipcMain.handle('history:delete-entry', async (event, chapterId) => {
  return db.deleteReadingHistoryEntry(chapterId);
});

ipcMain.handle('history:reset-series', async (event, seriesId) => {
  return db.resetSeriesReadingHistory(seriesId);
});

ipcMain.handle('history:clear-all', async (event) => {
  return db.clearAllReadingHistory();
});

ipcMain.handle('history:reset-all-progress', async (event) => {
  return db.resetAllReadingHistoryAndProgress();
});
