const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lecfalAPI', {
  // Folder dialog & management
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  getFolders: () => ipcRenderer.invoke('library:get-folders'),
  addFolder: (folderPath) => ipcRenderer.invoke('library:add-folder', folderPath),
  removeFolder: (folderId) => ipcRenderer.invoke('library:remove-folder', folderId),
  
  // Scanning
  scanFolder: (folderId, options) => ipcRenderer.invoke('library:scan-folder', folderId, options),
  scanAll: (options) => ipcRenderer.invoke('library:scan-all', options),
  cancelScan: () => ipcRenderer.invoke('library:cancel-scan'),
  onScanProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('scan:progress', subscription);
    return () => ipcRenderer.removeListener('scan:progress', subscription);
  },
  onSeriesBatch: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('library:series-batch', subscription);
    return () => ipcRenderer.removeListener('library:series-batch', subscription);
  },

  // Series & Manga Management
  getSeries: (filters) => ipcRenderer.invoke('library:get-series', filters),
  getSeriesDetail: (params) => ipcRenderer.invoke('library:get-series-detail', params),
  updateSeriesMetadata: (data) => ipcRenderer.invoke('library:update-series-metadata', data),
  toggleSeriesFavorite: (seriesId) => ipcRenderer.invoke('library:toggle-series-fav', seriesId),
  saveSeriesCover: (data) => ipcRenderer.invoke('library:save-series-cover', data),

  // Chapter interactions
  toggleChapterRead: (chapterId) => ipcRenderer.invoke('library:toggle-chapter-read', chapterId),
  markAllChaptersRead: (data) => ipcRenderer.invoke('library:mark-all-read', data),

  // File interactions
  openFile: (filePath) => ipcRenderer.invoke('library:open-file', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('library:show-in-folder', filePath),

  // Settings
  getSetting: (key, defaultValue) => ipcRenderer.invoke('settings:get', key, defaultValue),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Logs & Diagnostics
  onLog: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('app:log', subscription);
    return () => ipcRenderer.removeListener('app:log', subscription);
  },
  getLogs: () => ipcRenderer.invoke('system:get-logs'),
  openLogFile: () => ipcRenderer.invoke('system:open-log-file'),
  clearLogs: () => ipcRenderer.invoke('system:clear-logs'),

  // System
  getAppVersion: () => ipcRenderer.invoke('system:get-version')
});
