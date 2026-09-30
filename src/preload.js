const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lecfalAPI', {
  // Folder dialog & management
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  getFolders: () => ipcRenderer.invoke('library:get-folders'),
  addFolder: (folderPath) => ipcRenderer.invoke('library:add-folder', folderPath),
  removeFolder: (folderId) => ipcRenderer.invoke('library:remove-folder', folderId),
  
  // Scanning
  scanFolder: (folderId) => ipcRenderer.invoke('library:scan-folder', folderId),
  scanAll: () => ipcRenderer.invoke('library:scan-all'),
  onScanProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('scan:progress', subscription);
    return () => ipcRenderer.removeListener('scan:progress', subscription);
  },

  // Library Items
  getItems: (filters) => ipcRenderer.invoke('library:get-items', filters),
  toggleFavorite: (itemId) => ipcRenderer.invoke('library:toggle-favorite', itemId),
  savePdfCover: (data) => ipcRenderer.invoke('library:save-pdf-cover', data),

  // File interactions
  openFile: (filePath) => ipcRenderer.invoke('library:open-file', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('library:show-in-folder', filePath),

  // Settings
  getSetting: (key, defaultValue) => ipcRenderer.invoke('settings:get', key, defaultValue),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // System
  getAppVersion: () => ipcRenderer.invoke('system:get-version')
});
