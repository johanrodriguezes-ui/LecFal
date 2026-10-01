const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const DatabaseManager = require('./src/db');
const LibraryScanner = require('./src/scanner');
const logger = require('./src/logger');
const storage = require('./src/storage');

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
  }
]);

async function createWindow() {
  // Initialize storage layer and verify directories safely
  storage.init();

  // Initialize logger with centralized log path
  logger.init(storage.getLogFilePath());
  logger.info('APP', `Iniciando LecFal v${app.getVersion()}`);
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
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  logger.setWebContents(mainWindow.webContents);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', () => {
    if (mainWindow) {
      db.setSetting('window_bounds', mainWindow.getBounds());
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

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

  // Handle custom media protocol for covers
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

      return net.fetch(url.pathToFileURL(targetPath).toString());
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
      db.save();
      logger.info('SCANNER', `Escaneo cancelado en carpeta "${folder.name}".`);
      return { ...report, cancelled: true };
    }

    db.commit();
    db.updateFolderScanTime(folder.id);
    logger.info('SCANNER', `Finalizado: ${report.totalSeries} series evaluadas en "${folder.name}" (${report.newFiles} nuevos, ${report.modifiedFiles} modificados, ${report.skippedFiles} omitidos).`);
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

    logger.info('PDF', `Portada de serie generada y asignada para ID ${seriesId}`);
    return targetCoverPath;
  } catch (err) {
    logger.error('PDF', `Error guardando portada de serie: ${err.message}`);
    return null;
  }
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

// Logging IPC
ipcMain.handle('system:get-logs', async () => {
  return logger.getLogs();
});

ipcMain.handle('system:open-log-file', async () => {
  const logPath = logger.getLogPath();
  if (logPath && fs.existsSync(logPath)) {
    return shell.openPath(logPath);
  }
  return false;
});

ipcMain.handle('system:clear-logs', async () => {
  logger.clearLogs();
  return true;
});

// System info
ipcMain.handle('system:get-version', () => {
  return app.getVersion();
});
