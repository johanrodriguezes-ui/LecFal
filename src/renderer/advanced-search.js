/**
 * Advanced Search Module for LecFal Renderer
 * 
 * Manages the advanced search filter drawer, catalog autocomplete instances
 * (Author, Group, Parody, Tag), language select, filter state tracking,
 * badge indicator, and filter application/reset.
 */

import { CatalogAutocomplete } from './catalog-autocomplete.js';

// ==================== LOCAL STATE ====================
let activeAdvFilters = {
  title: '',
  author: '',
  authorId: '',
  group: '',
  groupId: '',
  parody: '',
  parodyId: '',
  tag: '',
  tagId: '',
  language: '',
  languageId: ''
};

// ==================== DOM ELEMENTS CACHE ====================
const elements = {
  btnToggleAdvSearch: null,
  advSearchPanel: null,
  btnCloseAdvSearch: null,
  advInputTitle: null,
  advSelectAuthor: null,
  advSelectGroup: null,
  advSelectParody: null,
  advSelectTag: null,
  advSelectLanguage: null,
  btnApplyAdvSearch: null,
  btnClearAdvSearch: null,
  advActiveBadge: null,
  btnQuickClearAdv: null
};

// ==================== AUTOCOMPLETE INSTANCES ====================
export const autocompletes = {
  author: null,
  group: null,
  parody: null,
  tag: null,
  language: null
};

// ==================== EXTERNAL CALLBACKS ====================
let callbacks = {
  refreshSeries: () => {}
};

// ==================== DROPDOWN CONFIGURATION ====================
const ADV_DROPDOWNS = {
  language: {
    selectKey: 'advSelectLanguage',
    defaultOption: 'Todos los idiomas',
    fetch: () => window.lecfalAPI.getAllLanguages()
  }
};

/**
 * Helper to populate a standard select dropdown with options.
 * @param {'language'} type
 */
async function populateDropdown(type) {
  const cfg = ADV_DROPDOWNS[type];
  if (!cfg) return;
  const selectEl = elements[cfg.selectKey];
  if (!selectEl) return;

  try {
    const items = await cfg.fetch();
    const currentVal = selectEl.value;
    selectEl.innerHTML = `<option value="">${cfg.defaultOption}</option>`;
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name;
      if (currentVal && String(currentVal) === String(item.id)) {
        opt.selected = true;
      }
      selectEl.appendChild(opt);
    });
  } catch (e) {
    console.warn(`Error populating adv search ${type}:`, e);
  }
}

export async function populateAdvSearchAuthors() {
  try {
    const items = await window.lecfalAPI.getAllAuthors();
    if (autocompletes.author) {
      autocompletes.author.setCatalog(items);
    }
  } catch (e) {
    console.warn('Error populating adv search author:', e);
  }
}

export async function populateAdvSearchGroups() {
  try {
    const items = await window.lecfalAPI.getAllGroups();
    if (autocompletes.group) {
      autocompletes.group.setCatalog(items);
    }
  } catch (e) {
    console.warn('Error populating adv search group:', e);
  }
}

export async function populateAdvSearchParodies() {
  try {
    const items = await window.lecfalAPI.getAllParodies();
    if (autocompletes.parody) {
      autocompletes.parody.setCatalog(items);
    }
  } catch (e) {
    console.warn('Error populating adv search parody:', e);
  }
}

export async function populateAdvSearchTags() {
  try {
    const items = await window.lecfalAPI.getAllTags();
    if (autocompletes.tag) {
      autocompletes.tag.setCatalog(items);
    }
  } catch (e) {
    console.warn('Error populating adv search tag:', e);
  }
}

export async function populateAdvSearchLanguages() {
  try {
    const items = await window.lecfalAPI.getAllLanguages();
    if (autocompletes.language) {
      autocompletes.language.setCatalog(items);
    }
    if (elements.advSelectLanguage) {
      populateDropdown('language');
    }
  } catch (e) {
    console.warn('Error populating adv search language:', e);
  }
}

export async function populateAdvSearchOptions() {
  await Promise.all([
    populateAdvSearchAuthors(),
    populateAdvSearchGroups(),
    populateAdvSearchParodies(),
    populateAdvSearchTags(),
    populateAdvSearchLanguages()
  ]);
}

/**
 * Check if any advanced filter criteria are currently active.
 * @returns {boolean} True if active filters exist
 */
export function hasActiveAdvFilters() {
  const hasAuthor = Array.isArray(activeAdvFilters.authorId) ? activeAdvFilters.authorId.length > 0 : !!activeAdvFilters.authorId;
  const hasGroup = Array.isArray(activeAdvFilters.groupId) ? activeAdvFilters.groupId.length > 0 : !!activeAdvFilters.groupId;
  const hasParody = Array.isArray(activeAdvFilters.parodyId) ? activeAdvFilters.parodyId.length > 0 : !!activeAdvFilters.parodyId;
  const hasTag = Array.isArray(activeAdvFilters.tagId) ? activeAdvFilters.tagId.length > 0 : !!activeAdvFilters.tagId;
  const hasLanguage = Array.isArray(activeAdvFilters.languageId) ? activeAdvFilters.languageId.length > 0 : !!activeAdvFilters.languageId;

  return !!(
    activeAdvFilters.title ||
    hasAuthor ||
    activeAdvFilters.author ||
    hasGroup ||
    activeAdvFilters.group ||
    hasParody ||
    activeAdvFilters.parody ||
    hasTag ||
    hasLanguage ||
    activeAdvFilters.language
  );
}

/**
 * Return current active advanced filter values.
 * @returns {Object} activeAdvFilters
 */
export function getActiveAdvFilters() {
  return activeAdvFilters;
}

/**
 * Check if the advanced search panel drawer is currently open.
 * @returns {boolean} True if open
 */
export function isAdvSearchPanelOpen() {
  return !!(elements.advSearchPanel && elements.advSearchPanel.style.display !== 'none');
}

/**
 * Update the visual indicators (badge and button active state) based on filter presence.
 */
export function updateAdvSearchUIState() {
  const isActive = hasActiveAdvFilters();
  if (elements.advActiveBadge) {
    elements.advActiveBadge.style.display = isActive ? 'inline-flex' : 'none';
  }
  if (elements.btnToggleAdvSearch) {
    elements.btnToggleAdvSearch.classList.toggle('active', isActive);
  }
}

/**
 * Toggle the visibility of the advanced search drawer.
 * @param {boolean} [forceState] - Explicit open/close state
 */
export function toggleAdvancedSearchPanel(forceState) {
  if (!elements.advSearchPanel) return;
  const isCurrentlyOpen = elements.advSearchPanel.style.display !== 'none';
  const shouldOpen = forceState !== undefined ? forceState : !isCurrentlyOpen;
  elements.advSearchPanel.style.display = shouldOpen ? 'block' : 'none';
  if (shouldOpen && elements.advInputTitle) {
    elements.advInputTitle.focus();
  }
}

/**
 * Apply current input selections to activeAdvFilters and trigger library refresh.
 */
export function handleApplyAdvancedSearch() {
  if (!elements.advInputTitle) return;
  activeAdvFilters.title = elements.advInputTitle.value.trim();

  // Autocomplete selections
  if (autocompletes.author) {
    const authorIds = autocompletes.author.getSelectedIds();
    activeAdvFilters.authorId = authorIds.length > 0 ? authorIds : '';
  } else if (elements.advSelectAuthor) {
    activeAdvFilters.authorId = elements.advSelectAuthor.value;
  }

  if (autocompletes.group) {
    const groupIds = autocompletes.group.getSelectedIds();
    activeAdvFilters.groupId = groupIds.length > 0 ? groupIds : '';
  } else if (elements.advSelectGroup) {
    activeAdvFilters.groupId = elements.advSelectGroup.value;
  }

  if (autocompletes.parody) {
    const parodyIds = autocompletes.parody.getSelectedIds();
    activeAdvFilters.parodyId = parodyIds.length > 0 ? parodyIds : '';
  } else if (elements.advSelectParody) {
    activeAdvFilters.parodyId = elements.advSelectParody.value;
  }

  if (autocompletes.tag) {
    const tagIds = autocompletes.tag.getSelectedIds();
    activeAdvFilters.tagId = tagIds.length > 0 ? tagIds : '';
  } else if (elements.advSelectTag) {
    activeAdvFilters.tagId = elements.advSelectTag.value;
  }

  // Language autocomplete or fallback select
  if (autocompletes.language) {
    const languageIds = autocompletes.language.getSelectedIds();
    activeAdvFilters.languageId = languageIds.length > 0 ? languageIds : '';
  } else if (elements.advSelectLanguage) {
    activeAdvFilters.languageId = elements.advSelectLanguage.value;
  }

  updateAdvSearchUIState();
  callbacks.refreshSeries();
}

/**
 * Reset all advanced filter inputs, clear activeAdvFilters state, and trigger library refresh.
 */
export function handleClearAdvancedSearch() {
  if (elements.advInputTitle) elements.advInputTitle.value = '';
  if (autocompletes.author) autocompletes.author.clear();
  if (autocompletes.group) autocompletes.group.clear();
  if (autocompletes.parody) autocompletes.parody.clear();
  if (autocompletes.tag) autocompletes.tag.clear();
  if (autocompletes.language) autocompletes.language.clear();
  if (elements.advSelectLanguage) elements.advSelectLanguage.value = '';
  if (elements.advSelectAuthor) elements.advSelectAuthor.value = '';
  if (elements.advSelectGroup) elements.advSelectGroup.value = '';
  if (elements.advSelectParody) elements.advSelectParody.value = '';
  if (elements.advSelectTag) elements.advSelectTag.value = '';

  activeAdvFilters = {
    title: '',
    author: '',
    authorId: '',
    group: '',
    groupId: '',
    parody: '',
    parodyId: '',
    tag: '',
    tagId: '',
    language: '',
    languageId: ''
  };

  updateAdvSearchUIState();
  callbacks.refreshSeries();
}

/**
 * Initialize the Advanced Search module with DOM elements and callbacks.
 * @param {Object} options
 * @param {Function} options.refreshSeries - Function to refresh the series grid
 */
export function initAdvancedSearch(options = {}) {
  if (typeof options.refreshSeries === 'function') {
    callbacks.refreshSeries = options.refreshSeries;
  }

  // Cache DOM elements
  elements.btnToggleAdvSearch = document.getElementById('btnToggleAdvSearch');
  elements.advSearchPanel = document.getElementById('advSearchPanel');
  elements.btnCloseAdvSearch = document.getElementById('btnCloseAdvSearch');
  elements.advInputTitle = document.getElementById('advInputTitle');
  elements.advSelectAuthor = document.getElementById('advSelectAuthor');
  elements.advSelectGroup = document.getElementById('advSelectGroup');
  elements.advSelectParody = document.getElementById('advSelectParody');
  elements.advSelectTag = document.getElementById('advSelectTag');
  elements.advSelectLanguage = document.getElementById('advSelectLanguage');
  elements.btnApplyAdvSearch = document.getElementById('btnApplyAdvSearch');
  elements.btnClearAdvSearch = document.getElementById('btnClearAdvSearch');
  elements.advActiveBadge = document.getElementById('advActiveBadge');
  elements.btnQuickClearAdv = document.getElementById('btnQuickClearAdv');

  // Initialize Autocompletes for Author, Group, Parody, Tag
  const elAuthor = document.getElementById('advAutocompleteAuthor');
  if (elAuthor) {
    autocompletes.author = new CatalogAutocomplete({
      container: elAuthor,
      catalogType: 'author',
      placeholder: 'Buscar autor...',
      noResultsText: 'No se encontraron autores',
      maxSuggestions: 8,
      onSelectionChange: () => updateAdvSearchUIState(),
      onApply: () => handleApplyAdvancedSearch()
    });
  }

  const elGroup = document.getElementById('advAutocompleteGroup');
  if (elGroup) {
    autocompletes.group = new CatalogAutocomplete({
      container: elGroup,
      catalogType: 'group',
      placeholder: 'Buscar grupo...',
      noResultsText: 'No se encontraron grupos',
      maxSuggestions: 8,
      onSelectionChange: () => updateAdvSearchUIState(),
      onApply: () => handleApplyAdvancedSearch()
    });
  }

  const elParody = document.getElementById('advAutocompleteParody');
  if (elParody) {
    autocompletes.parody = new CatalogAutocomplete({
      container: elParody,
      catalogType: 'parody',
      placeholder: 'Buscar serie / parodia...',
      noResultsText: 'No se encontraron series/parodias',
      maxSuggestions: 8,
      onSelectionChange: () => updateAdvSearchUIState(),
      onApply: () => handleApplyAdvancedSearch()
    });
  }

  const elTag = document.getElementById('advAutocompleteTag');
  if (elTag) {
    autocompletes.tag = new CatalogAutocomplete({
      container: elTag,
      catalogType: 'tag',
      placeholder: 'Buscar tag...',
      noResultsText: 'No se encontraron tags',
      maxSuggestions: 8,
      onSelectionChange: () => updateAdvSearchUIState(),
      onApply: () => handleApplyAdvancedSearch()
    });
  }

  const elLanguage = document.getElementById('advAutocompleteLanguage');
  if (elLanguage) {
    autocompletes.language = new CatalogAutocomplete({
      container: elLanguage,
      catalogType: 'language',
      placeholder: 'Buscar idioma...',
      noResultsText: 'No se encontraron idiomas',
      maxSuggestions: 8,
      onSelectionChange: () => updateAdvSearchUIState(),
      onApply: () => handleApplyAdvancedSearch()
    });
  }

  // Register event listeners
  elements.btnToggleAdvSearch?.addEventListener('click', () => toggleAdvancedSearchPanel());
  elements.btnCloseAdvSearch?.addEventListener('click', () => toggleAdvancedSearchPanel(false));
  elements.btnApplyAdvSearch?.addEventListener('click', handleApplyAdvancedSearch);
  elements.btnClearAdvSearch?.addEventListener('click', handleClearAdvancedSearch);
  elements.btnQuickClearAdv?.addEventListener('click', handleClearAdvancedSearch);

  elements.advInputTitle?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApplyAdvancedSearch();
    }
  });

  elements.advSelectLanguage?.addEventListener('change', handleApplyAdvancedSearch);

  // Backwards compatibility for fallback selects if present
  elements.advSelectAuthor?.addEventListener('change', handleApplyAdvancedSearch);
  elements.advSelectGroup?.addEventListener('change', handleApplyAdvancedSearch);
  elements.advSelectParody?.addEventListener('change', handleApplyAdvancedSearch);
  elements.advSelectTag?.addEventListener('change', handleApplyAdvancedSearch);
}
