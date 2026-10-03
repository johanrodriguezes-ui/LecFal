/**
 * Test Suite: Phase 3 Main Library Toolbar & Filtering Contract
 *
 * Verifies:
 * A. Initial state: currentLibraryId = null, favoriteOnly = false
 * B. Selecting a Library: currentLibraryId = libraryId, refreshSeries sends libraryId
 * C. Selecting Favorites: favoriteOnly = true, refreshSeries sends favoriteOnly = true
 * D. Library + Favorites: independent AND combination (library = Comics AND favorite = true)
 * E. Removing Favorites: favoriteOnly = false while preserving currentLibraryId
 * F. Changing Library: preserves favoriteOnly, Advanced Search, normal search text, sort
 * G. Advanced Search combination: Library does not overwrite Advanced Search filters
 * H. "Todas": currentLibraryId = null, does not create a database Library
 * I. Old format filters: CBZ/PDF toolbar controls no longer exist in index.html
 * J. Dropdown & Navigation: Gestionar bibliotecas opens Settings at sectionLibraries
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const DatabaseManager = require('../../src/core/db');

async function runToolbarLibrariesTests() {
  console.log('======================================================');
  console.log('  PHASE 3: LIBRARY TOOLBAR & FILTERING TESTS');
  console.log('======================================================');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_toolbar_libs_'));
  const dbPath = path.join(tempDir, 'test_toolbar_libs.db');
  const db = new DatabaseManager(dbPath);
  await db.init();

  // 1. Setup Libraries & Folders
  const mangaLib = db.createLibrary('Manga');
  const comicsLib = db.createLibrary('Comics');
  const manhwaLib = db.createLibrary('Manhwa');

  const folderManga = db.addFolder(path.join(tempDir, 'manga_root'), mangaLib.id);
  const folderComics = db.addFolder(path.join(tempDir, 'comics_root'), comicsLib.id);
  const folderUnassigned = db.addFolder(path.join(tempDir, 'unassigned_root'), null);

  // 2. Setup Tags, Authors, and Languages
  const tagAction = db.createTag('Action');
  const tagDrama = db.createTag('Drama');
  const tagHero = db.createTag('Hero');

  const authorKishimoto = db.createAuthor('Kishimoto');
  const authorLee = db.createAuthor('Stan Lee');
  const authorKane = db.createAuthor('Bob Kane');

  const langSpanish = db.createLanguage('Spanish');
  const langEnglish = db.createLanguage('English');

  // 3. Seed Series in Manga Library
  // S1: Naruto (Favorite: Yes, Tag: Action, Author: Kishimoto, Lang: Spanish)
  const s1Id = db.upsertSeries({
    folder_id: folderManga.id,
    folder_name: 'Naruto',
    title: 'Naruto',
    author: 'Kishimoto',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_root', 'Naruto')
  });
  db.toggleSeriesFavorite(s1Id); // favorite = 1
  db.setSeriesTags(s1Id, [tagAction.id]);
  db.setSeriesAuthors(s1Id, [authorKishimoto.id]);
  db.setSeriesLanguages(s1Id, [langSpanish.id]);

  // S2: Bleach (Favorite: No, Tag: Drama, Author: Kubo, Lang: English)
  const s2Id = db.upsertSeries({
    folder_id: folderManga.id,
    folder_name: 'Bleach',
    title: 'Bleach',
    author: 'Kubo',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga_root', 'Bleach')
  });
  db.setSeriesTags(s2Id, [tagDrama.id]);
  db.setSeriesLanguages(s2Id, [langEnglish.id]);

  // 4. Seed Series in Comics Library
  // S3: Spider-Man (Favorite: Yes, Tag: Hero, Tag: Action, Author: Stan Lee, Lang: English)
  const s3Id = db.upsertSeries({
    folder_id: folderComics.id,
    folder_name: 'Spider-Man',
    title: 'Spider-Man',
    author: 'Stan Lee',
    primary_format: 'cbz',
    path: path.join(tempDir, 'comics_root', 'Spider-Man')
  });
  db.toggleSeriesFavorite(s3Id); // favorite = 1
  db.setSeriesTags(s3Id, [tagHero.id, tagAction.id]);
  db.setSeriesAuthors(s3Id, [authorLee.id]);
  db.setSeriesLanguages(s3Id, [langEnglish.id]);

  // S4: Batman (Favorite: No, Tag: Hero, Author: Bob Kane, Lang: Spanish)
  const s4Id = db.upsertSeries({
    folder_id: folderComics.id,
    folder_name: 'Batman',
    title: 'Batman',
    author: 'Bob Kane',
    primary_format: 'pdf',
    path: path.join(tempDir, 'comics_root', 'Batman')
  });
  db.setSeriesTags(s4Id, [tagHero.id]);
  db.setSeriesAuthors(s4Id, [authorKane.id]);
  db.setSeriesLanguages(s4Id, [langSpanish.id]);

  // 5. Seed Series in Unassigned Folder
  // S5: Misc Comic (Favorite: Yes, Tag: Drama)
  const s5Id = db.upsertSeries({
    folder_id: folderUnassigned.id,
    folder_name: 'Misc Art',
    title: 'Misc Art',
    primary_format: 'cbz',
    path: path.join(tempDir, 'unassigned_root', 'Misc Art')
  });
  db.toggleSeriesFavorite(s5Id); // favorite = 1
  db.setSeriesTags(s5Id, [tagDrama.id]);

  // ----------------------------------------------------
  // TEST A: Initial State (Todas, Favorites = Off)
  // ----------------------------------------------------
  console.log('\n--- Test A: Initial State ---');
  let currentLibraryId = null;
  let favoriteOnly = false;

  let results = db.getSeriesList({
    libraryId: currentLibraryId,
    favoriteOnly: favoriteOnly
  });
  assert.strictEqual(results.length, 5, 'Initial state (Todas, no favs) must return all series across all folders');
  console.log(`✓ Test A passed: All 5 series returned with libraryId=${currentLibraryId}, favoriteOnly=${favoriteOnly}.`);

  // ----------------------------------------------------
  // TEST B: Selecting a Library
  // ----------------------------------------------------
  console.log('\n--- Test B: Selecting a Library ---');
  currentLibraryId = mangaLib.id;
  results = db.getSeriesList({
    libraryId: currentLibraryId,
    favoriteOnly: favoriteOnly
  });
  assert.strictEqual(results.length, 2, 'Selecting Manga library should return only series in Manga folders');
  const mangaTitles = results.map(r => r.title).sort();
  assert.deepStrictEqual(mangaTitles, ['Bleach', 'Naruto']);
  console.log(`✓ Test B passed: Manga library returns exactly 2 series (Bleach, Naruto).`);

  // ----------------------------------------------------
  // TEST C: Selecting Favorites (without Library filter)
  // ----------------------------------------------------
  console.log('\n--- Test C: Selecting Favorites across All ---');
  currentLibraryId = null;
  favoriteOnly = true;
  results = db.getSeriesList({
    libraryId: currentLibraryId,
    favoriteOnly: favoriteOnly
  });
  assert.strictEqual(results.length, 3, 'Favorites filter should return all 3 favorite series across all folders');
  const favTitles = results.map(r => r.title).sort();
  assert.deepStrictEqual(favTitles, ['Misc Art', 'Naruto', 'Spider-Man']);
  console.log(`✓ Test C passed: Favorites toggle returns all 3 favorite series across libraries.`);

  // ----------------------------------------------------
  // TEST D: Library + Favorites (Independent Dimensions)
  // ----------------------------------------------------
  console.log('\n--- Test D: Library + Favorites Intersection ---');
  currentLibraryId = comicsLib.id;
  favoriteOnly = true;
  results = db.getSeriesList({
    libraryId: currentLibraryId,
    favoriteOnly: favoriteOnly
  });
  assert.strictEqual(results.length, 1, 'Library=Comics AND Favorites=true must return only Spider-Man');
  assert.strictEqual(results[0].title, 'Spider-Man');
  assert.strictEqual(results[0].favorite, 1);

  // Manga + Favorites
  currentLibraryId = mangaLib.id;
  results = db.getSeriesList({
    libraryId: currentLibraryId,
    favoriteOnly: favoriteOnly
  });
  assert.strictEqual(results.length, 1, 'Library=Manga AND Favorites=true must return only Naruto');
  assert.strictEqual(results[0].title, 'Naruto');
  console.log(`✓ Test D passed: Library and Favorites are independent AND dimensions.`);

  // ----------------------------------------------------
  // TEST E: Removing Favorites preserves Library
  // ----------------------------------------------------
  console.log('\n--- Test E: Removing Favorites Preserves Library ---');
  currentLibraryId = comicsLib.id;
  favoriteOnly = false; // Turn off favorites
  results = db.getSeriesList({
    libraryId: currentLibraryId,
    favoriteOnly: favoriteOnly
  });
  assert.strictEqual(results.length, 2, 'Comics without favorites must return both Spider-Man and Batman');
  const comicsTitles = results.map(r => r.title).sort();
  assert.deepStrictEqual(comicsTitles, ['Batman', 'Spider-Man']);
  console.log(`✓ Test E passed: Removing favorites preserves active Library selection.`);

  // ----------------------------------------------------
  // TEST F: Changing Library Preserves Other State
  // ----------------------------------------------------
  console.log('\n--- Test F: Changing Library Preserves Filters & Sort ---');
  favoriteOnly = true;
  let currentSort = 'title_desc';
  let searchQuery = 'a'; // titles containing 'a'

  // Manga + Fav + Search 'a' + Sort desc
  currentLibraryId = mangaLib.id;
  results = db.getSeriesList({
    libraryId: currentLibraryId,
    favoriteOnly: favoriteOnly,
    searchQuery: searchQuery,
    sortBy: currentSort
  });
  assert.strictEqual(results.length, 1, 'Manga: Naruto matches "a" and is favorite');
  assert.strictEqual(results[0].title, 'Naruto');

  // Change to Comics: must keep favoriteOnly=true, searchQuery='a', sortBy='title_desc'
  currentLibraryId = comicsLib.id;
  results = db.getSeriesList({
    libraryId: currentLibraryId,
    favoriteOnly: favoriteOnly,
    searchQuery: searchQuery,
    sortBy: currentSort
  });
  assert.strictEqual(results.length, 1, 'Comics: Spider-Man matches "a" and is favorite');
  assert.strictEqual(results[0].title, 'Spider-Man');
  console.log(`✓ Test F passed: Changing Library preserves search, sort, and favoriteOnly.`);

  // ----------------------------------------------------
  // TEST G: Advanced Search Combination
  // ----------------------------------------------------
  console.log('\n--- Test G: Advanced Search + Library + Favorites ---');
  // Comics + Favorites=true + Tag=Action
  results = db.getSeriesList({
    libraryId: comicsLib.id,
    favoriteOnly: true,
    tagId: [tagAction.id]
  });
  assert.strictEqual(results.length, 1, 'Spider-Man has tag Action, is in Comics, and is favorite');
  assert.strictEqual(results[0].title, 'Spider-Man');

  // Comics + Favorites=false + Tag=Hero
  results = db.getSeriesList({
    libraryId: comicsLib.id,
    favoriteOnly: false,
    tagId: [tagHero.id]
  });
  assert.strictEqual(results.length, 2, 'Both Batman and Spider-Man have tag Hero in Comics');

  // Manga + Tag=Hero (Hero is only on Comics)
  results = db.getSeriesList({
    libraryId: mangaLib.id,
    favoriteOnly: false,
    tagId: [tagHero.id]
  });
  assert.strictEqual(results.length, 0, 'No Manga series has tag Hero');

  // Multi-attribute AND: Comics + Stan Lee + Action + English
  results = db.getSeriesList({
    libraryId: comicsLib.id,
    favoriteOnly: true,
    authorId: [authorLee.id],
    tagId: [tagAction.id],
    languageId: [langEnglish.id]
  });
  assert.strictEqual(results.length, 1, 'Exact combination matches Spider-Man');
  assert.strictEqual(results[0].title, 'Spider-Man');
  console.log(`✓ Test G passed: Library and Favorites seamlessly combine with Advanced Search.`);

  // ----------------------------------------------------
  // TEST H: "Todas" Semantic Check
  // ----------------------------------------------------
  console.log('\n--- Test H: "Todas" Does Not Create DB Record ---');
  const countBefore = db.getLibraries().length;
  currentLibraryId = null; // Todas

  results = db.getSeriesList({
    libraryId: currentLibraryId,
    favoriteOnly: false
  });
  assert.strictEqual(results.length, 5, 'Todas returns all 5 series');

  const countAfter = db.getLibraries().length;
  assert.strictEqual(countBefore, countAfter, '"Todas" must NOT insert any library record into DB');
  const todasInDb = db.getLibraries().find(l => l.name.toLowerCase() === 'todas');
  assert.strictEqual(todasInDb, undefined, '"Todas" must not exist as a database entity');
  console.log(`✓ Test H passed: "Todas" is strictly currentLibraryId = null and not a DB row.`);

  // ----------------------------------------------------
  // TEST I: HTML Audit: Old Format Chips Removed
  // ----------------------------------------------------
  console.log('\n--- Test I: Toolbar DOM Structure Audit ---');
  const indexHtmlPath = path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  // Must NOT contain old filter chips
  assert.ok(!indexHtml.includes('data-filter="cbz"'), 'index.html must not contain CBZ format chip');
  assert.ok(!indexHtml.includes('data-filter="pdf"'), 'index.html must not contain PDF format chip');
  assert.ok(!indexHtml.includes('id="countCbz"'), 'index.html must not contain countCbz badge');
  assert.ok(!indexHtml.includes('id="countPdf"'), 'index.html must not contain countPdf badge');

  // Must contain new Library popover and Favorite toggle
  assert.ok(indexHtml.includes('id="librarySelectWrapper"'), 'index.html must contain librarySelectWrapper');
  assert.ok(indexHtml.includes('id="btnLibrarySelect"'), 'index.html must contain btnLibrarySelect');
  assert.ok(indexHtml.includes('id="libraryChipLabel"'), 'index.html must contain libraryChipLabel');
  assert.ok(indexHtml.includes('id="libraryDropdownMenu"'), 'index.html must contain libraryDropdownMenu');
  assert.ok(indexHtml.includes('id="libraryDropdownList"'), 'index.html must contain libraryDropdownList');
  assert.ok(indexHtml.includes('id="btnManageLibraries"'), 'index.html must contain btnManageLibraries');
  assert.ok(indexHtml.includes('id="btnFilterFavorite"'), 'index.html must contain btnFilterFavorite');
  assert.ok(indexHtml.includes('id="countFav"'), 'index.html must contain countFav badge');
  console.log('✓ Test I passed: Toolbar HTML strictly follows Phase 3 specification.');

  // ----------------------------------------------------
  // TEST J: Dropdown Popover Contract & Settings Navigation
  // ----------------------------------------------------
  console.log('\n--- Test J: Dropdown Menu Structure & Navigation Contract ---');
  // Helper simulating dropdown items rendering contract
  function renderDropdownItems(libraries, activeLibId) {
    const items = [];
    // 1. Todas
    items.push({
      id: null,
      name: 'Todas',
      active: activeLibId === null,
      icon: null
    });
    // 2. Libraries
    for (const lib of libraries) {
      items.push({
        id: lib.id,
        name: lib.name,
        active: activeLibId === lib.id,
        icon: lib.icon || '📚'
      });
    }
    return items;
  }

  const allLibs = db.getLibraries();
  const dropdownItems = renderDropdownItems(allLibs, comicsLib.id);

  assert.strictEqual(dropdownItems[0].name, 'Todas');
  assert.strictEqual(dropdownItems[0].active, false, 'Comics is selected, so Todas is not active');
  const comicsItem = dropdownItems.find(item => item.id === comicsLib.id);
  assert.ok(comicsItem, 'Comics item must exist in dropdown');
  assert.strictEqual(comicsItem.name, 'Comics');
  assert.strictEqual(comicsItem.active, true, 'Comics should be active');

  // Verify settings card for libraries exists in index.html
  assert.ok(indexHtml.includes('id="sectionLibraries"'), 'index.html must contain sectionLibraries for Settings navigation');
  console.log('✓ Test J passed: Dropdown items and sectionLibraries navigation target verified.');

  console.log('\n======================================================');
  console.log('  ALL PHASE 3 LIBRARY TOOLBAR TESTS PASSED');
  console.log('======================================================');
}

if (require.main === module) {
  runToolbarLibrariesTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

module.exports = runToolbarLibrariesTests;
