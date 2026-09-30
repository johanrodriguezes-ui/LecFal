const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const DatabaseManager = require('./src/db');
const LibraryScanner = require('./src/scanner');
const logger = require('./src/logger');

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
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'lecfal.db');

  // Initialize logger
  logger.init(userDataPath);
  logger.info('APP', `Iniciando LecFal v${app.getVersion()}`);
  logger.info('APP', `UserData Path: ${userDataPath}`);
  logger.info('APP', `Archivo de base de datos: ${dbPath}`);

  db = new DatabaseManager(dbPath);
  await db.init();
  logger.info('DATABASE', 'Base de datos SQLite inicializada correctamente con Series y Capítulos');

  scanner = new LibraryScanner(userDataPath);

  // Restore saved window size or default
  const savedBounds = db.getSetting('window_bounds', { width: 1240, height: 820 });

  mainWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    minWidth: 850,
    minHeight: 580,
    backgroundColor: '#0c0f17',
    title: 'LecFal - Biblioteca de Mangas y Cómics',
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
  // Handle custom media protocol for covers
  protocol.handle('lecfal-cover', (request) => {
    try {
      let rawPath = request.url.replace(/^lecfal-cover:\/\//, '');
      rawPath = decodeURIComponent(rawPath);
      if (!rawPath.startsWith('/') && process.platform !== 'win32') {
        rawPath = '/' + rawPath;
      }
      return net.fetch(url.pathToFileURL(rawPath).toString());
    } catch (e) {
      logger.error('PROTOCOL', `Error sirviendo lecfal-cover: ${e.message}`);
      return new Response('Not found', { status: 404 });
    }
  });

  // Handle custom media protocol for reading files (PDFs, etc.)
  protocol.handle('lecfal-file', (request) => {
    try {
      let rawPath = request.url.replace(/^lecfal-file:\/\//, '');
      rawPath = decodeURIComponent(rawPath);
      if (!rawPath.startsWith('/') && process.platform !== 'win32') {
        rawPath = '/' + rawPath;
      }
      return net.fetch(url.pathToFileURL(rawPath).toString());
    } catch (e) {
      logger.error('PROTOCOL', `Error sirviendo lecfal-file: ${e.message}`);
      return new Response('Not found', { status: 404 });
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
  return db.getFolders();
});

ipcMain.handle('library:add-folder', async (event, folderPath) => {
  if (!folderPath) return null;
  const folder = db.addFolder(folderPath);
  logger.info('LIBRARY', `Carpeta añadida: ${folder.name} (${folder.path})`);
  return folder;
});

ipcMain.handle('library:remove-folder', async (event, folderId) => {
  db.removeFolder(folderId);
  logger.info('LIBRARY', `Carpeta eliminada ID: ${folderId}`);
  return true;
});

// Helper for scanning a folder and saving Series + Chapters with progressive UI updates
async function scanFolderWithSeries(folder) {
  logger.info('SCANNER', `Iniciando escaneo inteligente de carpeta "${folder.name}" (${folder.path})`);

  let count = 0;

  const onProgress = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan:progress', {
        folderId: folder.id,
        folderName: folder.name,
        file: `${data.seriesTitle} (${data.chapterCount} caps)`,
        current: data.current,
        total: data.total,
        durationMs: data.durationMs
      });
    }
  };

  const onSeries = (seriesData, current, total) => {
    count++;
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

    // Save its chapters
    for (const ch of seriesData.chapters) {
      db.upsertChapter({
        series_id: seriesId,
        title: ch.title,
        file_name: ch.file_name,
        file_path: ch.file_path,
        format: ch.format,
        file_size: ch.file_size,
        chapter_number: ch.chapter_number
      });
    }

    db.save();

    // Stream live update to UI so the series card appears immediately
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('library:series-batch', {
        seriesId,
        title: seriesData.title,
        current,
        total
      });
    }
  };

  const scannedResults = await scanner.scanDirectory(folder.path, { onProgress, onSeries });
  db.updateFolderScanTime(folder.id);
  db.save();

  logger.info('SCANNER', `Finalizado: ${scannedResults.length} series registradas en "${folder.name}".`);
  return scannedResults.length;
}

// Scanning IPC
ipcMain.handle('library:scan-folder', async (event, folderId) => {
  const folders = db.getFolders();
  const folder = folders.find(f => f.id === folderId);
  if (!folder) throw new Error('Carpeta no encontrada');

  const count = await scanFolderWithSeries(folder);
  return { count };
});

ipcMain.handle('library:scan-all', async () => {
  const folders = db.getFolders();
  let totalScanned = 0;

  logger.info('SCANNER', `Escaneando todas las carpetas (${folders.length} registradas)`);
  for (const folder of folders) {
    const count = await scanFolderWithSeries(folder);
    totalScanned += count;
  }

  return { totalScanned, foldersCount: folders.length };
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

ipcMain.handle('library:update-series-metadata', async (event, { seriesId, title, author, description, tags }) => {
  logger.info('METADATA', `Actualizando metadatos para serie ID ${seriesId}: ${title || ''}`);
  return db.updateSeriesMetadata(seriesId, { title, author, description, tags });
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
    const targetCoverPath = path.join(scanner.thumbnailsDir, `${hash}.jpg`);

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
