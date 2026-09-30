const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const DatabaseManager = require('./src/db');
const LibraryScanner = require('./src/scanner');

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

  db = new DatabaseManager(dbPath);
  await db.init();

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
      // Handle windows drive letters (e.g., C:/...) or linux /path
      rawPath = decodeURIComponent(rawPath);
      if (!rawPath.startsWith('/') && process.platform !== 'win32') {
        rawPath = '/' + rawPath;
      }
      return net.fetch(url.pathToFileURL(rawPath).toString());
    } catch (e) {
      console.error('Error serving lecfal-cover protocol:', e);
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
      console.error('Error serving lecfal-file protocol:', e);
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==================== IPC HANDLERS ====================

// Select folder dialog
ipcMain.handle('dialog:select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar carpeta de mangas y cómics',
    properties: ['openDirectory'],
    buttonLabel: 'Añadir a la biblioteca'
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
});

// Library folders
ipcMain.handle('library:get-folders', async () => {
  return db.getFolders();
});

ipcMain.handle('library:add-folder', async (event, folderPath) => {
  if (!folderPath) return null;
  const folder = db.addFolder(folderPath);
  return folder;
});

ipcMain.handle('library:remove-folder', async (event, folderId) => {
  db.removeFolder(folderId);
  return true;
});

// Scanning
ipcMain.handle('library:scan-folder', async (event, folderId) => {
  const folders = db.getFolders();
  const folder = folders.find(f => f.id === folderId);
  if (!folder) throw new Error('Carpeta no encontrada');

  const onProgress = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan:progress', {
        folderId,
        folderName: folder.name,
        ...data
      });
    }
  };

  const scannedItems = await scanner.scanDirectory(folder.path, onProgress);
  for (const item of scannedItems) {
    db.upsertItem({
      ...item,
      folder_id: folder.id
    });
  }

  db.updateFolderScanTime(folder.id);
  db.save();

  return { count: scannedItems.length };
});

ipcMain.handle('library:scan-all', async () => {
  const folders = db.getFolders();
  let totalScanned = 0;

  for (const folder of folders) {
    const onProgress = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scan:progress', {
          folderId: folder.id,
          folderName: folder.name,
          ...data
        });
      }
    };

    const scannedItems = await scanner.scanDirectory(folder.path, onProgress);
    for (const item of scannedItems) {
      db.upsertItem({
        ...item,
        folder_id: folder.id
      });
    }

    db.updateFolderScanTime(folder.id);
    totalScanned += scannedItems.length;
  }

  db.save();
  return { totalScanned, foldersCount: folders.length };
});

// Library Items
ipcMain.handle('library:get-items', async (event, filters) => {
  return db.getItems(filters);
});

ipcMain.handle('library:toggle-favorite', async (event, itemId) => {
  return db.toggleFavorite(itemId);
});

// Save PDF cover from renderer (rendered via PDF.js to data URL)
ipcMain.handle('library:save-pdf-cover', async (event, { filePath, dataUrl, pageCount }) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stats = fs.statSync(filePath);
    const hash = scanner.getFileHash(filePath, stats);
    const targetCoverPath = path.join(scanner.thumbnailsDir, `${hash}.jpg`);

    // Data URL format: "data:image/jpeg;base64,..."
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(targetCoverPath, buffer);

    // Update DB
    db.db.run(
      'UPDATE items SET cover_path = ?, page_count = CASE WHEN ? > 0 THEN ? ELSE page_count END WHERE file_path = ?',
      [targetCoverPath, pageCount || 0, pageCount || 0, filePath]
    );
    db.save();

    return targetCoverPath;
  } catch (err) {
    console.error('Error saving PDF cover:', err);
    return null;
  }
});

// Open file with default system application
ipcMain.handle('library:open-file', async (event, filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error('El archivo no existe en el disco.');
  }
  return shell.openPath(filePath);
});

// Show file in system file explorer
ipcMain.handle('library:show-in-folder', async (event, filePath) => {
  if (fs.existsSync(filePath)) {
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

// System info
ipcMain.handle('system:get-version', () => {
  return app.getVersion();
});
