/**
 * Reusable Catalog Autocomplete Component for LecFal
 * 
 * Provides searchable, multi-select autocomplete input with chips:
 * - Case-insensitive and accent-insensitive substring matching
 * - Maximum suggestion count limiting (prevents rendering hundreds of nodes)
 * - Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape, Backspace)
 * - Removable selection chips with [x] buttons
 * - Outside click detection and clean dropdown lifecycle
 */

import { escapeHtml } from './ui-utils.js';

/**
 * Normalize search string: lowercase, trimmed, and diacritic/accent-stripped.
 * Example: "José" -> "jose", "München" -> "munchen"
 * @param {string} str
 * @returns {string}
 */
export function normalizeSearchText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export class CatalogAutocomplete {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Host container element
   * @param {string} [options.catalogType] - Type name ('author', 'group', 'parody', 'tag')
   * @param {string} [options.placeholder] - Input placeholder
   * @param {string} [options.noResultsText] - Text when no suggestions match
   * @param {number} [options.maxSuggestions=8] - Maximum visible suggestions
   * @param {Function} [options.onSelectionChange] - Fired when chips are added or removed
   * @param {Function} [options.onApply] - Fired when Enter is pressed without suggestion selection
   */
  constructor(options = {}) {
    if (!options.container) {
      throw new Error('CatalogAutocomplete requires a container element');
    }

    this.container = options.container;
    this.catalogType = options.catalogType || 'item';
    this.placeholder = options.placeholder || 'Buscar...';
    this.noResultsText = options.noResultsText || 'No se encontraron coincidencias';
    this.maxSuggestions = options.maxSuggestions || 8;
    this.onSelectionChange = options.onSelectionChange || (() => {});
    this.onApply = options.onApply || (() => {});

    this.catalog = [];
    this.selectedItems = []; // Array of { id, name }
    this.matchingSuggestions = [];
    this.highlightedIndex = -1;
    this.isOpen = false;

    this.renderInitialDom();
    this.bindEvents();
  }

  renderInitialDom() {
    this.container.classList.add('catalog-autocomplete-container');
    this.container.innerHTML = `
      <div class="autocomplete-box" role="combobox" aria-expanded="false" aria-haspopup="listbox">
        <div class="autocomplete-chips" style="display: none;"></div>
        <div class="autocomplete-input-wrap">
          <input type="text" class="autocomplete-input" placeholder="${escapeHtml(this.placeholder)}" autocomplete="off" spellcheck="false">
        </div>
      </div>
      <div class="autocomplete-dropdown" style="display: none;">
        <ul class="autocomplete-list" role="listbox"></ul>
        <div class="autocomplete-empty" style="display: none;">${escapeHtml(this.noResultsText)}</div>
      </div>
    `;

    this.boxEl = this.container.querySelector('.autocomplete-box');
    this.chipsEl = this.container.querySelector('.autocomplete-chips');
    this.inputEl = this.container.querySelector('.autocomplete-input');
    this.dropdownEl = this.container.querySelector('.autocomplete-dropdown');
    this.listEl = this.container.querySelector('.autocomplete-list');
    this.emptyEl = this.container.querySelector('.autocomplete-empty');
  }

  bindEvents() {
    // Focus input when clicking anywhere inside the box
    this.boxEl.addEventListener('click', (e) => {
      if (e.target.closest('.btn-chip-remove')) return;
      this.inputEl.focus();
    });

    // Input changes
    this.inputEl.addEventListener('input', () => {
      this.updateSuggestions(this.inputEl.value);
      this.openDropdown();
    });

    // Input focus
    this.inputEl.addEventListener('focus', () => {
      this.updateSuggestions(this.inputEl.value);
      this.openDropdown();
    });

    // Keyboard navigation
    this.inputEl.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Outside click closes dropdown
    this.outsideClickHandler = (e) => {
      if (!this.container.contains(e.target)) {
        this.closeDropdown();
      }
    };
    document.addEventListener('click', this.outsideClickHandler);
  }

  /**
   * Filter catalog items based on normalized query string.
   * Excludes already selected items.
   * @param {string} query
   * @returns {Array<Object>}
   */
  filterCatalog(query) {
    const normalized = normalizeSearchText(query);
    const selectedIdSet = new Set(this.selectedItems.map(item => item.id));

    const matches = [];
    for (const item of this.catalog) {
      if (selectedIdSet.has(item.id)) continue;

      if (!normalized) {
        matches.push(item);
      } else {
        const itemNorm = normalizeSearchText(item.name);
        if (itemNorm.includes(normalized)) {
          matches.push(item);
        }
      }

      if (matches.length >= this.maxSuggestions) {
        break;
      }
    }
    return matches;
  }

  /**
   * Update matching suggestions list in DOM.
   * @param {string} query
   */
  updateSuggestions(query) {
    this.matchingSuggestions = this.filterCatalog(query);
    this.highlightedIndex = -1;
    this.listEl.innerHTML = '';

    if (this.matchingSuggestions.length === 0) {
      this.listEl.style.display = 'none';
      this.emptyEl.style.display = 'block';
    } else {
      this.emptyEl.style.display = 'none';
      this.listEl.style.display = 'block';

      this.matchingSuggestions.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'autocomplete-item';
        li.dataset.index = index;
        li.dataset.id = item.id;
        li.textContent = item.name;
        li.title = item.name;

        li.addEventListener('mousedown', (e) => {
          // Use mousedown to execute before input blur
          e.preventDefault();
          this.selectItem(item);
        });

        this.listEl.appendChild(li);
      });
    }
  }

  handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.isOpen) {
        this.openDropdown();
        return;
      }
      if (this.matchingSuggestions.length > 0) {
        this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.matchingSuggestions.length - 1);
        this.updateHighlight();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.isOpen) return;
      if (this.matchingSuggestions.length > 0) {
        this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
        this.updateHighlight();
      }
    } else if (e.key === 'Enter') {
      if (this.isOpen && this.highlightedIndex >= 0 && this.highlightedIndex < this.matchingSuggestions.length) {
        e.preventDefault();
        this.selectItem(this.matchingSuggestions[this.highlightedIndex]);
      } else if (typeof this.onApply === 'function') {
        // No item highlighted: allow Enter to trigger Advanced Search submit
        e.preventDefault();
        this.closeDropdown();
        this.onApply();
      }
    } else if (e.key === 'Escape') {
      if (this.isOpen) {
        e.preventDefault();
        e.stopPropagation();
        this.closeDropdown();
      }
    } else if (e.key === 'Backspace' && !this.inputEl.value && this.selectedItems.length > 0) {
      // Remove last selected chip when Backspace pressed on empty input
      this.selectedItems.pop();
      this.renderChips();
      this.onSelectionChange(this.selectedItems);
      if (this.isOpen) {
        this.updateSuggestions('');
      }
    }
  }

  updateHighlight() {
    const items = this.listEl.querySelectorAll('.autocomplete-item');
    items.forEach((el, index) => {
      el.classList.toggle('is-highlighted', index === this.highlightedIndex);
    });

    if (this.highlightedIndex >= 0 && items[this.highlightedIndex]) {
      items[this.highlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  selectItem(item) {
    if (!item) return;
    this.selectedItems.push(item);
    this.inputEl.value = '';
    this.closeDropdown();
    this.renderChips();
    this.onSelectionChange(this.selectedItems);
    this.inputEl.focus();
  }

  removeItem(id) {
    this.selectedItems = this.selectedItems.filter(item => item.id !== id);
    this.renderChips();
    this.onSelectionChange(this.selectedItems);
    if (this.isOpen) {
      this.updateSuggestions(this.inputEl.value);
    }
  }

  renderChips() {
    this.chipsEl.innerHTML = '';
    if (this.selectedItems.length === 0) {
      this.chipsEl.style.display = 'none';
      this.inputEl.placeholder = this.placeholder;
    } else {
      this.chipsEl.style.display = 'flex';
      this.inputEl.placeholder = '+ Añadir...';

      this.selectedItems.forEach(item => {
        const chip = document.createElement('span');
        chip.className = 'autocomplete-chip';
        chip.dataset.id = item.id;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = item.name;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-chip-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = `Quitar ${escapeHtml(item.name)}`;
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeItem(item.id);
        });

        chip.appendChild(nameSpan);
        chip.appendChild(removeBtn);
        this.chipsEl.appendChild(chip);
      });
    }
  }

  openDropdown() {
    this.isOpen = true;
    this.dropdownEl.style.display = 'block';
    this.boxEl.setAttribute('aria-expanded', 'true');
  }

  closeDropdown() {
    this.isOpen = false;
    this.dropdownEl.style.display = 'none';
    this.boxEl.setAttribute('aria-expanded', 'false');
    this.highlightedIndex = -1;
  }

  /**
   * Update available catalog list and sync selected item names.
   * @param {Array<Object>} newCatalog - [{ id, name }]
   */
  setCatalog(newCatalog) {
    this.catalog = Array.isArray(newCatalog) ? newCatalog : [];

    // Keep selected item names up to date in case of renames in Settings
    const catalogMap = new Map(this.catalog.map(i => [i.id, i.name]));
    this.selectedItems = this.selectedItems
      .filter(item => catalogMap.has(item.id))
      .map(item => ({ id: item.id, name: catalogMap.get(item.id) }));

    this.renderChips();
    if (this.isOpen) {
      this.updateSuggestions(this.inputEl.value);
    }
  }

  /**
   * Return currently selected items.
   * @returns {Array<Object>} Array of { id, name }
   */
  getSelectedItems() {
    return [...this.selectedItems];
  }

  /**
   * Return currently selected item IDs.
   * @returns {Array<number>}
   */
  getSelectedIds() {
    return this.selectedItems.map(item => item.id);
  }

  /**
   * Programmatically set selected items by IDs.
   * @param {Array<number>} ids
   */
  setSelectedIds(ids) {
    const idSet = new Set((ids || []).map(id => parseInt(id, 10)));
    this.selectedItems = this.catalog.filter(item => idSet.has(item.id));
    this.renderChips();
    this.onSelectionChange(this.selectedItems);
  }

  /**
   * Clear all selected items and reset search input.
   */
  clear() {
    this.selectedItems = [];
    this.inputEl.value = '';
    this.closeDropdown();
    this.renderChips();
    this.onSelectionChange(this.selectedItems);
  }

  destroy() {
    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler);
    }
    this.container.innerHTML = '';
  }
}
