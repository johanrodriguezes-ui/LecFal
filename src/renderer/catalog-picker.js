/**
 * Universal Catalog Picker Modal Module for LecFal Renderer
 * 
 * Manages the modal dialog for assigning centralized metadata
 * (tags, authors, groups, languages, parodies) to a manga series.
 * Encapsulates modal DOM controls, search filter, selection state,
 * chip rendering, and IPC updates.
 */

import { escapeHtml } from './ui-utils.js';

// ==================== LOCAL STATE ====================
let currentPickerType = 'tag'; // 'tag' | 'author' | 'group' | 'language' | 'parody'
const pickerSelectedIds = new Set();
let pickerSearchText = '';
let currentPickerCatalog = [];

// ==================== DOM ELEMENTS CACHE ====================
const elements = {
  modalCatalogPicker: null,
  modalCatalogPickerTitle: null,
  modalCatalogPickerDesc: null,
  btnCloseCatalogPicker: null,
  btnCancelCatalogPicker: null,
  btnSaveCatalogPicker: null,
  inputFilterCatalogPicker: null,
  catalogPickerChipsContainer: null,
  catalogPickerEmpty: null,
  catalogPickerEmptyText: null,
  btnGoToSettingsFromPicker: null
};

// ==================== EXTERNAL CALLBACKS & DEPS ====================
let getActiveSeries = () => null;
let callbacks = {
  showToast: () => {},
  refreshSeries: () => {},
  onGoToSettings: () => {}
};
let onMetadataUpdated = {
  tag: () => {},
  author: () => {},
  group: () => {},
  language: () => {},
  parody: () => {}
};

// ==================== CATALOG TYPE DESCRIPTORS ====================
const CATALOG_TYPES = {
  tag: {
    title: 'Asignar Tags / Géneros',
    desc: 'Selecciona los tags que deseas asignar a este manga. Todos los tags provienen de la configuración centralizada de la biblioteca.',
    filterPlaceholder: 'Filtrar tags disponibles...',
    emptyText: 'No hay tags creados aún en la biblioteca.',
    fetchList: () => window.lecfalAPI.getAllTags(),
    getAssignedList: (series) => series.tags_list || [],
    getFallbackString: (series) => series.tags || '',
    save: async (seriesId, ids) => window.lecfalAPI.setSeriesTags({ seriesId, tagIds: ids }),
    applyUpdate: (series, updated) => {
      series.tags_list = updated;
      series.tags = updated.map(t => t.name).join(', ');
    },
    successMessage: 'Tags actualizados correctamente'
  },
  author: {
    title: 'Asignar Autores',
    desc: 'Selecciona uno o más autores del catálogo configurado para este manga.',
    filterPlaceholder: 'Filtrar autores disponibles...',
    emptyText: 'No hay autores creados aún en la biblioteca.',
    fetchList: () => window.lecfalAPI.getAllAuthors(),
    getAssignedList: (series) => series.authors_list || [],
    getFallbackString: (series) => (series.author && series.author !== 'Desconocido') ? series.author : '',
    save: async (seriesId, ids) => window.lecfalAPI.setSeriesAuthors({ seriesId, authorIds: ids }),
    applyUpdate: (series, updated) => {
      series.authors_list = updated;
      series.author = updated.length > 0 ? updated.map(a => a.name).join(', ') : 'Desconocido';
    },
    successMessage: 'Autores actualizados correctamente'
  },
  group: {
    title: 'Asignar Grupos / Círculos',
    desc: 'Selecciona uno o más grupos o círculos del catálogo configurado para este manga.',
    filterPlaceholder: 'Filtrar grupos disponibles...',
    emptyText: 'No hay grupos creados aún en la biblioteca.',
    fetchList: () => window.lecfalAPI.getAllGroups(),
    getAssignedList: (series) => series.groups_list || [],
    getFallbackString: (series) => {
      const g = series.group_name || series.group;
      return (g && g !== 'Sin grupo / círculo') ? g : '';
    },
    save: async (seriesId, ids) => window.lecfalAPI.setSeriesGroups({ seriesId, groupIds: ids }),
    applyUpdate: (series, updated) => {
      series.groups_list = updated;
      series.group = updated.length > 0 ? updated.map(g => g.name).join(', ') : 'Sin grupo / círculo';
      series.group_name = series.group;
    },
    successMessage: 'Grupos actualizados correctamente'
  },
  language: {
    title: 'Asignar Idiomas',
    desc: 'Selecciona los idiomas disponibles para este manga.',
    filterPlaceholder: 'Filtrar idiomas disponibles...',
    emptyText: 'No hay idiomas creados aún en la biblioteca.',
    fetchList: () => window.lecfalAPI.getAllLanguages(),
    getAssignedList: (series) => series.languages_list || [],
    getFallbackString: (series) => (series.language && series.language !== 'Sin idioma asignado') ? series.language : '',
    save: async (seriesId, ids) => window.lecfalAPI.setSeriesLanguages({ seriesId, languageIds: ids }),
    applyUpdate: (series, updated) => {
      series.languages_list = updated;
      series.language = updated.map(l => l.name).join(', ');
    },
    successMessage: 'Idiomas actualizados correctamente'
  },
  parody: {
    title: 'Asignar Series / Parodias',
    desc: 'Selecciona la serie, universo o parodia correspondiente a este manga.',
    filterPlaceholder: 'Filtrar series o parodias disponibles...',
    emptyText: 'No hay series o parodias creadas aún en la biblioteca.',
    fetchList: () => window.lecfalAPI.getAllParodies(),
    getAssignedList: (series) => series.parodies_list || [],
    getFallbackString: (series) => (series.parody && series.parody !== 'Sin serie / parodia') ? series.parody : '',
    save: async (seriesId, ids) => window.lecfalAPI.setSeriesParodies({ seriesId, parodyIds: ids }),
    applyUpdate: (series, updated) => {
      series.parodies_list = updated;
      series.parody = updated.map(p => p.name).join(', ');
    },
    successMessage: 'Series / Parodias actualizadas correctamente'
  }
};

/**
 * Normalize an ID to a number if convertible, otherwise preserve raw value.
 * @param {*} id - Raw catalog ID
 * @returns {number|string|null} Normalized ID
 */
function normalizeCatalogId(id) {
  if (id === null || id === undefined) return null;
  const num = Number(id);
  return isNaN(num) ? id : num;
}

/**
 * Render selectable chips based on current catalog and search filter text.
 */
function renderCatalogPickerChips() {
  const container = elements.catalogPickerChipsContainer;
  if (!container) return;
  container.innerHTML = '';
  const filter = pickerSearchText.toLowerCase();

  const matchingItems = currentPickerCatalog.filter(item => 
    !filter || item.name.toLowerCase().includes(filter)
  );

  if (matchingItems.length === 0) {
    container.innerHTML = '<div style="color: var(--text-dim); font-size: 0.88rem; padding: 12px; width: 100%; text-align: center;">No hay elementos coincidentes con la búsqueda</div>';
    return;
  }

  matchingItems.forEach(item => {
    const chip = document.createElement('button');
    chip.type = 'button';
    const normId = normalizeCatalogId(item.id);
    const isSelected = pickerSelectedIds.has(normId);
    chip.className = `tag-picker-chip ${isSelected ? 'selected is-selected' : ''}`;
    chip.dataset.id = String(item.id);
    chip.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    chip.setAttribute('title', isSelected ? `${item.name} (seleccionado)` : item.name);
    chip.innerHTML = `
      <span class="chip-check-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </span>
      <span class="chip-label">${escapeHtml(item.name)}</span>
    `;

    chip.addEventListener('click', () => {
      if (pickerSelectedIds.has(normId)) {
        pickerSelectedIds.delete(normId);
        chip.classList.remove('selected', 'is-selected');
        chip.setAttribute('aria-pressed', 'false');
        chip.setAttribute('title', item.name);
      } else {
        pickerSelectedIds.add(normId);
        chip.classList.add('selected', 'is-selected');
        chip.setAttribute('aria-pressed', 'true');
        chip.setAttribute('title', `${item.name} (seleccionado)`);
      }
    });

    container.appendChild(chip);
  });
}

/**
 * Open the universal catalog picker modal for a given metadata type.
 * @param {'tag'|'author'|'group'|'language'|'parody'} type - Metadata type
 */
export async function openCatalogPicker(type) {
  const activeSeries = getActiveSeries ? getActiveSeries() : null;
  if (!activeSeries || !elements.modalCatalogPicker) return;

  const config = CATALOG_TYPES[type];
  if (!config) return;

  currentPickerType = type;
  pickerSelectedIds.clear();
  pickerSearchText = '';
  if (elements.inputFilterCatalogPicker) elements.inputFilterCatalogPicker.value = '';

  if (elements.modalCatalogPickerTitle) elements.modalCatalogPickerTitle.textContent = config.title;
  if (elements.modalCatalogPickerDesc) elements.modalCatalogPickerDesc.textContent = config.desc;
  if (elements.inputFilterCatalogPicker) elements.inputFilterCatalogPicker.placeholder = config.filterPlaceholder;
  if (elements.catalogPickerEmptyText) elements.catalogPickerEmptyText.textContent = config.emptyText;

  try {
    currentPickerCatalog = await config.fetchList();
    const currentAssigned = config.getAssignedList(activeSeries);
    if (Array.isArray(currentAssigned)) {
      currentAssigned.forEach(item => {
        if (item.id != null) {
          pickerSelectedIds.add(normalizeCatalogId(item.id));
        } else if (item.name) {
          const match = currentPickerCatalog.find(c => c.name.toLowerCase() === item.name.trim().toLowerCase());
          if (match && match.id != null) {
            pickerSelectedIds.add(normalizeCatalogId(match.id));
          }
        }
      });
    }

    // Fallback: If no assigned IDs found yet, check comma-separated string on activeSeries
    if (pickerSelectedIds.size === 0) {
      const rawString = config.getFallbackString(activeSeries);
      if (rawString && typeof rawString === 'string') {
        const parts = rawString.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        currentPickerCatalog.forEach(catalogItem => {
          if (parts.includes(catalogItem.name.toLowerCase())) {
            pickerSelectedIds.add(normalizeCatalogId(catalogItem.id));
          }
        });
      }
    }

    if (currentPickerCatalog.length === 0) {
      if (elements.catalogPickerEmpty) elements.catalogPickerEmpty.style.display = 'block';
      if (elements.catalogPickerChipsContainer) elements.catalogPickerChipsContainer.style.display = 'none';
    } else {
      if (elements.catalogPickerEmpty) elements.catalogPickerEmpty.style.display = 'none';
      if (elements.catalogPickerChipsContainer) elements.catalogPickerChipsContainer.style.display = 'flex';
      renderCatalogPickerChips();
    }

    elements.modalCatalogPicker.style.display = 'flex';
    if (currentPickerCatalog.length > 0 && elements.inputFilterCatalogPicker) {
      elements.inputFilterCatalogPicker.focus();
    }
  } catch (err) {
    console.error('Error opening catalog picker modal:', err);
  }
}

/**
 * Close the universal catalog picker modal and clear transient state.
 */
export function closeCatalogPickerModal() {
  if (elements.modalCatalogPicker) elements.modalCatalogPicker.style.display = 'none';
  pickerSelectedIds.clear();
  currentPickerCatalog = [];
  pickerSearchText = '';
  if (elements.inputFilterCatalogPicker) elements.inputFilterCatalogPicker.value = '';
}

/**
 * Check whether the catalog picker modal is currently visible.
 * @returns {boolean} True if open
 */
export function isCatalogPickerOpen() {
  return !!(elements.modalCatalogPicker && elements.modalCatalogPicker.style.display !== 'none');
}

/**
 * Persist the current picker selections for activeSeries and trigger view refreshes.
 */
export async function handleSaveCatalogPicker() {
  const activeSeries = getActiveSeries ? getActiveSeries() : null;
  if (!activeSeries) return;
  const config = CATALOG_TYPES[currentPickerType];
  if (!config) return;

  const selectedIds = Array.from(pickerSelectedIds);

  try {
    const updated = await config.save(activeSeries.id, selectedIds);
    config.applyUpdate(activeSeries, updated);

    const onUpdate = onMetadataUpdated[currentPickerType];
    if (typeof onUpdate === 'function') {
      onUpdate(activeSeries);
    }

    if (callbacks.showToast) {
      callbacks.showToast(config.successMessage);
    }

    closeCatalogPickerModal();

    if (callbacks.refreshSeries) {
      callbacks.refreshSeries();
    }
  } catch (err) {
    console.error('Error saving catalog picker:', err);
    if (callbacks.showToast) {
      callbacks.showToast(`Error al guardar: ${err.message}`);
    }
  }
}

/**
 * Initialize the Catalog Picker module with DOM bindings and external dependencies.
 * @param {Object} options
 * @param {Function} options.getActiveSeries - Getter returning current activeSeries
 * @param {Function} [options.showToast] - Toast notification function
 * @param {Function} [options.refreshSeries] - Library series refresh function
 * @param {Function} [options.onGoToSettings] - Navigation handler to switch to Settings tab
 * @param {Object} [options.onMetadataUpdated] - Map of type -> callback(series) to re-render detail chips
 */
export function initCatalogPicker(options = {}) {
  if (typeof options.getActiveSeries === 'function') {
    getActiveSeries = options.getActiveSeries;
  }
  callbacks = {
    showToast: options.showToast || (() => {}),
    refreshSeries: options.refreshSeries || (() => {}),
    onGoToSettings: options.onGoToSettings || (() => {})
  };
  if (options.onMetadataUpdated) {
    onMetadataUpdated = { ...onMetadataUpdated, ...options.onMetadataUpdated };
  }

  // Bind DOM element references
  elements.modalCatalogPicker = document.getElementById('modalCatalogPicker');
  elements.modalCatalogPickerTitle = document.getElementById('modalCatalogPickerTitle');
  elements.modalCatalogPickerDesc = document.getElementById('modalCatalogPickerDesc');
  elements.btnCloseCatalogPicker = document.getElementById('btnCloseCatalogPicker');
  elements.btnCancelCatalogPicker = document.getElementById('btnCancelCatalogPicker');
  elements.btnSaveCatalogPicker = document.getElementById('btnSaveCatalogPicker');
  elements.inputFilterCatalogPicker = document.getElementById('inputFilterCatalogPicker');
  elements.catalogPickerChipsContainer = document.getElementById('catalogPickerChipsContainer');
  elements.catalogPickerEmpty = document.getElementById('catalogPickerEmpty');
  elements.catalogPickerEmptyText = document.getElementById('catalogPickerEmptyText');
  elements.btnGoToSettingsFromPicker = document.getElementById('btnGoToSettingsFromPicker');

  // Register event listeners
  elements.btnCloseCatalogPicker?.addEventListener('click', closeCatalogPickerModal);
  elements.btnCancelCatalogPicker?.addEventListener('click', closeCatalogPickerModal);
  elements.btnSaveCatalogPicker?.addEventListener('click', handleSaveCatalogPicker);
  elements.btnGoToSettingsFromPicker?.addEventListener('click', () => {
    closeCatalogPickerModal();
    if (typeof callbacks.onGoToSettings === 'function') {
      callbacks.onGoToSettings('tags');
    }
  });
  elements.inputFilterCatalogPicker?.addEventListener('input', (e) => {
    pickerSearchText = e.target.value.trim();
    renderCatalogPickerChips();
  });
  elements.modalCatalogPicker?.addEventListener('click', (e) => {
    if (e.target === elements.modalCatalogPicker) {
      closeCatalogPickerModal();
    }
  });
}
