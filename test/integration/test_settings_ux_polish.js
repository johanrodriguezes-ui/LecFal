/**
 * Test Suite: Settings UI Redesign — Phase 4: UX Polish & Accessibility
 *
 * Verifies:
 * A. Catalog Picker deep-link
 *    - author picker -> sectionAuthors
 *    - tag picker -> sectionTags
 *    - language picker -> sectionLanguages
 *    - parody picker -> sectionParodies
 *    - group picker -> sectionGroups
 *    - openSettingsView() with no argument preserves default navigation
 * B. Theme switching
 *    - dark option applies dark theme & active state
 *    - light option applies light theme & active state
 *    - settings persistence for theme
 * C. Ignored author restoration
 *    - ignored author appears in sectionIgnoredAuthors list
 *    - restoring it removes it from list and DB
 *    - author catalog remains functional
 * D. Accessibility
 *    - rename modal label references rename input (for="renameModalInput")
 *    - rename modal has dialog semantics (role="dialog", aria-modal="true", aria-labelledby)
 *    - create library modal has dialog semantics (role="dialog", aria-modal="true", aria-labelledby)
 *    - catalog picker modal has dialog semantics (role="dialog", aria-modal="true", aria-labelledby)
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

async function runSettingsUXPolishTests() {
  console.log('======================================================');
  console.log('  TEST: SETTINGS UI REDESIGN PHASE 4 (UX POLISH)');
  console.log('======================================================');

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_ux_polish_'));
  storage.init({ dataRoot: tempDir });

  protocol.handle('lecfal-cover', () => new Response('Not found', { status: 404 }));
  protocol.handle('lecfal-file', () => new Response('Not found', { status: 404 }));

  const dbPath = path.join(tempDir, 'test_ux_polish.db');
  db = new DatabaseManager(dbPath);
  await db.init();

  // Create initial sample data
  const mangaLib = db.createLibrary('Manga');
  const folder = db.addFolder(path.join(tempDir, 'manga_folder'), mangaLib.id);

  db.createAuthor('Eiichiro Oda');
  db.createTag('Shonen');
  try { db.createLanguage('Japonés'); } catch (_) {}
  db.createParody('One Piece');
  db.createGroup('Weekly Shonen Jump');
  db.ignoreAuthor('Test Ignored Value');

  // Insert a dummy series to serve as activeSeries
  db.db.run('INSERT INTO series (title, path, folder_id) VALUES (?, ?, ?)', [
    'Sample Series',
    path.join(tempDir, 'manga_folder', 'Sample Series'),
    folder.id
  ]);
  const sStmt = db.db.prepare('SELECT id FROM series WHERE title = ?');
  sStmt.bind(['Sample Series']);
  sStmt.step();
  const sampleSeriesId = sStmt.getAsObject().id;
  sStmt.free();

  // Register IPC Handlers
  ipcMain.handle('library:get-series', async () => (db.getSeriesList ? db.getSeriesList() : []));
  ipcMain.handle('library:get-folders', async () => db.getFolders());
  ipcMain.handle('library:toggle-series-fav', async (event, id) => db.toggleSeriesFavorite(id));
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
  ipcMain.handle('tags:get-all', async () => db.getAllTags());
  ipcMain.handle('authors:get-all', async () => db.getAllAuthors());
  ipcMain.handle('authors:get-all-ignored', async () => db.getAllIgnoredAuthors());
  ipcMain.handle('authors:ignore', async (event, name) => db.ignoreAuthor(name));
  ipcMain.handle('authors:unignore', async (event, name) => db.unignoreAuthor(name));
  ipcMain.handle('languages:get-all', async () => db.getAllLanguages());
  ipcMain.handle('parodies:get-all', async () => db.getAllParodies());
  ipcMain.handle('groups:get-all', async () => db.getAllGroups());
  ipcMain.handle('libraries:get-all', async () => db.getLibraries());
  ipcMain.handle('libraries:get-by-id', async (event, id) => db.getLibraryById(id));
  ipcMain.handle('libraries:create', async (event, name) => db.createLibrary(name));
  ipcMain.handle('libraries:rename', async (event, id, name) => db.renameLibrary(id, name));
  ipcMain.handle('libraries:delete', async (event, id) => db.deleteLibrary(id));
  ipcMain.handle('settings:get', async (event, key, defaultValue) => db.getSetting(key, defaultValue));
  ipcMain.handle('settings:set', async (event, key, value) => db.setSetting(key, value));
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

  win.webContents.on('console-message', (e, level, message) => {
    // console.log('[Renderer Console]', message);
  });

  await win.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  win.show();

  // Wait for initial DOM readiness
  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      const check = () => {
        if (document.getElementById('settingsView') && window.lecfalViews) resolve();
        else setTimeout(check, 50);
      };
      check();
    })
  `);
  console.log('✓ Initial window and LecFal views loaded.');

  // Open Manga View to establish an active series
  await win.webContents.executeJavaScript(`window.lecfalViews.openMangaView(${sampleSeriesId});`);
  await new Promise(r => setTimeout(r, 200));

  // ====================================================
  // TEST D: ACCESSIBILITY CHECKS
  // ====================================================
  console.log('\n--- Test D: Modal Accessibility Semantics ---');
  const a11yState = await win.webContents.executeJavaScript(`
    (() => {
      const renameLabel = document.getElementById('renameModalLabel');
      const renameInput = document.getElementById('renameModalInput');
      const renameModal = document.getElementById('modalRenameMetadata');
      const createLibModal = document.getElementById('modalCreateLibrary');
      const catalogPickerModal = document.getElementById('modalCatalogPicker');

      return {
        renameLabelFor: renameLabel ? renameLabel.getAttribute('for') : null,
        renameInputId: renameInput ? renameInput.id : null,
        renameModalRole: renameModal ? renameModal.getAttribute('role') : null,
        renameModalAriaModal: renameModal ? renameModal.getAttribute('aria-modal') : null,
        renameModalLabelledBy: renameModal ? renameModal.getAttribute('aria-labelledby') : null,
        createLibModalRole: createLibModal ? createLibModal.getAttribute('role') : null,
        createLibModalAriaModal: createLibModal ? createLibModal.getAttribute('aria-modal') : null,
        createLibModalLabelledBy: createLibModal ? createLibModal.getAttribute('aria-labelledby') : null,
        pickerModalRole: catalogPickerModal ? catalogPickerModal.getAttribute('role') : null,
        pickerModalAriaModal: catalogPickerModal ? catalogPickerModal.getAttribute('aria-modal') : null,
        pickerModalLabelledBy: catalogPickerModal ? catalogPickerModal.getAttribute('aria-labelledby') : null
      };
    })()
  `);

  assert.strictEqual(a11yState.renameLabelFor, 'renameModalInput', 'renameModalLabel must have for="renameModalInput"');
  assert.strictEqual(a11yState.renameInputId, 'renameModalInput', 'renameModalInput id must match label for attribute');
  assert.strictEqual(a11yState.renameModalRole, 'dialog', 'modalRenameMetadata must have role="dialog"');
  assert.strictEqual(a11yState.renameModalAriaModal, 'true', 'modalRenameMetadata must have aria-modal="true"');
  assert.strictEqual(a11yState.renameModalLabelledBy, 'renameModalTitle', 'modalRenameMetadata must have aria-labelledby="renameModalTitle"');

  assert.strictEqual(a11yState.createLibModalRole, 'dialog', 'modalCreateLibrary must have role="dialog"');
  assert.strictEqual(a11yState.createLibModalAriaModal, 'true', 'modalCreateLibrary must have aria-modal="true"');
  assert.strictEqual(a11yState.createLibModalLabelledBy, 'createLibraryModalTitle', 'modalCreateLibrary must have aria-labelledby="createLibraryModalTitle"');

  assert.strictEqual(a11yState.pickerModalRole, 'dialog', 'modalCatalogPicker must have role="dialog"');
  assert.strictEqual(a11yState.pickerModalAriaModal, 'true', 'modalCatalogPicker must have aria-modal="true"');
  assert.strictEqual(a11yState.pickerModalLabelledBy, 'modalCatalogPickerTitle', 'modalCatalogPicker must have aria-labelledby="modalCatalogPickerTitle"');
  console.log('✓ Test D passed: Accessible modal dialog semantics and label associations verified.');

  // ====================================================
  // TEST A: CATALOG PICKER DEEP-LINK
  // ====================================================
  console.log('\n--- Test A: Catalog Picker Deep-Link Navigation ---');
  const deepLinkTypes = [
    { type: 'author', expectedSection: 'sectionAuthors' },
    { type: 'tag', expectedSection: 'sectionTags' },
    { type: 'language', expectedSection: 'sectionLanguages' },
    { type: 'parody', expectedSection: 'sectionParodies' },
    { type: 'group', expectedSection: 'sectionGroups' }
  ];

  for (const { type, expectedSection } of deepLinkTypes) {
    // 1. Return to manga view so getActiveSeries is populated
    await win.webContents.executeJavaScript(`window.lecfalViews.openMangaView(${sampleSeriesId});`);
    await new Promise(r => setTimeout(r, 100));

    // 2. Open catalog picker for the target type
    await win.webContents.executeJavaScript(`window.lecfalViews.openCatalogPicker('${type}');`);
    await new Promise(r => setTimeout(r, 100));

    // 3. Click "Ir a Ajustes para crearlos" / btnGoToSettingsFromPicker
    await win.webContents.executeJavaScript(`
      document.getElementById('btnGoToSettingsFromPicker').click();
    `);
    await new Promise(r => setTimeout(r, 200));

    // 4. Verify settings is visible and switched to the exact expected section
    const navResult = await win.webContents.executeJavaScript(`
      (() => {
        const currentSection = window.getCurrentSettingsSection();
        const sectionEl = document.getElementById('${expectedSection}');
        const isVisible = sectionEl ? getComputedStyle(sectionEl).display !== 'none' : false;
        const hasActive = sectionEl ? sectionEl.classList.contains('active') : false;
        const pickerModal = document.getElementById('modalCatalogPicker');
        const pickerHidden = !pickerModal || getComputedStyle(pickerModal).display === 'none';

        return {
          currentSection,
          isVisible,
          hasActive,
          pickerHidden
        };
      })()
    `);

    assert.strictEqual(navResult.currentSection, expectedSection, `Picker type "${type}" must route to ${expectedSection}`);
    assert.strictEqual(navResult.isVisible, true, `${expectedSection} must be visible in the DOM`);
    assert.strictEqual(navResult.hasActive, true, `${expectedSection} must have .active class`);
    assert.strictEqual(navResult.pickerHidden, true, 'Catalog picker modal must be closed after deep-link navigation');
    console.log(`  ✓ Deep-link: ${type} -> ${expectedSection}`);
  }

  // Verify openSettingsView() with no argument preserves default navigation
  await win.webContents.executeJavaScript(`
    window.switchSettingsSection('sectionAppearance');
    window.lecfalViews.openSettingsView();
  `);
  await new Promise(r => setTimeout(r, 100));
  const defaultNavSection = await win.webContents.executeJavaScript(`window.getCurrentSettingsSection();`);
  assert.strictEqual(defaultNavSection, 'sectionAppearance', 'openSettingsView() without target preserves default section');
  console.log('✓ Test A passed: Catalog Picker deep-link routes correctly for all 5 catalog types.');

  // ====================================================
  // TEST B: THEME SWITCHING
  // ====================================================
  console.log('\n--- Test B: Theme Switching & Persistence ---');
  await win.webContents.executeJavaScript(`
    window.switchSettingsSection('sectionAppearance');
  `);
  await new Promise(r => setTimeout(r, 100));

  // 1. Switch to Dark
  await win.webContents.executeJavaScript(`
    document.getElementById('themeOptDark').click();
  `);
  await new Promise(r => setTimeout(r, 100));

  let themeState = await win.webContents.executeJavaScript(`
    (() => {
      const bodyTheme = document.body.dataset.theme;
      const darkActive = document.getElementById('themeOptDark').classList.contains('active');
      const lightActive = document.getElementById('themeOptLight').classList.contains('active');
      return { bodyTheme, darkActive, lightActive };
    })()
  `);
  assert.strictEqual(themeState.bodyTheme, 'dark', 'Body dataset.theme must be "dark"');
  assert.strictEqual(themeState.darkActive, true, 'Dark theme option card must have active class');
  assert.strictEqual(themeState.lightActive, false, 'Light theme option card must not have active class');
  assert.strictEqual(db.getSetting('theme'), 'dark', 'Database setting for theme must be "dark"');
  console.log('  ✓ Dark theme applied and persisted');

  // 2. Switch to Light
  await win.webContents.executeJavaScript(`
    document.getElementById('themeOptLight').click();
  `);
  await new Promise(r => setTimeout(r, 100));

  themeState = await win.webContents.executeJavaScript(`
    (() => {
      const bodyTheme = document.body.dataset.theme;
      const darkActive = document.getElementById('themeOptDark').classList.contains('active');
      const lightActive = document.getElementById('themeOptLight').classList.contains('active');
      return { bodyTheme, darkActive, lightActive };
    })()
  `);
  assert.strictEqual(themeState.bodyTheme, 'light', 'Body dataset.theme must be "light"');
  assert.strictEqual(themeState.darkActive, false, 'Dark theme option card must not have active class');
  assert.strictEqual(themeState.lightActive, true, 'Light theme option card must have active class');
  assert.strictEqual(db.getSetting('theme'), 'light', 'Database setting for theme must be "light"');
  console.log('  ✓ Light theme applied and persisted');

  // 3. Restore to Dark
  await win.webContents.executeJavaScript(`
    document.getElementById('themeOptDark').click();
  `);
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(db.getSetting('theme'), 'dark', 'Database setting returned to "dark"');
  console.log('✓ Test B passed: Theme switching works bidirectionally and persists cleanly.');

  // ====================================================
  // TEST C: IGNORED AUTHOR RESTORATION
  // ====================================================
  console.log('\n--- Test C: Ignored Author Restoration ---');
  await win.webContents.executeJavaScript(`
    window.switchSettingsSection('sectionIgnoredAuthors');
  `);
  await new Promise(r => setTimeout(r, 200));

  // 1. Verify ignored author appears in list
  const initialIgnoredList = await win.webContents.executeJavaScript(`
    (() => {
      const rows = Array.from(document.querySelectorAll('#settingsIgnoredAuthorsList .settings-tag-item'));
      return rows.map(r => ({
        name: r.querySelector('.settings-tag-name')?.textContent.trim(),
        hasRestoreBtn: !!r.querySelector('.btn-restore-ignored')
      }));
    })()
  `);

  assert.ok(initialIgnoredList.length >= 1, 'Ignored authors list must have at least 1 item');
  const foundIgnored = initialIgnoredList.find(i => i.name === 'Test Ignored Value');
  assert.ok(foundIgnored, 'Ignored value "Test Ignored Value" must be listed in sectionIgnoredAuthors');
  assert.strictEqual(foundIgnored.hasRestoreBtn, true, 'Restore button must be present on ignored item');
  console.log('  ✓ Ignored author is displayed with restore button');

  // 2. Click restore button
  await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('#settingsIgnoredAuthorsList .btn-restore-ignored[data-name="Test Ignored Value"]');
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 300));

  // 3. Verify removed from DOM and DB
  const afterRestoreList = await win.webContents.executeJavaScript(`
    (() => {
      const rows = Array.from(document.querySelectorAll('#settingsIgnoredAuthorsList .settings-tag-item'));
      return rows.map(r => r.querySelector('.settings-tag-name')?.textContent.trim());
    })()
  `);

  assert.strictEqual(afterRestoreList.includes('Test Ignored Value'), false, 'Restored author must no longer appear in ignored list');
  const dbIgnoredAuthors = db.getAllIgnoredAuthors();
  assert.strictEqual(dbIgnoredAuthors.some(a => a.name === 'Test Ignored Value'), false, 'Author must be unignored in the database');
  console.log('  ✓ Ignored author unignored and removed from list and database');

  // 4. Verify existing catalog behavior remains correct
  await win.webContents.executeJavaScript(`
    window.switchSettingsSection('sectionAuthors');
  `);
  await new Promise(r => setTimeout(r, 200));
  const authorsCount = await win.webContents.executeJavaScript(`
    document.querySelectorAll('#sectionAuthors .catalog-item-row').length
  `);
  assert.ok(authorsCount >= 1, 'Authors section must remain operational after unignore');
  console.log('✓ Test C passed: Ignored author restoration works correctly and preserves catalog stability.');

  console.log('\n======================================================');
  console.log('  ALL PHASE 4 UX POLISH TESTS PASSED (A - D)');
  console.log('======================================================\n');
}

app.whenReady().then(async () => {
  try {
    await runSettingsUXPolishTests();
    app.quit();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILURE:', err);
    if (win) win.close();
    app.quit();
    process.exit(1);
  }
});
