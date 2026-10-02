import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.min.mjs';
import webtoonReader from './reader.js';
import {
  escapeHtml,
  showToast
} from './ui-utils.js';
import {
  initLibrary,
  loadLibraryPreferences,
  refreshSeries,
  scheduleSeriesRefresh,
  focusSearchInput,
  clearSearch,
  hasSearchQuery
} from './library.js';
import {
  initCatalogPicker,
  openCatalogPicker,
  closeCatalogPickerModal,
  handleSaveCatalogPicker,
  isCatalogPickerOpen
} from './catalog-picker.js';
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
} from './advanced-search.js';
import {
  initSettings,
  renderAllSettings,
  renderSettingsFolders,
  applyTheme,
  isRenameModalOpen,
  closeRenameModal
} from './settings.js';
import {
  initScannerUI,
  runFolderScan,
  runAllScan,
  updateRescanButtonVisibility
} from './scanner-ui.js';
import {
  initLogDrawer,
  closeLogDrawer,
  isLogDrawerOpen,
  setLogIndicatorActive
} from './log-drawer.js';
import {
  initDetail,
  renderMangaDetail,
  reloadActiveSeries,
  getActiveSeries,
  clearActiveSeries,
  syncChapterRead,
  isEditFieldModalOpen,
  closeEditFieldModal,
  focusChapterFilter,
  updateDetailMetadata
} from './detail.js';

// Configure PDF.js worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
} catch (e) {
  console.warn('PDF.js worker could not be configured:', e);
}

// ==================== APPLICATION STATE ====================
let folders = [];

// Current Active View: 'library', 'manga', or 'settings'
let currentView = 'library';

// ==================== DOM ELEMENTS ====================
// Views
const topNav = document.getElementById('topNav');
const libraryView = document.getElementById('libraryView');
const mangaView = document.getElementById('mangaView');
const settingsView = document.getElementById('settingsView');
const readerView = document.getElementById('readerView');
const navSearchContainer = document.getElementById('navSearchContainer');
const brandHomeBtn = document.getElementById('brandHomeBtn');

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
    openMangaView: (seriesId) => openMangaView(seriesId),
    getFolders: () => folders,
    onAddFolder: () => handleAddFolder(),
    getCurrentView: () => currentView,
    getActiveAdvFilters: () => getActiveAdvFilters(),
    onClearAdvancedSearch: () => handleClearAdvancedSearch()
  });

  initScannerUI({
    refreshSeries: (immediate) => scheduleSeriesRefresh(immediate),
    refreshFolders,
    getFolders: () => folders,
    onScanStateChange: ({ isScanning: scanning }) => setLogIndicatorActive(scanning),
    onSeriesBatch: () => {
      if (currentView === 'library') {
        scheduleSeriesRefresh(false);
      }
    }
  });

  initLogDrawer();

  initDetail({
    navigateToLibrary,
    openReader,
    refreshSeries: (preserveScroll) => refreshSeries(preserveScroll),
    openCatalogPicker: (type) => openCatalogPicker(type),
    refreshAdvSearch: () => populateAdvSearchOptions(),
    showToast
  });

  // Initialize Webtoon reader
  webtoonReader.init({
    pdfjsLib,
    onClose: (closedChapter) => {
      const series = getActiveSeries();
      if (series) {
        openMangaView(series.id);
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

  // Load preferences
  await loadLibraryPreferences();
  const savedTheme = await window.lecfalAPI.getSetting('theme', 'dark');
  applyTheme(savedTheme, false);

  // Load options for advanced search dropdowns
  await populateAdvSearchOptions();

  // Load folders & series
  await refreshFolders();
  await refreshSeries();
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  // Navigation
  brandHomeBtn.addEventListener('click', navigateToLibrary);
  btnOpenSettings?.addEventListener('click', openSettingsView);
  btnBackFromSettings?.addEventListener('click', navigateToLibrary);

  // Folder management
  btnAddAnotherFolder?.addEventListener('click', handleAddFolder);
  btnCloseModalFolders?.addEventListener('click', () => closeFoldersModal());
  btnModalCloseDone?.addEventListener('click', () => closeFoldersModal());

  // Advanced Search Initialization
  initAdvancedSearch({
    refreshSeries: () => refreshSeries()
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
    onGoToSettings: () => openSettingsView(),
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
      else if (isEditFieldModalOpen()) closeEditFieldModal();
      else if (modalFolders.style.display !== 'none') closeFoldersModal();
      else if (isLogDrawerOpen()) closeLogDrawer();
      else if (isAdvSearchPanelOpen()) toggleAdvancedSearchPanel(false);
      else if (currentView === 'settings') navigateToLibrary();
      else if (currentView === 'manga') navigateToLibrary();
      else if (hasSearchQuery() || hasActiveAdvFilters()) {
        clearSearch();
        handleClearAdvancedSearch();
      }
    }
  });
}

// ==================== VIEW NAVIGATION ====================
function navigateToLibrary() {
  currentView = 'library';
  if (topNav) topNav.style.display = 'flex';
  if (mangaView) mangaView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'none';
  if (readerView) readerView.style.display = 'none';
  if (libraryView) libraryView.style.display = 'flex';
  if (navSearchContainer) navSearchContainer.style.visibility = 'visible';
  clearActiveSeries();
  refreshSeries(false);
}

async function openReader(chapterId) {
  currentView = 'reader';
  if (topNav) topNav.style.display = 'none';
  libraryView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'none';
  mangaView.style.display = 'none';
  navSearchContainer.style.visibility = 'hidden';

  await webtoonReader.open(chapterId);
}

async function openMangaView(seriesId) {
  currentView = 'manga';
  if (topNav) topNav.style.display = 'none';
  if (libraryView) libraryView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'none';
  if (readerView) readerView.style.display = 'none';
  if (mangaView) mangaView.style.display = 'flex';
  if (navSearchContainer) navSearchContainer.style.visibility = 'hidden';

  await renderMangaDetail(seriesId);
}

async function openSettingsView() {
  currentView = 'settings';
  if (topNav) topNav.style.display = 'none';
  libraryView.style.display = 'none';
  mangaView.style.display = 'none';
  if (readerView) readerView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'flex';
  navSearchContainer.style.visibility = 'hidden';

  // Load and render all 5 metadata catalogs + folders
  await renderAllSettings();

  const scrollable = document.querySelector('.settings-view-scrollable');
  if (scrollable) scrollable.scrollTop = 0;
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
  openMangaView,
  openSettingsView,
  openCatalogPicker,
  closeCatalogPickerModal,
  handleSaveCatalogPicker
};

// Initialize application
init();
