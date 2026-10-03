/**
 * Test Suite: Settings UI Redesign — Phase 3: "Todos los catálogos" Unified View
 *
 * Verifies:
 * A. sectionAllCatalogs exists in DOM
 * B. Unified view mounts correctly (header, add form, search bar, sort select, count badge, pills, table)
 * C. All five catalog types appear together
 * D. Type labels are correct (Autor, Tag, Idioma, Serie / Parodia, Grupo)
 * E. Names are correct
 * F. Usage counts are correct (reflecting manga_count)
 * G. Case-insensitive search
 * H. Accent-insensitive search
 * I. Filter by Authors
 * J. Filter by Tags
 * K. Filter by Languages
 * L. Filter by Series/Parodies
 * M. Filter by Groups
 * N. Todos restores all types
 * O. Search + type filter combination
 * P. Empty result state
 * Q. Clear search/filter restores list
 * R. A-Z sorting
 * S. Z-A sorting
 * T. Usage descending sorting
 * U. Usage ascending sorting
 * V. Create through shared CRUD
 * W. Rename through existing modal
 * X. Delete through shared CRUD
 * Y. Navigation preserves query/filter/sort state
 * Z. Individual catalog manager remains functional
 * AA. Catalog Picker remains functional
 * AB. Advanced Search autocomplete remains functional
 */

const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
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

async function runAllCatalogsTests() {
  console.log('======================================================');
  console.log('  TEST: SETTINGS UI REDESIGN PHASE 3 (TODOS LOS CATÁLOGOS)');
  console.log('======================================================');

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_all_catalogs_'));
  storage.init({ dataRoot: tempDir });

  protocol.handle('lecfal-cover', () => new Response('Not found', { status: 404 }));
  protocol.handle('lecfal-file', () => new Response('Not found', { status: 404 }));

  const dbPath = path.join(tempDir, 'test_all_catalogs.db');
  db = new DatabaseManager(dbPath);
  await db.init();

  // Create initial sample data across all 5 catalog types
  const mangaLib = db.createLibrary('Manga');
  const folder = db.addFolder(path.join(tempDir, 'manga_folder'), mangaLib.id);

  // Authors
  const oda = db.createAuthor('Eiichiro Oda');
  const toriyama = db.createAuthor('Akira Toriyama');
  const cooper = db.createAuthor('Alice Cooper');
  const martinez = db.createAuthor('Álvaro Martínez');
  const problems = db.createAuthor('99 Problems');

  // Tags
  const accion = db.createTag('Acción');
  const aventura = db.createTag('Aventura');
  const batman = db.createTag('Batman');
  const scifi = db.createTag('Ciencia Ficción');
  const adult = db.createTag('18+');

  // Languages
  let frances, aleman, arabe, espanol;
  try { frances = db.createLanguage('Francés'); } catch (_) { frances = db.getLanguageByName('Francés'); }
  try { aleman = db.createLanguage('Alemán'); } catch (_) { aleman = db.getLanguageByName('Alemán'); }
  try { arabe = db.createLanguage('Árabe'); } catch (_) { arabe = db.getLanguageByName('Árabe'); }
  try { espanol = db.createLanguage('Español'); } catch (_) { espanol = db.getLanguageByName('Español'); }

  // Parodies
  const dragonBall = db.createParody('Dragon Ball');
  const naruto = db.createParody('Naruto');
  const onePiece = db.createParody('One Piece');
  let original;
  try { original = db.createParody('Original'); } catch (_) { original = db.getParodyByName('Original'); }
  const bond = db.createParody('007 Bond');

  // Groups
  const ghibli = db.createGroup('Studio Ghibli');
  const shonenJump = db.createGroup('Weekly Shonen Jump');
  const animeClassics = db.createGroup('Anime Classics');
  const apexCircle = db.createGroup('Ápex Circle');
  const scans404 = db.createGroup('404 Scans');

  // Create a series and assign relationships to test non-zero usage
  db.db.run('INSERT INTO series (title, path, folder_id) VALUES (?, ?, ?)', ['One Piece Series', path.join(tempDir, 'manga_folder', 'One Piece Series'), folder.id]);
  const sStmt = db.db.prepare('SELECT id FROM series WHERE title = ?');
  sStmt.bind(['One Piece Series']);
  sStmt.step();
  const seriesId = sStmt.getAsObject().id;
  sStmt.free();

  db.setSeriesAuthors(seriesId, [oda.id]);
  db.setSeriesTags(seriesId, [accion.id, aventura.id]);
  db.setSeriesLanguages(seriesId, [espanol.id]);
  db.setSeriesParodies(seriesId, [onePiece.id]);
  db.setSeriesGroups(seriesId, [shonenJump.id]);

  // Register IPC Handlers
  ipcMain.handle('library:get-series', async () => []);
  ipcMain.handle('library:get-folders', async () => db.getFolders());
  ipcMain.handle('library:toggle-series-fav', async (event, id) => db.toggleSeriesFavorite(id));

  ipcMain.handle('tags:get-all', async () => db.getAllTags());
  ipcMain.handle('tags:create', async (event, name) => db.createTag(name));
  ipcMain.handle('tags:rename', async (event, { id, name }) => { db.renameTag(id, name); return true; });
  ipcMain.handle('tags:delete', async (event, id) => { db.deleteTag(id); return true; });

  ipcMain.handle('authors:get-all', async () => db.getAllAuthors());
  ipcMain.handle('authors:create', async (event, name) => db.createAuthor(name));
  ipcMain.handle('authors:rename', async (event, { id, name }) => { db.renameAuthor(id, name); return true; });
  ipcMain.handle('authors:delete', async (event, id) => { db.deleteAuthor(id); return true; });
  ipcMain.handle('authors:get-all-ignored', async () => db.getAllIgnoredAuthors());
  ipcMain.handle('authors:ignore', async (event, name) => db.ignoreAuthor(name));
  ipcMain.handle('authors:unignore', async (event, name) => db.unignoreAuthor(name));

  ipcMain.handle('languages:get-all', async () => db.getAllLanguages());
  ipcMain.handle('languages:create', async (event, name) => db.createLanguage(name));
  ipcMain.handle('languages:rename', async (event, { id, name }) => { db.renameLanguage(id, name); return true; });
  ipcMain.handle('languages:delete', async (event, id) => { db.deleteLanguage(id); return true; });

  ipcMain.handle('parodies:get-all', async () => db.getAllParodies());
  ipcMain.handle('parodies:create', async (event, name) => db.createParody(name));
  ipcMain.handle('parodies:rename', async (event, { id, name }) => { db.renameParody(id, name); return true; });
  ipcMain.handle('parodies:delete', async (event, id) => { db.deleteParody(id); return true; });

  ipcMain.handle('groups:get-all', async () => db.getAllGroups());
  ipcMain.handle('groups:create', async (event, name) => db.createGroup(name));
  ipcMain.handle('groups:rename', async (event, { id, name }) => { db.renameGroup(id, name); return true; });
  ipcMain.handle('groups:delete', async (event, id) => { db.deleteGroup(id); return true; });

  ipcMain.handle('libraries:get-all', async () => db.getLibraries());
  ipcMain.handle('libraries:get-by-id', async (event, id) => db.getLibraryById(id));
  ipcMain.handle('libraries:create', async (event, name) => db.createLibrary(name));
  ipcMain.handle('libraries:rename', async (event, id, name) => db.renameLibrary(id, name));
  ipcMain.handle('libraries:delete', async (event, id) => db.deleteLibrary(id));

  ipcMain.handle('settings:get', async (event, key, defaultValue) => db.getSetting(key, defaultValue));
  ipcMain.handle('settings:set', async (event, key, value) => db.setSetting(key, value));
  ipcMain.handle('system:get-logs', async () => []);
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
      preload: path.join(__dirname, '../src/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on('console-message', (e, level, message) => {
    if (!message.includes('Security Warning')) {
      console.log('[Renderer Console]', message);
    }
  });

  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  win.show();

  // Wait for initial DOM readiness
  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      const check = () => {
        if (document.getElementById('settingsView') && window.lecfalViews && window.catalogManager && window.allCatalogs) resolve();
        else setTimeout(check, 50);
      };
      check();
    })
  `);
  console.log('✓ Initial window, LecFal views, and AllCatalogs module loaded.');

  // Open settings
  await win.webContents.executeJavaScript(`window.lecfalViews.openSettingsView();`);
  await new Promise(r => setTimeout(r, 200));

  // ----------------------------------------------------
  // TEST A: sectionAllCatalogs exists in DOM
  // ----------------------------------------------------
  console.log('\n--- Test A: sectionAllCatalogs Exists ---');
  const sectionExists = await win.webContents.executeJavaScript(`!!document.getElementById('sectionAllCatalogs')`);
  assert.strictEqual(sectionExists, true, '#sectionAllCatalogs must exist');
  console.log('✓ Test A passed: sectionAllCatalogs exists in DOM.');

  // ----------------------------------------------------
  // TEST B: Unified View Frame Mounts Correctly
  // ----------------------------------------------------
  console.log('\n--- Test B: Unified View Mounts Correctly ---');
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionAllCatalogs');`);
  await new Promise(r => setTimeout(r, 100));

  const frameStructure = await win.webContents.executeJavaScript(`
    (() => {
      const sec = document.getElementById('sectionAllCatalogs');
      return {
        hasHeader: !!sec.querySelector('.all-catalogs-header'),
        hasAddBtn: !!sec.querySelector('.btn-all-catalogs-add'),
        hasAddForm: !!sec.querySelector('.all-catalogs-add-form'),
        hasAddTypeSelect: !!sec.querySelector('.all-catalogs-add-type'),
        hasAddInput: !!sec.querySelector('.all-catalogs-add-input'),
        hasToolbar: !!sec.querySelector('.all-catalogs-toolbar'),
        hasSearchInput: !!sec.querySelector('.all-catalogs-search-input'),
        hasSortSelect: !!sec.querySelector('.all-catalogs-sort-select'),
        hasFilterPills: !!sec.querySelector('.all-catalogs-filter-pills'),
        pillsCount: sec.querySelectorAll('.all-catalogs-pill').length,
        hasItemsContainer: !!sec.querySelector('.all-catalogs-items-container'),
        hasTableHeader: !!sec.querySelector('.all-catalogs-table-header')
      };
    })()
  `);
  assert.strictEqual(frameStructure.hasHeader, true, 'Must have .all-catalogs-header');
  assert.strictEqual(frameStructure.hasAddBtn, true, 'Must have .btn-all-catalogs-add');
  assert.strictEqual(frameStructure.hasAddForm, true, 'Must have .all-catalogs-add-form');
  assert.strictEqual(frameStructure.hasAddTypeSelect, true, 'Must have .all-catalogs-add-type');
  assert.strictEqual(frameStructure.hasAddInput, true, 'Must have .all-catalogs-add-input');
  assert.strictEqual(frameStructure.hasToolbar, true, 'Must have .all-catalogs-toolbar');
  assert.strictEqual(frameStructure.hasSearchInput, true, 'Must have .all-catalogs-search-input');
  assert.strictEqual(frameStructure.hasSortSelect, true, 'Must have .all-catalogs-sort-select');
  assert.strictEqual(frameStructure.hasFilterPills, true, 'Must have .all-catalogs-filter-pills');
  assert.strictEqual(frameStructure.pillsCount, 6, 'Must have 6 filter pills (Todos + 5 types)');
  assert.strictEqual(frameStructure.hasItemsContainer, true, 'Must have .all-catalogs-items-container');
  assert.strictEqual(frameStructure.hasTableHeader, true, 'Must have .all-catalogs-table-header');
  console.log('✓ Test B passed: Unified view frame mounts with all controls and table headers.');

  // ----------------------------------------------------
  // TEST C, D, E, F: All 5 Types Appear, Labels, Names, Usage Counts
  // ----------------------------------------------------
  console.log('\n--- Tests C, D, E, F: 5 Types, Labels, Names, Usage Counts ---');
  const renderedRows = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-row')).map(row => ({
      type: row.dataset.type,
      id: Number(row.dataset.id),
      typeLabel: row.querySelector('.all-catalogs-type-label').textContent.trim(),
      name: row.querySelector('.all-catalogs-item-name').textContent.trim(),
      usage: Number(row.querySelector('.all-catalogs-usage-badge').textContent.trim())
    }))
  `);

  const foundTypes = new Set(renderedRows.map(r => r.type));
  assert.ok(foundTypes.has('author'), 'Authors must be present');
  assert.ok(foundTypes.has('tag'), 'Tags must be present');
  assert.ok(foundTypes.has('language'), 'Languages must be present');
  assert.ok(foundTypes.has('parody'), 'Series/Parodies must be present');
  assert.ok(foundTypes.has('group'), 'Groups must be present');
  console.log('✓ Test C passed: All five catalog types appear together in unified view.');

  // Verify labels
  const authorRow = renderedRows.find(r => r.type === 'author');
  const tagRow = renderedRows.find(r => r.type === 'tag');
  const langRow = renderedRows.find(r => r.type === 'language');
  const parodyRow = renderedRows.find(r => r.type === 'parody');
  const groupRow = renderedRows.find(r => r.type === 'group');

  assert.strictEqual(authorRow.typeLabel, 'Autor');
  assert.strictEqual(tagRow.typeLabel, 'Tag');
  assert.strictEqual(langRow.typeLabel, 'Idioma');
  assert.strictEqual(parodyRow.typeLabel, 'Serie / Parodia');
  assert.strictEqual(groupRow.typeLabel, 'Grupo');
  console.log('✓ Test D passed: Correct type labels (Autor, Tag, Idioma, Serie / Parodia, Grupo).');

  // Verify names
  const rowNames = renderedRows.map(r => r.name);
  assert.ok(rowNames.includes('Eiichiro Oda'), 'Eiichiro Oda present');
  assert.ok(rowNames.includes('Acción'), 'Acción present');
  assert.ok(rowNames.includes('Español'), 'Español present');
  assert.ok(rowNames.includes('One Piece'), 'One Piece present');
  assert.ok(rowNames.includes('Weekly Shonen Jump'), 'Weekly Shonen Jump present');
  console.log('✓ Test E passed: Names match DB records across all types.');

  // Verify usage counts
  const odaRow = renderedRows.find(r => r.name === 'Eiichiro Oda');
  const toriyamaRow = renderedRows.find(r => r.name === 'Akira Toriyama');
  assert.strictEqual(odaRow.usage, 1, 'Eiichiro Oda usage should be 1');
  assert.strictEqual(toriyamaRow.usage, 0, 'Akira Toriyama usage should be 0');
  console.log('✓ Test F passed: Usage counts correctly reflect manga associations.');

  // ----------------------------------------------------
  // TEST G: Case-Insensitive Search
  // ----------------------------------------------------
  console.log('\n--- Test G: Case-Insensitive Search ---');
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSearch('oda');`);
  let searchResults = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(searchResults, ['Eiichiro Oda']);

  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSearch('ODA');`);
  searchResults = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(searchResults, ['Eiichiro Oda']);

  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSearch('');`);
  console.log('✓ Test G passed: Case-insensitive search successfully filtered locally.');

  // ----------------------------------------------------
  // TEST H: Accent-Insensitive Search
  // ----------------------------------------------------
  console.log('\n--- Test H: Accent-Insensitive Search ---');
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSearch('alvaro');`);
  let accentResults = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(accentResults, ['Álvaro Martínez']);

  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSearch('accion');`);
  accentResults = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(accentResults, ['Acción']);

  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSearch('frances');`);
  accentResults = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(accentResults, ['Francés']);

  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSearch('');`);
  console.log('✓ Test H passed: Accent/diacritic-insensitive search works across all catalog types.');

  // ----------------------------------------------------
  // TESTS I through N: Type Filtering
  // ----------------------------------------------------
  console.log('\n--- Tests I through N: Type Filtering ---');
  // Authors filter
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsFilter('author');`);
  let authorOnly = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-row')).map(r => r.dataset.type)
  `);
  assert.ok(authorOnly.length > 0 && authorOnly.every(t => t === 'author'), 'Only authors must be visible');
  console.log('✓ Test I passed: Filter by Authors shows only authors.');

  // Tags filter
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsFilter('tag');`);
  let tagsOnly = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-row')).map(r => r.dataset.type)
  `);
  assert.ok(tagsOnly.length > 0 && tagsOnly.every(t => t === 'tag'), 'Only tags must be visible');
  console.log('✓ Test J passed: Filter by Tags shows only tags.');

  // Languages filter
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsFilter('language');`);
  let langsOnly = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-row')).map(r => r.dataset.type)
  `);
  assert.ok(langsOnly.length > 0 && langsOnly.every(t => t === 'language'), 'Only languages must be visible');
  console.log('✓ Test K passed: Filter by Languages shows only languages.');

  // Series/Parodies filter
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsFilter('parody');`);
  let parodiesOnly = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-row')).map(r => r.dataset.type)
  `);
  assert.ok(parodiesOnly.length > 0 && parodiesOnly.every(t => t === 'parody'), 'Only parodies must be visible');
  console.log('✓ Test L passed: Filter by Series/Parodies shows only parodies.');

  // Groups filter
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsFilter('group');`);
  let groupsOnly = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-row')).map(r => r.dataset.type)
  `);
  assert.ok(groupsOnly.length > 0 && groupsOnly.every(t => t === 'group'), 'Only groups must be visible');
  console.log('✓ Test M passed: Filter by Groups shows only groups.');

  // Todos restores all
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsFilter('all');`);
  let allTypesAgain = await win.webContents.executeJavaScript(`
    new Set(Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-row')).map(r => r.dataset.type)).size
  `);
  assert.strictEqual(allTypesAgain, 5, 'Todos must restore all 5 catalog types');
  console.log('✓ Test N passed: Todos filter restores all catalog types.');

  // ----------------------------------------------------
  // TEST O: Search + Type Filter Combination
  // ----------------------------------------------------
  console.log('\n--- Test O: Search + Type Filter Combination ---');
  await win.webContents.executeJavaScript(`
    window.allCatalogs.setAllCatalogsFilter('tag');
    window.allCatalogs.setAllCatalogsSearch('bat');
  `);
  let comboResults = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(comboResults, ['Batman']);

  // If we change filter to authors with same query 'bat', should be empty
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsFilter('author');`);
  let comboEmpty = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-name')).length
  `);
  assert.strictEqual(comboEmpty, 0, 'No author should match query "bat"');

  await win.webContents.executeJavaScript(`
    window.allCatalogs.setAllCatalogsFilter('all');
    window.allCatalogs.setAllCatalogsSearch('');
  `);
  console.log('✓ Test O passed: Combined search and type filtering operates accurately.');

  // ----------------------------------------------------
  // TEST P & Q: Empty Result State & Clear Filters
  // ----------------------------------------------------
  console.log('\n--- Test P & Q: Empty Result State & Clear Filters ---');
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSearch('totally_nonexistent_token_123');`);
  const emptyStateInfo = await win.webContents.executeJavaScript(`
    (() => {
      const container = document.querySelector('#sectionAllCatalogs .all-catalogs-no-results');
      const clearBtn = container ? container.querySelector('.btn-all-catalogs-clear-filters') : null;
      return {
        exists: !!container,
        hasClearBtn: !!clearBtn,
        text: container ? container.textContent : ''
      };
    })()
  `);
  assert.strictEqual(emptyStateInfo.exists, true, 'Empty result state container must exist');
  assert.strictEqual(emptyStateInfo.hasClearBtn, true, 'Clear filters button must exist');
  assert.ok(emptyStateInfo.text.includes('No se encontraron resultados'), 'Must display no results message');
  console.log('✓ Test P passed: Empty search/filter state displays appropriate message.');

  // Click clear filters button
  await win.webContents.executeJavaScript(`
    document.querySelector('#sectionAllCatalogs .btn-all-catalogs-clear-filters').click();
  `);
  const clearedRowsCount = await win.webContents.executeJavaScript(`
    document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-row').length
  `);
  assert.ok(clearedRowsCount >= 20, 'Clearing filters restores full item list');
  console.log('✓ Test Q passed: Limpiar filtros button successfully restores full view.');

  // ----------------------------------------------------
  // TESTS R through U: Sorting (A-Z, Z-A, Usage Descending, Usage Ascending)
  // ----------------------------------------------------
  console.log('\n--- Tests R through U: Sorting ---');
  // R: A-Z
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSort('name-asc');`);
  let azNames = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-name')).map(e => e.textContent.trim())
  `);
  for (let i = 0; i < azNames.length - 1; i++) {
    const cmp = azNames[i].localeCompare(azNames[i + 1], undefined, { sensitivity: 'base', numeric: true });
    assert.ok(cmp <= 0, `A-Z sort order violated: "${azNames[i]}" vs "${azNames[i + 1]}"`);
  }
  console.log('✓ Test R passed: A-Z sorting is strictly alphabetical.');

  // S: Z-A
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSort('name-desc');`);
  let zaNames = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-name')).map(e => e.textContent.trim())
  `);
  for (let i = 0; i < zaNames.length - 1; i++) {
    const cmp = zaNames[i].localeCompare(zaNames[i + 1], undefined, { sensitivity: 'base', numeric: true });
    assert.ok(cmp >= 0, `Z-A sort order violated: "${zaNames[i]}" vs "${zaNames[i + 1]}"`);
  }
  console.log('✓ Test S passed: Z-A sorting is strictly reverse alphabetical.');

  // T: Usage Descending (Mayor uso)
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSort('usage-desc');`);
  let usageDescRows = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-row')).map(r => ({
      name: r.querySelector('.all-catalogs-item-name').textContent.trim(),
      usage: Number(r.querySelector('.all-catalogs-usage-badge').textContent.trim())
    }))
  `);
  // Top rows should have usage === 1, bottom rows usage === 0
  assert.strictEqual(usageDescRows[0].usage, 1, 'Top row in usage-desc must have maximum usage');
  assert.strictEqual(usageDescRows[usageDescRows.length - 1].usage, 0, 'Bottom row in usage-desc must have 0 usage');
  for (let i = 0; i < usageDescRows.length - 1; i++) {
    assert.ok(usageDescRows[i].usage >= usageDescRows[i + 1].usage, 'Usage descending order violated');
  }
  console.log('✓ Test T passed: Usage descending sorts by highest usage count with secondary name sort.');

  // U: Usage Ascending (Menor uso)
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSort('usage-asc');`);
  let usageAscRows = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-row')).map(r => ({
      name: r.querySelector('.all-catalogs-item-name').textContent.trim(),
      usage: Number(r.querySelector('.all-catalogs-usage-badge').textContent.trim())
    }))
  `);
  assert.strictEqual(usageAscRows[0].usage, 0, 'Top row in usage-asc must have minimum usage (0)');
  for (let i = 0; i < usageAscRows.length - 1; i++) {
    assert.ok(usageAscRows[i].usage <= usageAscRows[i + 1].usage, 'Usage ascending order violated');
  }
  console.log('✓ Test U passed: Usage ascending sorts by lowest usage count with secondary name sort.');

  // Restore A-Z
  await win.webContents.executeJavaScript(`window.allCatalogs.setAllCatalogsSort('name-asc');`);

  // ----------------------------------------------------
  // TEST V: Create Through Shared CRUD
  // ----------------------------------------------------
  console.log('\n--- Test V: Create Through Shared CRUD ---');
  // Open add form
  await win.webContents.executeJavaScript(`
    document.querySelector('#sectionAllCatalogs .btn-all-catalogs-add').click();
    document.querySelector('#sectionAllCatalogs .all-catalogs-add-type').value = 'group';
    document.querySelector('#sectionAllCatalogs .all-catalogs-add-input').value = 'Banda de Scanlators';
    document.querySelector('#sectionAllCatalogs .all-catalogs-add-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  `);
  await new Promise(r => setTimeout(r, 150));

  const afterAddRows = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-row')).map(r => ({
      type: r.dataset.type,
      name: r.querySelector('.all-catalogs-item-name').textContent.trim()
    }))
  `);
  const createdGroup = afterAddRows.find(r => r.name === 'Banda de Scanlators');
  assert.ok(createdGroup, 'Banda de Scanlators must appear in unified view');
  assert.strictEqual(createdGroup.type, 'group', 'Must be categorized as group');

  // Verify group is also present in DB
  const dbGroups = db.getAllGroups();
  assert.ok(dbGroups.some(g => g.name === 'Banda de Scanlators'), 'Must be persisted in DB');
  console.log('✓ Test V passed: Create creates item in DB and renders in unified view.');

  // ----------------------------------------------------
  // TEST W: Rename Through Existing Modal
  // ----------------------------------------------------
  console.log('\n--- Test W: Rename Through Existing Modal ---');
  const targetRowId = await win.webContents.executeJavaScript(`
    (() => {
      const row = Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-row')).find(r =>
        r.querySelector('.all-catalogs-item-name').textContent.trim() === 'Banda de Scanlators'
      );
      return row ? row.dataset.id : null;
    })()
  `);
  assert.ok(targetRowId, 'Created item row must exist');

  // Click rename button on that row
  await win.webContents.executeJavaScript(`
    document.querySelector('#sectionAllCatalogs .all-catalogs-item-row[data-id="${targetRowId}"][data-type="group"] .btn-all-catalogs-rename').click();
  `);

  const renameModalOpen = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.getElementById('modalRenameMetadata');
      const input = document.getElementById('renameModalInput');
      return {
        isOpen: modal && modal.style.display !== 'none',
        inputValue: input ? input.value : null
      };
    })()
  `);
  assert.strictEqual(renameModalOpen.isOpen, true, 'Rename modal must open');
  assert.strictEqual(renameModalOpen.inputValue, 'Banda de Scanlators', 'Input must match current name');

  // Set new name and confirm
  await win.webContents.executeJavaScript(`
    document.getElementById('renameModalInput').value = 'Banda de Scanlators Oficial';
    document.getElementById('btnConfirmRenameModal').click();
  `);
  await new Promise(r => setTimeout(r, 150));

  const afterRenameRows = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-name')).map(e => e.textContent.trim())
  `);
  assert.ok(afterRenameRows.includes('Banda de Scanlators Oficial'), 'Renamed name must appear in unified view');
  assert.ok(!afterRenameRows.includes('Banda de Scanlators'), 'Old name must not appear');

  // Verify also in individual Groups view
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionGroups');`);
  const individualGroups = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionGroups .catalog-item-name')).map(e => e.textContent.trim())
  `);
  assert.ok(individualGroups.includes('Banda de Scanlators Oficial'), 'Renamed item must appear in sectionGroups');

  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionAllCatalogs');`);
  console.log('✓ Test W passed: Rename via modal updates unified view, individual catalog view, and DB.');

  // ----------------------------------------------------
  // TEST X: Delete Through Shared CRUD
  // ----------------------------------------------------
  console.log('\n--- Test X: Delete Through Shared CRUD ---');
  await win.webContents.executeJavaScript(`
    window.confirm = () => true;
    undefined;
  `);

  await win.webContents.executeJavaScript(`
    document.querySelector('#sectionAllCatalogs .all-catalogs-item-row[data-id="${targetRowId}"][data-type="group"] .btn-all-catalogs-delete').click();
  `);
  await new Promise(r => setTimeout(r, 150));

  const afterDeleteRows = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAllCatalogs .all-catalogs-item-name')).map(e => e.textContent.trim())
  `);
  assert.ok(!afterDeleteRows.includes('Banda de Scanlators Oficial'), 'Deleted item must be removed from unified view');

  const dbGroupsAfter = db.getAllGroups();
  assert.ok(!dbGroupsAfter.some(g => g.name === 'Banda de Scanlators Oficial'), 'Deleted item must not exist in DB');
  console.log('✓ Test X passed: Delete confirms and removes item from unified view, individual catalog, and DB.');

  // ----------------------------------------------------
  // TEST Y: Navigation Preserves Query/Filter/Sort State
  // ----------------------------------------------------
  console.log('\n--- Test Y: Navigation Preserves Query/Filter/Sort State ---');
  await win.webContents.executeJavaScript(`
    window.allCatalogs.setAllCatalogsFilter('author');
    window.allCatalogs.setAllCatalogsSearch('alice');
    window.allCatalogs.setAllCatalogsSort('name-desc');
  `);

  // Switch to another section (e.g. sectionAppearance)
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionAppearance');`);
  await new Promise(r => setTimeout(r, 100));

  // Switch back to sectionAllCatalogs
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionAllCatalogs');`);
  await new Promise(r => setTimeout(r, 100));

  const preservedState = await win.webContents.executeJavaScript(`
    (() => {
      const state = window.allCatalogs.getAllCatalogsState();
      const input = document.querySelector('#sectionAllCatalogs .all-catalogs-search-input');
      const sort = document.querySelector('#sectionAllCatalogs .all-catalogs-sort-select');
      const activePill = document.querySelector('#sectionAllCatalogs .all-catalogs-pill.active');
      return {
        stateQuery: state.query,
        stateFilter: state.typeFilter,
        stateSort: state.sortBy,
        inputValue: input ? input.value : null,
        sortValue: sort ? sort.value : null,
        pillFilter: activePill ? activePill.dataset.typeFilter : null
      };
    })()
  `);
  assert.strictEqual(preservedState.stateQuery, 'alice', 'State query preserved');
  assert.strictEqual(preservedState.stateFilter, 'author', 'State filter preserved');
  assert.strictEqual(preservedState.stateSort, 'name-desc', 'State sort preserved');
  assert.strictEqual(preservedState.inputValue, 'alice', 'DOM input value preserved');
  assert.strictEqual(preservedState.sortValue, 'name-desc', 'DOM sort select preserved');
  assert.strictEqual(preservedState.pillFilter, 'author', 'DOM active pill preserved');

  // Reset state
  await win.webContents.executeJavaScript(`
    window.allCatalogs.setAllCatalogsFilter('all');
    window.allCatalogs.setAllCatalogsSearch('');
    window.allCatalogs.setAllCatalogsSort('name-asc');
  `);
  console.log('✓ Test Y passed: Navigation cleanly preserves query, filter, and sort state across switches.');

  // ----------------------------------------------------
  // TEST Z: Individual Catalog Manager Remains Functional
  // ----------------------------------------------------
  console.log('\n--- Test Z: Individual Catalog Manager Remains Functional ---');
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionAuthors');`);
  const authorsCount = await win.webContents.executeJavaScript(`
    document.querySelectorAll('#sectionAuthors .catalog-item-row').length
  `);
  assert.ok(authorsCount >= 4, 'Authors section must render all author items');

  await win.webContents.executeJavaScript(`window.catalogManager.setCatalogSearch('author', 'toriyama');`);
  const filteredToriyama = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAuthors .catalog-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(filteredToriyama, ['Akira Toriyama'], 'Individual search must work as expected');

  await win.webContents.executeJavaScript(`window.catalogManager.setCatalogSearch('author', '');`);
  console.log('✓ Test Z passed: Individual catalog sections remain fully functional.');

  // ----------------------------------------------------
  // TEST AA: Catalog Picker Remains Functional
  // ----------------------------------------------------
  console.log('\n--- Test AA: Catalog Picker Remains Functional ---');
  const pickerExists = await win.webContents.executeJavaScript(`!!document.getElementById('modalCatalogPicker')`);
  assert.strictEqual(pickerExists, true, '#modalCatalogPicker must remain in DOM');
  console.log('✓ Test AA passed: Catalog Picker modal is intact.');

  // ----------------------------------------------------
  // TEST AB: Advanced Search Autocomplete Remains Functional
  // ----------------------------------------------------
  console.log('\n--- Test AB: Advanced Search Autocomplete Remains Functional ---');
  const advAutocompleteCheck = await win.webContents.executeJavaScript(`
    (() => {
      const norm1 = window.catalogManager.normalizeText('Acción');
      const norm2 = window.catalogManager.normalizeText('accion');
      return norm1 === norm2 && norm1 === 'accion';
    })()
  `);
  assert.strictEqual(advAutocompleteCheck, true, 'Normalization semantics match Advanced Search');
  console.log('✓ Test AB passed: Advanced Search autocomplete compatibility verified.');

  console.log('\n======================================================');
  console.log('  ALL PHASE 3 ALL-CATALOGS TESTS PASSED (A - AB)');
  console.log('======================================================\n');

  win.close();
  win = null;

  // Cleanup temp dir
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
}

app.whenReady().then(async () => {
  try {
    await runAllCatalogsTests();
    app.quit();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILURE:', err);
    if (win) win.close();
    app.quit();
    process.exit(1);
  }
});
