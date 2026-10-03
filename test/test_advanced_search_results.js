/**
 * Test Suite: Advanced Search Result Rendering & Stale Response Protection
 *
 * Verifies the bug fix for Advanced Search result rendering:
 * A. Successful search -> Successful search: Search A results cleanly replaced by Search B.
 * B. Successful search -> Zero results: Previous cards completely cleared from DOM,
 *    empty state shown, comicsGrid hidden (never rendered below previous cards).
 * C. Zero results -> Successful search: Empty state hidden, new results rendered cleanly.
 * D. Rapid searches: Stale asynchronous response A resolving after B cannot overwrite B.
 * E. Existing filters: Advanced Search, Library scope, Favorites, sorting, and virtualizer preserved.
 */

const { app, BrowserWindow, protocol, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const url = require('url');
const DatabaseManager = require('../src/db');
const storage = require('../src/storage');

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

async function runTests() {
  console.log('======================================================');
  console.log('  TEST: ADVANCED SEARCH RESULT RENDERING & RACE GUARD');
  console.log('======================================================');

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_adv_results_'));
  storage.init({ dataRoot: tempDir });

  protocol.handle('lecfal-cover', () => new Response('Not found', { status: 404 }));
  protocol.handle('lecfal-file', () => new Response('Not found', { status: 404 }));

  const dbPath = path.join(tempDir, 'test_adv_results.db');
  db = new DatabaseManager(dbPath);
  await db.init();

  // Setup Libraries, Folders, Tags, Authors
  const mangaLib = db.createLibrary('Manga');
  const folder = db.addFolder(path.join(tempDir, 'manga_folder'), mangaLib.id);

  const tagAction = db.createTag('Action');
  const tagDrama = db.createTag('Drama');
  const tagComedy = db.createTag('Comedy');

  const authorKishi = db.createAuthor('Kishimoto');
  const authorKubo = db.createAuthor('Kubo');
  const authorOda = db.createAuthor('Oda');

  // Series 1: Naruto (Action, Kishimoto, Fav=1)
  const s1Id = db.upsertSeries({
    folder_id: folder.id,
    folder_name: 'Naruto',
    title: 'Naruto',
    author: 'Kishimoto',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_folder', 'Naruto')
  });
  db.toggleSeriesFavorite(s1Id);
  db.setSeriesTags(s1Id, [tagAction.id]);
  db.setSeriesAuthors(s1Id, [authorKishi.id]);

  // Series 2: Bleach (Drama, Kubo, Fav=0)
  const s2Id = db.upsertSeries({
    folder_id: folder.id,
    folder_name: 'Bleach',
    title: 'Bleach',
    author: 'Kubo',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_folder', 'Bleach')
  });
  db.setSeriesTags(s2Id, [tagDrama.id]);
  db.setSeriesAuthors(s2Id, [authorKubo.id]);

  // Series 3: One Piece (Comedy, Oda, Fav=1)
  const s3Id = db.upsertSeries({
    folder_id: folder.id,
    folder_name: 'One Piece',
    title: 'One Piece',
    author: 'Oda',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_folder', 'One Piece')
  });
  db.toggleSeriesFavorite(s3Id);
  db.setSeriesTags(s3Id, [tagComedy.id]);
  db.setSeriesAuthors(s3Id, [authorOda.id]);

  // Setup IPC Handlers
  ipcMain.handle('library:get-series', async (event, filters) => db.getSeriesList(filters));
  ipcMain.handle('library:get-folders', async () => db.getFolders());
  ipcMain.handle('library:toggle-series-fav', async (event, seriesId) => db.toggleSeriesFavorite(seriesId));
  ipcMain.handle('tags:get-all', async () => db.getAllTags());
  ipcMain.handle('authors:get-all', async () => db.getAllAuthors());
  ipcMain.handle('languages:get-all', async () => db.getAllLanguages());
  ipcMain.handle('parodies:get-all', async () => db.getAllParodies());
  ipcMain.handle('groups:get-all', async () => db.getAllGroups());
  ipcMain.handle('libraries:get-all', async () => db.getLibraries());
  ipcMain.handle('libraries:get-by-id', async (event, id) => db.getLibraryById(id));
  ipcMain.handle('settings:get', async (event, key, defaultValue) => db.getSetting(key, defaultValue));
  ipcMain.handle('settings:set', async (event, key, value) => db.setSetting(key, value));
  ipcMain.handle('system:get-logs', async () => []);
  ipcMain.handle('system:get-version', () => '1.0.0');
  ipcMain.handle('system:is-fullscreen', async () => false);

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../src/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on('console-message', (e, level, message) => {
    console.log('[Renderer Console]', message);
  });

  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  win.show();

  // Wait for initial render
  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      const check = () => {
        const cards = document.querySelectorAll('.comic-card');
        if (cards.length === 3) resolve();
        else setTimeout(check, 50);
      };
      check();
    })
  `);
  console.log('✓ Initial window loaded with 3 series.');

  // ----------------------------------------------------
  // TEST A: Successful search -> Successful search
  // ----------------------------------------------------
  console.log('\n--- Test A: Successful Search -> Successful Search ---');
  const testAResult = await win.webContents.executeJavaScript(`
    (async () => {
      const searchInput = document.getElementById('searchInput');
      const emptyNoResults = document.getElementById('emptyStateNoResults');
      const comicsGrid = document.getElementById('comicsGrid');

      // 1. Search A: "Naruto"
      searchInput.value = 'Naruto';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));

      const cardsA = Array.from(document.querySelectorAll('.comic-card'));
      const titlesA = cardsA.map(c => c.querySelector('.card-title')?.textContent.trim());

      // 2. Search B: "Bleach"
      searchInput.value = 'Bleach';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));

      const cardsB = Array.from(document.querySelectorAll('.comic-card'));
      const titlesB = cardsB.map(c => c.querySelector('.card-title')?.textContent.trim());

      const emptyHidden = getComputedStyle(emptyNoResults).display === 'none';
      const gridVisible = getComputedStyle(comicsGrid).display !== 'none';

      return {
        titlesA,
        titlesB,
        emptyHidden,
        gridVisible
      };
    })()
  `);

  assert.deepStrictEqual(testAResult.titlesA, ['Naruto'], 'Search A must show Naruto');
  assert.deepStrictEqual(testAResult.titlesB, ['Bleach'], 'Search B must show Bleach only (Naruto removed)');
  assert.strictEqual(testAResult.emptyHidden, true, 'Empty state must be hidden');
  assert.strictEqual(testAResult.gridVisible, true, 'Grid must be visible');
  console.log('✓ Test A passed: Search B cleanly replaces Search A results.');

  // ----------------------------------------------------
  // TEST B: Successful search -> Zero results
  // ----------------------------------------------------
  console.log('\n--- Test B: Successful Search -> Zero Results ---');
  const testBResult = await win.webContents.executeJavaScript(`
    (async () => {
      const searchInput = document.getElementById('searchInput');
      const emptyNoResults = document.getElementById('emptyStateNoResults');
      const comicsGrid = document.getElementById('comicsGrid');

      // Search for non-existent title
      searchInput.value = 'ZZZ_NON_EXISTENT_SERIES_999';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));

      const mountedCards = document.querySelectorAll('.comic-card').length;
      const emptyVisible = getComputedStyle(emptyNoResults).display !== 'none';
      const gridHidden = getComputedStyle(comicsGrid).display === 'none';
      const gridStyleHidden = comicsGrid.style.display === 'none';
      const gridHasHiddenClass = comicsGrid.classList.contains('hidden');

      return {
        mountedCards,
        emptyVisible,
        gridHidden,
        gridStyleHidden,
        gridHasHiddenClass
      };
    })()
  `);

  assert.strictEqual(testBResult.mountedCards, 0, 'Must have 0 mounted cards on zero results');
  assert.strictEqual(testBResult.emptyVisible, true, 'Empty/no-results state must be visible');
  assert.strictEqual(testBResult.gridHidden, true, 'Computed display of comicsGrid must be "none"');
  assert.strictEqual(testBResult.gridStyleHidden, true, 'Inline style display of comicsGrid must be "none"');
  console.log('✓ Test B passed: Zero results clears all previous cards and exclusively displays empty state.');

  // ----------------------------------------------------
  // TEST C: Zero results -> Successful search
  // ----------------------------------------------------
  console.log('\n--- Test C: Zero Results -> Successful Search ---');
  const testCResult = await win.webContents.executeJavaScript(`
    (async () => {
      const searchInput = document.getElementById('searchInput');
      const emptyNoResults = document.getElementById('emptyStateNoResults');
      const comicsGrid = document.getElementById('comicsGrid');

      // Search for "One Piece"
      searchInput.value = 'One Piece';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));

      const cards = Array.from(document.querySelectorAll('.comic-card'));
      const titles = cards.map(c => c.querySelector('.card-title')?.textContent.trim());
      const emptyHidden = getComputedStyle(emptyNoResults).display === 'none';
      const gridVisible = getComputedStyle(comicsGrid).display !== 'none';

      return {
        titles,
        emptyHidden,
        gridVisible
      };
    })()
  `);

  assert.deepStrictEqual(testCResult.titles, ['One Piece'], 'Shows One Piece after zero-result search');
  assert.strictEqual(testCResult.emptyHidden, true, 'Empty state is hidden on successful search');
  assert.strictEqual(testCResult.gridVisible, true, 'Grid is visible on successful search');
  console.log('✓ Test C passed: Transition from zero-results to successful search renders correctly.');

  // ----------------------------------------------------
  // TEST D: Rapid Searches (Stale Async Response Protection)
  // ----------------------------------------------------
  console.log('\n--- Test D: Rapid Searches & Stale Response Guard ---');

  let slowResolve;
  const slowPromise = new Promise(resolve => { slowResolve = resolve; });

  ipcMain.removeHandler('library:get-series');
  ipcMain.handle('library:get-series', async (event, filters) => {
    if (filters.searchQuery === 'Lagged') {
      await slowPromise;
      return [{ id: 999, title: 'Lagged Old Result', primary_format: 'cbz', chapter_count: 1 }];
    }
    if (filters.searchQuery === 'Fast') {
      return [{ id: 888, title: 'Fast New Result', primary_format: 'cbz', chapter_count: 1 }];
    }
    return db.getSeriesList(filters);
  });

  // 1. Launch slow query "Lagged" (Search A) without awaiting it in executeJavaScript
  await win.webContents.executeJavaScript(`
    window.setSearchQuery('Lagged');
    window.__pSlow = window.refreshSeries();
    undefined;
  `);

  // Small delay to ensure slow request was dispatched to IPC
  await new Promise(r => setTimeout(r, 50));

  // 2. Launch fast query "Fast" (Search B) before slow query finishes and wait for it
  await win.webContents.executeJavaScript(`
    window.setSearchQuery('Fast');
    window.refreshSeries();
  `);

  // 3. Now let slow query A resolve AFTER fast query B has finished
  slowResolve();
  await win.webContents.executeJavaScript(`window.__pSlow`);
  await new Promise(r => setTimeout(r, 100));

  // Inspect the final UI
  const testDResult = await win.webContents.executeJavaScript(`
    (() => {
      const cards = Array.from(document.querySelectorAll('.comic-card'));
      const titles = cards.map(c => c.querySelector('.card-title')?.textContent.trim());
      return {
        titles,
        seriesListCount: window.seriesList ? window.seriesList.length : 0
      };
    })()
  `);

  // Restore normal IPC handler for subsequent tests
  ipcMain.removeHandler('library:get-series');
  ipcMain.handle('library:get-series', async (event, filters) => db.getSeriesList(filters));

  console.log('testDResult:', testDResult);
  assert.deepStrictEqual(testDResult.titles, ['Fast New Result'], 'Stale lagged response must NOT overwrite newer fast response');
  assert.strictEqual(testDResult.seriesListCount, 1);
  console.log('✓ Test D passed: Stale async response dropped cleanly by request generation ID.');

  // ----------------------------------------------------
  // ----------------------------------------------------
  // TEST E: Existing Filters Preservation (Advanced Search + Library + Favorites + Sorting + Virtualization)
  // ----------------------------------------------------
  console.log('\n--- Test E: Existing Filters Preservation ---');
  const testEResult = await win.webContents.executeJavaScript(`
    (async () => {
      const searchInput = document.getElementById('searchInput');
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));

      // 1. Advanced Search exact bug flow:
      // Search 1: Title "Naruto" via Advanced Search
      const advInputTitle = document.getElementById('advInputTitle');
      const btnApplyAdvSearch = document.getElementById('btnApplyAdvSearch');
      const btnClearAdvSearch = document.getElementById('btnClearAdvSearch');
      const emptyNoResults = document.getElementById('emptyStateNoResults');
      const comicsGrid = document.getElementById('comicsGrid');

      advInputTitle.value = 'Naruto';
      btnApplyAdvSearch.click();
      await new Promise(r => setTimeout(r, 400));
      const advTitles1 = Array.from(document.querySelectorAll('.comic-card')).map(c => c.querySelector('.card-title')?.textContent.trim());

      // Search 2: Change filter to "NonExistent" without pressing "Clear filters"
      advInputTitle.value = 'NonExistentTitleWithoutClearing';
      btnApplyAdvSearch.click();
      await new Promise(r => setTimeout(r, 400));
      const advCards2Count = document.querySelectorAll('.comic-card').length;
      const advEmpty2Visible = getComputedStyle(emptyNoResults).display !== 'none';
      const advGrid2Hidden = getComputedStyle(comicsGrid).display === 'none';

      // Search 3: Change filter back to "Bleach"
      advInputTitle.value = 'Bleach';
      btnApplyAdvSearch.click();
      await new Promise(r => setTimeout(r, 400));
      const advTitles3 = Array.from(document.querySelectorAll('.comic-card')).map(c => c.querySelector('.card-title')?.textContent.trim());

      // Clear Advanced Search
      btnClearAdvSearch.click();
      await new Promise(r => setTimeout(r, 300));

      // 2. Sorting: Change sort to title_desc
      const sortSelect = document.getElementById('sortSelect');
      sortSelect.value = 'title_desc';
      sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const sortedDescTitles = Array.from(document.querySelectorAll('.comic-card')).map(c => c.querySelector('.card-title')?.textContent.trim());

      // Reset sort to title_asc
      sortSelect.value = 'title_asc';
      sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));

      // 3. Toggle Favorites ON
      const btnFav = document.getElementById('btnFilterFavorite');
      if (btnFav) {
        btnFav.click();
        await new Promise(r => setTimeout(r, 400));
      }

      const favCards = Array.from(document.querySelectorAll('.comic-card')).map(c => c.querySelector('.card-title')?.textContent.trim()).sort();

      // 4. Select Library "Manga"
      await window.selectLibrary(${mangaLib.id});
      await new Promise(r => setTimeout(r, 400));

      const mangaFavCards = Array.from(document.querySelectorAll('.comic-card')).map(c => c.querySelector('.card-title')?.textContent.trim()).sort();

      // 5. Turn off Favorites
      if (btnFav) {
        btnFav.click();
        await new Promise(r => setTimeout(r, 400));
      }

      const allMangaCards = Array.from(document.querySelectorAll('.comic-card')).map(c => c.querySelector('.card-title')?.textContent.trim()).sort();

      // 6. Grid Virtualization Check
      const virtualizer = window.getGridVirtualizer ? window.getGridVirtualizer() : null;
      const isVirtualized = comicsGrid.classList.contains('is-virtualized');

      return {
        advTitles1,
        advCards2Count,
        advEmpty2Visible,
        advGrid2Hidden,
        advTitles3,
        sortedDescTitles,
        favCards,
        mangaFavCards,
        allMangaCards,
        hasVirtualizer: !!virtualizer,
        isVirtualized
      };
    })()
  `);

  assert.deepStrictEqual(testEResult.advTitles1, ['Naruto'], 'Advanced search 1 yields Naruto');
  assert.strictEqual(testEResult.advCards2Count, 0, 'Advanced search 2 (no results) yields 0 cards');
  assert.strictEqual(testEResult.advEmpty2Visible, true, 'Empty state visible for Advanced Search with no results');
  assert.strictEqual(testEResult.advGrid2Hidden, true, 'Grid hidden for Advanced Search with no results');
  assert.deepStrictEqual(testEResult.advTitles3, ['Bleach'], 'Advanced search 3 yields Bleach');
  assert.deepStrictEqual(testEResult.sortedDescTitles, ['One Piece', 'Naruto', 'Bleach'], 'title_desc sorting works correctly');
  assert.deepStrictEqual(testEResult.favCards, ['Naruto', 'One Piece'], 'Favorites filter yields Naruto and One Piece');
  assert.deepStrictEqual(testEResult.mangaFavCards, ['Naruto', 'One Piece'], 'Manga + Favorites yields Naruto and One Piece');
  assert.deepStrictEqual(testEResult.allMangaCards, ['Bleach', 'Naruto', 'One Piece'], 'All Manga yields Bleach, Naruto, One Piece');
  assert.strictEqual(testEResult.hasVirtualizer, true, 'Virtualizer instance is present');
  assert.strictEqual(testEResult.isVirtualized, true, 'Grid has is-virtualized class');
  console.log('✓ Test E passed: Advanced search UI, sorting, virtualization, Library, and Favorites preserved.');

  console.log('\n======================================================');
  console.log('  ALL ADVANCED SEARCH RESULT RENDERING TESTS PASSED');
  console.log('======================================================');

  win.close();
  app.quit();
}

app.whenReady().then(runTests).catch(err => {
  console.error('Test failed with error:', err);
  if (win) win.close();
  app.exit(1);
});
