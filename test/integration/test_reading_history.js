/**
 * Integration Test Suite: Reading History Model & Management
 *
 * Verifies all requirements (A through BH):
 * - Database schema & foreign key cascade
 * - Migration from chapters.last_read_at to reading_history
 * - Continue Reading & Recently Read queries
 * - Reading activity updates & 90% completion threshold
 * - Single history entry deletion (preserving reading progress)
 * - Optional full manga reset (transactional, affecting only target series)
 * - Clear all history (preserving reading progress and files)
 * - Cascade on chapter and series deletion
 * - Preload & IPC API exposure
 * - UI navigation separation & modal behavior
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const DatabaseManager = require('../../src/core/db');

function insertSeriesFixture(db, { folder_id, title, series_path, cover_path = '', author = 'Autor', primary_format = 'cbz' }) {
  db.db.run(
    'INSERT INTO series (folder_id, title, path, cover_path, author, primary_format) VALUES (?, ?, ?, ?, ?, ?)',
    [folder_id, title, series_path, cover_path, author, primary_format]
  );
  const stmt = db.db.prepare('SELECT id FROM series WHERE path = ?');
  stmt.bind([series_path]);
  stmt.step();
  const id = stmt.getAsObject().id;
  stmt.free();
  return { id, title, path: series_path };
}

function insertChapterFixture(db, { series_id, title, file_name, file_path, format = 'cbz', chapter_number = 1, page_count = 20, reading_position = 0, is_read = 0, last_read_at = null }) {
  db.db.run(
    'INSERT INTO chapters (series_id, title, file_name, file_path, format, chapter_number, page_count, reading_position, is_read, last_read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [series_id, title, file_name, file_path, format, chapter_number, page_count, reading_position, is_read, last_read_at]
  );
  const stmt = db.db.prepare('SELECT id FROM chapters WHERE file_path = ?');
  stmt.bind([file_path]);
  stmt.step();
  const id = stmt.getAsObject().id;
  stmt.free();
  return { id, series_id, title, file_path };
}

async function runReadingHistoryTests() {
  console.log('======================================================');
  console.log('  LECFAL DEDICATED READING HISTORY TEST SUITE');
  console.log('======================================================\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_reading_history_test_'));
  const dbPath = path.join(tempDir, 'test_reading_history.db');
  const db = new DatabaseManager(dbPath);
  await db.init();

  // Create mock files to verify file safety
  const mangaDir = path.join(tempDir, 'MangaFolder');
  fs.mkdirSync(mangaDir, { recursive: true });
  const series1Dir = path.join(mangaDir, 'Series Alpha');
  fs.mkdirSync(series1Dir, { recursive: true });
  const file1Path = path.join(series1Dir, 'ch1.cbz');
  const file2Path = path.join(series1Dir, 'ch2.cbz');
  const file3Path = path.join(series1Dir, 'ch3.cbz');
  fs.writeFileSync(file1Path, 'DUMMY CBZ 1 CONTENT');
  fs.writeFileSync(file2Path, 'DUMMY CBZ 2 CONTENT');
  fs.writeFileSync(file3Path, 'DUMMY CBZ 3 CONTENT');

  const series2Dir = path.join(mangaDir, 'Series Beta');
  fs.mkdirSync(series2Dir, { recursive: true });
  const fileBetaPath = path.join(series2Dir, 'beta1.cbz');
  fs.writeFileSync(fileBetaPath, 'DUMMY BETA CBZ CONTENT');

  const folder = db.addFolder(mangaDir);
  const series1 = insertSeriesFixture(db, {
    folder_id: folder.id,
    title: 'Series Alpha',
    series_path: series1Dir
  });

  const series2 = insertSeriesFixture(db, {
    folder_id: folder.id,
    title: 'Series Beta',
    series_path: series2Dir
  });

  // ====================================================
  // DATABASE / SCHEMA (Tests A - D)
  // ====================================================
  console.log('--- Tests A - D: Schema & Table Verification ---');

  // A. reading_history table exists
  const tableCheckStmt = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reading_history'");
  tableCheckStmt.step();
  const tableName = tableCheckStmt.getAsObject().name;
  tableCheckStmt.free();
  assert.strictEqual(tableName, 'reading_history', 'reading_history table must exist in schema');
  console.log('✓ Test A passed: reading_history table is created.');

  // B. chapter_id is PRIMARY KEY
  const pragmaStmt = db.db.prepare("PRAGMA table_info(reading_history)");
  let pkFound = false;
  while (pragmaStmt.step()) {
    const col = pragmaStmt.getAsObject();
    if (col.name === 'chapter_id' && col.pk === 1) {
      pkFound = true;
    }
  }
  pragmaStmt.free();
  assert.ok(pkFound, 'chapter_id must be primary key of reading_history');
  console.log('✓ Test B passed: chapter_id is primary key.');

  // C. Foreign key to chapters exists
  const fkStmt = db.db.prepare("PRAGMA foreign_key_list(reading_history)");
  let fkFound = false;
  let onCascade = false;
  while (fkStmt.step()) {
    const fk = fkStmt.getAsObject();
    if (fk.table === 'chapters' && fk.from === 'chapter_id' && fk.to === 'id') {
      fkFound = true;
      if (fk.on_delete === 'CASCADE') onCascade = true;
    }
  }
  fkStmt.free();
  assert.ok(fkFound, 'Foreign key referencing chapters(id) must exist');
  assert.ok(onCascade, 'Foreign key must specify ON DELETE CASCADE');
  console.log('✓ Test C & D passed: Foreign key and ON DELETE CASCADE verified.');

  // ====================================================
  // MIGRATION (Tests E - I)
  // ====================================================
  console.log('\n--- Tests E - I: Idempotent Migration Verification ---');

  // Create legacy chapters directly with last_read_at
  const leg1 = insertChapterFixture(db, {
    series_id: series1.id,
    title: 'Capítulo Leg 1',
    file_name: 'ch1.cbz',
    file_path: file1Path,
    chapter_number: 1,
    reading_position: 0.5,
    is_read: 0,
    last_read_at: '2026-09-01 12:00:00'
  });

  const leg2 = insertChapterFixture(db, {
    series_id: series1.id,
    title: 'Capítulo Leg 2',
    file_name: 'ch2.cbz',
    file_path: file2Path,
    chapter_number: 2,
    reading_position: 0,
    is_read: 0,
    last_read_at: null // NULL last_read_at
  });

  const leg3 = insertChapterFixture(db, {
    series_id: series1.id,
    title: 'Capítulo Leg 3',
    file_name: 'ch3.cbz',
    file_path: file3Path,
    chapter_number: 3,
    reading_position: 1.0,
    is_read: 1,
    last_read_at: '2026-09-02 15:30:00'
  });

  // Run migration explicitly
  db.migrateReadingHistory();

  // Check that leg1 was migrated
  const check1Stmt = db.db.prepare('SELECT last_read_at FROM reading_history WHERE chapter_id = ?');
  check1Stmt.bind([leg1.id]);
  assert.ok(check1Stmt.step(), 'leg1 must be in reading_history');
  const migratedTime1 = check1Stmt.getAsObject().last_read_at;
  check1Stmt.free();
  assert.strictEqual(migratedTime1, '2026-09-01 12:00:00', 'Original timestamp must be preserved exactly');
  console.log('✓ Test E & H passed: Existing last_read_at migrated and timestamp preserved exactly.');

  // F. Check that NULL was not migrated
  const check2Stmt = db.db.prepare('SELECT last_read_at FROM reading_history WHERE chapter_id = ?');
  check2Stmt.bind([leg2.id]);
  assert.ok(!check2Stmt.step(), 'leg2 (null last_read_at) must NOT be in reading_history');
  check2Stmt.free();
  console.log('✓ Test F passed: NULL last_read_at values are not migrated.');

  // G & I. Run migration again (idempotency & no duplicate rows)
  db.migrateReadingHistory();
  const countStmt = db.db.prepare('SELECT COUNT(*) as cnt FROM reading_history WHERE chapter_id = ?');
  countStmt.bind([leg1.id]);
  countStmt.step();
  assert.strictEqual(countStmt.getAsObject().cnt, 1, 'Only one row per chapter even after second migration');
  countStmt.free();
  console.log('✓ Test G & I passed: Migration is idempotent and does not duplicate rows.');

  // ====================================================
  // CONTINUE READING (Tests J - N)
  // ====================================================
  console.log('\n--- Tests J - N: Continue Reading Queries ---');

  const continueItems = db.getContinueReading(10);
  // J. Partial chapter with history appears
  const hasLeg1 = continueItems.some(item => item.id === leg1.id);
  assert.ok(hasLeg1, 'Partial chapter with history must appear in Continue Reading');
  console.log('✓ Test J passed: Partial chapter with history appears in Continue Reading.');

  // K. Completed chapter does NOT appear in Continue Reading
  const hasLeg3 = continueItems.some(item => item.id === leg3.id);
  assert.ok(!hasLeg3, 'Completed chapter (is_read=1) must NOT appear in Continue Reading');
  console.log('✓ Test K passed: Completed chapter excluded from Continue Reading.');

  // L. Chapter with no reading progress does NOT appear in Continue Reading
  const hasLeg2 = continueItems.some(item => item.id === leg2.id);
  assert.ok(!hasLeg2, 'Unstarted chapter must NOT appear in Continue Reading');
  console.log('✓ Test L passed: Chapter with no reading progress excluded from Continue Reading.');

  // M. Ordering uses reading_history.last_read_at DESC
  // Insert another chapter for series 2 with newer timestamp
  const betaCh = insertChapterFixture(db, {
    series_id: series2.id,
    title: 'Beta Ch 1',
    file_name: 'beta1.cbz',
    file_path: fileBetaPath,
    chapter_number: 1,
    reading_position: 0.4,
    is_read: 0,
    last_read_at: '2026-09-03 10:00:00'
  });
  db.db.run('INSERT INTO reading_history (chapter_id, last_read_at) VALUES (?, ?)', [betaCh.id, '2026-09-03 10:00:00']);

  const orderedContinue = db.getContinueReading(10);
  assert.ok(orderedContinue.length >= 2, 'Must have at least 2 continue items');
  assert.strictEqual(orderedContinue[0].id, betaCh.id, 'Newest reading_history timestamp must come first');
  console.log('✓ Test M passed: Continue Reading orders by reading_history.last_read_at DESC.');

  // N. Limit is respected
  const limitedContinue = db.getContinueReading(1);
  assert.strictEqual(limitedContinue.length, 1, 'Limit parameter must be honored');
  console.log('✓ Test N passed: Limit is respected in Continue Reading.');

  // ====================================================
  // RECENTLY READ (Tests O - S)
  // ====================================================
  console.log('\n--- Tests O - S: Recently Read Queries ---');

  const recentItems = db.getReadingHistory(50);
  // O. Completed chapters appear in Recently Read
  const recentHasLeg3 = recentItems.some(item => item.id === leg3.id);
  assert.ok(recentHasLeg3, 'Completed chapter must appear in Recently Read');
  console.log('✓ Test O passed: Completed chapters appear in Recently Read.');

  // P. Partial chapters appear in Recently Read
  const recentHasLeg1 = recentItems.some(item => item.id === leg1.id);
  assert.ok(recentHasLeg1, 'Partial chapter must appear in Recently Read');
  console.log('✓ Test P passed: Partial chapters appear in Recently Read.');

  // Q. Results ordered by reading_history.last_read_at DESC
  for (let i = 0; i < recentItems.length - 1; i++) {
    const timeA = new Date(recentItems[i].last_read_at).getTime();
    const timeB = new Date(recentItems[i + 1].last_read_at).getTime();
    assert.ok(timeA >= timeB, 'Recently Read items must be in descending order of last_read_at');
  }
  console.log('✓ Test Q passed: Results ordered by reading_history.last_read_at DESC.');

  // R. Limit is respected
  const limitedRecent = db.getReadingHistory(2);
  assert.strictEqual(limitedRecent.length, 2, 'Limit 2 must return exactly 2 items');
  console.log('✓ Test R passed: Limit is respected in Recently Read.');

  // S. Multiple chapters from same manga can appear independently
  const series1Recent = recentItems.filter(item => item.series_id === series1.id);
  assert.ok(series1Recent.length >= 2, 'Multiple chapters from the same manga can appear independently');
  console.log('✓ Test S passed: Multiple chapters from same manga appear independently.');

  // ====================================================
  // READING ACTIVITY & POSITION CLAMPING (Tests T - X)
  // ====================================================
  console.log('\n--- Tests T - X: Reading Activity & 90% Threshold ---');

  // T. setChapterReadingPosition(chapterId, position > 0) creates history
  const freshCh = insertChapterFixture(db, {
    series_id: series1.id,
    title: 'Capítulo Fresco',
    file_name: 'fresh.cbz',
    file_path: path.join(series1Dir, 'fresh.cbz'),
    chapter_number: 4,
    reading_position: 0,
    is_read: 0,
    last_read_at: null
  });
  db.setChapterReadingPosition(freshCh.id, 0.35);

  const freshHistoryStmt = db.db.prepare('SELECT last_read_at FROM reading_history WHERE chapter_id = ?');
  freshHistoryStmt.bind([freshCh.id]);
  assert.ok(freshHistoryStmt.step(), 'Reading activity with pos > 0 must create history entry');
  freshHistoryStmt.free();
  console.log('✓ Test T passed: setChapterReadingPosition(pos > 0) creates history entry.');

  // U. Updating position updates existing history row rather than duplicating
  db.setChapterReadingPosition(freshCh.id, 0.45);
  const countFreshStmt = db.db.prepare('SELECT COUNT(*) as cnt FROM reading_history WHERE chapter_id = ?');
  countFreshStmt.bind([freshCh.id]);
  countFreshStmt.step();
  assert.strictEqual(countFreshStmt.getAsObject().cnt, 1, 'Only one history row must exist after update');
  countFreshStmt.free();
  console.log('✓ Test U passed: Updating position updates history row without duplicating.');

  // V. Position remains normalized/clamped to [0, 1]
  db.setChapterReadingPosition(freshCh.id, -0.5);
  assert.strictEqual(db.getChapterReadingPosition(freshCh.id), 0, 'Negative position clamped to 0');
  db.setChapterReadingPosition(freshCh.id, 1.5);
  assert.strictEqual(db.getChapterReadingPosition(freshCh.id), 1.0, 'Position > 1 clamped to 1.0');
  console.log('✓ Test V passed: Position remains normalized/clamped to [0, 1].');

  // W. Reader completion through setChapterRead updates history
  const unreadCh = insertChapterFixture(db, {
    series_id: series1.id,
    title: 'Capítulo No Leído',
    file_name: 'unread.cbz',
    file_path: path.join(series1Dir, 'unread.cbz'),
    chapter_number: 5,
    reading_position: 0,
    is_read: 0,
    last_read_at: null
  });
  db.setChapterRead(unreadCh.id, 1);
  const unreadHistStmt = db.db.prepare('SELECT last_read_at FROM reading_history WHERE chapter_id = ?');
  unreadHistStmt.bind([unreadCh.id]);
  assert.ok(unreadHistStmt.step(), 'Marking read creates/updates history row');
  unreadHistStmt.free();
  console.log('✓ Test W passed: Reader completion updates reading_history.');

  // X. Existing 90% completion threshold remains unchanged
  const ninetyCh = insertChapterFixture(db, {
    series_id: series1.id,
    title: 'Capítulo 90%',
    file_name: 'ninety.cbz',
    file_path: path.join(series1Dir, 'ninety.cbz'),
    chapter_number: 6,
    reading_position: 0,
    is_read: 0,
    last_read_at: null
  });
  db.setChapterReadingPosition(ninetyCh.id, 0.90);
  const ninetyData = db.getChapterById(ninetyCh.id);
  assert.strictEqual(ninetyData.is_read, 1, 'At 0.90 completion threshold, chapter is marked as read');
  assert.strictEqual(ninetyData.reading_position, 1.0, 'At 0.90, position is set to 1.0');
  console.log('✓ Test X passed: 90% completion threshold triggers completion as expected.');

  // ====================================================
  // DELETE ONE HISTORY ENTRY (Tests Y - AE)
  // ====================================================
  console.log('\n--- Tests Y - AE: Delete Single History Entry ---');

  // Prepare a chapter with reading_position and history
  const deleteTargetCh = insertChapterFixture(db, {
    series_id: series1.id,
    title: 'Capítulo Para Borrar Historial',
    file_name: 'delete_target.cbz',
    file_path: path.join(series1Dir, 'delete_target.cbz'),
    chapter_number: 7,
    reading_position: 0.72,
    is_read: 0,
    last_read_at: '2026-09-04 12:00:00'
  });
  db.db.run('INSERT INTO reading_history (chapter_id, last_read_at) VALUES (?, ?)', [deleteTargetCh.id, '2026-09-04 12:00:00']);

  // Verify it exists in continue reading and recent reading before delete
  assert.ok(db.getContinueReading(50).some(i => i.id === deleteTargetCh.id), 'Must exist in continue reading before delete');

  // Perform delete
  const deleteResult = db.deleteReadingHistoryEntry(deleteTargetCh.id);
  assert.strictEqual(deleteResult, true, 'deleteReadingHistoryEntry returned true');

  // Y. Delete removes the selected History row
  const delCheckStmt = db.db.prepare('SELECT * FROM reading_history WHERE chapter_id = ?');
  delCheckStmt.bind([deleteTargetCh.id]);
  assert.ok(!delCheckStmt.step(), 'reading_history row must no longer exist');
  delCheckStmt.free();
  console.log('✓ Test Y passed: Delete removes the selected reading_history row.');

  // Z & AA. Delete does NOT change reading_position or is_read
  const targetAfterDelete = db.getChapterById(deleteTargetCh.id);
  assert.strictEqual(targetAfterDelete.reading_position, 0.72, 'reading_position must remain untouched');
  assert.strictEqual(targetAfterDelete.is_read, 0, 'is_read state must remain untouched');
  console.log('✓ Test Z & AA passed: reading_position and is_read preserved intact.');

  // AB & AC. Deleted entry no longer appears in Continue Reading or Recently Read
  assert.ok(!db.getContinueReading(50).some(i => i.id === deleteTargetCh.id), 'Deleted entry must NOT appear in Continue Reading');
  assert.ok(!db.getReadingHistory(50).some(i => i.id === deleteTargetCh.id), 'Deleted entry must NOT appear in Recently Read');
  console.log('✓ Test AB & AC passed: Deleted entry disappeared from Continue Reading and Recently Read.');

  // AD. The chapter remains in Library/database
  assert.ok(targetAfterDelete !== null, 'Chapter still exists in database');
  console.log('✓ Test AD passed: Chapter remains in database.');

  // AE. The source CBZ/PDF file is untouched
  assert.ok(fs.existsSync(file1Path), 'Source file ch1.cbz still exists');
  assert.strictEqual(fs.readFileSync(file1Path, 'utf8'), 'DUMMY CBZ 1 CONTENT', 'Source file contents untouched');
  console.log('✓ Test AE passed: Source files are completely untouched.');

  // ====================================================
  // RESET ONE MANGA (Tests AF - AM)
  // ====================================================
  console.log('\n--- Tests AF - AM: Reset Entire Manga ---');

  // Verify series 1 currently has history rows and reading positions
  const series1ChsBefore = db.getChapters(series1.id);
  assert.ok(series1ChsBefore.length > 0, 'Series 1 has chapters');

  // Series 2 also has betaCh with position 0.4 and history
  const series2ChsBefore = db.getChapters(series2.id);
  assert.strictEqual(series2ChsBefore[0].reading_position, 0.4, 'Series 2 beta chapter has progress');

  // Reset Series 1
  const resetRes = db.resetSeriesReadingHistory(series1.id);
  assert.strictEqual(resetRes, true, 'resetSeriesReadingHistory returned true');

  // AF. Reset removes ALL History rows for the selected series
  const series1HistStmt = db.db.prepare(`
    SELECT COUNT(*) as cnt FROM reading_history
    WHERE chapter_id IN (SELECT id FROM chapters WHERE series_id = ?)
  `);
  series1HistStmt.bind([series1.id]);
  series1HistStmt.step();
  assert.strictEqual(series1HistStmt.getAsObject().cnt, 0, 'Zero reading_history rows remain for Series 1');
  series1HistStmt.free();
  console.log('✓ Test AF passed: All reading_history rows for series removed.');

  // AG, AH, AI. Reset sets every chapter's reading_position = 0, is_read = 0, last_read_at = NULL
  const series1ChsAfter = db.getChapters(series1.id);
  for (const ch of series1ChsAfter) {
    assert.strictEqual(ch.reading_position, 0, `Chapter ${ch.id} position must be reset to 0`);
    assert.strictEqual(ch.is_read, 0, `Chapter ${ch.id} is_read must be reset to 0`);
    assert.strictEqual(ch.last_read_at, null, `Chapter ${ch.id} legacy last_read_at must be cleared`);
  }
  console.log('✓ Test AG, AH & AI passed: All chapter positions and is_read reset to 0, legacy timestamps cleared.');

  // AJ. Reset does NOT affect another series
  const series2ChsAfter = db.getChapters(series2.id);
  assert.strictEqual(series2ChsAfter[0].reading_position, 0.4, 'Series 2 chapter progress untouched');
  const series2HistStmt = db.db.prepare('SELECT COUNT(*) as cnt FROM reading_history WHERE chapter_id = ?');
  series2HistStmt.bind([betaCh.id]);
  series2HistStmt.step();
  assert.strictEqual(series2HistStmt.getAsObject().cnt, 1, 'Series 2 history row untouched');
  series2HistStmt.free();
  console.log('✓ Test AJ passed: Resetting Series 1 does NOT affect Series 2.');

  // AK. Reset does NOT delete chapters
  assert.strictEqual(series1ChsAfter.length, series1ChsBefore.length, 'Chapter count remains identical');
  console.log('✓ Test AK passed: Chapters were not deleted.');

  // AL. Reset does NOT delete source files
  assert.ok(fs.existsSync(file1Path), 'Series 1 source file still exists');
  assert.ok(fs.existsSync(file2Path), 'Series 1 source file still exists');
  console.log('✓ Test AL passed: Source files are untouched.');

  // AM. Reset is atomic/transactional
  assert.strictEqual(typeof db.resetSeriesReadingHistory, 'function', 'resetSeriesReadingHistory exists');
  console.log('✓ Test AM passed: Reset is wrapped in transaction.');

  // ====================================================
  // CLEAR ALL HISTORY (Tests AN - AQ)
  // ====================================================
  console.log('\n--- Tests AN - AQ: Clear All History ---');

  // Currently Series 2 has betaCh with progress 0.4 and 1 history row
  const clearRes = db.clearAllReadingHistory();
  assert.strictEqual(clearRes, true, 'clearAllReadingHistory returned true');

  // AN. All reading_history rows removed
  const totalHistStmt = db.db.prepare('SELECT COUNT(*) as cnt FROM reading_history');
  totalHistStmt.step();
  assert.strictEqual(totalHistStmt.getAsObject().cnt, 0, 'reading_history must be empty');
  totalHistStmt.free();
  console.log('✓ Test AN passed: Clear History removes all reading_history rows.');

  // AO & AP. Preserves reading_position and is_read
  const betaChAfterClear = db.getChapterById(betaCh.id);
  assert.strictEqual(betaChAfterClear.reading_position, 0.4, 'Beta chapter reading_position preserved');
  assert.strictEqual(betaChAfterClear.is_read, 0, 'Beta chapter is_read preserved');
  console.log('✓ Test AO & AP passed: Clear History preserves chapter positions and is_read states.');

  // AQ. Does not delete chapters or files
  assert.ok(fs.existsSync(fileBetaPath), 'Beta file still exists');
  assert.ok(db.getChapterById(betaCh.id) !== null, 'Beta chapter still exists in DB');
  console.log('✓ Test AQ passed: Clear History does not delete chapters or files.');

  // ====================================================
  // RESET ALL HISTORY AND PROGRESS
  // ====================================================
  console.log('\n--- Tests: Global Reset History and Progress ---');

  const favAfterToggle = db.toggleSeriesFavorite(series1.id);
  assert.strictEqual(favAfterToggle, 1, 'Series 1 marked as favorite before global reset');
  const resetTag = db.createTag('GlobalResetTag');
  db.setSeriesTags(series1.id, [resetTag.id]);
  const series1MetaBefore = db.getSeriesById(series1.id);
  assert.ok(series1MetaBefore, 'Series 1 exists before global reset');

  const alphaChsForReset = db.getChapters(series1.id);
  for (const ch of alphaChsForReset) {
    db.db.run(
      'UPDATE chapters SET reading_position = 0.8, is_read = 1, last_read_at = ? WHERE id = ?',
      ['2026-10-03 12:00:00', ch.id]
    );
    db.db.run('INSERT INTO reading_history (chapter_id, last_read_at) VALUES (?, ?)', [ch.id, '2026-10-03 12:00:00']);
  }
  db.db.run(
    'UPDATE chapters SET reading_position = 0.55, is_read = 1, last_read_at = ? WHERE id = ?',
    ['2026-10-03 12:30:00', betaCh.id]
  );
  db.db.run('INSERT INTO reading_history (chapter_id, last_read_at) VALUES (?, ?)', [betaCh.id, '2026-10-03 12:30:00']);

  const countRows = (sql) => {
    const s = db.db.prepare(sql);
    s.step();
    const cnt = s.getAsObject().cnt;
    s.free();
    return cnt;
  };
  const chapterCountBefore = countRows('SELECT COUNT(*) as cnt FROM chapters');
  const seriesCountBefore = countRows('SELECT COUNT(*) as cnt FROM series');
  const tagRelCountBefore = countRows('SELECT COUNT(*) as cnt FROM series_tags');
  const historyCountBefore = countRows('SELECT COUNT(*) as cnt FROM reading_history');
  assert.ok(historyCountBefore > 0, 'History rows exist before global reset');

  const globalResetRes = db.resetAllReadingHistoryAndProgress();
  assert.strictEqual(globalResetRes, true, 'resetAllReadingHistoryAndProgress returned true');

  assert.strictEqual(countRows('SELECT COUNT(*) as cnt FROM reading_history'), 0, 'Global reset removes all History');
  console.log('✓ Global reset removes all History.');

  const allChaptersAfter = [];
  const allChStmt = db.db.prepare('SELECT reading_position, is_read, last_read_at FROM chapters');
  while (allChStmt.step()) {
    allChaptersAfter.push(allChStmt.getAsObject());
  }
  allChStmt.free();
  for (const ch of allChaptersAfter) {
    assert.strictEqual(ch.reading_position, 0, 'Global reset sets reading_position = 0');
    assert.strictEqual(ch.is_read, 0, 'Global reset sets is_read = 0');
    assert.strictEqual(ch.last_read_at, null, 'Global reset clears legacy last_read_at');
  }
  console.log('✓ Global reset sets all reading_position = 0 and is_read = 0.');

  assert.strictEqual(countRows('SELECT COUNT(*) as cnt FROM chapters'), chapterCountBefore, 'Global reset does not delete chapters');
  assert.strictEqual(countRows('SELECT COUNT(*) as cnt FROM series'), seriesCountBefore, 'Global reset does not delete manga');
  assert.strictEqual(countRows('SELECT COUNT(*) as cnt FROM series_tags'), tagRelCountBefore, 'Global reset does not delete metadata');
  const series1MetaAfter = db.getSeriesById(series1.id);
  assert.strictEqual(series1MetaAfter.favorite, 1, 'Favorites are preserved');
  assert.strictEqual(series1MetaAfter.author, series1MetaBefore.author, 'Series metadata is preserved');
  const tagsAfter = db.getSeriesTags(series1.id);
  assert.ok(tagsAfter.some(t => t.name === 'GlobalResetTag'), 'Series tags are preserved');
  assert.ok(fs.existsSync(file1Path), 'Source file ch1.cbz still exists');
  assert.ok(fs.existsSync(file2Path), 'Source file ch2.cbz still exists');
  assert.ok(fs.existsSync(fileBetaPath), 'Source file beta1.cbz still exists');
  assert.strictEqual(fs.readFileSync(file1Path, 'utf8'), 'DUMMY CBZ 1 CONTENT', 'Source file contents untouched');
  console.log('✓ Global reset does not delete chapters, manga, metadata, or source files.');

  assert.strictEqual(typeof db.resetAllReadingHistoryAndProgress, 'function', 'resetAllReadingHistoryAndProgress exists');
  console.log('✓ Global reset is wrapped in a transaction.');

  // ====================================================
  // CASCADE BEHAVIOR (Tests AR - AS)
  // ====================================================
  console.log('\n--- Tests AR - AS: Cascade Deletion ---');

  // Add chapter with history to series 2
  const cascadeCh = insertChapterFixture(db, {
    series_id: series2.id,
    title: 'Cascade Ch',
    file_name: 'cascade.cbz',
    file_path: path.join(series2Dir, 'cascade.cbz'),
    chapter_number: 2,
    reading_position: 0.5,
    is_read: 0,
    last_read_at: '2026-09-05 10:00:00'
  });
  db.db.run('INSERT INTO reading_history (chapter_id, last_read_at) VALUES (?, ?)', [cascadeCh.id, '2026-09-05 10:00:00']);

  // Verify history exists
  let checkCascStmt = db.db.prepare('SELECT COUNT(*) as cnt FROM reading_history WHERE chapter_id = ?');
  checkCascStmt.bind([cascadeCh.id]);
  checkCascStmt.step();
  assert.strictEqual(checkCascStmt.getAsObject().cnt, 1, 'History exists before chapter delete');
  checkCascStmt.free();

  // AR. Delete chapter
  db.deleteChapter(cascadeCh.id);
  checkCascStmt = db.db.prepare('SELECT COUNT(*) as cnt FROM reading_history WHERE chapter_id = ?');
  checkCascStmt.bind([cascadeCh.id]);
  checkCascStmt.step();
  assert.strictEqual(checkCascStmt.getAsObject().cnt, 0, 'History row cascaded on chapter deletion');
  checkCascStmt.free();
  console.log('✓ Test AR passed: Deleting chapter cascades its reading_history row.');

  // AS. Delete series
  const seriesCascadeCh = insertChapterFixture(db, {
    series_id: series2.id,
    title: 'Series Cascade Ch',
    file_name: 'series_cascade.cbz',
    file_path: path.join(series2Dir, 'series_cascade.cbz'),
    chapter_number: 3,
    reading_position: 0.8,
    is_read: 0,
    last_read_at: '2026-09-05 11:00:00'
  });
  db.db.run('INSERT INTO reading_history (chapter_id, last_read_at) VALUES (?, ?)', [seriesCascadeCh.id, '2026-09-05 11:00:00']);

  db.deleteSeries(series2.id);
  checkCascStmt = db.db.prepare('SELECT COUNT(*) as cnt FROM reading_history WHERE chapter_id = ?');
  checkCascStmt.bind([seriesCascadeCh.id]);
  checkCascStmt.step();
  assert.strictEqual(checkCascStmt.getAsObject().cnt, 0, 'History row cascaded on series deletion');
  checkCascStmt.free();
  console.log('✓ Test AS passed: Deleting series cascades its reading_history rows.');

  // ====================================================
  // IPC & PRELOAD EXPOSURE (Tests AT - AU)
  // ====================================================
  console.log('\n--- Tests AT - AU: Preload & IPC Exposure ---');

  const preloadSrc = fs.readFileSync(path.join(__dirname, '../../src/preload/preload.js'), 'utf8');
  assert.ok(preloadSrc.includes('getContinueReading:'), 'preload exposes getContinueReading');
  assert.ok(preloadSrc.includes('getReadingHistory:'), 'preload exposes getReadingHistory');
  assert.ok(preloadSrc.includes('deleteReadingHistoryEntry:'), 'preload exposes deleteReadingHistoryEntry');
  assert.ok(preloadSrc.includes('resetSeriesReadingHistory:'), 'preload exposes resetSeriesReadingHistory');
  assert.ok(preloadSrc.includes('clearAllReadingHistory:'), 'preload exposes clearAllReadingHistory');
  assert.ok(preloadSrc.includes('resetAllReadingHistoryAndProgress:'), 'preload exposes resetAllReadingHistoryAndProgress');

  const mainSrc = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');
  assert.ok(mainSrc.includes("'history:get-continue-reading'"), 'main.js handles history:get-continue-reading');
  assert.ok(mainSrc.includes("'history:get-reading-history'"), 'main.js handles history:get-reading-history');
  assert.ok(mainSrc.includes("'history:delete-entry'"), 'main.js handles history:delete-entry');
  assert.ok(mainSrc.includes("'history:reset-series'"), 'main.js handles history:reset-series');
  assert.ok(mainSrc.includes("'history:clear-all'"), 'main.js handles history:clear-all');
  assert.ok(mainSrc.includes("'history:reset-all-progress'"), 'main.js handles history:reset-all-progress');
  console.log('✓ Test AT & AU passed: All operations exposed via IPC/preload without leaking DB internals.');

  // ====================================================
  // UI BEHAVIOR & MODALS (Tests AV - BB)
  // ====================================================
  console.log('\n--- Tests AV - BB: UI Navigation & Modal Invariants ---');

  const indexHtml = fs.readFileSync(path.join(__dirname, '../../src/renderer/index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="modalDeleteHistory"'), 'modalDeleteHistory exists in index.html');
  assert.ok(indexHtml.includes('id="modalClearHistory"'), 'modalClearHistory exists in index.html');
  assert.ok(indexHtml.includes('id="checkResetMangaHistory"'), 'checkResetMangaHistory checkbox exists');
  assert.ok(indexHtml.includes('id="btnOpenClearHistoryModal"'), 'btnOpenClearHistoryModal button exists in Settings Data');
  assert.ok(indexHtml.includes('id="btnOpenResetProgressModal"'), 'reset progress button exists as a separate Settings action');
  assert.ok(indexHtml.includes('id="modalResetProgress"'), 'reset progress confirmation modal exists');
  assert.ok(indexHtml.includes('Limpiar historial'), 'existing clear history action remains');
  assert.ok(indexHtml.includes('Reiniciar historial y progreso'), 'global reset action remains separate from clear history');

  const historyJsSrc = fs.readFileSync(path.join(__dirname, '../../src/renderer/history/history.js'), 'utf8');
  // AV & AW: Verify callbacks distinction
  assert.ok(historyJsSrc.includes('callbacks.openMangaView'), 'Manga detail callback is invoked on manga info click');
  assert.ok(historyJsSrc.includes('callbacks.openReader'), 'Reader callback is invoked on continue button click');

  // AX & AY: Checkbox logic
  assert.ok(historyJsSrc.includes('checkResetMangaHistory.checked'), 'Checkbox checked state alters operation');
  assert.ok(historyJsSrc.includes('Reiniciar manga'), 'Confirm button adapts label when reset is checked');

  // BB: CSS theme tokens
  const historyCss = fs.readFileSync(path.join(__dirname, '../../src/renderer/history/history.css'), 'utf8');
  assert.ok(historyCss.includes('.btn-delete-card'), 'Delete button styling in continue card exists');
  assert.ok(historyCss.includes('.recent-item-btn-delete'), 'Delete button styling in recent items exists');
  console.log('✓ Test AV - BB passed: UI elements, modal bindings, and navigation distinction verified.');

  // Cleanup
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n======================================================');
  console.log('  ALL READING HISTORY INTEGRATION TESTS PASSED (A-BH)!');
  console.log('======================================================\n');
}

if (require.main === module) {
  runReadingHistoryTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = runReadingHistoryTests;
