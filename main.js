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
  logger.info('DATABASE', 'Base de datos SQLite inicializada correctamente');

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

  // Save window bounds on resize/move
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

// Helper for scanning a folder with streaming batch database saves
async function scanFolderWithStreaming(folder) {
  logger.info('SCANNER', `Ejecutando escaneo para la carpeta "${folder.name}" (${folder.path})`);

  let batch = [];
  let totalProcessed = 0;

  const flushBatch = () => {
    if (batch.length === 0) return;
    for (const item of batch) {
      db.upsertItem({
        ...item,
        folder_id: folder.id
      });
    }
    db.save();

    // Notify UI that a batch of items is ready to be shown
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('library:items-batch', {
        count: batch.length,
        totalSoFar: totalProcessed
      });
    }
    batch = [];
  };

  const onProgress = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan:progress', {
        folderId: folder.id,
        folderName: folder.name,
        ...data
      });
    }
  };

  const onItem = (item) => {
    totalProcessed++;
    batch.push(item);
    // Flush every 20 items to SQLite so items show up progressively in UI
    if (batch.length >= 20) {
      flushBatch();
    }
  };

  const scannedItems = await scanner.scanDirectory(folder.path, { onProgress, onItem });
  // Flush any remaining items
  flushBatch();

  db.updateFolderScanTime(folder.id);
  db.save();

  logger.info('SCANNER', `Escaneo de "${folder.name}" completado. ${scannedItems.length} elementos guardados.`);
  return scannedItems.length;
}

// Scanning IPC
ipcMain.handle('library:scan-folder', async (event, folderId) => {
  const folders = db.getFolders();
  const folder = folders.find(f => f.id === folderId);
  if (!folder) throw new Error('Carpeta no encontrada');

  const count = await scanFolderWithStreaming(folder);
  return { count };
});

ipcMain.handle('library:scan-all', async () => {
  const folders = db.getFolders();
  let totalScanned = 0;

  logger.info('SCANNER', `Iniciando escaneo de todas las carpetas (${folders.length} configuradas)`);
  for (const folder of folders) {
    const count = await scanFolderWithStreaming(folder);
    totalScanned += count;
  }

  return { totalScanned, foldersCount: folders.length };
});

// Library Items
ipcMain.handle('library:get-items', async (event, filters) => {
  return db.getItems(filters);
});

ipcMain.handle('library:toggle-favorite', async (event, itemId) => {
  return db.toggleFavorite(itemId);
});

// Save PDF cover from renderer
ipcMain.handle('library:save-pdf-cover', async (event, { filePath, dataUrl, pageCount }) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stats = fs.statSync(filePath);
    const hash = scanner.getFileHash(filePath, stats);
    const targetCoverPath = path.join(scanner.thumbnailsDir, `${hash}.jpg`);

    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(targetCoverPath, buffer);

    db.db.run(
      'UPDATE items SET cover_path = ?, page_count = CASE WHEN ? > 0 THEN ? ELSE page_count END WHERE file_path = ?',
      [targetCoverPath, pageCount || 0, pageCount || 0, filePath]
    );
    db.save();

    logger.info('PDF', `Portada de PDF generada y guardada: ${path.basename(filePath)} (${pageCount} pág.)`);
    return targetCoverPath;
  } catch (err) {
    logger.error('PDF', `Error guardando portada de PDF: ${err.message}`);
    return null;
  }
});

// Open file with default system application
ipcMain.handle('library:open-file', async (event, filePath) => {
  if (!fs.existsSync(filePath)) {
    logger.warn('SHELL', `Archivo no encontrado al intentar abrir: ${filePath}`);
    throw new Error('El archivo no existe en el disco.');
  }
  logger.info('SHELL', `Abriendo archivo con lector predeterminado: ${filePath}`);
  return shell.openPath(filePath);
});

// Show file in system file explorer
ipcMain.handle('library:show-in-folder', async (event, filePath) => {
  if (fs.existsSync(filePath)) {
    logger.info('SHELL', `Mostrando en explorador: ${filePath}`);
    shell.showItemInFolder(filePath);
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
