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
  onScanStatus: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('scan:status', subscription);
    return () => ipcRenderer.removeListener('scan:status', subscription);
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

  // Chapter interactions
  toggleChapterRead: (chapterId) => ipcRenderer.invoke('library:toggle-chapter-read', chapterId),
  markAllChaptersRead: (data) => ipcRenderer.invoke('library:mark-all-read', data),

  // Centralized Tag Management
  getAllTags: () => ipcRenderer.invoke('tags:get-all'),
  createTag: (name) => ipcRenderer.invoke('tags:create', name),
  renameTag: (idOrObj, maybeName) => {
    const payload = (typeof idOrObj === 'object' && idOrObj !== null) ? idOrObj : { id: idOrObj, name: maybeName };
    return ipcRenderer.invoke('tags:rename', payload);
  },
  deleteTag: (id) => ipcRenderer.invoke('tags:delete', id),
  setSeriesTags: (data) => ipcRenderer.invoke('tags:set-series-tags', data),

  // Centralized Author Management
  getAllAuthors: () => ipcRenderer.invoke('authors:get-all'),
  createAuthor: (name) => ipcRenderer.invoke('authors:create', name),
  renameAuthor: (idOrObj, maybeName) => {
    const payload = (typeof idOrObj === 'object' && idOrObj !== null) ? idOrObj : { id: idOrObj, name: maybeName };
    return ipcRenderer.invoke('authors:rename', payload);
  },
  deleteAuthor: (id) => ipcRenderer.invoke('authors:delete', id),
  setSeriesAuthors: (data) => ipcRenderer.invoke('authors:set-series-authors', data),

  // Centralized Language Management
  getAllLanguages: () => ipcRenderer.invoke('languages:get-all'),
  createLanguage: (name) => ipcRenderer.invoke('languages:create', name),
  renameLanguage: (idOrObj, maybeName) => {
    const payload = (typeof idOrObj === 'object' && idOrObj !== null) ? idOrObj : { id: idOrObj, name: maybeName };
    return ipcRenderer.invoke('languages:rename', payload);
  },
  deleteLanguage: (id) => ipcRenderer.invoke('languages:delete', id),
  setSeriesLanguages: (data) => ipcRenderer.invoke('languages:set-series-languages', data),

  // Centralized Series / Parody Management
  getAllParodies: () => ipcRenderer.invoke('parodies:get-all'),
  createParody: (name) => ipcRenderer.invoke('parodies:create', name),
  renameParody: (idOrObj, maybeName) => {
    const payload = (typeof idOrObj === 'object' && idOrObj !== null) ? idOrObj : { id: idOrObj, name: maybeName };
    return ipcRenderer.invoke('parodies:rename', payload);
  },
  deleteParody: (id) => ipcRenderer.invoke('parodies:delete', id),
  setSeriesParodies: (data) => ipcRenderer.invoke('parodies:set-series-parodies', data),

  // Centralized Group Management
  getAllGroups: () => ipcRenderer.invoke('groups:get-all'),
  createGroup: (name) => ipcRenderer.invoke('groups:create', name),
  renameGroup: (idOrObj, maybeName) => {
    const payload = (typeof idOrObj === 'object' && idOrObj !== null) ? idOrObj : { id: idOrObj, name: maybeName };
    return ipcRenderer.invoke('groups:rename', payload);
  },
  deleteGroup: (id) => ipcRenderer.invoke('groups:delete', id),
  setSeriesGroups: (data) => ipcRenderer.invoke('groups:set-series-groups', data),

  // File interactions
  openFile: (filePath) => ipcRenderer.invoke('library:open-file', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('library:show-in-folder', filePath),

  // Settings
  getSetting: (key, defaultValue) => ipcRenderer.invoke('settings:get', key, defaultValue),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Thumbnails
  backfillThumbnails: () => ipcRenderer.invoke('thumbnails:backfill'),
  getThumbnailStats: () => ipcRenderer.invoke('thumbnails:get-stats'),

  // Logs & Diagnostics
  onLog: (callback) => {
    const subSingle = (event, data) => callback(data);
    const subBatch = (event, data) => {
      if (Array.isArray(data)) {
        data.forEach(item => callback(item));
      } else {
        callback(data);
      }
    };
    ipcRenderer.on('app:log', subSingle);
    ipcRenderer.on('app:logs', subBatch);
    return () => {
      ipcRenderer.removeListener('app:log', subSingle);
      ipcRenderer.removeListener('app:logs', subBatch);
    };
  },
  getLogs: () => ipcRenderer.invoke('system:get-logs'),
  openLogFile: () => ipcRenderer.invoke('system:open-log-file'),
  clearLogs: () => ipcRenderer.invoke('system:clear-logs'),

  // Reader interactions
  getChapterForReader: (chapterId) => ipcRenderer.invoke('reader:get-chapter', chapterId),
  setChapterRead: (chapterId, isRead) => ipcRenderer.invoke('reader:set-read', { chapterId, isRead }),
  getChapterReadingPosition: (chapterId) => ipcRenderer.invoke('reader:get-reading-position', chapterId),
  setChapterReadingPosition: (chapterId, position) => ipcRenderer.invoke('reader:set-reading-position', { chapterId, position }),
  toggleFullscreen: () => ipcRenderer.invoke('system:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('system:is-fullscreen'),
  onFullscreenChange: (callback) => {
    const sub = (event, isFullscreen) => callback(isFullscreen);
    ipcRenderer.on('window:fullscreen-changed', sub);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', sub);
  },

  // System
  getAppVersion: () => ipcRenderer.invoke('system:get-version')
});
