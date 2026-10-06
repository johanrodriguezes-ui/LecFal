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
  ignoreAuthor: (name) => ipcRenderer.invoke('authors:ignore', name),
  unignoreAuthor: (name) => ipcRenderer.invoke('authors:unignore', name),
  getAllIgnoredAuthors: () => ipcRenderer.invoke('authors:get-all-ignored'),

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

  // Centralized Library Management
  getAllLibraries: () => ipcRenderer.invoke('libraries:get-all'),
  getLibraryById: (id) => ipcRenderer.invoke('libraries:get-by-id', id),
  createLibrary: (nameOrObj, maybeOptions) => {
    const payload = (typeof nameOrObj === 'object' && nameOrObj !== null)
      ? nameOrObj
      : { name: nameOrObj, options: maybeOptions };
    return ipcRenderer.invoke('libraries:create', payload);
  },
  renameLibrary: (idOrObj, maybeName) => {
    const payload = (typeof idOrObj === 'object' && idOrObj !== null) ? idOrObj : { id: idOrObj, name: maybeName };
    return ipcRenderer.invoke('libraries:rename', payload);
  },
  deleteLibrary: (id) => ipcRenderer.invoke('libraries:delete', id),
  assignFolderToLibrary: (folderIdOrObj, maybeLibraryId) => {
    const payload = (typeof folderIdOrObj === 'object' && folderIdOrObj !== null)
      ? folderIdOrObj
      : { folderId: folderIdOrObj, libraryId: maybeLibraryId };
    return ipcRenderer.invoke('libraries:assign-folder', payload);
  },
  getFoldersByLibrary: (libraryId) => ipcRenderer.invoke('libraries:get-folders-by-library', libraryId),

  // File interactions
  openFile: (filePath) => ipcRenderer.invoke('library:open-file', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('library:show-in-folder', filePath),

  // Settings
  getSetting: (key, defaultValue) => ipcRenderer.invoke('settings:get', key, defaultValue),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Thumbnails
  backfillThumbnails: () => ipcRenderer.invoke('thumbnails:backfill'),
  getThumbnailStats: () => ipcRenderer.invoke('thumbnails:get-stats'),


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

  // History & Continue Reading
  getContinueReading: (limit) => ipcRenderer.invoke('history:get-continue-reading', limit),
  getReadingHistory: (limit) => ipcRenderer.invoke('history:get-reading-history', limit),
  deleteReadingHistoryEntry: (chapterId) => ipcRenderer.invoke('history:delete-entry', chapterId),
  resetSeriesReadingHistory: (seriesId) => ipcRenderer.invoke('history:reset-series', seriesId),
  clearAllReadingHistory: () => ipcRenderer.invoke('history:clear-all'),
  resetAllReadingHistoryAndProgress: () => ipcRenderer.invoke('history:reset-all-progress'),

  // System
  getAppVersion: () => ipcRenderer.invoke('system:get-version'),

    // Storage & Portability
  getStorageInfo: () => ipcRenderer.invoke('storage:get-info'),
  checkStorageDestination: (params) => ipcRenderer.invoke('storage:check-destination', params),
  migrateStorageData: (params) => ipcRenderer.invoke('storage:migrate', params),
  setStorageMode: (params) => ipcRenderer.invoke('storage:set-mode', params),
  selectStorageDirectory: () => ipcRenderer.invoke('storage:select-directory'),
  setPortableDataPath: (targetPath) => ipcRenderer.invoke('storage:set-portable-path', { path: targetPath }),

  // Data Management & Removal
  removeFromLibrary: (seriesId) => ipcRenderer.invoke('series:remove-from-library', seriesId),
  deletePermanently: (seriesId) => ipcRenderer.invoke('series:delete-permanently', seriesId),
  resetApplication: () => ipcRenderer.invoke('system:reset-application')
});
