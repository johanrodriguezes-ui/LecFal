/**
 * Unified Catalog Manager Module for LecFal Renderer (Phase 3)
 *
 * Implements "Todos los catálogos" (sectionAllCatalogs):
 * - Unified view of all 5 catalog types (Authors, Tags, Languages, Series/Parodies, Groups)
 * - In-memory local search (case- and accent-insensitive)
 * - Compact type filter ([ Todos ] [ Autores ] [ Tags ] [ Idiomas ] [ Series ] [ Grupos ])
 * - Multi-criteria sorting (A-Z, Z-A, Mayor uso, Menor uso)
 * - Unified inline creation with catalog type selection
 * - Reuses shared catalog-manager CRUD, rename modal, and data synchronization
 * - Preserves search/filter/sort state across Settings navigation
 */

import { escapeHtml } from './ui-utils.js';
import {
  CATALOG_CONFIGS,
  getCatalogItems,
  normalizeText,
  addItem,
  deleteItem,
  openRenameModal,
  ensureAllCatalogsLoaded,
  onCatalogChange
} from './catalog-manager.js';

// ==================== STATE ====================
export const allCatalogsState = {
  query: '',
  typeFilter: 'all', // 'all' | 'author' | 'tag' | 'language' | 'parody' | 'group'
  sortBy: 'name-asc', // 'name-asc' | 'name-desc' | 'usage-desc' | 'usage-asc'
  isMounted: false
};

// ==================== DATA PIPELINE ====================
/**
 * Constructs the unified array of all catalog entries across the 5 types.
 * @returns {Array<{ type: string, typeLabel: string, pluralLabel: string, icon: string, id: number, name: string, usage: number }>}
 */
export function getUnifiedCatalogItems() {
  const unified = [];
  const types = ['author', 'tag', 'language', 'parody', 'group'];

  for (const t of types) {
    const cfg = CATALOG_CONFIGS[t];
    if (!cfg) continue;
    const rawItems = getCatalogItems(t) || [];
    for (const item of rawItems) {
      unified.push({
        type: cfg.type,
        typeLabel: cfg.typeLabel,
        pluralLabel: cfg.pluralLabel,
        icon: cfg.icon,
        id: item.id,
        name: item.name || '',
        usage: Number(item.manga_count) || 0
      });
    }
  }

  return unified;
}

/**
 * Applies type filtering, search query filtering, and sorting to the unified items.
 * @returns {{ allItems: Array, filteredCount: number, items: Array }}
 */
export function getFilteredAndSortedItems() {
  const allItems = getUnifiedCatalogItems();

  // 1. Type filter
  let filtered = allItems;
  if (allCatalogsState.typeFilter && allCatalogsState.typeFilter !== 'all') {
    filtered = filtered.filter(item => item.type === allCatalogsState.typeFilter);
  }

  // 2. Search query filter (case- and accent-insensitive)
  const normQuery = normalizeText(allCatalogsState.query);
  if (normQuery) {
    filtered = filtered.filter(item => {
      return normalizeText(item.name).includes(normQuery);
    });
  }

  // 3. Sorting with deterministic secondary sort by name
  const sorted = [...filtered].sort((a, b) => {
    switch (allCatalogsState.sortBy) {
      case 'name-desc':
        return (b.name || '').localeCompare(a.name || '', undefined, { sensitivity: 'base', numeric: true });
      case 'usage-desc': {
        const diff = b.usage - a.usage;
        if (diff !== 0) return diff;
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true });
      }
      case 'usage-asc': {
        const diff = a.usage - b.usage;
        if (diff !== 0) return diff;
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true });
      }
      case 'name-asc':
      default:
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true });
    }
  });

  return {
    allItems,
    filteredCount: filtered.length,
    items: sorted
  };
}

// ==================== RENDERING ====================
/**
 * Ensures the static DOM frame for "Todos los catálogos" is mounted into sectionAllCatalogs.
 * @returns {HTMLElement|null}
 */
export function ensureAllCatalogsFrameMounted() {
  const section = document.getElementById('sectionAllCatalogs');
  if (!section) return null;

  if (allCatalogsState.isMounted && section.querySelector('.all-catalogs-items-container')) {
    // Sync existing inputs to current state in case state was altered programmatically
    const searchInput = section.querySelector('.all-catalogs-search-input');
    const clearBtn = section.querySelector('.all-catalogs-search-clear-btn');
    const sortSelect = section.querySelector('.all-catalogs-sort-select');
    const pills = section.querySelectorAll('.all-catalogs-pill');

    if (searchInput && searchInput.value !== allCatalogsState.query) {
      searchInput.value = allCatalogsState.query;
    }
    if (clearBtn) {
      clearBtn.style.display = allCatalogsState.query ? 'flex' : 'none';
    }
    if (sortSelect && sortSelect.value !== allCatalogsState.sortBy) {
      sortSelect.value = allCatalogsState.sortBy;
    }
    pills.forEach(pill => {
      const isTarget = pill.dataset.typeFilter === allCatalogsState.typeFilter;
      pill.classList.toggle('active', isTarget);
      if (isTarget) pill.setAttribute('aria-selected', 'true');
      else pill.removeAttribute('aria-selected');
    });

    return section;
  }

  section.innerHTML = `
    <div class="settings-card-header catalog-header all-catalogs-header">
      <div class="settings-card-icon-title">
        <div class="settings-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
        </div>
        <div>
          <h3 class="settings-card-title">Todos los Catálogos</h3>
          <p class="settings-card-desc">Búsqueda unificada y administración integral de todos los valores de catálogo de tu biblioteca.</p>
        </div>
      </div>
      <div class="settings-card-actions">
        <button type="button" class="btn btn-primary btn-all-catalogs-add" title="Crear nuevo elemento en un catálogo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>+ Añadir</span>
        </button>
      </div>
    </div>

    <div class="settings-card-body all-catalogs-body">
      <!-- Inline Expandable Add Form -->
      <form class="all-catalogs-add-form catalog-add-form" style="display: none;">
        <div class="all-catalogs-add-row">
          <select class="all-catalogs-add-type" title="Seleccionar tipo de catálogo">
            <option value="author">Autor</option>
            <option value="tag">Tag</option>
            <option value="language">Idioma</option>
            <option value="parody">Serie / Parodia</option>
            <option value="group">Grupo</option>
          </select>
          <input type="text" class="all-catalogs-add-input" placeholder="Nombre del nuevo elemento..." autocomplete="off" required>
          <button type="submit" class="btn btn-primary btn-all-catalogs-submit">
            <span>Guardar</span>
          </button>
          <button type="button" class="btn btn-secondary btn-all-catalogs-cancel">
            <span>Cancelar</span>
          </button>
        </div>
      </form>

      <!-- Controls Toolbar: Search, Sort & Count -->
      <div class="all-catalogs-toolbar">
        <div class="all-catalogs-search-wrap catalog-search-input-wrap">
          <svg class="catalog-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" class="all-catalogs-search-input catalog-search-input" placeholder="Buscar en todos los catálogos..." value="${escapeHtml(allCatalogsState.query)}" autocomplete="off">
          <button type="button" class="all-catalogs-search-clear-btn catalog-search-clear-btn" style="display: ${allCatalogsState.query ? 'flex' : 'none'};" title="Limpiar búsqueda">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="all-catalogs-sort-wrap">
          <label class="all-catalogs-sort-label" for="allCatalogsSortSelect">Ordenar:</label>
          <select id="allCatalogsSortSelect" class="all-catalogs-sort-select">
            <option value="name-asc" ${allCatalogsState.sortBy === 'name-asc' ? 'selected' : ''}>A-Z</option>
            <option value="name-desc" ${allCatalogsState.sortBy === 'name-desc' ? 'selected' : ''}>Z-A</option>
            <option value="usage-desc" ${allCatalogsState.sortBy === 'usage-desc' ? 'selected' : ''}>Mayor uso</option>
            <option value="usage-asc" ${allCatalogsState.sortBy === 'usage-asc' ? 'selected' : ''}>Menor uso</option>
          </select>
        </div>

        <div class="all-catalogs-count-badge catalog-count-badge">
          <span class="all-catalogs-total-count">0 elementos</span>
        </div>
      </div>

      <!-- Type Filter Pills -->
      <div class="all-catalogs-filter-pills" role="tablist" aria-label="Filtro por tipo de catálogo">
        <button type="button" class="all-catalogs-pill ${allCatalogsState.typeFilter === 'all' ? 'active' : ''}" data-type-filter="all" ${allCatalogsState.typeFilter === 'all' ? 'aria-selected="true"' : ''}>Todos</button>
        <button type="button" class="all-catalogs-pill ${allCatalogsState.typeFilter === 'author' ? 'active' : ''}" data-type-filter="author" ${allCatalogsState.typeFilter === 'author' ? 'aria-selected="true"' : ''}>Autores</button>
        <button type="button" class="all-catalogs-pill ${allCatalogsState.typeFilter === 'tag' ? 'active' : ''}" data-type-filter="tag" ${allCatalogsState.typeFilter === 'tag' ? 'aria-selected="true"' : ''}>Tags</button>
        <button type="button" class="all-catalogs-pill ${allCatalogsState.typeFilter === 'language' ? 'active' : ''}" data-type-filter="language" ${allCatalogsState.typeFilter === 'language' ? 'aria-selected="true"' : ''}>Idiomas</button>
        <button type="button" class="all-catalogs-pill ${allCatalogsState.typeFilter === 'parody' ? 'active' : ''}" data-type-filter="parody" ${allCatalogsState.typeFilter === 'parody' ? 'aria-selected="true"' : ''}>Series</button>
        <button type="button" class="all-catalogs-pill ${allCatalogsState.typeFilter === 'group' ? 'active' : ''}" data-type-filter="group" ${allCatalogsState.typeFilter === 'group' ? 'aria-selected="true"' : ''}>Grupos</button>
      </div>

      <!-- Unified Items Container -->
      <div class="all-catalogs-items-container">
        <!-- Injected dynamically -->
      </div>
    </div>
  `;

  // Attach event listeners to controls
  const addBtn = section.querySelector('.btn-all-catalogs-add');
  const addForm = section.querySelector('.all-catalogs-add-form');
  const addTypeSelect = section.querySelector('.all-catalogs-add-type');
  const addInput = section.querySelector('.all-catalogs-add-input');
  const cancelBtn = section.querySelector('.btn-all-catalogs-cancel');
  const searchInput = section.querySelector('.all-catalogs-search-input');
  const clearBtn = section.querySelector('.all-catalogs-search-clear-btn');
  const sortSelect = section.querySelector('.all-catalogs-sort-select');
  const pills = section.querySelectorAll('.all-catalogs-pill');

  // Add toggle
  addBtn?.addEventListener('click', () => {
    const isHidden = addForm.style.display === 'none';
    if (isHidden) {
      addForm.style.display = 'block';
      if (allCatalogsState.typeFilter && allCatalogsState.typeFilter !== 'all') {
        addTypeSelect.value = allCatalogsState.typeFilter;
      }
      addInput.focus();
    } else {
      addInput.focus();
    }
  });

  // Cancel add form
  cancelBtn?.addEventListener('click', () => {
    addForm.style.display = 'none';
    addInput.value = '';
  });

  addInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      addForm.style.display = 'none';
      addInput.value = '';
    }
  });

  // Add form submission
  addForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = addTypeSelect.value;
    const name = addInput.value.trim();
    if (!name) return;
    try {
      await addItem(type, name);
      addInput.value = '';
      addForm.style.display = 'none';
      renderAllCatalogsItems();
    } catch (_) {
      // Error handled via toast in addItem
    }
  });

  // Search input keystrokes
  searchInput?.addEventListener('input', (e) => {
    const q = e.target.value;
    allCatalogsState.query = q;
    clearBtn.style.display = q ? 'flex' : 'none';
    renderAllCatalogsItems();
  });

  // Clear search button
  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    allCatalogsState.query = '';
    clearBtn.style.display = 'none';
    searchInput.focus();
    renderAllCatalogsItems();
  });

  // Sort dropdown change
  sortSelect?.addEventListener('change', (e) => {
    allCatalogsState.sortBy = e.target.value;
    renderAllCatalogsItems();
  });

  // Type filter pills
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      const typeFilter = pill.dataset.typeFilter || 'all';
      setAllCatalogsFilter(typeFilter);
    });
  });

  allCatalogsState.isMounted = true;
  return section;
}

/**
 * Re-renders only the items list and count badge of "Todos los catálogos".
 * Preserves the frame, search input focus, and filter controls.
 */
export function renderAllCatalogsItems() {
  const section = document.getElementById('sectionAllCatalogs');
  if (!section) return;

  const container = section.querySelector('.all-catalogs-items-container');
  const countEl = section.querySelector('.all-catalogs-total-count');
  if (!container) return;

  const { allItems, filteredCount, items } = getFilteredAndSortedItems();
  const totalCount = allItems.length;
  const isFiltered = (allCatalogsState.query.trim() !== '') || (allCatalogsState.typeFilter !== 'all');

  // Update total / filtered count badge
  if (countEl) {
    if (isFiltered) {
      countEl.textContent = `${filteredCount} de ${totalCount} elementos`;
    } else {
      countEl.textContent = `${totalCount} ${totalCount === 1 ? 'elemento' : 'elementos'}`;
    }
  }

  // 1. Empty state: No catalog items in DB at all across all 5 types
  if (totalCount === 0) {
    container.innerHTML = `
      <div class="catalog-empty-state all-catalogs-empty">
        <div class="catalog-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
        </div>
        <h4 class="catalog-empty-title">No hay valores de catálogo todavía</h4>
        <p class="catalog-empty-desc">Añade autores, tags, idiomas, series o grupos para tu biblioteca haciendo clic en "+ Añadir".</p>
        <button type="button" class="btn btn-primary btn-sm btn-empty-add-all">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>+ Añadir elemento</span>
        </button>
      </div>
    `;

    container.querySelector('.btn-empty-add-all')?.addEventListener('click', () => {
      const addForm = section.querySelector('.all-catalogs-add-form');
      const addInput = section.querySelector('.all-catalogs-add-input');
      if (addForm) {
        addForm.style.display = 'block';
        addInput?.focus();
      }
    });
    return;
  }

  // 2. Empty state: Search or type filtering produced zero matches
  if (filteredCount === 0) {
    container.innerHTML = `
      <div class="catalog-empty-state catalog-search-empty all-catalogs-no-results">
        <div class="catalog-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <h4 class="catalog-empty-title">No se encontraron resultados</h4>
        <p class="catalog-empty-desc">No se encontraron elementos coincidentes con los filtros aplicados${allCatalogsState.query ? ` para "<strong>${escapeHtml(allCatalogsState.query)}</strong>"` : ''}.</p>
        <button type="button" class="btn btn-secondary btn-sm btn-all-catalogs-clear-filters">
          Limpiar filtros
        </button>
      </div>
    `;

    container.querySelector('.btn-all-catalogs-clear-filters')?.addEventListener('click', () => {
      setAllCatalogsSearch('');
      setAllCatalogsFilter('all');
    });
    return;
  }

  // 3. Render Unified Items List
  const fragment = document.createDocumentFragment();

  // Table Column Headers
  const headerRow = document.createElement('div');
  headerRow.className = 'all-catalogs-table-header';
  headerRow.innerHTML = `
    <span class="col-type">TIPO</span>
    <span class="col-name">NOMBRE</span>
    <span class="col-usage">ASOCIACIONES</span>
    <span class="col-actions">ACCIONES</span>
  `;
  fragment.appendChild(headerRow);

  const rowsWrap = document.createElement('div');
  rowsWrap.className = 'all-catalogs-rows-wrap';

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'all-catalogs-item-row';
    row.dataset.type = item.type;
    row.dataset.id = item.id;

    row.innerHTML = `
      <div class="col-type">
        <span class="all-catalogs-type-badge type-${item.type}" title="${escapeHtml(item.typeLabel)}">
          <svg class="all-catalogs-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${item.icon}
          </svg>
          <span class="all-catalogs-type-label">${escapeHtml(item.typeLabel)}</span>
        </span>
      </div>
      <div class="col-name all-catalogs-item-name" title="${escapeHtml(item.name)}">
        ${escapeHtml(item.name)}
      </div>
      <div class="col-usage">
        <span class="all-catalogs-usage-badge" title="${item.usage} mangas asociados">
          ${item.usage}
        </span>
      </div>
      <div class="col-actions all-catalogs-item-actions">
        <button type="button" class="btn btn-secondary btn-sm btn-all-catalogs-rename" data-type="${item.type}" data-id="${item.id}" data-name="${escapeHtml(item.name)}" title="Renombrar ${escapeHtml(item.typeLabel.toLowerCase())}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          <span>Renombrar</span>
        </button>
        <button type="button" class="btn btn-danger btn-sm btn-all-catalogs-delete" data-type="${item.type}" data-id="${item.id}" data-name="${escapeHtml(item.name)}" title="Eliminar ${escapeHtml(item.typeLabel.toLowerCase())}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
            <path d="M3 6h18"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
          </svg>
          <span>Eliminar</span>
        </button>
      </div>
    `;

    // Wire Rename
    row.querySelector('.btn-all-catalogs-rename')?.addEventListener('click', () => {
      openRenameModal({
        type: item.type,
        id: item.id,
        currentName: item.name,
        typeLabel: item.typeLabel,
        onRenamed: async () => {
          renderAllCatalogsItems();
        }
      });
    });

    // Wire Delete
    row.querySelector('.btn-all-catalogs-delete')?.addEventListener('click', async () => {
      await deleteItem(item.type, item.id, item.name);
      renderAllCatalogsItems();
    });

    rowsWrap.appendChild(row);
  });

  fragment.appendChild(rowsWrap);
  container.innerHTML = '';
  container.appendChild(fragment);
}

// ==================== PUBLIC API ====================
/**
 * Renders the unified "Todos los catálogos" view into sectionAllCatalogs.
 * Loads any unloaded catalogs, mounts frame, and renders items.
 */
export async function renderAllCatalogs() {
  ensureAllCatalogsFrameMounted();
  await ensureAllCatalogsLoaded();
  renderAllCatalogsItems();
}

/**
 * Sets search query for the unified view.
 * @param {string} query
 */
export function setAllCatalogsSearch(query) {
  allCatalogsState.query = query || '';

  const section = document.getElementById('sectionAllCatalogs');
  if (section) {
    const input = section.querySelector('.all-catalogs-search-input');
    const clearBtn = section.querySelector('.all-catalogs-search-clear-btn');
    if (input && input.value !== allCatalogsState.query) {
      input.value = allCatalogsState.query;
    }
    if (clearBtn) {
      clearBtn.style.display = allCatalogsState.query ? 'flex' : 'none';
    }
  }

  renderAllCatalogsItems();
}

/**
 * Sets type filter for the unified view ('all' | 'author' | 'tag' | 'language' | 'parody' | 'group').
 * @param {string} typeFilter
 */
export function setAllCatalogsFilter(typeFilter) {
  const finalType = typeFilter || 'all';
  allCatalogsState.typeFilter = finalType;

  const section = document.getElementById('sectionAllCatalogs');
  if (section) {
    const pills = section.querySelectorAll('.all-catalogs-pill');
    pills.forEach(pill => {
      const isTarget = pill.dataset.typeFilter === finalType;
      pill.classList.toggle('active', isTarget);
      if (isTarget) pill.setAttribute('aria-selected', 'true');
      else pill.removeAttribute('aria-selected');
    });

    // If add form is open, set dropdown to the selected filter type if not 'all'
    const addTypeSelect = section.querySelector('.all-catalogs-add-type');
    if (addTypeSelect && finalType !== 'all') {
      addTypeSelect.value = finalType;
    }
  }

  renderAllCatalogsItems();
}

/**
 * Sets sorting criteria for the unified view ('name-asc' | 'name-desc' | 'usage-desc' | 'usage-asc').
 * @param {string} sortBy
 */
export function setAllCatalogsSort(sortBy) {
  const finalSort = sortBy || 'name-asc';
  allCatalogsState.sortBy = finalSort;

  const section = document.getElementById('sectionAllCatalogs');
  if (section) {
    const select = section.querySelector('.all-catalogs-sort-select');
    if (select && select.value !== finalSort) {
      select.value = finalSort;
    }
  }

  renderAllCatalogsItems();
}

/**
 * Returns current state of unified catalog view.
 * @returns {typeof allCatalogsState}
 */
export function getAllCatalogsState() {
  return allCatalogsState;
}

// Automatically subscribe to catalog changes to keep unified list fresh
onCatalogChange(() => {
  if (allCatalogsState.isMounted) {
    renderAllCatalogsItems();
  }
});

// Expose on window for programmatic access and test validation
if (typeof window !== 'undefined') {
  window.allCatalogs = {
    renderAllCatalogs,
    renderAllCatalogsItems,
    setAllCatalogsSearch,
    setAllCatalogsFilter,
    setAllCatalogsSort,
    getAllCatalogsState,
    getUnifiedCatalogItems,
    getFilteredAndSortedItems,
    allCatalogsState
  };
  window.renderAllCatalogs = renderAllCatalogs;
}
