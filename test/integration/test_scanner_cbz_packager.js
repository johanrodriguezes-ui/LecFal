/**
 * Integration Test: Scanner Automatic Packaging of Loose Images to CBZ
 *
 * Verifies that:
 * 1. Root loose images in a comic directory are packaged into Cap1.cbz,
 *    verified for integrity and image count, and original loose images deleted.
 * 2. Chapter subdirectories (e.g. "one piece 1", "one piece 2") are packaged into
 *    Cap1.cbz, Cap2.cbz (or preserving decimal numbers like Cap10.5.cbz),
 *    verified for integrity, and the original chapter directories deleted.
 * 3. Next available CapX.cbz number is used if Cap1.cbz already exists.
 * 4. When autoPackageCbz is false, loose images and chapter directories are NOT modified.
 * 5. Full scanner pipeline correctly discovers and registers the packaged CBZ chapters.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const DatabaseManager = require('../../src/core/db');
const LibraryScanner = require('../../src/scanner/scanner');
const AdmZip = require('adm-zip');

const DUMMY_PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

function createDummyImage(filePath) {
  fs.writeFileSync(filePath, DUMMY_PNG);
}

async function runTests() {
  console.log('=== TEST SUITE: Scanner Auto-Package Loose Images to CBZ ===\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_cbz_packager_'));
  const dbPath = path.join(tempDir, 'test_cbz_packager.db');
  const libraryDir = path.join(tempDir, 'library');
  fs.mkdirSync(libraryDir, { recursive: true });

  const db = new DatabaseManager(dbPath);
  await db.init();

  const lib = db.createLibrary('Test Library');
  const folder = db.addFolder(libraryDir, lib.id);
  const scanner = new LibraryScanner(path.join(tempDir, 'thumbnails'));

  try {
    // ----------------------------------------------------
    // TEST 1: Root loose images in comic directory (Caso 1)
    // ----------------------------------------------------
    console.log('Test 1: Root loose images in comic directory...');
    const series1Dir = path.join(libraryDir, 'OneShot Adventure');
    fs.mkdirSync(series1Dir, { recursive: true });
    createDummyImage(path.join(series1Dir, '01.jpg'));
    createDummyImage(path.join(series1Dir, '02.png'));
    createDummyImage(path.join(series1Dir, '03.webp'));

    // Scan with autoPackageCbz: true
    const report1 = await scanner.scanDirectory(libraryDir, {
      mode: 'full',
      autoPackageCbz: true,
      onSeries: (seriesData) => {
        const sid = db.upsertSeries({
          folder_id: folder.id,
          title: seriesData.title,
          path: seriesData.path,
          chapter_count: seriesData.chapter_count
        });
        for (const ch of seriesData.chapters) {
          db.upsertChapter({
            series_id: sid,
            title: ch.title,
            file_name: ch.file_name,
            file_path: ch.file_path,
            format: ch.format,
            chapter_number: ch.chapter_number
          });
        }
      }
    });

    const expectedCbz1 = path.join(series1Dir, 'Cap1.cbz');
    assert.strictEqual(fs.existsSync(expectedCbz1), true, 'Cap1.cbz must be created');
    assert.strictEqual(fs.existsSync(path.join(series1Dir, '01.jpg')), false, '01.jpg must be deleted');
    assert.strictEqual(fs.existsSync(path.join(series1Dir, '02.png')), false, '02.png must be deleted');
    assert.strictEqual(fs.existsSync(path.join(series1Dir, '03.webp')), false, '03.webp must be deleted');

    // Verify zip contents
    const zip1 = new AdmZip(expectedCbz1);
    const zipEntries1 = zip1.getEntries().filter(e => !e.isDirectory);
    assert.strictEqual(zipEntries1.length, 3, 'Cap1.cbz must contain 3 images');

    // Verify DB registration
    const allSeries1 = db.getSeriesList();
    const s1 = allSeries1.find(s => s.title === 'OneShot Adventure');
    assert(s1, 'Series 1 should be registered in DB');
    const chs1 = db.getChapters(s1.id);
    assert.strictEqual(chs1.length, 1, 'Should have 1 chapter registered');
    assert.strictEqual(chs1[0].file_name, 'Cap1.cbz', 'Chapter file_name must be Cap1.cbz');
    console.log('  ✓ Test 1 Passed: Cap1.cbz created, 3 images packaged, originals deleted, DB registered.');

    // ----------------------------------------------------
    // TEST 2: Chapter subdirectories packaging (Caso 2)
    // ----------------------------------------------------
    console.log('\nTest 2: Chapter subdirectories in comic directory...');
    const series2Dir = path.join(libraryDir, 'Epic Manga');
    const chDir1 = path.join(series2Dir, 'one piece 1');
    const chDir2 = path.join(series2Dir, 'one piece 2');
    fs.mkdirSync(chDir1, { recursive: true });
    fs.mkdirSync(chDir2, { recursive: true });

    createDummyImage(path.join(chDir1, 'p1.jpg'));
    createDummyImage(path.join(chDir1, 'p2.jpg'));
    createDummyImage(path.join(chDir2, 'p1.png'));
    createDummyImage(path.join(chDir2, 'p2.png'));
    createDummyImage(path.join(chDir2, 'p3.png'));

    await scanner.scanDirectory(libraryDir, {
      mode: 'full',
      autoPackageCbz: true,
      onSeries: (seriesData) => {
        const sid = db.upsertSeries({
          folder_id: folder.id,
          title: seriesData.title,
          path: seriesData.path,
          chapter_count: seriesData.chapter_count
        });
        for (const ch of seriesData.chapters) {
          db.upsertChapter({
            series_id: sid,
            title: ch.title,
            file_name: ch.file_name,
            file_path: ch.file_path,
            format: ch.format,
            chapter_number: ch.chapter_number
          });
        }
      }
    });

    const expectedCbz2_1 = path.join(series2Dir, 'Cap1.cbz');
    const expectedCbz2_2 = path.join(series2Dir, 'Cap2.cbz');

    assert.strictEqual(fs.existsSync(expectedCbz2_1), true, 'Cap1.cbz must be created for chapter 1');
    assert.strictEqual(fs.existsSync(expectedCbz2_2), true, 'Cap2.cbz must be created for chapter 2');
    assert.strictEqual(fs.existsSync(chDir1), false, 'Original chapter folder 1 must be deleted');
    assert.strictEqual(fs.existsSync(chDir2), false, 'Original chapter folder 2 must be deleted');

    // Verify zip contents
    const zip2_1 = new AdmZip(expectedCbz2_1);
    const zip2_2 = new AdmZip(expectedCbz2_2);
    assert.strictEqual(zip2_1.getEntries().filter(e => !e.isDirectory).length, 2, 'Cap1.cbz must contain 2 images');
    assert.strictEqual(zip2_2.getEntries().filter(e => !e.isDirectory).length, 3, 'Cap2.cbz must contain 3 images');

    // Verify DB registration
    const allSeries2 = db.getSeriesList();
    const s2 = allSeries2.find(s => s.title === 'Epic Manga');
    assert(s2, 'Series 2 should be registered in DB');
    const chs2 = db.getChapters(s2.id);
    assert.strictEqual(chs2.length, 2, 'Should have 2 chapters registered');
    console.log('  ✓ Test 2 Passed: Cap1.cbz and Cap2.cbz created from subdirectories, originals removed.');

    // ----------------------------------------------------
    // TEST 3: Decimal chapter numbers (e.g. "Cap 10.5")
    // ----------------------------------------------------
    console.log('\nTest 3: Chapter subdirectories with decimal numbers...');
    const series3Dir = path.join(libraryDir, 'Decimal Manga');
    const chDir3 = path.join(series3Dir, 'Capítulo 10.5 Extra');
    fs.mkdirSync(chDir3, { recursive: true });
    createDummyImage(path.join(chDir3, 'extra.jpg'));

    await scanner.scanDirectory(libraryDir, {
      mode: 'full',
      autoPackageCbz: true
    });

    const expectedCbz3 = path.join(series3Dir, 'Cap10.5.cbz');
    assert.strictEqual(fs.existsSync(expectedCbz3), true, 'Cap10.5.cbz must be created');
    assert.strictEqual(fs.existsSync(chDir3), false, 'Subdirectory Capítulo 10.5 Extra must be deleted');
    console.log('  ✓ Test 3 Passed: Decimal chapter name Cap10.5.cbz correctly extracted and verified.');

    // ----------------------------------------------------
    // TEST 4: Next available CapX when Cap1 already exists
    // ----------------------------------------------------
    console.log('\nTest 4: Next available CapX when Cap1 already exists...');
    const series4Dir = path.join(libraryDir, 'Existing Cap Manga');
    fs.mkdirSync(series4Dir, { recursive: true });
    // Pre-create Cap1.cbz
    createDummyImage(path.join(series4Dir, 'tmp.png'));
    const preZip = new AdmZip();
    preZip.addLocalFile(path.join(series4Dir, 'tmp.png'));
    preZip.writeZip(path.join(series4Dir, 'Cap1.cbz'));
    fs.unlinkSync(path.join(series4Dir, 'tmp.png'));

    // Add new loose images
    createDummyImage(path.join(series4Dir, 'new_page1.jpg'));
    createDummyImage(path.join(series4Dir, 'new_page2.jpg'));

    await scanner.scanDirectory(libraryDir, {
      mode: 'full',
      autoPackageCbz: true
    });

    const expectedCbz4 = path.join(series4Dir, 'Cap2.cbz');
    assert.strictEqual(fs.existsSync(expectedCbz4), true, 'Cap2.cbz must be created since Cap1 already existed');
    assert.strictEqual(fs.existsSync(path.join(series4Dir, 'new_page1.jpg')), false, 'Loose images deleted');
    console.log('  ✓ Test 4 Passed: Cap2.cbz created avoiding collision with existing Cap1.cbz.');

    // ----------------------------------------------------
    // TEST 5: When autoPackageCbz is false, do not bundle or delete
    // ----------------------------------------------------
    console.log('\nTest 5: When autoPackageCbz is false...');
    const series5Dir = path.join(libraryDir, 'Manual Manga');
    const chDir5 = path.join(series5Dir, 'manual 1');
    fs.mkdirSync(chDir5, { recursive: true });
    createDummyImage(path.join(series5Dir, 'loose.png'));
    createDummyImage(path.join(chDir5, 'sub_loose.png'));

    await scanner.scanDirectory(libraryDir, {
      mode: 'full',
      autoPackageCbz: false
    });

    assert.strictEqual(fs.existsSync(path.join(series5Dir, 'Cap1.cbz')), false, 'Cap1.cbz must NOT be created');
    assert.strictEqual(fs.existsSync(path.join(series5Dir, 'loose.png')), true, 'loose.png must remain intact');
    assert.strictEqual(fs.existsSync(chDir5), true, 'manual 1 folder must remain intact');
    console.log('  ✓ Test 5 Passed: No packaging or deletion when autoPackageCbz: false.');

    console.log('\n✅ ALL SCANNER CBZ PACKAGER TESTS PASSED!');
  } finally {
    try {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
