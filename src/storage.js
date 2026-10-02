const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * StorageManager - Centralized single source of truth for all persistent
 * and generated application data paths in LecFal.
 *
 * Current standard mode:
 *   Data Root: ~/.config/lecfal (on Linux, or OS equivalent via Electron app.getPath('userData'))
 *   Database:   ~/.config/lecfal/lecfal.db
 *   Thumbnails: ~/.config/lecfal/thumbnails
 *   Cache:      ~/.config/lecfal/cache
 *   Config:     ~/.config/lecfal/config
 *   Logs:       ~/.config/lecfal/lecfal.log
 *
 * Future portable mode (ready for toggle without refactoring consumers):
 *   Data Root: <application-dir>/data
 *   Database:  <application-dir>/data/database/lecfal.db
 *   Thumbnails:<application-dir>/data/thumbnails
 *   Cache:     <application-dir>/data/cache
 *   Config:    <application-dir>/data/config
 *   Logs:      <application-dir>/data/logs/lecfal.log
 */
class StorageManager {
  constructor() {
    this._dataRoot = null;
    this._isPortable = false;
    this._initialized = false;
  }

  /**
   * Initializes the storage manager and creates required directories safely.
   * Safe to call multiple times; will never delete or overwrite existing data.
   *
   * @param {Object} [options]
   * @param {string} [options.dataRoot] - Explicit data root override (e.g. for testing)
   * @param {boolean} [options.isPortable] - Whether portable mode is active (default: false)
   * @returns {StorageManager}
   */
  init(options = {}) {
    if (options.dataRoot) {
      this._dataRoot = path.resolve(options.dataRoot);
    } else if (!this._dataRoot) {
      this._dataRoot = this._resolveDefaultDataRoot();
    }

    if (typeof options.isPortable === 'boolean') {
      this._isPortable = options.isPortable;
    }

    this._initialized = true;
    this.ensureDirectories();
    return this;
  }

  /**
   * Resolves the default standard user data directory based on the environment.
   * - Checks process.env.LECFAL_DATA_DIR first.
   * - Next queries Electron app.getPath('userData') if available.
   * - Falls back to standard OS directory (~/.config/lecfal on Linux).
   *
   * @private
   * @returns {string}
   */
  _resolveDefaultDataRoot() {
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
      // Electron not available or in worker/test context
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
   * Returns the root directory for persistent application data.
   * Currently: ~/.config/lecfal
   * Future portable: <app-dir>/data
   *
   * @returns {string}
   */
  getDataRoot() {
    if (!this._dataRoot) {
      this._dataRoot = this._resolveDefaultDataRoot();
    }
    return this._dataRoot;
  }

  /**
   * Returns whether portable mode is currently active.
   * Default: false (not yet active).
   *
   * @returns {boolean}
   */
  isPortable() {
    return this._isPortable;
  }

  /**
   * Returns the directory containing the SQLite database.
   * In standard mode: ~/.config/lecfal
   * In portable mode: <app-dir>/data/database
   *
   * @returns {string}
   */
  getDatabaseDir() {
    if (this._isPortable) {
      return path.join(this.getDataRoot(), 'database');
    }
    return this.getDataRoot();
  }

  /**
   * Returns the absolute path to the main SQLite database file (lecfal.db).
   * In standard mode: ~/.config/lecfal/lecfal.db
   * In portable mode: <app-dir>/data/database/lecfal.db
   *
   * @returns {string}
   */
  getDatabasePath() {
    return path.join(this.getDatabaseDir(), 'lecfal.db');
  }

  /**
   * Returns the directory path for generated cover thumbnails.
   * In standard mode: ~/.config/lecfal/thumbnails
   * In portable mode: <app-dir>/data/thumbnails
   *
   * @returns {string}
   */
  getThumbnailsPath() {
    return path.join(this.getDataRoot(), 'thumbnails');
  }

  /**
   * Returns the directory path for generated grid/card thumbnails.
   * In standard mode: ~/.config/lecfal/thumbnails/grid
   * In portable mode: <app-dir>/data/thumbnails/grid
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
   * In standard mode: ~/.config/lecfal/cache
   * In portable mode: <app-dir>/data/cache
   *
   * @returns {string}
   */
  getCachePath() {
    return path.join(this.getDataRoot(), 'cache');
  }

  /**
   * Returns the directory for runtime/user configuration.
   * In standard mode: ~/.config/lecfal/config
   * In portable mode: <app-dir>/data/config
   *
   * @returns {string}
   */
  getConfigPath() {
    return path.join(this.getDataRoot(), 'config');
  }

  /**
   * Returns the directory for application log files.
   * In standard mode: ~/.config/lecfal
   * In portable mode: <app-dir>/data/logs
   *
   * @returns {string}
   */
  getLogsDir() {
    if (this._isPortable) {
      return path.join(this.getDataRoot(), 'logs');
    }
    return this.getDataRoot();
  }

  /**
   * Returns the absolute path to the main application log file.
   * In standard mode: ~/.config/lecfal/lecfal.log
   * In portable mode: <app-dir>/data/logs/lecfal.log
   *
   * @returns {string}
   */
  getLogFilePath() {
    return path.join(this.getLogsDir(), 'lecfal.log');
  }

  /**
   * Safely ensures that all required directories exist.
   * Uses recursive directory creation and never deletes or overwrites existing data.
   */
  ensureDirectories() {
    const requiredDirs = [
      this.getDataRoot(),
      this.getDatabaseDir(),
      this.getThumbnailsPath(),
      this.getGridThumbnailsPath(),
      this.getCachePath(),
      this.getConfigPath(),
      this.getLogsDir()
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
}

// Export singleton instance as default, class as property for testing
const storage = new StorageManager();
storage.StorageManager = StorageManager;

module.exports = storage;
