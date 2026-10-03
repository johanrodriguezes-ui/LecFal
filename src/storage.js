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
 *    Root: <application-dir>/data
 *    ├── lecfal.db
 *    ├── thumbnails/
 *    │   └── grid/
 *    ├── cache/
 *    ├── logs/
 *    └── config/
 */
class StorageManager {
  constructor() {
    this._dataRoot = null;
    this._customDataRoot = false;
    this._appDir = null;
    this._mode = 'standard'; // 'standard' | 'portable'
    this._isPortable = false;
    this._initialized = false;
  }

  /**
   * Initializes the storage manager and creates required directories safely.
   * Safe to call multiple times; will never delete or overwrite existing user data.
   *
   * @param {Object} [options]
   * @param {string} [options.dataRoot] - Explicit data root override (e.g. for testing)
   * @param {string} [options.appDir] - Explicit application directory override
   * @param {'standard'|'portable'} [options.mode] - Storage mode ('standard' or 'portable')
   * @param {boolean} [options.isPortable] - Whether portable mode is active (alias for mode: 'portable')
   * @returns {StorageManager}
   */
  init(options = {}) {
    if (options.appDir) {
      this._appDir = path.resolve(options.appDir);
    }

    // Determine storage mode
    let detectedMode = this._detectStorageMode(options);

    // Safety guard: do NOT blindly assume the application directory is writable.
    // If portable mode is active without an explicit custom dataRoot, verify write availability.
    if (detectedMode === 'portable' && !options.dataRoot && !this.isPortableModeAvailable()) {
      console.warn(`[StorageManager] Directorio de aplicación no escribible para modo portable ("${this.getPortableDataPath()}"). Se usará modo estándar por seguridad.`);
      detectedMode = 'standard';
    }

    this._mode = detectedMode;
    this._isPortable = (detectedMode === 'portable');

    if (options.dataRoot) {
      this._dataRoot = path.resolve(options.dataRoot);
      this._customDataRoot = true;
    } else {
      this._customDataRoot = false;
      if (this._mode === 'portable') {
        this._dataRoot = this.getPortableDataPath();
      } else {
        this._dataRoot = this._resolveStandardDataRoot();
      }
    }

    this._initialized = true;
    this.ensureDirectories();
    return this;
  }

  /**
   * Detects the storage mode based on options, environment, flags, and filesystem markers.
   * Defaults deterministically to "standard".
   *
   * @private
   * @param {Object} [options]
   * @returns {'standard'|'portable'}
   */
  _detectStorageMode(options = {}) {
    // 1. Explicit option
    if (options.mode === 'portable' || options.isPortable === true) {
      return 'portable';
    }
    if (options.mode === 'standard' || options.isPortable === false) {
      return 'standard';
    }

    // 2. Environment variables
    if (
      process.env.LECFAL_PORTABLE === '1' ||
      process.env.LECFAL_PORTABLE === 'true' ||
      process.env.LECFAL_STORAGE_MODE === 'portable'
    ) {
      return 'portable';
    }

    // 3. Command-line switch
    if (Array.isArray(process.argv) && process.argv.includes('--portable')) {
      return 'portable';
    }

    // 4. Deterministic marker file in application directory
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

    // 3. Fallback based on module location (src/storage.js -> project root)
    return path.resolve(__dirname, '..');
  }

  /**
   * Returns the canonical portable data path: <app-dir>/data
   *
   * @returns {string}
   */
  getPortableDataPath() {
    return path.join(this.getAppDirectory(), 'data');
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
    // 1. Explicit environment variable override
    if (process.env.LECFAL_DATA_DIR) {
      return path.resolve(process.env.LECFAL_DATA_DIR);
    }

    // 2. Electron's app.getPath('userData')
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

    // 3. Fallback based on standard OS conventions
    if (process.platform === 'win32') {
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'lecfal');
    } else if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'lecfal');
    } else {
      // Linux / Unix: $XDG_CONFIG_HOME/lecfal or ~/.config/lecfal
      const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      return path.join(configDir, 'lecfal');
    }
  }

  /**
   * Resolves the active default data root depending on storage mode.
   *
   * @private
   * @returns {string}
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
   * Updates the storage mode at runtime and recalculates paths if not manually overridden.
   *
   * @param {'standard'|'portable'} mode
   * @returns {StorageManager}
   */
  setStorageMode(mode) {
    if (mode !== 'standard' && mode !== 'portable') {
      throw new Error(`Invalid storage mode: "${mode}". Expected "standard" or "portable".`);
    }
    this._mode = mode;
    this._isPortable = (mode === 'portable');
    if (!this._customDataRoot) {
      this._dataRoot = (mode === 'portable') ? this.getPortableDataPath() : this._resolveStandardDataRoot();
    }
    this.ensureDirectories();
    return this;
  }

  /**
   * Returns whether portable mode is available and writable on this system.
   *
   * @returns {boolean}
   */
  isPortableModeAvailable() {
    return this.isWritable(this.getPortableDataPath());
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
   * Standard mode: ~/.config/lecfal (or OS equivalent)
   * Portable mode: <app-dir>/data
   *
   * @returns {string}
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
   * @returns {string}
   */
  getDataPath() {
    return this.getStorageRoot();
  }

  /**
   * Preserved backward-compatible alias for getStorageRoot().
   *
   * @returns {string}
   */
  getDataRoot() {
    return this.getStorageRoot();
  }

  /**
   * Returns the directory containing the SQLite database.
   * Both standard and portable modes locate the database directly in the storage root.
   *
   * @returns {string}
   */
  getDatabaseDir() {
    return this.getStorageRoot();
  }

  /**
   * Returns the absolute path to the main SQLite database file (lecfal.db).
   * Standard mode: ~/.config/lecfal/lecfal.db
   * Portable mode: <app-dir>/data/lecfal.db
   *
   * @returns {string}
   */
  getDatabasePath() {
    return path.join(this.getDatabaseDir(), 'lecfal.db');
  }

  /**
   * Returns the directory path for generated cover thumbnails.
   * Standard mode: ~/.config/lecfal/thumbnails
   * Portable mode: <app-dir>/data/thumbnails
   *
   * @returns {string}
   */
  getThumbnailsPath() {
    return path.join(this.getStorageRoot(), 'thumbnails');
  }

  /**
   * Returns the directory path for generated grid/card thumbnails.
   * Standard mode: ~/.config/lecfal/thumbnails/grid
   * Portable mode: <app-dir>/data/thumbnails/grid
   *
   * @returns {string}
   */
  getGridThumbnailsPath() {
    return path.join(this.getThumbnailsPath(), 'grid');
  }

  /**
   * Returns the full file path for a thumbnail image given its hash.
   *
   * @param {string} hash
   * @returns {string}
   */
  getThumbnailFilePath(hash) {
    return path.join(this.getThumbnailsPath(), `${hash}.jpg`);
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
   * Standard mode: ~/.config/lecfal/cache
   * Portable mode: <app-dir>/data/cache
   *
   * @returns {string}
   */
  getCachePath() {
    return path.join(this.getStorageRoot(), 'cache');
  }

  /**
   * Returns the directory dedicated to reader cache assets.
   * Standard mode: ~/.config/lecfal/cache/reader
   * Portable mode: <app-dir>/data/cache/reader
   *
   * @returns {string}
   */
  getReaderCachePath() {
    return path.join(this.getCachePath(), 'reader');
  }

  /**
   * Returns the directory for runtime/user configuration.
   * Standard mode: ~/.config/lecfal/config
   * Portable mode: <app-dir>/data/config
   *
   * @returns {string}
   */
  getConfigPath() {
    return path.join(this.getStorageRoot(), 'config');
  }

  /**
   * Returns the directory for application log files.
   * Standard mode: ~/.config/lecfal/logs
   * Portable mode: <app-dir>/data/logs
   *
   * @returns {string}
   */
  getLogsPath() {
    return path.join(this.getStorageRoot(), 'logs');
  }

  /**
   * Preserved backward-compatible alias for getLogsPath().
   *
   * @returns {string}
   */
  getLogsDir() {
    return this.getLogsPath();
  }

  /**
   * Returns the absolute path to the main application log file.
   * Standard mode: ~/.config/lecfal/logs/lecfal.log (or legacy ~/.config/lecfal/lecfal.log if already existing)
   * Portable mode: <app-dir>/data/logs/lecfal.log
   *
   * @returns {string}
   */
  getLogFilePath() {
    // If legacy lecfal.log exists directly in root and logs/lecfal.log does not exist yet, preserve it
    const legacyPath = path.join(this.getStorageRoot(), 'lecfal.log');
    const standardPath = path.join(this.getLogsPath(), 'lecfal.log');
    if (fs.existsSync(legacyPath) && !fs.existsSync(standardPath)) {
      return legacyPath;
    }
    return standardPath;
  }

  /**
   * Safely ensures that all required directories exist.
   * Uses recursive directory creation and never deletes or overwrites existing user data.
   */
  ensureDirectories() {
    const requiredDirs = [
      this.getStorageRoot(),
      this.getThumbnailsPath(),
      this.getGridThumbnailsPath(),
      this.getCachePath(),
      this.getReaderCachePath(),
      this.getConfigPath(),
      this.getLogsPath()
    ];

    for (const dir of requiredDirs) {
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
 * @param {boolean} [options.includeRegenerable=true] - Whether to migrate thumbnails and cache
 * @param {boolean} [options.includeLogs=true] - Whether to migrate logs
 * @param {boolean} [options.dryRun=false] - If true, simulates migration without disk writes
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

    /**
     * Copy a single file with byte verification and atomic rename.
     */
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

      // Verify file size integrity
      const tmpStat = fs.statSync(tmpFilePath);
      if (tmpStat.size !== srcStat.size) {
        try { fs.unlinkSync(tmpFilePath); } catch (_) {}
        throw new Error(`Error de integridad de tamaño para "${relPath}": esperado ${srcStat.size} bytes, obtenido ${tmpStat.size} bytes`);
      }

      fs.renameSync(tmpFilePath, dstFilePath);

      // Replace tmp reference with final target
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

    /**
     * Recursively copies known LecFal subdirectories.
     */
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
          // Exclude any stray temporary files
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
