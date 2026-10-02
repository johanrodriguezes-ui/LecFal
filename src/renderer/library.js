/**
 * Library Module for LecFal Renderer
 * 
 * Encapsulates Library-specific UI logic:
 * - Library state (seriesList, currentFilter, searchQuery, currentSort)
 * - Grid virtualization with GridVirtualizer & ThumbnailPrefetcher
 * - Comic card rendering, badging, and favorite toggling
 * - Search input, debouncing, and filter chip handlers
 * - Sort dropdown and grid item sizing (buttons & slider)
 * - Counters (All, CBZ, PDF, Favorites, and status bar)
 * - Empty states (no folders, no results)
 */

import GridVirtualizer from './grid-virtualizer.js';
import ThumbnailPrefetcher from './thumbnail-prefetcher.js';
import {
  escapeHtml,
  debounce,
  getCoverUrl,
  getGridThumbnailUrl,
  renderCoverFallbackHtml
} from './ui-utils.js';

// ==================== LIBRARY STATE ====================
let seriesList = [];
let currentFilter = 'all';
let searchQuery = '';
let currentSort = 'title_asc';
let gridVirtualizer = null;
let thumbnailPrefetcher = null;

// Throttled and concurrency-safe grid refreshing
let isRefreshingSeries = false;
let hasPendingSeriesRefresh = false;
let lastSeriesRefreshTime = 0;
let seriesRefreshTimer = null;

// ==================== DOM ELEMENTS CACHE ====================
const elements = {
  mainContent: null,
  comicsGrid: null,
  emptyStateNoFolders: null,
  emptyStateNoResults: null,
  searchInput: null,
  clearSearchBtn: null,
  btnResetFilters: null,
  btnSelectInitialFolder: null,
  sortSelect: null,
  sizeButtonGroup: null,
  sizeSlider: null,
  filterChips: [],
  countAll: null,
  countCbz: null,
  countPdf: null,
  countFav: null,
  statusCount: null
};

// ==================== EXTERNAL CALLBACKS & DEPS ====================
let callbacks = {
  openMangaView: () => {},
  getFolders: () => [],
  onAddFolder: () => {},
  getCurrentView: () => 'library',
  getActiveAdvFilters: () => ({}),
  onClearAdvancedSearch: () => {}
};

/**
 * Cache all Library-related DOM elements.
 */
function cacheElements() {
  elements.mainContent = document.getElementById('mainContent');
  elements.comicsGrid = document.getElementById('comicsGrid');
  elements.emptyStateNoFolders = document.getElementById('emptyStateNoFolders');
  elements.emptyStateNoResults = document.getElementById('emptyStateNoResults');
  elements.searchInput = document.getElementById('searchInput');
  elements.clearSearchBtn = document.getElementById('clearSearchBtn');
  elements.btnResetFilters = document.getElementById('btnResetFilters');
  elements.btnSelectInitialFolder = document.getElementById('btnSelectInitialFolder');
  elements.sortSelect = document.getElementById('sortSelect');
  elements.sizeButtonGroup = document.getElementById('sizeButtonGroup');
  elements.sizeSlider = document.getElementById('sizeSlider');
  elements.filterChips = document.querySelectorAll('.filter-chip');
  elements.countAll = document.getElementById('countAll');
  elements.countCbz = document.getElementById('countCbz');
  elements.countPdf = document.getElementById('countPdf');
  elements.countFav = document.getElementById('countFav');
  elements.statusCount = document.getElementById('statusCount');
}

// ==================== CARD TEMPLATING ====================
/**
 * Factory function creating a single series card DOM element (used by virtualizer).
 * @param {Object} series
 * @returns {HTMLElement}
 */
export function createSeriesCard(series) {
  const card = document.createElement('article');
  card.className = 'comic-card';
  card.dataset.id = series.id;
  card.tabIndex = 0;

  const isFav = series.favorite === 1;
  const formatUpper = (series.primary_format || 'CBZ').toUpperCase();
  const capsLabel = `${series.chapter_count} cap${series.chapter_count === 1 ? '' : 's'}`;

  let coverHtml = '';
  if (series.cover_path) {
    const gridUrl = getGridThumbnailUrl(series.cover_path);
    const fallbackUrl = getCoverUrl(series.cover_path);
    coverHtml = `<img class="card-cover-img" src="${gridUrl}" alt="${escapeHtml(series.title)}" loading="lazy" onerror="if(this.src!=='${escapeHtml(fallbackUrl)}'){this.src='${escapeHtml(fallbackUrl)}';}">`;
  } else {
    coverHtml = renderCoverFallbackHtml(series.title, series.primary_format);
  }

  card.innerHTML = `
    <div class="card-cover-wrapper">
      <span class="card-badge badge-${series.primary_format || 'cbz'}">${formatUpper}</span>
      <button class="card-fav-btn ${isFav ? 'is-favorite' : ''}" data-id="${series.id}" title="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}">
        <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
        </svg>
      </button>
      ${coverHtml}
      <div class="card-quick-overlay">
        <span class="quick-action-text">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Ver manga
        </span>
      </div>
    </div>
    <div class="card-details">
      <div class="card-title" title="${escapeHtml(series.title)}">${escapeHtml(series.title)}</div>
      <div class="card-meta-row">
        <span class="series-caps-count">${capsLabel}</span>
        <span>${escapeHtml(series.author || '')}</span>
      </div>
    </div>
  `;

  if (series.cover_path) {
    const imgEl = card.querySelector('.card-cover-img');
    if (imgEl) {
      imgEl.addEventListener('error', () => {
        const fallbackContainer = document.createElement('div');
        fallbackContainer.innerHTML = renderCoverFallbackHtml(series.title, series.primary_format);
        imgEl.replaceWith(fallbackContainer.firstElementChild);
      }, { once: true });
    }
  }

  return card;
}

// ==================== VIRTUALIZER ====================
/**
 * Get or create the GridVirtualizer instance.
 * @returns {GridVirtualizer}
 */
export function getGridVirtualizer() {
  if (!gridVirtualizer) {
    if (!thumbnailPrefetcher) {
      thumbnailPrefetcher = new ThumbnailPrefetcher({
        mode: 'none',
        maxConcurrency: 2,
        getThumbnailUrlFn: getGridThumbnailUrl
      });
      window.thumbnailPrefetcher = thumbnailPrefetcher;
    }

    gridVirtualizer = new GridVirtualizer({
      container: elements.comicsGrid,
      scrollContainer: elements.mainContent,
      createCardFn: createSeriesCard,
      prefetcher: thumbnailPrefetcher,
      onCardClick: (seriesId) => callbacks.openMangaView(seriesId),
      onFavoriteToggle: async (seriesId, favBtn) => {
        const newFavState = await window.lecfalAPI.toggleSeriesFavorite(seriesId);
        favBtn.classList.toggle('is-favorite', newFavState === 1);
        const heartSvg = favBtn.querySelector('svg');
        if (heartSvg) heartSvg.setAttribute('fill', newFavState === 1 ? 'currentColor' : 'none');

        const s = seriesList.find(item => item.id === seriesId);
        if (s) s.favorite = newFavState;
        updateCounters();
      }
    });
    window.gridVirtualizer = gridVirtualizer;
  }
  return gridVirtualizer;
}

/**
 * Render or update series dataset in the virtualized grid.
 * @param {Array} seriesArray
 * @param {boolean} resetScroll
 */
export function renderGrid(seriesArray, resetScroll = false) {
  const virtualizer = getGridVirtualizer();
  virtualizer.setDataset(seriesArray, resetScroll);
}

// ==================== COUNTERS ====================
/**
 * Update header filter chip counters for All, CBZ, PDF, and Favorites.
 */
export async function updateCounters() {
  const allSeries = await window.lecfalAPI.getSeries({ format: 'all' });
  let cbzCount = 0;
  let pdfCount = 0;
  let favCount = 0;

  for (const s of allSeries) {
    if (s.primary_format === 'cbz') cbzCount++;
    if (s.primary_format === 'pdf') pdfCount++;
    if (s.favorite) favCount++;
  }

  if (elements.countAll) elements.countAll.textContent = allSeries.length;
  if (elements.countCbz) elements.countCbz.textContent = cbzCount;
  if (elements.countPdf) elements.countPdf.textContent = pdfCount;
  if (elements.countFav) elements.countFav.textContent = favCount;
}

// ==================== SERIES REFRESH & SCHEDULING ====================
/**
 * Schedule a throttled series refresh during scanning or batch updates.
 * @param {boolean} immediate - If true, execute immediately
 */
export function scheduleSeriesRefresh(immediate = false) {
  if (immediate) {
    if (seriesRefreshTimer) clearTimeout(seriesRefreshTimer);
    seriesRefreshTimer = null;
    lastSeriesRefreshTime = Date.now();
    refreshSeries(false);
    return;
  }

  const now = Date.now();
  const timeSinceLast = now - lastSeriesRefreshTime;
  const MIN_INTERVAL = 1200; // at most once every 1.2s during scanning

  if (timeSinceLast >= MIN_INTERVAL) {
    lastSeriesRefreshTime = now;
    refreshSeries(false);
  } else if (!seriesRefreshTimer) {
    seriesRefreshTimer = setTimeout(() => {
      seriesRefreshTimer = null;
      lastSeriesRefreshTime = Date.now();
      const currentView = callbacks.getCurrentView ? callbacks.getCurrentView() : 'library';
      if (currentView === 'library') {
        refreshSeries(false);
      }
    }, MIN_INTERVAL - timeSinceLast);
  }
}

/**
 * Refresh the series list from database applying current filters, search, and sorting.
 * @param {boolean} resetScroll - Whether to scroll grid back to top
 */
export async function refreshSeries(resetScroll = true) {
  if (isRefreshingSeries) {
    hasPendingSeriesRefresh = true;
    return;
  }
  isRefreshingSeries = true;

  try {
    const activeAdv = callbacks.getActiveAdvFilters ? callbacks.getActiveAdvFilters() : {};
    const queryParams = {
      searchQuery,
      format: currentFilter === 'favorite' ? 'all' : currentFilter,
      favoriteOnly: currentFilter === 'favorite',
      sortBy: currentSort,
      advTitle: activeAdv.title || undefined,
      authorId: Array.isArray(activeAdv.authorId)
        ? (activeAdv.authorId.length > 0 ? activeAdv.authorId.map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : undefined)
        : (activeAdv.authorId ? parseInt(activeAdv.authorId, 10) : undefined),
      advAuthor: activeAdv.author || undefined,
      groupId: Array.isArray(activeAdv.groupId)
        ? (activeAdv.groupId.length > 0 ? activeAdv.groupId.map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : undefined)
        : (activeAdv.groupId ? parseInt(activeAdv.groupId, 10) : undefined),
      advGroup: activeAdv.group || undefined,
      parodyId: Array.isArray(activeAdv.parodyId)
        ? (activeAdv.parodyId.length > 0 ? activeAdv.parodyId.map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : undefined)
        : (activeAdv.parodyId ? parseInt(activeAdv.parodyId, 10) : undefined),
      advParody: activeAdv.parody || undefined,
      tagId: Array.isArray(activeAdv.tagId)
        ? (activeAdv.tagId.length > 0 ? activeAdv.tagId.map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : undefined)
        : (activeAdv.tagId ? parseInt(activeAdv.tagId, 10) : undefined),
      languageId: activeAdv.languageId ? parseInt(activeAdv.languageId, 10) : undefined,
      advLanguage: activeAdv.language || undefined
    };

    seriesList = await window.lecfalAPI.getSeries(queryParams);
    window.seriesList = seriesList;

    await updateCounters();

    const folders = callbacks.getFolders ? callbacks.getFolders() : [];

    if (folders.length === 0) {
      if (elements.emptyStateNoFolders) elements.emptyStateNoFolders.style.display = 'flex';
      if (elements.emptyStateNoResults) elements.emptyStateNoResults.style.display = 'none';
      if (elements.comicsGrid) elements.comicsGrid.style.display = 'none';
      if (elements.statusCount) elements.statusCount.textContent = '0 mangas';
      return;
    }

    if (elements.emptyStateNoFolders) elements.emptyStateNoFolders.style.display = 'none';

    if (seriesList.length === 0) {
      if (elements.emptyStateNoResults) elements.emptyStateNoResults.style.display = 'flex';
      if (elements.comicsGrid) elements.comicsGrid.style.display = 'none';
      if (elements.statusCount) elements.statusCount.textContent = '0 mangas';
      return;
    }

    if (elements.emptyStateNoResults) elements.emptyStateNoResults.style.display = 'none';
    if (elements.comicsGrid) elements.comicsGrid.style.display = 'block';
    if (elements.statusCount) {
      elements.statusCount.textContent = `${seriesList.length} manga${seriesList.length === 1 ? '' : 's'}`;
    }

    const shouldReset = (typeof resetScroll === 'boolean') ? resetScroll : true;
    renderGrid(seriesList, shouldReset);
  } catch (err) {
    console.error('Error refreshing series:', err);
  } finally {
    isRefreshingSeries = false;
    if (hasPendingSeriesRefresh) {
      hasPendingSeriesRefresh = false;
      scheduleSeriesRefresh(false);
    }
  }
}

// ==================== GRID SIZE CONTROLS ====================
/**
 * Apply min-width CSS variable for grid items and update slider/buttons.
 * @param {number} pxVal
 * @param {boolean} save - Whether to persist setting
 */
export function applyGridSize(pxVal, save = true) {
  document.documentElement.style.setProperty('--grid-item-min-width', `${pxVal}px`);
  if (elements.sizeSlider) elements.sizeSlider.value = pxVal;

  document.querySelectorAll('.size-btn').forEach(btn => btn.classList.remove('active'));
  if (pxVal <= 145) {
    document.querySelector('.size-btn[data-size="small"]')?.classList.add('active');
  } else if (pxVal >= 230) {
    document.querySelector('.size-btn[data-size="large"]')?.classList.add('active');
  } else {
    document.querySelector('.size-btn[data-size="medium"]')?.classList.add('active');
  }

  if (gridVirtualizer) {
    gridVirtualizer.handleResize();
  }

  if (save) {
    window.lecfalAPI.setSetting('grid_size', pxVal);
  }
}

// ==================== SEARCH & FILTER HELPERS ====================
/**
 * Focus and select text in the library search input.
 */
export function focusSearchInput() {
  if (elements.searchInput) {
    elements.searchInput.focus();
    elements.searchInput.select();
  }
}

/**
 * Clear the library search input and state.
 */
export function clearSearch() {
  if (elements.searchInput) elements.searchInput.value = '';
  searchQuery = '';
  if (elements.clearSearchBtn) elements.clearSearchBtn.style.display = 'none';
}

/**
 * Check whether a search query is currently active.
 * @returns {boolean}
 */
export function hasSearchQuery() {
  return !!searchQuery;
}

/**
 * Reset all library filters (search and format chip) back to default.
 */
export function resetLibraryFilters() {
  clearSearch();
  currentFilter = 'all';
  if (elements.filterChips) {
    elements.filterChips.forEach(c => c.classList.remove('active'));
  }
  document.querySelector('.filter-chip[data-filter="all"]')?.classList.add('active');
}

// ==================== GETTERS ====================
export function getSeriesList() {
  return seriesList;
}

export function getCurrentFilter() {
  return currentFilter;
}

export function getSearchQuery() {
  return searchQuery;
}

export function getCurrentSort() {
  return currentSort;
}

// ==================== EVENT LISTENERS ====================
function setupLibraryEventListeners() {
  const debouncedRefresh = debounce(() => refreshSeries(), 200);

  // Search input
  elements.searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    if (elements.clearSearchBtn) {
      elements.clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
    }
    debouncedRefresh();
  });

  // Clear search button
  elements.clearSearchBtn?.addEventListener('click', () => {
    clearSearch();
    refreshSeries();
  });

  // Reset filters button
  elements.btnResetFilters?.addEventListener('click', () => {
    resetLibraryFilters();
    if (callbacks.onClearAdvancedSearch) {
      callbacks.onClearAdvancedSearch();
    }
  });

  // Initial folder button in empty state
  elements.btnSelectInitialFolder?.addEventListener('click', () => {
    callbacks.onAddFolder?.();
  });

  // Filter chips
  elements.filterChips?.forEach(chip => {
    chip.addEventListener('click', () => {
      elements.filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      refreshSeries();
    });
  });

  // Sort dropdown
  elements.sortSelect?.addEventListener('change', async (e) => {
    currentSort = e.target.value;
    await window.lecfalAPI.setSetting('sort_order', currentSort);
    refreshSeries();
  });

  // Grid size buttons
  elements.sizeButtonGroup?.addEventListener('click', (e) => {
    const btn = e.target.closest('.size-btn');
    if (!btn) return;
    const sizeType = btn.dataset.size;
    let pxVal = 185;
    if (sizeType === 'small') pxVal = 135;
    if (sizeType === 'medium') pxVal = 185;
    if (sizeType === 'large') pxVal = 260;

    applyGridSize(pxVal, true);
  });

  // Size slider
  elements.sizeSlider?.addEventListener('input', (e) => {
    const pxVal = parseInt(e.target.value, 10);
    applyGridSize(pxVal, false);
  });

  elements.sizeSlider?.addEventListener('change', async (e) => {
    const pxVal = parseInt(e.target.value, 10);
    await window.lecfalAPI.setSetting('grid_size', pxVal);
  });
}

// ==================== INITIALIZATION ====================
/**
 * Initialize Library module.
 * @param {Object} options
 * @param {Function} options.openMangaView
 * @param {Function} options.getFolders
 * @param {Function} options.onAddFolder
 * @param {Function} options.getCurrentView
 * @param {Function} options.getActiveAdvFilters
 * @param {Function} options.onClearAdvancedSearch
 */
export function initLibrary(options = {}) {
  callbacks = { ...callbacks, ...options };
  cacheElements();
  setupLibraryEventListeners();

  // Expose renderGrid on window for canonical test suites
  window.renderGrid = renderGrid;

  // Initialize virtualizer early to satisfy test invariant lookups
  getGridVirtualizer();
}

/**
 * Load saved grid size and sort order preferences from settings.
 */
export async function loadLibraryPreferences() {
  try {
    const savedSize = await window.lecfalAPI.getSetting('grid_size', 185);
    applyGridSize(savedSize, false);

    const savedSort = await window.lecfalAPI.getSetting('sort_order', 'title_asc');
    currentSort = savedSort;
    if (elements.sortSelect) elements.sortSelect.value = savedSort;
  } catch (err) {
    console.warn('Could not load library grid preferences:', err);
  }
}
