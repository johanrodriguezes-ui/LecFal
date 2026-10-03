/**
 * Test Suite: Phase 1 Library Backend & Data Model
 *
 * Verifies:
 * A. Create library ("Manga", verify it exists)
 * B. Case-insensitive uniqueness ("Manga" vs "manga" rejected)
 * C. Existing folders remain valid (library_id = NULL)
 * D. Assign folder (Folder A -> Manga, Folder B -> Comics)
 * E. Reassign folder (Folder A: Manga -> Comics, no duplicate folders)
 * F. Delete library (Manga deleted -> folders remain with library_id = NULL, series & chapters preserved)
 * G. Library filtering (getSeriesList with libraryId returns correct series, empty returns both)
 * H. Library + existing filters (libraryId + author + tag combine correctly)
 * I. Library + favorites (libraryId + favoriteOnly returns only favorites in that library)
 * J. Library + Advanced Search arrays (libraryId + authors AND + tags AND + languages OR)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const DatabaseManager = require('../../src/core/db');

async function runLibraryTests() {
  console.log('======================================================');
  console.log('  PHASE 1: LIBRARY BACKEND & DATA MODEL TESTS');
  console.log('======================================================');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_libraries_'));
  const dbPath = path.join(tempDir, 'test_libraries.db');
  const db = new DatabaseManager(dbPath);
  await db.init();

  // ----------------------------------------------------
  // TEST A: Create Library
  // ----------------------------------------------------
  console.log('\n--- Test A: Create Library ---');
  const mangaLib = db.createLibrary('Manga', { icon: 'book-open', color: '#ff5722' });
  assert.ok(mangaLib, 'createLibrary should return created library');
  assert.strictEqual(typeof mangaLib.id, 'number', 'Library ID should be a number');
  assert.strictEqual(mangaLib.name, 'Manga', 'Library name should be Manga');
  assert.strictEqual(mangaLib.icon, 'book-open', 'Library icon should be book-open');
  assert.strictEqual(mangaLib.color, '#ff5722', 'Library color should be #ff5722');

  const fetchedLib = db.getLibraryById(mangaLib.id);
  assert.ok(fetchedLib, 'getLibraryById should find created library');
  assert.strictEqual(fetchedLib.name, 'Manga');
  assert.strictEqual(fetchedLib.icon, 'book-open');

  const allLibs = db.getLibraries();
  assert.strictEqual(allLibs.length, 1, 'getLibraries should return 1 library');
  assert.strictEqual(allLibs[0].id, mangaLib.id);
  assert.strictEqual(allLibs[0].folder_count, 0, 'folder_count should initially be 0');
  console.log('✓ Test A passed: Library created and verified.');

  // ----------------------------------------------------
  // TEST B: Case-insensitive Uniqueness & Validation
  // ----------------------------------------------------
  console.log('\n--- Test B: Case-insensitive Uniqueness & Validation ---');
  assert.throws(() => {
    db.createLibrary('Manga');
  }, /ya existe|already exists/i, 'Creating duplicate library with identical casing must throw');

  assert.throws(() => {
    db.createLibrary('manga');
  }, /already existe|ya existe/i, 'Creating duplicate library with lowercase casing must throw');

  assert.throws(() => {
    db.createLibrary('  MANGA  ');
  }, /ya existe|already exists/i, 'Creating duplicate library with trimmed uppercase casing must throw');

  assert.throws(() => {
    db.createLibrary('');
  }, /vacío|empty/i, 'Creating library with empty name must throw');

  assert.throws(() => {
    db.createLibrary('   ');
  }, /vacío|empty/i, 'Creating library with whitespace-only name must throw');

  // Verify rename validation as well
  assert.throws(() => {
    db.renameLibrary(mangaLib.id, '');
  }, /vacío|empty/i, 'Renaming library with empty name must throw');

  // Rename to Manga_Renamed then back
  const renamed = db.renameLibrary(mangaLib.id, 'Manga_Renamed');
  assert.strictEqual(renamed.name, 'Manga_Renamed');
  db.renameLibrary(mangaLib.id, 'Manga');
  assert.strictEqual(db.getLibraryById(mangaLib.id).name, 'Manga');

  console.log('✓ Test B passed: Case-insensitive uniqueness and validation verified.');

  // ----------------------------------------------------
  // TEST C: Existing Folders Remain Valid (library_id = NULL)
  // ----------------------------------------------------
  console.log('\n--- Test C: Existing Folders Remain Valid (library_id = NULL) ---');
  const folderUnassigned = db.addFolder(path.join(tempDir, 'unassigned_folder'));
  assert.ok(folderUnassigned, 'Folder should be created');
  assert.strictEqual(folderUnassigned.library_id, null, 'New folder without library should have library_id = null');

  const fetchedFolder = db.getFolderById(folderUnassigned.id);
  assert.strictEqual(fetchedFolder.library_id, null, 'Fetched folder should have library_id = null');

  const allFolders = db.getFolders();
  const found = allFolders.find(f => f.id === folderUnassigned.id);
  assert.ok(found, 'Folder should be in allFolders list');
  assert.strictEqual(found.library_id, null, 'Folder in getFolders() should have library_id = null');
  console.log('✓ Test C passed: Existing folders remain valid with library_id = NULL.');

  // ----------------------------------------------------
  // TEST D: Assign Folder
  // ----------------------------------------------------
  console.log('\n--- Test D: Assign Folder ---');
  const comicsLib = db.createLibrary('Comics', { icon: 'layers', color: '#10b981' });
  const folderA = db.addFolder(path.join(tempDir, 'Folder_A'));
  const folderB = db.addFolder(path.join(tempDir, 'Folder_B'));

  db.assignFolderToLibrary(folderA.id, mangaLib.id);
  db.assignFolderToLibrary(folderB.id, comicsLib.id);

  const folderAFetched = db.getFolderById(folderA.id);
  const folderBFetched = db.getFolderById(folderB.id);

  assert.strictEqual(folderAFetched.library_id, mangaLib.id, 'Folder A must belong to Manga');
  assert.strictEqual(folderBFetched.library_id, comicsLib.id, 'Folder B must belong to Comics');

  const mangaFolders = db.getFoldersByLibrary(mangaLib.id);
  assert.strictEqual(mangaFolders.length, 1, 'Manga library must have 1 folder');
  assert.strictEqual(mangaFolders[0].id, folderA.id);

  const comicsFolders = db.getFoldersByLibrary(comicsLib.id);
  assert.strictEqual(comicsFolders.length, 1, 'Comics library must have 1 folder');
  assert.strictEqual(comicsFolders[0].id, folderB.id);

  const libsWithCounts = db.getLibraries();
  const mangaCount = libsWithCounts.find(l => l.id === mangaLib.id).folder_count;
  const comicsCount = libsWithCounts.find(l => l.id === comicsLib.id).folder_count;
  assert.strictEqual(mangaCount, 1, 'Manga folder_count should be 1');
  assert.strictEqual(comicsCount, 1, 'Comics folder_count should be 1');
  console.log('✓ Test D passed: Folder assignments verified.');

  // ----------------------------------------------------
  // TEST E: Reassign Folder
  // ----------------------------------------------------
  console.log('\n--- Test E: Reassign Folder ---');
  // Move Folder A: Manga -> Comics
  db.assignFolderToLibrary(folderA.id, comicsLib.id);

  const folderAReassigned = db.getFolderById(folderA.id);
  assert.strictEqual(folderAReassigned.library_id, comicsLib.id, 'Folder A must now belong to Comics');

  const mangaFoldersAfter = db.getFoldersByLibrary(mangaLib.id);
  assert.strictEqual(mangaFoldersAfter.length, 0, 'Manga should now have 0 folders');

  const comicsFoldersAfter = db.getFoldersByLibrary(comicsLib.id);
  assert.strictEqual(comicsFoldersAfter.length, 2, 'Comics should now have 2 folders');
  assert.ok(comicsFoldersAfter.some(f => f.id === folderA.id), 'Comics contains Folder A');
  assert.ok(comicsFoldersAfter.some(f => f.id === folderB.id), 'Comics contains Folder B');

  // Verify total folder count is not duplicated
  const totalFoldersCount = db.getFolders().length;
  assert.strictEqual(totalFoldersCount, 3, 'Total folders count should remain exactly 3');

  // Move Folder A back to Manga for subsequent tests
  db.assignFolderToLibrary(folderA.id, mangaLib.id);
  assert.strictEqual(db.getFolderById(folderA.id).library_id, mangaLib.id);
  console.log('✓ Test E passed: Folder reassignment verified.');

  // ----------------------------------------------------
  // TEST F: Delete Library
  // ----------------------------------------------------
  console.log('\n--- Test F: Delete Library ---');
  // Create a separate library to delete, with a folder, series, and chapters
  const deleteLib = db.createLibrary('ToDelete');
  const deleteFolder = db.addFolder(path.join(tempDir, 'Folder_ToDelete'));
  db.assignFolderToLibrary(deleteFolder.id, deleteLib.id);

  const seriesInDelete = db.upsertSeries({
    folder_id: deleteFolder.id,
    title: 'Series To Preserve',
    author: 'Author Preserved',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_ToDelete', 'Series_1')
  });

  db.upsertChapter({
    series_id: seriesInDelete,
    title: 'Chapter 1',
    file_name: 'ch1.cbz',
    file_path: path.join(tempDir, 'Folder_ToDelete', 'Series_1', 'ch1.cbz'),
    format: 'cbz',
    file_size: 1024,
    mtime_ms: Date.now(),
    chapter_number: 1,
    page_count: 20
  });

  // Now delete the library
  const deleteResult = db.deleteLibrary(deleteLib.id);
  assert.strictEqual(deleteResult, true, 'deleteLibrary should return true');

  // 1. Library no longer exists
  assert.strictEqual(db.getLibraryById(deleteLib.id), null, 'Deleted library must not exist');

  // 2. Assigned folder still exists
  const folderAfterLibDelete = db.getFolderById(deleteFolder.id);
  assert.ok(folderAfterLibDelete, 'Folder must still exist');

  // 3. Folder library_id becomes NULL
  assert.strictEqual(folderAfterLibDelete.library_id, null, 'Folder library_id must become NULL');

  // 4. Series remains intact
  const seriesAfterLibDelete = db.getSeriesById(seriesInDelete);
  assert.ok(seriesAfterLibDelete, 'Series must still exist');
  assert.strictEqual(seriesAfterLibDelete.title, 'Series To Preserve');

  // 5. Chapters remain intact
  const chaptersAfterLibDelete = db.getChapters(seriesInDelete);
  assert.strictEqual(chaptersAfterLibDelete.length, 1, 'Chapters must still exist');
  assert.strictEqual(chaptersAfterLibDelete[0].title, 'Chapter 1');
  console.log('✓ Test F passed: Library deletion preserves folders, series, and chapters.');

  // ----------------------------------------------------
  // TEST G: Library Filtering
  // ----------------------------------------------------
  console.log('\n--- Test G: Library Filtering ---');
  // Folder A -> mangaLib (id = mangaLib.id)
  // Folder B -> comicsLib (id = comicsLib.id)
  const seriesM1 = db.upsertSeries({
    folder_id: folderA.id,
    title: 'Manga One Piece',
    author: 'Oda',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_A', 'Manga_One_Piece')
  });

  const seriesC1 = db.upsertSeries({
    folder_id: folderB.id,
    title: 'Spider-Man Comics',
    author: 'Stan Lee',
    primary_format: 'cbr',
    path: path.join(tempDir, 'Folder_B', 'Spider_Man')
  });

  // Filter by Manga library
  const mangaSeriesList = db.getSeriesList({ libraryId: mangaLib.id });
  assert.ok(mangaSeriesList.some(s => s.id === seriesM1), 'Manga series should be in manga library results');
  assert.ok(!mangaSeriesList.some(s => s.id === seriesC1), 'Comics series must NOT be in manga library results');

  // Filter by Comics library
  const comicsSeriesList = db.getSeriesList({ libraryId: comicsLib.id });
  assert.ok(comicsSeriesList.some(s => s.id === seriesC1), 'Comics series should be in comics library results');
  assert.ok(!comicsSeriesList.some(s => s.id === seriesM1), 'Manga series must NOT be in comics library results');

  // No library filter (all series returned)
  const allSeriesList = db.getSeriesList({});
  assert.ok(allSeriesList.some(s => s.id === seriesM1), 'All series should include Manga series');
  assert.ok(allSeriesList.some(s => s.id === seriesC1), 'All series should include Comics series');

  // libraryId = null / undefined explicitly
  const nullSeriesList = db.getSeriesList({ libraryId: null });
  assert.ok(nullSeriesList.some(s => s.id === seriesM1), 'libraryId=null should include Manga series');
  assert.ok(nullSeriesList.some(s => s.id === seriesC1), 'libraryId=null should include Comics series');
  console.log('✓ Test G passed: Library filtering verified.');

  // ----------------------------------------------------
  // TEST H: Library + Existing Filters
  // ----------------------------------------------------
  console.log('\n--- Test H: Library + Existing Filters ---');
  const authorShared = db.createAuthor('Shared Author');
  const authorOther = db.createAuthor('Other Author');
  const tagAction = db.createTag('Action');
  const tagDrama = db.createTag('Drama');

  const sH1 = db.upsertSeries({
    folder_id: folderA.id, // Manga
    title: 'Manga Action Drama Shared',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_A', 'manga_h1')
  });
  db.setSeriesAuthors(sH1, [authorShared.id]);
  db.setSeriesTags(sH1, [tagAction.id, tagDrama.id]);

  const sH2 = db.upsertSeries({
    folder_id: folderA.id, // Manga
    title: 'Manga Drama Other',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_A', 'manga_h2')
  });
  db.setSeriesAuthors(sH2, [authorOther.id]);
  db.setSeriesTags(sH2, [tagDrama.id]);

  const sH3 = db.upsertSeries({
    folder_id: folderB.id, // Comics
    title: 'Comics Action Drama Shared',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_B', 'comics_h3')
  });
  db.setSeriesAuthors(sH3, [authorShared.id]);
  db.setSeriesTags(sH3, [tagAction.id, tagDrama.id]);

  // Query: libraryId = mangaLib.id AND author = authorShared AND tag = tagAction
  const resH = db.getSeriesList({
    libraryId: mangaLib.id,
    authorId: authorShared.id,
    tagId: tagAction.id
  });
  assert.strictEqual(resH.length, 1, 'Only manga matching library, author and tag returned');
  assert.strictEqual(resH[0].id, sH1, 'Matched series must be sH1');

  // Verify folderId alongside libraryId
  const resFolderAndLib = db.getSeriesList({
    libraryId: mangaLib.id,
    folderId: folderA.id
  });
  assert.ok(resFolderAndLib.some(s => s.id === sH1));

  // If folderId is from Comics but libraryId is Manga, result is empty (AND intersection)
  const resConflict = db.getSeriesList({
    libraryId: mangaLib.id,
    folderId: folderB.id
  });
  assert.strictEqual(resConflict.length, 0, 'Conflicting libraryId and folderId should return 0 results');
  console.log('✓ Test H passed: Library + existing filters combine correctly.');

  // ----------------------------------------------------
  // TEST I: Library + Favorites
  // ----------------------------------------------------
  console.log('\n--- Test I: Library + Favorites ---');
  const favManga = db.upsertSeries({
    folder_id: folderA.id, // Manga
    title: 'Favorite Manga',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_A', 'fav_manga')
  });
  db.toggleSeriesFavorite(favManga); // is_favorite = 1

  const nonFavManga = db.upsertSeries({
    folder_id: folderA.id, // Manga
    title: 'Non Favorite Manga',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_A', 'non_fav_manga')
  });

  const favComics = db.upsertSeries({
    folder_id: folderB.id, // Comics
    title: 'Favorite Comics',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_B', 'fav_comics')
  });
  db.toggleSeriesFavorite(favComics); // is_favorite = 1

  const nonFavComics = db.upsertSeries({
    folder_id: folderB.id, // Comics
    title: 'Non Favorite Comics',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_B', 'non_fav_comics')
  });

  const mangaFavs = db.getSeriesList({ libraryId: mangaLib.id, favoriteOnly: true });
  assert.ok(mangaFavs.some(s => s.id === favManga), 'Favorite Manga should be included');
  assert.ok(!mangaFavs.some(s => s.id === nonFavManga), 'Non-favorite Manga must NOT be included');
  assert.ok(!mangaFavs.some(s => s.id === favComics), 'Favorite Comics must NOT be included');

  const comicsFavs = db.getSeriesList({ libraryId: comicsLib.id, favoriteOnly: true });
  assert.ok(comicsFavs.some(s => s.id === favComics), 'Favorite Comics should be included');
  assert.ok(!comicsFavs.some(s => s.id === nonFavComics), 'Non-favorite Comics must NOT be included');
  assert.ok(!comicsFavs.some(s => s.id === favManga), 'Favorite Manga must NOT be included');
  console.log('✓ Test I passed: Library + favorites filter verified.');

  // ----------------------------------------------------
  // TEST J: Library + Advanced Search Arrays
  // ----------------------------------------------------
  console.log('\n--- Test J: Library + Advanced Search Arrays ---');
  // authors: A AND B
  // tags: X AND Y
  // languages: Spanish OR English
  // libraryId = mangaLib.id
  const authorAdvA = db.createAuthor('Adv Author A');
  const authorAdvB = db.createAuthor('Adv Author B');
  const tagAdvX = db.createTag('Adv Tag X');
  const tagAdvY = db.createTag('Adv Tag Y');
  const langSpanish = db.createLanguage('Spanish');
  const langEnglish = db.createLanguage('English');
  const langJapanese = db.createLanguage('Japanese');

  // Series 1: Meets all criteria in Manga
  const sFullManga = db.upsertSeries({
    folder_id: folderA.id, // Manga
    title: 'Full Match Manga',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_A', 's_full_manga')
  });
  db.setSeriesAuthors(sFullManga, [authorAdvA.id, authorAdvB.id]);
  db.setSeriesTags(sFullManga, [tagAdvX.id, tagAdvY.id]);
  db.setSeriesLanguages(sFullManga, [langSpanish.id]);

  // Series 2: In Manga, has Tags X&Y and Spanish, but only Author A (fails author AND)
  const sPartialAuthor = db.upsertSeries({
    folder_id: folderA.id, // Manga
    title: 'Partial Author Manga',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_A', 's_part_author')
  });
  db.setSeriesAuthors(sPartialAuthor, [authorAdvA.id]);
  db.setSeriesTags(sPartialAuthor, [tagAdvX.id, tagAdvY.id]);
  db.setSeriesLanguages(sPartialAuthor, [langSpanish.id]);

  // Series 3: In Manga, has Authors A&B and Spanish, but only Tag X (fails tag AND)
  const sPartialTag = db.upsertSeries({
    folder_id: folderA.id, // Manga
    title: 'Partial Tag Manga',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_A', 's_part_tag')
  });
  db.setSeriesAuthors(sPartialTag, [authorAdvA.id, authorAdvB.id]);
  db.setSeriesTags(sPartialTag, [tagAdvX.id]);
  db.setSeriesLanguages(sPartialTag, [langSpanish.id]);

  // Series 4: In Manga, has Authors A&B, Tags X&Y, but Japanese (fails language OR)
  const sWrongLang = db.upsertSeries({
    folder_id: folderA.id, // Manga
    title: 'Wrong Language Manga',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_A', 's_wrong_lang')
  });
  db.setSeriesAuthors(sWrongLang, [authorAdvA.id, authorAdvB.id]);
  db.setSeriesTags(sWrongLang, [tagAdvX.id, tagAdvY.id]);
  db.setSeriesLanguages(sWrongLang, [langJapanese.id]);

  // Series 5: In Comics (folder B), meets all authors, tags, and has English (should fail manga library filter)
  const sFullComics = db.upsertSeries({
    folder_id: folderB.id, // Comics
    title: 'Full Match Comics',
    primary_format: 'cbz',
    path: path.join(tempDir, 'Folder_B', 's_full_comics')
  });
  db.setSeriesAuthors(sFullComics, [authorAdvA.id, authorAdvB.id]);
  db.setSeriesTags(sFullComics, [tagAdvX.id, tagAdvY.id]);
  db.setSeriesLanguages(sFullComics, [langEnglish.id]);

  // Execute Search for Manga library
  const advQuery = {
    libraryId: mangaLib.id,
    authorId: [authorAdvA.id, authorAdvB.id],
    tagId: [tagAdvX.id, tagAdvY.id],
    languageId: [langSpanish.id, langEnglish.id]
  };

  const resultsAdvManga = db.getSeriesList(advQuery);
  assert.strictEqual(resultsAdvManga.length, 1, 'Only sFullManga should match all criteria in Manga library');
  assert.strictEqual(resultsAdvManga[0].id, sFullManga, 'Matched ID should be sFullManga');

  // Change libraryId to Comics
  const resultsAdvComics = db.getSeriesList({ ...advQuery, libraryId: comicsLib.id });
  assert.strictEqual(resultsAdvComics.length, 1, 'Only sFullComics should match when libraryId is Comics');
  assert.strictEqual(resultsAdvComics[0].id, sFullComics, 'Matched ID should be sFullComics');

  // Without libraryId: both should be returned
  const resultsAdvAll = db.getSeriesList({ ...advQuery, libraryId: null });
  assert.strictEqual(resultsAdvAll.length, 2, 'Both sFullManga and sFullComics should match without libraryId');
  assert.ok(resultsAdvAll.some(s => s.id === sFullManga));
  assert.ok(resultsAdvAll.some(s => s.id === sFullComics));
  console.log('✓ Test J passed: Library + Advanced Search arrays verified.');

  // ----------------------------------------------------
  // ADDITIONAL: Unassign, Invalid IDs & Migration Idempotency
  // ----------------------------------------------------
  console.log('\n--- Additional Checks: Unassign & Invalid IDs ---');
  // Unassign folder A
  db.assignFolderToLibrary(folderA.id, null);
  assert.strictEqual(db.getFolderById(folderA.id).library_id, null, 'Folder A should now be unassigned (NULL)');
  assert.strictEqual(db.getFoldersByLibrary(mangaLib.id).length, 0, 'Manga library should now have 0 folders');

  // Re-assign back to Manga
  db.assignFolderToLibrary(folderA.id, mangaLib.id);
  assert.strictEqual(db.getFolderById(folderA.id).library_id, mangaLib.id);

  // Invalid ID checks
  assert.strictEqual(db.getLibraryById(99999), null, 'Non-existent library ID should return null');
  assert.throws(() => {
    db.renameLibrary(99999, 'NonExistent');
  }, /no encontrada|not found/i, 'Renaming non-existent library must throw');

  assert.throws(() => {
    db.assignFolderToLibrary(99999, mangaLib.id);
  }, /no encontrada|not found/i, 'Assigning non-existent folder must throw');

  assert.throws(() => {
    db.assignFolderToLibrary(folderA.id, 99999);
  }, /no encontrada|not found/i, 'Assigning to non-existent library must throw');

  console.log('✓ Unassign and invalid ID handling verified.');

  // Migration Idempotency & Persistence across restart
  console.log('\n--- Additional Checks: DB Reopen & Migration Idempotency ---');
  const dbReopened = new DatabaseManager(dbPath);
  await dbReopened.init();
  const reloadedLibs = dbReopened.getLibraries();
  assert.ok(reloadedLibs.some(l => l.name === 'Manga'), 'Manga library persisted after reopen');
  assert.ok(reloadedLibs.some(l => l.name === 'Comics'), 'Comics library persisted after reopen');
  const reloadedFolderA = dbReopened.getFolderById(folderA.id);
  assert.strictEqual(reloadedFolderA.library_id, mangaLib.id, 'Folder A library assignment persisted after reopen');
  console.log('✓ DB reopen and migration idempotency verified.');

  console.log('\n======================================================');
  console.log('  ALL PHASE 1 LIBRARY TESTS (A through J) PASSED!  ');
  console.log('======================================================\n');
}

runLibraryTests().catch(err => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
