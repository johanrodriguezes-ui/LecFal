/**
 * Test Suite: History → Manga Detail Navigation Context
 *
 * Verifies:
 * A. Library → Detail shows "‹ Biblioteca".
 * B. Clicking "‹ Biblioteca" returns to Library.
 * C. History → Detail through the cover shows "‹ Historial".
 * D. Clicking "‹ Historial" returns to History.
 * E. History → Detail does NOT show "‹ Biblioteca".
 * F. History "Continuar" still opens the exact chapter.
 * G. History "Continuar" still hands the saved reading position to the reader.
 * H. Opening Detail from Library does not inherit History context.
 * I. Opening Detail from History does not inherit Library context.
 * J. Returning from Detail to History does not create duplicate views/entries.
 * Extra: Recently Read cover → Detail ("‹ Historial"), Escape follows origin,
 *        sourceless re-entry (reader → Detail) preserves origin.
 */

const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const DatabaseManager = require('../../src/core/db');
const storage = require('../../src/core/storage');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lecfal-cover',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  },
  {
    scheme: 'lecfal-file',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
]);

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let win = null;
let db = null;
let tempDir = null;

function insertSeries(title, seriesPath, folderId) {
  db.db.run(
    'INSERT INTO series (folder_id, title, path, cover_path, author, primary_format) VALUES (?, ?, ?, ?, ?, ?)',
    [folderId, title, seriesPath, '', 'Autor', 'cbz']
  );
  const stmt = db.db.prepare('SELECT id FROM series WHERE path = ?');
  stmt.bind([seriesPath]);
  stmt.step();
  const id = stmt.getAsObject().id;
  stmt.free();
  return id;
}

function insertChapter(seriesId, title, filePath, num, pos, isRead, lastReadAt) {
  db.db.run(
    'INSERT INTO chapters (series_id, title, file_name, file_path, format, chapter_number, page_count, reading_position, is_read, last_read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [seriesId, title, path.basename(filePath), filePath, 'cbz', num, 10, pos, isRead, lastReadAt]
  );
  const stmt = db.db.prepare('SELECT id FROM chapters WHERE file_path = ?');
  stmt.bind([filePath]);
  stmt.step();
  const id = stmt.getAsObject().id;
  stmt.free();
  if (lastReadAt) {
    db.db.run('INSERT OR REPLACE INTO reading_history (chapter_id, last_read_at) VALUES (?, ?)', [id, lastReadAt]);
  }
  return id;
}

function countHistoryRows() {
  const stmt = db.db.prepare('SELECT COUNT(*) AS cnt FROM reading_history');
  stmt.step();
  const cnt = stmt.getAsObject().cnt;
  stmt.free();
  return cnt;
}

async function js(code) {
  return win.webContents.executeJavaScript(code);
}

async function waitFor(conditionJs, label, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await js(conditionJs)) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`Timeout waiting for: ${label}`);
}

const viewStateJs = `
  (() => {
    const vis = (id) => {
      const el = document.getElementById(id);
      return el ? getComputedStyle(el).display !== 'none' : false;
    };
    const back = document.getElementById('btnBackToLibrary');
    return {
      library: vis('libraryView'),
      history: vis('historyView'),
      manga: vis('mangaView'),
      reader: vis('readerView'),
      backLabel: back ? back.querySelector('span').textContent.trim() : null,
      backOrigin: back ? back.dataset.origin : null,
      backButtons: document.querySelectorAll('#mangaView .btn-back').length,
      origin: window.lecfalViews.getDetailOrigin(),
      historyViews: document.querySelectorAll('#historyView').length,
      continueCards: document.querySelectorAll('#continueReadingGrid .continue-card').length,
      recentRows: document.querySelectorAll('#recentHistoryContainer .recent-item').length
    };
  })()
`;

async function runHistoryNavigationTests() {
  console.log('======================================================');
  console.log('  TEST: HISTORY → MANGA DETAIL NAVIGATION CONTEXT');
  console.log('======================================================');

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_history_nav_'));
  storage.init({ dataRoot: tempDir });

  protocol.handle('lecfal-cover', () => new Response('Not found', { status: 404 }));
  protocol.handle('lecfal-file', () => new Response('Not found', { status: 404 }));

  db = new DatabaseManager(path.join(tempDir, 'test_history_nav.db'));
  await db.init();

  const libDir = path.join(tempDir, 'library');
  const folder = db.addFolder(libDir);
  const s1 = insertSeries('Serie Uno', path.join(libDir, 'Serie Uno'), folder.id);
  const s2 = insertSeries('Serie Dos', path.join(libDir, 'Serie Dos'), folder.id);
  const ch1 = insertChapter(s1, 'Capítulo 1', path.join(libDir, 'Serie Uno', 'c1.cbz'), 1, 0.63, 0, '2026-10-01 10:00:00');
  const ch2 = insertChapter(s2, 'Capítulo 1', path.join(libDir, 'Serie Dos', 'c1.cbz'), 1, 1.0, 1, '2026-10-01 09:00:00');
  insertChapter(s2, 'Capítulo 2', path.join(libDir, 'Serie Dos', 'c2.cbz'), 2, 0, 0, null);

  const requestedReaderChapters = [];
  const positionWrites = [];

  // IPC handlers (real DB-backed where relevant)
  ipcMain.handle('library:get-series', async (event, filters) => db.getSeriesList(filters));
  ipcMain.handle('library:get-series-detail', async (event, { seriesId, sortOrder = 'asc' }) => {
    const series = db.getSeriesById(seriesId);
    if (!series) return null;
    return { ...series, chapters: db.getChapters(seriesId, { sortOrder }) };
  });
  ipcMain.handle('library:get-folders', async () => db.getFolders());
  ipcMain.handle('library:toggle-series-fav', async (event, id) => db.toggleSeriesFavorite(id));
  ipcMain.handle('history:get-continue-reading', async (event, limit = 20) => db.getContinueReading(limit));
  ipcMain.handle('history:get-reading-history', async (event, limit = 50) => db.getReadingHistory(limit));
  ipcMain.handle('reader:get-chapter', async (event, chapterId) => {
    requestedReaderChapters.push(chapterId);
    const c = db.getChapterById(chapterId);
    if (!c) return null;
    const s = db.getSeriesById(c.series_id);
    return {
      chapter: {
        id: c.id,
        seriesId: c.series_id,
        seriesTitle: s ? s.title : 'Manga',
        title: c.title,
        fileName: c.file_name,
        filePath: c.file_path,
        format: c.format,
        pageCount: 0,
        isRead: c.is_read,
        chapterNumber: c.chapter_number,
        estimatedAspectRatio: 1.414,
        firstPageDimensions: null,
        readingPosition: c.reading_position
      },
      pages: [],
      prevChapter: null,
      nextChapter: null
    };
  });
  // Record (but do not persist) reader position writes so DB state stays observable
  ipcMain.handle('reader:set-reading-position', async (event, payload) => {
    positionWrites.push(payload);
    return payload?.position;
  });
  ipcMain.handle('reader:get-reading-position', async (event, id) => db.getChapterReadingPosition(id));
  ipcMain.handle('tags:get-all', async () => db.getAllTags());
  ipcMain.handle('authors:get-all', async () => db.getAllAuthors());
  ipcMain.handle('authors:get-all-ignored', async () => db.getAllIgnoredAuthors());
  ipcMain.handle('languages:get-all', async () => db.getAllLanguages());
  ipcMain.handle('parodies:get-all', async () => db.getAllParodies());
  ipcMain.handle('groups:get-all', async () => db.getAllGroups());
  ipcMain.handle('libraries:get-all', async () => db.getLibraries());
  ipcMain.handle('libraries:get-by-id', async (event, id) => db.getLibraryById(id));
  ipcMain.handle('settings:get', async (event, key, defaultValue) => db.getSetting(key, defaultValue));
  ipcMain.handle('settings:set', async (event, key, value) => db.setSetting(key, value));
  ipcMain.handle('system:get-version', () => '1.0.0');
  ipcMain.handle('system:is-fullscreen', async () => false);
  ipcMain.handle('storage:get-info', async () => ({
    mode: 'standard', isPortable: false, storageRoot: tempDir, standardPath: tempDir,
    portablePath: path.join(tempDir, 'data'), isPortableAvailable: true, appDir: tempDir
  }));
  ipcMain.handle('storage:check-destination', async () => ({
    targetMode: 'portable', targetPath: path.join(tempDir, 'data'),
    isWritable: true, hasExistingData: false, existingFiles: []
  }));

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../src/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  win.show();
  await waitFor(`!!(window.lecfalViews && document.getElementById('mangaView'))`, 'renderer ready');
  console.log('✓ Renderer loaded.');

  const historyRowsBefore = countHistoryRows();

  // ----------------------------------------------------
  // A & B: Library → Detail → "‹ Biblioteca" → Library
  // ----------------------------------------------------
  console.log('\n--- Test A & B: Library → Detail → Biblioteca ---');
  await js(`window.lecfalViews.navigateToLibrary()`);
  await waitFor(`!!document.querySelector('.comic-card[data-id="${s1}"]')`, 'library card rendered');
  await js(`document.querySelector('.comic-card[data-id="${s1}"]').click()`);
  await waitFor(`getComputedStyle(document.getElementById('mangaView')).display !== 'none'`, 'detail visible');
  let st = await js(viewStateJs);
  assert.strictEqual(st.backLabel, 'Biblioteca', 'A: Library → Detail must show "Biblioteca"');
  assert.strictEqual(st.backOrigin, 'library', 'A: back origin must be library');
  assert.strictEqual(st.backButtons, 1, 'A: exactly one back button in Detail');
  console.log('✓ Test A passed: Library → Detail shows "‹ Biblioteca".');

  await js(`document.getElementById('btnBackToLibrary').click()`);
  await new Promise(r => setTimeout(r, 150));
  st = await js(viewStateJs);
  assert.strictEqual(st.library, true, 'B: Library must be visible');
  assert.strictEqual(st.manga, false, 'B: Detail must be hidden');
  assert.strictEqual(st.history, false, 'B: History must stay hidden');
  console.log('✓ Test B passed: "‹ Biblioteca" returns to Library.');

  // ----------------------------------------------------
  // C, E, I: History cover → Detail → "‹ Historial"
  // ----------------------------------------------------
  console.log('\n--- Test C, E & I: History cover → Detail ---');
  await js(`document.getElementById('navTabHistory').click()`);
  await waitFor(`!!document.querySelector('.continue-card[data-chapter-id="${ch1}"] .continue-card-cover-wrapper')`, 'continue card rendered');
  const continueCardsBefore = (await js(viewStateJs)).continueCards;
  const recentRowsBefore = (await js(viewStateJs)).recentRows;

  await js(`document.querySelector('.continue-card[data-chapter-id="${ch1}"] .continue-card-cover-wrapper').click()`);
  await waitFor(`getComputedStyle(document.getElementById('mangaView')).display !== 'none'`, 'detail visible from history');
  st = await js(viewStateJs);
  assert.strictEqual(st.reader, false, 'C: cover must NOT open the reader');
  assert.strictEqual(requestedReaderChapters.length, 0, 'C: cover must NOT request a chapter for reading');
  assert.strictEqual(st.backLabel, 'Historial', 'C: History → Detail must show "Historial"');
  assert.notStrictEqual(st.backLabel, 'Biblioteca', 'E: History → Detail must NOT show "Biblioteca"');
  assert.strictEqual(st.origin, 'history', 'I: origin must be history, not library');
  const detailTitle = await js(`document.getElementById('mangaHeroTitle').textContent`);
  assert.strictEqual(detailTitle, 'Serie Uno', 'C: Detail shows the series of the clicked History entry');
  console.log('✓ Test C, E & I passed: cover opens Detail with "‹ Historial".');

  // ----------------------------------------------------
  // D & J: "‹ Historial" → History, no duplicates
  // ----------------------------------------------------
  console.log('\n--- Test D & J: Detail → Historial ---');
  await js(`document.getElementById('btnBackToLibrary').click()`);
  await waitFor(`getComputedStyle(document.getElementById('historyView')).display !== 'none'`, 'history visible again');
  await waitFor(`document.querySelectorAll('#continueReadingGrid .continue-card').length > 0`, 'history re-rendered');
  st = await js(viewStateJs);
  assert.strictEqual(st.history, true, 'D: History must be visible');
  assert.strictEqual(st.library, false, 'D: must NOT navigate to Library');
  assert.strictEqual(st.manga, false, 'D: Detail must be hidden');
  const historyTabActive = await js(`document.getElementById('navTabHistory').classList.contains('active')`);
  assert.strictEqual(historyTabActive, true, 'D: History tab must be active');
  assert.strictEqual(st.historyViews, 1, 'J: exactly one History view instance');
  assert.strictEqual(st.continueCards, continueCardsBefore, 'J: no duplicated Continue cards');
  assert.strictEqual(st.recentRows, recentRowsBefore, 'J: no duplicated Recent rows');
  assert.strictEqual(countHistoryRows(), historyRowsBefore, 'J: no history rows created by navigation');
  console.log('✓ Test D & J passed: "‹ Historial" returns to History without duplicates.');

  // Recently Read cover → Detail also uses History context
  console.log('\n--- Extra: Recently Read cover → Detail ---');
  await js(`document.querySelector('.recent-item[data-chapter-id="${ch2}"] .recent-item-cover').click()`);
  await waitFor(`getComputedStyle(document.getElementById('mangaView')).display !== 'none'`, 'detail from recent');
  st = await js(viewStateJs);
  assert.strictEqual(st.backLabel, 'Historial', 'Recent cover → Detail must show "Historial"');
  assert.strictEqual(st.reader, false, 'Recent cover must NOT open reader');
  // Escape follows origin as well
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await waitFor(`getComputedStyle(document.getElementById('historyView')).display !== 'none'`, 'escape back to history');
  console.log('✓ Extra passed: Recently Read cover → Detail, Escape returns to History.');

  // Sourceless re-entry (as used by reader close) preserves origin
  await js(`window.lecfalViews.openMangaView(${s1}, { source: 'history' })`);
  await js(`window.lecfalViews.openMangaView(${s1})`);
  st = await js(viewStateJs);
  assert.strictEqual(st.backLabel, 'Historial', 'Sourceless re-entry must preserve History origin');
  await js(`window.lecfalViews.navigateBackFromDetail()`);
  await waitFor(`getComputedStyle(document.getElementById('historyView')).display !== 'none'`, 'back to history');
  console.log('✓ Extra passed: sourceless re-entry keeps "‹ Historial".');

  // ----------------------------------------------------
  // H: Library → Detail after History context
  // ----------------------------------------------------
  console.log('\n--- Test H: Library does not inherit History context ---');
  await js(`document.getElementById('navTabLibrary').click()`);
  await waitFor(`!!document.querySelector('.comic-card[data-id="${s2}"]')`, 'library card rendered again');
  await js(`document.querySelector('.comic-card[data-id="${s2}"]').click()`);
  await waitFor(`getComputedStyle(document.getElementById('mangaView')).display !== 'none'`, 'detail from library');
  st = await js(viewStateJs);
  assert.strictEqual(st.backLabel, 'Biblioteca', 'H: Library → Detail must show "Biblioteca"');
  assert.strictEqual(st.origin, 'library', 'H: origin must be library');
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await new Promise(r => setTimeout(r, 150));
  st = await js(viewStateJs);
  assert.strictEqual(st.library, true, 'H: Escape from Library-origin Detail returns to Library');
  console.log('✓ Test H passed: Library → Detail does not inherit History context.');

  // ----------------------------------------------------
  // F & G: "Continuar" opens exact chapter with saved position
  // ----------------------------------------------------
  console.log('\n--- Test F & G: Continuar → exact chapter ---');
  await js(`document.getElementById('navTabHistory').click()`);
  await waitFor(`!!document.querySelector('.continue-card[data-chapter-id="${ch1}"] .btn-continue-card')`, 'continue button rendered');
  const dbPosBefore = db.getChapterReadingPosition(ch1);
  await js(`document.querySelector('.continue-card[data-chapter-id="${ch1}"] .btn-continue-card').click()`);
  await waitFor(`!!(window.webtoonReader && window.webtoonReader.chapterData && window.webtoonReader.chapterData.chapter)`, 'reader chapter loaded');
  st = await js(viewStateJs);
  const readerState = await js(`({
    id: window.webtoonReader.chapterData.chapter.id,
    saved: window.webtoonReader.savedReadingPosition
  })`);
  assert.strictEqual(st.reader, true, 'F: reader view must be visible');
  assert.strictEqual(st.manga, false, 'F: Continuar must NOT open Detail');
  assert.deepStrictEqual(requestedReaderChapters, [ch1], 'F: exactly the History entry chapter was requested');
  assert.strictEqual(readerState.id, ch1, 'F: reader opened the exact chapter');
  assert.strictEqual(readerState.saved, dbPosBefore, 'G: reader received the saved reading position');
  assert.strictEqual(dbPosBefore, 0.63, 'G: saved position fixture is intact');
  console.log('✓ Test F & G passed: Continuar opens the exact chapter at its saved position.');

  console.log('\n======================================================');
  console.log('  ALL HISTORY NAVIGATION CONTEXT TESTS PASSED (A - J)');
  console.log('======================================================');

  if (win) win.close();
  if (tempDir && fs.existsSync(tempDir)) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
  app.quit();
}

app.whenReady().then(runHistoryNavigationTests).catch(err => {
  console.error('Test failed:', err);
  if (win) win.close();
  app.exit(1);
});

module.exports = runHistoryNavigationTests;
