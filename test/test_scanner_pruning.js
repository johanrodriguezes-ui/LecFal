/**
 * Test Suite: Scanner Synchronization & Deletion Pruning (Phase 6)
 *
 * Verifies:
 * TEST A: Initial scan creates series and chapters cleanly
 * TEST B: Deleting one chapter removes only that chapter and updates series count
 * TEST C: Deleting an entire series folder prunes series and chapters from DB
 * TEST D: Renaming a chapter file prunes old record and inserts new record
 * TEST E: Multi-folder isolation: scanning Folder A never touches Folder B
 * TEST F: Cancellation safety: cancelled scan never executes pruning
 * TEST G: Inaccessible folder safety: unmounted folder skips pruning
 * TEST H: Incremental scan no-op: re-scan with no changes prunes 0 records
 * TEST I: Simultaneous add + delete: old pruned, new inserted in same pass
 * TEST J: Multi-chapter series: delete one preserves series; delete all prunes series
 * TEST K: Metadata preservation: custom title/author/tags/fav survive chapter prune
 * TEST L: Reading state cleanup: chapter reading position removed without orphan
 * TEST M: Empty directory scan: successfully discovering 0 files prunes old records
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const AdmZip = require('adm-zip');
const LibraryScanner = require('../src/scanner');
const DatabaseManager = require('../src/db');

// Helper to create a dummy CBZ
function createTestCbz(cbzPath, imageCount = 2) {
  const zip = new AdmZip();
  const pngBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  for (let i = 1; i <= imageCount; i++) {
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
      return { ...report, cancelled: true, prunedChapters: 0, prunedSeries: 0 };
    }

    if (report.failed) {
      db.rollback();
      return { ...report, failed: true, prunedChapters: 0, prunedSeries: 0 };
    }

    // Prune missing records ONLY on complete, successful scan
    const pruneStats = db.pruneFolder(
      folder.id,
      report.discoveredChapterPaths,
      report.discoveredSeriesPaths
    );
    report.prunedChapters = pruneStats.prunedChapters;
    report.prunedSeries = pruneStats.prunedSeries;

    db.commit();
    db.updateFolderScanTime(folder.id);
    return report;
  } catch (err) {
    db.rollback();
    throw err;
  }
}

async function runTests() {
  console.log('======================================================');
  console.log('  TEST: SCANNER SYNCHRONIZATION & DELETION PRUNING');
  console.log('======================================================');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_prune_'));
  const userDir = path.join(tempRoot, 'userdata');
  const libraryDirA = path.join(tempRoot, 'libraryA');
  const libraryDirB = path.join(tempRoot, 'libraryB');
  fs.mkdirSync(userDir, { recursive: true });
  fs.mkdirSync(libraryDirA, { recursive: true });
  fs.mkdirSync(libraryDirB, { recursive: true });

  const db = new DatabaseManager(path.join(userDir, 'test.db'));
  await db.init();
  const folderA = db.addFolder(libraryDirA);
  const folderB = db.addFolder(libraryDirB);
  const scanner = new LibraryScanner(userDir);

  try {
    // ----------------------------------------------------------------
    // TEST A: Baseline initial scan
    // ----------------------------------------------------------------
    console.log('\n--- Test A: Initial Baseline Scan ---');
    const manga1Dir = path.join(libraryDirA, 'MangaOne');
    const manga2Dir = path.join(libraryDirA, 'MangaTwo');
    fs.mkdirSync(manga1Dir, { recursive: true });
    fs.mkdirSync(manga2Dir, { recursive: true });
    createTestCbz(path.join(manga1Dir, 'c1.cbz'));
    createTestCbz(path.join(manga1Dir, 'c2.cbz'));
    createTestCbz(path.join(manga1Dir, 'c3.cbz'));
    createTestCbz(path.join(manga2Dir, 'c1.cbz'));
    createTestCbz(path.join(manga2Dir, 'c2.cbz'));

    const reportA = await runScanWorkflow(scanner, db, folderA);
    assert.strictEqual(reportA.totalSeries, 2, 'Should discover 2 series');
    assert.strictEqual(reportA.newFiles, 5, 'Should discover 5 new files');
    assert.strictEqual(reportA.prunedChapters, 0, 'Should prune 0 chapters');
    assert.strictEqual(reportA.prunedSeries, 0, 'Should prune 0 series');

    const regChaptersA = db.getRegisteredChaptersMap(folderA.id);
    assert.strictEqual(regChaptersA.size, 5, 'DB should hold 5 chapters for folderA');
    const regSeriesA = db.getRegisteredSeriesMap(folderA.id);
    assert.strictEqual(regSeriesA.size, 2, 'DB should hold 2 series for folderA');
    console.log('✓ Test A passed: Baseline scan created 2 series and 5 chapters.');

    // ----------------------------------------------------------------
    // TEST B: Delete single chapter
    // ----------------------------------------------------------------
    console.log('\n--- Test B: Single Chapter Deletion ---');
    fs.unlinkSync(path.join(manga1Dir, 'c2.cbz'));

    const reportB = await runScanWorkflow(scanner, db, folderA);
    assert.strictEqual(reportB.prunedChapters, 1, 'Should report 1 pruned chapter');
    assert.strictEqual(reportB.prunedSeries, 0, 'Should report 0 pruned series');

    const regChaptersB = db.getRegisteredChaptersMap(folderA.id);
    assert.strictEqual(regChaptersB.size, 4, 'DB should hold 4 chapters after pruning');
    assert.strictEqual(regChaptersB.has(path.join(manga1Dir, 'c2.cbz')), false, 'Deleted chapter must not be in DB');
    assert.strictEqual(regChaptersB.has(path.join(manga1Dir, 'c1.cbz')), true, 'Surviving chapter c1 must exist');
    assert.strictEqual(regChaptersB.has(path.join(manga1Dir, 'c3.cbz')), true, 'Surviving chapter c3 must exist');

    const series1Obj = db.getRegisteredSeriesMap(folderA.id).get(manga1Dir);
    assert.strictEqual(series1Obj.chapter_count, 2, 'MangaOne chapter_count must update from 3 to 2');
    console.log('✓ Test B passed: Deleted chapter was pruned and series chapter_count updated.');

    // ----------------------------------------------------------------
    // TEST C: Delete entire series folder
    // ----------------------------------------------------------------
    console.log('\n--- Test C: Entire Series Deletion ---');
    fs.rmSync(manga2Dir, { recursive: true, force: true });

    const reportC = await runScanWorkflow(scanner, db, folderA);
    assert.strictEqual(reportC.prunedSeries, 1, 'Should report 1 pruned series');
    assert.strictEqual(reportC.prunedChapters, 2, 'Should report 2 pruned chapters belonging to MangaTwo');

    const regSeriesC = db.getRegisteredSeriesMap(folderA.id);
    assert.strictEqual(regSeriesC.size, 1, 'DB should now only hold 1 series for folderA');
    assert.strictEqual(regSeriesC.has(manga2Dir), false, 'MangaTwo must be removed from DB');
    assert.strictEqual(regSeriesC.has(manga1Dir), true, 'MangaOne must remain');
    console.log('✓ Test C passed: Deleted series folder and its chapters were cleanly pruned.');

    // ----------------------------------------------------------------
    // TEST D: Rename chapter file
    // ----------------------------------------------------------------
    console.log('\n--- Test D: Renamed Chapter ---');
    const oldC1Path = path.join(manga1Dir, 'c1.cbz');
    const newC1Path = path.join(manga1Dir, 'c1_fixed.cbz');
    fs.renameSync(oldC1Path, newC1Path);

    const reportD = await runScanWorkflow(scanner, db, folderA);
    assert.strictEqual(reportD.newFiles, 1, 'New renamed chapter should be discovered as new file');
    assert.strictEqual(reportD.prunedChapters, 1, 'Old chapter filename should be pruned');
    assert.strictEqual(reportD.prunedSeries, 0, 'No series should be pruned');

    const regChaptersD = db.getRegisteredChaptersMap(folderA.id);
    assert.strictEqual(regChaptersD.has(oldC1Path), false, 'Old chapter path must be gone');
    assert.strictEqual(regChaptersD.has(newC1Path), true, 'New chapter path must exist in DB');
    const series1AfterRename = db.getRegisteredSeriesMap(folderA.id).get(manga1Dir);
    assert.strictEqual(series1AfterRename.chapter_count, 2, 'Chapter count must remain exactly 2');
    console.log('✓ Test D passed: Renamed file registered cleanly while old entry was pruned.');

    // ----------------------------------------------------------------
    // TEST E: Multi-folder isolation boundary
    // ----------------------------------------------------------------
    console.log('\n--- Test E: Multi-Folder Isolation Boundary ---');
    const mangaBDir = path.join(libraryDirB, 'SeriesB');
    fs.mkdirSync(mangaBDir, { recursive: true });
    createTestCbz(path.join(mangaBDir, 'b1.cbz'));
    createTestCbz(path.join(mangaBDir, 'b2.cbz'));

    const reportE1 = await runScanWorkflow(scanner, db, folderB);
    assert.strictEqual(reportE1.totalSeries, 1, 'FolderB scan should discover 1 series');
    assert.strictEqual(reportE1.newFiles, 2, 'FolderB scan should discover 2 files');

    // Delete a file in Folder A without scanning Folder A
    fs.unlinkSync(newC1Path);

    // Scan Folder B: MUST NOT touch Folder A's records!
    const reportE2 = await runScanWorkflow(scanner, db, folderB);
    assert.strictEqual(reportE2.prunedChapters, 0, 'FolderB scan must prune 0 chapters in FolderB');
    const regChaptersAAfterBScan = db.getRegisteredChaptersMap(folderA.id);
    assert.strictEqual(regChaptersAAfterBScan.has(newC1Path), true, 'FolderA record must remain untouched when scanning FolderB');

    // Now scan Folder A: Folder A missing file is pruned, Folder B is untouched
    const reportE3 = await runScanWorkflow(scanner, db, folderA);
    assert.strictEqual(reportE3.prunedChapters, 1, 'FolderA scan should prune the deleted file');
    const regChaptersBAfterAScan = db.getRegisteredChaptersMap(folderB.id);
    assert.strictEqual(regChaptersBAfterAScan.size, 2, 'FolderB must remain with 2 chapters intact');
    console.log('✓ Test E passed: Scans are strictly bounded by folder_id with zero cross-folder interference.');

    // ----------------------------------------------------------------
    // TEST F: Cancellation safety
    // ----------------------------------------------------------------
    console.log('\n--- Test F: Cancellation Safety ---');
    // Create new file in folderA, then delete it on disk before scan, but cancel scan
    const tempFileF = path.join(manga1Dir, 'c5.cbz');
    createTestCbz(tempFileF);
    await runScanWorkflow(scanner, db, folderA);
    assert.strictEqual(db.getRegisteredChaptersMap(folderA.id).has(tempFileF), true, 'c5.cbz registered');

    // Now delete c5.cbz on disk
    fs.unlinkSync(tempFileF);

    // Run scan with cancellation triggered immediately
    let cancelFired = false;
    const reportF = await runScanWorkflow(scanner, db, folderA, {
      onProgress: () => {
        if (!cancelFired) {
          cancelFired = true;
          scanner.cancel();
        }
      }
    });

    assert.strictEqual(reportF.cancelled, true, 'Report must be marked cancelled');
    assert.strictEqual(reportF.prunedChapters, 0, 'No chapters may be pruned when scan is cancelled');
    const regChaptersFAfterCancel = db.getRegisteredChaptersMap(folderA.id);
    assert.strictEqual(regChaptersFAfterCancel.has(tempFileF), true, 'Missing file must NOT be pruned on cancelled scan');
    scanner.reset();
    console.log('✓ Test F passed: Cancelled scan skipped pruning and preserved database records.');

    // Clean up c5 now with successful scan
    await runScanWorkflow(scanner, db, folderA);

    // ----------------------------------------------------------------
    // TEST G: Inaccessible folder safety
    // ----------------------------------------------------------------
    console.log('\n--- Test G: Inaccessible Folder Safety ---');
    const ghostFolder = db.addFolder(path.join(tempRoot, 'non_existent_mount_path'));
    const reportG = await runScanWorkflow(scanner, db, ghostFolder);
    assert.strictEqual(reportG.unavailable, true, 'Inaccessible folder must report unavailable');
    assert.strictEqual(reportG.prunedChapters, 0, 'Must prune 0 chapters');
    assert.strictEqual(reportG.prunedSeries, 0, 'Must prune 0 series');
    console.log('✓ Test G passed: Unmounted / non-existent folder skipped pruning safely.');

    // ----------------------------------------------------------------
    // TEST H: Incremental scan no-op
    // ----------------------------------------------------------------
    console.log('\n--- Test H: Incremental Scan No-Op ---');
    const reportH = await runScanWorkflow(scanner, db, folderA, { mode: 'incremental' });
    assert.strictEqual(reportH.newFiles, 0, 'No new files');
    assert.strictEqual(reportH.modifiedFiles, 0, 'No modified files');
    assert.strictEqual(reportH.prunedChapters, 0, 'Zero chapters pruned on unchanged library');
    assert.strictEqual(reportH.prunedSeries, 0, 'Zero series pruned on unchanged library');
    console.log('✓ Test H passed: Incremental scan on unchanged directory pruned 0 records in milliseconds.');

    // ----------------------------------------------------------------
    // TEST I: Simultaneous add + delete in same scan pass
    // ----------------------------------------------------------------
    console.log('\n--- Test I: Simultaneous Add and Delete ---');
    const fileToDelete = path.join(manga1Dir, 'c3.cbz');
    const fileToAdd = path.join(manga1Dir, 'c8.cbz');
    fs.unlinkSync(fileToDelete);
    createTestCbz(fileToAdd);

    const reportI = await runScanWorkflow(scanner, db, folderA);
    assert.strictEqual(reportI.newFiles, 1, 'Should insert 1 new file (c8.cbz)');
    assert.strictEqual(reportI.prunedChapters, 1, 'Should prune 1 deleted file (c3.cbz)');
    const regChaptersI = db.getRegisteredChaptersMap(folderA.id);
    assert.strictEqual(regChaptersI.has(fileToDelete), false, 'Deleted c3.cbz must be gone');
    assert.strictEqual(regChaptersI.has(fileToAdd), true, 'Added c8.cbz must be present');
    console.log('✓ Test I passed: Simultaneous addition and deletion resolved correctly in single pass.');

    // ----------------------------------------------------------------
    // TEST J: Multi-chapter series: delete one vs delete all
    // ----------------------------------------------------------------
    console.log('\n--- Test J: Multi-Chapter Series Pruning Progression ---');
    const mangaJDir = path.join(libraryDirA, 'MangaJ');
    fs.mkdirSync(mangaJDir, { recursive: true });
    const j1 = path.join(mangaJDir, 'j1.cbz');
    const j2 = path.join(mangaJDir, 'j2.cbz');
    createTestCbz(j1);
    createTestCbz(j2);
    await runScanWorkflow(scanner, db, folderA);

    let seriesJ = db.getRegisteredSeriesMap(folderA.id).get(mangaJDir);
    assert.strictEqual(seriesJ.chapter_count, 2, 'Series J initially has 2 chapters');

    // Delete 1 chapter: series must survive
    fs.unlinkSync(j1);
    const reportJ1 = await runScanWorkflow(scanner, db, folderA);
    assert.strictEqual(reportJ1.prunedChapters, 1, 'Pruned 1 chapter');
    assert.strictEqual(reportJ1.prunedSeries, 0, 'Series J survived');
    seriesJ = db.getRegisteredSeriesMap(folderA.id).get(mangaJDir);
    assert.notStrictEqual(seriesJ, undefined, 'Series J must still exist');
    assert.strictEqual(seriesJ.chapter_count, 1, 'Series J chapter count updated to 1');

    // Delete remaining chapter: series must be pruned
    fs.unlinkSync(j2);
    const reportJ2 = await runScanWorkflow(scanner, db, folderA);
    assert.strictEqual(reportJ2.prunedChapters, 1, 'Pruned remaining chapter');
    assert.strictEqual(reportJ2.prunedSeries, 1, 'Empty series J pruned');
    assert.strictEqual(db.getRegisteredSeriesMap(folderA.id).has(mangaJDir), false, 'Series J must be gone from DB');
    console.log('✓ Test J passed: Surviving chapters preserve series; 0 remaining chapters prunes series.');

    // ----------------------------------------------------------------
    // TEST K: Metadata preservation on partial prune
    // ----------------------------------------------------------------
    console.log('\n--- Test K: Metadata Preservation on Partial Prune ---');
    const mangaKDir = path.join(libraryDirA, 'MangaK');
    fs.mkdirSync(mangaKDir, { recursive: true });
    const k1 = path.join(mangaKDir, 'k1.cbz');
    const k2 = path.join(mangaKDir, 'k2.cbz');
    createTestCbz(k1);
    createTestCbz(k2);
    await runScanWorkflow(scanner, db, folderA);

    const seriesK = db.getRegisteredSeriesMap(folderA.id).get(mangaKDir);
    // Customize metadata
    db.updateSeriesMetadata(seriesK.id, {
      title: 'Custom Title K',
      author: 'Custom Author K',
      description: 'Custom description for series K',
      tags: 'Action, Mystery'
    });
    db.toggleSeriesFavorite(seriesK.id);

    const tagObj = db.createTag('SpecialTag');
    db.setSeriesTags(seriesK.id, [tagObj.id]);

    // Delete 1 chapter and rescan
    fs.unlinkSync(k1);
    const reportK = await runScanWorkflow(scanner, db, folderA);
    assert.strictEqual(reportK.prunedChapters, 1, 'k1 pruned');

    const seriesKAfter = db.getSeriesById(seriesK.id);
    assert.strictEqual(seriesKAfter.title, 'Custom Title K', 'Custom title preserved');
    assert.strictEqual(seriesKAfter.author, 'Custom Author K', 'Custom author preserved');
    assert.strictEqual(seriesKAfter.description, 'Custom description for series K', 'Description preserved');
    assert.strictEqual(seriesKAfter.favorite, 1, 'Favorite status preserved');
    const seriesTags = db.getSeriesTags(seriesK.id);
    assert.strictEqual(seriesTags.length, 1, 'Tag relation preserved');
    assert.strictEqual(seriesTags[0].name, 'SpecialTag', 'Tag name preserved');
    console.log('✓ Test K passed: Surviving series custom metadata and tag relations preserved 100%.');

    // ----------------------------------------------------------------
    // TEST L: Reading state cleanup
    // ----------------------------------------------------------------
    console.log('\n--- Test L: Reading State Cleanup on Chapter Prune ---');
    const chK2 = db.getRegisteredChaptersMap(folderA.id).get(k2);
    assert.notStrictEqual(chK2, undefined, 'k2 chapter exists in DB');
    db.setChapterReadingPosition(chK2.id, 0.85);
    db.setChapterRead(chK2.id, 1);

    const chBeforeDelete = db.getChapterById(chK2.id);
    assert.strictEqual(chBeforeDelete.is_read, 1, 'Chapter is marked read');
    assert.strictEqual(chBeforeDelete.reading_position, 1.0, 'Reading position saved as completed');

    // Delete k2 and rescan
    fs.unlinkSync(k2);
    await runScanWorkflow(scanner, db, folderA);

    const chAfterDelete = db.getChapterById(chK2.id);
    assert.strictEqual(chAfterDelete, null, 'Chapter record cleanly deleted without error or dangling foreign key');
    console.log('✓ Test L passed: Reading position and chapter state cleaned cleanly.');

    // ----------------------------------------------------------------
    // TEST M: Empty directory scan prunes all remaining records
    // ----------------------------------------------------------------
    console.log('\n--- Test M: Empty Directory Scan ---');
    // Remove all remaining files in libraryDirA
    fs.rmSync(libraryDirA, { recursive: true, force: true });
    fs.mkdirSync(libraryDirA, { recursive: true });

    const reportM = await runScanWorkflow(scanner, db, folderA);
    assert.strictEqual(reportM.totalSeries, 0, '0 series discovered');
    assert.ok(reportM.prunedSeries >= 1 || reportM.prunedChapters >= 1, 'Remaining records under folderA pruned');

    const regChaptersM = db.getRegisteredChaptersMap(folderA.id);
    const regSeriesM = db.getRegisteredSeriesMap(folderA.id);
    assert.strictEqual(regChaptersM.size, 0, 'Zero chapters remaining in DB for folderA');
    assert.strictEqual(regSeriesM.size, 0, 'Zero series remaining in DB for folderA');
    // Folder itself must still exist in library_folders
    assert.strictEqual(db.getFolders().some(f => f.id === folderA.id), true, 'Folder record remains in library_folders');
    console.log('✓ Test M passed: Successful scan on empty directory prunes all records while folder remains.');

    console.log('\n======================================================');
    console.log('  ALL 13 SCANNER PRUNING TESTS (A - M) PASSED 100%!');
    console.log('======================================================');
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (_) {}
  }
}

runTests().catch(err => {
  console.error('\n❌ SCANNER PRUNING TEST FAILED:', err);
  process.exit(1);
});
