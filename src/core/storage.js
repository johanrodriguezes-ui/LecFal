const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

/**
 * Explicit classification of LecFal-owned data.
 * - PERSISTENT: SQLite database and application configuration state.
 * - REGENERABLE: Cover and card thumbnails, reader page caches.
 * - OPTIONAL: Session diagnostic logs.
 */
const DATA_CLASSIFICATION = Object.freeze({
  PERSISTENT: [
    'lecfal.db',
    'lecfal.db-journal',
    'lecfal.db-wal',
    'lecfal.db-shm',
    'config'
  ],
  REGENERABLE: [
    'thumbnails',
    'cache'
  ],
  OPTIONAL: [
    'logs',
    'lecfal.log'
  ]
});

/**
 * Safely checks if a target filesystem path is writable without throwing.
 *
 * @param {string} targetPath - Path to inspect
 * @returns {boolean} True if writable
 */
function isPathWritable(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  try {
    const resolved = path.resolve(targetPath);
    if (fs.existsSync(resolved)) {
      fs.accessSync(resolved, fs.constants.W_OK);
      const testFile = path.join(resolved, `.lecfal_test_write_${Date.now()}_${process.pid}`);
      fs.writeFileSync(testFile, '1');
      fs.unlinkSync(testFile);
      return true;
    } else {
      let current = path.dirname(resolved);
      while (!fs.existsSync(current) && current !== path.dirname(current)) {
        current = path.dirname(current);
      }
      if (!fs.existsSync(current)) return false;
      fs.accessSync(current, fs.constants.W_OK);
      const testFile = path.join(current, `.lecfal_test_write_${Date.now()}_${process.pid}`);
      fs.writeFileSync(testFile, '1');
      fs.unlinkSync(testFile);
      return true;
    }
  } catch (_) {
    return false;
  }
}

/**
 * StorageManager - Centralized single source of truth for all persistent,
 * regenerable, and diagnostic application paths in LecFal.
 *
 * Storage Modes:
 * 1. Standard mode (Default):
 *    Root: ~/.config/lecfal (on Linux, or OS equivalent via Electron app.getPath('userData'))
 *    ├── lecfal.db
 *    ├── thumbnails/
 *    │   └── grid/
 *    ├── cache/
 *    ├── logs/
 *    └── config/
 *
 * 2. Portable mode:
 *    Root: <user-selected portable data directory> (persisted in portable.json
 *          inside the STANDARD user-data area).
 *
 * IMPORTANT (AppImage safety):
 * Portable mode NEVER derives its data root from the application directory
 * or the AppImage mount. In a packaged AppImage, <appDir> points into a
 * read-only mount (e.g. /tmp/mount_LecFalEOF) and MUST NOT be written to.
 *
 * The source of truth for Portable mode is the external config file
 * (portable.json). If Portable mode is active but no path is configured,
 * getPortableDataPath() returns null and the caller is responsible for
 * prompting the user to select a directory.
 */
class StorageManager {
  constructor() {
    this._dataRoot = null;
    this._customDataRoot = false;
    this._appDir = null;
    this._mode = 'standard'; // 'standard' | 'portable'
    this._isPortable = false;
    this._initialized = false;
    this._portableDataRoot = null;
    this._portablePathError = null;
  }

  /**
   * Initializes the storage manager.
   *
   * Startup order:
   *   1. Determine whether Portable mode is active (from persisted config,
   *      environment, options, or legacy markers).
   *   2. If Portable mode is active, load the persisted Portable data path
   *      from an independent writable config location.
   *   3. If Portable mode is active and a path exists, use it as _dataRoot.
   *   4. If Portable mode is active but no path exists, set _dataRoot = null
   *      and record an error so the caller can prompt the user.
   *   5. Otherwise use the Standard data root.
   *
   * This method NEVER falls back to <appDir>/data when Portable mode is
   * requested but unconfigured, because <appDir> may be a read-only
   * AppImage mount.
   *
   * @param {Object} [options]
   * @param {string} [options.dataRoot] - Explicit data root override (tests)
   * @param {string} [options.appDir] - Explicit application directory override
   * @param {'standard'|'portable'} [options.mode] - Explicit storage mode
   * @param {boolean} [options.isPortable] - Alias for mode: 'portable'
   * @returns {StorageManager}
   */
  init(options = {}) {
    if (options.appDir) {
      this._appDir = path.resolve(options.appDir);
    }

    // Determine storage mode
    let detectedMode = this._detectStorageMode(options);

    // Explicit dataRoot override (tests / advanced): honor it directly.
    if (options.dataRoot) {
      this._mode = detectedMode;
      this._isPortable = (detectedMode === 'portable');
      this._dataRoot = path.resolve(options.dataRoot);
      this._customDataRoot = true;
      this._initialized = true;
      this.ensureDirectories();
      return this;
    }

    this._customDataRoot = false;

    if (detectedMode === 'portable') {
      const persisted = this._readPersistedPortablePath();
      if (persisted) {
        // Custom portable path previously configured.
        // Do NOT silently fall back to Standard if it is unavailable.
        this._portableDataRoot = persisted;
        if (!this.isWritable(persisted)) {
          this._portablePathError = `El directorio portable configurado no está disponible o no es escribible: ${persisted}`;
        } else {
          this._portablePathError = null;
        }
      } else {
        // Portable requested but no configured path.
        // NEVER fall back to <appDir>/data (may be a read-only AppImage mount).
        this._portableDataRoot = null;
        this._portablePathError = 'No hay un directorio de datos portables configurado. Selecciona una carpeta para usar el modo portable.';
      }
    }

    this._mode = detectedMode;
    this._isPortable = (detectedMode === 'portable');

    if (this._mode === 'portable') {
      // If no usable portable path, leave _dataRoot null.
      this._dataRoot = this._portableDataRoot || null;
    } else {
      this._dataRoot = this._resolveStandardDataRoot();
    }

    this._initialized = true;

    // Only create directories when we actually have a writable root.
    if (this._dataRoot) {
      this.ensureDirectories();
    }
    return this;
  }

  /**
   * Detects the storage mode based on options, environment, persisted config,
   * and (legacy, dev-only) filesystem markers.
   *
   * Priority:
   *   1. Explicit options
   *   2. Environment variables
   *   3. Command-line flag
   *   4. Persisted mode in portable.json  ← source of truth for packaged apps
   *   5. Legacy markers in appDir (development only)
   *   6. Default: standard
   *
   * @private
   * @param {Object} [options]
   * @returns {'standard'|'portable'}
   */
  _detectStorageMode(options = {}) {
    if (options.mode === 'portable' || options.isPortable === true) {
      return 'portable';
    }
    if (options.mode === 'standard' || options.isPortable === false) {
      return 'standard';
    }

    if (
      process.env.LECFAL_PORTABLE === '1' ||
      process.env.LECFAL_PORTABLE === 'true' ||
      process.env.LECFAL_STORAGE_MODE === 'portable'
    ) {
      return 'portable';
    }

    if (Array.isArray(process.argv) && process.argv.includes('--portable')) {
      return 'portable';
    }

    // Source of truth: persisted mode in the external config file.
    const persistedMode = this.getPersistedMode();
    if (persistedMode === 'portable') {
      return 'portable';
    }

    // Legacy markers (development only; NEVER written by packaged builds).
    try {
      const appDir = this.getAppDirectory();
      const portableMarker = path.join(appDir, '.portable');
      const portableFlag = path.join(appDir, 'portable.flag');
      if (fs.existsSync(portableMarker) || fs.existsSync(portableFlag)) {
        return 'portable';
      }
    } catch (_) {}

    return 'standard';
  }

  /**
   * Resolves the application directory (the root of the installed or source LecFal app).
   *
   * NOTE: In a packaged AppImage this path points into a read-only mount and
   * MUST NOT be used as a writable storage location.
   *
   * @returns {string}
   */
  getAppDirectory() {
    if (this._appDir) {
      return this._appDir;
    }

    // 1. Linux AppImage portable directory
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      return path.resolve(process.env.PORTABLE_EXECUTABLE_DIR);
    }

    // 2. Electron's app directory if available
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && typeof app.getAppPath === 'function') {
        if (app.isPackaged && process.execPath) {
          return path.dirname(process.execPath);
        }
        return path.resolve(app.getAppPath());
      }
    } catch (_) {}

    // 3. Fallback based on module location (src/core/storage.js -> project root)
    return path.resolve(__dirname, '../..');
  }

  /**
   * Returns the legacy default portable data path (<app-dir>/data).
   *
   * Kept for backward compatibility and diagnostic purposes only.
   * Do NOT use as an active storage root for packaged applications:
   * the AppImage mount is read-only.
   *
   * @returns {string}
   */
  getDefaultPortableDataPath() {
    return path.join(this.getAppDirectory(), 'data');
  }

  /**
   * Returns the currently effective portable data path.
   *
   * Returns the persisted custom portable path if configured.
   * Returns null if no portable path has been configured yet.
   *
   * IMPORTANT: This method does NOT fall back to <appDir>/data.
   * In a packaged AppImage, <appDir> points into a read-only mount and
   * must never be used as a writable storage location.
   *
   * @returns {string|null}
   */
  getPortableDataPath() {
    if (this._portableDataRoot) return this._portableDataRoot;
    const persisted = this._readPersistedPortablePath();
    if (persisted) return persisted;
    return null;
  }

  /**
   * Returns true if a custom portable data path has been persisted by the user.
   *
   * @returns {boolean}
   */
  hasConfiguredPortablePath() {
    return !!this._readPersistedPortablePath();
  }

  /**
   * Returns the persisted portable path, or null if none has been configured.
   *
   * @returns {string|null}
   */
  getConfiguredPortablePath() {
    return this._readPersistedPortablePath();
  }

  /**
   * Returns any error recorded during init() regarding the portable path.
   *
   * @returns {string|null}
   */
  getPortablePathError() {
    return this._portablePathError;
  }

  /**
   * Persists a user-selected portable data path and updates internal state.
   *
   * This method does NOT copy, migrate, or delete any data. Callers are
   * responsible for using the existing migration mechanism when data
   * needs to be transferred.
   *
   * @param {string} targetPath - Absolute path chosen by the user
   * @returns {{success: boolean, path?: string, error?: string}}
   */
  setPortableDataPath(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      return { success: false, error: 'Ruta portable inválida' };
    }
    const resolved = path.resolve(targetPath);
    if (!this.isWritable(resolved)) {
      return { success: false, error: `El directorio no es escribible: ${resolved}` };
    }
    try {
      this._writePersistedPortablePath(resolved);
    } catch (err) {
      return { success: false, error: `No se pudo guardar la configuración portable: ${err.message}` };
    }
    this._portableDataRoot = resolved;
    this._portablePathError = null;
    if (this._mode === 'portable') {
      this._dataRoot = resolved;
      this.ensureDirectories();
    }
    return { success: true, path: resolved };
  }

  /**
   * Clears the persisted portable path, reverting to the legacy default.
   * Does not touch any user data on disk.
   */
  clearPortableDataPath() {
    try {
      const cfgPath = this.getPortableConfigPath();
      if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
    } catch (_) {}
    this._portableDataRoot = null;
    this._portablePathError = null;
  }

  /**
   * Returns the path to the portable-path configuration file.
   *
   * This file lives in the STANDARD user-data area so it remains available
   * independently of the portable data root. This avoids a bootstrapping
   * circular dependency where the location of the portable root would be
   * stored inside that same root.
   *
   * @returns {string}
   */
  getPortableConfigPath() {
    const standardRoot = this._resolveStandardDataRoot();
    return path.join(standardRoot, 'portable.json');
  }

  /**
   * Reads the persisted portable path from the external config file.
   *
   * @private
   * @returns {string|null}
   */
  _readPersistedPortablePath() {
    try {
      const cfgPath = this.getPortableConfigPath();
      if (!fs.existsSync(cfgPath)) return null;
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.path === 'string' && parsed.path.length > 0) {
        return path.resolve(parsed.path);
      }
    } catch (_) {}
    return null;
  }

  /**
   * Writes the persisted portable path to the external config file.
   * Preserves any existing `mode` field.
   *
   * @private
   * @param {string} targetPath
   */
  _writePersistedPortablePath(targetPath) {
    const cfgPath = this.getPortableConfigPath();
    const dir = path.dirname(cfgPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let existing = {};
    try {
      if (fs.existsSync(cfgPath)) {
        existing = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) || {};
      }
    } catch (_) {}

    existing.mode = 'portable';
    existing.path = path.resolve(targetPath);
    existing.updatedAt = new Date().toISOString();

    fs.writeFileSync(cfgPath, JSON.stringify(existing, null, 2), 'utf8');
  }

  /**
   * Returns the persisted storage mode from the external config file, or null.
   *
   * @returns {'standard'|'portable'|null}
   */
  getPersistedMode() {
    try {
      const cfgPath = this.getPortableConfigPath();
      if (!fs.existsSync(cfgPath)) return null;
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (parsed && parsed.mode === 'portable') return 'portable';
      if (parsed && parsed.mode === 'standard') return 'standard';
    } catch (_) {}
    return null;
  }

  /**
   * Persists the storage mode externally (outside the portable data root),
   * without ever writing to the AppImage mount.
   *
   * @param {'standard'|'portable'} mode
   */
  persistStorageMode(mode) {
    const cfgPath = this.getPortableConfigPath();
    const dir = path.dirname(cfgPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let existing = {};
    try {
      if (fs.existsSync(cfgPath)) {
        existing = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) || {};
      }
    } catch (_) {}

    existing.mode = (mode === 'portable') ? 'portable' : 'standard';
    existing.updatedAt = new Date().toISOString();

    fs.writeFileSync(cfgPath, JSON.stringify(existing, null, 2), 'utf8');
  }

  /**
   * Returns the standard user data directory path.
   *
   * @returns {string}
   */
  getStandardDataPath() {
    return this._resolveStandardDataRoot();
  }

  /**
   * Resolves the standard user data directory based on the OS environment.
   * - Checks process.env.LECFAL_DATA_DIR first.
   * - Next queries Electron app.getPath('userData') if available.
   * - Falls back to standard OS directory (~/.config/lecfal on Linux).
   *
   * @private
   * @returns {string}
   */
  _resolveStandardDataRoot() {
    if (process.env.LECFAL_DATA_DIR) {
      return path.resolve(process.env.LECFAL_DATA_DIR);
    }

    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && typeof app.getPath === 'function') {
        if (app.name === 'Electron') {
          try { app.setName('lecfal'); } catch (_) {}
        }
        return app.getPath('userData');
      }
    } catch (_) {
      // Electron not available or in test context
    }

    if (process.platform === 'win32') {
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'lecfal');
    } else if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'lecfal');
    } else {
      const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      return path.join(configDir, 'lecfal');
    }
  }

  /**
   * Resolves the active default data root depending on storage mode.
   *
   * @private
   * @returns {string|null}
   */
  _resolveDefaultDataRoot() {
    if (this._mode === 'portable') {
      return this.getPortableDataPath();
    }
    return this._resolveStandardDataRoot();
  }

  /**
   * Returns the current storage mode ('standard' or 'portable').
   *
   * @returns {'standard'|'portable'}
   */
  getStorageMode() {
    return this._mode;
  }

  /**
   * Returns whether portable mode is currently active.
   *
   * @returns {boolean}
   */
  isPortableMode() {
    return this._mode === 'portable';
  }

  /**
   * Preserved backward-compatible alias for isPortableMode().
   *
   * @returns {boolean}
   */
  isPortable() {
    return this.isPortableMode();
  }

  /**
   * Updates the storage mode at runtime and recalculates paths.
   *
   * Never writes to the application directory. The mode is persisted in the
   * external config file (portable.json).
   *
   * Throws if switching TO portable without a configured, writable path.
   *
   * @param {'standard'|'portable'} mode
   * @returns {StorageManager}
   */
  setStorageMode(mode) {
    if (mode !== 'standard' && mode !== 'portable') {
      throw new Error(`Invalid storage mode: "${mode}". Expected "standard" or "portable".`);
    }

    if (mode === 'portable') {
      const p = this.getPortableDataPath();
      if (!p) {
        throw new Error('No hay un directorio portable configurado. Selecciona una carpeta antes de activar el modo portable.');
      }
      if (!this.isWritable(p)) {
        throw new Error(`El directorio portable configurado no es escribible: ${p}`);
      }
    }

    this._mode = mode;
    this._isPortable = (mode === 'portable');

    if (!this._customDataRoot) {
      this._dataRoot = (mode === 'portable')
        ? this.getPortableDataPath()
        : this._resolveStandardDataRoot();
    }

    // Persist the mode externally; NEVER write to the AppImage mount.
    this.persistStorageMode(mode);

    if (this._dataRoot) {
      this.ensureDirectories();
    }
    return this;
  }

  /**
   * Returns whether portable mode is available (configured and writable).
   *
   * @returns {boolean}
   */
  isPortableModeAvailable() {
    const p = this.getPortableDataPath();
    if (!p) return false;
    return this.isWritable(p);
  }

  /**
   * Checks whether a specific filesystem path is writable.
   *
   * @param {string} targetPath
   * @returns {boolean}
   */
  isWritable(targetPath) {
    return isPathWritable(targetPath);
  }

  /**
   * Returns the root directory for all application-owned persistent and cache data.
   * Returns null if Portable mode is active but unconfigured.
   *
   * @returns {string|null}
   */
  getStorageRoot() {
    if (!this._dataRoot) {
      this._dataRoot = this._resolveDefaultDataRoot();
    }
    return this._dataRoot;
  }

  /**
   * Alias for getStorageRoot().
   *
   * @returns {string|null}
   */
  getDataPath() {
    return this.getStorageRoot();
  }

  /**
   * Preserved backward-compatible alias for getStorageRoot().
   *
   * @returns {string|null}
   */
  getDataRoot() {
    return this.getStorageRoot();
  }

  /**
   * Returns the directory containing the SQLite database.
   *
   * @returns {string|null}
   */
  getDatabaseDir() {
    return this.getStorageRoot();
  }

  /**
   * Returns the absolute path to the main SQLite database file (lecfal.db).
   * Returns null if there is no active storage root.
   *
   * @returns {string|null}
   */
  getDatabasePath() {
    const root = this.getDatabaseDir();
    if (!root) return null;
    return path.join(root, 'lecfal.db');
  }

  /**
   * Returns the directory path for generated cover thumbnails.
   *
   * @returns {string|null}
   */
  getThumbnailsPath() {
    const root = this.getStorageRoot();
    if (!root) return null;
    return path.join(root, 'thumbnails');
  }

  /**
   * Returns the directory path for generated grid/card thumbnails.
   *
   * @returns {string|null}
   */
  getGridThumbnailsPath() {
    const t = this.getThumbnailsPath();
    if (!t) return null;
    return path.join(t, 'grid');
  }

  /**
   * Returns the full file path for a thumbnail image given its hash.
   *
   * @param {string} hash
   * @returns {string|null}
   */
  getThumbnailFilePath(hash) {
    const t = this.getThumbnailsPath();
    if (!t) return null;
    return path.join(t, `${hash}.jpg`);
  }

  /**
   * Returns a unique temporary file path within the thumbnails directory
   * used during atomic image extraction.
   *
   * @param {string} targetCoverPath
   * @returns {string}
   */
  getTempThumbnailPath(targetCoverPath) {
    return `${targetCoverPath}.tmp.${Date.now()}`;
  }

  /**
   * Returns the directory for temporary and application cache data.
   *
   * @returns {string|null}
   */
  getCachePath() {
    const root = this.getStorageRoot();
    if (!root) return null;
    return path.join(root, 'cache');
  }

  /**
   * Returns the directory dedicated to reader cache assets.
   *
   * @returns {string|null}
   */
  getReaderCachePath() {
    const c = this.getCachePath();
    if (!c) return null;
    return path.join(c, 'reader');
  }

  /**
   * Returns the directory for runtime/user configuration.
   *
   * @returns {string|null}
   */
  getConfigPath() {
    const root = this.getStorageRoot();
    if (!root) return null;
    return path.join(root, 'config');
  }

  /**
   * Returns the directory for application log files.
   *
   * @returns {string|null}
   */
  getLogsPath() {
    const root = this.getStorageRoot();
    if (!root) return null;
    return path.join(root, 'logs');
  }

  /**
   * Preserved backward-compatible alias for getLogsPath().
   *
   * @returns {string|null}
   */
  getLogsDir() {
    return this.getLogsPath();
  }

  /**
   * Returns the absolute path to the main application log file.
   * Falls back to the standard area if no active storage root exists.
   *
   * @returns {string}
   */
  getLogFilePath() {
    const root = this.getStorageRoot();
    if (!root) {
      // Safe fallback: log into the standard area so startup diagnostics
      // remain available even when Portable mode is unconfigured.
      return path.join(this._resolveStandardDataRoot(), 'logs', 'lecfal.log');
    }
    const legacyPath = path.join(root, 'lecfal.log');
    const standardPath = path.join(root, 'logs', 'lecfal.log');
    if (fs.existsSync(legacyPath) && !fs.existsSync(standardPath)) {
      return legacyPath;
    }
    return standardPath;
  }

  /**
   * Safely ensures that all required directories exist.
   * No-op if there is no active storage root.
   */
  ensureDirectories() {
    const root = this.getStorageRoot();
    if (!root) return;

    const requiredDirs = [
      root,
      this.getThumbnailsPath(),
      this.getGridThumbnailsPath(),
      this.getCachePath(),
      this.getReaderCachePath(),
      this.getConfigPath(),
      this.getLogsPath()
    ];

    for (const dir of requiredDirs) {
      if (!dir) continue;
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } catch (err) {
        console.error(`[StorageManager] No se pudo asegurar el directorio "${dir}":`, err.message);
      }
    }
  }

  /**
   * Migrates LecFal application data from sourceRoot to targetRoot safely.
   *
   * @param {string} sourceRoot - Source directory
   * @param {string} targetRoot - Destination directory
   * @param {Object} [options]
   * @returns {Object} Structured migration result
   */
  migrateStorage(sourceRoot, targetRoot, options = {}) {
    return migrateStorage(sourceRoot, targetRoot, options);
  }

  /**
   * Completely resets LecFal application data in the active storage root.
   *
   * If Portable mode is active with a configured path, this operates on that
   * path. Never touches the AppImage directory or comic library folders.
   *
   * @param {string[]} [registeredFolders=[]]
   * @returns {{ success: boolean, storageRoot: string, deletedItems: string[] }}
   */
  resetApplicationStorage(registeredFolders = []) {
    const storageRoot = this.getStorageRoot();
    if (!storageRoot) {
      throw new Error('[StorageManager] Reset abortado: no hay un directorio de almacenamiento activo.');
    }
    const resolvedRoot = path.resolve(storageRoot);

    // 1. Rigorous safety verifications
    if (!resolvedRoot || resolvedRoot === '/' || resolvedRoot === path.resolve(os.homedir())) {
      throw new Error(`[StorageManager] Reset abortado por seguridad: ruta raíz no permitida ("${resolvedRoot}")`);
    }

    const standardRoot = path.resolve(this._resolveStandardDataRoot());
    const configuredPortable = this.getConfiguredPortablePath();
    const portableRoot = configuredPortable ? path.resolve(configuredPortable) : null;
    const isRecognizedRoot =
      resolvedRoot === standardRoot ||
      (portableRoot && resolvedRoot === portableRoot) ||
      this._customDataRoot;

    if (!isRecognizedRoot) {
      throw new Error(`[StorageManager] Reset abortado: la ruta "${resolvedRoot}" no coincide con un directorio de almacenamiento reconocido de LecFal.`);
    }

    for (const folder of registeredFolders) {
      if (!folder) continue;
      const resolvedFolder = path.resolve(folder);
      if (resolvedFolder === resolvedRoot || resolvedRoot.startsWith(resolvedFolder + path.sep)) {
        throw new Error(`[StorageManager] Reset abortado por seguridad: la raíz de almacenamiento colisiona con una carpeta de biblioteca del usuario ("${resolvedFolder}")`);
      }
    }

    const deletedItems = [];

    const emptyDirectoryContents = (dirPath) => {
      if (!dirPath) return;
      const resolved = path.resolve(dirPath);
      if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
        throw new Error(`[StorageManager] Intento de eliminar fuera del storageRoot: "${resolved}"`);
      }
      if (!fs.existsSync(resolved)) return;

      const entries = fs.readdirSync(resolved);
      for (const entry of entries) {
        const fullPath = path.join(resolved, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
          deletedItems.push(fullPath);
        } catch (err) {
          console.warn(`[StorageManager] No se pudo eliminar "${fullPath}" durante el reset:`, err.message);
        }
      }
    };

    // 2. Remove SQLite Database and associated journal/WAL/shm files
    const dbPath = this.getDatabasePath();
    if (dbPath) {
      const dbRelatedFiles = [
        dbPath,
        `${dbPath}-journal`,
        `${dbPath}-wal`,
        `${dbPath}-shm`
      ];
      for (const f of dbRelatedFiles) {
        try {
          if (fs.existsSync(f)) {
            fs.unlinkSync(f);
            deletedItems.push(f);
          }
        } catch (err) {
          console.warn(`[StorageManager] Error eliminando archivo de base de datos "${f}":`, err.message);
        }
      }
    }

    // 3. Clear thumbnails
    emptyDirectoryContents(this.getThumbnailsPath());

    // 4. Clear cache
    emptyDirectoryContents(this.getCachePath());

    // 5. Clear config
    emptyDirectoryContents(this.getConfigPath());

    // 6. Ensure clean directory structure
    this.ensureDirectories();

    return {
      success: true,
      storageRoot: resolvedRoot,
      deletedItems
    };
  }
}

/**
 * Safely migrates LecFal application-owned data from sourceRoot to targetRoot.
 *
 * Requirements enforced:
 * - Source must exist
 * - Target is created as needed
 * - Never overwrites existing target files
 * - Preserves SQLite database, thumbnails, cache, config, logs
 * - Structured result returned
 * - Fully idempotent
 * - Atomic file copy with verification
 * - Never deletes or modifies source data
 * - Failure during copy leaves source 100% untouched and rolls back partial target writes
 *
 * @param {string} sourceRoot - Source directory path
 * @param {string} targetRoot - Target directory path
 * @param {Object} [options]
 * @param {boolean} [options.includeRegenerable=true]
 * @param {boolean} [options.includeLogs=true]
 * @param {boolean} [options.dryRun=false]
 * @returns {Object} Structured migration result
 */
function migrateStorage(sourceRoot, targetRoot, options = {}) {
  const includeRegenerable = options.includeRegenerable !== false;
  const includeLogs = options.includeLogs !== false;
  const dryRun = options.dryRun === true;

  if (!sourceRoot || typeof sourceRoot !== 'string') {
    return {
      success: false,
      error: 'El directorio de origen es requerido',
      copied: [],
      skipped: [],
      errors: ['El directorio de origen es requerido'],
      classification: DATA_CLASSIFICATION
    };
  }

  if (!targetRoot || typeof targetRoot !== 'string') {
    return {
      success: false,
      error: 'El directorio de destino es requerido',
      copied: [],
      skipped: [],
      errors: ['El directorio de destino es requerido'],
      classification: DATA_CLASSIFICATION
    };
  }

  const srcResolved = path.resolve(sourceRoot);
  const dstResolved = path.resolve(targetRoot);

  if (srcResolved === dstResolved) {
    return {
      success: false,
      error: 'El directorio de origen y de destino no pueden ser iguales',
      copied: [],
      skipped: [],
      errors: ['El directorio de origen y de destino no pueden ser iguales'],
      classification: DATA_CLASSIFICATION
    };
  }

  if (!fs.existsSync(srcResolved)) {
    return {
      success: false,
      error: `El directorio de origen no existe: ${srcResolved}`,
      copied: [],
      skipped: [],
      errors: [`El directorio de origen no existe: ${srcResolved}`],
      classification: DATA_CLASSIFICATION
    };
  }

  const copied = [];
  const skipped = [];
  const errors = [];
  const createdFilesDuringRun = [];
  const createdDirsDuringRun = [];

  try {
    if (!dryRun && !fs.existsSync(dstResolved)) {
      fs.mkdirSync(dstResolved, { recursive: true });
      createdDirsDuringRun.push(dstResolved);
    }

    function copySingleFile(srcFilePath, dstFilePath, classification, relPath) {
      if (!fs.existsSync(srcFilePath)) return;

      if (fs.existsSync(dstFilePath)) {
        try {
          const srcStat = fs.statSync(srcFilePath);
          const dstStat = fs.statSync(dstFilePath);
          if (srcStat.size === dstStat.size) {
            const srcHash = crypto.createHash('sha256').update(fs.readFileSync(srcFilePath)).digest('hex');
            const dstHash = crypto.createHash('sha256').update(fs.readFileSync(dstFilePath)).digest('hex');
            if (srcHash === dstHash) {
              skipped.push({
                relativePath: relPath,
                type: classification,
                reason: 'El archivo ya existe con contenido idéntico'
              });
              return;
            }
          }
          skipped.push({
            relativePath: relPath,
            type: classification,
            reason: 'El archivo ya existe en destino; sobreescritura rechazada'
          });
          return;
        } catch (err) {
          skipped.push({
            relativePath: relPath,
            type: classification,
            reason: `Archivo en destino existente pero ilegible: ${err.message}`
          });
          return;
        }
      }

      const srcStat = fs.statSync(srcFilePath);
      if (dryRun) {
        copied.push({
          relativePath: relPath,
          type: classification,
          bytes: srcStat.size
        });
        return;
      }

      const dstDir = path.dirname(dstFilePath);
      if (!fs.existsSync(dstDir)) {
        fs.mkdirSync(dstDir, { recursive: true });
        createdDirsDuringRun.push(dstDir);
      }

      const tmpFilePath = `${dstFilePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      fs.copyFileSync(srcFilePath, tmpFilePath);
      createdFilesDuringRun.push(tmpFilePath);

      const tmpStat = fs.statSync(tmpFilePath);
      if (tmpStat.size !== srcStat.size) {
        try { fs.unlinkSync(tmpFilePath); } catch (_) {}
        throw new Error(`Error de integridad de tamaño para "${relPath}": esperado ${srcStat.size} bytes, obtenido ${tmpStat.size} bytes`);
      }

      fs.renameSync(tmpFilePath, dstFilePath);

      const tmpIdx = createdFilesDuringRun.indexOf(tmpFilePath);
      if (tmpIdx !== -1) {
        createdFilesDuringRun[tmpIdx] = dstFilePath;
      } else {
        createdFilesDuringRun.push(dstFilePath);
      }

      copied.push({
        relativePath: relPath,
        type: classification,
        bytes: srcStat.size
      });
    }

    function copyDirectory(srcDir, dstDir, classification, baseRelDir) {
      if (!fs.existsSync(srcDir)) return;
      const entries = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const entry of entries) {
        const srcEntryPath = path.join(srcDir, entry.name);
        const dstEntryPath = path.join(dstDir, entry.name);
        const relPath = path.join(baseRelDir, entry.name);

        if (entry.isDirectory()) {
          copyDirectory(srcEntryPath, dstEntryPath, classification, relPath);
        } else if (entry.isFile()) {
          if (entry.name.includes('.tmp.')) continue;
          copySingleFile(srcEntryPath, dstEntryPath, classification, relPath);
        }
      }
    }

    // 1. PERSISTENT: SQLite Database files
    const dbFiles = ['lecfal.db', 'lecfal.db-journal', 'lecfal.db-wal', 'lecfal.db-shm'];
    for (const dbName of dbFiles) {
      const srcDb = path.join(srcResolved, dbName);
      if (fs.existsSync(srcDb)) {
        copySingleFile(srcDb, path.join(dstResolved, dbName), 'PERSISTENT', dbName);
      }
    }

    // 2. PERSISTENT: config directory
    const srcConfig = path.join(srcResolved, 'config');
    if (fs.existsSync(srcConfig) && fs.statSync(srcConfig).isDirectory()) {
      copyDirectory(srcConfig, path.join(dstResolved, 'config'), 'PERSISTENT', 'config');
    }

    // 3. REGENERABLE: thumbnails directory
    if (includeRegenerable) {
      const srcThumbnails = path.join(srcResolved, 'thumbnails');
      if (fs.existsSync(srcThumbnails) && fs.statSync(srcThumbnails).isDirectory()) {
        copyDirectory(srcThumbnails, path.join(dstResolved, 'thumbnails'), 'REGENERABLE', 'thumbnails');
      }

      // 4. REGENERABLE: cache directory
      const srcCache = path.join(srcResolved, 'cache');
      if (fs.existsSync(srcCache) && fs.statSync(srcCache).isDirectory()) {
        copyDirectory(srcCache, path.join(dstResolved, 'cache'), 'REGENERABLE', 'cache');
      }
    }

    // 5. OPTIONAL: logs directory and root lecfal.log
    if (includeLogs) {
      const srcLogsDir = path.join(srcResolved, 'logs');
      if (fs.existsSync(srcLogsDir) && fs.statSync(srcLogsDir).isDirectory()) {
        copyDirectory(srcLogsDir, path.join(dstResolved, 'logs'), 'OPTIONAL', 'logs');
      }

      const srcLogFile = path.join(srcResolved, 'lecfal.log');
      if (fs.existsSync(srcLogFile) && fs.statSync(srcLogFile).isFile()) {
        const dstLogPath = path.join(dstResolved, 'logs', 'lecfal.log');
        copySingleFile(srcLogFile, dstLogPath, 'OPTIONAL', 'logs/lecfal.log');
      }
    }

    return {
      success: true,
      source: srcResolved,
      target: dstResolved,
      copied,
      skipped,
      errors: [],
      classification: DATA_CLASSIFICATION
    };
  } catch (err) {
    // Rollback: delete newly created files during this run. SOURCE IS 100% UNTOUCHED.
    for (const f of createdFilesDuringRun) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (_) {}
    }
    return {
      success: false,
      source: srcResolved,
      target: dstResolved,
      copied: [],
      skipped,
      errors: [err.message],
      classification: DATA_CLASSIFICATION
    };
  }
}

// Export singleton instance as default, with class, helper and classification attached
const storage = new StorageManager();
storage.StorageManager = StorageManager;
storage.DATA_CLASSIFICATION = DATA_CLASSIFICATION;
storage.migrateStorage = migrateStorage;
storage.isPathWritable = isPathWritable;

module.exports = storage;