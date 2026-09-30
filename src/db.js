const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

class DatabaseManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.SQL = null;
  }

  async init() {
    this.SQL = await initSqlJs();
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
    } else {
      this.db = new this.SQL.Database();
      this.createSchema();
      this.save();
    }

    this.createSchema(); // ensure all tables exist
    return this;
  }

  createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS library_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE,
        name TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_scanned DATETIME
      );

      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER,
        title TEXT,
        file_name TEXT,
        file_path TEXT UNIQUE,
        format TEXT,
        file_size INTEGER,
        page_count INTEGER DEFAULT 0,
        cover_path TEXT,
        favorite INTEGER DEFAULT 0,
        progress INTEGER DEFAULT 0,
        last_read DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_items_format ON items(format);
      CREATE INDEX IF NOT EXISTS idx_items_title ON items(title);
      CREATE INDEX IF NOT EXISTS idx_items_folder ON items(folder_id);
    `);
  }

  save() {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error('Error saving SQLite database to disk:', err);
    }
  }

  // Settings helpers
  getSetting(key, defaultValue = null) {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind([key]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      try {
        return JSON.parse(row.value);
      } catch (e) {
        return row.value;
      }
    }
    stmt.free();
    return defaultValue;
  }

  setSetting(key, value) {
    const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, valStr]);
    this.save();
  }

  // Folders helpers
  getFolders() {
    const res = [];
    const stmt = this.db.prepare('SELECT * FROM library_folders ORDER BY added_at ASC');
    while (stmt.step()) {
      res.push(stmt.getAsObject());
    }
    stmt.free();
    return res;
  }

  addFolder(folderPath) {
    const folderName = path.basename(folderPath) || folderPath;
    try {
      this.db.run(
        'INSERT OR IGNORE INTO library_folders (path, name, last_scanned) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [folderPath, folderName]
      );
      this.save();
      const stmt = this.db.prepare('SELECT * FROM library_folders WHERE path = ?');
      stmt.bind([folderPath]);
      let folder = null;
      if (stmt.step()) {
        folder = stmt.getAsObject();
      }
      stmt.free();
      return folder;
    } catch (err) {
      console.error('Error adding folder:', err);
      throw err;
    }
  }

  removeFolder(folderId) {
    this.db.run('DELETE FROM items WHERE folder_id = ?', [folderId]);
    this.db.run('DELETE FROM library_folders WHERE id = ?', [folderId]);
    this.save();
  }

  updateFolderScanTime(folderId) {
    this.db.run('UPDATE library_folders SET last_scanned = CURRENT_TIMESTAMP WHERE id = ?', [folderId]);
    this.save();
  }

  // Items helpers
  upsertItem(item) {
    const stmt = this.db.prepare(`
      INSERT INTO items (
        folder_id, title, file_name, file_path, format, file_size, page_count, cover_path, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(file_path) DO UPDATE SET
        title = excluded.title,
        file_size = excluded.file_size,
        cover_path = COALESCE(excluded.cover_path, items.cover_path),
        page_count = CASE WHEN excluded.page_count > 0 THEN excluded.page_count ELSE items.page_count END,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run([
      item.folder_id,
      item.title,
      item.file_name,
      item.file_path,
      item.format,
      item.file_size,
      item.page_count || 0,
      item.cover_path || null
    ]);
    stmt.free();
  }

  getItems({ searchQuery = '', format = 'all', folderId = null, sortBy = 'title_asc', favoriteOnly = false } = {}) {
    let sql = 'SELECT * FROM items WHERE 1=1';
    const params = [];

    if (searchQuery && searchQuery.trim() !== '') {
      sql += ' AND (title LIKE ? OR file_name LIKE ?)';
      params.push(`%${searchQuery.trim()}%`, `%${searchQuery.trim()}%`);
    }

    if (format && format !== 'all') {
      sql += ' AND format = ?';
      params.push(format.toLowerCase());
    }

    if (folderId) {
      sql += ' AND folder_id = ?';
      params.push(folderId);
    }

    if (favoriteOnly) {
      sql += ' AND favorite = 1';
    }

    switch (sortBy) {
      case 'title_desc':
        sql += ' ORDER BY title COLLATE NOCASE DESC';
        break;
      case 'recent_added':
        sql += ' ORDER BY created_at DESC';
        break;
      case 'oldest_added':
        sql += ' ORDER BY created_at ASC';
        break;
      case 'file_size_desc':
        sql += ' ORDER BY file_size DESC';
        break;
      case 'title_asc':
      default:
        sql += ' ORDER BY title COLLATE NOCASE ASC';
        break;
    }

    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  toggleFavorite(itemId) {
    this.db.run('UPDATE items SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?', [itemId]);
    this.save();
    const stmt = this.db.prepare('SELECT favorite FROM items WHERE id = ?');
    stmt.bind([itemId]);
    let fav = 0;
    if (stmt.step()) {
      fav = stmt.getAsObject().favorite;
    }
    stmt.free();
    return fav;
  }

  deleteMissingItems(existingPaths) {
    if (!existingPaths || existingPaths.length === 0) return;
    // Remove items whose files no longer exist on disk
    const allItems = this.getItems();
    const toDelete = allItems.filter(item => !existingPaths.includes(item.file_path));
    for (const item of toDelete) {
      this.db.run('DELETE FROM items WHERE id = ?', [item.id]);
    }
    if (toDelete.length > 0) {
      this.save();
    }
  }
}

module.exports = DatabaseManager;
