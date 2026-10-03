/**
 * Phase 7.1 — Catalog Autocomplete Unit & Integration Tests
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const DatabaseManager = require('../../src/db');

// Test 1: Normalization & Search Matching
console.log('=== TEST 1: Text Normalization & Matching ===');
// Import normalizeSearchText
const { normalizeSearchText } = require('../../src/renderer/catalog-autocomplete.js');

assert.strictEqual(normalizeSearchText('José'), 'jose', 'Removes acute accent');
assert.strictEqual(normalizeSearchText('  MÜNCHEN  '), 'munchen', 'Handles umlaut, uppercase, and trimming');
assert.strictEqual(normalizeSearchText('Niño'), 'nino', 'Removes tilde');
assert.strictEqual(normalizeSearchText(''), '', 'Handles empty string');
assert.strictEqual(normalizeSearchText(null), '', 'Handles null');
assert.strictEqual(normalizeSearchText(undefined), '', 'Handles undefined');

// Substring matching test
const mockCatalog = [
  { id: 1, name: 'Murata' },
  { id: 2, name: 'Murasaki' },
  { id: 3, name: 'Yamashita Murakami' },
  { id: 4, name: 'Haruka' },
  { id: 5, name: 'Harumi' },
  { id: 6, name: 'José Saramago' },
  { id: 7, name: 'Kubo Tite' },
  { id: 8, name: 'Kishimoto Masashi' },
  { id: 9, name: 'Oda Eiichiro' },
  { id: 10, name: 'Miura Kentaro' }
];

function filterTestCatalog(catalog, query, selectedIds = [], max = 8) {
  const normQuery = normalizeSearchText(query);
  const selectedSet = new Set(selectedIds);
  const matches = [];
  for (const item of catalog) {
    if (selectedSet.has(item.id)) continue;
    if (!normQuery || normalizeSearchText(item.name).includes(normQuery)) {
      matches.push(item);
    }
    if (matches.length >= max) break;
  }
  return matches;
}

// Case-insensitive substring matching
const muraMatches = filterTestCatalog(mockCatalog, 'mura');
assert.strictEqual(muraMatches.length, 3, 'Should find 3 matches for "mura"');
assert.deepStrictEqual(muraMatches.map(m => m.name), ['Murata', 'Murasaki', 'Yamashita Murakami']);

// Middle substring matching
const shitaMatches = filterTestCatalog(mockCatalog, 'shita');
assert.strictEqual(shitaMatches.length, 1, 'Should find substring in middle');
assert.strictEqual(shitaMatches[0].name, 'Yamashita Murakami');

// Accent-insensitive matching
const joseMatches = filterTestCatalog(mockCatalog, 'jose');
assert.strictEqual(joseMatches.length, 1, '"jose" matches "José Saramago"');
assert.strictEqual(joseMatches[0].name, 'José Saramago');

const accentedQueryMatches = filterTestCatalog(mockCatalog, 'JOSÉ');
assert.strictEqual(accentedQueryMatches.length, 1, '"JOSÉ" matches "José Saramago"');

console.log('✓ Normalization & substring matching tests passed');


// Test 2: Large Catalog Suggestion Limiting
console.log('\n=== TEST 2: Large Catalog Suggestion Limiting (Max 8) ===');
const largeCatalog = [];
for (let i = 1; i <= 1500; i++) {
  largeCatalog.push({ id: i, name: `Author ${i}` });
}

const emptyQueryMatches = filterTestCatalog(largeCatalog, '', [], 8);
assert.strictEqual(emptyQueryMatches.length, 8, 'Empty query limits to maxSuggestions (8)');

const broadQueryMatches = filterTestCatalog(largeCatalog, 'Author 1', [], 8);
assert.strictEqual(broadQueryMatches.length, 8, 'Broad query with hundreds of matches limits to maxSuggestions (8)');
assert(broadQueryMatches.every(m => normalizeSearchText(m.name).includes('author 1')));

// Excludes already selected items
const filteredWithSelections = filterTestCatalog(largeCatalog, 'Author', [1, 2, 3], 8);
assert(!filteredWithSelections.some(m => [1, 2, 3].includes(m.id)), 'Excludes already selected items');
assert.strictEqual(filteredWithSelections.length, 8);

console.log('✓ Suggestion count limiting passed (1,500 catalog items limited to 8 nodes)');


// Test 3: Catalog Updates / Settings Integration
console.log('\n=== TEST 3: Catalog Updates / Renaming Integration ===');
let selectedItems = [
  { id: 1, name: 'Old Author 1' },
  { id: 2, name: 'Author 2' }
];

// Catalog updated after rename in Settings
const updatedCatalog = [
  { id: 1, name: 'Renamed Author 1' },
  // Author 2 was deleted in Settings
  { id: 3, name: 'Author 3' }
];

const catalogMap = new Map(updatedCatalog.map(i => [i.id, i.name]));
selectedItems = selectedItems
  .filter(item => catalogMap.has(item.id))
  .map(item => ({ id: item.id, name: catalogMap.get(item.id) }));

assert.strictEqual(selectedItems.length, 1, 'Deleted item is pruned');
assert.strictEqual(selectedItems[0].name, 'Renamed Author 1', 'Renamed item reflects new name');
console.log('✓ Catalog updates and rename synchronization passed');


// Test 4: Database Multi-Selection & Backward Compatibility
console.log('\n=== TEST 4: Database Multi-Selection & Backward Compatibility ===');
async function testDatabase() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_p71_'));
  const dbPath = path.join(tempDir, 'test_autocomplete.db');
  const db = new DatabaseManager(dbPath);
  await db.init();

  // Create authors
  const a1 = db.createAuthor('Author A');
  const a2 = db.createAuthor('Author B');
  const a3 = db.createAuthor('Author C');

  // Create groups
  const g1 = db.createGroup('Group X');
  const g2 = db.createGroup('Group Y');

  // Create parodies
  const p1 = db.createParody('Series 1');
  const p2 = db.createParody('Series 2');

  // Create tags
  const t1 = db.createTag('Action');
  const t2 = db.createTag('Comedy');
  const t3 = db.createTag('Drama');

  // Create folders and series
  const folder = db.addFolder(path.join(tempDir, 'manga'));
  const s1 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga One',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga', 'one')
  });
  db.setSeriesAuthors(s1, [a1.id]);
  db.setSeriesGroups(s1, [g1.id]);
  db.setSeriesParodies(s1, [p1.id]);
  db.setSeriesTags(s1, [t1.id, t2.id]);

  const s2 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Two',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga', 'two')
  });
  db.setSeriesAuthors(s2, [a2.id]);
  db.setSeriesGroups(s2, [g1.id]);
  db.setSeriesParodies(s2, [p2.id]);
  db.setSeriesTags(s2, [t2.id]);

  const s3 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Three',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga', 'three')
  });
  db.setSeriesAuthors(s3, [a1.id]);
  db.setSeriesGroups(s3, [g2.id]);
  db.setSeriesParodies(s3, [p2.id]);
  db.setSeriesTags(s3, [t1.id, t3.id]);

  const s4 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Four',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga', 'four')
  });
  db.setSeriesAuthors(s4, [a3.id]);
  db.setSeriesGroups(s4, [g2.id]);
  db.setSeriesParodies(s4, [p1.id]);
  db.setSeriesTags(s4, [t3.id]);

  const s5 = db.upsertSeries({
    folder_id: folder.id,
    title: 'Manga Five',
    primary_format: 'cbz',
    path: path.join(tempDir, 'manga', 'five')
  });
  db.setSeriesAuthors(s5, [a1.id, a2.id]);
  db.setSeriesGroups(s5, [g1.id]);
  db.setSeriesParodies(s5, [p1.id, p2.id]);
  db.setSeriesTags(s5, [t1.id, t3.id]);

  // Case A: Backward compatibility - scalar authorId
  const resScalar = db.getSeriesList({ authorId: a1.id });
  assert.strictEqual(resScalar.length, 3, 'Scalar authorId returns s1, s3, and s5');
  assert.deepStrictEqual(resScalar.map(s => s.id).sort(), [s1, s3, s5].sort());

  // Case B: Multi-selection - array authorId [a1.id, a2.id] (AND semantics within filter)
  const resMultiAuthor = db.getSeriesList({ authorId: [a1.id, a2.id] });
  assert.strictEqual(resMultiAuthor.length, 1, 'Multi-select authorId (AND) returns only s5');
  assert.deepStrictEqual(resMultiAuthor.map(s => s.id).sort(), [s5].sort());

  // Case C: Multi-category combination (AND semantics between filters)
  // author in [a1, a2] (both) AND group in [g1] -> s5 (authors a1+a2, group g1)
  const resMultiCategory = db.getSeriesList({ authorId: [a1.id, a2.id], groupId: [g1.id] });
  assert.strictEqual(resMultiCategory.length, 1, 'Author [a1, a2] (AND) and Group [g1] returns s5');
  assert.deepStrictEqual(resMultiCategory.map(s => s.id).sort(), [s5].sort());

  // Case D: Tag multi-selection (AND semantics within tag filter)
  // tags [t1 (Action), t3 (Drama)] -> series with both: s3 (t1, t3) and s5 (t1, t3)
  const resMultiTag = db.getSeriesList({ tagId: [t1.id, t3.id] });
  assert.strictEqual(resMultiTag.length, 2, 'Tags [t1, t3] (AND) returns s3 and s5');
  assert.deepStrictEqual(resMultiTag.map(s => s.id).sort(), [s3, s5].sort());

  // Case E: Single tag scalar compatibility
  const resScalarTag = db.getSeriesList({ tagId: t2.id });
  assert.strictEqual(resScalarTag.length, 2, 'Scalar tag t2 returns s1 and s2');

  // Case F: Empty array should not filter out results
  const resEmptyArray = db.getSeriesList({ authorId: [] });
  assert.strictEqual(resEmptyArray.length, 5, 'Empty array authorId returns all series');

  // Clean up
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('✓ Database multi-selection & backward compatibility tests passed');
}

// Test 5: CatalogAutocomplete Component Lifecycle & Interaction
console.log('\n=== TEST 5: CatalogAutocomplete Component Lifecycle & Keyboard Navigation ===');

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      contains: (c) => this.classList._classes.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classList._classes.has(c)) this.classList._classes.delete(c);
          else this.classList._classes.add(c);
        } else if (force) {
          this.classList._classes.add(c);
        } else {
          this.classList._classes.delete(c);
        }
      }
    };
    this.children = [];
    this.style = {};
    this.dataset = {};
    this._listeners = {};
    this._attributes = {};
    this.value = '';
    this.placeholder = '';
  }

  setAttribute(k, v) { this._attributes[k] = String(v); }
  getAttribute(k) { return this._attributes[k]; }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) this.children.splice(idx, 1);
  }
  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  removeEventListener(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }
  dispatchEvent(evt) {
    const handlers = this._listeners[evt.type] || [];
    for (const h of handlers) h(evt);
  }
  focus() { this.isFocused = true; }
  blur() { this.isFocused = false; }
  contains(node) {
    if (node === this) return true;
    for (const child of this.children) {
      if (child.contains && child.contains(node)) return true;
    }
    return false;
  }
  querySelector(sel) {
    for (const child of this.children) {
      if (sel.startsWith('.') && child.classList.contains(sel.slice(1))) return child;
      if (sel.startsWith('#') && child.id === sel.slice(1)) return child;
      if (child.tagName.toLowerCase() === sel.toLowerCase()) return child;
      const found = child.querySelector ? child.querySelector(sel) : null;
      if (found) return found;
    }
    return null;
  }
  querySelectorAll(sel) {
    const results = [];
    for (const child of this.children) {
      if (sel.startsWith('.') && child.classList.contains(sel.slice(1))) results.push(child);
      if (child.querySelectorAll) results.push(...child.querySelectorAll(sel));
    }
    return results;
  }
  closest(sel) {
    let cur = this;
    while (cur) {
      if (sel.startsWith('.') && cur.classList.contains(sel.slice(1))) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  scrollIntoView() {}
  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    if (html.includes('autocomplete-box')) {
      const box = new MockElement('div');
      box.classList.add('autocomplete-box');
      const chips = new MockElement('div');
      chips.classList.add('autocomplete-chips');
      const inputWrap = new MockElement('div');
      inputWrap.classList.add('autocomplete-input-wrap');
      const input = new MockElement('input');
      input.classList.add('autocomplete-input');
      inputWrap.appendChild(input);
      box.appendChild(chips);
      box.appendChild(inputWrap);

      const dropdown = new MockElement('div');
      dropdown.classList.add('autocomplete-dropdown');
      const list = new MockElement('ul');
      list.classList.add('autocomplete-list');
      const empty = new MockElement('div');
      empty.classList.add('autocomplete-empty');
      dropdown.appendChild(list);
      dropdown.appendChild(empty);

      this.appendChild(box);
      this.appendChild(dropdown);
    }
  }
  get innerHTML() { return this._innerHTML || ''; }
}

global.document = {
  createElement: (tag) => new MockElement(tag),
  addEventListener: () => {},
  removeEventListener: () => {}
};

const { CatalogAutocomplete } = require('../../src/renderer/catalog-autocomplete.js');

const container = new MockElement('div');
let selectionChanged = false;
let formApplied = false;

const ac = new CatalogAutocomplete({
  container,
  catalogType: 'author',
  placeholder: 'Buscar autor...',
  noResultsText: 'No matching authors',
  maxSuggestions: 8,
  onSelectionChange: () => { selectionChanged = true; },
  onApply: () => { formApplied = true; }
});

// Load mock catalog
ac.setCatalog(mockCatalog);

// 1. Input query
ac.inputEl.value = 'mura';
ac.inputEl.dispatchEvent({ type: 'input' });
assert.strictEqual(ac.matchingSuggestions.length, 3, 'Suggestions count is 3 for "mura"');
assert.strictEqual(ac.isOpen, true, 'Dropdown is open after typing');

// 2. ArrowDown / ArrowUp keyboard navigation
ac.handleKeyDown({ key: 'ArrowDown', preventDefault: () => {} });
assert.strictEqual(ac.highlightedIndex, 0, 'First ArrowDown highlights index 0');

ac.handleKeyDown({ key: 'ArrowDown', preventDefault: () => {} });
assert.strictEqual(ac.highlightedIndex, 1, 'Second ArrowDown highlights index 1');

ac.handleKeyDown({ key: 'ArrowUp', preventDefault: () => {} });
assert.strictEqual(ac.highlightedIndex, 0, 'ArrowUp moves back to index 0');

// 3. Enter selects highlighted suggestion
ac.handleKeyDown({ key: 'Enter', preventDefault: () => {} });
assert.deepStrictEqual(ac.getSelectedIds(), [1], 'First suggestion (Murata, id: 1) selected');
assert.strictEqual(ac.isOpen, false, 'Dropdown closed after selection');
assert.strictEqual(selectionChanged, true, 'onSelectionChange fired');

// 4. Multi-selection: add a second chip
selectionChanged = false;
ac.inputEl.value = 'Haruka';
ac.inputEl.dispatchEvent({ type: 'input' });
assert.strictEqual(ac.matchingSuggestions.length, 1, 'Found Haruka');
ac.handleKeyDown({ key: 'ArrowDown', preventDefault: () => {} });
ac.handleKeyDown({ key: 'Enter', preventDefault: () => {} });
assert.deepStrictEqual(ac.getSelectedIds(), [1, 4], 'Multiple IDs accumulated [1, 4]');

// 5. Backspace on empty input removes the last chip
ac.inputEl.value = '';
ac.handleKeyDown({ key: 'Backspace', preventDefault: () => {} });
assert.deepStrictEqual(ac.getSelectedIds(), [1], 'Last chip removed on Backspace');

// 6. Explicit remove by ID
ac.removeItem(1);
assert.deepStrictEqual(ac.getSelectedIds(), [], 'All chips removed');

// 7. Enter with no highlighted item triggers onApply
formApplied = false;
ac.handleKeyDown({ key: 'Enter', preventDefault: () => {} });
assert.strictEqual(formApplied, true, 'Enter with no suggestion highlighted triggers onApply()');

// 8. Escape key closes dropdown and stops event propagation
ac.openDropdown();
assert.strictEqual(ac.isOpen, true);
let stopped = false;
ac.handleKeyDown({
  key: 'Escape',
  preventDefault: () => {},
  stopPropagation: () => { stopped = true; }
});
assert.strictEqual(ac.isOpen, false, 'Dropdown closed on Escape');
assert.strictEqual(stopped, true, 'Escape stops propagation to protect parent dialog');

// 9. Programmatic setSelectedIds & clear
ac.setSelectedIds([7, 9]);
assert.deepStrictEqual(ac.getSelectedIds(), [7, 9], 'Programmatic setSelectedIds sets correct IDs');
ac.clear();
assert.deepStrictEqual(ac.getSelectedIds(), [], 'ac.clear() resets all selections');

console.log('✓ CatalogAutocomplete component lifecycle and keyboard navigation passed');

testDatabase().then(() => {
  console.log('\n======================================================');
  console.log('ALL PHASE 7.1 AUTOCOMPLETE TESTS PASSED PERFECTLY!');
  console.log('======================================================\n');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
