import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.min.mjs';
import webtoonReader from './reader/reader.js';
import {
  escapeHtml,
  showToast
} from './utils/ui-utils.js';
import {
  initHistory,
  loadAndRenderHistory
} from './history/history.js';
import {
  initLibrary,
  loadLibraryPreferences,
  refreshSeries,
  scheduleSeriesRefresh,
  focusSearchInput,
  clearSearch,
  hasSearchQuery,
  isLibraryDropdownOpen,
  closeLibraryDropdown,
  getGridVirtualizer,
  setAdvSearchWaiting
} from './library/library.js';
import {
  initCatalogPicker,
  openCatalogPicker,
  closeCatalogPickerModal,
  handleSaveCatalogPicker,
  isCatalogPickerOpen
} from './settings/catalog-picker.js';
import {
  initAdvancedSearch,
  populateAdvSearchOptions,
  populateAdvSearchTags,
  populateAdvSearchAuthors,
  populateAdvSearchGroups,
  populateAdvSearchLanguages,
  populateAdvSearchParodies,
  hasActiveAdvFilters,
  getActiveAdvFilters,
  isAdvSearchPanelOpen,
  toggleAdvancedSearchPanel,
  handleClearAdvancedSearch
} from './library/advanced-search.js';
import {
  initSettings,
  renderAllSettings,
  renderSettingsFolders,
  renderSettingsIgnoredAuthors,
  refreshCatalog,
  applyTheme,
  applyLanguage,
  isRenameModalOpen,
  closeRenameModal,
  isCreateLibraryModalOpen,
  closeCreateLibraryModal,
  switchSettingsSection,
  getCurrentSettingsSection
} from './settings/settings.js';
import { initI18n, onLanguageChange, getLanguage, t } from './utils/i18n.js';
import {
  initScannerUI,
  runFolderScan,
  runAllScan,
  updateRescanButtonVisibility
} from './components/scanner-ui.js';
import {
  initDetail,
  renderMangaDetail,
  setDetailBackTarget,
  reloadActiveSeries,
  getActiveSeries,
  clearActiveSeries,
  syncChapterRead,
  isEditFieldModalOpen,
  closeEditFieldModal,
  focusChapterFilter,
  updateDetailMetadata
} from './detail/detail.js';

// Configure PDF.js worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
} catch (e) {
  console.warn('PDF.js worker could not be configured:', e);
}

// ==================== APPLICATION STATE ====================
let folders = [];

// Current Active View: 'library', 'manga', 'settings', or 'history'
let currentView = 'library';
let lastTopLevelView = 'library';

// Manga Detail navigation origin: 'library' | 'history'.
// Determines the label and destination of the Detail back button.
let detailOrigin = 'library';
// Scroll offset of the History view captured when opening Detail from History
let historyScrollTop = 0;

// Grid navigation & scroll restoration tracking
let lastInteractedSeriesId = null;
let savedLibraryScrollTop = 0;

// ==================== DOM ELEMENTS ====================
// Views
const topNav = document.getElementById('topNav');
const libraryView = document.getElementById('libraryView');
const mangaView = document.getElementById('mangaView');
const settingsView = document.getElementById('settingsView');
const readerView = document.getElementById('readerView');
const historyView = document.getElementById('historyView');
const navSearchContainer = document.getElementById('navSearchContainer');
const brandHomeBtn = document.getElementById('brandHomeBtn');
const navTabLibrary = document.getElementById('navTabLibrary');
const navTabHistory = document.getElementById('navTabHistory');

// Settings Navigation & Sections
const btnOpenSettings = document.getElementById('btnOpenSettings');
const btnBackFromSettings = document.getElementById('btnBackFromSettings');

// Modals
const modalFolders = document.getElementById('modalFolders');
const foldersList = document.getElementById('foldersList');
const btnCloseModalFolders = document.getElementById('btnCloseModalFolders');
const btnModalCloseDone = document.getElementById('btnModalCloseDone');
const btnAddAnotherFolder = document.getElementById('btnAddAnotherFolder');
const statusFolderCount = document.getElementById('statusFolderCount');

// ==================== INITIALIZATION ====================
async function init() {
  setupEventListeners();

  initLibrary({
    openMangaView: (seriesId) => openMangaView(seriesId, { source: 'library' }),
    getFolders: () => folders,
    onAddFolder: () => handleAddFolder(),
    getCurrentView: () => currentView,
    getActiveAdvFilters: () => getActiveAdvFilters(),
    onClearAdvancedSearch: () => handleClearAdvancedSearch(),
    onOpenSettings: (sectionId) => openSettingsView(sectionId)
  });

  initScannerUI({
    refreshSeries: (immediate) => scheduleSeriesRefresh(immediate),
    refreshFolders,
    getFolders: () => folders,
    onSeriesBatch: () => {
      if (currentView === 'library') {
        scheduleSeriesRefresh(false);
      }
    }
  });

  initDetail({
    navigateToLibrary: (options) => navigateToLibrary(options || { preservePosition: false }),
    navigateBack: () => navigateBackFromDetail(),
    openReader,
    refreshSeries: (preserveScroll) => refreshSeries(preserveScroll),
    openCatalogPicker: (type) => openCatalogPicker(type),
    refreshAdvSearch: (type) => {
      if (type === 'author') return populateAdvSearchAuthors();
      if (type === 'tag') return populateAdvSearchTags();
      if (type === 'group') return populateAdvSearchGroups();
      if (type === 'language') return populateAdvSearchLanguages();
      if (type === 'parody') return populateAdvSearchParodies();
      return populateAdvSearchOptions();
    },
    refreshCatalog: (type) => refreshCatalog(type),
    refreshIgnoredAuthors: () => renderSettingsIgnoredAuthors(),
    showToast
  });

  // Initialize History module
  initHistory({
    openReader: (chapterId) => openReader(chapterId),
    openMangaView: (seriesId) => openMangaView(seriesId, { source: 'history' }),
    showToast
  });

  // Initialize Webtoon reader
  webtoonReader.init({
    pdfjsLib,
    onClose: (closedChapter) => {
      const series = getActiveSeries();
      if (series) {
        openMangaView(series.id);
      } else if (lastTopLevelView === 'history') {
        navigateToHistory();
      } else if (closedChapter && (closedChapter.seriesId || closedChapter.series_id)) {
        openMangaView(closedChapter.seriesId || closedChapter.series_id);
      } else {
        navigateToLibrary();
      }
    },
    onChapterChange: (chapterId) => {
      // Keep active chapters in sync
    },
    onMarkRead: (chapterId) => {
      syncChapterRead(chapterId);
    }
  });

  window.webtoonReader = webtoonReader;
  window.openReader = openReader;
  window.navigateToLibrary = navigateToLibrary;
  window.navigateToHistory = navigateToHistory;

  // Load preferences
  await loadLibraryPreferences();
  const savedTheme = await window.lecfalAPI.getSetting('theme', 'dark');
  applyTheme(savedTheme, false);
  const savedLanguage = await window.lecfalAPI.getSetting('language', 'es');
  await initI18n(savedLanguage);
  applyLanguage(savedLanguage, false);

  // Re-render current active view on language change
  onLanguageChange(() => {
    const activeSeries = getActiveSeries();
    if (currentView === 'manga' && activeSeries) {
      renderMangaDetail(activeSeries);
    } else if (currentView === 'history') {
      loadAndRenderHistory();
    } else if (currentView === 'library') {
      refreshSeries(true);
    }
  });

  // Load options for advanced search dropdowns
  await populateAdvSearchOptions();

  // Load folders & series
  await refreshFolders();
  await refreshSeries();
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  // Navigation
  brandHomeBtn.addEventListener('click', () => navigateToLibrary({ preservePosition: false }));
  navTabLibrary?.addEventListener('click', () => navigateToLibrary({ preservePosition: false }));
  navTabHistory?.addEventListener('click', navigateToHistory);
  btnOpenSettings?.addEventListener('click', () => openSettingsView());
  btnBackFromSettings?.addEventListener('click', () => {
    if (lastTopLevelView === 'history') {
      navigateToHistory();
    } else {
      navigateToLibrary({ preservePosition: true });
    }
  });

  // Folder management
  btnAddAnotherFolder?.addEventListener('click', handleAddFolder);
  btnCloseModalFolders?.addEventListener('click', () => closeFoldersModal());
  btnModalCloseDone?.addEventListener('click', () => closeFoldersModal());

  // Advanced Search Initialization
  initAdvancedSearch({
    refreshSeries: () => refreshSeries(),
    onOpenAdvSearch: () => {
      if (!hasActiveAdvFilters()) {
        setAdvSearchWaiting(true);
      }
    },
    onCloseAdvSearch: (hasFilters) => {
      setAdvSearchWaiting(false);
      if (!hasFilters) {
        refreshSeries(false);
      }
    },
    setAdvWaiting: (waiting) => setAdvSearchWaiting(waiting)
  });

  // Settings Initialization
  initSettings({
    showToast,
    refreshSeries: (preserveScroll) => refreshSeries(preserveScroll),
    refreshFolders: () => refreshFolders(),
    runFolderScan: (folderId) => runFolderScan(folderId),
    runAllScan: (mode) => runAllScan(mode),
    getActiveSeries,
    reloadActiveSeries: () => reloadActiveSeries(),
    refreshAdvSearch: (type) => {
      if (type === 'tag') return populateAdvSearchTags();
      if (type === 'author') return populateAdvSearchAuthors();
      if (type === 'group') return populateAdvSearchGroups();
      if (type === 'language') return populateAdvSearchLanguages();
      if (type === 'parody') return populateAdvSearchParodies();
      return populateAdvSearchOptions();
    },
    onAddFolder: () => handleAddFolder()
  });

  // Universal Catalog Picker Modal Initialization
  initCatalogPicker({
    getActiveSeries,
    showToast,
    refreshSeries,
    onGoToSettings: (targetSectionId) => openSettingsView(targetSectionId),
    onMetadataUpdated: {
      tag: (series) => updateDetailMetadata('tag', series),
      author: (series) => updateDetailMetadata('author', series),
      group: (series) => updateDetailMetadata('group', series),
      language: (series) => updateDetailMetadata('language', series),
      parody: (series) => updateDetailMetadata('parody', series)
    }
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (currentView === 'reader') return; // Dedicated reader handles its own keyboard shortcuts

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      if (currentView === 'library') {
        e.preventDefault();
        focusSearchInput();
      } else if (currentView === 'manga') {
        e.preventDefault();
        focusChapterFilter();
      }
    }
    if (e.key === 'Escape') {
      if (isCatalogPickerOpen()) closeCatalogPickerModal();
      else if (isRenameModalOpen()) closeRenameModal();
      else if (isCreateLibraryModalOpen()) closeCreateLibraryModal();
      else if (isLibraryDropdownOpen()) closeLibraryDropdown();
      else if (isEditFieldModalOpen()) closeEditFieldModal();
      else if (modalFolders.style.display !== 'none') closeFoldersModal();
      else if (isAdvSearchPanelOpen()) toggleAdvancedSearchPanel(false);
      else if (currentView === 'settings') {
        if (lastTopLevelView === 'history') navigateToHistory();
        else navigateToLibrary({ preservePosition: true });
      }
      else if (currentView === 'history') navigateToLibrary({ preservePosition: false });
      else if (currentView === 'manga') navigateBackFromDetail();
      else if (hasSearchQuery() || hasActiveAdvFilters()) {
        clearSearch();
        handleClearAdvancedSearch();
      }
    }
  });
}

// ==================== VIEW NAVIGATION ====================
function updateTopNavTabs() {
  if (navTabLibrary) navTabLibrary.classList.toggle('active', currentView === 'library');
  if (navTabHistory) navTabHistory.classList.toggle('active', currentView === 'history');
}

async function navigateToLibrary(options = {}) {
  const preservePosition = options && options.preservePosition === true;
  currentView = 'library';
  lastTopLevelView = 'library';
  detailOrigin = 'library';
  updateTopNavTabs();
  if (topNav) topNav.style.display = 'flex';
  if (mangaView) mangaView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'none';
  if (readerView) readerView.style.display = 'none';
  if (historyView) historyView.style.display = 'none';
  if (libraryView) libraryView.style.display = 'flex';
  if (navSearchContainer) navSearchContainer.style.visibility = 'visible';
  clearActiveSeries();

  if (!preservePosition) {
    lastInteractedSeriesId = null;
    savedLibraryScrollTop = 0;
  }

  await refreshSeries(false);

  if (preservePosition) {
    const virtualizer = getGridVirtualizer();
    let scrolled = false;
    if (lastInteractedSeriesId && virtualizer) {
      scrolled = virtualizer.scrollToSeries(lastInteractedSeriesId, { align: 'center', highlight: true });
    }
    if (!scrolled && savedLibraryScrollTop > 0) {
      const mainEl = document.getElementById('mainContent');
      if (mainEl) mainEl.scrollTop = savedLibraryScrollTop;
      virtualizer?.updateVisibleRange(true);
    }
  }
}

async function navigateToHistory() {
  currentView = 'history';
  lastTopLevelView = 'history';
  updateTopNavTabs();
  if (topNav) topNav.style.display = 'flex';
  if (libraryView) libraryView.style.display = 'none';
  if (mangaView) mangaView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'none';
  if (readerView) readerView.style.display = 'none';
  if (historyView) historyView.style.display = 'flex';
  if (navSearchContainer) navSearchContainer.style.visibility = 'hidden';
  clearActiveSeries();
  await loadAndRenderHistory();
}

async function openReader(chapterId) {
  currentView = 'reader';
  if (topNav) topNav.style.display = 'none';
  libraryView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'none';
  if (historyView) historyView.style.display = 'none';
  mangaView.style.display = 'none';
  navSearchContainer.style.visibility = 'hidden';

  await webtoonReader.open(chapterId);
}

/**
 * Open the Manga Detail view.
 * @param {number|string} seriesId
 * @param {Object} [options]
 * @param {'library'|'history'} [options.source] Navigation origin. When omitted,
 *   the current origin is preserved (e.g. returning to Detail from the reader).
 */
async function openMangaView(seriesId, options = {}) {
  const source = options && options.source;
  if (source === 'history' || source === 'library') {
    if (source === 'history') {
      const historyScroll = historyView?.querySelector('.history-scroll-container');
      if (currentView === 'history' && historyScroll) {
        historyScrollTop = historyScroll.scrollTop;
      }
    } else if (source === 'library') {
      const mainEl = document.getElementById('mainContent');
      if (mainEl) savedLibraryScrollTop = mainEl.scrollTop;
      lastInteractedSeriesId = parseInt(seriesId, 10);
    }
    detailOrigin = source;
  } else {
    if (seriesId) lastInteractedSeriesId = parseInt(seriesId, 10);
  }
  setDetailBackTarget(detailOrigin);

  currentView = 'manga';
  if (topNav) topNav.style.display = 'none';
  if (libraryView) libraryView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'none';
  if (readerView) readerView.style.display = 'none';
  if (historyView) historyView.style.display = 'none';
  if (mangaView) mangaView.style.display = 'flex';
  navSearchContainer.style.visibility = 'hidden';

  await renderMangaDetail(seriesId);
}

/**
 * Leave Manga Detail towards the view it was opened from.
 */
async function navigateBackFromDetail() {
  if (detailOrigin === 'history') {
    await navigateToHistory();
    const historyScroll = historyView?.querySelector('.history-scroll-container');
    if (historyScroll) historyScroll.scrollTop = historyScrollTop;
  } else {
    await navigateToLibrary({ preservePosition: true });
  }
}

async function openSettingsView(targetSectionId = null) {
  if (currentView === 'library') {
    const mainEl = document.getElementById('mainContent');
    if (mainEl) savedLibraryScrollTop = mainEl.scrollTop;
  } else if (currentView === 'manga') {
    const activeSeries = getActiveSeries();
    if (activeSeries && activeSeries.id) {
      lastInteractedSeriesId = parseInt(activeSeries.id, 10);
    }
  }

  currentView = 'settings';
  if (topNav) topNav.style.display = 'none';
  libraryView.style.display = 'none';
  mangaView.style.display = 'none';
  if (readerView) readerView.style.display = 'none';
  if (historyView) historyView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'flex';
  navSearchContainer.style.visibility = 'hidden';

  // Load and render all metadata catalogs + libraries + folders + ignored values
  await renderAllSettings({ forceRefresh: true });

  // If a target section string is provided (e.g. 'sectionLibraries'), switch directly to it.
  // Otherwise preserve the current active section or default to 'sectionAppearance'.
  const target = (typeof targetSectionId === 'string' && targetSectionId)
    ? targetSectionId
    : (getCurrentSettingsSection() || 'sectionAppearance');

  switchSettingsSection(target);
}

// ==================== FOLDERS & SCANNING ====================
async function refreshFolders() {
  try {
    folders = await window.lecfalAPI.getFolders();
    if (statusFolderCount) {
      statusFolderCount.textContent = `${folders.length} carpeta${folders.length === 1 ? '' : 's'}`;
    }

    updateRescanButtonVisibility(folders.length > 0);
  } catch (err) {
    console.error('Error refreshing folders:', err);
  }
}

async function handleAddFolder() {
  try {
    const folderPath = await window.lecfalAPI.selectFolder();
    if (!folderPath) return;

    showToast('Añadiendo carpeta...');
    const newFolder = await window.lecfalAPI.addFolder(folderPath);
    await refreshFolders();
    await renderSettingsFolders();

    if (newFolder) {
      showToast('Carpeta añadida. Escaneando contenido...');
      await runFolderScan(newFolder.id);
      await refreshFolders();
      await renderSettingsFolders();
    }
  } catch (err) {
    console.error('Error adding folder:', err);
    showToast('Error al añadir carpeta');
  }
}

// ==================== FOLDERS MODAL ====================
async function openFoldersModal() {
  await renderFoldersList();
  modalFolders.style.display = 'flex';
}

function closeFoldersModal() {
  modalFolders.style.display = 'none';
}

async function renderFoldersList() {
  folders = await window.lecfalAPI.getFolders();
  foldersList.innerHTML = '';

  if (folders.length === 0) {
    foldersList.innerHTML = '<p class="modal-description">No hay carpetas añadidas aún.</p>';
    return;
  }

  folders.forEach((f, index) => {
    const isDefault = index === 0;
    const isAccessible = f.accessible !== false;
    const item = document.createElement('div');
    item.className = `folder-item ${isAccessible ? '' : 'is-unavailable'}`;
    item.innerHTML = `
      <div class="folder-item-info">
        <div class="folder-item-title-row">
          <span class="folder-item-name">${escapeHtml(f.name)}</span>
          ${isDefault ? '<span class="folder-item-default-badge">Por defecto</span>' : ''}
          ${isAccessible 
            ? '<span class="status-badge badge-accessible" style="font-size:0.68rem;padding:2px 6px;">Disponible</span>' 
            : '<span class="status-badge badge-unavailable" style="font-size:0.68rem;padding:2px 6px;">No disponible</span>'
          }
        </div>
        <div class="folder-item-path" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</div>
      </div>
      <div class="folder-item-actions">
        <button class="btn-folder-action btn-folder-rescan" data-id="${f.id}" ${!isAccessible ? 'disabled title="Monta el disco o volumen para escanear"' : 'title="Escanear esta carpeta"'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
            <path d="M16 21h5v-5"/>
          </svg>
          Escanear
        </button>
        <button class="btn-folder-action btn-folder-delete" data-id="${f.id}" title="Eliminar carpeta de la biblioteca">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <path d="M3 6h18"/>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
        </button>
      </div>
    `;

    item.querySelector('.btn-folder-rescan').addEventListener('click', async () => {
      closeFoldersModal();
      await runFolderScan(f.id);
    });

    item.querySelector('.btn-folder-delete').addEventListener('click', async () => {
      if (confirm(`¿Eliminar la carpeta "${f.name || f.path}" de la biblioteca? Los archivos en tu disco no serán borrados.`)) {
        try {
          await window.lecfalAPI.removeFolder(f.id);
          await refreshFolders();
          await renderFoldersList();
          await renderSettingsFolders();
          await refreshSeries();
          showToast('Carpeta eliminada de la biblioteca');
        } catch (err) {
          console.error('Error removing folder:', err);
          showToast('Error al eliminar carpeta');
        }
      }
    });

    foldersList.appendChild(item);
  });
}

// Expose view functions on window for programmatic access and navigation
window.lecfalViews = {
  navigateToLibrary,
  navigateToHistory,
  navigateBackFromDetail,
  getDetailOrigin: () => detailOrigin,
  openMangaView,
  openSettingsView,
  openCatalogPicker,
  closeCatalogPickerModal,
  handleSaveCatalogPicker
};

// Initialize application
init();
