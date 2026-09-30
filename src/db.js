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

      -- Series / Manga model (represents a manga subfolder or standalone title)
      CREATE TABLE IF NOT EXISTS series (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER,
        title TEXT,
        path TEXT UNIQUE,
        cover_path TEXT,
        author TEXT DEFAULT 'Desconocido',
        description TEXT DEFAULT 'Sin descripción',
        tags TEXT DEFAULT '',
        favorite INTEGER DEFAULT 0,
        chapter_count INTEGER DEFAULT 0,
        primary_format TEXT DEFAULT 'cbz',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE CASCADE
      );

      -- Chapters model (individual chapter files inside the series)
      CREATE TABLE IF NOT EXISTS chapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        series_id INTEGER,
        title TEXT,
        file_name TEXT,
        file_path TEXT UNIQUE,
        format TEXT,
        file_size INTEGER,
        mtime_ms INTEGER DEFAULT 0,
        chapter_number REAL DEFAULT 0,
        page_count INTEGER DEFAULT 0,
        is_read INTEGER DEFAULT 0,
        last_read_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_series_title ON series(title);
      CREATE INDEX IF NOT EXISTS idx_series_folder ON series(folder_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_series ON chapters(series_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_number ON chapters(chapter_number);
      CREATE INDEX IF NOT EXISTS idx_chapters_path ON chapters(file_path);
    `);

    // Backward-compatible schema migration
    try {
      this.db.run('ALTER TABLE chapters ADD COLUMN mtime_ms INTEGER DEFAULT 0');
    } catch (e) {
      // column already exists
    }
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

  // ==================== SETTINGS ====================
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

  // ==================== LIBRARY FOLDERS ====================
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
    // Delete chapters belonging to series of this folder
    this.db.run('DELETE FROM chapters WHERE series_id IN (SELECT id FROM series WHERE folder_id = ?)', [folderId]);
    this.db.run('DELETE FROM series WHERE folder_id = ?', [folderId]);
    this.db.run('DELETE FROM library_folders WHERE id = ?', [folderId]);
    this.save();
  }

  updateFolderScanTime(folderId) {
    this.db.run('UPDATE library_folders SET last_scanned = CURRENT_TIMESTAMP WHERE id = ?', [folderId]);
    this.save();
  }

  // ==================== SERIES / MANGAS ====================
  upsertSeries(seriesData) {
    // Check if series already exists by unique folder path
    const checkStmt = this.db.prepare('SELECT id, title, cover_path, author, description, tags FROM series WHERE path = ?');
    checkStmt.bind([seriesData.path]);

    let seriesId = null;
    let existing = null;
    if (checkStmt.step()) {
      existing = checkStmt.getAsObject();
      seriesId = existing.id;
    }
    checkStmt.free();

    if (existing) {
      // PRESERVE user custom title, author, description, or tags if they were edited
      const titleToUse = existing.title || seriesData.title;
      const coverToUse = existing.cover_path || seriesData.cover_path;
      const authorToUse = (existing.author && existing.author !== 'Desconocido') 
        ? existing.author 
        : (seriesData.author && seriesData.author !== 'Desconocido' ? seriesData.author : existing.author || 'Desconocido');
      const descToUse = (existing.description && existing.description !== 'Sin descripción') 
        ? existing.description 
        : (seriesData.description && seriesData.description !== 'Sin descripción' ? seriesData.description : existing.description || 'Sin descripción');
      const tagsToUse = existing.tags || seriesData.tags || '';

      const updateStmt = this.db.prepare(`
        UPDATE series SET
          folder_id = ?,
          title = ?,
          cover_path = ?,
          author = ?,
          description = ?,
          tags = ?,
          chapter_count = ?,
          primary_format = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateStmt.run([
        seriesData.folder_id,
        titleToUse || '',
        coverToUse || null,
        authorToUse || 'Desconocido',
        descToUse || 'Sin descripción',
        tagsToUse || '',
        seriesData.chapter_count || 0,
        seriesData.primary_format || 'cbz',
        seriesId
      ]);
      updateStmt.free();
    } else {
      const insertStmt = this.db.prepare(`
        INSERT INTO series (
          folder_id, title, path, cover_path, author, description, tags, chapter_count, primary_format, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      insertStmt.run([
        seriesData.folder_id,
        seriesData.title || '',
        seriesData.path || '',
        seriesData.cover_path || null,
        seriesData.author || 'Desconocido',
        seriesData.description || 'Sin descripción',
        seriesData.tags || '',
        seriesData.chapter_count || 0,
        seriesData.primary_format || 'cbz'
      ]);
      insertStmt.free();

      // Retrieve new ID
      const getIdStmt = this.db.prepare('SELECT id FROM series WHERE path = ?');
      getIdStmt.bind([seriesData.path]);
      if (getIdStmt.step()) {
        seriesId = getIdStmt.getAsObject().id;
      }
      getIdStmt.free();
    }

    return seriesId;
  }

  upsertChapter(chapterData) {
    const stmt = this.db.prepare(`
      INSERT INTO chapters (
        series_id, title, file_name, file_path, format, file_size, mtime_ms, chapter_number, page_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        title = excluded.title,
        file_size = excluded.file_size,
        mtime_ms = excluded.mtime_ms,
        chapter_number = excluded.chapter_number,
        page_count = CASE WHEN excluded.page_count > 0 THEN excluded.page_count ELSE chapters.page_count END
    `);
    stmt.run([
      chapterData.series_id,
      chapterData.title || '',
      chapterData.file_name || '',
      chapterData.file_path,
      chapterData.format || 'cbz',
      chapterData.file_size || 0,
      Math.round(chapterData.mtime_ms || 0),
      chapterData.chapter_number || 0,
      chapterData.page_count || 0
    ]);
    stmt.free();
  }

  getRegisteredChaptersMap(folderId = null) {
    let sql = 'SELECT id, series_id, file_path, file_size, mtime_ms FROM chapters';
    const params = [];
    if (folderId) {
      sql += ' WHERE series_id IN (SELECT id FROM series WHERE folder_id = ?)';
      params.push(folderId);
    }
    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const map = new Map();
    while (stmt.step()) {
      const row = stmt.getAsObject();
      map.set(row.file_path, row);
    }
    stmt.free();
    return map;
  }

  getRegisteredSeriesMap(folderId = null) {
    let sql = 'SELECT id, folder_id, path, title, cover_path, chapter_count, primary_format FROM series';
    const params = [];
    if (folderId) {
      sql += ' WHERE folder_id = ?';
      params.push(folderId);
    }
    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const map = new Map();
    while (stmt.step()) {
      const row = stmt.getAsObject();
      map.set(row.path, row);
    }
    stmt.free();
    return map;
  }

  getSeriesList({ searchQuery = '', format = 'all', folderId = null, sortBy = 'title_asc', favoriteOnly = false, tag = '' } = {}) {
    let sql = 'SELECT * FROM series WHERE 1=1';
    const params = [];

    if (searchQuery && searchQuery.trim() !== '') {
      sql += ' AND (title LIKE ? OR author LIKE ? OR tags LIKE ?)';
      const query = `%${searchQuery.trim()}%`;
      params.push(query, query, query);
    }

    if (format && format !== 'all') {
      sql += ' AND primary_format = ?';
      params.push(format.toLowerCase());
    }

    if (folderId) {
      sql += ' AND folder_id = ?';
      params.push(folderId);
    }

    if (favoriteOnly) {
      sql += ' AND favorite = 1';
    }

    if (tag && tag.trim() !== '') {
      sql += ' AND tags LIKE ?';
      params.push(`%${tag.trim()}%`);
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
      case 'chapters_desc':
        sql += ' ORDER BY chapter_count DESC';
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

  getSeriesById(seriesId) {
    const stmt = this.db.prepare('SELECT * FROM series WHERE id = ?');
    stmt.bind([seriesId]);
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  }

  updateSeriesMetadata(seriesId, { title, author, description, tags }) {
    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    if (author !== undefined) {
      updates.push('author = ?');
      params.push(author);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(tags);
    }

    if (updates.length === 0) return false;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(seriesId);

    const sql = `UPDATE series SET ${updates.join(', ')} WHERE id = ?`;
    this.db.run(sql, params);
    this.save();
    return true;
  }

  toggleSeriesFavorite(seriesId) {
    this.db.run('UPDATE series SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?', [seriesId]);
    this.save();
    const stmt = this.db.prepare('SELECT favorite FROM series WHERE id = ?');
    stmt.bind([seriesId]);
    let fav = 0;
    if (stmt.step()) {
      fav = stmt.getAsObject().favorite;
    }
    stmt.free();
    return fav;
  }

  // ==================== CHAPTERS ====================
  getChapters(seriesId, { sortOrder = 'asc' } = {}) {
    const orderSql = sortOrder === 'desc' ? 'ORDER BY chapter_number DESC, title DESC' : 'ORDER BY chapter_number ASC, title ASC';
    const stmt = this.db.prepare(`SELECT * FROM chapters WHERE series_id = ? ${orderSql}`);
    stmt.bind([seriesId]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  toggleChapterRead(chapterId) {
    this.db.run(
      'UPDATE chapters SET is_read = CASE WHEN is_read = 1 THEN 0 ELSE 1 END, last_read_at = CURRENT_TIMESTAMP WHERE id = ?',
      [chapterId]
    );
    this.save();
    const stmt = this.db.prepare('SELECT is_read FROM chapters WHERE id = ?');
    stmt.bind([chapterId]);
    let isRead = 0;
    if (stmt.step()) {
      isRead = stmt.getAsObject().is_read;
    }
    stmt.free();
    return isRead;
  }

  markAllChaptersRead(seriesId, isRead = true) {
    const val = isRead ? 1 : 0;
    this.db.run('UPDATE chapters SET is_read = ?, last_read_at = CURRENT_TIMESTAMP WHERE series_id = ?', [val, seriesId]);
    this.save();
    return true;
  }
}

module.exports = DatabaseManager;
