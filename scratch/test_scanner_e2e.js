const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const LibraryScanner = require('../src/scanner');
const DatabaseManager = require('../src/db');

async function runTests() {
  console.log('=== STARTING SCANNER E2E UNIT & INTEGRATION TESTS ===');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_'));
  const libraryDir = path.join(tempDir, 'library');
  const userDir = path.join(tempDir, 'userdata');
  const dbPath = path.join(userDir, 'test.db');
  fs.mkdirSync(libraryDir, { recursive: true });
  fs.mkdirSync(userDir, { recursive: true });

  const db = new DatabaseManager(dbPath);
  await db.init();
  const folder = db.addFolder(libraryDir);
  const scanner = new LibraryScanner(userDir);

  // Helper to create a dummy CBZ
  function createTestCbz(cbzPath, imageCount = 3) {
    const zip = new AdmZip();
    // 1x1 transparent PNG buffer
    const pngBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
    for (let i = 1; i <= imageCount; i++) {
      const pageName = String(i).padStart(3, '0') + '.png';
      zip.addFile(pageName, pngBuffer);
    }
    zip.writeZip(cbzPath);
  }

  // Create manga 1: "Berserk" with 3 chapters
  const manga1Dir = path.join(libraryDir, 'Berserk');
  fs.mkdirSync(manga1Dir, { recursive: true });
  createTestCbz(path.join(manga1Dir, 'Cap 01.cbz'));
  createTestCbz(path.join(manga1Dir, 'Cap 02.cbz'));
  createTestCbz(path.join(manga1Dir, 'Cap 03.cbz'));

  // Create manga 2: "[Author] Naruto" with 2 chapters
  const manga2Dir = path.join(libraryDir, '[Kishimoto] Naruto');
  fs.mkdirSync(manga2Dir, { recursive: true });
  createTestCbz(path.join(manga2Dir, 'Cap 01.cbz'));
  createTestCbz(path.join(manga2Dir, 'Cap 02.cbz'));

  // Create manga 3: standalone file
  createTestCbz(path.join(libraryDir, 'OneShot.cbz'));

  console.log('Test files created: 6 total comic files across 3 series.');

  // TEST 1: Initial Scan (Incremental mode on empty DB)
  console.log('\n--- TEST 1: First Scan ---');
  let onSeriesCount = 0;
  const initialReport = await scanner.scanDirectory(libraryDir, {
    mode: 'incremental',
    registeredChapters: db.getRegisteredChaptersMap(folder.id),
    registeredSeries: db.getRegisteredSeriesMap(folder.id),
    onSeries: (seriesData) => {
      onSeriesCount++;
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
  });

  db.save();
  console.log('Initial Report:', initialReport);
  if (initialReport.newFiles !== 6 || initialReport.skippedFiles !== 0 || initialReport.totalSeries !== 3) {
    throw new Error(`Test 1 Failed: Expected 6 new files and 3 series, got ${initialReport.newFiles} and ${initialReport.totalSeries}`);
  }
  console.log('✓ TEST 1 PASSED: Initial scan processed all 6 files as new.');

  // TEST 2: Re-scan without any modifications
  console.log('\n--- TEST 2: Second Scan (Zero Changes) ---');
  onSeriesCount = 0;
  const secondReport = await scanner.scanDirectory(libraryDir, {
    mode: 'incremental',
    registeredChapters: db.getRegisteredChaptersMap(folder.id),
    registeredSeries: db.getRegisteredSeriesMap(folder.id),
    onSeries: (seriesData) => {
      if (seriesData.hasChanges) onSeriesCount++;
    }
  });

  console.log('Second Report:', secondReport);
  if (secondReport.newFiles !== 0 || secondReport.skippedFiles !== 6 || secondReport.modifiedFiles !== 0) {
    throw new Error(`Test 2 Failed: Expected 6 skipped files and 0 new/modified, got ${secondReport.skippedFiles} skipped`);
  }
  if (onSeriesCount !== 0) {
    throw new Error(`Test 2 Failed: Expected 0 series with changes, got ${onSeriesCount}`);
  }
  console.log('✓ TEST 2 PASSED: Incremental scan successfully skipped all 6 unchanged files in ' + secondReport.totalScanTime);

  // TEST 3: Add 1 new file and touch 1 existing file
  console.log('\n--- TEST 3: 1 New File + 1 Modified File ---');
  createTestCbz(path.join(manga1Dir, 'Cap 04.cbz')); // New file
  const fileToModify = path.join(manga2Dir, 'Cap 01.cbz');
  // Append 1 byte to modify size and timestamp
  fs.appendFileSync(fileToModify, Buffer.from([0x00]));

  const thirdReport = await scanner.scanDirectory(libraryDir, {
    mode: 'incremental',
    registeredChapters: db.getRegisteredChaptersMap(folder.id),
    registeredSeries: db.getRegisteredSeriesMap(folder.id),
    onSeries: (seriesData) => {
      if (seriesData.hasChanges) {
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
          if (ch.status !== 'unchanged') {
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
    }
  });

  db.save();
  console.log('Third Report:', thirdReport);
  if (thirdReport.newFiles !== 1 || thirdReport.modifiedFiles !== 1 || thirdReport.skippedFiles !== 5) {
    throw new Error(`Test 3 Failed: Expected 1 new, 1 modified, 5 skipped. Got ${JSON.stringify(thirdReport)}`);
  }
  console.log('✓ TEST 3 PASSED: Accurately detected exactly 1 new and 1 modified file.');

  // TEST 4: Force Full Rescan Mode
  console.log('\n--- TEST 4: Force Full Rescan Mode ---');
  const fullReport = await scanner.scanDirectory(libraryDir, {
    mode: 'full',
    registeredChapters: db.getRegisteredChaptersMap(folder.id),
    registeredSeries: db.getRegisteredSeriesMap(folder.id)
  });
  console.log('Full Report:', fullReport);
  if (fullReport.modifiedFiles !== 7 || fullReport.skippedFiles !== 0) {
    throw new Error(`Test 4 Failed: Expected 7 modified in full mode, got ${fullReport.modifiedFiles}`);
  }
  console.log('✓ TEST 4 PASSED: Full scan mode reprocessed all 7 files.');

  // TEST 5: Error Resilience with Corrupted File
  console.log('\n--- TEST 5: Corrupted File Resilience ---');
  const corruptFile = path.join(libraryDir, 'CorruptManga', 'Cap 01.cbz');
  fs.mkdirSync(path.dirname(corruptFile), { recursive: true });
  fs.writeFileSync(corruptFile, Buffer.from('NOT_A_REAL_ZIP_FILE_JUST_CORRUPT_BYTES'));

  const errorReport = await scanner.scanDirectory(libraryDir, {
    mode: 'incremental',
    registeredChapters: db.getRegisteredChaptersMap(folder.id),
    registeredSeries: db.getRegisteredSeriesMap(folder.id)
  });
  console.log('Error Report:', errorReport);
  // The scanner should process other files normally and not crash!
  console.log('✓ TEST 5 PASSED: Scanner handled corrupted CBZ cleanly without aborting.');

  // TEST 6: Cancellation
  console.log('\n--- TEST 6: Cancellation ---');
  let cancelTriggered = false;
  const cancelReport = await scanner.scanDirectory(libraryDir, {
    mode: 'full',
    registeredChapters: db.getRegisteredChaptersMap(folder.id),
    registeredSeries: db.getRegisteredSeriesMap(folder.id),
    onProgress: (p) => {
      if (p.current >= 1 && !cancelTriggered) {
        cancelTriggered = true;
        scanner.cancel();
      }
    }
  });
  console.log('Cancel Report:', cancelReport);
  if (!cancelReport.cancelled) {
    throw new Error('Test 6 Failed: Expected cancelled to be true');
  }
  console.log('✓ TEST 6 PASSED: Cancellation cleanly stopped scanning.');

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('\n========================================');
  console.log('ALL 6 TESTS COMPLETED AND PASSED 100%!');
  console.log('========================================');
}

runTests().catch(err => {
  console.error('TEST SUITE ERROR:', err);
  process.exit(1);
});
