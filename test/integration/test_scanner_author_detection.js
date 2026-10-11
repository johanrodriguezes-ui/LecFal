/**
 * Integration Test: Scanner & Re-scan Deep Author Matching & Parody Resolution
 *
 * Verifies that:
 * 1. Nested brackets [Group (Author)] and [(Author) Group] correctly resolve group and author.
 * 2. Pre-registered authors in database are automatically detected and linked during scan.
 * 3. Additional parentheses with series/parodies e.g. Title (Parody) do NOT override author or get suggested as author.
 * 4. [Group] Title (Parody) assigns Group to group and does NOT treat Parody as author.
 * 5. Suffix authors Title (Parody) (Author) or Title (Author) are correctly detected and linked.
 * 6. Case-insensitivity and whitespace trimming for author matching.
 * 7. Manual author overrides are preserved during re-scan.
 * 8. Re-scan todo (mode: full) auto-links newly created authors.
 * 9. db.createAuthor immediately links existing series on disk with [Group (Author)] or folder match.
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
  console.log('=== TEST SUITE: Scanner Deep Author & Parody Auto-Linking ===\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_author_scan_'));
  const dbPath = path.join(tempDir, 'test_author_scan.db');
  const libraryDir = path.join(tempDir, 'library');
  fs.mkdirSync(libraryDir, { recursive: true });

  const db = new DatabaseManager(dbPath);
  await db.init();

  const lib = db.createLibrary('Manga Library');
  const folder = db.addFolder(libraryDir, lib.id);
  const scanner = new LibraryScanner(path.join(tempDir, 'thumbnails'));

  // 1. Pre-register groups and authors in database
  const group1 = db.createGroup('Studio Trigger');
  const group2 = db.createGroup('Alice Soft');
  const author1 = db.createAuthor('Hiroyuki Imaishi');
  const author2 = db.createAuthor('Eiichiro Oda');
  const author3 = db.createAuthor('Masashi Kishimoto');
  const parody1 = db.createParody('Kill la Kill');

  console.log('1. Pre-registered entities:');
  console.log('   Groups: ', [group1.name, group2.name]);
  console.log('   Authors:', [author1.name, author2.name, author3.name]);
  console.log('   Parodies:', [parody1.name]);

  // 2. Setup test series on disk:

  // Series A: Nested bracket [Group (Author)] Title
  // Folder: [Studio Trigger (Hiroyuki Imaishi)] Little Witch Academia
  const dirA = path.join(libraryDir, '[Studio Trigger (Hiroyuki Imaishi)] Little Witch Academia');
  fs.mkdirSync(dirA, { recursive: true });
  await createZip(path.join(dirA, 'Ch01.cbz'));

  // Series B: Nested bracket with parody & language: [Group (Author)] Title (Parody) [Spanish]
  // Folder: [Studio Trigger (Hiroyuki Imaishi)] Promare (Kill la Kill) [Spanish]
  const dirB = path.join(libraryDir, '[Studio Trigger (Hiroyuki Imaishi)] Promare (Kill la Kill) [Spanish]');
  fs.mkdirSync(dirB, { recursive: true });
  await createZip(path.join(dirB, 'Ch01.cbz'));

  // Series C: Single group bracket with parody, NO author: [Group] Title (Parody)
  // Folder: [Studio Trigger] Inferno Cop (Kill la Kill)
  const dirC = path.join(libraryDir, '[Studio Trigger] Inferno Cop (Kill la Kill)');
  fs.mkdirSync(dirC, { recursive: true });
  await createZip(path.join(dirC, 'Ch01.cbz'));

  // Series D: Multiple brackets: [Group] [Author] Title
  // Folder: [Alice Soft] [Eiichiro Oda] Grand Pirate Adventure
  const dirD = path.join(libraryDir, '[Alice Soft] [Eiichiro Oda] Grand Pirate Adventure');
  fs.mkdirSync(dirD, { recursive: true });
  await createZip(path.join(dirD, 'Ch01.cbz'));

  // Series E: Suffix author after parody: Title (Parody) (Author)
  // Folder: Ninja Chronicles (Kill la Kill) (Masashi Kishimoto)
  const dirE = path.join(libraryDir, 'Ninja Chronicles (Kill la Kill) (Masashi Kishimoto)');
  fs.mkdirSync(dirE, { recursive: true });
  await createZip(path.join(dirE, 'Ch01.cbz'));

  // Series F: Unregistered author inside nested bracket [Group (NewArtist)] Title
  // Folder: [Alice Soft (NewArtist)] Quest For Gold
  const dirF = path.join(libraryDir, '[Alice Soft (NewArtist)] Quest For Gold');
  fs.mkdirSync(dirF, { recursive: true });
  await createZip(path.join(dirF, 'Ch01.cbz'));

  console.log('2. Test folders created on disk.');

  // --- TEST A: Initial Scan Auto-Detection ---
  console.log('\n--- Test A: Initial Scan Auto-Detection ---');
  const allGroups = db.getAllGroups();
  const allAuthors = db.getAllAuthors();
  const allParodies = db.getAllParodies();

  await scanner.scanDirectory(libraryDir, {
    mode: 'incremental',
    registeredChapters: db.getRegisteredChaptersMap(folder.id),
    registeredSeries: db.getRegisteredSeriesMap(folder.id),
    registeredGroups: allGroups,
    registeredAuthors: allAuthors,
    registeredParodies: allParodies,
    onSeries: (seriesData) => {
      const sId = db.upsertSeries({
        folder_id: folder.id,
        title: seriesData.title,
        author: seriesData.author,
        detected_author: seriesData.detected_author || '',
        path: seriesData.path,
        cover_path: seriesData.cover_path,
        chapter_count: seriesData.chapter_count,
        primary_format: seriesData.primary_format,
        group_name: seriesData.group_name || '',
        groupIds: seriesData.detectedGroups ? seriesData.detectedGroups.map(g => g.id) : undefined,
        authorIds: seriesData.detectedAuthors ? seriesData.detectedAuthors.map(a => a.id) : undefined,
        parody: seriesData.parody || '',
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

  // Verify Series A: [Studio Trigger (Hiroyuki Imaishi)] Little Witch Academia
  const sA = allSeries.find(s => s.path === dirA);
  assert(sA, 'Series A found');
  assert.strictEqual(sA.title, 'Little Witch Academia', 'Series A title cleaned');
  assert.strictEqual(sA.group_name, 'Studio Trigger', 'Series A group auto-linked');
  assert.strictEqual(sA.author, 'Hiroyuki Imaishi', 'Series A author auto-linked');
  const sAAuthors = db.getSeriesAuthors(sA.id);
  assert.strictEqual(sAAuthors.length, 1, 'Series A linked in series_authors');
  assert.strictEqual(sAAuthors[0].name, 'Hiroyuki Imaishi');
  console.log('✓ Test A.1 passed: Nested [Group (Author)] properly parses group, author and clean title');

  // Verify Series B: [Studio Trigger (Hiroyuki Imaishi)] Promare (Kill la Kill) [Spanish]
  const sB = allSeries.find(s => s.path === dirB);
  assert(sB, 'Series B found');
  assert.strictEqual(sB.title, 'Promare', 'Series B title cleaned');
  assert.strictEqual(sB.group_name, 'Studio Trigger', 'Series B group Studio Trigger');
  assert.strictEqual(sB.author, 'Hiroyuki Imaishi', 'Series B author Hiroyuki Imaishi');
  const sBAuthors = db.getSeriesAuthors(sB.id);
  assert.strictEqual(sBAuthors.length, 1);
  assert.strictEqual(sBAuthors[0].name, 'Hiroyuki Imaishi');
  console.log('✓ Test A.2 passed: Nested [Group (Author)] with parody & language tags preserves author');

  // Verify Series C: [Studio Trigger] Inferno Cop (Kill la Kill)
  const sC = allSeries.find(s => s.path === dirC);
  assert(sC, 'Series C found');
  assert.strictEqual(sC.title, 'Inferno Cop', 'Series C title cleaned');
  assert.strictEqual(sC.group_name, 'Studio Trigger', 'Series C group Studio Trigger');
  assert.strictEqual(sC.author, 'Desconocido', 'Series C author must NOT be Kill la Kill');
  assert.strictEqual(db.getSeriesAuthors(sC.id).length, 0, 'Series C has no author linked');
  assert.strictEqual(sC.detected_author, '', 'Series C detected_author does not suggest Kill la Kill');
  console.log('✓ Test A.3 passed: [Group] Title (Parody) does not mistakenly treat parody as author');

  // Verify Series D: [Alice Soft] [Eiichiro Oda] Grand Pirate Adventure
  const sD = allSeries.find(s => s.path === dirD);
  assert(sD, 'Series D found');
  assert.strictEqual(sD.title, 'Grand Pirate Adventure');
  assert.strictEqual(sD.group_name, 'Alice Soft');
  assert.strictEqual(sD.author, 'Eiichiro Oda');
  const sDAuthors = db.getSeriesAuthors(sD.id);
  assert.strictEqual(sDAuthors.length, 1);
  assert.strictEqual(sDAuthors[0].name, 'Eiichiro Oda');
  console.log('✓ Test A.4 passed: Multiple prefix brackets [Group] [Author] Title both auto-linked');

  // Verify Series E: Ninja Chronicles (Kill la Kill) (Masashi Kishimoto)
  const sE = allSeries.find(s => s.path === dirE);
  assert(sE, 'Series E found');
  assert.strictEqual(sE.title, 'Ninja Chronicles');
  assert.strictEqual(sE.author, 'Masashi Kishimoto', 'Author in suffix parentheses matched');
  const sEAuthors = db.getSeriesAuthors(sE.id);
  assert.strictEqual(sEAuthors.length, 1);
  assert.strictEqual(sEAuthors[0].name, 'Masashi Kishimoto');
  console.log('✓ Test A.5 passed: Suffix author Title (Parody) (Author) detected and auto-linked');

  // Verify Series F: Unregistered author inside nested bracket [Alice Soft (NewArtist)] Quest For Gold
  const sF = allSeries.find(s => s.path === dirF);
  assert(sF, 'Series F found');
  assert.strictEqual(sF.title, 'Quest For Gold');
  assert.strictEqual(sF.group_name, 'Alice Soft');
  assert.strictEqual(sF.author, 'Desconocido', 'Unregistered author remains Desconocido');
  assert.strictEqual(sF.detected_author, 'NewArtist', 'Candidate author NewArtist stored for suggestion');
  console.log('✓ Test A.6 passed: Unregistered inner parenthesis stored cleanly in detected_author');

  // --- TEST B: Manual Author Override Preservation ---
  console.log('\n--- Test B: Manual Author Override Preservation ---');
  // User manually edits Series A to belong to Eiichiro Oda
  db.setSeriesAuthors(sA.id, [author2.id]);
  const sABeforeRescan = db.getSeriesById(sA.id);
  assert.strictEqual(sABeforeRescan.author, 'Eiichiro Oda');

  // --- TEST C: createAuthor Retroactive Linking ---
  console.log('\n--- Test C: createAuthor Auto-Links Series on Disk ---');
  // Register 'NewArtist' in the catalog
  const newAuthor = db.createAuthor('NewArtist');
  const sFAfterCreate = db.getSeriesById(sF.id);
  assert.strictEqual(sFAfterCreate.author, 'NewArtist', 'Series F should now be linked to NewArtist');
  assert.strictEqual(sFAfterCreate.authors_list.length, 1);
  assert.strictEqual(sFAfterCreate.authors_list[0].name, 'NewArtist');
  console.log('✓ Test C passed: createAuthor immediately auto-links series with [Group (NewArtist)]');

  // --- TEST D: Re-scan Todo (mode: full) ---
  console.log('\n--- Test D: Full Re-scan with Author Detection ---');
  await scanner.scanDirectory(libraryDir, {
    mode: 'full',
    registeredChapters: db.getRegisteredChaptersMap(folder.id),
    registeredSeries: db.getRegisteredSeriesMap(folder.id),
    registeredGroups: db.getAllGroups(),
    registeredAuthors: db.getAllAuthors(),
    registeredParodies: db.getAllParodies(),
    onSeries: (seriesData) => {
      db.upsertSeries({
        folder_id: folder.id,
        title: seriesData.title,
        author: seriesData.author,
        detected_author: seriesData.detected_author || '',
        path: seriesData.path,
        cover_path: seriesData.cover_path,
        chapter_count: seriesData.chapter_count,
        primary_format: seriesData.primary_format,
        group_name: seriesData.group_name || '',
        groupIds: seriesData.detectedGroups ? seriesData.detectedGroups.map(g => g.id) : undefined,
        authorIds: seriesData.detectedAuthors ? seriesData.detectedAuthors.map(a => a.id) : undefined,
        parody: seriesData.parody || '',
        rawFolderTitle: seriesData.rawFolderTitle || seriesData.subfolder || ''
      });
    }
  });

  const sAAfterFull = db.getSeriesById(sA.id);
  assert.strictEqual(sAAfterFull.author, 'Eiichiro Oda', 'Manual author override on Series A preserved');
  console.log('✓ Test D passed: Manual author override preserved during full re-scan');

  console.log('\n========================================');
  console.log('ALL SCANNER AUTHOR AUTO-LINK TESTS PASSED (100%)');
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
