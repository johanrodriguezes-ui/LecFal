/**
 * Unit Test Suite for Fallback to Group when Author is Missing
 *
 * Verifies:
 * 1. Default state: fallbackAuthorToGroup is false.
 * 2. When disabled: card always displays original author (even if empty or 'Desconocido').
 * 3. When enabled:
 *    - Series with existing author: keeps author (does not override).
 *    - Series with missing author ('', null, 'Desconocido', 'Unknown') and group: displays group.
 *    - Works with both `group_name` and `group` properties.
 *    - Applies .is-fallback-group class and localized title attribute (Grupo: / Group:).
 *    - Series with missing author and NO group: retains original author / empty text without crash.
 * 4. Reactive getter/setter behavior for setFallbackAuthorToGroup().
 */

const assert = require('assert');

// Setup minimal document mock for Node environment before importing library.js
global.document = {
  documentElement: { lang: 'es' },
  createElement: (tag) => {
    return {
      tagName: tag.toUpperCase(),
      className: '',
      dataset: {},
      _innerHTML: '',
      set innerHTML(val) {
        this._innerHTML = val;
      },
      get innerHTML() {
        return this._innerHTML;
      },
      querySelector: function (sel) {
        if (sel === '.series-card-author') {
          const match = this._innerHTML.match(/<span class="series-card-author([^"]*)" title="([^"]*)">([^<]*)<\/span>/);
          if (match) {
            return {
              className: `series-card-author${match[1]}`,
              title: match[2],
              textContent: match[3]
            };
          }
        }
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: () => {}
    };
  },
  getElementById: () => null
};

global.window = {
  lecfalAPI: {
    getSetting: async (key, def) => def,
    setSetting: async () => true
  }
};

async function runTests() {
  console.log('=== Running Series Card Group Fallback Unit Tests ===\n');

  const {
    createSeriesCard,
    setFallbackAuthorToGroup,
    getFallbackAuthorToGroup
  } = await import('../../src/renderer/library/library.js');

  const { setLanguage } = await import('../../src/renderer/utils/i18n.js');
  await setLanguage('es', false);

  // 1. Initial State
  console.log('Test 1: Default fallback preference is false');
  assert.strictEqual(getFallbackAuthorToGroup(), false, 'Default preference should be false');
  console.log('  ✓ Passed');

  // 2. Disabled behavior
  console.log('Test 2: When disabled, original author is displayed');
  const seriesWithAuthor = {
    id: 1,
    title: 'One Piece',
    author: 'Eiichiro Oda',
    group_name: 'Straw Hat Pirates',
    chapter_count: 1000
  };
  let card = createSeriesCard(seriesWithAuthor);
  let authorEl = card.querySelector('.series-card-author');
  assert.ok(authorEl, 'Author element exists');
  assert.strictEqual(authorEl.textContent, 'Eiichiro Oda');
  assert.strictEqual(authorEl.title, 'Eiichiro Oda');
  assert.strictEqual(authorEl.className.includes('is-fallback-group'), false);

  const seriesDesconocido = {
    id: 2,
    title: 'Touhou Doujinshi',
    author: 'Desconocido',
    group_name: 'Alice Emotion',
    chapter_count: 1
  };
  card = createSeriesCard(seriesDesconocido);
  authorEl = card.querySelector('.series-card-author');
  assert.ok(authorEl);
  assert.strictEqual(authorEl.textContent, 'Desconocido', 'When disabled, should keep "Desconocido"');
  assert.strictEqual(authorEl.className.includes('is-fallback-group'), false);
  console.log('  ✓ Passed');

  // 3. Enabling fallback
  console.log('Test 3: Enable fallbackAuthorToGroup');
  setFallbackAuthorToGroup(true);
  assert.strictEqual(getFallbackAuthorToGroup(), true);

  // 3a. Series with author still shows author
  card = createSeriesCard(seriesWithAuthor);
  authorEl = card.querySelector('.series-card-author');
  assert.strictEqual(authorEl.textContent, 'Eiichiro Oda', 'Should not replace valid author');
  assert.strictEqual(authorEl.className.includes('is-fallback-group'), false);

  // 3b. Series with "Desconocido" and group_name falls back to group
  card = createSeriesCard(seriesDesconocido);
  authorEl = card.querySelector('.series-card-author');
  assert.strictEqual(authorEl.textContent, 'Alice Emotion', 'Should display group name');
  assert.strictEqual(authorEl.title, 'Grupo: Alice Emotion', 'Should have localized tooltip in ES');
  assert.strictEqual(authorEl.className.includes('is-fallback-group'), true);

  // 3c. Series with "Unknown" (English scan) and group property
  const seriesUnknownEn = {
    id: 3,
    title: 'Kantai Collection Doujin',
    author: 'Unknown',
    group: 'C2 Kikan',
    chapter_count: 2
  };
  card = createSeriesCard(seriesUnknownEn);
  authorEl = card.querySelector('.series-card-author');
  assert.strictEqual(authorEl.textContent, 'C2 Kikan', 'Should display group from series.group');
  assert.strictEqual(authorEl.title, 'Grupo: C2 Kikan');
  assert.strictEqual(authorEl.className.includes('is-fallback-group'), true);

  // 3d. Series with empty string author
  const seriesEmptyAuthor = {
    id: 4,
    title: 'Vocaloid Anthology',
    author: '',
    group_name: 'Supercell',
    chapter_count: 5
  };
  card = createSeriesCard(seriesEmptyAuthor);
  authorEl = card.querySelector('.series-card-author');
  assert.strictEqual(authorEl.textContent, 'Supercell');
  assert.strictEqual(authorEl.className.includes('is-fallback-group'), true);

  // 3e. Series with null author
  const seriesNullAuthor = {
    id: 5,
    title: 'Webcomic Single',
    author: null,
    group_name: 'Studio Trigger',
    chapter_count: 1
  };
  card = createSeriesCard(seriesNullAuthor);
  authorEl = card.querySelector('.series-card-author');
  assert.strictEqual(authorEl.textContent, 'Studio Trigger');
  assert.strictEqual(authorEl.className.includes('is-fallback-group'), true);

  // 3f. Series with no author AND no group
  const seriesNoAuthorNoGroup = {
    id: 6,
    title: 'Anonymous Project',
    author: 'Desconocido',
    group_name: '',
    chapter_count: 1
  };
  card = createSeriesCard(seriesNoAuthorNoGroup);
  authorEl = card.querySelector('.series-card-author');
  assert.strictEqual(authorEl.textContent, 'Desconocido', 'When no group available, keeps original author text');
  assert.strictEqual(authorEl.className.includes('is-fallback-group'), false);
  console.log('  ✓ Passed');

  // 4. English Tooltip Verification
  console.log('Test 4: English localization tooltip ("Group: ...")');
  await setLanguage('en', false);
  card = createSeriesCard(seriesDesconocido);
  authorEl = card.querySelector('.series-card-author');
  assert.strictEqual(authorEl.textContent, 'Alice Emotion');
  assert.strictEqual(authorEl.title, 'Group: Alice Emotion', 'Should have localized tooltip in EN');
  console.log('  ✓ Passed');

  // 5. Toggle back to false
  console.log('Test 5: Toggle fallback preference back to false');
  setFallbackAuthorToGroup(false);
  assert.strictEqual(getFallbackAuthorToGroup(), false);
  card = createSeriesCard(seriesDesconocido);
  authorEl = card.querySelector('.series-card-author');
  assert.strictEqual(authorEl.textContent, 'Desconocido');
  assert.strictEqual(authorEl.className.includes('is-fallback-group'), false);
  console.log('  ✓ Passed');

  console.log('\n=== All Fallback to Group Unit Tests Passed Successfully! ===\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
