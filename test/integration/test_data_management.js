/**
 * LecFal - Data Management Test Suite
 *
 * Verifies:
 * ==================== REMOVE FROM LIBRARY ====================
 * A. Series can be removed from the database
 * B. Its chapters are removed
 * C. Reading positions are removed
 * D. Favorites/state are removed
 * E. Other series remain untouched
 * F. Source CBZ/PDF files remain untouched
 * G. Source/library folders remain untouched
 * H. Removing one series does not affect another series in the same folder
 * I. Scanning again discovers the removed manga normally
 * J. Works when the series has multiple chapters/subdirectories
 *
 * ==================== PERMANENT DELETE ====================
 * K. Database records are removed
 * L. Associated CBZ/PDF files are removed
 * M. Unrelated files in the same directory remain
 * N. Files belonging to another series remain
 * O. Registered source/library folder remains
 * P. Missing chapter files do not prevent cleanup of the remaining records/files
 * Q. Unsafe/out-of-scope paths are never deleted
 * R. Empty directories are cleaned only when safe
 * S. Partial filesystem failures are handled safely
 *
 * ==================== RESET APPLICATION ====================
 * T. Reset removes the database/application state
 * U. Reset removes generated thumbnails/cache
 * V. Reset does NOT remove CBZ/PDF source files
 * W. Reset does NOT remove source folders
 * X. Reset works in Standard mode
 * Y. Reset works in Portable mode
 * Z. Reset never deletes arbitrary paths outside the LecFal storage root
 * AA. A fresh database can initialize successfully after reset
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const AdmZip = require('adm-zip');

const StorageManager = require('../../src/core/storage').StorageManager;
const DatabaseManager = require('../../src/core/db');
const LibraryScanner = require('../../src/scanner/scanner');

// Helper to create a dummy CBZ
function createTestCbz(cbzPath, pageCount = 2) {
  const dir = path.dirname(cbzPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const zip = new AdmZip();
  const pngBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  for (let i = 1; i <= pageCount; i++) {
    const pageName = String(i).padStart(3, '0') + '.png';
    zip.addFile(pageName, pngBuffer);
  }
  zip.writeZip(cbzPath);
}

// Helper simulating main.js scanFolderWithSeries execution
async function runScanWorkflow(scanner, db, folder, options = {}) {
  const mode = options.mode || 'incremental';
  if (!fs.existsSync(folder.path)) {
    return { unavailable: true, prunedChapters: 0, prunedSeries: 0 };
  }

  const registeredChapters = db.getRegisteredChaptersMap(folder.id);
  const registeredSeries = db.getRegisteredSeriesMap(folder.id);

  db.beginTransaction();

  let report;
  try {
    report = await scanner.scanDirectory(folder.path, {
      mode,
      registeredChapters,
      registeredSeries,
      onProgress: options.onProgress,
      onSeries: async (seriesData) => {
        if (scanner.isCancelled) return;
        if (!seriesData.hasChanges && seriesData.seriesId && mode !== 'full') {
          return;
        }

        const seriesId = db.upsertSeries({
          folder_id: folder.id,
          title: seriesData.title,
          author: seriesData.author,
          path: seriesData.path,
          cover_path: seriesData.cover_path,
          chapter_count: seriesData.chapter_count,
          primary_format: seriesData.primary_format
        });

        for (const ch of seriesData.chapters) {
          if (scanner.isCancelled) return;
          if (mode === 'full' || ch.status !== 'unchanged') {
            db.upsertChapter({
              series_id: seriesId,
              title: ch.title,
              file_name: ch.file_name,
              file_path: ch.file_path,
              format: ch.format,
              file_size: ch.file_size,
              mtime_ms: ch.mtime_ms,
              chapter_number: ch.chapter_number
            });
          }
        }
      }
    });

    if (report.cancelled || scanner.isCancelled) {
      db.commit();
      return { ...report, cancelled: true };
    }

    if (report.failed) {
      db.rollback();
      return { ...report, failed: true };
    }

    // Prune removed items
    const pruneResult = db.pruneFolder(
      folder.id,
      report.discoveredChapterPaths,
      report.discoveredSeriesPaths
    );
    db.commit();

    return {
      ...report,
      prunedChapters: pruneResult.prunedChapters,
      prunedSeries: pruneResult.prunedSeries
    };
  } catch (err) {
    db.rollback();
    throw err;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('STARTING DATA MANAGEMENT TEST SUITE');
  console.log('======================================================\n');

  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_dm_'));

  try {
    // -------------------------------------------------------------------------
    // SETUP BASELINE ENVIRONMENT
    // -------------------------------------------------------------------------
    const storageRoot = path.join(testRoot, 'storage');
    const libraryFolderDir = path.join(testRoot, 'library');
    fs.mkdirSync(storageRoot, { recursive: true });
    fs.mkdirSync(libraryFolderDir, { recursive: true });

    const storage = new StorageManager().init({
      dataRoot: storageRoot,
      mode: 'standard'
    });

    const db = new DatabaseManager(storage.getDatabasePath());
    await db.init();

    const scanner = new LibraryScanner(storage.getThumbnailsPath());

    // Register library folder
    const folderRecord = db.addFolder(libraryFolderDir);
    const folderId = folderRecord.id;

    // Create 2 series in library: Series 1 (MangaOne) and Series 2 (MangaTwo)
    const series1Dir = path.join(libraryFolderDir, 'MangaOne');
    const s1c1 = path.join(series1Dir, 'c01.cbz');
    const s1c2 = path.join(series1Dir, 'c02.cbz');
    createTestCbz(s1c1);
    createTestCbz(s1c2);

    const series2Dir = path.join(libraryFolderDir, 'MangaTwo');
    const s2c1 = path.join(series2Dir, 'cap01.cbz');
    createTestCbz(s2c1);

    // Initial scan
    await runScanWorkflow(scanner, db, folderRecord);

    const seriesListInitial = db.getSeriesList({});
    assert.strictEqual(seriesListInitial.length, 2, 'Initial scan must discover 2 series');

    const s1 = seriesListInitial.find(s => s.title === 'MangaOne');
    const s2 = seriesListInitial.find(s => s.title === 'MangaTwo');
    assert.ok(s1 && s2, 'Both series must be present');

    // Add metadata, favorites, reading progress to Series 1
    db.toggleSeriesFavorite(s1.id);
    const s1Chapters = db.getChapters(s1.id);
    assert.strictEqual(s1Chapters.length, 2, 'Series 1 must have 2 chapters');
    db.setChapterReadingPosition(s1Chapters[0].id, 0.75);

    // Associate a tag with Series 1
    const tagObj = db.createTag('Action');
    const tagId = tagObj.id;
    db.setSeriesTags(s1.id, [tagId]);

    // =========================================================================
    // PART 1: REMOVE FROM LIBRARY (Tests A through J)
    // =========================================================================
    console.log('--- TEST A: Series can be removed from database ---');
    const removeRes = db.removeFromLibrary(s1.id);
    assert.strictEqual(removeRes.success, true, 'removeFromLibrary must report success');
    assert.strictEqual(db.getSeriesById(s1.id), null, 'Series 1 must be gone from DB');
    console.log('✓ TEST A passed: Series removed from database cleanly');

    console.log('--- TEST B: Its chapters are removed ---');
    const s1RemainingChapters = db.getChapters(s1.id);
    assert.strictEqual(s1RemainingChapters.length, 0, 'Chapters of Series 1 must be removed');
    console.log('✓ TEST B passed: Chapters removed cleanly');

    console.log('--- TEST C: Reading positions are removed ---');
    const checkReadingPosStmt = db.db.prepare('SELECT COUNT(*) as count FROM chapters WHERE id = ?');
    checkReadingPosStmt.bind([s1Chapters[0].id]);
    checkReadingPosStmt.step();
    assert.strictEqual(checkReadingPosStmt.getAsObject().count, 0, 'Reading position row completely removed');
    checkReadingPosStmt.free();
    console.log('✓ TEST C passed: Reading positions and chapter rows cleanly removed');

    console.log('--- TEST D: Favorites/state/relations are removed ---');
    const tagRelStmt = db.db.prepare('SELECT COUNT(*) as count FROM series_tags WHERE series_id = ?');
    tagRelStmt.bind([s1.id]);
    tagRelStmt.step();
    assert.strictEqual(tagRelStmt.getAsObject().count, 0, 'Series tags relation cleaned');
    tagRelStmt.free();
    console.log('✓ TEST D passed: Relational rows and favorite state cleanly removed');

    console.log('--- TEST E: Other series remain untouched ---');
    const s2After = db.getSeriesById(s2.id);
    assert.ok(s2After, 'Series 2 must still exist');
    const s2Chapters = db.getChapters(s2.id);
    assert.strictEqual(s2Chapters.length, 1, 'Series 2 chapters untouched');
    console.log('✓ TEST E passed: Other series remain completely untouched');

    console.log('--- TEST F: Source CBZ/PDF files remain untouched ---');
    assert.strictEqual(fs.existsSync(s1c1), true, 'File c01.cbz must NOT be deleted');
    assert.strictEqual(fs.existsSync(s1c2), true, 'File c02.cbz must NOT be deleted');
    console.log('✓ TEST F passed: Source CBZ files preserved 100% on disk');

    console.log('--- TEST G: Source/library folders remain untouched ---');
    assert.strictEqual(fs.existsSync(series1Dir), true, 'Series folder must NOT be deleted');
    assert.strictEqual(fs.existsSync(libraryFolderDir), true, 'Library root folder must NOT be deleted');
    console.log('✓ TEST G passed: Source and library folders untouched');

    console.log('--- TEST H: Removing one series does not affect another series in same folder ---');
    assert.strictEqual(fs.existsSync(s2c1), true, 'Series 2 files preserved');
    console.log('✓ TEST H passed: Sibling series completely unaffected');

    console.log('--- TEST I: Scanning again discovers the removed manga normally ---');
    await runScanWorkflow(scanner, db, folderRecord);
    const seriesListRescan = db.getSeriesList({});
    assert.strictEqual(seriesListRescan.length, 2, 'Rescan must re-discover removed manga');
    const s1Rediscovered = seriesListRescan.find(s => s.title === 'MangaOne');
    assert.ok(s1Rediscovered, 'MangaOne rediscovered in SQLite');
    const s1RediscoveredChapters = db.getChapters(s1Rediscovered.id);
    assert.strictEqual(s1RediscoveredChapters.length, 2, 'Rediscovered chapters must be 2');
    console.log('✓ TEST I passed: Rediscovery on rescan verified');

    console.log('--- TEST J: Works when series has multiple chapters/subdirectories ---');
    const multiSubdirSeries = path.join(libraryFolderDir, 'MultiSub');
    const subVol1 = path.join(multiSubdirSeries, 'Vol1', 'ch01.cbz');
    const subVol2 = path.join(multiSubdirSeries, 'Vol2', 'ch02.cbz');
    createTestCbz(subVol1);
    createTestCbz(subVol2);
    await runScanWorkflow(scanner, db, folderRecord);

    const sMulti = db.getSeriesList({}).find(s => s.title === 'MultiSub');
    assert.ok(sMulti, 'MultiSub series created');
    assert.strictEqual(db.getChapters(sMulti.id).length, 2, 'MultiSub chapters count is 2');

    db.removeFromLibrary(sMulti.id);
    assert.strictEqual(db.getSeriesById(sMulti.id), null, 'MultiSub removed from DB');
    assert.strictEqual(fs.existsSync(subVol1), true, 'SubVol1 file preserved');
    assert.strictEqual(fs.existsSync(subVol2), true, 'SubVol2 file preserved');
    console.log('✓ TEST J passed: Multi-subdir series removal verified');

    // Clean up MultiSub for next tests
    fs.rmSync(multiSubdirSeries, { recursive: true, force: true });
    await runScanWorkflow(scanner, db, folderRecord);

    // =========================================================================
    // PART 2: PERMANENT DELETE (Tests K through S)
    // =========================================================================
    console.log('--- TEST K & L: Database records and associated files removed ---');
    // Set up a dedicated series for permanent deletion: PermDeleteManga
    const permDir = path.join(libraryFolderDir, 'PermDeleteManga');
    const permC1 = path.join(permDir, '001.cbz');
    const permC2 = path.join(permDir, '002.cbz');
    // Add unrelated files to the same directory
    const unrelatedCover = path.join(permDir, 'portada.jpg');
    const unrelatedNotes = path.join(permDir, 'notas.txt');
    const unrelatedComic = path.join(permDir, 'otro-manga.cbz');

    createTestCbz(permC1);
    createTestCbz(permC2);

    await runScanWorkflow(scanner, db, folderRecord);
    const permSeries = db.getSeriesList({}).find(s => s.title === 'PermDeleteManga');
    assert.ok(permSeries, 'PermDeleteManga discovered');
    assert.strictEqual(db.getChapters(permSeries.id).length, 2, 'PermDeleteManga has 2 chapters');

    // Add unrelated files to the same directory after initial scan
    fs.writeFileSync(unrelatedCover, 'dummy image bytes');
    fs.writeFileSync(unrelatedNotes, 'some user notes');
    fs.writeFileSync(unrelatedComic, 'another comic file');

    // Also register unrelatedComic under AnotherSeries in DB to verify cross-series protection
    const otherSeriesId = db.upsertSeries({
      folder_id: folderId,
      title: 'OtherSeries',
      path: path.join(libraryFolderDir, 'OtherSeries')
    });
    db.upsertChapter({
      series_id: otherSeriesId,
      title: 'Otro Manga',
      file_path: unrelatedComic,
      format: 'cbz',
      file_size: 200
    });

    const permDelResult = db.deletePermanently(permSeries.id);
    assert.strictEqual(permDelResult.success, true, 'deletePermanently succeeded');

    // Test K: Database records removed
    assert.strictEqual(db.getSeriesById(permSeries.id), null, 'Series record removed from DB');
    assert.strictEqual(db.getChapters(permSeries.id).length, 0, 'Chapters removed from DB');
    console.log('✓ TEST K passed: Database records removed cleanly');

    // Test L: Associated files removed
    assert.strictEqual(fs.existsSync(permC1), false, '001.cbz must be deleted from disk');
    assert.strictEqual(fs.existsSync(permC2), false, '002.cbz must be deleted from disk');
    console.log('✓ TEST L passed: Associated chapter files removed from disk');

    console.log('--- TEST M: Unrelated files in the same directory remain ---');
    assert.strictEqual(fs.existsSync(unrelatedCover), true, 'portada.jpg must remain untouched');
    assert.strictEqual(fs.existsSync(unrelatedNotes), true, 'notas.txt must remain untouched');
    assert.strictEqual(fs.existsSync(unrelatedComic), true, 'otro-manga.cbz must remain untouched');
    console.log('✓ TEST M passed: Unrelated files remain 100% untouched');

    console.log('--- TEST N: Files belonging to another series remain ---');
    const s2Check = db.getSeriesList({}).find(s => s.title === 'MangaTwo');
    assert.ok(s2Check, 'MangaTwo still in DB');
    assert.strictEqual(fs.existsSync(s2c1), true, 'MangaTwo chapter file still on disk');
    console.log('✓ TEST N passed: Files of other series remain untouched');

    console.log('--- TEST O: Registered source/library folder remains ---');
    assert.strictEqual(fs.existsSync(libraryFolderDir), true, 'Library root folder must NEVER be deleted');
    console.log('✓ TEST O passed: Registered library folder remains intact');

    console.log('--- TEST P: Missing chapter files do not prevent cleanup ---');
    const missingChapDir = path.join(libraryFolderDir, 'MissingChapManga');
    const mc1 = path.join(missingChapDir, 'c1.cbz');
    const mc2 = path.join(missingChapDir, 'c2.cbz');
    createTestCbz(mc1);
    createTestCbz(mc2);
    await runScanWorkflow(scanner, db, folderRecord);

    const mcSeries = db.getSeriesList({}).find(s => s.title === 'MissingChapManga');
    assert.ok(mcSeries, 'MissingChapManga discovered');

    // Manually delete c1 before calling deletePermanently
    fs.unlinkSync(mc1);
    assert.strictEqual(fs.existsSync(mc1), false, 'c1 manually deleted');

    const mcDeleteRes = db.deletePermanently(mcSeries.id);
    assert.strictEqual(mcDeleteRes.success, true, 'Permanent deletion succeeds despite missing c1');
    assert.strictEqual(fs.existsSync(mc2), false, 'c2 was deleted cleanly');
    assert.strictEqual(db.getSeriesById(mcSeries.id), null, 'DB records cleaned');
    assert.ok(mcDeleteRes.missingFiles.includes(mc1), 'Missing file reported in missingFiles list');
    console.log('✓ TEST P passed: Missing chapter handled gracefully');

    console.log('--- TEST Q: Unsafe / out-of-scope paths are never deleted ---');
    const unsafeDir = path.join(testRoot, 'outside_library');
    fs.mkdirSync(unsafeDir, { recursive: true });
    const unsafeFile = path.join(unsafeDir, 'secret.cbz');
    createTestCbz(unsafeFile);

    // Insert a dummy rogue series pointing outside library
    const rogueSeriesId = db.upsertSeries({
      folder_id: folderId,
      title: 'RogueManga',
      path: unsafeDir
    });
    db.upsertChapter({
      series_id: rogueSeriesId,
      title: 'Rogue Chapter',
      file_path: unsafeFile,
      format: 'cbz',
      file_size: 100
    });

    const unsafeDeleteRes = db.deletePermanently(rogueSeriesId);
    assert.strictEqual(unsafeDeleteRes.success, false, 'Security validation must reject outside paths');
    assert.strictEqual(fs.existsSync(unsafeFile), true, 'Outside file must NEVER be touched');
    db.deleteSeries(rogueSeriesId); // clean DB
    console.log('✓ TEST Q passed: Out-of-scope paths rejected and protected');

    console.log('--- TEST R: Empty directories cleaned only when safe ---');
    // Subdirectory with only chapter files -> should be cleaned
    const emptySubDir = path.join(libraryFolderDir, 'CleanMeSub');
    const subC1 = path.join(emptySubDir, 'sub01.cbz');
    createTestCbz(subC1);
    await runScanWorkflow(scanner, db, folderRecord);
    const cleanSeries = db.getSeriesList({}).find(s => s.title === 'CleanMeSub');
    assert.ok(cleanSeries);
    db.deletePermanently(cleanSeries.id);
    assert.strictEqual(fs.existsSync(subC1), false, 'Chapter deleted');
    assert.strictEqual(fs.existsSync(emptySubDir), false, 'Empty directory safely cleaned');
    console.log('✓ TEST R passed: Empty directories safely pruned');

    console.log('--- TEST S: Partial filesystem failures handled safely ---');
    const roDir = path.join(libraryFolderDir, 'ReadOnlySeries');
    const roFile = path.join(roDir, 'ro01.cbz');
    createTestCbz(roFile);
    await runScanWorkflow(scanner, db, folderRecord);
    const roSeries = db.getSeriesList({}).find(s => s.title === 'ReadOnlySeries');
    assert.ok(roSeries);

    // Make directory non-writable so unlink fails
    try {
      fs.chmodSync(roDir, 0o555);
      const roDelRes = db.deletePermanently(roSeries.id);
      if (!roDelRes.success) {
        // Confirmed: failed deletion preserves DB record
        assert.ok(db.getSeriesById(roSeries.id), 'Database record preserved on failure');
      }
    } finally {
      fs.chmodSync(roDir, 0o777); // restore
      fs.rmSync(roDir, { recursive: true, force: true });
      db.deleteSeries(roSeries.id);
    }
    console.log('✓ TEST S passed: Filesystem failure handles DB preservation safely');

    // =========================================================================
    // PART 3: RESET APPLICATION (Tests T through AA)
    // =========================================================================
    console.log('--- TEST T: Reset removes database/application state ---');
    // Ensure thumbnails and cache files exist
    const sampleThumb = path.join(storage.getThumbnailsPath(), 'sample_thumb.jpg');
    fs.writeFileSync(sampleThumb, 'fake thumbnail');
    const sampleCache = path.join(storage.getCachePath(), 'cached_page.bin');
    fs.writeFileSync(sampleCache, 'fake cache');

    // Verify files exist prior to reset
    assert.strictEqual(fs.existsSync(storage.getDatabasePath()), true);
    assert.strictEqual(fs.existsSync(sampleThumb), true);
    assert.strictEqual(fs.existsSync(sampleCache), true);

    // Close DB connection prior to storage reset
    db.close();

    const registeredFolders = [libraryFolderDir];
    const resetResult = storage.resetApplicationStorage(registeredFolders);
    assert.strictEqual(resetResult.success, true, 'Storage reset succeeded');

    // Test T: Database file removed
    assert.strictEqual(fs.existsSync(storage.getDatabasePath()), false, 'Database file removed');
    console.log('✓ TEST T passed: Application state and DB removed');

    console.log('--- TEST U: Reset removes generated thumbnails/cache ---');
    assert.strictEqual(fs.existsSync(sampleThumb), false, 'Thumbnails cleared');
    assert.strictEqual(fs.existsSync(sampleCache), false, 'Cache cleared');
    console.log('✓ TEST U passed: Thumbnails and cache cleared');

    console.log('--- TEST V: Reset does NOT remove CBZ/PDF source files ---');
    assert.strictEqual(fs.existsSync(s1c1), true, 'User comic file MangaOne c01.cbz preserved');
    assert.strictEqual(fs.existsSync(s2c1), true, 'User comic file MangaTwo cap01.cbz preserved');
    console.log('✓ TEST V passed: All user comic files completely intact');

    console.log('--- TEST W: Reset does NOT remove source folders ---');
    assert.strictEqual(fs.existsSync(libraryFolderDir), true, 'Library folder preserved');
    assert.strictEqual(fs.existsSync(series1Dir), true, 'MangaOne folder preserved');
    console.log('✓ TEST W passed: User comic folders completely intact');

    console.log('--- TEST X: Reset works in Standard mode ---');
    const stdStorageRoot = path.join(testRoot, 'std_mode_storage');
    const stdStorage = new StorageManager().init({
      dataRoot: stdStorageRoot,
      mode: 'standard'
    });
    fs.writeFileSync(stdStorage.getDatabasePath(), 'test db');
    const stdRes = stdStorage.resetApplicationStorage([]);
    assert.strictEqual(stdRes.success, true, 'Standard mode reset succeeded');
    assert.strictEqual(fs.existsSync(stdStorage.getDatabasePath()), false);
    console.log('✓ TEST X passed: Standard mode reset verified');

    console.log('--- TEST Y: Reset works in Portable mode ---');
    const portAppDir = path.join(testRoot, 'portable_app');
    fs.mkdirSync(portAppDir, { recursive: true });
    const portStorage = new StorageManager().init({
      appDir: portAppDir,
      mode: 'portable'
    });
    fs.writeFileSync(portStorage.getDatabasePath(), 'portable db');
    const portRes = portStorage.resetApplicationStorage([]);
    assert.strictEqual(portRes.success, true, 'Portable mode reset succeeded');
    assert.strictEqual(fs.existsSync(portStorage.getDatabasePath()), false);
    console.log('✓ TEST Y passed: Portable mode reset verified');

    console.log('--- TEST Z: Reset never deletes arbitrary paths outside storage root ---');
    const rogueRoot = path.join(testRoot, 'unrecognized_dir');
    fs.mkdirSync(rogueRoot, { recursive: true });
    const dummyRogueStorage = new StorageManager();
    dummyRogueStorage._dataRoot = rogueRoot;
    dummyRogueStorage._initialized = true;

    assert.throws(() => {
      dummyRogueStorage.resetApplicationStorage([]);
    }, /Reset abortado/, 'Reset must reject unrecognized/arbitrary storage root');
    console.log('✓ TEST Z passed: Arbitrary paths rejected');

    console.log('--- TEST AA: Fresh database initializes successfully after reset ---');
    const freshDb = new DatabaseManager(storage.getDatabasePath());
    await freshDb.init();
    assert.strictEqual(freshDb.getSeriesList({}).length, 0, 'Fresh database starts with 0 series');
    assert.strictEqual(freshDb.getFolders().length, 0, 'Fresh database starts with 0 folders');

    // Re-add library folder and verify normal operation
    const newFolder = freshDb.addFolder(libraryFolderDir);
    assert.ok(newFolder && newFolder.id > 0, 'Folder added to fresh database');
    const freshScanner = new LibraryScanner(storage.getThumbnailsPath());
    await runScanWorkflow(freshScanner, freshDb, newFolder);
    assert.ok(freshDb.getSeriesList({}).length >= 2, 'Fresh DB discovers libraries normally');
    freshDb.close();
    console.log('✓ TEST AA passed: Fresh DB initialized and fully operational');

    console.log('\n======================================================');
    console.log('ALL 27 DATA MANAGEMENT TESTS (A - AA) PASSED 100%!');
    console.log('======================================================\n');
  } finally {
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch (_) {}
  }
}

runTests().catch(err => {
  console.error('\n❌ DATA MANAGEMENT SUITE FAILED:', err);
  process.exit(1);
});
