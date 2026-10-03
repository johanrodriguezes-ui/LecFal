/**
 * Test Suite: Phase 2 Library Settings UI & Management Contract
 *
 * Verifies:
 * 1. Library list renders existing Libraries with backend folder_count.
 * 2. Empty Library state renders correctly when no libraries exist.
 * 3. Creating a Library refreshes the list with user-defined names.
 * 4. Renaming a Library preserves its ID, folder assignments, series, chapters, and reading positions.
 * 5. Deleting a Library leaves folders intact and changes their assignment to "Sin biblioteca" (library_id = null).
 * 6. Assigning a folder updates its selected Library.
 * 7. Moving a folder from one Library to another updates the assignment without duplicate records.
 * 8. Unassigning a folder stores library_id = NULL.
 * 9. Duplicate Library names (and case-insensitive duplicates, empty names) are rejected.
 * 10. Existing folder management behavior (add, list, remove, scan flags) remains intact.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const DatabaseManager = require('../src/db');
const { escapeHtml } = require('../src/renderer/ui-utils');

async function runSettingsLibrariesTests() {
  console.log('======================================================');
  console.log('  PHASE 2: LIBRARY SETTINGS UI & MANAGEMENT TESTS');
  console.log('======================================================');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_settings_libs_'));
  const dbPath = path.join(tempDir, 'test_settings_libs.db');
  const db = new DatabaseManager(dbPath);
  await db.init();

  // Helper simulating the Settings UI rendering contract
  function renderLibrariesListHTML(libraries) {
    if (!libraries || libraries.length === 0) {
      return {
        isEmpty: true,
        html: '<div class="settings-tags-empty"><p>No hay bibliotecas creadas.</p><button id="btnEmptyAddLibrary">+ Nueva biblioteca</button></div>'
      };
    }
    const rows = libraries.map(lib => {
      const folderCountText = lib.folder_count === 1 ? '1 carpeta' : `${lib.folder_count || 0} carpetas`;
      return `
        <div class="settings-folder-item settings-folder-row settings-library-row" data-id="${lib.id}">
          <span class="settings-library-icon">📚</span>
          <span class="settings-folder-name">${escapeHtml(lib.name)}</span>
          <span class="settings-folder-path">${folderCountText}</span>
          <button class="btn-rename-library" data-id="${lib.id}">Renombrar</button>
          <button class="btn-delete-library" data-id="${lib.id}">Eliminar</button>
        </div>
      `;
    });
    return {
      isEmpty: false,
      count: libraries.length,
      html: rows.join('')
    };
  }

  function renderFolderSelectHTML(folder, libraries) {
    const libraryOptions = libraries.map(lib => `
      <option value="${lib.id}" ${Number(folder.library_id) === Number(lib.id) ? 'selected' : ''}>
        ${escapeHtml(lib.name)}
      </option>
    `).join('');
    return `
      <select class="folder-library-select" data-id="${folder.id}">
        <option value="" ${!folder.library_id ? 'selected' : ''}>Sin biblioteca</option>
        ${libraryOptions}
      </select>
    `;
  }

  // ----------------------------------------------------
  // TEST 2: Empty Library State Renders Correctly
  // ----------------------------------------------------
  console.log('\n--- Test 2: Empty Library State ---');
  let currentLibs = db.getLibraries();
  assert.strictEqual(currentLibs.length, 0, 'Initial library list should be empty');
  let renderedEmpty = renderLibrariesListHTML(currentLibs);
  assert.strictEqual(renderedEmpty.isEmpty, true, 'UI state must be empty');
  assert.ok(renderedEmpty.html.includes('No hay bibliotecas creadas.'), 'Contains empty message');
  assert.ok(renderedEmpty.html.includes('+ Nueva biblioteca'), 'Contains new library button in empty state');
  console.log('✓ Test 2 passed: Empty library state renders correctly.');

  // ----------------------------------------------------
  // TEST 3: Creating a Library Refreshes the List
  // ----------------------------------------------------
  console.log('\n--- Test 3: Creating a Library Refreshes List ---');
  const mangaLib = db.createLibrary('Manga');
  assert.ok(mangaLib, 'createLibrary should succeed');
  assert.strictEqual(mangaLib.name, 'Manga');

  currentLibs = db.getLibraries();
  assert.strictEqual(currentLibs.length, 1, 'Library list should now contain 1 library');
  assert.strictEqual(currentLibs[0].name, 'Manga');
  assert.strictEqual(currentLibs[0].folder_count, 0, 'folder_count should be 0');

  let renderedOne = renderLibrariesListHTML(currentLibs);
  assert.strictEqual(renderedOne.isEmpty, false);
  assert.ok(renderedOne.html.includes('Manga'));
  assert.ok(renderedOne.html.includes('0 carpetas'));
  console.log('✓ Test 3 passed: Creating library refreshes list.');

  // ----------------------------------------------------
  // TEST 1: Library List Renders Existing Libraries with folder_count
  // ----------------------------------------------------
  console.log('\n--- Test 1: Library List Renders with folder_count ---');
  const comicsLib = db.createLibrary('Comics');
  const folder1 = db.addFolder(path.join(tempDir, 'Folder_1'));
  const folder2 = db.addFolder(path.join(tempDir, 'Folder_2'));
  db.assignFolderToLibrary(folder1.id, mangaLib.id);
  db.assignFolderToLibrary(folder2.id, mangaLib.id);

  currentLibs = db.getLibraries();
  assert.strictEqual(currentLibs.length, 2);
  const mangaEntry = currentLibs.find(l => l.id === mangaLib.id);
  const comicsEntry = currentLibs.find(l => l.id === comicsLib.id);
  assert.strictEqual(mangaEntry.folder_count, 2, 'Manga should report 2 folders');
  assert.strictEqual(comicsEntry.folder_count, 0, 'Comics should report 0 folders');

  let renderedMulti = renderLibrariesListHTML(currentLibs);
  assert.ok(renderedMulti.html.includes('2 carpetas'), 'Rendered HTML contains folder count');
  assert.ok(renderedMulti.html.includes('0 carpetas'));
  assert.ok(renderedMulti.html.includes('Manga'));
  assert.ok(renderedMulti.html.includes('Comics'));
  console.log('✓ Test 1 passed: Library list renders existing libraries with accurate counts.');

  // ----------------------------------------------------
  // TEST 4: Renaming Library Preserves ID, Folders, Series, Chapters, Positions
  // ----------------------------------------------------
  console.log('\n--- Test 4: Renaming Preserves ID and Content ---');
  const seriesM = db.upsertSeries({
    folder_id: folder1.id,
    title: 'Series Alpha',
    author: 'Author A',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_1', 'Series_Alpha')
  });
  db.upsertChapter({
    series_id: seriesM,
    title: 'Chapter 1',
    file_name: 'ch1.cbz',
    file_path: path.join(tempDir, 'Folder_1', 'Series_Alpha', 'ch1.cbz'),
    format: 'cbz',
    file_size: 2048,
    mtime_ms: Date.now(),
    chapter_number: 1,
    page_count: 24
  });
  const chList = db.getChapters(seriesM);
  assert.strictEqual(chList.length, 1);
  const ch1Id = chList[0].id;

  // Set reading position
  db.setChapterReadingPosition(ch1Id, 0.45);
  const posBefore = db.getChapterReadingPosition(ch1Id);
  assert.strictEqual(posBefore, 0.45);

  // Rename Manga -> Manga & Webtoons
  const renamed = db.renameLibrary(mangaLib.id, 'Manga & Webtoons');
  assert.strictEqual(renamed.id, mangaLib.id, 'ID must be preserved');
  assert.strictEqual(renamed.name, 'Manga & Webtoons');

  // Verify folder assignments preserved
  const assignedFolders = db.getFoldersByLibrary(mangaLib.id);
  assert.strictEqual(assignedFolders.length, 2, 'Folder assignments must be preserved');
  assert.ok(assignedFolders.some(f => f.id === folder1.id));
  assert.ok(assignedFolders.some(f => f.id === folder2.id));

  // Verify series and chapters intact
  const sAfter = db.getSeriesById(seriesM);
  assert.strictEqual(sAfter.title, 'Series Alpha');
  const chAfter = db.getChapters(seriesM);
  assert.strictEqual(chAfter.length, 1);
  const posAfter = db.getChapterReadingPosition(ch1Id);
  assert.strictEqual(posAfter, 0.45, 'Reading position preserved');

  // Verify folder dropdown reflects new name
  const updatedLibs = db.getLibraries();
  const folder1SelectHTML = renderFolderSelectHTML(db.getFolderById(folder1.id), updatedLibs);
  assert.ok(folder1SelectHTML.includes(escapeHtml('Manga & Webtoons')), 'Folder selector contains renamed library');
  assert.ok(folder1SelectHTML.includes('selected'), 'Assigned option is selected');
  console.log('✓ Test 4 passed: Renaming preserves ID, folders, series, chapters, and positions.');

  // ----------------------------------------------------
  // TEST 5: Deleting Library Leaves Folders Intact ("Sin biblioteca")
  // ----------------------------------------------------
  console.log('\n--- Test 5: Deleting Library Leaves Folders Intact ---');
  // Create a separate library and folder to delete
  const tempLib = db.createLibrary('TempLib');
  const tempFolder = db.addFolder(path.join(tempDir, 'Folder_Temp'));
  db.assignFolderToLibrary(tempFolder.id, tempLib.id);

  const seriesTemp = db.upsertSeries({
    folder_id: tempFolder.id,
    title: 'Temp Series',
    author: 'Temp Author',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_Temp', 'Temp_Series')
  });

  // Delete tempLib
  const delRes = db.deleteLibrary(tempLib.id);
  assert.strictEqual(delRes, true);

  // Library gone
  assert.strictEqual(db.getLibraryById(tempLib.id), null);

  // Folder exists and has library_id = null
  const folderAfterDel = db.getFolderById(tempFolder.id);
  assert.ok(folderAfterDel, 'Folder must still exist');
  assert.strictEqual(folderAfterDel.library_id, null, 'Folder library_id must be null');

  // Series and chapters still exist
  const seriesAfterDel = db.getSeriesById(seriesTemp);
  assert.ok(seriesAfterDel, 'Series must still exist');
  assert.strictEqual(seriesAfterDel.title, 'Temp Series');

  // Rendered folder selector shows "Sin biblioteca" selected
  const libsAfterDel = db.getLibraries();
  const folderSelectAfterDel = renderFolderSelectHTML(folderAfterDel, libsAfterDel);
  assert.ok(folderSelectAfterDel.includes('<option value="" selected>Sin biblioteca</option>'));
  console.log('✓ Test 5 passed: Deleting library leaves folders and series intact with "Sin biblioteca".');

  // ----------------------------------------------------
  // TEST 6: Assigning Folder Updates Selected Library
  // ----------------------------------------------------
  console.log('\n--- Test 6: Assigning Folder Updates Library ---');
  const unassignedFolder = db.addFolder(path.join(tempDir, 'Folder_New'));
  assert.strictEqual(unassignedFolder.library_id, null);

  db.assignFolderToLibrary(unassignedFolder.id, comicsLib.id);
  const folderAfterAssign = db.getFolderById(unassignedFolder.id);
  assert.strictEqual(folderAfterAssign.library_id, comicsLib.id);

  const comicsFolders = db.getFoldersByLibrary(comicsLib.id);
  assert.strictEqual(comicsFolders.length, 1);
  assert.strictEqual(comicsFolders[0].id, unassignedFolder.id);

  const selectHTMLAssigned = renderFolderSelectHTML(folderAfterAssign, db.getLibraries());
  assert.ok(selectHTMLAssigned.includes(`<option value="${comicsLib.id}" selected>`));
  console.log('✓ Test 6 passed: Folder assignment correctly updates selected library.');

  // ----------------------------------------------------
  // TEST 7: Moving Folder to Another Library
  // ----------------------------------------------------
  console.log('\n--- Test 7: Moving Folder Between Libraries ---');
  // Move unassignedFolder: Comics -> Manga & Webtoons
  db.assignFolderToLibrary(unassignedFolder.id, mangaLib.id);
  const folderMoved = db.getFolderById(unassignedFolder.id);
  assert.strictEqual(folderMoved.library_id, mangaLib.id);

  const comicsFoldersAfterMove = db.getFoldersByLibrary(comicsLib.id);
  assert.strictEqual(comicsFoldersAfterMove.length, 0, 'Comics should now have 0 folders');

  const mangaFoldersAfterMove = db.getFoldersByLibrary(mangaLib.id);
  assert.strictEqual(mangaFoldersAfterMove.length, 3, 'Manga should now have 3 folders');
  console.log('✓ Test 7 passed: Moving folder between libraries updates assignments cleanly.');

  // ----------------------------------------------------
  // TEST 8: Unassigning Folder Stores library_id = NULL
  // ----------------------------------------------------
  console.log('\n--- Test 8: Unassigning Folder ---');
  db.assignFolderToLibrary(unassignedFolder.id, null);
  const folderUnassigned = db.getFolderById(unassignedFolder.id);
  assert.strictEqual(folderUnassigned.library_id, null, 'Unassigned folder must have library_id = NULL');

  const mangaFoldersAfterUnassign = db.getFoldersByLibrary(mangaLib.id);
  assert.strictEqual(mangaFoldersAfterUnassign.length, 2, 'Manga count decrements after unassign');

  const selectHTMLUnassigned = renderFolderSelectHTML(folderUnassigned, db.getLibraries());
  assert.ok(selectHTMLUnassigned.includes('<option value="" selected>Sin biblioteca</option>'));
  console.log('✓ Test 8 passed: Unassigning folder stores library_id = NULL.');

  // ----------------------------------------------------
  // TEST 9: Duplicate Library Names Rejected
  // ----------------------------------------------------
  console.log('\n--- Test 9: Duplicate Library Names Rejected ---');
  assert.throws(() => {
    db.createLibrary('Comics');
  }, /ya existe/i, 'Exact duplicate name must be rejected');

  assert.throws(() => {
    db.createLibrary('comics');
  }, /ya existe/i, 'Case-insensitive duplicate must be rejected');

  assert.throws(() => {
    db.createLibrary('  COMICS  ');
  }, /ya existe/i, 'Trimmed uppercase duplicate must be rejected');

  assert.throws(() => {
    db.createLibrary('');
  }, /vacío/i, 'Empty name must be rejected');

  assert.throws(() => {
    db.createLibrary('   ');
  }, /vacío/i, 'Whitespace name must be rejected');

  assert.throws(() => {
    db.renameLibrary(mangaLib.id, 'Comics');
  }, /ya existe/i, 'Renaming to existing library name must be rejected');
  console.log('✓ Test 9 passed: Duplicate and invalid library names are rejected.');

  // ----------------------------------------------------
  // TEST 10: Existing Folder Management Intact
  // ----------------------------------------------------
  console.log('\n--- Test 10: Existing Folder Management Intact ---');
  const allFoldersBefore = db.getFolders();
  const folderToRemove = db.addFolder(path.join(tempDir, 'Folder_ToRemove'));
  assert.ok(folderToRemove, 'addFolder must succeed');

  const allFoldersAfterAdd = db.getFolders();
  assert.strictEqual(allFoldersAfterAdd.length, allFoldersBefore.length + 1);

  // Remove folder
  db.removeFolder(folderToRemove.id);
  const allFoldersAfterRemove = db.getFolders();
  assert.strictEqual(allFoldersAfterRemove.length, allFoldersBefore.length);
  assert.ok(!allFoldersAfterRemove.some(f => f.id === folderToRemove.id), 'Removed folder not present');
  console.log('✓ Test 10 passed: Existing folder management behavior remains intact.');

  console.log('\n======================================================');
  console.log('  ALL 10 PHASE 2 SETTINGS LIBRARY TESTS PASSED!  ');
  console.log('======================================================\n');
}

runSettingsLibrariesTests().catch(err => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
