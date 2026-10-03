/**
 * Test Suite: Advanced Search Boolean Semantics
 *
 * Verifies:
 * A. Multiple authors = AND
 * B. Multiple tags = AND
 * C. Multiple groups = AND
 * D. Multiple series/parodies = AND
 * E. Multiple languages = OR
 * F. Cross-category AND (authors AND tags AND languages)
 * G. Title + categories AND combination
 * H. Single-value scalar compatibility (array vs scalar)
 * I. Empty filter handling (empty array, undefined, missing)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const DatabaseManager = require('../../src/core/db');

async function runSemanticsTests() {
  console.log('======================================================');
  console.log('  ADVANCED SEARCH BOOLEAN SEMANTICS TEST SUITE');
  console.log('======================================================');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_adv_search_'));
  const dbPath = path.join(tempDir, 'test_adv_search.db');
  const db = new DatabaseManager(dbPath);
  await db.init();

  const folder = db.addFolder(path.join(tempDir, 'library'));

  // ----------------------------------------------------
  // TEST A: Multiple authors = AND
  // ----------------------------------------------------
  console.log('\n--- Test A: Multiple authors = AND ---');
  const authorA = db.createAuthor('Author A');
  const authorB = db.createAuthor('Author B');
  const authorC = db.createAuthor('Author C');

  const mangaA1 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Author A Only',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_a1')
  });
  db.setSeriesAuthors(mangaA1, [authorA.id]);

  const mangaA2 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Author B Only',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_a2')
  });
  db.setSeriesAuthors(mangaA2, [authorB.id]);

  const mangaA3 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Author A and B',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_a3')
  });
  db.setSeriesAuthors(mangaA3, [authorA.id, authorB.id]);

  const resA = db.getSeriesList({ authorId: [authorA.id, authorB.id] });
  assert.strictEqual(resA.length, 1, 'Only manga with BOTH author A and B returned');
  assert.strictEqual(resA[0].id, mangaA3);
  console.log('✓ Multiple authors = AND passed');

  // ----------------------------------------------------
  // TEST B: Multiple tags = AND
  // ----------------------------------------------------
  console.log('\n--- Test B: Multiple tags = AND ---');
  const tagX = db.createTag('Tag X');
  const tagY = db.createTag('Tag Y');
  const tagZ = db.createTag('Tag Z');

  const mangaB1 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Tag X Only',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_b1')
  });
  db.setSeriesTags(mangaB1, [tagX.id]);

  const mangaB2 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Tag Y Only',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_b2')
  });
  db.setSeriesTags(mangaB2, [tagY.id]);

  const mangaB3 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Tag X and Y',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_b3')
  });
  db.setSeriesTags(mangaB3, [tagX.id, tagY.id]);

  const resB = db.getSeriesList({ tagId: [tagX.id, tagY.id] });
  assert.strictEqual(resB.length, 1, 'Only manga with BOTH tag X and Y returned');
  assert.strictEqual(resB[0].id, mangaB3);
  console.log('✓ Multiple tags = AND passed');

  // ----------------------------------------------------
  // TEST C: Multiple groups = AND
  // ----------------------------------------------------
  console.log('\n--- Test C: Multiple groups = AND ---');
  const groupA = db.createGroup('Group A');
  const groupB = db.createGroup('Group B');

  const mangaC1 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Group A Only',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_c1')
  });
  db.setSeriesGroups(mangaC1, [groupA.id]);

  const mangaC2 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Group B Only',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_c2')
  });
  db.setSeriesGroups(mangaC2, [groupB.id]);

  const mangaC3 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Group A and B',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_c3')
  });
  db.setSeriesGroups(mangaC3, [groupA.id, groupB.id]);

  const resC = db.getSeriesList({ groupId: [groupA.id, groupB.id] });
  assert.strictEqual(resC.length, 1, 'Only manga with BOTH group A and B returned');
  assert.strictEqual(resC[0].id, mangaC3);
  console.log('✓ Multiple groups = AND passed');

  // ----------------------------------------------------
  // TEST D: Multiple series/parodies = AND
  // ----------------------------------------------------
  console.log('\n--- Test D: Multiple series/parodies = AND ---');
  const parodyA = db.createParody('Series/Parody A');
  const parodyB = db.createParody('Series/Parody B');

  const mangaD1 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Parody A Only',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_d1')
  });
  db.setSeriesParodies(mangaD1, [parodyA.id]);

  const mangaD2 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Parody B Only',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_d2')
  });
  db.setSeriesParodies(mangaD2, [parodyB.id]);

  const mangaD3 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Parody A and B',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_d3')
  });
  db.setSeriesParodies(mangaD3, [parodyA.id, parodyB.id]);

  const resD = db.getSeriesList({ parodyId: [parodyA.id, parodyB.id] });
  assert.strictEqual(resD.length, 1, 'Only manga with BOTH parody A and B returned');
  assert.strictEqual(resD[0].id, mangaD3);
  console.log('✓ Multiple series/parodies = AND passed');

  // ----------------------------------------------------
  // TEST E: Multiple languages = OR
  // ----------------------------------------------------
  console.log('\n--- Test E: Multiple languages = OR ---');
  const langSpanish = db.createLanguage('Spanish');
  const langEnglish = db.createLanguage('English');
  const langFrench = db.createLanguage('French');

  const mangaE1 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Spanish',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_e1')
  });
  db.setSeriesLanguages(mangaE1, [langSpanish.id]);

  const mangaE2 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga English',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_e2')
  });
  db.setSeriesLanguages(mangaE2, [langEnglish.id]);

  const mangaE3 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga French',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_e3')
  });
  db.setSeriesLanguages(mangaE3, [langFrench.id]);

  const resE = db.getSeriesList({ languageId: [langSpanish.id, langEnglish.id] });
  const idsE = resE.map(s => s.id);
  assert(idsE.includes(mangaE1), 'Contains Spanish manga');
  assert(idsE.includes(mangaE2), 'Contains English manga');
  assert(!idsE.includes(mangaE3), 'Does NOT contain French manga');
  assert.strictEqual(idsE.filter(id => [mangaE1, mangaE2, mangaE3].includes(id)).length, 2);
  console.log('✓ Multiple languages = OR passed');

  // ----------------------------------------------------
  // TEST F: Cross-category AND
  // ----------------------------------------------------
  console.log('\n--- Test F: Cross-category AND ---');
  // Expected: series satisfying A AND B AND X AND Y AND (Spanish OR English)

  // Qualifies: Author A+B, Tag X+Y, Spanish
  const mangaF_PassSpanish = db.upsertSeries({
    folder_id: folder.id,
    title: 'Full Match Spanish',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_f1')
  });
  db.setSeriesAuthors(mangaF_PassSpanish, [authorA.id, authorB.id]);
  db.setSeriesTags(mangaF_PassSpanish, [tagX.id, tagY.id]);
  db.setSeriesLanguages(mangaF_PassSpanish, [langSpanish.id]);

  // Qualifies: Author A+B, Tag X+Y, English
  const mangaF_PassEnglish = db.upsertSeries({
    folder_id: folder.id,
    title: 'Full Match English',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_f2')
  });
  db.setSeriesAuthors(mangaF_PassEnglish, [authorA.id, authorB.id]);
  db.setSeriesTags(mangaF_PassEnglish, [tagX.id, tagY.id]);
  db.setSeriesLanguages(mangaF_PassEnglish, [langEnglish.id]);

  // Fails author: has only Author A
  const mangaF_FailAuthor = db.upsertSeries({
    folder_id: folder.id,
    title: 'Fail Only Author A',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_f3')
  });
  db.setSeriesAuthors(mangaF_FailAuthor, [authorA.id]);
  db.setSeriesTags(mangaF_FailAuthor, [tagX.id, tagY.id]);
  db.setSeriesLanguages(mangaF_FailAuthor, [langSpanish.id]);

  // Fails tag: has only Tag X
  const mangaF_FailTag = db.upsertSeries({
    folder_id: folder.id,
    title: 'Fail Only Tag X',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_f4')
  });
  db.setSeriesAuthors(mangaF_FailTag, [authorA.id, authorB.id]);
  db.setSeriesTags(mangaF_FailTag, [tagX.id]);
  db.setSeriesLanguages(mangaF_FailTag, [langSpanish.id]);

  // Fails language: has French
  const mangaF_FailLang = db.upsertSeries({
    folder_id: folder.id,
    title: 'Fail French Lang',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_f5')
  });
  db.setSeriesAuthors(mangaF_FailLang, [authorA.id, authorB.id]);
  db.setSeriesTags(mangaF_FailLang, [tagX.id, tagY.id]);
  db.setSeriesLanguages(mangaF_FailLang, [langFrench.id]);

  const resF = db.getSeriesList({
    authorId: [authorA.id, authorB.id],
    tagId: [tagX.id, tagY.id],
    languageId: [langSpanish.id, langEnglish.id]
  });

  const idsF = resF.map(s => s.id);
  assert(idsF.includes(mangaF_PassSpanish), 'Includes Spanish full match');
  assert(idsF.includes(mangaF_PassEnglish), 'Includes English full match');
  assert(!idsF.includes(mangaF_FailAuthor), 'Excludes Author partial match');
  assert(!idsF.includes(mangaF_FailTag), 'Excludes Tag partial match');
  assert(!idsF.includes(mangaF_FailLang), 'Excludes French language mismatch');
  assert.strictEqual(idsF.length, 2, 'Exactly 2 matching series returned');
  console.log('✓ Cross-category AND passed');

  // ----------------------------------------------------
  // TEST G: Title + categories
  // ----------------------------------------------------
  console.log('\n--- Test G: Title + categories ---');
  // Using title 'Full Match Spanish' with the same filters
  const resG1 = db.getSeriesList({
    advTitle: 'Spanish',
    authorId: [authorA.id, authorB.id],
    tagId: [tagX.id, tagY.id],
    languageId: [langSpanish.id, langEnglish.id]
  });
  assert.strictEqual(resG1.length, 1, 'Only Spanish match returned when title includes "Spanish"');
  assert.strictEqual(resG1[0].id, mangaF_PassSpanish);

  const resG2 = db.getSeriesList({
    advTitle: 'NonexistentTitle',
    authorId: [authorA.id, authorB.id],
    tagId: [tagX.id, tagY.id],
    languageId: [langSpanish.id, langEnglish.id]
  });
  assert.strictEqual(resG2.length, 0, 'Zero results when title does not match');
  console.log('✓ Title + categories passed');

  // ----------------------------------------------------
  // TEST H: Single-value compatibility
  // ----------------------------------------------------
  console.log('\n--- Test H: Single-value compatibility ---');
  // authorId: [authorA.id] vs authorId: authorA.id
  const resArrayAuthor = db.getSeriesList({ authorId: [authorA.id] });
  const resScalarAuthor = db.getSeriesList({ authorId: authorA.id });
  assert.strictEqual(resArrayAuthor.length, resScalarAuthor.length, 'Author array and scalar length match');
  assert.deepStrictEqual(
    resArrayAuthor.map(s => s.id).sort(),
    resScalarAuthor.map(s => s.id).sort(),
    'Author array [A] returns identical results to scalar A'
  );

  // tagId: [tagX.id] vs tagId: tagX.id
  const resArrayTag = db.getSeriesList({ tagId: [tagX.id] });
  const resScalarTag = db.getSeriesList({ tagId: tagX.id });
  assert.strictEqual(resArrayTag.length, resScalarTag.length, 'Tag array and scalar length match');
  assert.deepStrictEqual(
    resArrayTag.map(s => s.id).sort(),
    resScalarTag.map(s => s.id).sort(),
    'Tag array [X] returns identical results to scalar X'
  );

  // groupId: [groupA.id] vs groupId: groupA.id
  const resArrayGroup = db.getSeriesList({ groupId: [groupA.id] });
  const resScalarGroup = db.getSeriesList({ groupId: groupA.id });
  assert.strictEqual(resArrayGroup.length, resScalarGroup.length, 'Group array and scalar length match');
  assert.deepStrictEqual(
    resArrayGroup.map(s => s.id).sort(),
    resScalarGroup.map(s => s.id).sort(),
    'Group array [A] returns identical results to scalar A'
  );

  // parodyId: [parodyA.id] vs parodyId: parodyA.id
  const resArrayParody = db.getSeriesList({ parodyId: [parodyA.id] });
  const resScalarParody = db.getSeriesList({ parodyId: parodyA.id });
  assert.strictEqual(resArrayParody.length, resScalarParody.length, 'Parody array and scalar length match');
  assert.deepStrictEqual(
    resArrayParody.map(s => s.id).sort(),
    resScalarParody.map(s => s.id).sort(),
    'Parody array [A] returns identical results to scalar A'
  );

  // languageId: [langSpanish.id] vs languageId: langSpanish.id
  const resArrayLang = db.getSeriesList({ languageId: [langSpanish.id] });
  const resScalarLang = db.getSeriesList({ languageId: langSpanish.id });
  assert.strictEqual(resArrayLang.length, resScalarLang.length, 'Language array and scalar length match');
  assert.deepStrictEqual(
    resArrayLang.map(s => s.id).sort(),
    resScalarLang.map(s => s.id).sort(),
    'Language array [Spanish] returns identical results to scalar Spanish'
  );
  console.log('✓ Single-value compatibility passed');

  // ----------------------------------------------------
  // TEST I: Empty filters
  // ----------------------------------------------------
  console.log('\n--- Test I: Empty filters ---');
  const allSeries = db.getSeriesList({});
  const totalCount = allSeries.length;

  const resEmptyArrays = db.getSeriesList({
    authorId: [],
    groupId: [],
    parodyId: [],
    tagId: [],
    languageId: []
  });
  assert.strictEqual(resEmptyArrays.length, totalCount, 'Empty arrays do not restrict results');

  const resUndefinedFilters = db.getSeriesList({
    authorId: undefined,
    groupId: undefined,
    parodyId: undefined,
    tagId: undefined,
    languageId: undefined,
    advTitle: undefined
  });
  assert.strictEqual(resUndefinedFilters.length, totalCount, 'Undefined filters do not restrict results');

  const resMixedEmpty = db.getSeriesList({
    authorId: [authorA.id],
    groupId: [],
    parodyId: undefined
  });
  assert.deepStrictEqual(
    resMixedEmpty.map(s => s.id).sort(),
    resScalarAuthor.map(s => s.id).sort(),
    'Empty arrays and undefined alongside valid filters do not alter valid filter results'
  );
  console.log('✓ Empty filters passed');

  // Clean up
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n======================================================');
  console.log('  ALL ADVANCED SEARCH SEMANTICS TESTS PASSED!');
  console.log('======================================================\n');
}

runSemanticsTests().catch(err => {
  console.error('\n❌ ADVANCED SEARCH SEMANTICS TEST FAILED:', err);
  process.exit(1);
});
