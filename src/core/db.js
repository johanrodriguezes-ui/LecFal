const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const storage = require('./storage');

class DatabaseManager {
  constructor(dbPath) {
    this.dbPath = dbPath || storage.getDatabasePath();
    this.db = null;
    this.SQL = null;
    this.inTransaction = false;
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

    try {
      this.db.run('PRAGMA foreign_keys = ON;');
    } catch (_) {}

    this.createSchema(); // ensure all tables exist
    return this;
  }

  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch (err) {
        // ignore
      }
      this.db = null;
    }
  }

  createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      -- Libraries model (logical groupings of scanned root folders)
      CREATE TABLE IF NOT EXISTS libraries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE COLLATE NOCASE NOT NULL,
        icon TEXT DEFAULT 'book',
        color TEXT DEFAULT '#6366f1',
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_libraries_name ON libraries(name);

      CREATE TABLE IF NOT EXISTS library_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE,
        name TEXT,
        library_id INTEGER DEFAULT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_scanned DATETIME,
        FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE SET NULL
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
        reading_position REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_series_title ON series(title);
      CREATE INDEX IF NOT EXISTS idx_series_folder ON series(folder_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_series ON chapters(series_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_number ON chapters(chapter_number);
      CREATE INDEX IF NOT EXISTS idx_chapters_path ON chapters(file_path);

      -- Centralized tags model (source of truth for tags)
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE COLLATE NOCASE
      );
      CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

      -- Many-to-many relationship between series and tags
      CREATE TABLE IF NOT EXISTS series_tags (
        series_id INTEGER,
        tag_id INTEGER,
        PRIMARY KEY (series_id, tag_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_series_tags_series ON series_tags(series_id);
      CREATE INDEX IF NOT EXISTS idx_series_tags_tag ON series_tags(tag_id);

      -- Centralized authors model (source of truth for authors)
      CREATE TABLE IF NOT EXISTS authors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE COLLATE NOCASE
      );
      CREATE INDEX IF NOT EXISTS idx_authors_name ON authors(name);

      -- Many-to-many relationship between series and authors
      CREATE TABLE IF NOT EXISTS series_authors (
        series_id INTEGER,
        author_id INTEGER,
        PRIMARY KEY (series_id, author_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_series_authors_series ON series_authors(series_id);
      CREATE INDEX IF NOT EXISTS idx_series_authors_author ON series_authors(author_id);

      -- Centralized languages model (source of truth for languages)
      CREATE TABLE IF NOT EXISTS languages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE COLLATE NOCASE
      );
      CREATE INDEX IF NOT EXISTS idx_languages_name ON languages(name);

      -- Many-to-many relationship between series and languages
      CREATE TABLE IF NOT EXISTS series_languages (
        series_id INTEGER,
        language_id INTEGER,
        PRIMARY KEY (series_id, language_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_series_languages_series ON series_languages(series_id);
      CREATE INDEX IF NOT EXISTS idx_series_languages_language ON series_languages(language_id);

      -- Centralized series/parodies model (source of truth for series / parodies)
      CREATE TABLE IF NOT EXISTS series_parodies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE COLLATE NOCASE
      );
      CREATE INDEX IF NOT EXISTS idx_series_parodies_name ON series_parodies(name);

      -- Many-to-many relationship between series and parodies
      CREATE TABLE IF NOT EXISTS series_parodies_rel (
        series_id INTEGER,
        parody_id INTEGER,
        PRIMARY KEY (series_id, parody_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (parody_id) REFERENCES series_parodies(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_series_parodies_rel_series ON series_parodies_rel(series_id);
      CREATE INDEX IF NOT EXISTS idx_series_parodies_rel_parody ON series_parodies_rel(parody_id);

      -- Centralized groups model (source of truth for groups / circles)
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE COLLATE NOCASE
      );
      CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);

      -- Many-to-many relationship between series and groups
      CREATE TABLE IF NOT EXISTS series_groups (
        series_id INTEGER,
        group_id INTEGER,
        PRIMARY KEY (series_id, group_id),
        FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_series_groups_series ON series_groups(series_id);
      CREATE INDEX IF NOT EXISTS idx_series_groups_group ON series_groups(group_id);

      -- Centralized ignored authors model (suppresses false-positive author suggestions)
      CREATE TABLE IF NOT EXISTS ignored_authors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE COLLATE NOCASE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_ignored_authors_name ON ignored_authors(name);

      -- Dedicated reading history model (source of truth for reading activity)
      CREATE TABLE IF NOT EXISTS reading_history (
        chapter_id INTEGER PRIMARY KEY,
        last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_reading_history_time ON reading_history(last_read_at);
    `);

    // Backward-compatible schema migrations
    try {
      this.db.run('ALTER TABLE chapters ADD COLUMN mtime_ms INTEGER DEFAULT 0');
    } catch (e) {}

    try {
      this.db.run('ALTER TABLE chapters ADD COLUMN reading_position REAL DEFAULT 0');
    } catch (e) {}

    try {
      this.db.run('ALTER TABLE series ADD COLUMN detected_author TEXT DEFAULT ""');
    } catch (e) {}

    try {
      this.db.run('ALTER TABLE series ADD COLUMN parody TEXT DEFAULT ""');
    } catch (e) {}

    try {
      this.db.run('ALTER TABLE series ADD COLUMN language TEXT DEFAULT ""');
    } catch (e) {}

    try {
      this.db.run('ALTER TABLE series ADD COLUMN group_name TEXT DEFAULT ""');
    } catch (e) {}

    try {
      this.db.run('CREATE INDEX IF NOT EXISTS idx_series_author ON series(author)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_series_det_author ON series(detected_author)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_series_parody ON series(parody)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_series_language ON series(language)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_series_group_name ON series(group_name)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_ignored_authors_name ON ignored_authors(name)');
    } catch (e) {}

    try {
      this.db.run('ALTER TABLE library_folders ADD COLUMN library_id INTEGER DEFAULT NULL');
    } catch (e) {}

    try {
      this.db.run('CREATE INDEX IF NOT EXISTS idx_folders_library ON library_folders(library_id)');
    } catch (e) {}

    this.seedDefaultLanguages();
    this.seedDefaultParodies();
    this.migrateExistingTags();
    this.migrateReadingHistory();
  }

  migrateReadingHistory() {
    try {
      this.db.run(`
        INSERT INTO reading_history (chapter_id, last_read_at)
        SELECT id, last_read_at
        FROM chapters
        WHERE last_read_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM reading_history
            WHERE reading_history.chapter_id = chapters.id
          )
      `);
    } catch (e) {
      console.warn('Migration reading_history warning:', e);
    }
  }

  save() {
    if (!this.db) return;
    // Never export to disk while an in-memory transaction is open, as sql.js export
    // only serializes committed changes and would wipe uncommitted statements in memory.
    if (this.inTransaction) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error('Error saving SQLite database to disk:', err);
    }
  }

  beginTransaction() {
    if (this.db && !this.inTransaction) {
      try {
        this.db.run('BEGIN TRANSACTION');
        this.inTransaction = true;
      } catch (e) {
        console.error('Error starting transaction:', e);
      }
    }
  }

  commit() {
    if (this.db && this.inTransaction) {
      try {
        this.db.run('COMMIT');
      } catch (e) {
        console.error('Error committing transaction:', e);
      } finally {
        this.inTransaction = false;
        this.save();
      }
    }
  }

  rollback() {
    if (this.db && this.inTransaction) {
      try {
        this.db.run('ROLLBACK');
      } catch (e) {
        console.error('Error rolling back transaction:', e);
      } finally {
        this.inTransaction = false;
      }
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

  // ==================== LIBRARIES ====================
  getLibraries() {
    const res = [];
    const sql = `
      SELECT l.*, COUNT(lf.id) AS folder_count
      FROM libraries l
      LEFT JOIN library_folders lf ON l.id = lf.library_id
      GROUP BY l.id
      ORDER BY l.sort_order ASC, l.name COLLATE NOCASE ASC
    `;
    const stmt = this.db.prepare(sql);
    while (stmt.step()) {
      res.push(stmt.getAsObject());
    }
    stmt.free();
    return res;
  }

  getLibraryById(id) {
    if (!id) return null;
    const sql = `
      SELECT l.*, COUNT(lf.id) AS folder_count
      FROM libraries l
      LEFT JOIN library_folders lf ON l.id = lf.library_id
      WHERE l.id = ?
      GROUP BY l.id
    `;
    const stmt = this.db.prepare(sql);
    stmt.bind([Number(id)]);
    let library = null;
    if (stmt.step()) {
      library = stmt.getAsObject();
    }
    stmt.free();
    return library;
  }

  createLibrary(name, options = {}) {
    const cleanName = (name || '').trim();
    if (!cleanName) {
      throw new Error('El nombre de la biblioteca no puede estar vacío');
    }

    const checkStmt = this.db.prepare('SELECT id, name FROM libraries WHERE name = ? COLLATE NOCASE');
    checkStmt.bind([cleanName]);
    if (checkStmt.step()) {
      checkStmt.free();
      throw new Error(`La biblioteca "${cleanName}" ya existe`);
    }
    checkStmt.free();

    const icon = options.icon || 'book';
    const color = options.color || '#6366f1';
    const sortOrder = typeof options.sort_order === 'number' ? options.sort_order : 0;

    this.db.run(
      'INSERT INTO libraries (name, icon, color, sort_order) VALUES (?, ?, ?, ?)',
      [cleanName, icon, color, sortOrder]
    );

    const idStmt = this.db.prepare('SELECT * FROM libraries WHERE name = ? COLLATE NOCASE');
    idStmt.bind([cleanName]);
    let newLib = null;
    if (idStmt.step()) {
      newLib = idStmt.getAsObject();
      newLib.folder_count = 0;
    }
    idStmt.free();

    this.save();
    return newLib || { id: Date.now(), name: cleanName, icon, color, sort_order: sortOrder, folder_count: 0 };
  }

  renameLibrary(id, newName) {
    const cleanName = (newName || '').trim();
    if (!cleanName) {
      throw new Error('El nombre de la biblioteca no puede estar vacío');
    }

    const checkStmt = this.db.prepare('SELECT id, name FROM libraries WHERE name = ? COLLATE NOCASE AND id != ?');
    checkStmt.bind([cleanName, Number(id)]);
    if (checkStmt.step()) {
      checkStmt.free();
      throw new Error(`Ya existe otra biblioteca con el nombre "${cleanName}"`);
    }
    checkStmt.free();

    const existStmt = this.db.prepare('SELECT id FROM libraries WHERE id = ?');
    existStmt.bind([Number(id)]);
    if (!existStmt.step()) {
      existStmt.free();
      throw new Error('Biblioteca no encontrada');
    }
    existStmt.free();

    this.db.run('UPDATE libraries SET name = ? WHERE id = ?', [cleanName, Number(id)]);
    this.save();
    return { id: Number(id), name: cleanName };
  }

  deleteLibrary(id) {
    const numId = Number(id);
    this.db.run('UPDATE library_folders SET library_id = NULL WHERE library_id = ?', [numId]);
    this.db.run('DELETE FROM libraries WHERE id = ?', [numId]);
    this.save();
    return true;
  }

  assignFolderToLibrary(folderId, libraryId) {
    const numFolderId = Number(folderId);
    const numLibId = (libraryId === null || libraryId === undefined || libraryId === '') ? null : Number(libraryId);

    const fStmt = this.db.prepare('SELECT id FROM library_folders WHERE id = ?');
    fStmt.bind([numFolderId]);
    if (!fStmt.step()) {
      fStmt.free();
      throw new Error('Carpeta no encontrada');
    }
    fStmt.free();

    if (numLibId !== null) {
      const lStmt = this.db.prepare('SELECT id FROM libraries WHERE id = ?');
      lStmt.bind([numLibId]);
      if (!lStmt.step()) {
        lStmt.free();
        throw new Error('Biblioteca no encontrada');
      }
      lStmt.free();
    }

    this.db.run('UPDATE library_folders SET library_id = ? WHERE id = ?', [numLibId, numFolderId]);
    this.save();
    return true;
  }

  getFoldersByLibrary(libraryId) {
    const res = [];
    let stmt;
    if (libraryId === null || libraryId === undefined || libraryId === '') {
      stmt = this.db.prepare('SELECT * FROM library_folders WHERE library_id IS NULL ORDER BY name COLLATE NOCASE ASC');
    } else {
      stmt = this.db.prepare('SELECT * FROM library_folders WHERE library_id = ? ORDER BY name COLLATE NOCASE ASC');
      stmt.bind([Number(libraryId)]);
    }
    while (stmt.step()) {
      res.push(stmt.getAsObject());
    }
    stmt.free();
    return res;
  }

  getFolderById(folderId) {
    if (!folderId) return null;
    const stmt = this.db.prepare('SELECT * FROM library_folders WHERE id = ?');
    stmt.bind([Number(folderId)]);
    let folder = null;
    if (stmt.step()) {
      folder = stmt.getAsObject();
    }
    stmt.free();
    return folder;
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

  addFolder(folderPath, libraryId = null) {
    const folderName = path.basename(folderPath) || folderPath;
    const numLibId = (libraryId === null || libraryId === undefined || libraryId === '') ? null : Number(libraryId);
    try {
      this.db.run(
        'INSERT OR IGNORE INTO library_folders (path, name, library_id, last_scanned) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [folderPath, folderName, numLibId]
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

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  findMatchingGroups(groups, text) {
    return this.findMatchingEntities(groups, text);
  }

  findMatchingAuthors(authors, text) {
    return this.findMatchingEntities(authors, text);
  }

  findMatchingEntities(entities, text) {
    if (!text || !entities || entities.length === 0) return [];
    const sorted = [...entities].sort((a, b) => (b.name || '').length - (a.name || '').length);
    const matched = [];
    const occupiedRanges = [];

    for (const item of sorted) {
      const rawName = (item.name || '').trim();
      if (!rawName) continue;
      const namesToTest = [rawName];
      const unbracketed = rawName.replace(/^[\[\({<](.+)[\]\)}>]$/, '$1').trim();
      if (unbracketed && unbracketed !== rawName) {
        namesToTest.push(unbracketed);
      }

      let foundMatch = false;
      for (const name of namesToTest) {
        const escaped = this.escapeRegex(name);
        const isAlphaStart = /^[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/.test(name);
        const isAlphaEnd = /[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]$/.test(name);

        const prefix = isAlphaStart ? '(?:^|[^a-zA-Z0-9\\u00C0-\\u024F\\u1E00-\\u1EFF])' : '';
        const suffix = isAlphaEnd ? '(?:$|[^a-zA-Z0-9\\u00C0-\\u024F\\u1E00-\\u1EFF])' : '';
        const regex = new RegExp(`${prefix}(${escaped})${suffix}`, 'gi');

        let m;
        while ((m = regex.exec(text)) !== null) {
          const fullMatch = m[0];
          const capture = m[1];
          const captureOffset = fullMatch.indexOf(capture);
          const start = m.index + captureOffset;
          const end = start + capture.length;

          const overlaps = occupiedRanges.some(r => !(end <= r.start || start >= r.end));
          if (!overlaps) {
            occupiedRanges.push({ start, end });
            matched.push(item);
            foundMatch = true;
            break;
          }
        }
        if (foundMatch) break;
      }
    }
    return matched;
  }

  // ==================== SERIES / MANGAS ====================
  upsertSeries(seriesData) {
    // Check if series already exists by unique folder path
    const checkStmt = this.db.prepare('SELECT id, title, cover_path, author, detected_author, group_name, description, tags FROM series WHERE path = ?');
    checkStmt.bind([seriesData.path]);

    let seriesId = null;
    let existing = null;
    if (checkStmt.step()) {
      existing = checkStmt.getAsObject();
      seriesId = existing.id;
    }
    checkStmt.free();

    const subfolderName = seriesData.rawFolderTitle || seriesData.subfolder || (seriesData.path ? path.basename(seriesData.path) : '');

    // Detected authors from database and subfolder name
    const allAuthors = this.getAllAuthors();
    let matchedAuthors = [];
    if (allAuthors.length > 0) {
      matchedAuthors = this.findMatchingAuthors(allAuthors, subfolderName);
      if (matchedAuthors.length === 0 && seriesData.title && seriesData.title !== subfolderName) {
        matchedAuthors = this.findMatchingAuthors(allAuthors, seriesData.title);
      }
    }
    const explicitAuthorIds = Array.isArray(seriesData.authorIds) ? seriesData.authorIds : [];
    if (explicitAuthorIds.length > 0) {
      for (const aid of explicitAuthorIds) {
        if (!matchedAuthors.some(a => a.id === aid)) {
          const aObj = allAuthors.find(a => a.id === aid);
          if (aObj) matchedAuthors.push(aObj);
        }
      }
    }

    // Detected groups from database and subfolder name
    const allGroups = this.getAllGroups();
    let matchedGroups = [];
    if (allGroups.length > 0) {
      matchedGroups = this.findMatchingGroups(allGroups, subfolderName);
      if (matchedGroups.length === 0 && seriesData.title && seriesData.title !== subfolderName) {
        matchedGroups = this.findMatchingGroups(allGroups, seriesData.title);
      }
    }
    const explicitGroupIds = Array.isArray(seriesData.groupIds) ? seriesData.groupIds : [];
    if (explicitGroupIds.length > 0) {
      for (const gid of explicitGroupIds) {
        if (!matchedGroups.some(g => g.id === gid)) {
          const gObj = allGroups.find(g => g.id === gid);
          if (gObj) matchedGroups.push(gObj);
        }
      }
    }

    // Detected author from folder scanner or matched authors
    const rawAuthor = seriesData.author && seriesData.author !== 'Desconocido' ? seriesData.author.trim() : null;
    let detectedAuthor = seriesData.detected_author || (matchedAuthors.length > 0 ? matchedAuthors.map(a => a.name).join(', ') : rawAuthor) || (existing ? existing.detected_author : '') || '';

    // If detectedAuthor happens to match any matchedGroup, suppress it so it is not suggested as an author
    if (matchedGroups.some(g => g.name.toLowerCase() === (detectedAuthor || '').toLowerCase())) {
      detectedAuthor = '';
    }

    const folderIdToUse = seriesData.folder_id || seriesData.folderId || null;
    const countToUse = seriesData.chapter_count || seriesData.chapterCount || 0;
    const formatToUse = seriesData.primary_format || seriesData.primaryFormat || 'cbz';
    const parodyToUse = seriesData.parody || '';
    const langToUse = seriesData.language || '';

    if (existing) {
      // PRESERVE user custom title, description, or tags if they were edited
      const titleToUse = existing.title || seriesData.title;
      let coverToUse = seriesData.cover_path !== undefined ? seriesData.cover_path : existing.cover_path;
      if (coverToUse && !fs.existsSync(coverToUse)) {
        coverToUse = null;
      }
      const descToUse = (existing.description && existing.description !== 'Sin descripción') 
        ? existing.description 
        : (seriesData.description && seriesData.description !== 'Sin descripción' ? seriesData.description : existing.description || 'Sin descripción');
      const tagsToUse = existing.tags || seriesData.tags || '';

      // Determine authoritative author:
      // If series already has configured authors in series_authors, keep them
      const currentAuthors = this.getSeriesAuthors(seriesId);
      let authorToUse = existing.author;
      if (currentAuthors.length > 0) {
        authorToUse = currentAuthors.map(a => a.name).join(', ');
      } else if (matchedAuthors.length > 0) {
        // Auto-link matched authors from database
        this.setSeriesAuthors(seriesId, matchedAuthors.map(a => a.id));
        authorToUse = matchedAuthors.map(a => a.name).join(', ');
      } else if (detectedAuthor) {
        // If detected author exists in catalog, auto-link it
        const matched = this.getAuthorByName(detectedAuthor);
        if (matched) {
          this.setSeriesAuthors(seriesId, [matched.id]);
          authorToUse = matched.name;
        } else {
          authorToUse = existing.author && existing.author !== 'Desconocido' ? existing.author : 'Desconocido';
        }
      }

      // Determine authoritative group (following the author logic):
      // If series already has configured groups in series_groups, keep them
      const currentGroups = this.getSeriesGroups(seriesId);
      let groupNameToUse = existing.group_name || '';
      if (currentGroups.length > 0) {
        groupNameToUse = currentGroups.map(g => g.name).join(', ');
      } else if (matchedGroups.length > 0) {
        // If matched groups exist in database, auto-link them
        this.setSeriesGroups(seriesId, matchedGroups.map(g => g.id));
        groupNameToUse = matchedGroups.map(g => g.name).join(', ');
      } else if (seriesData.group_name || seriesData.group) {
        groupNameToUse = seriesData.group_name || seriesData.group;
      }

      // If existing author was mistakenly set to one of the matched groups in the past, and no authors are configured:
      if (currentAuthors.length === 0 && matchedGroups.some(g => g.name.toLowerCase() === (authorToUse || '').toLowerCase())) {
        if (matchedAuthors.length > 0) {
          this.setSeriesAuthors(seriesId, matchedAuthors.map(a => a.id));
          authorToUse = matchedAuthors.map(a => a.name).join(', ');
        } else if (detectedAuthor && !matchedGroups.some(g => g.name.toLowerCase() === detectedAuthor.toLowerCase())) {
          const matchedAuth = this.getAuthorByName(detectedAuthor);
          if (matchedAuth) {
            this.setSeriesAuthors(seriesId, [matchedAuth.id]);
            authorToUse = matchedAuth.name;
          } else {
            authorToUse = 'Desconocido';
          }
        } else {
          authorToUse = 'Desconocido';
        }
      }

      const updateStmt = this.db.prepare(`
        UPDATE series SET
          folder_id = ?,
          title = ?,
          cover_path = ?,
          author = ?,
          detected_author = ?,
          description = ?,
          tags = ?,
          chapter_count = ?,
          primary_format = ?,
          parody = COALESCE(NULLIF(?, ''), parody),
          language = COALESCE(NULLIF(?, ''), language),
          group_name = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateStmt.run([
        folderIdToUse,
        titleToUse || '',
        coverToUse || null,
        authorToUse || 'Desconocido',
        detectedAuthor || '',
        descToUse || 'Sin descripción',
        tagsToUse || '',
        countToUse,
        formatToUse,
        parodyToUse,
        langToUse,
        groupNameToUse || '',
        seriesId
      ]);
      updateStmt.free();
    } else {
      let coverToInsert = seriesData.cover_path || null;
      if (coverToInsert && !fs.existsSync(coverToInsert)) {
        coverToInsert = null;
      }

      let matchedAuthor = null;
      if (matchedAuthors.length > 0) {
        matchedAuthor = matchedAuthors[0];
      } else if (detectedAuthor) {
        matchedAuthor = this.getAuthorByName(detectedAuthor);
      }
      const authorToInsert = matchedAuthors.length > 0
        ? matchedAuthors.map(a => a.name).join(', ')
        : (matchedAuthor ? matchedAuthor.name : 'Desconocido');

      const groupNameToInsert = matchedGroups.length > 0
        ? matchedGroups.map(g => g.name).join(', ')
        : (seriesData.group_name || seriesData.group || '');

      const insertStmt = this.db.prepare(`
        INSERT INTO series (
          folder_id, title, path, cover_path, author, detected_author, description, tags, chapter_count, primary_format, parody, language, group_name, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      insertStmt.run([
        folderIdToUse,
        seriesData.title || '',
        seriesData.path || '',
        coverToInsert,
        authorToInsert,
        detectedAuthor || '',
        seriesData.description || 'Sin descripción',
        seriesData.tags || '',
        countToUse,
        formatToUse,
        parodyToUse,
        langToUse,
        groupNameToInsert || ''
      ]);
      insertStmt.free();

      // Retrieve new ID
      const getIdStmt = this.db.prepare('SELECT id FROM series WHERE path = ?');
      getIdStmt.bind([seriesData.path]);
      if (getIdStmt.step()) {
        seriesId = getIdStmt.getAsObject().id;
      }
      getIdStmt.free();

      if (matchedAuthors.length > 0 && seriesId) {
        this.setSeriesAuthors(seriesId, matchedAuthors.map(a => a.id));
      } else if (matchedAuthor && seriesId) {
        this.setSeriesAuthors(seriesId, [matchedAuthor.id]);
      }
      if (matchedGroups.length > 0 && seriesId) {
        this.setSeriesGroups(seriesId, matchedGroups.map(g => g.id));
      }
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

  deleteChapter(chapterId) {
    const numId = Number(chapterId);
    if (!numId) return false;
    try {
      this.db.run('DELETE FROM reading_history WHERE chapter_id = ?', [numId]);
      this.db.run('DELETE FROM chapters WHERE id = ?', [numId]);
      if (!this.inTransaction) {
        this.save();
      }
      return true;
    } catch (err) {
      console.error('Error deleting chapter:', err);
      throw err;
    }
  }

  deleteSeries(seriesId) {
    const numId = Number(seriesId);
    if (!numId) return false;
    try {
      this.db.run('DELETE FROM series_tags WHERE series_id = ?', [numId]);
      this.db.run('DELETE FROM series_authors WHERE series_id = ?', [numId]);
      this.db.run('DELETE FROM series_languages WHERE series_id = ?', [numId]);
      this.db.run('DELETE FROM series_parodies_rel WHERE series_id = ?', [numId]);
      this.db.run('DELETE FROM series_groups WHERE series_id = ?', [numId]);
      this.db.run('DELETE FROM reading_history WHERE chapter_id IN (SELECT id FROM chapters WHERE series_id = ?)', [numId]);
      this.db.run('DELETE FROM chapters WHERE series_id = ?', [numId]);
      this.db.run('DELETE FROM series WHERE id = ?', [numId]);
      if (!this.inTransaction) {
        this.save();
      }
      return true;
    } catch (err) {
      console.error('Error deleting series:', err);
      throw err;
    }
  }

  removeFromLibrary(seriesId) {
    const numId = Number(seriesId);
    if (!numId) {
      return { success: false, error: 'ID de serie inválido' };
    }
    const series = this.getSeriesById(numId);
    if (!series) {
      return { success: false, error: 'Manga no encontrado en la base de datos' };
    }
    const deleted = this.deleteSeries(numId);
    return { success: !!deleted };
  }

  deletePermanently(seriesId) {
    const numId = Number(seriesId);
    if (!numId) {
      return { success: false, error: 'ID de serie inválido' };
    }
    const series = this.getSeriesById(numId);
    if (!series) {
      return { success: false, error: 'Manga no encontrado en la base de datos' };
    }

    const chapters = this.getChapters(numId);

    // Identify registered source/library folder
    let rootFolder = null;
    if (series.folder_id) {
      const folderRecord = this.getFolderById(series.folder_id);
      if (folderRecord && folderRecord.path) {
        rootFolder = path.resolve(folderRecord.path);
      }
    }

    if (!rootFolder) {
      const allFolders = this.getFolders();
      for (const f of allFolders) {
        if (!f.path) continue;
        const resolvedFP = path.resolve(f.path);
        if (series.path && (path.resolve(series.path) === resolvedFP || path.resolve(series.path).startsWith(resolvedFP + path.sep))) {
          rootFolder = resolvedFP;
          break;
        }
      }
    }

    if (!rootFolder) {
      return {
        success: false,
        error: 'No se pudo verificar la carpeta raíz de biblioteca registrada para este manga.'
      };
    }

    // Strictly validate all chapter file paths
    const filesToDelete = [];
    const missingFiles = [];
    const skippedSharedFiles = [];

    for (const chapter of chapters) {
      if (!chapter.file_path) continue;
      const resolvedFilePath = path.resolve(chapter.file_path);

      // Security check: Containment within rootFolder
      const relative = path.relative(rootFolder, resolvedFilePath);
      if (relative.startsWith('..') || path.isAbsolute(relative) || relative === '') {
        return {
          success: false,
          error: `Fallo de validación de seguridad: la ruta "${resolvedFilePath}" no pertenece a la carpeta de biblioteca registrada.`
        };
      }

      // Security check: Must not be a directory
      if (fs.existsSync(resolvedFilePath) && fs.statSync(resolvedFilePath).isDirectory()) {
        return {
          success: false,
          error: `Fallo de validación: la ruta "${resolvedFilePath}" es un directorio, no un archivo de capítulo.`
        };
      }

      // Safety check: Does another series reference this exact file?
      const sharedStmt = this.db.prepare('SELECT COUNT(*) AS count FROM chapters WHERE file_path = ? AND series_id != ?');
      sharedStmt.bind([chapter.file_path, numId]);
      let isShared = false;
      if (sharedStmt.step()) {
        if (sharedStmt.getAsObject().count > 0) {
          isShared = true;
        }
      }
      sharedStmt.free();

      if (isShared) {
        skippedSharedFiles.push(resolvedFilePath);
        continue;
      }

      if (fs.existsSync(resolvedFilePath)) {
        filesToDelete.push(resolvedFilePath);
      } else {
        missingFiles.push(resolvedFilePath);
      }
    }

    // Check safe thumbnails to remove (only if uniquely owned and inside thumbnails storage)
    const thumbnailsToDelete = [];
    if (series.cover_path) {
      const resolvedCover = path.resolve(series.cover_path);
      const thumbDir = path.resolve(storage.getThumbnailsPath());
      if (resolvedCover.startsWith(thumbDir + path.sep)) {
        const coverStmt = this.db.prepare('SELECT COUNT(*) AS count FROM series WHERE cover_path = ? AND id != ?');
        coverStmt.bind([series.cover_path, numId]);
        let coverShared = false;
        if (coverStmt.step()) {
          if (coverStmt.getAsObject().count > 0) coverShared = true;
        }
        coverStmt.free();

        if (!coverShared) {
          if (fs.existsSync(resolvedCover)) thumbnailsToDelete.push(resolvedCover);
          const gridThumb = path.join(storage.getGridThumbnailsPath(), path.basename(resolvedCover));
          if (fs.existsSync(gridThumb)) thumbnailsToDelete.push(gridThumb);
        }
      }
    }

    // Step 1: Filesystem deletion of validated chapter files
    const deletedFiles = [];
    const failedFiles = [];

    for (const filePath of filesToDelete) {
      try {
        fs.unlinkSync(filePath);
        deletedFiles.push(filePath);
      } catch (err) {
        failedFiles.push({ path: filePath, error: err.message });
      }
    }

    // If any filesystem deletion failed, abort before mutating the DB
    if (failedFiles.length > 0) {
      return {
        success: false,
        error: `No se pudieron eliminar ${failedFiles.length} archivo(s) del disco.`,
        deletedFiles,
        failedFiles,
        missingFiles
      };
    }

    // Step 2: Clean empty child directories safely
    const cleanedDirs = [];
    const candidateDirs = new Set(deletedFiles.map(f => path.dirname(f)));

    for (const dir of candidateDirs) {
      let currentDir = path.resolve(dir);
      while (currentDir !== rootFolder && currentDir.startsWith(rootFolder + path.sep)) {
        try {
          if (fs.existsSync(currentDir)) {
            const items = fs.readdirSync(currentDir);
            if (items.length === 0) {
              fs.rmdirSync(currentDir);
              cleanedDirs.push(currentDir);
              currentDir = path.dirname(currentDir);
            } else {
              break; // Not empty (contains unrelated files, other series, etc.)
            }
          } else {
            break;
          }
        } catch (err) {
          break;
        }
      }
    }

    // Step 3: Delete uniquely owned thumbnails
    for (const thumbPath of thumbnailsToDelete) {
      try {
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
      } catch (_) {}
    }

    // Step 4: Remove database records
    this.deleteSeries(numId);

    return {
      success: true,
      deletedFiles,
      missingFiles,
      skippedSharedFiles,
      cleanedDirs
    };
  }

  pruneFolder(folderId, activeChapterPaths = new Set(), activeSeriesPaths = new Set()) {
    const numFolderId = Number(folderId);
    if (!numFolderId) return { prunedChapters: 0, prunedSeries: 0 };

    const activeChapters = activeChapterPaths instanceof Set ? activeChapterPaths : new Set(activeChapterPaths || []);
    const activeSeries = activeSeriesPaths instanceof Set ? activeSeriesPaths : new Set(activeSeriesPaths || []);

    let prunedChapters = 0;
    let prunedSeries = 0;

    // 1. Fetch all registered chapters for this folder
    const registeredChapters = this.getRegisteredChaptersMap(numFolderId);
    const affectedSeriesIds = new Set();

    // 2. Identify missing chapters
    const missingChapterIds = [];
    for (const [filePath, regChapter] of registeredChapters) {
      if (!activeChapters.has(filePath)) {
        missingChapterIds.push(regChapter.id);
        affectedSeriesIds.add(regChapter.series_id);
      }
    }

    if (missingChapterIds.length > 0) {
      const delStmt = this.db.prepare('DELETE FROM chapters WHERE id = ?');
      for (const chId of missingChapterIds) {
        delStmt.run([chId]);
        prunedChapters++;
      }
      delStmt.free();
    }

    // 3. Fetch all registered series for this folder
    const registeredSeries = this.getRegisteredSeriesMap(numFolderId);
    const seriesToDelete = new Set();

    // Any series whose folder/file path is no longer on disk
    for (const [seriesPath, regSeries] of registeredSeries) {
      if (!activeSeries.has(seriesPath)) {
        seriesToDelete.add(regSeries.id);
      }
    }

    // Check affected series that are still on disk to see if they now have 0 chapters
    for (const seriesId of affectedSeriesIds) {
      if (seriesToDelete.has(seriesId)) continue;
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM chapters WHERE series_id = ?');
      countStmt.bind([seriesId]);
      let count = 0;
      if (countStmt.step()) {
        count = countStmt.getAsObject().count || 0;
      }
      countStmt.free();

      if (count === 0) {
        seriesToDelete.add(seriesId);
      } else {
        const updateStmt = this.db.prepare('UPDATE series SET chapter_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        updateStmt.run([count, seriesId]);
        updateStmt.free();
      }
    }

    // 4. Delete missing and empty series
    for (const sId of seriesToDelete) {
      this.deleteSeries(sId);
      prunedSeries++;
    }

    if (!this.inTransaction) {
      this.save();
    }

    return { prunedChapters, prunedSeries };
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

  getSeriesList({
    searchQuery = '',
    search = '',
    format = 'all',
    folderId = null,
    libraryId = null,
    sortBy = 'title_asc',
    favoriteOnly = false,
    tag = '',
    tagId = null,
    advTitle = '',
    advAuthor = '',
    advParody = '',
    advLanguage = '',
    advGroup = '',
    authorId = null,
    parodyId = null,
    languageId = null,
    groupId = null
  } = {}) {
    let sql = 'SELECT * FROM series WHERE 1=1';
    const params = [];

    // Basic search across title, author, tags, and group_name
    const activeSearch = (searchQuery || search || '').trim();
    if (activeSearch !== '') {
      sql += ' AND (title LIKE ? OR author LIKE ? OR tags LIKE ? OR group_name LIKE ?)';
      const query = `%${activeSearch}%`;
      params.push(query, query, query, query);
    }

    // Advanced search criteria (AND logic)
    if (advTitle && advTitle.trim() !== '') {
      sql += ' AND title LIKE ?';
      params.push(`%${advTitle.trim()}%`);
    }

    if (authorId) {
      const ids = Array.isArray(authorId) ? authorId : [authorId];
      for (const aid of ids) {
        sql += ' AND id IN (SELECT series_id FROM series_authors WHERE author_id = ?)';
        params.push(aid);
      }
    } else if (advAuthor && advAuthor.trim() !== '') {
      sql += ' AND (id IN (SELECT series_id FROM series_authors sa JOIN authors a ON sa.author_id = a.id WHERE a.name = ? COLLATE NOCASE) OR author LIKE ?)';
      const authorVal = advAuthor.trim();
      params.push(authorVal, `%${authorVal}%`);
    }

    if (groupId) {
      const ids = Array.isArray(groupId) ? groupId : [groupId];
      for (const gid of ids) {
        sql += ' AND id IN (SELECT series_id FROM series_groups WHERE group_id = ?)';
        params.push(gid);
      }
    } else if (advGroup && advGroup.trim() !== '') {
      sql += ' AND (id IN (SELECT series_id FROM series_groups sg JOIN groups g ON sg.group_id = g.id WHERE g.name = ? COLLATE NOCASE) OR group_name LIKE ?)';
      const groupVal = advGroup.trim();
      params.push(groupVal, `%${groupVal}%`);
    }

    if (parodyId) {
      const ids = Array.isArray(parodyId) ? parodyId : [parodyId];
      for (const pid of ids) {
        sql += ' AND id IN (SELECT series_id FROM series_parodies_rel WHERE parody_id = ?)';
        params.push(pid);
      }
    } else if (advParody && advParody.trim() !== '') {
      sql += ' AND (id IN (SELECT series_id FROM series_parodies_rel spr JOIN series_parodies sp ON spr.parody_id = sp.id WHERE sp.name = ? COLLATE NOCASE) OR parody LIKE ? OR title LIKE ?)';
      const parodyVal = advParody.trim();
      params.push(parodyVal, `%${parodyVal}%`, `%${parodyVal}%`);
    }

    if (languageId) {
      if (Array.isArray(languageId)) {
        if (languageId.length > 0) {
          const placeholders = languageId.map(() => '?').join(',');
          sql += ` AND id IN (SELECT series_id FROM series_languages WHERE language_id IN (${placeholders}))`;
          params.push(...languageId);
        }
      } else {
        sql += ' AND id IN (SELECT series_id FROM series_languages WHERE language_id = ?)';
        params.push(languageId);
      }
    } else if (advLanguage && advLanguage.trim() !== '') {
      sql += ' AND (id IN (SELECT series_id FROM series_languages sl JOIN languages l ON sl.language_id = l.id WHERE l.name = ? COLLATE NOCASE) OR language LIKE ?)';
      const langVal = advLanguage.trim();
      params.push(langVal, `%${langVal}%`);
    }

    if (format && format !== 'all') {
      sql += ' AND primary_format = ?';
      params.push(format.toLowerCase());
    }

    if (folderId) {
      sql += ' AND folder_id = ?';
      params.push(folderId);
    }

    if (libraryId && libraryId !== 'all') {
      sql += ' AND folder_id IN (SELECT id FROM library_folders WHERE library_id = ?)';
      params.push(Number(libraryId));
    }

    if (favoriteOnly) {
      sql += ' AND favorite = 1';
    }

    // Tag filtering using relation series_tags or denormalized tags
    if (tagId) {
      const ids = Array.isArray(tagId) ? tagId : [tagId];
      for (const tid of ids) {
        sql += ' AND id IN (SELECT series_id FROM series_tags WHERE tag_id = ?)';
        params.push(tid);
      }
    } else if (tag && tag.trim() !== '') {
      sql += ' AND (id IN (SELECT series_id FROM series_tags st JOIN tags t ON st.tag_id = t.id WHERE t.name = ? COLLATE NOCASE) OR tags LIKE ?)';
      params.push(tag.trim(), `%${tag.trim()}%`);
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
      result.tags_list = this.getSeriesTags(seriesId);
      result.authors_list = this.getSeriesAuthors(seriesId);
      result.languages_list = this.getSeriesLanguages(seriesId);
      result.parodies_list = this.getSeriesParodies(seriesId);
      result.groups_list = this.getSeriesGroups(seriesId);
      result.group_name = result.group_name || '';
      result.group = result.group_name;
      result.is_author_ignored = result.detected_author ? this.isAuthorIgnored(result.detected_author) : false;
    }
    stmt.free();
    return result;
  }

  updateSeriesMetadata(seriesId, { title, author, description, tags, parody, language, group, group_name, authorIds, languageIds, parodyIds, tagIds, groupIds } = {}) {
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
    if (parody !== undefined) {
      updates.push('parody = ?');
      params.push(parody);
    }
    if (language !== undefined) {
      updates.push('language = ?');
      params.push(language);
    }
    const finalGroupName = group_name !== undefined ? group_name : group;
    if (finalGroupName !== undefined) {
      updates.push('group_name = ?');
      params.push(finalGroupName);
    }
    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(tags);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(seriesId);
      const sql = `UPDATE series SET ${updates.join(', ')} WHERE id = ?`;
      this.db.run(sql, params);
    }

    if (authorIds !== undefined && Array.isArray(authorIds)) {
      this.setSeriesAuthors(seriesId, authorIds);
    }

    if (languageIds !== undefined && Array.isArray(languageIds)) {
      this.setSeriesLanguages(seriesId, languageIds);
    }

    if (parodyIds !== undefined && Array.isArray(parodyIds)) {
      this.setSeriesParodies(seriesId, parodyIds);
    }

    if (groupIds !== undefined && Array.isArray(groupIds)) {
      this.setSeriesGroups(seriesId, groupIds);
    }

    if (tagIds !== undefined && Array.isArray(tagIds)) {
      this.setSeriesTags(seriesId, tagIds);
    } else if (tags !== undefined) {
      const tagNames = tags.split(',').map(t => t.trim()).filter(Boolean);
      const computedTagIds = [];
      for (const name of tagNames) {
        let tStmt = this.db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');
        tStmt.bind([name]);
        if (tStmt.step()) {
          computedTagIds.push(tStmt.getAsObject().id);
        } else {
          this.db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [name]);
          let newTStmt = this.db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');
          newTStmt.bind([name]);
          if (newTStmt.step()) {
            computedTagIds.push(newTStmt.getAsObject().id);
          }
          newTStmt.free();
        }
        tStmt.free();
      }
      this.setSeriesTags(seriesId, computedTagIds);
    }

    this.save();
    return true;
  }

  // ==================== CENTRALIZED TAGS ====================
  getAllTags() {
    const sql = `
      SELECT t.id, t.name, COUNT(st.series_id) AS manga_count
      FROM tags t
      LEFT JOIN series_tags st ON t.id = st.tag_id
      GROUP BY t.id, t.name
      ORDER BY t.name COLLATE NOCASE ASC
    `;
    const stmt = this.db.prepare(sql);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  createTag(name) {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('El nombre del tag no puede estar vacío');

    const checkStmt = this.db.prepare('SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE');
    checkStmt.bind([cleanName]);
    if (checkStmt.step()) {
      checkStmt.free();
      throw new Error(`El tag "${cleanName}" ya existe`);
    }
    checkStmt.free();

    this.db.run('INSERT INTO tags (name) VALUES (?)', [cleanName]);

    const idStmt = this.db.prepare('SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE');
    idStmt.bind([cleanName]);
    let newTag = null;
    if (idStmt.step()) {
      newTag = idStmt.getAsObject();
      newTag.manga_count = 0;
    }
    idStmt.free();

    this.save();
    return newTag || { id: Date.now(), name: cleanName, manga_count: 0 };
  }

  renameTag(id, newName) {
    const cleanName = (newName || '').trim();
    if (!cleanName) throw new Error('El nombre del tag no puede estar vacío');

    const checkStmt = this.db.prepare('SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE AND id != ?');
    checkStmt.bind([cleanName, id]);
    if (checkStmt.step()) {
      checkStmt.free();
      throw new Error(`Ya existe otro tag con el nombre "${cleanName}"`);
    }
    checkStmt.free();

    this.db.run('UPDATE tags SET name = ? WHERE id = ?', [cleanName, id]);
    this.syncSeriesTagsForTag(id);
    this.save();
    return { id, name: cleanName };
  }

  deleteTag(id) {
    const stmt = this.db.prepare('SELECT series_id FROM series_tags WHERE tag_id = ?');
    stmt.bind([id]);
    const seriesIds = [];
    while (stmt.step()) {
      seriesIds.push(stmt.getAsObject().series_id);
    }
    stmt.free();

    this.db.run('DELETE FROM series_tags WHERE tag_id = ?', [id]);
    this.db.run('DELETE FROM tags WHERE id = ?', [id]);

    for (const sId of seriesIds) {
      this.refreshSeriesTagsString(sId);
    }
    this.save();
    return true;
  }

  getSeriesTags(seriesId) {
    const sql = `
      SELECT t.id, t.name
      FROM tags t
      JOIN series_tags st ON t.id = st.tag_id
      WHERE st.series_id = ?
      ORDER BY t.name COLLATE NOCASE ASC
    `;
    const stmt = this.db.prepare(sql);
    stmt.bind([seriesId]);
    const tags = [];
    while (stmt.step()) {
      tags.push(stmt.getAsObject());
    }
    stmt.free();
    return tags;
  }

  setSeriesTags(seriesId, tagIds = []) {
    this.db.run('DELETE FROM series_tags WHERE series_id = ?', [seriesId]);
    for (const tid of tagIds) {
      this.db.run('INSERT OR IGNORE INTO series_tags (series_id, tag_id) VALUES (?, ?)', [seriesId, tid]);
    }
    this.refreshSeriesTagsString(seriesId);
    this.save();
    return this.getSeriesTags(seriesId);
  }

  refreshSeriesTagsString(seriesId) {
    const tags = this.getSeriesTags(seriesId);
    const tagStr = tags.map(t => t.name).join(', ');
    this.db.run('UPDATE series SET tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [tagStr, seriesId]);
  }

  syncSeriesTagsForTag(tagId) {
    const stmt = this.db.prepare('SELECT series_id FROM series_tags WHERE tag_id = ?');
    stmt.bind([tagId]);
    const seriesIds = [];
    while (stmt.step()) {
      seriesIds.push(stmt.getAsObject().series_id);
    }
    stmt.free();
    for (const sId of seriesIds) {
      this.refreshSeriesTagsString(sId);
    }
  }

  migrateExistingTags() {
    try {
      const stmt = this.db.prepare('SELECT id, tags FROM series WHERE tags IS NOT NULL AND tags != ""');
      const seriesList = [];
      while (stmt.step()) {
        seriesList.push(stmt.getAsObject());
      }
      stmt.free();

      for (const s of seriesList) {
        const tagNames = s.tags.split(',').map(t => t.trim()).filter(Boolean);
        for (const name of tagNames) {
          this.db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [name]);
          const tagStmt = this.db.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE');
          tagStmt.bind([name]);
          if (tagStmt.step()) {
            const tagId = tagStmt.getAsObject().id;
            this.db.run('INSERT OR IGNORE INTO series_tags (series_id, tag_id) VALUES (?, ?)', [s.id, tagId]);
          }
          tagStmt.free();
        }
      }
    } catch (err) {
      console.error('Error during tag migration:', err);
    }
  }

  seedDefaultLanguages() {
    const defaults = ['Español', 'Inglés', 'Japonés', 'Portugués', 'Francés'];
    for (const lang of defaults) {
      try {
        this.db.run('INSERT OR IGNORE INTO languages (name) VALUES (?)', [lang]);
      } catch (_) {}
    }
  }

  seedDefaultParodies() {
    const defaults = ['Original'];
    for (const parody of defaults) {
      try {
        this.db.run('INSERT OR IGNORE INTO series_parodies (name) VALUES (?)', [parody]);
      } catch (_) {}
    }
  }

  // ==================== CENTRALIZED AUTHORS ====================
  getAllAuthors() {
    const sql = `
      SELECT a.id, a.name, COUNT(sa.series_id) AS manga_count
      FROM authors a
      LEFT JOIN series_authors sa ON a.id = sa.author_id
      GROUP BY a.id, a.name
      ORDER BY a.name COLLATE NOCASE ASC
    `;
    const stmt = this.db.prepare(sql);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  getAuthorByName(name) {
    if (!name) return null;
    const stmt = this.db.prepare('SELECT id, name FROM authors WHERE name = ? COLLATE NOCASE');
    stmt.bind([name.trim()]);
    let author = null;
    if (stmt.step()) {
      author = stmt.getAsObject();
    }
    stmt.free();
    return author;
  }

  createAuthor(name) {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('El nombre del autor no puede estar vacío');

    const checkStmt = this.db.prepare('SELECT id, name FROM authors WHERE name = ? COLLATE NOCASE');
    checkStmt.bind([cleanName]);
    if (checkStmt.step()) {
      checkStmt.free();
      throw new Error(`El autor "${cleanName}" ya existe`);
    }
    checkStmt.free();

    // If this name was previously ignored, unignore it now
    this.db.run('DELETE FROM ignored_authors WHERE name = ? COLLATE NOCASE', [cleanName]);

    this.db.run('INSERT INTO authors (name) VALUES (?)', [cleanName]);

    const idStmt = this.db.prepare('SELECT id, name FROM authors WHERE name = ? COLLATE NOCASE');
    idStmt.bind([cleanName]);
    let newAuthor = null;
    if (idStmt.step()) {
      newAuthor = idStmt.getAsObject();
    }
    idStmt.free();

    if (newAuthor) {
      this.linkDetectedAuthorToSeries(newAuthor.id, newAuthor.name);
      const countStmt = this.db.prepare('SELECT COUNT(*) AS c FROM series_authors WHERE author_id = ?');
      countStmt.bind([newAuthor.id]);
      if (countStmt.step()) {
        newAuthor.manga_count = countStmt.getAsObject().c;
      } else {
        newAuthor.manga_count = 0;
      }
      countStmt.free();
    }

    this.save();
    return newAuthor || { id: Date.now(), name: cleanName, manga_count: 0 };
  }

  linkDetectedAuthorToSeries(authorId, authorName) {
    try {
      const stmt = this.db.prepare(`
        SELECT s.id, s.path, s.title, s.detected_author, s.author FROM series s
        LEFT JOIN series_authors sa ON s.id = sa.series_id
        GROUP BY s.id
        HAVING COUNT(sa.author_id) = 0 OR s.author = 'Desconocido'
      `);
      const candidates = [];
      while (stmt.step()) {
        candidates.push(stmt.getAsObject());
      }
      stmt.free();

      const authorObj = { id: authorId, name: authorName };
      const seriesToLink = [];

      for (const series of candidates) {
        // 1. Direct match on detected_author or author string
        if (
          (series.detected_author && series.detected_author.trim().toLowerCase() === authorName.trim().toLowerCase()) ||
          (series.author && series.author.trim().toLowerCase() === authorName.trim().toLowerCase())
        ) {
          seriesToLink.push(series.id);
          continue;
        }

        // 2. Pattern match in folder name or title
        const subfolderName = series.path ? path.basename(series.path) : '';
        const matches = this.findMatchingAuthors([authorObj], subfolderName);
        const matchesTitle = matches.length === 0 ? this.findMatchingAuthors([authorObj], series.title || '') : [];
        if (matches.length > 0 || matchesTitle.length > 0) {
          seriesToLink.push(series.id);
        }
      }

      for (const sId of seriesToLink) {
        this.db.run('INSERT OR IGNORE INTO series_authors (series_id, author_id) VALUES (?, ?)', [sId, authorId]);
        this.refreshSeriesAuthorsString(sId);
      }
      if (seriesToLink.length > 0) {
        this.save();
      }
    } catch (err) {
      console.error('Error linking detected author to series:', err);
    }
  }

  renameAuthor(id, newName) {
    const cleanName = (newName || '').trim();
    if (!cleanName) throw new Error('El nombre del autor no puede estar vacío');

    const checkStmt = this.db.prepare('SELECT id, name FROM authors WHERE name = ? COLLATE NOCASE AND id != ?');
    checkStmt.bind([cleanName, id]);
    if (checkStmt.step()) {
      checkStmt.free();
      throw new Error(`Ya existe otro autor con el nombre "${cleanName}"`);
    }
    checkStmt.free();

    this.db.run('UPDATE authors SET name = ? WHERE id = ?', [cleanName, id]);
    this.syncSeriesAuthorsForAuthor(id);
    this.save();
    return { id, name: cleanName };
  }

  deleteAuthor(id) {
    const stmt = this.db.prepare('SELECT series_id FROM series_authors WHERE author_id = ?');
    stmt.bind([id]);
    const seriesIds = [];
    while (stmt.step()) {
      seriesIds.push(stmt.getAsObject().series_id);
    }
    stmt.free();

    this.db.run('DELETE FROM series_authors WHERE author_id = ?', [id]);
    this.db.run('DELETE FROM authors WHERE id = ?', [id]);

    for (const sId of seriesIds) {
      this.refreshSeriesAuthorsString(sId);
    }
    this.save();
    return true;
  }

  getSeriesAuthors(seriesId) {
    const sql = `
      SELECT a.id, a.name
      FROM authors a
      JOIN series_authors sa ON a.id = sa.author_id
      WHERE sa.series_id = ?
      ORDER BY a.name COLLATE NOCASE ASC
    `;
    const stmt = this.db.prepare(sql);
    stmt.bind([seriesId]);
    const authors = [];
    while (stmt.step()) {
      authors.push(stmt.getAsObject());
    }
    stmt.free();
    return authors;
  }

  setSeriesAuthors(seriesId, authorIds = []) {
    this.db.run('DELETE FROM series_authors WHERE series_id = ?', [seriesId]);
    for (const aid of authorIds) {
      this.db.run('INSERT OR IGNORE INTO series_authors (series_id, author_id) VALUES (?, ?)', [seriesId, aid]);
    }
    this.refreshSeriesAuthorsString(seriesId);
    this.save();
    return this.getSeriesAuthors(seriesId);
  }

  refreshSeriesAuthorsString(seriesId) {
    const authors = this.getSeriesAuthors(seriesId);
    const authorStr = authors.length > 0 ? authors.map(a => a.name).join(', ') : 'Desconocido';
    this.db.run('UPDATE series SET author = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [authorStr, seriesId]);
  }

  syncSeriesAuthorsForAuthor(authorId) {
    const stmt = this.db.prepare('SELECT series_id FROM series_authors WHERE author_id = ?');
    stmt.bind([authorId]);
    const seriesIds = [];
    while (stmt.step()) {
      seriesIds.push(stmt.getAsObject().series_id);
    }
    stmt.free();
    for (const sId of seriesIds) {
      this.refreshSeriesAuthorsString(sId);
    }
  }

  // ==================== IGNORED DETECTED AUTHORS ====================
  ignoreAuthor(name) {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('El nombre a ignorar no puede estar vacío');

    const stmt = this.db.prepare('INSERT OR IGNORE INTO ignored_authors (name) VALUES (?)');
    stmt.run([cleanName]);
    stmt.free();

    this.save();
    return true;
  }

  unignoreAuthor(name) {
    const cleanName = (name || '').trim();
    if (!cleanName) return false;

    const stmt = this.db.prepare('DELETE FROM ignored_authors WHERE name = ? COLLATE NOCASE');
    stmt.run([cleanName]);
    stmt.free();

    this.save();
    return true;
  }

  getAllIgnoredAuthors() {
    const stmt = this.db.prepare('SELECT id, name, created_at FROM ignored_authors ORDER BY name COLLATE NOCASE ASC');
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  isAuthorIgnored(name) {
    const cleanName = (name || '').trim();
    if (!cleanName) return false;

    // EXISTING AUTHOR > IGNORED VALUE
    const authorCheck = this.getAuthorByName(cleanName);
    if (authorCheck) return false;

    const stmt = this.db.prepare('SELECT id FROM ignored_authors WHERE name = ? COLLATE NOCASE');
    stmt.bind([cleanName]);
    const isIgnored = stmt.step();
    stmt.free();
    return Boolean(isIgnored);
  }

  // ==================== CENTRALIZED LANGUAGES ====================
  getAllLanguages() {
    const sql = `
      SELECT l.id, l.name, COUNT(sl.series_id) AS manga_count
      FROM languages l
      LEFT JOIN series_languages sl ON l.id = sl.language_id
      GROUP BY l.id, l.name
      ORDER BY l.name COLLATE NOCASE ASC
    `;
    const stmt = this.db.prepare(sql);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  getLanguageByName(name) {
    if (!name) return null;
    const stmt = this.db.prepare('SELECT id, name FROM languages WHERE name = ? COLLATE NOCASE');
    stmt.bind([name.trim()]);
    let lang = null;
    if (stmt.step()) {
      lang = stmt.getAsObject();
    }
    stmt.free();
    return lang;
  }

  createLanguage(name) {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('El nombre del idioma no puede estar vacío');

    const checkStmt = this.db.prepare('SELECT id, name FROM languages WHERE name = ? COLLATE NOCASE');
    checkStmt.bind([cleanName]);
    if (checkStmt.step()) {
      checkStmt.free();
      throw new Error(`El idioma "${cleanName}" ya existe`);
    }
    checkStmt.free();

    this.db.run('INSERT INTO languages (name) VALUES (?)', [cleanName]);

    const idStmt = this.db.prepare('SELECT id, name FROM languages WHERE name = ? COLLATE NOCASE');
    idStmt.bind([cleanName]);
    let newLang = null;
    if (idStmt.step()) {
      newLang = idStmt.getAsObject();
      newLang.manga_count = 0;
    }
    idStmt.free();

    this.save();
    return newLang || { id: Date.now(), name: cleanName, manga_count: 0 };
  }

  renameLanguage(id, newName) {
    const cleanName = (newName || '').trim();
    if (!cleanName) throw new Error('El nombre del idioma no puede estar vacío');

    const checkStmt = this.db.prepare('SELECT id, name FROM languages WHERE name = ? COLLATE NOCASE AND id != ?');
    checkStmt.bind([cleanName, id]);
    if (checkStmt.step()) {
      checkStmt.free();
      throw new Error(`Ya existe otro idioma con el nombre "${cleanName}"`);
    }
    checkStmt.free();

    this.db.run('UPDATE languages SET name = ? WHERE id = ?', [cleanName, id]);
    this.syncSeriesLanguagesForLanguage(id);
    this.save();
    return { id, name: cleanName };
  }

  deleteLanguage(id) {
    const stmt = this.db.prepare('SELECT series_id FROM series_languages WHERE language_id = ?');
    stmt.bind([id]);
    const seriesIds = [];
    while (stmt.step()) {
      seriesIds.push(stmt.getAsObject().series_id);
    }
    stmt.free();

    this.db.run('DELETE FROM series_languages WHERE language_id = ?', [id]);
    this.db.run('DELETE FROM languages WHERE id = ?', [id]);

    for (const sId of seriesIds) {
      this.refreshSeriesLanguagesString(sId);
    }
    this.save();
    return true;
  }

  getSeriesLanguages(seriesId) {
    const sql = `
      SELECT l.id, l.name
      FROM languages l
      JOIN series_languages sl ON l.id = sl.language_id
      WHERE sl.series_id = ?
      ORDER BY l.name COLLATE NOCASE ASC
    `;
    const stmt = this.db.prepare(sql);
    stmt.bind([seriesId]);
    const langs = [];
    while (stmt.step()) {
      langs.push(stmt.getAsObject());
    }
    stmt.free();
    return langs;
  }

  setSeriesLanguages(seriesId, languageIds = []) {
    this.db.run('DELETE FROM series_languages WHERE series_id = ?', [seriesId]);
    for (const lid of languageIds) {
      this.db.run('INSERT OR IGNORE INTO series_languages (series_id, language_id) VALUES (?, ?)', [seriesId, lid]);
    }
    this.refreshSeriesLanguagesString(seriesId);
    this.save();
    return this.getSeriesLanguages(seriesId);
  }

  refreshSeriesLanguagesString(seriesId) {
    const langs = this.getSeriesLanguages(seriesId);
    const langStr = langs.map(l => l.name).join(', ');
    this.db.run('UPDATE series SET language = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [langStr, seriesId]);
  }

  syncSeriesLanguagesForLanguage(languageId) {
    const stmt = this.db.prepare('SELECT series_id FROM series_languages WHERE language_id = ?');
    stmt.bind([languageId]);
    const seriesIds = [];
    while (stmt.step()) {
      seriesIds.push(stmt.getAsObject().series_id);
    }
    stmt.free();
    for (const sId of seriesIds) {
      this.refreshSeriesLanguagesString(sId);
    }
  }

  // ==================== CENTRALIZED SERIES / PARODIES ====================
  getAllParodies() {
    const sql = `
      SELECT p.id, p.name, COUNT(spr.series_id) AS manga_count
      FROM series_parodies p
      LEFT JOIN series_parodies_rel spr ON p.id = spr.parody_id
      GROUP BY p.id, p.name
      ORDER BY p.name COLLATE NOCASE ASC
    `;
    const stmt = this.db.prepare(sql);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  getParodyByName(name) {
    if (!name) return null;
    const stmt = this.db.prepare('SELECT id, name FROM series_parodies WHERE name = ? COLLATE NOCASE');
    stmt.bind([name.trim()]);
    let parody = null;
    if (stmt.step()) {
      parody = stmt.getAsObject();
    }
    stmt.free();
    return parody;
  }

  createParody(name) {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('El nombre de la serie o parodia no puede estar vacío');

    const checkStmt = this.db.prepare('SELECT id, name FROM series_parodies WHERE name = ? COLLATE NOCASE');
    checkStmt.bind([cleanName]);
    if (checkStmt.step()) {
      checkStmt.free();
      throw new Error(`La serie o parodia "${cleanName}" ya existe`);
    }
    checkStmt.free();

    this.db.run('INSERT INTO series_parodies (name) VALUES (?)', [cleanName]);

    const idStmt = this.db.prepare('SELECT id, name FROM series_parodies WHERE name = ? COLLATE NOCASE');
    idStmt.bind([cleanName]);
    let newParody = null;
    if (idStmt.step()) {
      newParody = idStmt.getAsObject();
      newParody.manga_count = 0;
    }
    idStmt.free();

    this.save();
    return newParody || { id: Date.now(), name: cleanName, manga_count: 0 };
  }

  renameParody(id, newName) {
    const cleanName = (newName || '').trim();
    if (!cleanName) throw new Error('El nombre de la serie o parodia no puede estar vacío');

    const checkStmt = this.db.prepare('SELECT id, name FROM series_parodies WHERE name = ? COLLATE NOCASE AND id != ?');
    checkStmt.bind([cleanName, id]);
    if (checkStmt.step()) {
      checkStmt.free();
      throw new Error(`Ya existe otra serie o parodia con el nombre "${cleanName}"`);
    }
    checkStmt.free();

    this.db.run('UPDATE series_parodies SET name = ? WHERE id = ?', [cleanName, id]);
    this.syncSeriesParodiesForParody(id);
    this.save();
    return { id, name: cleanName };
  }

  deleteParody(id) {
    const stmt = this.db.prepare('SELECT series_id FROM series_parodies_rel WHERE parody_id = ?');
    stmt.bind([id]);
    const seriesIds = [];
    while (stmt.step()) {
      seriesIds.push(stmt.getAsObject().series_id);
    }
    stmt.free();

    this.db.run('DELETE FROM series_parodies_rel WHERE parody_id = ?', [id]);
    this.db.run('DELETE FROM series_parodies WHERE id = ?', [id]);

    for (const sId of seriesIds) {
      this.refreshSeriesParodiesString(sId);
    }
    this.save();
    return true;
  }

  getSeriesParodies(seriesId) {
    const sql = `
      SELECT p.id, p.name
      FROM series_parodies p
      JOIN series_parodies_rel spr ON p.id = spr.parody_id
      WHERE spr.series_id = ?
      ORDER BY p.name COLLATE NOCASE ASC
    `;
    const stmt = this.db.prepare(sql);
    stmt.bind([seriesId]);
    const parodies = [];
    while (stmt.step()) {
      parodies.push(stmt.getAsObject());
    }
    stmt.free();
    return parodies;
  }

  setSeriesParodies(seriesId, parodyIds = []) {
    this.db.run('DELETE FROM series_parodies_rel WHERE series_id = ?', [seriesId]);
    for (const pid of parodyIds) {
      this.db.run('INSERT OR IGNORE INTO series_parodies_rel (series_id, parody_id) VALUES (?, ?)', [seriesId, pid]);
    }
    this.refreshSeriesParodiesString(seriesId);
    this.save();
    return this.getSeriesParodies(seriesId);
  }

  refreshSeriesParodiesString(seriesId) {
    const parodies = this.getSeriesParodies(seriesId);
    const parodyStr = parodies.map(p => p.name).join(', ');
    this.db.run('UPDATE series SET parody = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [parodyStr, seriesId]);
  }

  syncSeriesParodiesForParody(parodyId) {
    const stmt = this.db.prepare('SELECT series_id FROM series_parodies_rel WHERE parody_id = ?');
    stmt.bind([parodyId]);
    const seriesIds = [];
    while (stmt.step()) {
      seriesIds.push(stmt.getAsObject().series_id);
    }
    stmt.free();
    for (const sId of seriesIds) {
      this.refreshSeriesParodiesString(sId);
    }
  }

  // ==================== CENTRALIZED GROUPS / CIRCLES ====================
  getAllGroups() {
    const sql = `
      SELECT g.id, g.name, COUNT(sg.series_id) AS manga_count
      FROM groups g
      LEFT JOIN series_groups sg ON g.id = sg.group_id
      GROUP BY g.id, g.name
      ORDER BY g.name COLLATE NOCASE ASC
    `;
    const stmt = this.db.prepare(sql);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  getGroupByName(name) {
    if (!name) return null;
    const stmt = this.db.prepare('SELECT id, name FROM groups WHERE name = ? COLLATE NOCASE');
    stmt.bind([name.trim()]);
    let grp = null;
    if (stmt.step()) {
      grp = stmt.getAsObject();
    }
    stmt.free();
    return grp;
  }

  createGroup(name) {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('El nombre del grupo no puede estar vacío');

    const checkStmt = this.db.prepare('SELECT id, name FROM groups WHERE name = ? COLLATE NOCASE');
    checkStmt.bind([cleanName]);
    if (checkStmt.step()) {
      checkStmt.free();
      throw new Error(`El grupo "${cleanName}" ya existe`);
    }
    checkStmt.free();

    this.db.run('INSERT INTO groups (name) VALUES (?)', [cleanName]);

    const idStmt = this.db.prepare('SELECT id, name FROM groups WHERE name = ? COLLATE NOCASE');
    idStmt.bind([cleanName]);
    let newGroup = null;
    if (idStmt.step()) {
      newGroup = idStmt.getAsObject();
      newGroup.manga_count = 0;
    }
    idStmt.free();

    if (newGroup) {
      this.linkMatchingGroupToSeries(newGroup.id, newGroup.name);
      const countStmt = this.db.prepare('SELECT COUNT(*) AS c FROM series_groups WHERE group_id = ?');
      countStmt.bind([newGroup.id]);
      if (countStmt.step()) {
        newGroup.manga_count = countStmt.getAsObject().c;
      } else {
        newGroup.manga_count = 0;
      }
      countStmt.free();
    }

    this.save();
    return newGroup || { id: Date.now(), name: cleanName, manga_count: 0 };
  }

  linkMatchingGroupToSeries(groupId, groupName) {
    try {
      const stmt = this.db.prepare(`
        SELECT s.id, s.path, s.title, s.group_name FROM series s
        LEFT JOIN series_groups sg ON s.id = sg.series_id
        GROUP BY s.id
        HAVING COUNT(sg.group_id) = 0 OR s.group_name IS NULL OR s.group_name = ''
      `);
      const candidates = [];
      while (stmt.step()) {
        candidates.push(stmt.getAsObject());
      }
      stmt.free();

      const groupObj = { id: groupId, name: groupName };
      const seriesToLink = [];

      for (const series of candidates) {
        const subfolderName = series.path ? path.basename(series.path) : '';
        const matches = this.findMatchingGroups([groupObj], subfolderName);
        const matchesTitle = matches.length === 0 ? this.findMatchingGroups([groupObj], series.title || '') : [];
        if (matches.length > 0 || matchesTitle.length > 0) {
          seriesToLink.push(series.id);
        }
      }

      for (const sId of seriesToLink) {
        this.db.run('INSERT OR IGNORE INTO series_groups (series_id, group_id) VALUES (?, ?)', [sId, groupId]);
        this.refreshSeriesGroupsString(sId);
      }
    } catch (err) {
      console.error('Error linking matching group to series:', err);
    }
  }

  renameGroup(id, newName) {
    const cleanName = (newName || '').trim();
    if (!cleanName) throw new Error('El nombre del grupo no puede estar vacío');

    const checkStmt = this.db.prepare('SELECT id, name FROM groups WHERE name = ? COLLATE NOCASE AND id != ?');
    checkStmt.bind([cleanName, id]);
    if (checkStmt.step()) {
      checkStmt.free();
      throw new Error(`Ya existe otro grupo con el nombre "${cleanName}"`);
    }
    checkStmt.free();

    this.db.run('UPDATE groups SET name = ? WHERE id = ?', [cleanName, id]);
    this.syncSeriesGroupsForGroup(id);
    this.save();
    return { id, name: cleanName };
  }

  deleteGroup(id) {
    const stmt = this.db.prepare('SELECT series_id FROM series_groups WHERE group_id = ?');
    stmt.bind([id]);
    const seriesIds = [];
    while (stmt.step()) {
      seriesIds.push(stmt.getAsObject().series_id);
    }
    stmt.free();

    this.db.run('DELETE FROM series_groups WHERE group_id = ?', [id]);
    this.db.run('DELETE FROM groups WHERE id = ?', [id]);

    for (const sId of seriesIds) {
      this.refreshSeriesGroupsString(sId);
    }
    this.save();
    return true;
  }

  getSeriesGroups(seriesId) {
    const sql = `
      SELECT g.id, g.name
      FROM groups g
      JOIN series_groups sg ON g.id = sg.group_id
      WHERE sg.series_id = ?
      ORDER BY g.name COLLATE NOCASE ASC
    `;
    const stmt = this.db.prepare(sql);
    stmt.bind([seriesId]);
    const groups = [];
    while (stmt.step()) {
      groups.push(stmt.getAsObject());
    }
    stmt.free();
    return groups;
  }

  setSeriesGroups(seriesId, groupIds = []) {
    this.db.run('DELETE FROM series_groups WHERE series_id = ?', [seriesId]);
    for (const gid of groupIds) {
      this.db.run('INSERT OR IGNORE INTO series_groups (series_id, group_id) VALUES (?, ?)', [seriesId, gid]);
    }
    this.refreshSeriesGroupsString(seriesId);
    this.save();
    return this.getSeriesGroups(seriesId);
  }

  refreshSeriesGroupsString(seriesId) {
    const groups = this.getSeriesGroups(seriesId);
    const grpStr = groups.map(g => g.name).join(', ');
    this.db.run('UPDATE series SET group_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [grpStr, seriesId]);
  }

  syncSeriesGroupsForGroup(groupId) {
    const stmt = this.db.prepare('SELECT series_id FROM series_groups WHERE group_id = ?');
    stmt.bind([groupId]);
    const seriesIds = [];
    while (stmt.step()) {
      seriesIds.push(stmt.getAsObject().series_id);
    }
    stmt.free();
    for (const sId of seriesIds) {
      this.refreshSeriesGroupsString(sId);
    }
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

  getChapterById(chapterId) {
    const stmt = this.db.prepare(`
      SELECT c.*, s.title AS series_title 
      FROM chapters c
      LEFT JOIN series s ON c.series_id = s.id
      WHERE c.id = ?
    `);
    stmt.bind([chapterId]);
    let chapter = null;
    if (stmt.step()) {
      chapter = stmt.getAsObject();
    }
    stmt.free();
    return chapter;
  }

  getAdjacentChapters(chapterId) {
    const current = this.getChapterById(chapterId);
    if (!current) return { prev: null, next: null };

    // Get all chapters of this series in ascending reading order
    const all = this.getChapters(current.series_id, { sortOrder: 'asc' });
    const currentIndex = all.findIndex(c => c.id === current.id);
    if (currentIndex === -1) return { prev: null, next: null };

    return {
      prev: currentIndex > 0 ? all[currentIndex - 1] : null,
      next: currentIndex < all.length - 1 ? all[currentIndex + 1] : null
    };
  }

  updateChapterPageCount(chapterId, pageCount) {
    if (!pageCount || pageCount <= 0) return;
    this.db.run('UPDATE chapters SET page_count = ? WHERE id = ?', [pageCount, chapterId]);
    this.save();
  }

  getChapterReadingPosition(chapterId) {
    if (!chapterId) return 0;
    const stmt = this.db.prepare('SELECT reading_position FROM chapters WHERE id = ?');
    stmt.bind([chapterId]);
    let pos = 0;
    if (stmt.step()) {
      pos = stmt.getAsObject().reading_position;
    }
    stmt.free();
    return (typeof pos === 'number' && !isNaN(pos)) ? Math.max(0, Math.min(1.0, pos)) : 0;
  }

  setChapterReadingPosition(chapterId, position) {
    if (!chapterId) return 0;
    const numChapterId = Number(chapterId) || chapterId;
    let pos = Number(position);
    if (isNaN(pos)) pos = 0;
    pos = Math.max(0, Math.min(1.0, pos));

    // When pos >= 0.90 (completion threshold), set to 1.0 and mark as read
    if (pos >= 0.90) {
      pos = 1.0;
      this.db.run(
        'UPDATE chapters SET reading_position = 1.0, is_read = 1, last_read_at = CURRENT_TIMESTAMP WHERE id = ?',
        [numChapterId]
      );
      this.db.run(
        `INSERT INTO reading_history (chapter_id, last_read_at)
         VALUES (?, CURRENT_TIMESTAMP)
         ON CONFLICT(chapter_id) DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`,
        [numChapterId]
      );
    } else if (pos > 0) {
      this.db.run(
        'UPDATE chapters SET reading_position = ?, last_read_at = CURRENT_TIMESTAMP WHERE id = ?',
        [pos, numChapterId]
      );
      this.db.run(
        `INSERT INTO reading_history (chapter_id, last_read_at)
         VALUES (?, CURRENT_TIMESTAMP)
         ON CONFLICT(chapter_id) DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`,
        [numChapterId]
      );
    } else {
      this.db.run(
        'UPDATE chapters SET reading_position = ? WHERE id = ?',
        [pos, numChapterId]
      );
    }
    this.save();
    return pos;
  }

  setChapterRead(chapterId, isRead = 1) {
    const numChapterId = Number(chapterId) || chapterId;
    const val = isRead ? 1 : 0;
    if (val === 1) {
      this.db.run(
        'UPDATE chapters SET is_read = 1, reading_position = 1.0, last_read_at = CURRENT_TIMESTAMP WHERE id = ?',
        [numChapterId]
      );
      this.db.run(
        `INSERT INTO reading_history (chapter_id, last_read_at)
         VALUES (?, CURRENT_TIMESTAMP)
         ON CONFLICT(chapter_id) DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`,
        [numChapterId]
      );
    } else {
      this.db.run(
        'UPDATE chapters SET is_read = 0, last_read_at = CURRENT_TIMESTAMP WHERE id = ?',
        [numChapterId]
      );
    }
    this.save();
    return val;
  }

    /**
   * Records that a chapter was opened by the user, independent of reading progress.
   *
   * Inserts (or updates) a row in reading_history so the chapter appears in the
   * reading activity lists even if the user hasn't scrolled past 0%.
   *
   * Does NOT modify reading_position or is_read.
   *
   * @param {number|string} chapterId
   * @returns {boolean}
   */
  recordChapterOpened(chapterId) {
    const numChapterId = Number(chapterId);
    if (!numChapterId) return false;
    try {
      const check = this.db.prepare('SELECT id FROM chapters WHERE id = ?');
      check.bind([numChapterId]);
      const exists = check.step();
      check.free();
      if (!exists) return false;

      this.db.run(
        `INSERT INTO reading_history (chapter_id, last_read_at)
         VALUES (?, CURRENT_TIMESTAMP)
         ON CONFLICT(chapter_id) DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`,
        [numChapterId]
      );

      this.db.run(
        'UPDATE chapters SET last_read_at = CURRENT_TIMESTAMP WHERE id = ?',
        [numChapterId]
      );

      this.save();
      return true;
    } catch (err) {
      console.error('Error recording chapter opened:', err);
      return false;
    }
  }
  markAllChaptersRead(seriesId, isRead = true) {
    const val = isRead ? 1 : 0;
    this.db.run('UPDATE chapters SET is_read = ?, last_read_at = CURRENT_TIMESTAMP WHERE series_id = ?', [val, seriesId]);
    if (val === 1) {
      this.db.run(`
        INSERT INTO reading_history (chapter_id, last_read_at)
        SELECT id, CURRENT_TIMESTAMP FROM chapters WHERE series_id = ?
        ON CONFLICT(chapter_id) DO UPDATE SET last_read_at = CURRENT_TIMESTAMP
      `, [seriesId]);
    }
    this.save();
    return true;
  }

  deleteReadingHistoryEntry(chapterId) {
    const numId = Number(chapterId);
    if (!numId) return false;
    this.db.run('DELETE FROM reading_history WHERE chapter_id = ?', [numId]);
    try {
      this.db.run('UPDATE chapters SET last_read_at = NULL WHERE id = ?', [numId]);
    } catch (_) {}
    this.save();
    return true;
  }

  resetSeriesReadingHistory(seriesId) {
    const numId = Number(seriesId);
    if (!numId) return false;
    this.beginTransaction();
    try {
      this.db.run(
        'DELETE FROM reading_history WHERE chapter_id IN (SELECT id FROM chapters WHERE series_id = ?)',
        [numId]
      );
      this.db.run(
        'UPDATE chapters SET reading_position = 0, is_read = 0, last_read_at = NULL WHERE series_id = ?',
        [numId]
      );
      this.commit();
      return true;
    } catch (err) {
      this.rollback();
      console.error('Error resetting series reading history:', err);
      throw err;
    }
  }

  clearAllReadingHistory() {
    this.beginTransaction();
    try {
      this.db.run('DELETE FROM reading_history');
      try {
        this.db.run('UPDATE chapters SET last_read_at = NULL');
      } catch (_) {}
      this.commit();
      return true;
    } catch (err) {
      this.rollback();
      console.error('Error clearing all reading history:', err);
      throw err;
    }
  }

  resetAllReadingHistoryAndProgress() {
    this.beginTransaction();
    try {
      this.db.run('DELETE FROM reading_history');
      this.db.run('UPDATE chapters SET reading_position = 0, is_read = 0');
      try {
        this.db.run('UPDATE chapters SET last_read_at = NULL');
      } catch (_) {}
      this.commit();
      return true;
    } catch (err) {
      this.rollback();
      console.error('Error resetting all reading history and progress:', err);
      throw err;
    }
  }

  // ==================== HISTORY & CONTINUE READING ====================
  /**
   * Retrieve chapters that have been started (reading_position > 0) but not finished (is_read = 0).
   * Ordered by last_read_at DESC.
   * Single join query with series, returning only required fields without N+1 overhead.
   * @param {number} [limit=20]
   * @returns {Array<Object>}
   */
    getContinueReading(limit = 20) {
    const numLimit = Math.max(1, parseInt(limit, 10) || 20);
    const stmt = this.db.prepare(`
      SELECT
        c.id,
        c.series_id,
        c.title,
        c.file_name,
        c.file_path,
        c.format,
        c.chapter_number,
        c.page_count,
        c.is_read,
        c.reading_position,
        h.last_read_at,
        h.chapter_id,
        s.title AS series_title,
        s.cover_path AS series_cover_path,
        s.primary_format AS series_format
      FROM reading_history h
      INNER JOIN chapters c ON c.id = h.chapter_id
      INNER JOIN series s ON s.id = c.series_id
      WHERE c.is_read = 0
      ORDER BY h.last_read_at DESC
      LIMIT ?
    `);
    stmt.bind([numLimit]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }
  /**
   * Retrieve reading history: chapters with recorded last_read_at ordered by last_read_at DESC.
   * Single join query with series, returning only required fields without N+1 overhead.
   * @param {number} [limit=50]
   * @returns {Array<Object>}
   */
  getReadingHistory(limit = 50) {
    const numLimit = Math.max(1, parseInt(limit, 10) || 50);
    const stmt = this.db.prepare(`
      SELECT
        c.id,
        c.series_id,
        c.title,
        c.file_name,
        c.file_path,
        c.format,
        c.chapter_number,
        c.page_count,
        c.is_read,
        c.reading_position,
        h.last_read_at,
        h.chapter_id,
        s.title AS series_title,
        s.cover_path AS series_cover_path,
        s.primary_format AS series_format
      FROM reading_history h
      INNER JOIN chapters c ON c.id = h.chapter_id
      INNER JOIN series s ON s.id = c.series_id
      ORDER BY h.last_read_at DESC
      LIMIT ?
    `);
    stmt.bind([numLimit]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }
}

module.exports = DatabaseManager;
