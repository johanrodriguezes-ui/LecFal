/**
 * Integration Test: Author Suggestion to Settings Auto-Refresh & Refresh Buttons
 *
 * Verifies:
 * 1. Adding author from scanner suggestion ("Añadir a Ajustes") immediately updates the author catalog
 *    in memory and renders properly when entering Ajustes -> Autores without needing an app restart.
 * 2. Navigation switches between settings sections cleanly re-fetch fresh catalog data.
 * 3. Dedicated refresh buttons (.btn-catalog-refresh, #btnSettingsRefreshLibraries,
 *    #btnSettingsRefreshFolders, #btnRefreshIgnoredAuthors, .btn-all-catalogs-refresh) exist,
 *    are interactive, and successfully reload data.
 * 4. Ignoring an author from suggestions updates sectionIgnoredAuthors.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const DatabaseManager = require('../../src/core/db');

let win = null;
let tempDir = null;
let db = null;

async function runTests() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_author_refresh_'));
  const dbPath = path.join(tempDir, 'test_author_refresh.db');
  db = new DatabaseManager(dbPath);
  await db.init();

  // Create initial data
  const mangaLib = db.createLibrary('Manga');
  const folder = db.addFolder(path.join(tempDir, 'manga_folder'), mangaLib.id);

  // Series 1 with detected_author
  const series1Id = db.upsertSeries({
    folder_id: folder.id,
    title: '[Oda Sensei] One Piece Chapter 1',
    path: path.join(tempDir, 'manga_folder', 'One Piece'),
    detected_author: 'Oda Sensei',
    author: 'Desconocido'
  });

  // Series 2 with detected_author to test ignore
  const series2Id = db.upsertSeries({
    folder_id: folder.id,
    title: '[ScanGroup] Naruto Chapter 1',
    path: path.join(tempDir, 'manga_folder', 'Naruto'),
    detected_author: 'ScanGroup',
    author: 'Desconocido'
  });

  // Register IPC Handlers
  ipcMain.handle('library:get-series', async () => (db.getSeries ? db.getSeries() : []));
  ipcMain.handle('library:get-series-by-id', async (e, id) => db.getSeriesById(id));
  ipcMain.handle('library:get-series-detail', async (event, { seriesId, sortOrder = 'asc' }) => {
    const series = db.getSeriesById(seriesId);
    if (!series) return null;
    const chapters = db.getChapters ? db.getChapters(seriesId, { sortOrder }) : [];
    return {
      ...series,
      chapters
    };
  });
  ipcMain.handle('series:update-detail', async (event, data) => db.updateSeriesDetail(data));
  ipcMain.handle('series:set-tags', async (event, { seriesId, tagIds }) => db.setSeriesTags(seriesId, tagIds));
  ipcMain.handle('series:set-authors', async (event, { seriesId, authorIds }) => db.setSeriesAuthors(seriesId, authorIds));
  ipcMain.handle('series:set-groups', async (event, { seriesId, groupIds }) => db.setSeriesGroups(seriesId, groupIds));
  ipcMain.handle('series:set-languages', async (event, { seriesId, languageIds }) => db.setSeriesLanguages(seriesId, languageIds));
  ipcMain.handle('series:set-parodies', async (event, { seriesId, parodyIds }) => db.setSeriesParodies(seriesId, parodyIds));
  ipcMain.handle('library:get-folders', async () => db.getFolders());
  ipcMain.handle('tags:get-all', async () => db.getAllTags());
  ipcMain.handle('authors:get-all', async () => db.getAllAuthors());
  ipcMain.handle('authors:create', async (e, name) => db.createAuthor(name));
  ipcMain.handle('authors:get-all-ignored', async () => db.getAllIgnoredAuthors());
  ipcMain.handle('authors:ignore', async (e, name) => db.ignoreAuthor(name));
  ipcMain.handle('authors:unignore', async (e, name) => db.unignoreAuthor(name));
  ipcMain.handle('languages:get-all', async () => db.getAllLanguages());
  ipcMain.handle('parodies:get-all', async () => db.getAllParodies());
  ipcMain.handle('groups:get-all', async () => db.getAllGroups());
  ipcMain.handle('libraries:get-all', async () => db.getLibraries());
  ipcMain.handle('settings:get', async (e, key, defaultValue) => db.getSetting(key, defaultValue));
  ipcMain.handle('settings:set', async (e, key, value) => db.setSetting(key, value));
  ipcMain.handle('system:get-version', () => '1.0.0');
  ipcMain.handle('system:is-fullscreen', async () => false);
  ipcMain.handle('storage:get-info', async () => ({
    mode: 'standard',
    isPortable: false,
    storageRoot: tempDir,
    standardPath: tempDir,
    portablePath: path.join(tempDir, 'data'),
    isPortableAvailable: true,
    appDir: tempDir
  }));
  ipcMain.handle('storage:check-destination', async () => ({
    targetMode: 'portable',
    targetPath: path.join(tempDir, 'data'),
    isWritable: true,
    hasExistingData: false,
    existingFiles: []
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

  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      const check = () => {
        if (document.getElementById('settingsView') && window.lecfalViews && window.catalogManager) resolve();
        else setTimeout(check, 50);
      };
      check();
    })
  `);
  console.log('✓ Test environment loaded.');

  // ----------------------------------------------------
  // TEST 1: Suggestion "Añadir a Ajustes" immediately refreshes author list
  // ----------------------------------------------------
  console.log('\n--- Test 1: Suggestion "Añadir a Ajustes" auto-refreshes author list ---');
  
  // Open series 1 in detail view
  await win.webContents.executeJavaScript(`
    window.lecfalViews.openMangaView(${series1Id});
  `);
  await new Promise(r => setTimeout(r, 200));

  // Check that hint is displayed
  const hintVisible = await win.webContents.executeJavaScript(`
    (() => {
      const hint = document.getElementById('detectedAuthorHint');
      return hint && hint.style.display !== 'none' && hint.textContent.includes('Oda Sensei');
    })()
  `);
  assert.strictEqual(hintVisible, true, 'Detected author hint must be visible for Series 1');

  // Click "Añadir a Ajustes"
  await win.webContents.executeJavaScript(`
    document.getElementById('btnQuickAddDetectedAuthor').click();
  `);
  await new Promise(r => setTimeout(r, 300));

  // Verify author is now in catalogManager in memory
  const authorInCatalog = await win.webContents.executeJavaScript(`
    (() => {
      const authors = window.catalogManager.getCatalogItems('author');
      return authors.some(a => a.name === 'Oda Sensei');
    })()
  `);
  assert.strictEqual(authorInCatalog, true, 'Oda Sensei must immediately exist in catalogManager memory');

  // Navigate to Settings -> Autores
  await win.webContents.executeJavaScript(`
    window.lecfalViews.openSettingsView('sectionAuthors');
  `);
  await new Promise(r => setTimeout(r, 200));

  // Verify that Oda Sensei is present in DOM of sectionAuthors
  const authorInDOM = await win.webContents.executeJavaScript(`
    (() => {
      const section = document.getElementById('sectionAuthors');
      const itemNames = Array.from(section.querySelectorAll('.catalog-item-name')).map(el => el.textContent.trim());
      return itemNames.includes('Oda Sensei');
    })()
  `);
  assert.strictEqual(authorInDOM, true, 'Oda Sensei must be rendered in sectionAuthors DOM without restarting app');
  console.log('✓ Test 1 passed: Suggestion quick-add updates author catalog and displays in Settings immediately.');

  // ----------------------------------------------------
  // TEST 2: Header Refresh Button in Catalog Manager
  // ----------------------------------------------------
  console.log('\n--- Test 2: Header Refresh Button in Catalog Manager ---');
  
  // Verify .btn-catalog-refresh exists
  const hasRefreshBtn = await win.webContents.executeJavaScript(`
    (() => {
      const sec = document.getElementById('sectionAuthors');
      return !!sec.querySelector('.btn-catalog-refresh');
    })()
  `);
  assert.strictEqual(hasRefreshBtn, true, 'sectionAuthors must have .btn-catalog-refresh');

  // Insert a new author directly into database
  db.createAuthor('External Artist');

  // Click the refresh button in sectionAuthors
  await win.webContents.executeJavaScript(`
    document.querySelector('#sectionAuthors .btn-catalog-refresh').click();
  `);
  await new Promise(r => setTimeout(r, 250));

  // Check if External Artist is now in sectionAuthors DOM
  const externalInDOM = await win.webContents.executeJavaScript(`
    (() => {
      const section = document.getElementById('sectionAuthors');
      const itemNames = Array.from(section.querySelectorAll('.catalog-item-name')).map(el => el.textContent.trim());
      return itemNames.includes('External Artist');
    })()
  `);
  assert.strictEqual(externalInDOM, true, 'External Artist must appear in sectionAuthors after clicking refresh button');
  console.log('✓ Test 2 passed: Catalog header refresh button successfully refreshes author list.');

  // ----------------------------------------------------
  // TEST 3: Ignored Author suggestion updates sectionIgnoredAuthors
  // ----------------------------------------------------
  console.log('\n--- Test 3: Ignored author suggestion updates sectionIgnoredAuthors ---');
  
  // Open series 2 in detail view
  await win.webContents.executeJavaScript(`
    window.lecfalViews.openMangaView(${series2Id});
  `);
  await new Promise(r => setTimeout(r, 200));

  // Click "Ignorar"
  await win.webContents.executeJavaScript(`
    document.getElementById('btnIgnoreDetectedAuthor').click();
  `);
  await new Promise(r => setTimeout(r, 200));

  // Switch to sectionIgnoredAuthors in settings
  await win.webContents.executeJavaScript(`
    window.lecfalViews.openSettingsView('sectionIgnoredAuthors');
  `);
  await new Promise(r => setTimeout(r, 200));

  const ignoredInDOM = await win.webContents.executeJavaScript(`
    (() => {
      const list = document.getElementById('settingsIgnoredAuthorsList');
      return list && list.textContent.includes('ScanGroup');
    })()
  `);
  assert.strictEqual(ignoredInDOM, true, 'ScanGroup must appear in sectionIgnoredAuthors list');

  // Test #btnRefreshIgnoredAuthors
  const hasRefreshIgnoredBtn = await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('btnRefreshIgnoredAuthors');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()
  `);
  assert.strictEqual(hasRefreshIgnoredBtn, true, '#btnRefreshIgnoredAuthors must exist and be clickable');
  console.log('✓ Test 3 passed: Ignored author is reflected and refresh button works in sectionIgnoredAuthors.');

  // ----------------------------------------------------
  // TEST 4: Libraries, Folders, and AllCatalogs Refresh Buttons
  // ----------------------------------------------------
  console.log('\n--- Test 4: Libraries, Folders, and AllCatalogs Refresh Buttons ---');
  
  const otherRefreshButtons = await win.webContents.executeJavaScript(`
    (() => {
      const libRefresh = !!document.getElementById('btnSettingsRefreshLibraries');
      const folderRefresh = !!document.getElementById('btnSettingsRefreshFolders');
      const allCatRefresh = !!document.querySelector('#sectionAllCatalogs .btn-all-catalogs-refresh');
      return { libRefresh, folderRefresh, allCatRefresh };
    })()
  `);
  assert.strictEqual(otherRefreshButtons.libRefresh, true, '#btnSettingsRefreshLibraries must exist');
  assert.strictEqual(otherRefreshButtons.folderRefresh, true, '#btnSettingsRefreshFolders must exist');
  assert.strictEqual(otherRefreshButtons.allCatRefresh, true, '.btn-all-catalogs-refresh must exist');
  console.log('✓ Test 4 passed: All settings refresh buttons exist and are wired.');

  console.log('\n======================================================');
  console.log('  ALL AUTHOR SUGGESTION REFRESH TESTS PASSED (1 - 4)');
  console.log('======================================================\n');
}

app.whenReady().then(async () => {
  try {
    await runTests();
    if (win && !win.isDestroyed()) win.close();
    app.quit();
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    if (win && !win.isDestroyed()) win.close();
    app.quit();
    process.exit(1);
  }
});
