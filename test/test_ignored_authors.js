/**
 * Tests for Author-Detection Ignore Feature
 *
 * Verifies:
 * A. Ignore persistence (ignoreAuthor, isAuthorIgnored, getAllIgnoredAuthors)
 * B. Idempotency (ignoring twice produces exactly one entry without error)
 * C. Unignore (unignoreAuthor removes entry and restores eligibility)
 * D. Suggestion suppression (series.is_author_ignored is true when detected_author is ignored)
 * E. detected_author preservation (series.detected_author remains intact after ignore)
 * F. Existing author precedence (EXISTING AUTHOR > IGNORED VALUE)
 * G. Manual author creation overrides ignore (removes from ignored_authors and auto-links series)
 * H. Future scan / upsert compatibility (auto-matching continues to work for catalog authors)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const DatabaseManager = require('../src/db');

async function runTests() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_ignored_'));
  const dbPath = path.join(tempDir, 'test_ignored_authors.db');
  const db = new DatabaseManager(dbPath);
  await db.init();

  console.log('=== TEST A: Ignore Persistence ===');
  db.ignoreAuthor('Digital');
  assert.strictEqual(db.isAuthorIgnored('Digital'), true, 'Digital should be reported as ignored');
  assert.strictEqual(db.isAuthorIgnored('digital'), true, 'isAuthorIgnored should be case-insensitive');
  assert.strictEqual(db.isAuthorIgnored('  Digital  '), true, 'isAuthorIgnored should trim input');
  
  const allIgnored = db.getAllIgnoredAuthors();
  assert.strictEqual(allIgnored.length, 1, 'Should contain exactly 1 ignored author');
  assert.strictEqual(allIgnored[0].name, 'Digital', 'Ignored name should match');
  console.log('✓ TEST A PASSED: Ignore persistence verified.');

  console.log('\n=== TEST B: Idempotency ===');
  // Ignore again
  db.ignoreAuthor('Digital');
  db.ignoreAuthor('digital');
  const listAfterDuplicate = db.getAllIgnoredAuthors();
  assert.strictEqual(listAfterDuplicate.length, 1, 'Duplicate ignore should not create duplicate entries');
  console.log('✓ TEST B PASSED: Idempotency verified.');

  console.log('\n=== TEST C: Unignore ===');
  db.ignoreAuthor('Scanlation');
  assert.strictEqual(db.isAuthorIgnored('Scanlation'), true);
  db.unignoreAuthor('Scanlation');
  assert.strictEqual(db.isAuthorIgnored('Scanlation'), false, 'Scanlation should no longer be ignored');
  const remainingIgnored = db.getAllIgnoredAuthors();
  assert.strictEqual(remainingIgnored.some(i => i.name.toLowerCase() === 'scanlation'), false);
  console.log('✓ TEST C PASSED: Unignore verified.');

  console.log('\n=== TEST D & E: Suggestion Suppression & detected_author Preservation ===');
  const folder = db.addFolder(path.join(tempDir, 'library'));
  
  // Create Series 1 with detected_author = "TeamName" (not ignored yet)
  const seriesId1 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga One',
    author: 'Desconocido',
    detected_author: 'TeamName',
    path: path.join(tempDir, 'library', '[TeamName] Manga One')
  });

  const s1Before = db.getSeriesById(seriesId1);
  assert.strictEqual(s1Before.detected_author, 'TeamName');
  assert.strictEqual(s1Before.is_author_ignored, false, 'Suggestion should be eligible before ignore');

  // Now ignore "TeamName"
  db.ignoreAuthor('TeamName');
  
  const s1After = db.getSeriesById(seriesId1);
  assert.strictEqual(s1After.detected_author, 'TeamName', 'series.detected_author must be preserved');
  assert.strictEqual(s1After.is_author_ignored, true, 'Suggestion should be suppressed after ignore');
  console.log('✓ TEST D & E PASSED: Suggestion suppression and detected_author preservation verified.');

  console.log('\n=== TEST F: Existing Author Precedence ===');
  // Author exists in catalog
  const realAuthor = db.createAuthor('RealArtist');
  assert.strictEqual(db.isAuthorIgnored('RealArtist'), false, 'Real author in catalog must never be considered ignored');

  // If someone also has "RealArtist" in ignored_authors (e.g. legacy/edge case), authorCheck takes precedence
  db.db.run('INSERT OR IGNORE INTO ignored_authors (name) VALUES (?)', ['RealArtist']);
  assert.strictEqual(db.isAuthorIgnored('RealArtist'), false, 'Catalog author takes precedence over ignored_authors');

  // Auto-linking during upsert works for catalog author
  const seriesId2 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Two',
    author: 'Desconocido',
    detected_author: 'RealArtist',
    path: path.join(tempDir, 'library', '[RealArtist] Manga Two')
  });

  const s2 = db.getSeriesById(seriesId2);
  assert.strictEqual(s2.authors_list.length, 1, 'Matching series should be automatically linked to author');
  assert.strictEqual(s2.authors_list[0].name, 'RealArtist');
  assert.strictEqual(s2.is_author_ignored, false);
  console.log('✓ TEST F PASSED: Existing author precedence verified.');

  console.log('\n=== TEST G: Manual Author Creation Overrides Ignore ===');
  // 1. Ignore "CircleName"
  db.ignoreAuthor('CircleName');
  assert.strictEqual(db.isAuthorIgnored('CircleName'), true);

  // 2. Series with detected_author = "CircleName" exists
  const seriesId3 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Three',
    author: 'Desconocido',
    detected_author: 'CircleName',
    path: path.join(tempDir, 'library', '[CircleName] Manga Three')
  });

  const s3Before = db.getSeriesById(seriesId3);
  assert.strictEqual(s3Before.is_author_ignored, true);
  assert.strictEqual(s3Before.authors_list.length, 0);

  // 3. User creates author "CircleName" normally (e.g. from Settings)
  const newAuthor = db.createAuthor('CircleName');
  assert(newAuthor && newAuthor.id, 'Author created successfully');

  // 4. Verify removed from ignored_authors
  assert.strictEqual(db.isAuthorIgnored('CircleName'), false, 'Must be removed from ignored_authors');
  const allAfterCreate = db.getAllIgnoredAuthors();
  assert.strictEqual(allAfterCreate.some(i => i.name.toLowerCase() === 'circlename'), false);

  // 5. Verify matching series is linked
  const s3After = db.getSeriesById(seriesId3);
  assert.strictEqual(s3After.authors_list.length, 1, 'Series must be auto-linked upon author creation');
  assert.strictEqual(s3After.authors_list[0].name, 'CircleName');
  assert.strictEqual(s3After.is_author_ignored, false);
  console.log('✓ TEST G PASSED: Author creation overrides ignore and auto-links series.');

  console.log('\n=== TEST H: Future Scan Compatibility ===');
  // A new series is scanned where detected_author matches the catalog author "CircleName"
  const seriesId4 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Four',
    author: 'CircleName',
    detected_author: 'CircleName',
    path: path.join(tempDir, 'library', '[CircleName] Manga Four')
  });

  const s4 = db.getSeriesById(seriesId4);
  assert.strictEqual(s4.authors_list.length, 1);
  assert.strictEqual(s4.authors_list[0].name, 'CircleName');
  assert.strictEqual(s4.author, 'CircleName');
  console.log('✓ TEST H PASSED: Future scan auto-linking compatibility verified.');

  // Cleanup temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('\n========================================');
  console.log('ALL IGNORED AUTHORS TESTS PASSED (8/8)!');
  console.log('========================================');
}

runTests().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
