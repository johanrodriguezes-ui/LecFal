/**
 * Shared Catalog Manager Module for LecFal Renderer
 *
 * Provides a unified, configuration-driven interface for managing the 5 catalog types:
 * - Authors (sectionAuthors)
 * - Tags (sectionTags)
 * - Languages (sectionLanguages)
 * - Series / Parodies (sectionParodies)
 * - Groups (sectionGroups)
 *
 * Features:
 * - In-memory local search filtering (case & accent-insensitive)
 * - Alphabetical sorting and grouping (# for non-alphabetic)
 * - Complete CRUD with confirmation and rename modal integration
 * - Preserves existing callbacks and usage counts
 */

import { escapeHtml } from '../utils/ui-utils.js';

// ==================== CONFIGURATION ====================
export const CATALOG_CONFIGS = {
  author: {
    type: 'author',
    sectionId: 'sectionAuthors',
    typeLabel: 'Autor',
    pluralLabel: 'Autores',
    title: 'Gestión de Autores',
    desc: 'Crea y administra el catálogo oficial de autores. Es la fuente única de verdad para asignar autores a tus mangas.',
    searchPlaceholder: 'Buscar autor...',
    addPlaceholder: 'Nombre del nuevo autor (ej. Mikan Dou, Eiichiro Oda)...',
    addButtonLabel: 'Añadir Autor',
    fetchList: () => window.lecfalAPI.getAllAuthors(),
    create: (name) => window.lecfalAPI.createAuthor(name),
    rename: (id, name) => window.lecfalAPI.renameAuthor(id, name),
    delete: (id) => window.lecfalAPI.deleteAuthor(id),
    emptyTextTitle: 'No hay autores registrados todavía',
    emptyTextDesc: 'Añade autores oficiales para tu biblioteca haciendo clic en "Añadir".',
    icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    confirmDeleteMsg: (name) => `¿Eliminar el autor "${name}"?\nSe desvinculará de los mangas asignados de forma segura.`,
    createdMsg: (name) => `Autor "${name}" creado exitosamente`,
    deletedMsg: (name) => `Autor "${name}" eliminado`,
    renamedMsg: (name) => `Autor renombrado a "${name}"`
  },
  tag: {
    type: 'tag',
    sectionId: 'sectionTags',
    typeLabel: 'Tag',
    pluralLabel: 'Tags',
    title: 'Gestión de Tags',
    desc: 'Crea, edita y administra los tags disponibles en la biblioteca. Es la fuente única de verdad.',
    searchPlaceholder: 'Buscar tag...',
    addPlaceholder: 'Nombre del nuevo tag (ej. Acción, Romance, Shonen)...',
    addButtonLabel: 'Añadir Tag',
    fetchList: () => window.lecfalAPI.getAllTags(),
    create: (name) => window.lecfalAPI.createTag(name),
    rename: (id, name) => window.lecfalAPI.renameTag(id, name),
    delete: (id) => window.lecfalAPI.deleteTag(id),
    emptyTextTitle: 'No hay tags creados todavía',
    emptyTextDesc: 'Registra tags para clasificar tu biblioteca haciendo clic en "Añadir".',
    icon: `<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>`,
    confirmDeleteMsg: (name) => `¿Eliminar el tag "${name}"?\nSe desvinculará de los mangas asignados de forma segura.`,
    createdMsg: (name) => `Tag "${name}" creado exitosamente`,
    deletedMsg: (name) => `Tag "${name}" eliminado`,
    renamedMsg: (name) => `Tag renombrado a "${name}"`
  },
  language: {
    type: 'language',
    sectionId: 'sectionLanguages',
    typeLabel: 'Idioma',
    pluralLabel: 'Idiomas',
    title: 'Gestión de Idiomas',
    desc: 'Configura los idiomas disponibles en tu biblioteca para filtrar y clasificar mangas.',
    searchPlaceholder: 'Buscar idioma...',
    addPlaceholder: 'Nombre del nuevo idioma (ej. Español, Inglés, Japonés)...',
    addButtonLabel: 'Añadir Idioma',
    fetchList: () => window.lecfalAPI.getAllLanguages(),
    create: (name) => window.lecfalAPI.createLanguage(name),
    rename: (id, name) => window.lecfalAPI.renameLanguage(id, name),
    delete: (id) => window.lecfalAPI.deleteLanguage(id),
    emptyTextTitle: 'No hay idiomas configurados todavía',
    emptyTextDesc: 'Añade los idiomas disponibles para tu biblioteca haciendo clic en "Añadir".',
    icon: `<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"/>`,
    confirmDeleteMsg: (name) => `¿Eliminar el idioma "${name}"?\nSe desvinculará de los mangas asignados de forma segura.`,
    createdMsg: (name) => `Idioma "${name}" creado exitosamente`,
    deletedMsg: (name) => `Idioma "${name}" eliminado`,
    renamedMsg: (name) => `Idioma renombrado a "${name}"`
  },
  parody: {
    type: 'parody',
    sectionId: 'sectionParodies',
    typeLabel: 'Serie / Parodia',
    pluralLabel: 'Series / Parodias',
    title: 'Gestión de Series / Parodias',
    desc: 'Configura los universos, obras originales o parodias a las que pertenecen los mangas (ej. Original, Naruto, One Piece).',
    searchPlaceholder: 'Buscar serie o parodia...',
    addPlaceholder: 'Nombre de la serie o parodia (ej. Original, Naruto)...',
    addButtonLabel: 'Añadir Serie / Parodia',
    fetchList: () => window.lecfalAPI.getAllParodies(),
    create: (name) => window.lecfalAPI.createParody(name),
    rename: (id, name) => window.lecfalAPI.renameParody(id, name),
    delete: (id) => window.lecfalAPI.deleteParody(id),
    emptyTextTitle: 'No hay series o parodias registradas todavía',
    emptyTextDesc: 'Añade series o universos para tus mangas haciendo clic en "Añadir".',
    icon: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>`,
    confirmDeleteMsg: (name) => `¿Eliminar la serie o parodia "${name}"?\nSe desvinculará de los mangas asignados de forma segura.`,
    createdMsg: (name) => `Serie / Parodia "${name}" creada exitosamente`,
    deletedMsg: (name) => `Serie / Parodia "${name}" eliminada`,
    renamedMsg: (name) => `Serie / Parodia renombrada a "${name}"`
  },
  group: {
    type: 'group',
    sectionId: 'sectionGroups',
    typeLabel: 'Grupo',
    pluralLabel: 'Grupos',
    title: 'Gestión de Grupos',
    desc: 'Crea y administra el catálogo oficial de grupos, círculos o colectivos de autores para tus mangas.',
    searchPlaceholder: 'Buscar grupo...',
    addPlaceholder: 'Nombre del nuevo grupo (ej. Studio X, Circle A)...',
    addButtonLabel: 'Añadir Grupo',
    fetchList: () => window.lecfalAPI.getAllGroups(),
    create: (name) => window.lecfalAPI.createGroup(name),
    rename: (id, name) => window.lecfalAPI.renameGroup(id, name),
    delete: (id) => window.lecfalAPI.deleteGroup(id),
    emptyTextTitle: 'No hay grupos o círculos configurados todavía',
    emptyTextDesc: 'Añade círculos, editoriales o colectivos haciendo clic en "Añadir".',
    icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    confirmDeleteMsg: (name) => `¿Eliminar el grupo "${name}"?\nSe desvinculará de los mangas asignados de forma segura.`,
    createdMsg: (name) => `Grupo "${name}" creado exitosamente`,
    deletedMsg: (name) => `Grupo "${name}" eliminado`,
    renamedMsg: (name) => `Grupo renombrado a "${name}"`
  }
};

/**
 * Normalizes input key to canonical catalog type.
 * @param {string} type
 * @returns {string}
 */
export function resolveType(type) {
  if (!type) return 'author';
  const norm = String(type).toLowerCase().trim();
  const map = {
    authors: 'author',
    author: 'author',
    tags: 'tag',
    tag: 'tag',
    languages: 'language',
    language: 'language',
    parodies: 'parody',
    parody: 'parody',
    groups: 'group',
    group: 'group'
  };
  return map[norm] || norm;
}

// ==================== LOCAL STATE ====================
const catalogState = {
  author: { items: null, query: '', isMounted: false },
  tag: { items: null, query: '', isMounted: false },
  language: { items: null, query: '', isMounted: false },
  parody: { items: null, query: '', isMounted: false },
  group: { items: null, query: '', isMounted: false }
};

let callbacks = {
  showToast: () => {},
  refreshAdvSearch: () => {},
  reloadActiveSeries: () => {},
  refreshSeries: () => {},
  onRenameLibrary: () => {}
};

const catalogChangeListeners = [];

/**
 * Registers a listener to be notified when any catalog is refreshed or updated.
 * @param {Function} fn
 */
export function onCatalogChange(fn) {
  if (typeof fn === 'function' && !catalogChangeListeners.includes(fn)) {
    catalogChangeListeners.push(fn);
  }
}

let pendingRename = null; // { type, id, currentName, typeLabel, onRenamed }

// ==================== NORMALIZATION & SEARCH ====================
/**
 * Normalizes string: lowercase, trimmed, and diacritic/accent-stripped.
 * @param {string} str
 * @returns {string}
 */
export function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Filters list of catalog items by query string locally.
 * @param {Array<{ id: number, name: string }>} items
 * @param {string} query
 * @returns {Array<{ id: number, name: string }>}
 */
export function filterItems(items, query) {
  if (!items || !Array.isArray(items)) return [];
  const normQuery = normalizeText(query);
  if (!normQuery) return items;

  return items.filter(item => {
    const normName = normalizeText(item.name);
    return normName.includes(normQuery);
  });
}

/**
 * Sorts and groups catalog items alphabetically.
 * Uses '#' for non-alphabetical leading characters.
 * @param {Array<{ id: number, name: string, manga_count?: number }>} items
 * @returns {Array<{ letter: string, items: Array }>}
 */
export function groupItemsAlphabetically(items) {
  if (!items || !Array.isArray(items) || items.length === 0) return [];

  // Sort case-insensitively while preserving original displayed name
  const sorted = [...items].sort((a, b) => {
    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true });
  });

  const groupsMap = new Map();

  sorted.forEach(item => {
    const trimmed = (item.name || '').trim();
    if (!trimmed) return;

    // Normalize first character to strip accents (e.g. Á -> A)
    const firstChar = trimmed[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const isAlpha = /^[A-Z]$/.test(firstChar);
    const key = isAlpha ? firstChar : '#';

    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key).push(item);
  });

  // Sort groups: A through Z first, then '#' at the end
  const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) => {
    if (a === '#' && b !== '#') return 1;
    if (b === '#' && a !== '#') return -1;
    return a.localeCompare(b);
  });

  return sortedKeys.map(letter => ({
    letter,
    items: groupsMap.get(letter)
  }));
}

// ==================== RENDERING ====================
/**
 * Ensures the static frame (header, add form, search bar, items container) is mounted into the section.
 * @param {string} canonicalType
 */
function ensureSectionFrameMounted(canonicalType) {
  const cfg = CATALOG_CONFIGS[canonicalType];
  if (!cfg) return null;

  const section = document.getElementById(cfg.sectionId);
  if (!section) return null;

  if (catalogState[canonicalType].isMounted && section.querySelector('.catalog-items-container')) {
    return section;
  }

  section.innerHTML = `
    <div class="settings-card-header catalog-header">
      <div class="settings-card-icon-title">
        <div class="settings-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${cfg.icon}
          </svg>
        </div>
        <div>
          <h3 class="settings-card-title">${cfg.title}</h3>
          <p class="settings-card-desc">${cfg.desc}</p>
        </div>
      </div>
      <div class="settings-card-actions">
        <button type="button" class="btn btn-primary btn-catalog-add" title="Crear nuevo ${cfg.typeLabel.toLowerCase()}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Añadir</span>
        </button>
      </div>
    </div>

    <div class="settings-card-body catalog-body">
      <!-- Inline Expandable Add Form -->
      <form class="catalog-add-form" style="display: none;">
        <div class="catalog-add-row">
          <input type="text" class="catalog-add-input" placeholder="${cfg.addPlaceholder}" autocomplete="off" required>
          <button type="submit" class="btn btn-primary btn-catalog-submit">
            <span>Guardar</span>
          </button>
          <button type="button" class="btn btn-secondary btn-catalog-cancel">
            <span>Cancelar</span>
          </button>
        </div>
      </form>

      <!-- Local Search Bar -->
      <div class="catalog-search-bar">
        <div class="catalog-search-input-wrap">
          <svg class="catalog-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" class="catalog-search-input" placeholder="${cfg.searchPlaceholder}" value="${escapeHtml(catalogState[canonicalType].query)}" autocomplete="off">
          <button type="button" class="catalog-search-clear-btn" style="display: ${catalogState[canonicalType].query ? 'flex' : 'none'};" title="Limpiar búsqueda">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="catalog-count-badge">
          <span class="catalog-total-count">0 ${cfg.pluralLabel.toLowerCase()}</span>
        </div>
      </div>

      <!-- Alphabetical Groups & Items List -->
      <div class="catalog-items-container">
        <!-- Injected dynamically -->
      </div>
    </div>
  `;

  // Attach event listeners for frame controls
  const addBtn = section.querySelector('.btn-catalog-add');
  const addForm = section.querySelector('.catalog-add-form');
  const addInput = section.querySelector('.catalog-add-input');
  const cancelBtn = section.querySelector('.btn-catalog-cancel');
  const searchInput = section.querySelector('.catalog-search-input');
  const clearBtn = section.querySelector('.catalog-search-clear-btn');

  // "Añadir" toggle
  addBtn?.addEventListener('click', () => {
    const isHidden = addForm.style.display === 'none';
    if (isHidden) {
      addForm.style.display = 'block';
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
    const val = addInput.value.trim();
    if (!val) return;
    try {
      await addItem(canonicalType, val);
      addInput.value = '';
      addForm.style.display = 'none';
    } catch (_) {
      // Error handled and shown via toast in addItem
    }
  });

  // Search input keystrokes
  searchInput?.addEventListener('input', (e) => {
    const q = e.target.value;
    catalogState[canonicalType].query = q;
    clearBtn.style.display = q ? 'flex' : 'none';
    renderCatalogItems(canonicalType);
  });

  // Clear search button
  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    catalogState[canonicalType].query = '';
    clearBtn.style.display = 'none';
    searchInput.focus();
    renderCatalogItems(canonicalType);
  });

  catalogState[canonicalType].isMounted = true;
  return section;
}

/**
 * Re-renders only the items list and count badge of a catalog, preserving the search input focus and DOM frame.
 * @param {string} canonicalType
 */
function renderCatalogItems(canonicalType) {
  const cfg = CATALOG_CONFIGS[canonicalType];
  if (!cfg) return;

  const section = document.getElementById(cfg.sectionId);
  if (!section) return;

  const container = section.querySelector('.catalog-items-container');
  const countEl = section.querySelector('.catalog-total-count');
  if (!container) return;

  const allItems = catalogState[canonicalType].items || [];
  const totalCount = allItems.length;
  const currentQuery = catalogState[canonicalType].query || '';
  const filtered = filterItems(allItems, currentQuery);
  const filteredCount = filtered.length;

  // Update count badge
  if (countEl) {
    if (currentQuery.trim()) {
      countEl.textContent = `${filteredCount} de ${totalCount} ${cfg.pluralLabel.toLowerCase()}`;
    } else {
      countEl.textContent = `${totalCount} ${totalCount === 1 ? cfg.typeLabel.toLowerCase() : cfg.pluralLabel.toLowerCase()}`;
    }
  }

  // 1. Empty state: No catalog items in DB at all
  if (totalCount === 0) {
    container.innerHTML = `
      <div class="catalog-empty-state">
        <div class="catalog-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${cfg.icon}
          </svg>
        </div>
        <h4 class="catalog-empty-title">${cfg.emptyTextTitle}</h4>
        <p class="catalog-empty-desc">${cfg.emptyTextDesc}</p>
        <button type="button" class="btn btn-primary btn-sm btn-empty-add">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>${cfg.addButtonLabel}</span>
        </button>
      </div>
    `;

    container.querySelector('.btn-empty-add')?.addEventListener('click', () => {
      const addForm = section.querySelector('.catalog-add-form');
      const addInput = section.querySelector('.catalog-add-input');
      if (addForm) {
        addForm.style.display = 'block';
        addInput?.focus();
      }
    });
    return;
  }

  // 2. Empty state: Search query returned zero matches
  if (filteredCount === 0) {
    container.innerHTML = `
      <div class="catalog-empty-state catalog-search-empty">
        <div class="catalog-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <h4 class="catalog-empty-title">Sin resultados coincidentes</h4>
        <p class="catalog-empty-desc">No se encontraron ${cfg.pluralLabel.toLowerCase()} que coincidan con "<strong>${escapeHtml(currentQuery)}</strong>".</p>
        <button type="button" class="btn btn-secondary btn-sm btn-catalog-clear-search">
          Limpiar búsqueda
        </button>
      </div>
    `;

    container.querySelector('.btn-catalog-clear-search')?.addEventListener('click', () => {
      setCatalogSearch(canonicalType, '');
    });
    return;
  }

  // 3. Render Alphabetical Groups
  const groups = groupItemsAlphabetically(filtered);
  const fragment = document.createDocumentFragment();

  groups.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'catalog-letter-group';
    groupEl.dataset.letter = group.letter;

    groupEl.innerHTML = `
      <div class="catalog-letter-header">
        <span class="catalog-letter-char">${group.letter}</span>
        <div class="catalog-letter-divider"></div>
      </div>
      <div class="catalog-group-items"></div>
    `;

    const itemsContainer = groupEl.querySelector('.catalog-group-items');

    group.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'catalog-item-row';
      row.dataset.id = item.id;
      row.innerHTML = `
        <div class="catalog-item-name-wrap">
          <svg class="catalog-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${cfg.icon}
          </svg>
          <span class="catalog-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          ${item.manga_count !== undefined && item.manga_count !== null && item.manga_count > 0 ? `<span class="catalog-item-badge" title="${item.manga_count} mangas asociados">${item.manga_count}</span>` : ''}
        </div>
        <div class="catalog-item-actions">
          <button type="button" class="btn btn-secondary btn-sm btn-catalog-rename" data-id="${item.id}" title="Renombrar ${cfg.typeLabel.toLowerCase()}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span>Renombrar</span>
          </button>
          <button type="button" class="btn btn-danger btn-sm btn-catalog-delete" data-id="${item.id}" title="Eliminar ${cfg.typeLabel.toLowerCase()}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
            <span>Eliminar</span>
          </button>
        </div>
      `;

      row.querySelector('.btn-catalog-rename')?.addEventListener('click', () => {
        openRenameModal({
          type: canonicalType,
          id: item.id,
          currentName: item.name,
          typeLabel: cfg.typeLabel
        });
      });

      row.querySelector('.btn-catalog-delete')?.addEventListener('click', () => {
        deleteItem(canonicalType, item.id, item.name);
      });

      itemsContainer.appendChild(row);
    });

    fragment.appendChild(groupEl);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

// ==================== PUBLIC API ====================
/**
 * Renders the given catalog into its dedicated section.
 * Loads items from API if not yet loaded.
 * @param {string} type - 'author' | 'tag' | 'language' | 'parody' | 'group'
 */
export async function renderCatalog(type) {
  const canonicalType = resolveType(type);
  const cfg = CATALOG_CONFIGS[canonicalType];
  if (!cfg) return;

  ensureSectionFrameMounted(canonicalType);

  if (catalogState[canonicalType].items === null) {
    try {
      const items = await cfg.fetchList();
      catalogState[canonicalType].items = Array.isArray(items) ? items : [];
    } catch (err) {
      console.error(`Error loading catalog ${canonicalType}:`, err);
      catalogState[canonicalType].items = [];
    }
  }

  renderCatalogItems(canonicalType);
}

/**
 * Re-fetches fresh data from API for the catalog and updates its view.
 * @param {string} type
 */
export async function refreshCatalog(type) {
  const canonicalType = resolveType(type);
  catalogState[canonicalType].items = null;
  const result = await renderCatalog(canonicalType);
  for (const fn of catalogChangeListeners) {
    try {
      fn(canonicalType);
    } catch (e) {
      console.error('Error in onCatalogChange callback:', e);
    }
  }
  return result;
}

/**
 * Ensures all 5 catalogs have their lists loaded in memory.
 */
export async function ensureAllCatalogsLoaded() {
  const types = ['author', 'tag', 'language', 'parody', 'group'];
  await Promise.all(types.map(t => {
    if (catalogState[t].items === null) {
      return renderCatalog(t);
    }
    return Promise.resolve();
  }));
}

/**
 * Sets search query for a specific catalog, applying local filter instantly without DB roundtrip.
 * @param {string} type
 * @param {string} query
 */
export function setCatalogSearch(type, query) {
  const canonicalType = resolveType(type);
  const cfg = CATALOG_CONFIGS[canonicalType];
  if (!cfg) return;

  catalogState[canonicalType].query = query || '';

  const section = document.getElementById(cfg.sectionId);
  if (section) {
    const input = section.querySelector('.catalog-search-input');
    const clearBtn = section.querySelector('.catalog-search-clear-btn');
    if (input && input.value !== query) {
      input.value = query || '';
    }
    if (clearBtn) {
      clearBtn.style.display = query ? 'flex' : 'none';
    }
  }

  renderCatalogItems(canonicalType);
}

/**
 * Gets current search query for a catalog.
 * @param {string} type
 * @returns {string}
 */
export function getCatalogSearch(type) {
  const canonicalType = resolveType(type);
  return catalogState[canonicalType]?.query || '';
}

/**
 * Gets cached items for a catalog.
 * @param {string} type
 * @returns {Array}
 */
export function getCatalogItems(type) {
  const canonicalType = resolveType(type);
  return catalogState[canonicalType]?.items || [];
}

/**
 * Adds a new item to the specified catalog.
 * @param {string} type
 * @param {string} name
 */
export async function addItem(type, name) {
  const canonicalType = resolveType(type);
  const cfg = CATALOG_CONFIGS[canonicalType];
  if (!cfg) return;

  const cleanName = (name || '').trim();
  if (!cleanName) {
    callbacks.showToast('El nombre no puede estar vacío');
    throw new Error('El nombre no puede estar vacío');
  }

  try {
    const newItem = await cfg.create(cleanName);
    callbacks.showToast(cfg.createdMsg(newItem.name));
    await refreshCatalog(canonicalType);

    if (typeof callbacks.refreshAdvSearch === 'function') {
      await callbacks.refreshAdvSearch(canonicalType);
    }
    if (callbacks.getActiveSeries && callbacks.getActiveSeries()) {
      await callbacks.reloadActiveSeries();
    }
    if (typeof callbacks.refreshSeries === 'function') {
      callbacks.refreshSeries(false);
    }
    return newItem;
  } catch (err) {
    callbacks.showToast(`Error: ${err.message}`);
    throw err;
  }
}

/**
 * Deletes an item from the specified catalog.
 * @param {string} type
 * @param {number} id
 * @param {string} name
 */
export async function deleteItem(type, id, name) {
  const canonicalType = resolveType(type);
  const cfg = CATALOG_CONFIGS[canonicalType];
  if (!cfg) return;

  if (confirm(cfg.confirmDeleteMsg(name))) {
    try {
      await cfg.delete(id);
      callbacks.showToast(cfg.deletedMsg(name));
      await refreshCatalog(canonicalType);

      if (typeof callbacks.refreshAdvSearch === 'function') {
        await callbacks.refreshAdvSearch(canonicalType);
      }
      if (callbacks.getActiveSeries && callbacks.getActiveSeries()) {
        await callbacks.reloadActiveSeries();
      }
      if (typeof callbacks.refreshSeries === 'function') {
        callbacks.refreshSeries(false);
      }
    } catch (err) {
      callbacks.showToast(`Error: ${err.message}`);
    }
  }
}

// ==================== DEDICATED RENAME MODAL INTEGRATION ====================
/**
 * Opens metadata rename modal.
 * @param {Object} config
 * @param {string} config.type - Catalog type or 'library'
 * @param {number} config.id
 * @param {string} config.currentName
 * @param {string} [config.typeLabel]
 * @param {Function} [config.onRenamed]
 */
export function openRenameModal({ type, id, currentName, typeLabel, onRenamed }) {
  pendingRename = { type, id, currentName, typeLabel, onRenamed };

  const modal = document.getElementById('modalRenameMetadata');
  const title = document.getElementById('renameModalTitle');
  const label = document.getElementById('renameModalLabel');
  const input = document.getElementById('renameModalInput');
  const error = document.getElementById('renameModalError');

  if (title) title.textContent = `Renombrar ${typeLabel || 'Metadato'}`;
  if (label) label.textContent = `Nuevo nombre para "${currentName}":`;
  if (input) input.value = currentName;
  if (error) {
    error.textContent = '';
    error.style.display = 'none';
  }
  if (modal) modal.style.display = 'flex';

  setTimeout(() => {
    if (input) {
      input.focus();
      input.select();
    }
  }, 50);
}

/**
 * Closes the rename modal.
 */
export function closeRenameModal() {
  const modal = document.getElementById('modalRenameMetadata');
  const error = document.getElementById('renameModalError');
  if (modal) modal.style.display = 'none';
  if (error) {
    error.textContent = '';
    error.style.display = 'none';
  }
  pendingRename = null;
}

/**
 * Returns true if the rename modal is currently open.
 * @returns {boolean}
 */
export function isRenameModalOpen() {
  const modal = document.getElementById('modalRenameMetadata');
  return !!(modal && modal.style.display !== 'none');
}

/**
 * Confirms rename operation.
 */
export async function handleConfirmRename() {
  if (!pendingRename) return;
  const { type, id, currentName, onRenamed } = pendingRename;
  const input = document.getElementById('renameModalInput');
  const error = document.getElementById('renameModalError');
  const newName = input ? input.value.trim() : '';

  if (!newName) {
    if (error) {
      error.textContent = 'El nombre no puede estar vacío.';
      error.style.display = 'block';
    }
    return;
  }

  if (newName === currentName) {
    closeRenameModal();
    return;
  }

  // Handle library renaming
  if (type === 'library') {
    try {
      await window.lecfalAPI.renameLibrary(id, newName);
      callbacks.showToast(`Biblioteca renombrada a "${newName}"`);
      closeRenameModal();
      if (typeof onRenamed === 'function') {
        await onRenamed(newName);
      }
    } catch (err) {
      console.error('Error renaming library:', err);
      if (error) {
        error.textContent = err.message || 'Error al renombrar biblioteca';
        error.style.display = 'block';
      } else {
        callbacks.showToast(`Error: ${err.message}`);
      }
    }
    return;
  }

  const canonicalType = resolveType(type);
  const cfg = CATALOG_CONFIGS[canonicalType];
  if (!cfg) return;

  try {
    await cfg.rename(id, newName);
    callbacks.showToast(cfg.renamedMsg(newName));
    closeRenameModal();
    await refreshCatalog(canonicalType);

    if (typeof callbacks.refreshAdvSearch === 'function') {
      await callbacks.refreshAdvSearch(canonicalType);
    }
    if (callbacks.getActiveSeries && callbacks.getActiveSeries()) {
      await callbacks.reloadActiveSeries();
    }
    if (typeof callbacks.refreshSeries === 'function') {
      callbacks.refreshSeries(false);
    }
    if (typeof onRenamed === 'function') {
      await onRenamed(newName);
    }
  } catch (err) {
    console.error('Error renaming metadata:', err);
    if (error) {
      error.textContent = err.message || 'Error al renombrar';
      error.style.display = 'block';
    } else {
      callbacks.showToast(`Error: ${err.message}`);
    }
  }
}

// ==================== INITIALIZATION ====================
/**
 * Initializes the Catalog Manager module and mounts the 5 catalog frames.
 * @param {Object} options
 * @param {Function} [options.showToast]
 * @param {Function} [options.refreshAdvSearch]
 * @param {Function} [options.reloadActiveSeries]
 * @param {Function} [options.refreshSeries]
 */
export async function initCatalogManager(options = {}) {
  callbacks = {
    showToast: options.showToast || (() => {}),
    refreshAdvSearch: options.refreshAdvSearch || (() => {}),
    reloadActiveSeries: options.reloadActiveSeries || (() => {}),
    refreshSeries: options.refreshSeries || (() => {}),
    onRenameLibrary: options.onRenameLibrary || (() => {})
  };

  // Wire up Rename Modal buttons
  const btnClose = document.getElementById('btnCloseRenameModal');
  const btnCancel = document.getElementById('btnCancelRenameModal');
  const btnConfirm = document.getElementById('btnConfirmRenameModal');
  const renameInput = document.getElementById('renameModalInput');
  const modalRename = document.getElementById('modalRenameMetadata');

  btnClose?.addEventListener('click', closeRenameModal);
  btnCancel?.addEventListener('click', closeRenameModal);
  btnConfirm?.addEventListener('click', handleConfirmRename);

  renameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeRenameModal();
    }
  });

  modalRename?.addEventListener('click', (e) => {
    if (e.target === modalRename) {
      closeRenameModal();
    }
  });

  // Mount the 5 catalog frames and load initial data
  const types = ['author', 'tag', 'language', 'parody', 'group'];
  for (const t of types) {
    ensureSectionFrameMounted(t);
  }

  // Preload catalog lists in parallel
  await Promise.all(types.map(t => renderCatalog(t)));
}

// Expose on window for programmatic access and test validation
if (typeof window !== 'undefined') {
  window.catalogManager = {
    initCatalogManager,
    renderCatalog,
    refreshCatalog,
    setCatalogSearch,
    getCatalogSearch,
    getCatalogItems,
    addItem,
    deleteItem,
    openRenameModal,
    closeRenameModal,
    isRenameModalOpen,
    handleConfirmRename,
    normalizeText,
    groupItemsAlphabetically,
    filterItems,
    CATALOG_CONFIGS,
    onCatalogChange,
    ensureAllCatalogsLoaded
  };
}
