/**
 * Integration Test: Scanner & Re-scan Deep Group Matching
 *
 * Verifies that:
 * 1. Groups registered in the database are automatically detected from subfolder names during scan and re-scan todo (mode: full).
 * 2. Mangas with matching group names in subfolders have the group automatically linked in series_groups and series.group_name.
 * 3. Handles prefix brackets [Group], suffix brackets [Group], parenthesized (Group), delimited "Group - Title", and case-insensitivity.
 * 4. Resolves brackets with both group and author: [Group] [Author] Title correctly parses author and group without confusion.
 * 5. Preserves existing manually configured groups (author logic parity).
 * 6. Creating a group via createGroup links existing matching series.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const DatabaseManager = require('../../src/core/db');
const LibraryScanner = require('../../src/scanner/scanner');
const AdmZip = require('adm-zip');

function createZip(filePath) {
  const zip = new AdmZip();
  const pngBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  zip.addFile('001.png', pngBuffer);
  zip.writeZip(filePath);
}

async function runTests() {
  console.log('=== TEST SUITE: Scanner Deep Group Auto-Linking ===\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_group_scan_'));
  const dbPath = path.join(tempDir, 'test_group_scan.db');
  const libraryDir = path.join(tempDir, 'library');
  fs.mkdirSync(libraryDir, { recursive: true });

  const db = new DatabaseManager(dbPath);
  await db.init();

  const lib = db.createLibrary('Manga Library');
  const folder = db.addFolder(libraryDir, lib.id);
  const scanner = new LibraryScanner(path.join(tempDir, 'thumbnails'));

  // 1. Pre-register groups in database
  const group1 = db.createGroup('ScanAlpha');
  const group2 = db.createGroup('Studio Trigger');
  const group3 = db.createGroup('Café Scans');

  console.log('1. Pre-registered groups in DB:', [group1.name, group2.name, group3.name]);

  // Pre-register an author in catalog
  const author1 = db.createAuthor('Eiichiro Oda');

  // 2. Setup mock series folders on disk:
  // Series A: Prefix [ScanAlpha] Manga A
  const dirA = path.join(libraryDir, '[ScanAlpha] Manga A');
  fs.mkdirSync(dirA, { recursive: true });
  await createZip(path.join(dirA, 'Ch01.cbz'), [{ name: 'page1.txt', content: 'test' }]);

  // Series B: Prefix [Studio Trigger] [Eiichiro Oda] Manga B
  const dirB = path.join(libraryDir, '[Studio Trigger] [Eiichiro Oda] Manga B');
  fs.mkdirSync(dirB, { recursive: true });
  await createZip(path.join(dirB, 'Ch01.cbz'), [{ name: 'page1.txt', content: 'test' }]);

  // Series C: Suffix Manga C (Café Scans)
  const dirC = path.join(libraryDir, 'Manga C (Café Scans)');
  fs.mkdirSync(dirC, { recursive: true });
  await createZip(path.join(dirC, 'Ch01.cbz'), [{ name: 'page1.txt', content: 'test' }]);

  // Series D: Case-insensitive lowercase: [scanalpha] Manga D
  const dirD = path.join(libraryDir, '[scanalpha] Manga D');
  fs.mkdirSync(dirD, { recursive: true });
  await createZip(path.join(dirD, 'Ch01.cbz'), [{ name: 'page1.txt', content: 'test' }]);

  // Series E: Unregistered group: [RandomCircle] Manga E
  const dirE = path.join(libraryDir, '[RandomCircle] Manga E');
  fs.mkdirSync(dirE, { recursive: true });
  await createZip(path.join(dirE, 'Ch01.cbz'), [{ name: 'page1.txt', content: 'test' }]);

  // Series F: Delimited prefix "Studio Trigger - Manga F"
  const dirF = path.join(libraryDir, 'Studio Trigger - Manga F');
  fs.mkdirSync(dirF, { recursive: true });
  await createZip(path.join(dirF, 'Ch01.cbz'), [{ name: 'page1.txt', content: 'test' }]);

  console.log('2. Test folders created on disk.');

  // --- TEST A: Initial Scan with group auto-detection ---
  console.log('\n--- Test A: Initial Scan Auto-Detection ---');
  const allGroups = db.getAllGroups();

  await scanner.scanDirectory(libraryDir, {
    mode: 'incremental',
    registeredChapters: db.getRegisteredChaptersMap(folder.id),
    registeredSeries: db.getRegisteredSeriesMap(folder.id),
    registeredGroups: allGroups,
    onSeries: (seriesData) => {
      const sId = db.upsertSeries({
        folder_id: folder.id,
        title: seriesData.title,
        author: seriesData.author,
        path: seriesData.path,
        cover_path: seriesData.cover_path,
        chapter_count: seriesData.chapter_count,
        primary_format: seriesData.primary_format,
        group_name: seriesData.group_name || '',
        groupIds: seriesData.detectedGroups ? seriesData.detectedGroups.map(g => g.id) : undefined,
        rawFolderTitle: seriesData.rawFolderTitle || seriesData.subfolder || ''
      });
      for (const ch of seriesData.chapters) {
        db.upsertChapter({
          series_id: sId,
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

  const allSeries = db.getSeriesList();
  assert.strictEqual(allSeries.length, 6, 'Should identify all 6 series');

  const sA = allSeries.find(s => s.path === dirA);
  assert(sA, 'Series A found');
  assert.strictEqual(sA.group_name, 'ScanAlpha', 'Series A should have group ScanAlpha');
  const sAGroups = db.getSeriesGroups(sA.id);
  assert.strictEqual(sAGroups.length, 1, 'Series A linked in series_groups');
  assert.strictEqual(sAGroups[0].name, 'ScanAlpha');
  console.log('✓ Test A.1 passed: Prefix [Group] auto-linked');

  const sB = allSeries.find(s => s.path === dirB);
  assert(sB, 'Series B found');
  assert.strictEqual(sB.group_name, 'Studio Trigger', 'Series B group should be Studio Trigger');
  assert.strictEqual(sB.author, 'Eiichiro Oda', 'Series B author should be Eiichiro Oda');
  const sBAuthors = db.getSeriesAuthors(sB.id);
  assert.strictEqual(sBAuthors.length, 1, 'Series B author auto-linked');
  assert.strictEqual(sBAuthors[0].name, 'Eiichiro Oda');
  console.log('✓ Test A.2 passed: [Group] [Author] Title parsed correctly and both auto-linked');

  const sC = allSeries.find(s => s.path === dirC);
  assert(sC, 'Series C found');
  assert.strictEqual(sC.group_name, 'Café Scans', 'Series C should have Café Scans');
  console.log('✓ Test A.3 passed: Parenthesized (Group) auto-linked');

  const sD = allSeries.find(s => s.path === dirD);
  assert(sD, 'Series D found');
  assert.strictEqual(sD.group_name, 'ScanAlpha', 'Series D case-insensitive match should have ScanAlpha');
  console.log('✓ Test A.4 passed: Case-insensitive match auto-linked');

  const sE = allSeries.find(s => s.path === dirE);
  assert(sE, 'Series E found');
  assert.strictEqual(sE.group_name, '', 'Unregistered group should not be linked');
  assert.strictEqual(db.getSeriesGroups(sE.id).length, 0);
  console.log('✓ Test A.5 passed: Unregistered group remains unlinked');

  const sF = allSeries.find(s => s.path === dirF);
  assert(sF, 'Series F found');
  assert.strictEqual(sF.group_name, 'Studio Trigger', 'Series F delimited should have Studio Trigger');
  console.log('✓ Test A.6 passed: Delimited prefix auto-linked');

  // Verify group counts in DB
  const groupsAfterA = db.getAllGroups();
  const scanAlphaGrp = groupsAfterA.find(g => g.name === 'ScanAlpha');
  const triggerGrp = groupsAfterA.find(g => g.name === 'Studio Trigger');
  const cafeGrp = groupsAfterA.find(g => g.name === 'Café Scans');
  assert.strictEqual(scanAlphaGrp.manga_count, 2, 'ScanAlpha should have 2 mangas (A and D)');
  assert.strictEqual(triggerGrp.manga_count, 2, 'Studio Trigger should have 2 mangas (B and F)');
  assert.strictEqual(cafeGrp.manga_count, 1, 'Café Scans should have 1 manga (C)');
  console.log('✓ Test A.7 passed: Catalog manga_count matches auto-linked series');

  // --- TEST B: Manual Group Override Preservation ---
  console.log('\n--- Test B: Manual Group Override Preservation ---');
  // Manually change Series A to belong to Studio Trigger instead of ScanAlpha
  db.setSeriesGroups(sA.id, [group2.id]);
  const sABeforeRescan = db.getSeriesById(sA.id);
  assert.strictEqual(sABeforeRescan.group_name, 'Studio Trigger');

  // --- TEST C: Full Re-scan Mode ("Re-escanear todo") ---
  console.log('\n--- Test C: Re-escanear Todo (mode: full) ---');
  // Add a new group to database that matches Series E: "RandomCircle"
  const group4 = db.createGroup('RandomCircle');
  assert.strictEqual(group4.name, 'RandomCircle');

  // Now execute full re-scan
  await scanner.scanDirectory(libraryDir, {
    mode: 'full',
    registeredChapters: db.getRegisteredChaptersMap(folder.id),
    registeredSeries: db.getRegisteredSeriesMap(folder.id),
    registeredGroups: db.getAllGroups(),
    onSeries: (seriesData) => {
      const sId = db.upsertSeries({
        folder_id: folder.id,
        title: seriesData.title,
        author: seriesData.author,
        path: seriesData.path,
        cover_path: seriesData.cover_path,
        chapter_count: seriesData.chapter_count,
        primary_format: seriesData.primary_format,
        group_name: seriesData.group_name || '',
        groupIds: seriesData.detectedGroups ? seriesData.detectedGroups.map(g => g.id) : undefined,
        rawFolderTitle: seriesData.rawFolderTitle || seriesData.subfolder || ''
      });
      for (const ch of seriesData.chapters) {
        db.upsertChapter({
          series_id: sId,
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

  // Verify Series E is now linked to RandomCircle after full re-scan
  const sEAfter = db.getSeriesById(sE.id);
  assert.strictEqual(sEAfter.group_name, 'RandomCircle', 'Re-scan todo should auto-link previously unlinked Series E');
  assert.strictEqual(sEAfter.groups_list.length, 1);
  assert.strictEqual(sEAfter.groups_list[0].name, 'RandomCircle');
  console.log('✓ Test C.1 passed: Full re-scan auto-linked newly registered group');

  // Verify Series A preserved its manual override
  const sAAfter = db.getSeriesById(sA.id);
  assert.strictEqual(sAAfter.group_name, 'Studio Trigger', 'Manual group override on Series A must be preserved');
  console.log('✓ Test C.2 passed: Manual group override preserved during full re-scan');

  // --- TEST D: Standalone createGroup Auto-Link ---
  console.log('\n--- Test D: createGroup Auto-Link on Series on Disk ---');
  // Create Series G on disk with group "RedHawk"
  const dirG = path.join(libraryDir, '[RedHawk] Manga G');
  fs.mkdirSync(dirG, { recursive: true });
  await createZip(path.join(dirG, 'Ch01.cbz'), [{ name: 'page1.txt', content: 'test' }]);

  // Add series into DB without group (simulating prior scan without group in DB)
  const sGId = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga G',
    author: 'Desconocido',
    path: dirG,
    rawFolderTitle: '[RedHawk] Manga G'
  });
  const sGBefore = db.getSeriesById(sGId);
  assert.strictEqual(sGBefore.group_name, '');

  // Now create the group "RedHawk" via DB
  const redHawkGroup = db.createGroup('RedHawk');
  assert(redHawkGroup && redHawkGroup.id);

  const sGAfter = db.getSeriesById(sGId);
  assert.strictEqual(sGAfter.group_name, 'RedHawk', 'createGroup should immediately link matching series');
  assert.strictEqual(sGAfter.groups_list.length, 1);
  assert.strictEqual(sGAfter.groups_list[0].name, 'RedHawk');
  console.log('✓ Test D passed: createGroup auto-links matching series immediately');

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('\n========================================');
  console.log('ALL SCANNER GROUP AUTO-LINK TESTS PASSED (100%)');
  console.log('========================================');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
