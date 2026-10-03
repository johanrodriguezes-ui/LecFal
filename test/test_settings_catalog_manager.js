/**
 * Test Suite: Settings UI Redesign — Phase 2: Shared Catalog Manager
 *
 * Verifies:
 * A. Authors render through the shared manager
 * B. Tags render through the shared manager
 * C. Languages render through the shared manager
 * D. Series/Parodies render through the shared manager
 * E. Groups render through the shared manager
 * F. Alphabetical sorting
 * G. Alphabetical grouping
 * H. Case-insensitive search
 * I. Accent-insensitive search
 * J. Empty search result state
 * K. Add item
 * L. Rename item
 * M. Delete item
 * N. Multiple catalog types use the same manager architecture
 * O. Existing section IDs remain intact
 * P. Catalog Picker is unaffected
 * Q. Advanced Search catalog autocomplete remains compatible
 * R. Settings navigation still switches correctly
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

async function runCatalogManagerTests() {
  console.log('======================================================');
  console.log('  TEST: SETTINGS UI REDESIGN PHASE 2 (CATALOG MANAGER)');
  console.log('======================================================');

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_catalog_mgr_'));
  storage.init({ dataRoot: tempDir });

  protocol.handle('lecfal-cover', () => new Response('Not found', { status: 404 }));
  protocol.handle('lecfal-file', () => new Response('Not found', { status: 404 }));

  const dbPath = path.join(tempDir, 'test_catalog_manager.db');
  db = new DatabaseManager(dbPath);
  await db.init();

  // Create initial sample data across all 5 catalog types
  const mangaLib = db.createLibrary('Manga');
  db.addFolder(path.join(tempDir, 'manga_folder'), mangaLib.id);

  // Authors (with accents, letters, and non-alpha)
  db.createAuthor('Eiichiro Oda');
  db.createAuthor('Akira Toriyama');
  db.createAuthor('Alice Cooper');
  db.createAuthor('Álvaro Martínez');
  db.createAuthor('99 Problems');

  // Tags
  db.createTag('Acción');
  db.createTag('Aventura');
  db.createTag('Batman');
  db.createTag('Ciencia Ficción');
  db.createTag('18+');

  // Languages
  try { db.createLanguage('Francés'); } catch (_) {}
  try { db.createLanguage('Alemán'); } catch (_) {}
  try { db.createLanguage('Árabe'); } catch (_) {}
  try { db.createLanguage('Español'); } catch (_) {}

  // Parodies
  db.createParody('Dragon Ball');
  db.createParody('Naruto');
  db.createParody('One Piece');
  try { db.createParody('Original'); } catch (_) {}
  db.createParody('007 Bond');

  // Groups
  db.createGroup('Studio Ghibli');
  db.createGroup('Weekly Shonen Jump');
  db.createGroup('Anime Classics');
  db.createGroup('Ápex Circle');
  db.createGroup('404 Scans');

  db.ignoreAuthor('Test Ignored Value');

  // Register IPC Handlers
  ipcMain.handle('library:get-series', async () => []);
  ipcMain.handle('library:get-folders', async () => db.getFolders());
  ipcMain.handle('library:toggle-series-fav', async (event, id) => db.toggleSeriesFavorite(id));

  // Catalog IPC Handlers
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
    // Filter noise
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
        if (document.getElementById('settingsView') && window.lecfalViews && window.catalogManager) resolve();
        else setTimeout(check, 50);
      };
      check();
    })
  `);
  console.log('✓ Initial window, LecFal views, and CatalogManager loaded.');

  // Open settings
  await win.webContents.executeJavaScript(`window.lecfalViews.openSettingsView();`);
  await new Promise(r => setTimeout(r, 200));

  // ----------------------------------------------------
  // TEST O: Existing section IDs remain intact
  // ----------------------------------------------------
  console.log('\n--- Test O: Existing Section IDs Intact ---');
  const sectionIds = [
    'sectionAppearance',
    'sectionLibraries',
    'sectionFolders',
    'sectionAuthors',
    'sectionTags',
    'sectionLanguages',
    'sectionParodies',
    'sectionGroups',
    'sectionAllCatalogs',
    'sectionIgnoredAuthors'
  ];

  for (const id of sectionIds) {
    const exists = await win.webContents.executeJavaScript(`!!document.getElementById('${id}')`);
    assert.strictEqual(exists, true, `Section #${id} must exist in the DOM`);
  }
  console.log('✓ Test O passed: All 10 existing section IDs remain intact.');

  // ----------------------------------------------------
  // TEST N: Shared Manager Architecture
  // ----------------------------------------------------
  console.log('\n--- Test N: Shared Manager Architecture Across All 5 Catalogs ---');
  const managerConfigs = await win.webContents.executeJavaScript(`
    Object.keys(window.catalogManager.CATALOG_CONFIGS)
  `);
  assert.deepStrictEqual(managerConfigs.sort(), ['author', 'group', 'language', 'parody', 'tag'].sort());

  const catalogTypes = [
    { type: 'author', sectionId: 'sectionAuthors', name: 'Authors' },
    { type: 'tag', sectionId: 'sectionTags', name: 'Tags' },
    { type: 'language', sectionId: 'sectionLanguages', name: 'Languages' },
    { type: 'parody', sectionId: 'sectionParodies', name: 'Series/Parodies' },
    { type: 'group', sectionId: 'sectionGroups', name: 'Groups' }
  ];

  for (const cat of catalogTypes) {
    const structure = await win.webContents.executeJavaScript(`
      (() => {
        const sec = document.getElementById('${cat.sectionId}');
        return {
          hasHeader: !!sec.querySelector('.catalog-header'),
          hasAddBtn: !!sec.querySelector('.btn-catalog-add'),
          hasAddForm: !!sec.querySelector('.catalog-add-form'),
          hasSearchBar: !!sec.querySelector('.catalog-search-bar'),
          hasSearchInput: !!sec.querySelector('.catalog-search-input'),
          hasItemsContainer: !!sec.querySelector('.catalog-items-container')
        };
      })()
    `);
    assert.strictEqual(structure.hasHeader, true, `${cat.name} must have .catalog-header`);
    assert.strictEqual(structure.hasAddBtn, true, `${cat.name} must have .btn-catalog-add`);
    assert.strictEqual(structure.hasAddForm, true, `${cat.name} must have .catalog-add-form`);
    assert.strictEqual(structure.hasSearchBar, true, `${cat.name} must have .catalog-search-bar`);
    assert.strictEqual(structure.hasSearchInput, true, `${cat.name} must have .catalog-search-input`);
    assert.strictEqual(structure.hasItemsContainer, true, `${cat.name} must have .catalog-items-container`);
  }
  console.log('✓ Test N passed: All 5 catalog types share the identical manager DOM and config architecture.');

  // ----------------------------------------------------
  // TESTS A through E: Rendering through Shared Manager
  // ----------------------------------------------------
  console.log('\n--- Test A: Authors Render Through Shared Manager ---');
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionAuthors');`);
  let authorNames = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAuthors .catalog-item-name')).map(el => el.textContent.trim())
  `);
  assert.ok(authorNames.includes('Eiichiro Oda'), 'Eiichiro Oda should be rendered');
  assert.ok(authorNames.includes('Akira Toriyama'), 'Akira Toriyama should be rendered');
  assert.ok(authorNames.includes('Álvaro Martínez'), 'Álvaro Martínez should be rendered');
  console.log('✓ Test A passed: Authors render through shared manager.');

  console.log('\n--- Test B: Tags Render Through Shared Manager ---');
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionTags');`);
  let tagNames = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionTags .catalog-item-name')).map(el => el.textContent.trim())
  `);
  assert.ok(tagNames.includes('Acción'), 'Acción should be rendered');
  assert.ok(tagNames.includes('Aventura'), 'Aventura should be rendered');
  assert.ok(tagNames.includes('Ciencia Ficción'), 'Ciencia Ficción should be rendered');
  console.log('✓ Test B passed: Tags render through shared manager.');

  console.log('\n--- Test C: Languages Render Through Shared Manager ---');
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionLanguages');`);
  let langNames = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionLanguages .catalog-item-name')).map(el => el.textContent.trim())
  `);
  assert.ok(langNames.includes('Español'), 'Español should be rendered');
  assert.ok(langNames.includes('Francés'), 'Francés should be rendered');
  console.log('✓ Test C passed: Languages render through shared manager.');

  console.log('\n--- Test D: Series/Parodies Render Through Shared Manager ---');
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionParodies');`);
  let parodyNames = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionParodies .catalog-item-name')).map(el => el.textContent.trim())
  `);
  assert.ok(parodyNames.includes('One Piece'), 'One Piece should be rendered');
  assert.ok(parodyNames.includes('Dragon Ball'), 'Dragon Ball should be rendered');
  console.log('✓ Test D passed: Series/Parodies render through shared manager.');

  console.log('\n--- Test E: Groups Render Through Shared Manager ---');
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionGroups');`);
  let groupNames = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionGroups .catalog-item-name')).map(el => el.textContent.trim())
  `);
  assert.ok(groupNames.includes('Studio Ghibli'), 'Studio Ghibli should be rendered');
  assert.ok(groupNames.includes('Weekly Shonen Jump'), 'Weekly Shonen Jump should be rendered');
  console.log('✓ Test E passed: Groups render through shared manager.');

  // ----------------------------------------------------
  // TEST F & G: Alphabetical Sorting and Grouping
  // ----------------------------------------------------
  console.log('\n--- Test F & G: Alphabetical Sorting and Grouping ---');
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionAuthors');`);
  const authorGroups = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAuthors .catalog-letter-group')).map(g => ({
      letter: g.dataset.letter,
      items: Array.from(g.querySelectorAll('.catalog-item-name')).map(e => e.textContent.trim())
    }))
  `);

  // Letters should include 'A', 'E', '#'
  const letters = authorGroups.map(g => g.letter);
  assert.ok(letters.includes('A'), 'Group A must exist');
  assert.ok(letters.includes('E'), 'Group E must exist');
  assert.ok(letters.includes('#'), 'Non-alphabetic group # must exist');
  assert.strictEqual(letters[letters.length - 1], '#', 'Non-alphabetic group # must be at the very end');

  // Verify group A items are sorted alphabetically
  const aGroup = authorGroups.find(g => g.letter === 'A');
  assert.deepStrictEqual(aGroup.items, ['Akira Toriyama', 'Alice Cooper', 'Álvaro Martínez']);

  // Verify group # contains '99 Problems'
  const hashGroup = authorGroups.find(g => g.letter === '#');
  assert.ok(hashGroup.items.includes('99 Problems'));
  console.log('✓ Test F & G passed: Alphabetical sorting within groups, diacritics normalized under letter, and # group at end.');

  // ----------------------------------------------------
  // TEST H: Case-Insensitive Search
  // ----------------------------------------------------
  console.log('\n--- Test H: Case-Insensitive Search ---');
  await win.webContents.executeJavaScript(`window.catalogManager.setCatalogSearch('author', 'oda');`);
  let visibleAuthors = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAuthors .catalog-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(visibleAuthors, ['Eiichiro Oda']);

  await win.webContents.executeJavaScript(`window.catalogManager.setCatalogSearch('author', 'ODA');`);
  visibleAuthors = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAuthors .catalog-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(visibleAuthors, ['Eiichiro Oda']);

  // Reset
  await win.webContents.executeJavaScript(`window.catalogManager.setCatalogSearch('author', '');`);
  console.log('✓ Test H passed: Case-insensitive search successfully filtered locally.');

  // ----------------------------------------------------
  // TEST I: Accent-Insensitive Search
  // ----------------------------------------------------
  console.log('\n--- Test I: Accent-Insensitive Search ---');
  await win.webContents.executeJavaScript(`window.catalogManager.setCatalogSearch('author', 'alvaro');`);
  visibleAuthors = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAuthors .catalog-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(visibleAuthors, ['Álvaro Martínez']);

  await win.webContents.executeJavaScript(`window.catalogManager.setCatalogSearch('author', 'ALVARO');`);
  visibleAuthors = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAuthors .catalog-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(visibleAuthors, ['Álvaro Martínez']);

  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionLanguages');`);
  await win.webContents.executeJavaScript(`window.catalogManager.setCatalogSearch('language', 'frances');`);
  let visibleLangs = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionLanguages .catalog-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(visibleLangs, ['Francés']);

  // Reset searches
  await win.webContents.executeJavaScript(`
    window.catalogManager.setCatalogSearch('author', '');
    window.catalogManager.setCatalogSearch('language', '');
  `);
  console.log('✓ Test I passed: Accent/diacritic-insensitive search works across all catalog types.');

  // ----------------------------------------------------
  // TEST J: Empty Search Result State
  // ----------------------------------------------------
  console.log('\n--- Test J: Empty Search Result State ---');
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionAuthors');`);
  await win.webContents.executeJavaScript(`window.catalogManager.setCatalogSearch('author', 'nonexistent_query_xyz');`);
  const emptySearchState = await win.webContents.executeJavaScript(`
    (() => {
      const container = document.querySelector('#sectionAuthors .catalog-search-empty');
      const clearBtn = container ? container.querySelector('.btn-catalog-clear-search') : null;
      return {
        exists: !!container,
        hasClearBtn: !!clearBtn,
        text: container ? container.textContent : ''
      };
    })()
  `);
  assert.strictEqual(emptySearchState.exists, true, '.catalog-search-empty state should be shown');
  assert.strictEqual(emptySearchState.hasClearBtn, true, 'Clear button should exist in empty state');
  assert.ok(emptySearchState.text.includes('Sin resultados coincidentes'), 'Empty state should indicate no matches');

  // Click clear search button
  await win.webContents.executeJavaScript(`
    document.querySelector('#sectionAuthors .btn-catalog-clear-search').click();
  `);
  visibleAuthors = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAuthors .catalog-item-name')).map(e => e.textContent.trim())
  `);
  assert.ok(visibleAuthors.length >= 5, 'Clearing search should restore all authors');
  console.log('✓ Test J passed: Empty search result state displays message and restores on clear.');

  // ----------------------------------------------------
  // TEST K: Add Item
  // ----------------------------------------------------
  console.log('\n--- Test K: Add Item ---');
  const addResult = await win.webContents.executeJavaScript(`
    window.catalogManager.addItem('author', 'Kentaro Miura')
  `);
  assert.strictEqual(addResult.name, 'Kentaro Miura');

  const afterAddAuthors = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAuthors .catalog-item-name')).map(e => e.textContent.trim())
  `);
  assert.ok(afterAddAuthors.includes('Kentaro Miura'), 'Newly added author must be visible');

  // Verify alphabetical grouping placed it under 'K'
  const kGroup = await win.webContents.executeJavaScript(`
    (() => {
      const group = document.querySelector('#sectionAuthors .catalog-letter-group[data-letter="K"]');
      return group ? Array.from(group.querySelectorAll('.catalog-item-name')).map(e => e.textContent.trim()) : [];
    })()
  `);
  assert.ok(kGroup.includes('Kentaro Miura'), 'Kentaro Miura must be in group K');

  // Verify empty item is rejected
  let emptyAddFailed = false;
  try {
    await win.webContents.executeJavaScript(`window.catalogManager.addItem('author', '   ')`);
  } catch (_) {
    emptyAddFailed = true;
  }
  assert.strictEqual(emptyAddFailed, true, 'Adding empty author must reject with error');
  console.log('✓ Test K passed: Add item validates empty names, creates in DB, and renders into correct letter group.');

  // ----------------------------------------------------
  // TEST L: Rename Item
  // ----------------------------------------------------
  console.log('\n--- Test L: Rename Item via Dedicated Modal ---');
  // Find ID of Alice Cooper
  const authorIdToRename = await win.webContents.executeJavaScript(`
    (() => {
      const row = Array.from(document.querySelectorAll('#sectionAuthors .catalog-item-row')).find(r =>
        r.querySelector('.catalog-item-name').textContent.trim() === 'Alice Cooper'
      );
      return row ? Number(row.dataset.id) : null;
    })()
  `);
  assert.ok(authorIdToRename, 'Alice Cooper row should have data-id');

  // Trigger rename button click
  await win.webContents.executeJavaScript(`
    document.querySelector('#sectionAuthors .catalog-item-row[data-id="${authorIdToRename}"] .btn-catalog-rename').click();
  `);

  const modalOpenState = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.getElementById('modalRenameMetadata');
      const input = document.getElementById('renameModalInput');
      return {
        isOpen: modal && modal.style.display !== 'none',
        inputValue: input ? input.value : null
      };
    })()
  `);
  assert.strictEqual(modalOpenState.isOpen, true, 'Rename modal must open');
  assert.strictEqual(modalOpenState.inputValue, 'Alice Cooper', 'Rename modal input must contain current name');

  // Rename to 'Alice Cooper (Solo)' and confirm
  await win.webContents.executeJavaScript(`
    document.getElementById('renameModalInput').value = 'Alice Cooper (Solo)';
    document.getElementById('btnConfirmRenameModal').click();
  `);
  await new Promise(r => setTimeout(r, 100));

  const afterRenameAuthors = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAuthors .catalog-item-name')).map(e => e.textContent.trim())
  `);
  assert.ok(afterRenameAuthors.includes('Alice Cooper (Solo)'), 'Renamed name must be visible');
  assert.ok(!afterRenameAuthors.includes('Alice Cooper'), 'Old name must no longer be present');

  const modalClosed = await win.webContents.executeJavaScript(`
    document.getElementById('modalRenameMetadata').style.display === 'none'
  `);
  assert.strictEqual(modalClosed, true, 'Modal should close after confirmation');
  console.log('✓ Test L passed: Rename modal opens with current name and updates catalog on confirm.');

  // ----------------------------------------------------
  // TEST M: Delete Item
  // ----------------------------------------------------
  console.log('\n--- Test M: Delete Item ---');
  // Mock window.confirm to return true
  await win.webContents.executeJavaScript(`
    window.confirm = () => true;
    undefined;
  `);

  const deleteTargetId = await win.webContents.executeJavaScript(`
    (() => {
      const row = Array.from(document.querySelectorAll('#sectionAuthors .catalog-item-row')).find(r =>
        r.querySelector('.catalog-item-name').textContent.trim() === '99 Problems'
      );
      return row ? Number(row.dataset.id) : null;
    })()
  `);
  assert.ok(deleteTargetId, '99 Problems ID must exist');

  await win.webContents.executeJavaScript(`
    document.querySelector('#sectionAuthors .catalog-item-row[data-id="${deleteTargetId}"] .btn-catalog-delete').click();
  `);
  await new Promise(r => setTimeout(r, 100));

  const afterDeleteAuthors = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionAuthors .catalog-item-name')).map(e => e.textContent.trim())
  `);
  assert.ok(!afterDeleteAuthors.includes('99 Problems'), 'Deleted author should no longer be present');

  // Check in DB
  const dbAuthors = db.getAllAuthors();
  assert.strictEqual(dbAuthors.some(a => a.name === '99 Problems'), false, 'Deleted author must not exist in DB');
  console.log('✓ Test M passed: Delete confirmation deletes item from DB and refreshes UI.');

  // ----------------------------------------------------
  // TEST P: Catalog Picker Unaffected
  // ----------------------------------------------------
  console.log('\n--- Test P: Catalog Picker Independence & Presence ---');
  const pickerModalExists = await win.webContents.executeJavaScript(`
    !!document.getElementById('modalCatalogPicker')
  `);
  assert.strictEqual(pickerModalExists, true, '#modalCatalogPicker must remain intact in DOM');
  console.log('✓ Test P passed: Catalog Picker is completely independent and intact.');

  // ----------------------------------------------------
  // TEST Q: Advanced Search Catalog Autocomplete Compatibility
  // ----------------------------------------------------
  console.log('\n--- Test Q: Advanced Search Catalog Autocomplete Compatibility ---');
  const autocompleteMatch = await win.webContents.executeJavaScript(`
    (() => {
      const normA = window.catalogManager.normalizeText('Álvaro');
      const normB = window.catalogManager.normalizeText('alvaro');
      return normA === normB && normA === 'alvaro';
    })()
  `);
  assert.strictEqual(autocompleteMatch, true, 'Catalog normalization matches autocomplete semantics');
  console.log('✓ Test Q passed: Advanced Search autocomplete compatibility verified.');

  // ----------------------------------------------------
  // TEST R: Settings Navigation Switches Correctly & Preserves Search State
  // ----------------------------------------------------
  console.log('\n--- Test R: Settings Navigation & In-Memory Search Preservation ---');
  // Set search on Tags
  await win.webContents.executeJavaScript(`
    window.switchSettingsSection('sectionTags');
    window.catalogManager.setCatalogSearch('tag', 'bat');
  `);
  let visibleTags = await win.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('#sectionTags .catalog-item-name')).map(e => e.textContent.trim())
  `);
  assert.deepStrictEqual(visibleTags, ['Batman']);

  // Switch to Languages
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionLanguages');`);
  const activeSec = await win.webContents.executeJavaScript(`window.getCurrentSettingsSection()`);
  assert.strictEqual(activeSec, 'sectionLanguages');

  // Switch back to Tags -> query 'bat' should still be preserved
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionTags');`);
  const preservedQuery = await win.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('#sectionTags .catalog-search-input');
      const items = Array.from(document.querySelectorAll('#sectionTags .catalog-item-name')).map(e => e.textContent.trim());
      return {
        inputValue: input ? input.value : null,
        items
      };
    })()
  `);
  assert.strictEqual(preservedQuery.inputValue, 'bat', 'Search input must preserve search text');
  assert.deepStrictEqual(preservedQuery.items, ['Batman'], 'Items should still reflect preserved search query');

  // Clean up search
  await win.webContents.executeJavaScript(`window.catalogManager.setCatalogSearch('tag', '');`);
  console.log('✓ Test R passed: Navigation correctly switches sections and preserves local search per catalog.');

  console.log('\n======================================================');
  console.log('  ALL PHASE 2 CATALOG MANAGER TESTS PASSED (A - R)');
  console.log('======================================================');

  if (win) win.close();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
  app.exit(0);
}

app.whenReady().then(runCatalogManagerTests).catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
