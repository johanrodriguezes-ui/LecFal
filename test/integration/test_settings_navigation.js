/**
 * Test Suite: Settings UI Redesign — Phase 1: Sidebar & Section Navigation
 *
 * Verifies:
 * A. Settings opens cleanly.
 * B. Appearance is the default section upon opening Settings.
 * C. Clicking Libraries hides all other sections and shows sectionLibraries.
 * D. Clicking Folders shows only sectionFolders.
 * E. Clicking Authors shows only sectionAuthors.
 * F. Clicking Tags shows only sectionTags.
 * G. Clicking Languages shows only sectionLanguages.
 * H. Clicking Series/Parodies shows only sectionParodies.
 * I. Clicking Groups shows only sectionGroups.
 * J. Clicking All Catalogs shows sectionAllCatalogs.
 * K. Clicking Ignored Values shows sectionIgnoredAuthors.
 * L. The active sidebar item matches the visible section at all times.
 * M. openSettingsView('sectionLibraries') still opens directly on Libraries.
 * N. Back to Library button returns to Library view without error.
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

async function runSettingsNavigationTests() {
  console.log('======================================================');
  console.log('  TEST: SETTINGS UI REDESIGN PHASE 1 (NAVIGATION)');
  console.log('======================================================');

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_settings_nav_'));
  storage.init({ dataRoot: tempDir });

  protocol.handle('lecfal-cover', () => new Response('Not found', { status: 404 }));
  protocol.handle('lecfal-file', () => new Response('Not found', { status: 404 }));

  const dbPath = path.join(tempDir, 'test_settings_nav.db');
  db = new DatabaseManager(dbPath);
  await db.init();

  // Create initial sample data
  const mangaLib = db.createLibrary('Manga');
  const comicsLib = db.createLibrary('Comics');
  const folder = db.addFolder(path.join(tempDir, 'manga_folder'), mangaLib.id);
  db.createTag('Shonen');
  db.createAuthor('Eiichiro Oda');
  try { db.createLanguage('Francés'); } catch (_) {}
  db.createParody('One Piece');
  db.createGroup('Weekly Shonen Jump');
  db.ignoreAuthor('Test Ignored Value');

  // Register IPC Handlers
  ipcMain.handle('library:get-series', async () => []);
  ipcMain.handle('library:get-folders', async () => db.getFolders());
  ipcMain.handle('library:toggle-series-fav', async (event, id) => db.toggleSeriesFavorite(id));
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
    console.log('[Renderer Console]', message);
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

  // Helper inside renderer to get visibility & active states for all sections
  const getSectionStatesScript = `
    (() => {
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

      const sections = {};
      sectionIds.forEach(id => {
        const el = document.getElementById(id);
        const computed = el ? getComputedStyle(el).display : null;
        const hasActiveClass = el ? el.classList.contains('active') : false;
        sections[id] = {
          exists: !!el,
          display: computed,
          activeClass: hasActiveClass,
          isVisible: computed !== 'none'
        };
      });

      const navButtons = {};
      sectionIds.forEach(id => {
        const btn = document.querySelector(\`.settings-nav-item[data-section="\${id}"]\`);
        navButtons[id] = {
          exists: !!btn,
          hasActiveClass: btn ? btn.classList.contains('active') : false,
          label: btn ? btn.querySelector('span')?.textContent.trim() : null
        };
      });

      const settingsView = document.getElementById('settingsView');
      const libraryView = document.getElementById('libraryView');

      return {
        settingsViewVisible: settingsView ? getComputedStyle(settingsView).display !== 'none' : false,
        libraryViewVisible: libraryView ? getComputedStyle(libraryView).display !== 'none' : false,
        sections,
        navButtons
      };
    })()
  `;

  // ----------------------------------------------------
  // TEST A & B: Open Settings -> Appearance is Default
  // ----------------------------------------------------
  console.log('\n--- Test A & B: Settings Opens & Appearance is Default ---');
  await win.webContents.executeJavaScript(`window.lecfalViews.openSettingsView();`);
  await new Promise(r => setTimeout(r, 200));

  let state = await win.webContents.executeJavaScript(getSectionStatesScript);
  assert.strictEqual(state.settingsViewVisible, true, 'Settings view should be visible');
  assert.strictEqual(state.libraryViewVisible, false, 'Library view should be hidden');

  // Verify Appearance is visible and active
  assert.strictEqual(state.sections.sectionAppearance.isVisible, true, 'sectionAppearance must be visible by default');
  assert.strictEqual(state.sections.sectionAppearance.activeClass, true, 'sectionAppearance must have .active class');
  assert.strictEqual(state.navButtons.sectionAppearance.hasActiveClass, true, 'Sidebar Appearance item must be active');

  // Verify all other 9 sections are hidden and their sidebar buttons are inactive
  const otherSectionIds = [
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

  for (const id of otherSectionIds) {
    assert.strictEqual(state.sections[id].isVisible, false, `${id} must be hidden when Appearance is active`);
    assert.strictEqual(state.sections[id].activeClass, false, `${id} must not have .active class`);
    assert.strictEqual(state.navButtons[id].hasActiveClass, false, `Sidebar button for ${id} must not be active`);
  }
  console.log('✓ Test A & B passed: Settings opened with Appearance as default, exactly 1 section visible.');

  // Verify sidebar label for Tags is "Tags" (not "Tags y Géneros")
  assert.strictEqual(state.navButtons.sectionTags.label, 'Tags', 'Sidebar label for tags must be "Tags"');

  // ----------------------------------------------------
  // TESTS C through K: Click each sidebar navigation item
  // ----------------------------------------------------
  const testSections = [
    { id: 'sectionLibraries', name: 'Libraries', testLetter: 'C' },
    { id: 'sectionFolders', name: 'Folders', testLetter: 'D' },
    { id: 'sectionAuthors', name: 'Authors', testLetter: 'E' },
    { id: 'sectionTags', name: 'Tags', testLetter: 'F' },
    { id: 'sectionLanguages', name: 'Languages', testLetter: 'G' },
    { id: 'sectionParodies', name: 'Series / Parodies', testLetter: 'H' },
    { id: 'sectionGroups', name: 'Groups', testLetter: 'I' },
    { id: 'sectionAllCatalogs', name: 'All Catalogs', testLetter: 'J' },
    { id: 'sectionIgnoredAuthors', name: 'Ignored Values', testLetter: 'K' }
  ];

  const allSectionIds = ['sectionAppearance', ...otherSectionIds];

  for (const item of testSections) {
    console.log(`\n--- Test ${item.testLetter}: Clicking ${item.name} (${item.id}) ---`);
    await win.webContents.executeJavaScript(`
      document.querySelector('.settings-nav-item[data-section="${item.id}"]').click();
    `);
    await new Promise(r => setTimeout(r, 100));

    state = await win.webContents.executeJavaScript(getSectionStatesScript);

    // Target section must be visible and active
    assert.strictEqual(state.sections[item.id].isVisible, true, `${item.id} must be visible after click`);
    assert.strictEqual(state.sections[item.id].activeClass, true, `${item.id} must have .active class`);
    assert.strictEqual(state.navButtons[item.id].hasActiveClass, true, `Sidebar button for ${item.id} must be active`);

    // Every other section must be hidden, and their nav items inactive
    let visibleCount = 0;
    for (const otherId of allSectionIds) {
      if (otherId === item.id) {
        visibleCount++;
      } else {
        assert.strictEqual(state.sections[otherId].isVisible, false, `${otherId} must be hidden when ${item.id} is active`);
        assert.strictEqual(state.sections[otherId].activeClass, false, `${otherId} must not have .active class`);
        assert.strictEqual(state.navButtons[otherId].hasActiveClass, false, `Nav button for ${otherId} must not be active`);
      }
    }
    assert.strictEqual(visibleCount, 1, 'Exactly one section must be visible at a time (zero multiple visibility)');
    console.log(`✓ Test ${item.testLetter} & L passed: Only ${item.id} is visible and active.`);
  }

  // ----------------------------------------------------
  // TEST M: openSettingsView('sectionLibraries')
  // ----------------------------------------------------
  console.log('\n--- Test M: openSettingsView("sectionLibraries") opens directly on Libraries ---');
  // First switch away to Appearance
  await win.webContents.executeJavaScript(`window.switchSettingsSection('sectionAppearance');`);
  await new Promise(r => setTimeout(r, 50));

  // Now call openSettingsView with target
  await win.webContents.executeJavaScript(`window.lecfalViews.openSettingsView('sectionLibraries');`);
  await new Promise(r => setTimeout(r, 100));

  state = await win.webContents.executeJavaScript(getSectionStatesScript);
  assert.strictEqual(state.sections.sectionLibraries.isVisible, true, 'sectionLibraries must be visible after openSettingsView("sectionLibraries")');
  assert.strictEqual(state.sections.sectionLibraries.activeClass, true, 'sectionLibraries must have .active class');
  assert.strictEqual(state.navButtons.sectionLibraries.hasActiveClass, true, 'Sidebar Libraries item must be active');
  assert.strictEqual(state.sections.sectionAppearance.isVisible, false, 'sectionAppearance must be hidden');
  console.log('✓ Test M passed: openSettingsView("sectionLibraries") directly opened Libraries section.');

  // ----------------------------------------------------
  // TEST N: Back to Library still works
  // ----------------------------------------------------
  console.log('\n--- Test N: Back to Library button returns to Library ---');
  await win.webContents.executeJavaScript(`
    document.getElementById('btnBackFromSettings').click();
  `);
  await new Promise(r => setTimeout(r, 150));

  state = await win.webContents.executeJavaScript(getSectionStatesScript);
  assert.strictEqual(state.settingsViewVisible, false, 'Settings view should be hidden after Back click');
  assert.strictEqual(state.libraryViewVisible, true, 'Library view should be visible after Back click');
  console.log('✓ Test N passed: Back to Library successfully restored Library view.');

  console.log('\n======================================================');
  console.log('  ALL PHASE 1 SETTINGS NAVIGATION TESTS PASSED');
  console.log('======================================================');

  if (win) {
    win.close();
  }
  if (tempDir && fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
  app.quit();
}

app.whenReady().then(runSettingsNavigationTests).catch(err => {
  console.error('Test failed:', err);
  if (win) win.close();
  app.exit(1);
});

module.exports = runSettingsNavigationTests;
