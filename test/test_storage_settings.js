/**
 * Test Suite: Storage & Portability Settings UI — Phase 5.2
 *
 * Verifies:
 * A. Storage section exists and is reachable from Settings navigation.
 * B. Standard mode renders correctly.
 * C. Portable mode renders correctly.
 * D. Current root is displayed correctly.
 * E. Migration requires explicit confirmation.
 * F. Cancel leaves storage unchanged.
 * G. Destination writability is validated.
 * H. Existing destination files are not overwritten.
 * I. Source remains intact after successful migration.
 * J. Failed migration leaves source intact.
 * K. No automatic migration occurs.
 * L. Storage mode cannot be changed silently.
 * M. Existing Settings sections/navigation remain functional.
 * N. No DB schema changes.
 * O. Full test suite still passes.
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
let tempBaseDir = null;
let standardDir = null;
let portableDir = null;
let appDir = null;

// Simulated in-memory storage controller for IPC
let currentStorageMode = 'standard';
let simulateUnwritableDest = false;

async function runStorageSettingsTests() {
  console.log('======================================================');
  console.log('  TEST: STORAGE & PORTABILITY SETTINGS UI (PHASE 5.2)');
  console.log('======================================================');

  tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_storage_ui_'));
  appDir = path.join(tempBaseDir, 'app');
  standardDir = path.join(tempBaseDir, 'standard_config');
  portableDir = path.join(appDir, 'data');

  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(standardDir, { recursive: true });
  fs.mkdirSync(portableDir, { recursive: true });

  // Initialize storage in standard mode
  storage.init({
    dataRoot: standardDir,
    appDir: appDir,
    mode: 'standard'
  });

  protocol.handle('lecfal-cover', () => new Response('Not found', { status: 404 }));
  protocol.handle('lecfal-file', () => new Response('Not found', { status: 404 }));

  const dbPath = path.join(standardDir, 'lecfal.db');
  db = new DatabaseManager(dbPath);
  await db.init();

  // Create initial sample data
  const mangaLib = db.createLibrary('Manga');
  db.addFolder(path.join(tempBaseDir, 'manga_folder'), mangaLib.id);
  db.createAuthor('Eiichiro Oda');
  db.createTag('Shonen');

  // Register Standard Library / Catalog / Settings IPC handlers needed by renderer.js
  ipcMain.handle('library:get-series', async () => []);
  ipcMain.handle('library:get-folders', async () => db.getFolders());
  ipcMain.handle('library:toggle-series-fav', async (event, id) => db.toggleSeriesFavorite(id));
  ipcMain.handle('library:get-series-detail', async () => null);
  ipcMain.handle('tags:get-all', async () => db.getAllTags());
  ipcMain.handle('authors:get-all', async () => db.getAllAuthors());
  ipcMain.handle('authors:get-all-ignored', async () => db.getAllIgnoredAuthors());
  ipcMain.handle('languages:get-all', async () => db.getAllLanguages());
  ipcMain.handle('parodies:get-all', async () => db.getAllParodies());
  ipcMain.handle('groups:get-all', async () => db.getAllGroups());
  ipcMain.handle('libraries:get-all', async () => db.getAllLibraries());
  ipcMain.handle('libraries:get-folders-by-library', async () => []);
  ipcMain.handle('settings:get', async (event, key, def) => db.getSetting(key, def));
  ipcMain.handle('settings:set', async (event, key, val) => { db.setSetting(key, val); return true; });
  ipcMain.handle('system:get-logs', async () => []);
  ipcMain.handle('thumbnails:get-stats', async () => ({ totalCovers: 0, totalDiskSizeMB: 0 }));
  ipcMain.handle('system:get-version', () => '1.0.0-test');

  // Register Storage IPC Handlers
  ipcMain.handle('storage:get-info', async () => {
    const isPort = currentStorageMode === 'portable';
    return {
      mode: currentStorageMode,
      isPortable: isPort,
      storageRoot: isPort ? portableDir : standardDir,
      standardPath: standardDir,
      portablePath: portableDir,
      isPortableAvailable: true,
      appDir: appDir
    };
  });

  ipcMain.handle('storage:check-destination', async (event, { targetMode } = {}) => {
    const mode = targetMode || (currentStorageMode === 'portable' ? 'standard' : 'portable');
    const targetPath = (mode === 'portable') ? portableDir : standardDir;
    const isWritable = simulateUnwritableDest ? false : storage.isWritable(targetPath);
    let hasExistingData = false;
    const existingFiles = [];

    if (fs.existsSync(targetPath)) {
      try {
        const entries = fs.readdirSync(targetPath);
        if (entries.length > 0) {
          hasExistingData = true;
          for (const e of entries) {
            existingFiles.push(e);
          }
        }
      } catch (_) {}
    }

    return {
      targetMode: mode,
      targetPath,
      isWritable,
      hasExistingData,
      existingFiles
    };
  });

  ipcMain.handle('storage:migrate', async (event, options = {}) => {
    const targetMode = options.targetMode || (currentStorageMode === 'portable' ? 'standard' : 'portable');
    const sourceRoot = (currentStorageMode === 'portable') ? portableDir : standardDir;
    const targetRoot = (targetMode === 'portable') ? portableDir : standardDir;

    if (simulateUnwritableDest || !storage.isWritable(targetRoot)) {
      return {
        success: false,
        error: `El directorio de destino no tiene permisos de escritura: ${targetRoot}`,
        copied: [],
        skipped: [],
        errors: [`El directorio de destino no tiene permisos de escritura: ${targetRoot}`]
      };
    }

    const result = storage.migrateStorage(sourceRoot, targetRoot, {
      includeRegenerable: options.includeRegenerable !== false,
      includeLogs: options.includeLogs !== false,
      dryRun: options.dryRun === true
    });

    if (result.success && options.switchModeAfter === true) {
      currentStorageMode = targetMode;
    }

    return result;
  });

  ipcMain.handle('storage:set-mode', async (event, { mode } = {}) => {
    if (mode !== 'standard' && mode !== 'portable') {
      return { success: false, error: `Modo de almacenamiento inválido: "${mode}"` };
    }

    if (mode === 'portable' && simulateUnwritableDest) {
      return {
        success: false,
        error: `El directorio de la aplicación no tiene permisos de escritura para modo portable.`
      };
    }

    currentStorageMode = mode;
    return {
      success: true,
      mode: currentStorageMode,
      storageRoot: currentStorageMode === 'portable' ? portableDir : standardDir
    };
  });

  // Launch BrowserWindow
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  // Wait for LecFal view modules to mount
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const check = () => {
        if (document.getElementById('settingsView') && window.switchSettingsSection && window.storageSettings) resolve();
        else setTimeout(check, 50);
      };
      check();
    })
  `);
  console.log('✓ Initial window and storageSettings loaded.');

  // Open Settings View
  await win.webContents.executeJavaScript(`
    window.switchSettingsSection('sectionStorage');
  `);
  await new Promise(r => setTimeout(r, 200));

  // ====================================================
  // TEST A: Storage Section Exists and Reachable
  // ====================================================
  console.log('\n--- Test A: Storage Section Exists & Reachable from Navigation ---');
  const navCheck = await win.webContents.executeJavaScript(`
    (() => {
      const section = document.getElementById('sectionStorage');
      const navItem = document.querySelector('.settings-nav-item[data-section="sectionStorage"]');
      const activeSectionId = window.getCurrentSettingsSection();
      const isVisible = section ? getComputedStyle(section).display !== 'none' : false;
      const navItemActive = navItem ? navItem.classList.contains('active') : false;

      // Verify other sections are hidden
      const appearanceVisible = getComputedStyle(document.getElementById('sectionAppearance')).display !== 'none';
      const librariesVisible = getComputedStyle(document.getElementById('sectionLibraries')).display !== 'none';

      return {
        hasSection: !!section,
        hasNavItem: !!navItem,
        activeSectionId,
        isVisible,
        navItemActive,
        othersHidden: !appearanceVisible && !librariesVisible
      };
    })()
  `);

  assert.strictEqual(navCheck.hasSection, true, '#sectionStorage must exist in DOM');
  assert.strictEqual(navCheck.hasNavItem, true, 'Nav item for sectionStorage must exist in sidebar');
  assert.strictEqual(navCheck.activeSectionId, 'sectionStorage', 'Active section must be sectionStorage');
  assert.strictEqual(navCheck.isVisible, true, '#sectionStorage must be visible');
  assert.strictEqual(navCheck.navItemActive, true, 'Sidebar nav item must have active class');
  assert.strictEqual(navCheck.othersHidden, true, 'Other sections must be hidden');
  console.log('✓ Test A passed: Storage section exists and is reachable via navigation.');

  // ====================================================
  // TEST B: Standard Mode Renders Correctly
  // ====================================================
  console.log('\n--- Test B: Standard Mode Renders Correctly ---');
  currentStorageMode = 'standard';
  await win.webContents.executeJavaScript(`window.storageSettings.renderStorageSettings();`);
  await new Promise(r => setTimeout(r, 100));

  const standardUiState = await win.webContents.executeJavaScript(`
    (() => {
      const badge = document.getElementById('storageCurrentModeBadge');
      const btnPortable = document.getElementById('btnSwitchToPortable');
      const btnStandard = document.getElementById('btnSwitchToStandard');
      const btnMigrate = document.getElementById('btnMigrateStorage');

      return {
        badgeText: badge ? badge.textContent.trim() : null,
        badgeClass: badge ? badge.className : null,
        btnPortableVisible: btnPortable ? getComputedStyle(btnPortable).display !== 'none' : false,
        btnStandardVisible: btnStandard ? getComputedStyle(btnStandard).display !== 'none' : false,
        btnMigrateVisible: btnMigrate ? getComputedStyle(btnMigrate).display !== 'none' : false
      };
    })()
  `);

  assert.strictEqual(standardUiState.badgeText, 'Estándar', 'Badge must display "Estándar"');
  assert.strictEqual(standardUiState.btnPortableVisible, true, 'Cambiar a modo portable must be visible in standard mode');
  assert.strictEqual(standardUiState.btnStandardVisible, false, 'Cambiar a modo estándar must NOT be visible in standard mode');
  assert.strictEqual(standardUiState.btnMigrateVisible, true, 'Migrar datos must be visible');
  console.log('✓ Test B passed: Standard mode renders appropriate badge and actions.');

  // ====================================================
  // TEST C: Portable Mode Renders Correctly
  // ====================================================
  console.log('\n--- Test C: Portable Mode Renders Correctly ---');
  currentStorageMode = 'portable';
  await win.webContents.executeJavaScript(`window.storageSettings.renderStorageSettings();`);
  await new Promise(r => setTimeout(r, 100));

  const portableUiState = await win.webContents.executeJavaScript(`
    (() => {
      const badge = document.getElementById('storageCurrentModeBadge');
      const btnPortable = document.getElementById('btnSwitchToPortable');
      const btnStandard = document.getElementById('btnSwitchToStandard');
      const btnMigrate = document.getElementById('btnMigrateStorage');

      return {
        badgeText: badge ? badge.textContent.trim() : null,
        badgeClass: badge ? badge.className : null,
        btnPortableVisible: btnPortable ? getComputedStyle(btnPortable).display !== 'none' : false,
        btnStandardVisible: btnStandard ? getComputedStyle(btnStandard).display !== 'none' : false,
        btnMigrateVisible: btnMigrate ? getComputedStyle(btnMigrate).display !== 'none' : false
      };
    })()
  `);

  assert.strictEqual(portableUiState.badgeText, 'Portable', 'Badge must display "Portable"');
  assert.strictEqual(portableUiState.btnStandardVisible, true, 'Cambiar a modo estándar must be visible in portable mode');
  assert.strictEqual(portableUiState.btnPortableVisible, false, 'Cambiar a modo portable must NOT be visible in portable mode');
  assert.strictEqual(portableUiState.btnMigrateVisible, true, 'Migrar datos must be visible');
  console.log('✓ Test C passed: Portable mode renders appropriate badge and actions.');

  // ====================================================
  // TEST D: Current Root is Displayed Correctly
  // ====================================================
  console.log('\n--- Test D: Current Root Displayed Correctly ---');
  // In portable mode:
  let pathText = await win.webContents.executeJavaScript(`
    document.getElementById('storageCurrentPath').textContent.trim();
  `);
  assert.strictEqual(pathText, portableDir, 'Current path must match active portable directory');

  // Switch back to standard mode:
  currentStorageMode = 'standard';
  await win.webContents.executeJavaScript(`window.storageSettings.renderStorageSettings();`);
  await new Promise(r => setTimeout(r, 100));
  pathText = await win.webContents.executeJavaScript(`
    document.getElementById('storageCurrentPath').textContent.trim();
  `);
  assert.strictEqual(pathText, standardDir, 'Current path must match active standard directory');
  console.log('✓ Test D passed: Storage root path is accurately displayed.');

  // ====================================================
  // TEST E: Migration Requires Explicit Confirmation
  // ====================================================
  console.log('\n--- Test E: Migration Requires Explicit Confirmation ---');
  // Open migration modal
  await win.webContents.executeJavaScript(`
    document.getElementById('btnMigrateStorage').click();
  `);
  await new Promise(r => setTimeout(r, 150));

  const modalState = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.getElementById('modalMigrateStorage');
      const isVisible = modal ? getComputedStyle(modal).display !== 'none' : false;
      const srcText = document.getElementById('migrateModalSource')?.textContent.trim();
      const dstText = document.getElementById('migrateModalDestination')?.textContent.trim();
      const hasItemsList = document.querySelectorAll('#modalMigrateStorage .storage-item-row').length;

      return {
        isVisible,
        srcText,
        dstText,
        hasItemsList
      };
    })()
  `);

  assert.strictEqual(modalState.isVisible, true, 'Migration modal must open on click');
  assert.strictEqual(modalState.srcText, standardDir, 'Modal must show current source location');
  assert.strictEqual(modalState.dstText, portableDir, 'Modal must show target destination location');
  assert.ok(modalState.hasItemsList >= 4, 'Modal must display what will be migrated (DB, config, thumbnails, logs)');
  console.log('✓ Test E passed: Migration modal presents all required information and awaits confirmation.');

  // ====================================================
  // TEST F: Cancel Leaves Storage Unchanged
  // ====================================================
  console.log('\n--- Test F: Cancel Leaves Storage Unchanged ---');
  await win.webContents.executeJavaScript(`
    document.getElementById('btnCancelMigrateStorage').click();
  `);
  await new Promise(r => setTimeout(r, 100));

  const afterCancelState = await win.webContents.executeJavaScript(`
    (() => {
      const modal = document.getElementById('modalMigrateStorage');
      return {
        isOpen: modal ? getComputedStyle(modal).display !== 'none' : false,
        mode: window.storageSettings.getStorageSettingsState().mode
      };
    })()
  `);

  assert.strictEqual(afterCancelState.isOpen, false, 'Modal must close on cancel');
  assert.strictEqual(currentStorageMode, 'standard', 'Current storage mode must remain standard');
  console.log('✓ Test F passed: Cancelling leaves storage mode and files untouched.');

  // ====================================================
  // TEST G: Destination Writability is Validated
  // ====================================================
  console.log('\n--- Test G: Destination Writability Validated ---');
  simulateUnwritableDest = true;
  await win.webContents.executeJavaScript(`
    window.storageSettings.openMigrateModal();
  `);
  await new Promise(r => setTimeout(r, 150));

  // Confirm button should be disabled or error should display on attempt
  const unwritableState = await win.webContents.executeJavaScript(`
    (() => {
      const btnConfirm = document.getElementById('btnConfirmMigrateStorage');
      return {
        disabled: btnConfirm ? btnConfirm.disabled : false,
        noticeText: document.getElementById('migrateModalNotice')?.textContent || ''
      };
    })()
  `);

  assert.ok(
    unwritableState.disabled || unwritableState.noticeText.includes('permisos de escritura'),
    'Unwritable destination must disable confirmation or show clear warning'
  );

  // If clicked directly, handleConfirmMigrate must reject
  await win.webContents.executeJavaScript(`
    window.storageSettings.handleConfirmMigrate();
  `);
  await new Promise(r => setTimeout(r, 100));

  const errorText = await win.webContents.executeJavaScript(`
    document.getElementById('migrateModalError')?.textContent || '';
  `);
  assert.ok(errorText.includes('permisos de escritura'), 'Error message must specify destination not writable');
  assert.strictEqual(currentStorageMode, 'standard', 'Mode must not switch if destination unwritable');

  await win.webContents.executeJavaScript(`window.storageSettings.closeMigrateModal();`);
  simulateUnwritableDest = false;
  console.log('✓ Test G passed: Unwritable destinations are safely detected and rejected.');

  // ====================================================
  // TEST H: Existing Destination Files Not Overwritten
  // ====================================================
  console.log('\n--- Test H: Existing Destination Files Not Overwritten ---');
  // Create a file in destination before migration
  const existingFilePath = path.join(portableDir, 'existing_file.txt');
  fs.writeFileSync(existingFilePath, 'ORIGINAL_PORTABLE_CONTENT', 'utf8');

  // Create file in source with same name but different content
  const sourceConflictPath = path.join(standardDir, 'existing_file.txt');
  fs.writeFileSync(sourceConflictPath, 'DIFFERENT_SOURCE_CONTENT', 'utf8');

  // Also create a sample database file and config in source
  fs.writeFileSync(path.join(standardDir, 'lecfal.db'), 'DUMMY_DB_DATA', 'utf8');
  fs.mkdirSync(path.join(standardDir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(standardDir, 'config', 'settings.json'), '{"theme":"dark"}', 'utf8');

  // Perform migration
  await win.webContents.executeJavaScript(`
    window.storageSettings.openMigrateModal();
  `);
  await new Promise(r => setTimeout(r, 100));
  await win.webContents.executeJavaScript(`
    window.storageSettings.handleConfirmMigrate();
  `);
  await new Promise(r => setTimeout(r, 300));

  // Destination file must remain ORIGINAL_PORTABLE_CONTENT
  const preservedContent = fs.readFileSync(existingFilePath, 'utf8');
  assert.strictEqual(preservedContent, 'ORIGINAL_PORTABLE_CONTENT', 'Existing destination file must NOT be overwritten');
  console.log('✓ Test H passed: Existing destination files are strictly preserved.');

  // ====================================================
  // TEST I: Source Remains Intact After Successful Migration
  // ====================================================
  console.log('\n--- Test I: Source Remains Intact After Migration ---');
  assert.strictEqual(fs.existsSync(sourceConflictPath), true, 'Source conflict file must still exist');
  assert.strictEqual(fs.readFileSync(sourceConflictPath, 'utf8'), 'DIFFERENT_SOURCE_CONTENT', 'Source file content must be untouched');
  assert.strictEqual(fs.existsSync(path.join(standardDir, 'lecfal.db')), true, 'Source lecfal.db must still exist');
  assert.strictEqual(fs.readFileSync(path.join(standardDir, 'lecfal.db'), 'utf8'), 'DUMMY_DB_DATA', 'Source db content must be untouched');
  assert.strictEqual(fs.existsSync(path.join(portableDir, 'lecfal.db')), true, 'Target lecfal.db must exist in destination');
  console.log('✓ Test I passed: Source data is 100% preserved after migration.');

  // ====================================================
  // TEST J: Failed Migration Leaves Source Intact
  // ====================================================
  console.log('\n--- Test J: Failed Migration Leaves Source Intact ---');
  // Attempt invalid migration to non-existent uncreatable destination path
  const dummyRes = storage.migrateStorage(standardDir, '/dev/null/impossible_dir_xyz');
  assert.strictEqual(dummyRes.success, false, 'Impossible migration must fail safely');
  assert.strictEqual(fs.existsSync(path.join(standardDir, 'lecfal.db')), true, 'Source files must remain intact upon failure');
  console.log('✓ Test J passed: Failed migration leaves source data untouched.');

  // ====================================================
  // TEST K: No Automatic Migration Occurs
  // ====================================================
  console.log('\n--- Test K: No Automatic Migration Occurs ---');
  const filesBeforeNav = fs.readdirSync(portableDir).sort();

  // Navigate through all sections
  await win.webContents.executeJavaScript(`
    window.switchSettingsSection('sectionAppearance');
    window.switchSettingsSection('sectionLibraries');
    window.switchSettingsSection('sectionFolders');
    window.switchSettingsSection('sectionStorage');
  `);
  await new Promise(r => setTimeout(r, 200));

  const filesAfterNav = fs.readdirSync(portableDir).sort();
  assert.deepStrictEqual(filesBeforeNav, filesAfterNav, 'Navigating sections must not trigger automatic migration');
  console.log('✓ Test K passed: No automatic migration occurs during navigation or render.');

  // ====================================================
  // TEST L: Storage Mode Cannot Be Changed Silently
  // ====================================================
  console.log('\n--- Test L: Storage Mode Cannot Be Changed Silently ---');
  // 1. Click "Cambiar a modo estándar" in UI (currently in portable mode from migration in test H)
  await win.webContents.executeJavaScript(`
    document.getElementById('btnSwitchToStandard').click();
  `);
  await new Promise(r => setTimeout(r, 100));

  const changeModalOpen = await win.webContents.executeJavaScript(`
    window.storageSettings.isChangeModeModalOpen();
  `);
  assert.strictEqual(changeModalOpen, true, 'Change mode modal must open before switching mode');

  // Cancel it
  await win.webContents.executeJavaScript(`
    document.getElementById('btnCancelChangeMode').click();
  `);
  await new Promise(r => setTimeout(r, 100));

  assert.strictEqual(currentStorageMode, 'portable', 'Mode must not change if confirmation is cancelled');

  // Re-open and confirm
  await win.webContents.executeJavaScript(`
    document.getElementById('btnSwitchToStandard').click();
  `);
  await new Promise(r => setTimeout(r, 100));
  await win.webContents.executeJavaScript(`
    document.getElementById('btnConfirmChangeMode').click();
  `);
  await new Promise(r => setTimeout(r, 200));

  assert.strictEqual(currentStorageMode, 'standard', 'Mode must only change upon explicit user confirmation');
  console.log('✓ Test L passed: Storage mode cannot be changed silently.');

  // ====================================================
  // TEST M: Existing Settings Sections / Navigation Functional
  // ====================================================
  console.log('\n--- Test M: Existing Settings Sections Navigation Functional ---');
  const sectionsToVerify = [
    'sectionAppearance',
    'sectionLibraries',
    'sectionFolders',
    'sectionAuthors',
    'sectionTags',
    'sectionLanguages',
    'sectionParodies',
    'sectionGroups',
    'sectionAllCatalogs',
    'sectionIgnoredAuthors',
    'sectionStorage'
  ];

  for (const sId of sectionsToVerify) {
    await win.webContents.executeJavaScript(`window.switchSettingsSection('${sId}');`);
    const isAct = await win.webContents.executeJavaScript(`
      (() => {
        const el = document.getElementById('${sId}');
        return el ? getComputedStyle(el).display !== 'none' : false;
      })()
    `);
    assert.strictEqual(isAct, true, `Section ${sId} must be visible when switched to`);
  }
  console.log('✓ Test M passed: All 11 settings sections switch and display correctly.');

  // ====================================================
  // TEST N: No Database Schema Changes
  // ====================================================
  console.log('\n--- Test N: No DB Schema Changes ---');
  const tables = db.db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")[0].values.map(v => v[0]);
  const canonicalTables = [
    'authors',
    'chapters',
    'groups',
    'ignored_authors',
    'languages',
    'libraries',
    'library_folders',
    'series',
    'series_authors',
    'series_groups',
    'series_languages',
    'series_parodies',
    'series_parodies_rel',
    'series_tags',
    'settings',
    'tags'
  ];

  for (const t of canonicalTables) {
    assert.ok(tables.includes(t), `Canonical table "${t}" must exist in schema`);
  }
  assert.strictEqual(tables.filter(t => !t.startsWith('sqlite_')).length, canonicalTables.length, 'No extra tables may be added to schema');
  console.log('✓ Test N passed: Database schema is completely unchanged.');

  console.log('\n======================================================');
  console.log('  ALL PHASE 5.2 STORAGE SETTINGS UI TESTS PASSED (A - N)');
  console.log('======================================================\n');
}

app.whenReady().then(async () => {
  try {
    await runStorageSettingsTests();
    app.quit();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILURE:', err);
    if (win) win.close();
    app.quit();
    process.exit(1);
  }
});
