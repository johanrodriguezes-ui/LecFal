import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.min.mjs';

// Configure PDF.js worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
} catch (e) {
  console.warn('PDF.js worker could not be configured:', e);
}

// ==================== APPLICATION STATE ====================
let seriesList = [];
let folders = [];
let currentFilter = 'all';
let searchQuery = '';
let currentSort = 'title_asc';
let isScanning = false;
let isCancelling = false;

// Current Active View: 'library', 'manga', or 'settings'
let currentView = 'library';
let activeSeries = null;
let activeChapters = [];
let currentChapterSort = 'asc'; // 'asc' or 'desc'
let chapterFilterText = '';

// Advanced Search State
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

// Centralized Metadata & Catalog Picker State
let availableTags = [];
let availableAuthors = [];
let availableGroups = [];
let availableLanguages = [];
let availableParodies = [];

let currentPickerType = 'tag'; // 'tag' | 'author' | 'group' | 'language' | 'parody'
let pickerSelectedIds = new Set();
let pickerSearchText = '';
let currentPickerCatalog = [];

// Edit Field Modal State
let currentEditField = null; // 'title'

// Dedicated Metadata Rename Modal State
let pendingRenameConfig = null; // { type, id, currentName, typeLabel }

// ==================== DOM ELEMENTS ====================
// Views
const topNav = document.getElementById('topNav');
const libraryView = document.getElementById('libraryView');
const mangaView = document.getElementById('mangaView');
const settingsView = document.getElementById('settingsView');
const navSearchContainer = document.getElementById('navSearchContainer');
const brandHomeBtn = document.getElementById('brandHomeBtn');

// Navigation / Search / Folders
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const currentFolderName = document.getElementById('currentFolderName');
const btnManageFolders = document.getElementById('btnManageFolders');
const btnAddFolder = document.getElementById('btnAddFolder');
const btnRescan = document.getElementById('btnRescan');
const btnSelectInitialFolder = document.getElementById('btnSelectInitialFolder');
const btnResetFilters = document.getElementById('btnResetFilters');

// Settings Navigation & Sections
const btnOpenSettings = document.getElementById('btnOpenSettings');
const btnBackFromSettings = document.getElementById('btnBackFromSettings');

// Settings: Tags
const formCreateTag = document.getElementById('formCreateTag');
const inputNewTagName = document.getElementById('inputNewTagName');
const btnCreateTag = document.getElementById('btnCreateTag');
const settingsTagsList = document.getElementById('settingsTagsList');

// Settings: Authors
const formCreateAuthor = document.getElementById('formCreateAuthor');
const inputNewAuthorName = document.getElementById('inputNewAuthorName');
const btnCreateAuthor = document.getElementById('btnCreateAuthor');
const settingsAuthorsList = document.getElementById('settingsAuthorsList');

// Settings: Groups
const formCreateGroup = document.getElementById('formCreateGroup');
const inputNewGroupName = document.getElementById('inputNewGroupName');
const btnCreateGroup = document.getElementById('btnCreateGroup');
const settingsGroupsList = document.getElementById('settingsGroupsList');

// Settings: Languages
const formCreateLanguage = document.getElementById('formCreateLanguage');
const inputNewLanguageName = document.getElementById('inputNewLanguageName');
const btnCreateLanguage = document.getElementById('btnCreateLanguage');
const settingsLanguagesList = document.getElementById('settingsLanguagesList');

// Settings: Series / Parodies
const formCreateParody = document.getElementById('formCreateParody');
const inputNewParodyName = document.getElementById('inputNewParodyName');
const btnCreateParody = document.getElementById('btnCreateParody');
const settingsParodiesList = document.getElementById('settingsParodiesList');

// Settings: Appearance
const themeOptDark = document.getElementById('themeOptDark');
const themeOptLight = document.getElementById('themeOptLight');

// Settings: Folders
const settingsFoldersList = document.getElementById('settingsFoldersList');
const btnSettingsScanAll = document.getElementById('btnSettingsScanAll');
const btnSettingsAddFolder = document.getElementById('btnSettingsAddFolder');

// Advanced Search Elements
const btnToggleAdvSearch = document.getElementById('btnToggleAdvSearch');
const advSearchPanel = document.getElementById('advSearchPanel');
const btnCloseAdvSearch = document.getElementById('btnCloseAdvSearch');
const advInputTitle = document.getElementById('advInputTitle');
const advSelectAuthor = document.getElementById('advSelectAuthor');
const advSelectGroup = document.getElementById('advSelectGroup');
const advSelectParody = document.getElementById('advSelectParody');
const advSelectTag = document.getElementById('advSelectTag');
const advSelectLanguage = document.getElementById('advSelectLanguage');
const btnApplyAdvSearch = document.getElementById('btnApplyAdvSearch');
const btnClearAdvSearch = document.getElementById('btnClearAdvSearch');
const advActiveBadge = document.getElementById('advActiveBadge');
const btnQuickClearAdv = document.getElementById('btnQuickClearAdv');

// Grid controls
const comicsGrid = document.getElementById('comicsGrid');
const emptyStateNoFolders = document.getElementById('emptyStateNoFolders');
const emptyStateNoResults = document.getElementById('emptyStateNoResults');
const sortSelect = document.getElementById('sortSelect');
const sizeButtonGroup = document.getElementById('sizeButtonGroup');
const sizeSlider = document.getElementById('sizeSlider');
const filterChips = document.querySelectorAll('.filter-chip');
const countAll = document.getElementById('countAll');
const countCbz = document.getElementById('countCbz');
const countPdf = document.getElementById('countPdf');
const countFav = document.getElementById('countFav');
const statusCount = document.getElementById('statusCount');
const statusFolderCount = document.getElementById('statusFolderCount');

// Scan Banner & Controls
const scanProgressBanner = document.getElementById('scanProgressBanner');
const scanBannerTitle = document.getElementById('scanBannerTitle');
const scanBannerFile = document.getElementById('scanBannerFile');
const scanProgressBar = document.getElementById('scanProgressBar');
const scanBannerCount = document.getElementById('scanBannerCount');
const btnCancelScan = document.getElementById('btnCancelScan');
const btnScanMenu = document.getElementById('btnScanMenu');
const scanDropdownMenu = document.getElementById('scanDropdownMenu');
const btnScanIncremental = document.getElementById('btnScanIncremental');
const btnScanFull = document.getElementById('btnScanFull');

// Manga View Elements
const btnBackToLibrary = document.getElementById('btnBackToLibrary');
const btnOpenMangaFolder = document.getElementById('btnOpenMangaFolder');
const btnToggleMarkAllRead = document.getElementById('btnToggleMarkAllRead');
const btnMarkAllText = document.getElementById('btnMarkAllText');

const mangaHeroCoverImg = document.getElementById('mangaHeroCoverImg');
const mangaHeroFormatBadge = document.getElementById('mangaHeroFormatBadge');
const mangaHeroTitle = document.getElementById('mangaHeroTitle');
const btnEditTitle = document.getElementById('btnEditTitle');
const btnMangaFav = document.getElementById('btnMangaFav');

const mangaAuthorsList = document.getElementById('mangaAuthorsList');
const btnAddAuthor = document.getElementById('btnAddAuthor');
const detectedAuthorHint = document.getElementById('detectedAuthorHint');

const mangaGroupsList = document.getElementById('mangaGroupsList');
const btnAddGroup = document.getElementById('btnAddGroup');

const mangaParodiesList = document.getElementById('mangaParodiesList');
const btnAddParody = document.getElementById('btnAddParody');

const mangaLanguagesList = document.getElementById('mangaLanguagesList');
const btnAddLanguage = document.getElementById('btnAddLanguage');

const mangaTagsList = document.getElementById('mangaTagsList');
const btnAddTag = document.getElementById('btnAddTag');

const mangaHeroDesc = document.getElementById('mangaHeroDesc');
const btnEditDesc = document.getElementById('btnEditDesc');
const descEditorContainer = document.getElementById('descEditorContainer');
const descEditTextArea = document.getElementById('descEditTextArea');
const btnCancelEditDesc = document.getElementById('btnCancelEditDesc');
const btnSaveEditDesc = document.getElementById('btnSaveEditDesc');

const btnStartReading = document.getElementById('btnStartReading');
const btnStartReadingText = document.getElementById('btnStartReadingText');

// Chapters Elements
const chaptersCountBadge = document.getElementById('chaptersCountBadge');
const chaptersReadBadge = document.getElementById('chaptersReadBadge');
const chapterFilterInput = document.getElementById('chapterFilterInput');
const btnToggleChapterSort = document.getElementById('btnToggleChapterSort');
const chapterSortLabel = document.getElementById('chapterSortLabel');
const chaptersList = document.getElementById('chaptersList');

// Modals
const modalFolders = document.getElementById('modalFolders');
const foldersList = document.getElementById('foldersList');
const btnCloseModalFolders = document.getElementById('btnCloseModalFolders');
const btnModalCloseDone = document.getElementById('btnModalCloseDone');
const btnAddAnotherFolder = document.getElementById('btnAddAnotherFolder');

const modalEditField = document.getElementById('modalEditField');
const editFieldModalTitle = document.getElementById('editFieldModalTitle');
const editFieldLabel = document.getElementById('editFieldLabel');
const editFieldInput = document.getElementById('editFieldInput');
const btnCloseEditFieldModal = document.getElementById('btnCloseEditFieldModal');
const btnCancelEditField = document.getElementById('btnCancelEditField');
const btnSaveEditField = document.getElementById('btnSaveEditField');

// Dedicated Metadata Rename Modal
const modalRenameMetadata = document.getElementById('modalRenameMetadata');
const renameModalTitle = document.getElementById('renameModalTitle');
const renameModalLabel = document.getElementById('renameModalLabel');
const renameModalInput = document.getElementById('renameModalInput');
const renameModalError = document.getElementById('renameModalError');
const btnCloseRenameModal = document.getElementById('btnCloseRenameModal');
const btnCancelRenameModal = document.getElementById('btnCancelRenameModal');
const btnConfirmRenameModal = document.getElementById('btnConfirmRenameModal');

// Centralized Catalog Picker Modal
const modalCatalogPicker = document.getElementById('modalCatalogPicker');
const modalCatalogPickerTitle = document.getElementById('modalCatalogPickerTitle');
const modalCatalogPickerDesc = document.getElementById('modalCatalogPickerDesc');
const btnCloseCatalogPicker = document.getElementById('btnCloseCatalogPicker');
const btnCancelCatalogPicker = document.getElementById('btnCancelCatalogPicker');
const btnSaveCatalogPicker = document.getElementById('btnSaveCatalogPicker');
const inputFilterCatalogPicker = document.getElementById('inputFilterCatalogPicker');
const catalogPickerChipsContainer = document.getElementById('catalogPickerChipsContainer');
const catalogPickerEmpty = document.getElementById('catalogPickerEmpty');
const catalogPickerEmptyText = document.getElementById('catalogPickerEmptyText');
const btnGoToSettingsFromPicker = document.getElementById('btnGoToSettingsFromPicker');

// Logs & Toast
const toastNotification = document.getElementById('toastNotification');
const toastMessage = document.getElementById('toastMessage');
const btnToggleLogs = document.getElementById('btnToggleLogs');
const logIndicatorDot = document.getElementById('logIndicatorDot');
const logDrawer = document.getElementById('logDrawer');
const logTerminal = document.getElementById('logTerminal');
const logCountBadge = document.getElementById('logCountBadge');
const btnOpenLogFile = document.getElementById('btnOpenLogFile');
const btnClearLogs = document.getElementById('btnClearLogs');
const btnCloseLogDrawer = document.getElementById('btnCloseLogDrawer');
let logCount = 0;

// ==================== INITIALIZATION ====================
async function init() {
  setupEventListeners();
  setupScanProgressListener();
  setupScanStatusListener();
  setupLogging();

  // Load theme preference
  const savedTheme = await window.lecfalAPI.getSetting('theme', 'dark');
  applyTheme(savedTheme, false);

  // Load saved preferences
  const savedSize = await window.lecfalAPI.getSetting('grid_size', 185);
  applyGridSize(savedSize, false);

  const savedSort = await window.lecfalAPI.getSetting('sort_order', 'title_asc');
  currentSort = savedSort;
  sortSelect.value = savedSort;

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
  btnBackToLibrary.addEventListener('click', navigateToLibrary);
  btnOpenSettings?.addEventListener('click', openSettingsView);
  btnBackFromSettings?.addEventListener('click', navigateToLibrary);

  // Folder management
  btnAddFolder?.addEventListener('click', handleAddFolder);
  btnSelectInitialFolder?.addEventListener('click', handleAddFolder);
  btnAddAnotherFolder?.addEventListener('click', handleAddFolder);
  btnRescan?.addEventListener('click', handleRescan);
  btnManageFolders?.addEventListener('click', () => openFoldersModal());
  btnCloseModalFolders?.addEventListener('click', () => closeFoldersModal());
  btnModalCloseDone?.addEventListener('click', () => closeFoldersModal());

  // Scan modes dropdown & cancel
  if (btnScanMenu && scanDropdownMenu) {
    btnScanMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = scanDropdownMenu.style.display === 'block';
      scanDropdownMenu.style.display = isVisible ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
      if (scanDropdownMenu && !scanDropdownMenu.contains(e.target) && e.target !== btnScanMenu) {
        scanDropdownMenu.style.display = 'none';
      }
    });

    btnScanIncremental?.addEventListener('click', () => {
      scanDropdownMenu.style.display = 'none';
      runAllScan('incremental');
    });

    btnScanFull?.addEventListener('click', () => {
      scanDropdownMenu.style.display = 'none';
      if (confirm('¿Deseas forzar el re-escaneo completo de todos los archivos y portadas?')) {
        runAllScan('full');
      }
    });
  }

  btnCancelScan?.addEventListener('click', async () => {
    if (isScanning && !isCancelling) {
      isCancelling = true;
      btnCancelScan.disabled = true;
      btnCancelScan.innerHTML = '<span>Cancelando...</span>';
      scanBannerTitle.textContent = 'Cancelando escaneo...';
      scanBannerFile.textContent = 'Deteniendo procesos y guardando progreso...';
      scanProgressBanner.classList.add('cancelling');
      try {
        await window.lecfalAPI.cancelScan();
      } catch (err) {
        console.error('Error al solicitar cancelación:', err);
      }
    }
  });

  // Search input
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
    debounce(refreshSeries, 200)();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    refreshSeries();
  });

  btnResetFilters.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    currentFilter = 'all';
    filterChips.forEach(c => c.classList.remove('active'));
    document.querySelector('.filter-chip[data-filter="all"]').classList.add('active');
    handleClearAdvancedSearch();
  });

  // Advanced Search Controls
  btnToggleAdvSearch?.addEventListener('click', () => toggleAdvancedSearchPanel());
  btnCloseAdvSearch?.addEventListener('click', () => toggleAdvancedSearchPanel(false));
  btnApplyAdvSearch?.addEventListener('click', handleApplyAdvancedSearch);
  btnClearAdvSearch?.addEventListener('click', handleClearAdvancedSearch);
  btnQuickClearAdv?.addEventListener('click', handleClearAdvancedSearch);

  advInputTitle?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApplyAdvancedSearch();
    }
  });
  advSelectAuthor?.addEventListener('change', handleApplyAdvancedSearch);
  advSelectGroup?.addEventListener('change', handleApplyAdvancedSearch);
  advSelectParody?.addEventListener('change', handleApplyAdvancedSearch);
  advSelectTag?.addEventListener('change', handleApplyAdvancedSearch);
  advSelectLanguage?.addEventListener('change', handleApplyAdvancedSearch);

  // Settings Actions
  formCreateTag?.addEventListener('submit', handleCreateTag);
  formCreateAuthor?.addEventListener('submit', handleCreateAuthor);
  formCreateGroup?.addEventListener('submit', handleCreateGroup);
  formCreateLanguage?.addEventListener('submit', handleCreateLanguage);
  formCreateParody?.addEventListener('submit', handleCreateParody);
  themeOptDark?.addEventListener('click', () => applyTheme('dark'));
  themeOptLight?.addEventListener('click', () => applyTheme('light'));
  btnSettingsScanAll?.addEventListener('click', () => runAllScan('incremental'));
  btnSettingsAddFolder?.addEventListener('click', async () => {
    await handleAddFolder();
    await renderSettingsFolders();
  });

  // Dedicated Rename Metadata Modal Controls
  btnCloseRenameModal?.addEventListener('click', closeRenameModal);
  btnCancelRenameModal?.addEventListener('click', closeRenameModal);
  btnConfirmRenameModal?.addEventListener('click', handleConfirmRename);
  renameModalInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmRename();
    } else if (e.key === 'Escape') {
      closeRenameModal();
    }
  });
  modalRenameMetadata?.addEventListener('click', (e) => {
    if (e.target === modalRenameMetadata) closeRenameModal();
  });

  // Universal Catalog Picker Modal Controls
  btnCloseCatalogPicker?.addEventListener('click', closeCatalogPickerModal);
  btnCancelCatalogPicker?.addEventListener('click', closeCatalogPickerModal);
  btnSaveCatalogPicker?.addEventListener('click', handleSaveCatalogPicker);
  btnGoToSettingsFromPicker?.addEventListener('click', () => {
    closeCatalogPickerModal();
    openSettingsView();
  });
  inputFilterCatalogPicker?.addEventListener('input', (e) => {
    pickerSearchText = e.target.value.trim();
    renderCatalogPickerChips();
  });
  modalCatalogPicker?.addEventListener('click', (e) => {
    if (e.target === modalCatalogPicker) closeCatalogPickerModal();
  });

  // Filter chips
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      refreshSeries();
    });
  });

  // Sort dropdown
  sortSelect.addEventListener('change', async (e) => {
    currentSort = e.target.value;
    await window.lecfalAPI.setSetting('sort_order', currentSort);
    refreshSeries();
  });

  // Grid size buttons
  sizeButtonGroup.addEventListener('click', async (e) => {
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
  sizeSlider.addEventListener('input', (e) => {
    const pxVal = parseInt(e.target.value, 10);
    applyGridSize(pxVal, false);
  });

  sizeSlider.addEventListener('change', async (e) => {
    const pxVal = parseInt(e.target.value, 10);
    await window.lecfalAPI.setSetting('grid_size', pxVal);
  });

  // ==================== MANGA VIEW ACTIONS ====================
  btnMangaFav.addEventListener('click', async () => {
    if (activeSeries) {
      const isFav = await window.lecfalAPI.toggleSeriesFavorite(activeSeries.id);
      activeSeries.favorite = isFav;
      updateFavButtonState(btnMangaFav, isFav);
      refreshSeries(false);
    }
  });

  btnOpenMangaFolder.addEventListener('click', async () => {
    if (activeSeries) {
      await window.lecfalAPI.showInFolder(activeSeries.path);
    }
  });

  btnToggleMarkAllRead.addEventListener('click', async () => {
    if (!activeSeries || !activeChapters.length) return;
    const hasUnread = activeChapters.some(c => !c.is_read);
    await window.lecfalAPI.markAllChaptersRead({ seriesId: activeSeries.id, isRead: hasUnread });
    await reloadActiveSeries();
    showToast(hasUnread ? 'Todos los capítulos marcados como leídos' : 'Capítulos marcados como no leídos');
  });

  // Edit title
  btnEditTitle?.addEventListener('click', () => {
    if (!activeSeries) return;
    openEditFieldModal('title', 'Renombrar Manga', 'Nuevo título para este manga:', activeSeries.title);
  });

  // Assign metadata buttons (open centralized catalog picker)
  btnAddAuthor?.addEventListener('click', async () => {
    if (!activeSeries) return;
    await openCatalogPicker('author');
  });

  btnAddGroup?.addEventListener('click', async () => {
    if (!activeSeries) return;
    await openCatalogPicker('group');
  });

  btnAddParody?.addEventListener('click', async () => {
    if (!activeSeries) return;
    await openCatalogPicker('parody');
  });

  btnAddLanguage?.addEventListener('click', async () => {
    if (!activeSeries) return;
    await openCatalogPicker('language');
  });

  btnAddTag?.addEventListener('click', async () => {
    if (!activeSeries) return;
    await openCatalogPicker('tag');
  });

  // Edit description
  btnEditDesc.addEventListener('click', () => {
    if (!activeSeries) return;
    descEditTextArea.value = activeSeries.description === 'Sin descripción' ? '' : activeSeries.description;
    mangaHeroDesc.style.display = 'none';
    descEditorContainer.style.display = 'block';
    descEditTextArea.focus();
  });

  btnCancelEditDesc.addEventListener('click', () => {
    descEditorContainer.style.display = 'none';
    mangaHeroDesc.style.display = 'block';
  });

  btnSaveEditDesc.addEventListener('click', async () => {
    if (!activeSeries) return;
    const newDesc = descEditTextArea.value.trim() || 'Sin descripción';
    await window.lecfalAPI.updateSeriesMetadata({
      seriesId: activeSeries.id,
      description: newDesc
    });
    activeSeries.description = newDesc;
    mangaHeroDesc.textContent = newDesc;
    descEditorContainer.style.display = 'none';
    mangaHeroDesc.style.display = 'block';
    showToast('Descripción guardada');
  });

  // Chapter list controls
  btnToggleChapterSort.addEventListener('click', async () => {
    currentChapterSort = currentChapterSort === 'asc' ? 'desc' : 'asc';
    chapterSortLabel.textContent = currentChapterSort === 'asc' ? '1 → 99' : '99 → 1';
    await reloadActiveSeries();
  });

  chapterFilterInput.addEventListener('input', (e) => {
    chapterFilterText = e.target.value.toLowerCase().trim();
    renderChaptersList();
  });

  // Start reading button
  btnStartReading.addEventListener('click', async () => {
    if (!activeChapters.length) return;
    // Find first unread chapter or chapter 1
    const targetChapter = activeChapters.find(c => !c.is_read) || activeChapters[0];
    if (targetChapter) {
      try {
        await window.lecfalAPI.openFile(targetChapter.file_path);
        // Mark as read automatically or prompt
        if (!targetChapter.is_read) {
          await window.lecfalAPI.toggleChapterRead(targetChapter.id);
          targetChapter.is_read = 1;
          renderChaptersList();
          updateChapterCounters();
        }
      } catch (err) {
        showToast('Error al abrir el capítulo: ' + err.message);
      }
    }
  });

  // Edit Field Modal
  btnCloseEditFieldModal.addEventListener('click', closeEditFieldModal);
  btnCancelEditField.addEventListener('click', closeEditFieldModal);
  btnSaveEditField.addEventListener('click', handleSaveEditField);

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      if (currentView === 'library') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      } else if (currentView === 'manga') {
        e.preventDefault();
        chapterFilterInput.focus();
        chapterFilterInput.select();
      }
    }
    if (e.key === 'Escape') {
      if (modalCatalogPicker && modalCatalogPicker.style.display !== 'none') closeCatalogPickerModal();
      else if (modalEditField.style.display !== 'none') closeEditFieldModal();
      else if (modalFolders.style.display !== 'none') closeFoldersModal();
      else if (advSearchPanel && advSearchPanel.style.display !== 'none') toggleAdvancedSearchPanel(false);
      else if (currentView === 'settings') navigateToLibrary();
      else if (currentView === 'manga') navigateToLibrary();
      else if (searchQuery || hasActiveAdvFilters()) {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        handleClearAdvancedSearch();
      }
    }
  });
}

// ==================== VIEW NAVIGATION ====================
function navigateToLibrary() {
  currentView = 'library';
  if (topNav) topNav.style.display = 'flex';
  mangaView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'none';
  libraryView.style.display = 'flex';
  navSearchContainer.style.visibility = 'visible';
  activeSeries = null;
  activeChapters = [];
  refreshSeries(false);
}

async function openMangaView(seriesId) {
  currentView = 'manga';
  if (topNav) topNav.style.display = 'none';
  libraryView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'none';
  mangaView.style.display = 'flex';
  navSearchContainer.style.visibility = 'hidden';

  const data = await window.lecfalAPI.getSeriesDetail({
    seriesId,
    sortOrder: currentChapterSort
  });

  if (!data) {
    showToast('No se pudo cargar la información del manga');
    navigateToLibrary();
    return;
  }

  activeSeries = data;
  activeChapters = data.chapters || [];
  chapterFilterText = '';
  chapterFilterInput.value = '';

  // Render hero
  mangaHeroTitle.textContent = activeSeries.title;
  mangaHeroDesc.textContent = activeSeries.description || 'Sin descripción';
  mangaHeroFormatBadge.textContent = (activeSeries.primary_format || 'CBZ').toUpperCase();
  mangaHeroFormatBadge.className = `manga-hero-format-badge badge-${activeSeries.primary_format || 'cbz'}`;

  if (activeSeries.cover_path) {
    mangaHeroCoverImg.src = getCoverUrl(activeSeries.cover_path);
    mangaHeroCoverImg.style.display = 'block';
    mangaHeroCoverImg.onerror = () => {
      console.warn(`[LecFal UI] Fallo al cargar portada hero para "${activeSeries.title}" (${activeSeries.cover_path})`);
      mangaHeroCoverImg.style.display = 'none';
    };
  } else {
    mangaHeroCoverImg.style.display = 'none';
  }

  updateFavButtonState(btnMangaFav, activeSeries.favorite === 1);

  // Render metadata chips
  renderMangaAuthorsFromSeries(activeSeries);
  renderMangaGroupsFromSeries(activeSeries);
  renderMangaParodiesFromSeries(activeSeries);
  renderMangaLanguagesFromSeries(activeSeries);
  renderMangaTagsFromSeries(activeSeries);

  // Render chapters
  renderChaptersList();
  updateChapterCounters();

  // Scroll to top
  const scrollable = document.querySelector('.manga-view-scrollable');
  if (scrollable) scrollable.scrollTop = 0;
}

async function openSettingsView() {
  currentView = 'settings';
  if (topNav) topNav.style.display = 'none';
  libraryView.style.display = 'none';
  mangaView.style.display = 'none';
  if (settingsView) settingsView.style.display = 'flex';
  navSearchContainer.style.visibility = 'hidden';

  // Load and render all 5 metadata catalogs + folders
  await Promise.all([
    renderSettingsTags(),
    renderSettingsAuthors(),
    renderSettingsGroups(),
    renderSettingsLanguages(),
    renderSettingsParodies(),
    renderSettingsFolders()
  ]);

  const scrollable = document.querySelector('.settings-view-scrollable');
  if (scrollable) scrollable.scrollTop = 0;
}

async function reloadActiveSeries() {
  if (!activeSeries) return;
  const data = await window.lecfalAPI.getSeriesDetail({
    seriesId: activeSeries.id,
    sortOrder: currentChapterSort
  });
  if (data) {
    activeSeries = data;
    activeChapters = data.chapters || [];
    renderMangaAuthorsFromSeries(activeSeries);
    renderMangaGroupsFromSeries(activeSeries);
    renderMangaParodiesFromSeries(activeSeries);
    renderMangaLanguagesFromSeries(activeSeries);
    renderMangaTagsFromSeries(activeSeries);
    renderChaptersList();
    updateChapterCounters();
  }
}

function renderMangaAuthorsFromSeries(series) {
  if (!mangaAuthorsList) return;
  mangaAuthorsList.innerHTML = '';
  const authors = series.authors_list || [];

  if (authors.length === 0) {
    const emptySpan = document.createElement('span');
    emptySpan.textContent = series.author || 'Desconocido';
    emptySpan.style.color = 'var(--text-muted)';
    emptySpan.style.fontSize = '0.85rem';
    mangaAuthorsList.appendChild(emptySpan);
  } else {
    authors.forEach(a => {
      const chip = document.createElement('span');
      chip.className = 'manga-meta-chip';
      chip.innerHTML = `
        <span>${escapeHtml(a.name)}</span>
        <button class="btn-remove-chip" data-id="${a.id}" title="Eliminar autor de este manga">×</button>
      `;
      chip.querySelector('.btn-remove-chip').addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleRemoveAuthorFromSeries(a.id);
      });
      mangaAuthorsList.appendChild(chip);
    });
  }

  // Handle detected author hint
  if (detectedAuthorHint) {
    const detected = (series.detected_author || '').trim();
    const alreadyAssigned = authors.some(a => a.name.toLowerCase() === detected.toLowerCase());
    if (detected && !alreadyAssigned) {
      detectedAuthorHint.innerHTML = `
        <span>Detectado en carpeta: <strong>"${escapeHtml(detected)}"</strong></span>
        <button type="button" class="hint-btn" id="btnQuickAddDetectedAuthor">Añadir a Ajustes</button>
      `;
      detectedAuthorHint.style.display = 'inline-flex';
      const btnQuick = detectedAuthorHint.querySelector('#btnQuickAddDetectedAuthor');
      if (btnQuick) {
        btnQuick.addEventListener('click', async () => {
          try {
            await window.lecfalAPI.createAuthor(detected);
            showToast(`Autor "${detected}" creado y asignado`);
            await reloadActiveSeries();
            await populateAdvSearchOptions();
          } catch (err) {
            showToast(err.message);
          }
        });
      }
    } else {
      detectedAuthorHint.style.display = 'none';
      detectedAuthorHint.innerHTML = '';
    }
  }
}

async function handleRemoveAuthorFromSeries(authorId) {
  if (!activeSeries) return;
  const currentList = activeSeries.authors_list || [];
  const remainingIds = currentList.filter(a => a.id !== authorId).map(a => a.id);
  const updated = await window.lecfalAPI.setSeriesAuthors({
    seriesId: activeSeries.id,
    authorIds: remainingIds
  });
  activeSeries.authors_list = updated;
  activeSeries.author = updated.length > 0 ? updated.map(a => a.name).join(', ') : 'Desconocido';
  renderMangaAuthorsFromSeries(activeSeries);
  refreshSeries();
  showToast('Autor desvinculado de este manga');
}

function renderMangaGroupsFromSeries(series) {
  if (!mangaGroupsList) return;
  mangaGroupsList.innerHTML = '';
  const groups = series.groups_list || [];

  if (groups.length === 0) {
    const emptySpan = document.createElement('span');
    emptySpan.textContent = series.group_name || series.group || 'Sin grupo / círculo';
    emptySpan.style.color = 'var(--text-muted)';
    emptySpan.style.fontSize = '0.85rem';
    mangaGroupsList.appendChild(emptySpan);
  } else {
    groups.forEach(g => {
      const chip = document.createElement('span');
      chip.className = 'manga-meta-chip';
      chip.innerHTML = `
        <span>${escapeHtml(g.name)}</span>
        <button class="btn-remove-chip" data-id="${g.id}" title="Eliminar grupo de este manga">×</button>
      `;
      chip.querySelector('.btn-remove-chip').addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleRemoveGroupFromSeries(g.id);
      });
      mangaGroupsList.appendChild(chip);
    });
  }
}

async function handleRemoveGroupFromSeries(groupId) {
  if (!activeSeries) return;
  const currentList = activeSeries.groups_list || [];
  const remainingIds = currentList.filter(g => g.id !== groupId).map(g => g.id);
  const updated = await window.lecfalAPI.setSeriesGroups({
    seriesId: activeSeries.id,
    groupIds: remainingIds
  });
  activeSeries.groups_list = updated;
  activeSeries.group = updated.length > 0 ? updated.map(g => g.name).join(', ') : 'Sin grupo / círculo';
  activeSeries.group_name = activeSeries.group;
  renderMangaGroupsFromSeries(activeSeries);
  refreshSeries();
  showToast('Grupo desvinculado de este manga');
}

function renderMangaParodiesFromSeries(series) {
  if (!mangaParodiesList) return;
  mangaParodiesList.innerHTML = '';
  const parodies = series.parodies_list || [];

  if (parodies.length === 0) {
    const emptySpan = document.createElement('span');
    emptySpan.textContent = series.parody || 'Sin serie / parodia';
    emptySpan.style.color = 'var(--text-muted)';
    emptySpan.style.fontSize = '0.85rem';
    mangaParodiesList.appendChild(emptySpan);
  } else {
    parodies.forEach(p => {
      const chip = document.createElement('span');
      chip.className = 'manga-meta-chip';
      chip.innerHTML = `
        <span>${escapeHtml(p.name)}</span>
        <button class="btn-remove-chip" data-id="${p.id}" title="Eliminar serie de este manga">×</button>
      `;
      chip.querySelector('.btn-remove-chip').addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleRemoveParodyFromSeries(p.id);
      });
      mangaParodiesList.appendChild(chip);
    });
  }
}

async function handleRemoveParodyFromSeries(parodyId) {
  if (!activeSeries) return;
  const currentList = activeSeries.parodies_list || [];
  const remainingIds = currentList.filter(p => p.id !== parodyId).map(p => p.id);
  const updated = await window.lecfalAPI.setSeriesParodies({
    seriesId: activeSeries.id,
    parodyIds: remainingIds
  });
  activeSeries.parodies_list = updated;
  activeSeries.parody = updated.map(p => p.name).join(', ');
  renderMangaParodiesFromSeries(activeSeries);
  refreshSeries();
  showToast('Serie / Parodia desvinculada de este manga');
}

function renderMangaLanguagesFromSeries(series) {
  if (!mangaLanguagesList) return;
  mangaLanguagesList.innerHTML = '';
  const langs = series.languages_list || [];

  if (langs.length === 0) {
    const emptySpan = document.createElement('span');
    emptySpan.textContent = series.language || 'Sin idioma asignado';
    emptySpan.style.color = 'var(--text-muted)';
    emptySpan.style.fontSize = '0.85rem';
    mangaLanguagesList.appendChild(emptySpan);
  } else {
    langs.forEach(l => {
      const chip = document.createElement('span');
      chip.className = 'manga-meta-chip';
      chip.innerHTML = `
        <span>${escapeHtml(l.name)}</span>
        <button class="btn-remove-chip" data-id="${l.id}" title="Eliminar idioma de este manga">×</button>
      `;
      chip.querySelector('.btn-remove-chip').addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleRemoveLanguageFromSeries(l.id);
      });
      mangaLanguagesList.appendChild(chip);
    });
  }
}

async function handleRemoveLanguageFromSeries(languageId) {
  if (!activeSeries) return;
  const currentList = activeSeries.languages_list || [];
  const remainingIds = currentList.filter(l => l.id !== languageId).map(l => l.id);
  const updated = await window.lecfalAPI.setSeriesLanguages({
    seriesId: activeSeries.id,
    languageIds: remainingIds
  });
  activeSeries.languages_list = updated;
  activeSeries.language = updated.map(l => l.name).join(', ');
  renderMangaLanguagesFromSeries(activeSeries);
  refreshSeries();
  showToast('Idioma desvinculado de este manga');
}

function renderMangaTagsFromSeries(series) {
  mangaTagsList.innerHTML = '';
  let tags = [];
  if (series.tags_list && Array.isArray(series.tags_list) && series.tags_list.length > 0) {
    tags = series.tags_list;
  } else if (series.tags) {
    tags = series.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => ({ id: null, name: t }));
  }

  tags.forEach(t => {
    const chip = document.createElement('span');
    chip.className = 'manga-tag-chip';
    chip.innerHTML = `
      <span>${escapeHtml(t.name)}</span>
      <button class="btn-remove-tag" data-tag-name="${escapeHtml(t.name)}" ${t.id ? `data-tag-id="${t.id}"` : ''} title="Eliminar tag de este manga">×</button>
    `;

    chip.querySelector('.btn-remove-tag').addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleRemoveTagFromSeries(t);
    });

    mangaTagsList.appendChild(chip);
  });
}

async function handleRemoveTagFromSeries(tagObj) {
  if (!activeSeries) return;

  if (tagObj.id) {
    const currentList = activeSeries.tags_list || [];
    const remainingIds = currentList.filter(t => t.id !== tagObj.id).map(t => t.id);
    const updated = await window.lecfalAPI.setSeriesTags({
      seriesId: activeSeries.id,
      tagIds: remainingIds
    });
    activeSeries.tags_list = updated;
    activeSeries.tags = updated.map(t => t.name).join(', ');
  } else {
    const currentTags = activeSeries.tags ? activeSeries.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const updated = currentTags.filter(t => t.toLowerCase() !== tagObj.name.toLowerCase());
    const updatedStr = updated.join(', ');
    await window.lecfalAPI.updateSeriesMetadata({
      seriesId: activeSeries.id,
      tags: updatedStr
    });
    activeSeries.tags = updatedStr;
    activeSeries.tags_list = updated.map(name => ({ id: null, name }));
  }
  renderMangaTagsFromSeries(activeSeries);
  refreshSeries();
  showToast(`Tag "${tagObj.name}" eliminado de este manga`);
}

function renderChaptersList() {
  chaptersList.innerHTML = '';

  let filtered = activeChapters;
  if (chapterFilterText) {
    filtered = activeChapters.filter(c =>
      c.title.toLowerCase().includes(chapterFilterText) ||
      c.file_name.toLowerCase().includes(chapterFilterText)
    );
  }

  if (filtered.length === 0) {
    chaptersList.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-dim); font-size: 0.88rem;">No se encontraron capítulos coincidentes</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  filtered.forEach(ch => {
    const row = document.createElement('div');
    row.className = `chapter-row ${ch.is_read ? 'is-read' : ''}`;
    row.dataset.id = ch.id;

    const formattedSize = formatBytes(ch.file_size);

    row.innerHTML = `
      <div class="chapter-left">
        <button class="btn-read-check ${ch.is_read ? 'checked' : ''}" title="${ch.is_read ? 'Marcar como no leído' : 'Marcar como leído'}">
          <svg viewBox="0 0 24 24" fill="${ch.is_read ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </button>
        <span class="chapter-title-text" title="${escapeHtml(ch.title)}">${escapeHtml(ch.title)}</span>
      </div>

      <div class="chapter-right">
        <span class="chapter-badge badge-${ch.format}">${(ch.format || 'CBZ').toUpperCase()}</span>
        <span class="chapter-size">${formattedSize}</span>
        <button class="btn-chapter-open" title="Abrir capítulo con el visor del sistema">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span>Leer</span>
        </button>
        <button class="btn-chapter-folder" title="Mostrar archivo en carpeta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      </div>
    `;

    // Toggle read status
    row.querySelector('.btn-read-check').addEventListener('click', async (e) => {
      e.stopPropagation();
      const isRead = await window.lecfalAPI.toggleChapterRead(ch.id);
      ch.is_read = isRead;
      row.classList.toggle('is-read', isRead === 1);
      const checkBtn = row.querySelector('.btn-read-check');
      checkBtn.classList.toggle('checked', isRead === 1);
      const checkSvg = checkBtn.querySelector('svg');
      checkSvg.setAttribute('fill', isRead === 1 ? 'currentColor' : 'none');
      updateChapterCounters();
    });

    // Open chapter
    const openHandler = async (e) => {
      e.stopPropagation();
      try {
        await window.lecfalAPI.openFile(ch.file_path);
        if (!ch.is_read) {
          await window.lecfalAPI.toggleChapterRead(ch.id);
          ch.is_read = 1;
          row.classList.add('is-read');
          row.querySelector('.btn-read-check').classList.add('checked');
          row.querySelector('.btn-read-check svg').setAttribute('fill', 'currentColor');
          updateChapterCounters();
        }
      } catch (err) {
        showToast('Error al abrir: ' + err.message);
      }
    };

    row.querySelector('.btn-chapter-open').addEventListener('click', openHandler);
    row.addEventListener('dblclick', openHandler);

    // Show in folder
    row.querySelector('.btn-chapter-folder').addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.lecfalAPI.showInFolder(ch.file_path);
    });

    fragment.appendChild(row);
  });

  chaptersList.appendChild(fragment);
}

function updateChapterCounters() {
  const total = activeChapters.length;
  const readCount = activeChapters.filter(c => c.is_read).length;
  chaptersCountBadge.textContent = `${total} capítulo${total === 1 ? '' : 's'}`;
  chaptersReadBadge.textContent = `${readCount} / ${total} leídos`;

  // Update Mark All Read button text
  btnMarkAllText.textContent = readCount === total ? 'Marcar todo no leído' : 'Marcar todo leído';

  // Update Start reading button
  const firstUnread = activeChapters.find(c => !c.is_read);
  if (firstUnread) {
    btnStartReadingText.textContent = `Continuar (${firstUnread.title})`;
  } else if (activeChapters.length > 0) {
    btnStartReadingText.textContent = `Releer (${activeChapters[0].title})`;
  } else {
    btnStartReadingText.textContent = 'Sin capítulos';
  }
}

// ==================== EDIT FIELD MODAL (AUTHOR / TITLE) ====================
function openEditFieldModal(fieldKey, titleText, labelText, initialValue) {
  currentEditField = fieldKey;
  editFieldModalTitle.textContent = titleText;
  editFieldLabel.textContent = labelText;
  editFieldInput.value = initialValue || '';
  modalEditField.style.display = 'flex';
  editFieldInput.focus();
}

function closeEditFieldModal() {
  modalEditField.style.display = 'none';
  currentEditField = null;
}

async function handleSaveEditField() {
  if (!activeSeries || !currentEditField) return;
  const val = editFieldInput.value.trim();

  if (currentEditField === 'title') {
    const finalTitle = val || activeSeries.title;
    await window.lecfalAPI.updateSeriesMetadata({
      seriesId: activeSeries.id,
      title: finalTitle
    });
    activeSeries.title = finalTitle;
    mangaHeroTitle.textContent = finalTitle;
    showToast('Título del manga actualizado');
    refreshSeries(false);
  } else if (currentEditField === 'author') {
    const finalAuthor = val || 'Desconocido';
    await window.lecfalAPI.updateSeriesMetadata({
      seriesId: activeSeries.id,
      author: finalAuthor
    });
    activeSeries.author = finalAuthor;
    mangaHeroAuthor.textContent = finalAuthor;
    showToast('Autor actualizado');
  }

  closeEditFieldModal();
}

// ==================== DEDICATED METADATA RENAME MODAL ====================
function openRenameModal({ type, id, currentName, typeLabel }) {
  pendingRenameConfig = { type, id, currentName, typeLabel };
  if (renameModalTitle) renameModalTitle.textContent = `Renombrar ${typeLabel || 'Metadato'}`;
  if (renameModalLabel) renameModalLabel.textContent = `Nuevo nombre para "${currentName}":`;
  if (renameModalInput) {
    renameModalInput.value = currentName;
  }
  if (renameModalError) {
    renameModalError.textContent = '';
    renameModalError.style.display = 'none';
  }
  if (modalRenameMetadata) {
    modalRenameMetadata.style.display = 'flex';
  }
  setTimeout(() => {
    if (renameModalInput) {
      renameModalInput.focus();
      renameModalInput.select();
    }
  }, 50);
}

function closeRenameModal() {
  if (modalRenameMetadata) modalRenameMetadata.style.display = 'none';
  pendingRenameConfig = null;
  if (renameModalError) {
    renameModalError.textContent = '';
    renameModalError.style.display = 'none';
  }
}

async function handleConfirmRename() {
  if (!pendingRenameConfig) return;
  const { type, id, currentName } = pendingRenameConfig;
  const newName = renameModalInput ? renameModalInput.value.trim() : '';

  if (!newName) {
    if (renameModalError) {
      renameModalError.textContent = 'El nombre no puede estar vacío.';
      renameModalError.style.display = 'block';
    }
    return;
  }

  if (newName === currentName) {
    closeRenameModal();
    return;
  }

  try {
    if (type === 'tag') {
      await window.lecfalAPI.renameTag(id, newName);
      showToast(`Tag renombrado a "${newName}"`);
      await renderSettingsTags();
      await populateAdvSearchTags();
    } else if (type === 'author') {
      await window.lecfalAPI.renameAuthor(id, newName);
      showToast(`Autor renombrado a "${newName}"`);
      await renderSettingsAuthors();
      await populateAdvSearchAuthors();
    } else if (type === 'group') {
      await window.lecfalAPI.renameGroup(id, newName);
      showToast(`Grupo renombrado a "${newName}"`);
      await renderSettingsGroups();
      await populateAdvSearchGroups();
    } else if (type === 'language') {
      await window.lecfalAPI.renameLanguage(id, newName);
      showToast(`Idioma renombrado a "${newName}"`);
      await renderSettingsLanguages();
      await populateAdvSearchLanguages();
    } else if (type === 'parody') {
      await window.lecfalAPI.renameParody(id, newName);
      showToast(`Serie / Parodia renombrada a "${newName}"`);
      await renderSettingsParodies();
      await populateAdvSearchParodies();
    }

    closeRenameModal();

    if (activeSeries) {
      await reloadActiveSeries();
    }
    refreshSeries(false);
  } catch (err) {
    console.error('Error renaming metadata:', err);
    if (renameModalError) {
      renameModalError.textContent = err.message || 'Error al renombrar';
      renameModalError.style.display = 'block';
    } else {
      showToast(`Error: ${err.message}`);
    }
  }
}

// ==================== GRID SIZE CONTROLS ====================
function applyGridSize(pxVal, save = true) {
  document.documentElement.style.setProperty('--grid-item-min-width', `${pxVal}px`);
  sizeSlider.value = pxVal;

  document.querySelectorAll('.size-btn').forEach(btn => btn.classList.remove('active'));
  if (pxVal <= 145) {
    document.querySelector('.size-btn[data-size="small"]')?.classList.add('active');
  } else if (pxVal >= 230) {
    document.querySelector('.size-btn[data-size="large"]')?.classList.add('active');
  } else {
    document.querySelector('.size-btn[data-size="medium"]')?.classList.add('active');
  }

  if (save) {
    window.lecfalAPI.setSetting('grid_size', pxVal);
  }
}

// ==================== FOLDERS & SCANNING ====================
async function refreshFolders() {
  try {
    folders = await window.lecfalAPI.getFolders();
    if (statusFolderCount) {
      statusFolderCount.textContent = `${folders.length} carpeta${folders.length === 1 ? '' : 's'}`;
    }

    if (folders.length > 0) {
      const defaultFolder = folders[0];
      if (currentFolderName) {
        currentFolderName.textContent = defaultFolder.name || defaultFolder.path;
        currentFolderName.title = defaultFolder.path;
      }
      if (btnRescan) btnRescan.style.display = 'inline-flex';
    } else {
      if (currentFolderName) {
        currentFolderName.textContent = 'Sin carpeta asignada';
        currentFolderName.title = '';
      }
      if (btnRescan) btnRescan.style.display = 'none';
    }
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

async function handleRescan() {
  if (isScanning || folders.length === 0) return;
  await runAllScan('incremental');
}

// Scan UI lifecycle management
let finishTimer = null;
function finishScanUI(isCancelled) {
  isScanning = false;
  isCancelling = false;
  btnRescan.classList.remove('scanning');
  logIndicatorDot.classList.remove('active');
  scanProgressBanner.classList.remove('cancelling');

  if (btnCancelScan) {
    btnCancelScan.disabled = false;
    btnCancelScan.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      <span>Cancelar</span>
    `;
  }

  if (isCancelled) {
    scanBannerTitle.textContent = 'Escaneo cancelado';
    scanBannerFile.textContent = 'Operación detenida por el usuario.';
  } else {
    scanBannerTitle.textContent = 'Escaneo completado';
  }

  if (finishTimer) clearTimeout(finishTimer);
  finishTimer = setTimeout(() => {
    scanProgressBanner.style.display = 'none';
  }, 1500);

  // Guarantee final refresh with clean state
  scheduleSeriesRefresh(true);
}

function setupScanStatusListener() {
  if (window.lecfalAPI.onScanStatus) {
    window.lecfalAPI.onScanStatus((data) => {
      if (data.status === 'cancelling') {
        isCancelling = true;
        scanBannerTitle.textContent = 'Cancelando escaneo...';
        scanBannerFile.textContent = 'Deteniendo procesos y guardando progreso...';
        scanProgressBanner.classList.add('cancelling');
        if (btnCancelScan) {
          btnCancelScan.disabled = true;
          btnCancelScan.innerHTML = '<span>Cancelando...</span>';
        }
      } else if (data.status === 'cancelled') {
        finishScanUI(true);
      } else if (data.status === 'completed') {
        finishScanUI(false);
      }
    });
  }
}

async function runFolderScan(folderId, mode = 'incremental') {
  if (isScanning) return;
  isScanning = true;
  isCancelling = false;
  scanProgressBanner.classList.remove('cancelling');
  scanProgressBanner.style.display = 'block';
  scanProgressBar.style.width = '0%';
  scanBannerCount.textContent = '0/0';
  scanBannerTitle.textContent = 'Iniciando escaneo...';
  scanBannerFile.textContent = 'Analizando estructura de carpetas...';
  btnRescan.classList.add('scanning');
  logIndicatorDot.classList.add('active');

  if (btnCancelScan) {
    btnCancelScan.disabled = false;
    btnCancelScan.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      <span>Cancelar</span>
    `;
  }

  try {
    const result = await window.lecfalAPI.scanFolder(folderId, { mode });
    if (result.unavailable) {
      showToast('Carpeta no disponible (disco externo o volumen VeraCrypt desmontado)');
      finishScanUI(false);
    } else if (result.cancelled) {
      showToast('Escaneo cancelado por el usuario');
      finishScanUI(true);
    } else {
      if (result.newFiles > 0 || result.modifiedFiles > 0) {
        showToast(`Escaneo finalizado: +${result.newFiles} nuevos, ${result.modifiedFiles} actualizados (${result.totalScanTime})`);
      } else {
        showToast(`Biblioteca al día: ${result.skippedFiles || result.count} archivos verificados (0 cambios)`);
      }
      finishScanUI(false);
    }
  } catch (err) {
    console.error('Scan error:', err);
    showToast('Error durante el escaneo');
    finishScanUI(false);
  }
}

async function runAllScan(mode = 'incremental') {
  if (isScanning) return;
  isScanning = true;
  isCancelling = false;
  scanProgressBanner.classList.remove('cancelling');
  scanProgressBanner.style.display = 'block';
  scanProgressBar.style.width = '0%';
  scanBannerCount.textContent = '0/0';
  scanBannerTitle.textContent = 'Iniciando escaneo...';
  scanBannerFile.textContent = 'Analizando biblioteca...';
  btnRescan.classList.add('scanning');
  logIndicatorDot.classList.add('active');

  if (btnCancelScan) {
    btnCancelScan.disabled = false;
    btnCancelScan.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      <span>Cancelar</span>
    `;
  }

  const modeLabel = mode === 'full' ? 'completo' : 'incremental';
  showToast(`Iniciando escaneo ${modeLabel}...`);

  try {
    const result = await window.lecfalAPI.scanAll({ mode });
    if (result.cancelled) {
      showToast('Escaneo cancelado por el usuario');
      finishScanUI(true);
    } else {
      if (result.newFiles > 0 || result.modifiedFiles > 0) {
        showToast(`Escaneo finalizado: +${result.newFiles} nuevos, ${result.modifiedFiles} actualizados (${result.totalScanned} mangas)`);
      } else {
        showToast(`Biblioteca al día: ${result.skippedFiles || result.totalScanned} archivos verificados (0 cambios)`);
      }
      finishScanUI(false);
    }
  } catch (err) {
    console.error('Scan all error:', err);
    showToast('Error al escanear carpetas');
    finishScanUI(false);
  }
}

let latestProgressData = null;
let progressRafScheduled = false;

function setupScanProgressListener() {
  window.lecfalAPI.onScanProgress((data) => {
    latestProgressData = data;
    if (!progressRafScheduled) {
      progressRafScheduled = true;
      requestAnimationFrame(() => {
        progressRafScheduled = false;
        if (!latestProgressData || isCancelling) return;
        const d = latestProgressData;
        scanBannerTitle.textContent = `Escaneando: ${d.folderName || 'Carpeta'}`;
        scanBannerFile.textContent = `${d.file || ''} (${d.durationMs ? d.durationMs + 'ms' : ''})`;
        const percent = d.total > 0 ? Math.round((d.current / d.total) * 100) : 0;
        scanProgressBar.style.width = `${percent}%`;
        scanBannerCount.textContent = `${d.current}/${d.total}`;
      });
    }
  });
}

// ==================== SERIES & GRID RENDERING ====================
// Throttled and concurrency-safe grid refreshing
let isRefreshingSeries = false;
let hasPendingSeriesRefresh = false;
let lastSeriesRefreshTime = 0;
let seriesRefreshTimer = null;

function scheduleSeriesRefresh(immediate = false) {
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
      if (currentView === 'library') {
        refreshSeries(false);
      }
    }, MIN_INTERVAL - timeSinceLast);
  }
}

async function refreshSeries(triggerPdfCover = true) {
  if (isRefreshingSeries) {
    hasPendingSeriesRefresh = true;
    return;
  }
  isRefreshingSeries = true;

  try {
    const queryParams = {
      searchQuery,
      format: currentFilter === 'favorite' ? 'all' : currentFilter,
      favoriteOnly: currentFilter === 'favorite',
      sortBy: currentSort,
      advTitle: activeAdvFilters.title || undefined,
      authorId: activeAdvFilters.authorId ? parseInt(activeAdvFilters.authorId, 10) : undefined,
      advAuthor: activeAdvFilters.author || undefined,
      groupId: activeAdvFilters.groupId ? parseInt(activeAdvFilters.groupId, 10) : undefined,
      advGroup: activeAdvFilters.group || undefined,
      parodyId: activeAdvFilters.parodyId ? parseInt(activeAdvFilters.parodyId, 10) : undefined,
      advParody: activeAdvFilters.parody || undefined,
      tagId: activeAdvFilters.tagId ? parseInt(activeAdvFilters.tagId, 10) : undefined,
      languageId: activeAdvFilters.languageId ? parseInt(activeAdvFilters.languageId, 10) : undefined,
      advLanguage: activeAdvFilters.language || undefined
    };

    seriesList = await window.lecfalAPI.getSeries(queryParams);

    await updateCounters();

    if (folders.length === 0) {
      emptyStateNoFolders.style.display = 'flex';
      emptyStateNoResults.style.display = 'none';
      comicsGrid.style.display = 'none';
      statusCount.textContent = '0 mangas';
      return;
    }

    emptyStateNoFolders.style.display = 'none';

    if (seriesList.length === 0) {
      emptyStateNoResults.style.display = 'flex';
      comicsGrid.style.display = 'none';
      statusCount.textContent = '0 mangas';
      return;
    }

    emptyStateNoResults.style.display = 'none';
    comicsGrid.style.display = 'grid';
    statusCount.textContent = `${seriesList.length} manga${seriesList.length === 1 ? '' : 's'}`;

    renderGrid(seriesList);
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

async function updateCounters() {
  const allSeries = await window.lecfalAPI.getSeries({ format: 'all' });
  let cbzCount = 0;
  let pdfCount = 0;
  let favCount = 0;

  for (const s of allSeries) {
    if (s.primary_format === 'cbz') cbzCount++;
    if (s.primary_format === 'pdf') pdfCount++;
    if (s.favorite) favCount++;
  }

  countAll.textContent = allSeries.length;
  countCbz.textContent = cbzCount;
  countPdf.textContent = pdfCount;
  countFav.textContent = favCount;
}

function renderGrid(seriesArray) {
  comicsGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  seriesArray.forEach(series => {
    const card = document.createElement('article');
    card.className = 'comic-card';
    card.dataset.id = series.id;
    card.tabIndex = 0;

    const isFav = series.favorite === 1;
    const formatUpper = (series.primary_format || 'CBZ').toUpperCase();
    const capsLabel = `${series.chapter_count} cap${series.chapter_count === 1 ? '' : 's'}`;

    let coverHtml = '';
    if (series.cover_path) {
      const coverUrl = getCoverUrl(series.cover_path);
      coverHtml = `<img class="card-cover-img" src="${coverUrl}" alt="${escapeHtml(series.title)}" loading="lazy">`;
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
          console.warn(`[LecFal UI] Fallo al cargar portada para "${series.title}" (${series.cover_path})`);
          const fallbackContainer = document.createElement('div');
          fallbackContainer.innerHTML = renderCoverFallbackHtml(series.title, series.primary_format);
          imgEl.replaceWith(fallbackContainer.firstElementChild);
        }, { once: true });
      }
    }

    // Click on card: open Tachiyomi-style manga detail view
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-fav-btn')) return;
      openMangaView(series.id);
    });

    // Favorite toggle
    const favBtn = card.querySelector('.card-fav-btn');
    favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const newFavState = await window.lecfalAPI.toggleSeriesFavorite(series.id);
      series.favorite = newFavState;
      favBtn.classList.toggle('is-favorite', newFavState === 1);
      const heartSvg = favBtn.querySelector('svg');
      heartSvg.setAttribute('fill', newFavState === 1 ? 'currentColor' : 'none');
      updateCounters();
    });

    fragment.appendChild(card);
  });

  comicsGrid.appendChild(fragment);
}

// ==================== LOGGING & DIAGNOSTICS ====================
function setupLogging() {
  btnToggleLogs.addEventListener('click', () => {
    const isHidden = logDrawer.style.display === 'none';
    logDrawer.style.display = isHidden ? 'flex' : 'none';
    btnToggleLogs.classList.toggle('active', isHidden);
    if (isHidden) {
      logTerminal.scrollTop = logTerminal.scrollHeight;
    }
  });

  btnCloseLogDrawer.addEventListener('click', () => {
    logDrawer.style.display = 'none';
    btnToggleLogs.classList.remove('active');
  });

  btnOpenLogFile.addEventListener('click', async () => {
    await window.lecfalAPI.openLogFile();
  });

  btnClearLogs.addEventListener('click', async () => {
    await window.lecfalAPI.clearLogs();
    logTerminal.innerHTML = '';
    logCount = 0;
    logCountBadge.textContent = '0 eventos';
  });

  window.lecfalAPI.onLog((entryOrBatch) => {
    appendLogsToTerminal(entryOrBatch);
  });

  // Streaming real-time series during scanning (throttled to avoid DOM thrashing)
  window.lecfalAPI.onSeriesBatch(() => {
    if (currentView === 'library') {
      scheduleSeriesRefresh(false);
    }
  });

  window.lecfalAPI.getLogs().then(logs => {
    if (Array.isArray(logs)) {
      appendLogsToTerminal(logs);
    }
  });
}

function appendLogsToTerminal(entries) {
  if (!Array.isArray(entries)) {
    entries = [entries];
  }
  if (entries.length === 0) return;

  logCount += entries.length;
  logCountBadge.textContent = `${logCount} eventos`;

  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const line = document.createElement('div');
    line.className = 'log-line';

    const levelClass = `log-level-${(entry.level || 'info').toLowerCase()}`;
    line.innerHTML = `
      <span class="log-time">${entry.timestamp || ''}</span>
      <span class="log-level ${levelClass}">[${entry.level || 'INFO'}]</span>
      <span class="log-tag">[${escapeHtml(entry.tag || 'APP')}]</span>
      <span class="log-msg">${escapeHtml(entry.message || '')}</span>
    `;
    fragment.appendChild(line);
  }

  logTerminal.appendChild(fragment);

  // Keep terminal lightweight: max 150 entries in DOM
  while (logTerminal.children.length > 150) {
    logTerminal.removeChild(logTerminal.firstElementChild);
  }

  if (logDrawer.style.display !== 'none') {
    const isNearBottom = logTerminal.scrollHeight - logTerminal.clientHeight - logTerminal.scrollTop < 120;
    if (isNearBottom) {
      logTerminal.scrollTop = logTerminal.scrollHeight;
    }
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

// ==================== THEME MANAGEMENT ====================
function applyTheme(theme, save = true) {
  const finalTheme = theme === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = finalTheme;

  if (themeOptDark && themeOptLight) {
    themeOptDark.classList.toggle('active', finalTheme === 'dark');
    themeOptLight.classList.toggle('active', finalTheme === 'light');
    const darkBadge = themeOptDark.querySelector('.theme-card-badge');
    const lightBadge = themeOptLight.querySelector('.theme-card-badge');
    if (darkBadge) darkBadge.style.display = finalTheme === 'dark' ? 'inline-block' : 'none';
    if (lightBadge) lightBadge.style.display = finalTheme === 'light' ? 'inline-block' : 'none';
  }

  if (save) {
    window.lecfalAPI.setSetting('theme', finalTheme);
    showToast(`Tema cambiado a ${finalTheme === 'dark' ? 'Modo Oscuro' : 'Modo Claro'}`);
  }
}

// ==================== ADVANCED SEARCH ====================
async function populateAdvSearchOptions() {
  await Promise.all([
    populateAdvSearchAuthors(),
    populateAdvSearchGroups(),
    populateAdvSearchParodies(),
    populateAdvSearchTags(),
    populateAdvSearchLanguages()
  ]);
}

async function populateAdvSearchAuthors() {
  if (!advSelectAuthor) return;
  try {
    availableAuthors = await window.lecfalAPI.getAllAuthors();
    const currentVal = advSelectAuthor.value;
    advSelectAuthor.innerHTML = '<option value="">Todos los autores</option>';
    availableAuthors.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      if (currentVal && String(currentVal) === String(a.id)) {
        opt.selected = true;
      }
      advSelectAuthor.appendChild(opt);
    });
  } catch (e) {
    console.warn('Error populating adv search authors:', e);
  }
}

async function populateAdvSearchGroups() {
  if (!advSelectGroup) return;
  try {
    availableGroups = await window.lecfalAPI.getAllGroups();
    const currentVal = advSelectGroup.value;
    advSelectGroup.innerHTML = '<option value="">Todos los grupos</option>';
    availableGroups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      if (currentVal && String(currentVal) === String(g.id)) {
        opt.selected = true;
      }
      advSelectGroup.appendChild(opt);
    });
  } catch (e) {
    console.warn('Error populating adv search groups:', e);
  }
}

async function populateAdvSearchParodies() {
  if (!advSelectParody) return;
  try {
    availableParodies = await window.lecfalAPI.getAllParodies();
    const currentVal = advSelectParody.value;
    advSelectParody.innerHTML = '<option value="">Todas las series / parodias</option>';
    availableParodies.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (currentVal && String(currentVal) === String(p.id)) {
        opt.selected = true;
      }
      advSelectParody.appendChild(opt);
    });
  } catch (e) {
    console.warn('Error populating adv search parodies:', e);
  }
}

async function populateAdvSearchTags() {
  if (!advSelectTag) return;
  try {
    availableTags = await window.lecfalAPI.getAllTags();
    const currentVal = advSelectTag.value;
    advSelectTag.innerHTML = '<option value="">Todos los tags</option>';
    availableTags.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      if (currentVal && String(currentVal) === String(t.id)) {
        opt.selected = true;
      }
      advSelectTag.appendChild(opt);
    });
  } catch (e) {
    console.warn('Error populating adv search tags:', e);
  }
}

async function populateAdvSearchLanguages() {
  if (!advSelectLanguage) return;
  try {
    availableLanguages = await window.lecfalAPI.getAllLanguages();
    const currentVal = advSelectLanguage.value;
    advSelectLanguage.innerHTML = '<option value="">Todos los idiomas</option>';
    availableLanguages.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      if (currentVal && String(currentVal) === String(l.id)) {
        opt.selected = true;
      }
      advSelectLanguage.appendChild(opt);
    });
  } catch (e) {
    console.warn('Error populating adv search languages:', e);
  }
}

function hasActiveAdvFilters() {
  return !!(
    activeAdvFilters.title ||
    activeAdvFilters.authorId ||
    activeAdvFilters.author ||
    activeAdvFilters.groupId ||
    activeAdvFilters.group ||
    activeAdvFilters.parodyId ||
    activeAdvFilters.parody ||
    activeAdvFilters.tagId ||
    activeAdvFilters.languageId ||
    activeAdvFilters.language
  );
}

function updateAdvSearchUIState() {
  const isActive = hasActiveAdvFilters();
  if (advActiveBadge) advActiveBadge.style.display = isActive ? 'inline-flex' : 'none';
  if (btnToggleAdvSearch) btnToggleAdvSearch.classList.toggle('active', isActive);
}

function toggleAdvancedSearchPanel(forceState) {
  if (!advSearchPanel) return;
  const isCurrentlyOpen = advSearchPanel.style.display !== 'none';
  const shouldOpen = forceState !== undefined ? forceState : !isCurrentlyOpen;
  advSearchPanel.style.display = shouldOpen ? 'block' : 'none';
  if (shouldOpen && advInputTitle) {
    advInputTitle.focus();
  }
}

function handleApplyAdvancedSearch() {
  if (!advInputTitle) return;
  activeAdvFilters.title = advInputTitle.value.trim();
  activeAdvFilters.authorId = advSelectAuthor ? advSelectAuthor.value : '';
  activeAdvFilters.groupId = advSelectGroup ? advSelectGroup.value : '';
  activeAdvFilters.parodyId = advSelectParody ? advSelectParody.value : '';
  activeAdvFilters.tagId = advSelectTag ? advSelectTag.value : '';
  activeAdvFilters.languageId = advSelectLanguage ? advSelectLanguage.value : '';

  updateAdvSearchUIState();
  refreshSeries();
}

function handleClearAdvancedSearch() {
  if (advInputTitle) advInputTitle.value = '';
  if (advSelectAuthor) advSelectAuthor.value = '';
  if (advSelectGroup) advSelectGroup.value = '';
  if (advSelectParody) advSelectParody.value = '';
  if (advSelectTag) advSelectTag.value = '';
  if (advSelectLanguage) advSelectLanguage.value = '';

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
  refreshSeries();
}

// ==================== SETTINGS VIEW: CATALOGS & FOLDERS ====================
async function renderSettingsTags() {
  if (!settingsTagsList) return;
  try {
    availableTags = await window.lecfalAPI.getAllTags();

    if (availableTags.length === 0) {
      settingsTagsList.innerHTML = `
        <div class="settings-tags-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:36px;height:36px;margin-bottom:8px;opacity:0.4;">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          <p>No hay tags creados todavía.</p>
          <span style="font-size:0.82rem; color:var(--text-muted);">Usa el formulario superior para registrar tags y géneros para tu biblioteca.</span>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    availableTags.forEach(t => {
      const row = document.createElement('div');
      row.className = 'settings-tag-row';
      row.dataset.id = t.id;
      row.innerHTML = `
        <div class="tag-row-name">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--accent-purple-light);">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          <span class="tag-name-text">${escapeHtml(t.name)}</span>
          ${t.manga_count ? `<span class="settings-tag-count">${t.manga_count}</span>` : ''}
        </div>
        <div class="tag-row-actions">
          <button class="btn btn-secondary btn-sm btn-rename-tag" data-id="${t.id}" title="Renombrar tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span>Renombrar</span>
          </button>
          <button class="btn btn-danger btn-sm btn-delete-tag" data-id="${t.id}" title="Eliminar tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
            <span>Eliminar</span>
          </button>
        </div>
      `;

      row.querySelector('.btn-rename-tag').addEventListener('click', () => {
        openRenameModal({ type: 'tag', id: t.id, currentName: t.name, typeLabel: 'Tag' });
      });

      row.querySelector('.btn-delete-tag').addEventListener('click', async () => {
        if (confirm(`¿Eliminar el tag "${t.name}"?\nSe desvinculará de los mangas asignados de forma segura.`)) {
          try {
            await window.lecfalAPI.deleteTag(t.id);
            showToast(`Tag "${t.name}" eliminado`);
            await renderSettingsTags();
            await populateAdvSearchTags();
            if (activeSeries) await reloadActiveSeries();
            refreshSeries(false);
          } catch (err) {
            showToast(`Error: ${err.message}`);
          }
        }
      });

      fragment.appendChild(row);
    });

    settingsTagsList.innerHTML = '';
    settingsTagsList.appendChild(fragment);
  } catch (err) {
    console.error('Error rendering settings tags:', err);
  }
}

async function handleCreateTag(e) {
  e.preventDefault();
  const name = inputNewTagName.value.trim();
  if (!name) return;

  try {
    const newTag = await window.lecfalAPI.createTag(name);
    inputNewTagName.value = '';
    showToast(`Tag "${newTag.name}" creado exitosamente`);
    await renderSettingsTags();
    await populateAdvSearchTags();
    if (activeSeries) await reloadActiveSeries();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function renderSettingsAuthors() {
  if (!settingsAuthorsList) return;
  try {
    availableAuthors = await window.lecfalAPI.getAllAuthors();

    if (availableAuthors.length === 0) {
      settingsAuthorsList.innerHTML = `
        <div class="settings-tags-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:36px;height:36px;margin-bottom:8px;opacity:0.4;">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <p>No hay autores registrados todavía.</p>
          <span style="font-size:0.82rem; color:var(--text-muted);">Añade autores oficiales para tu biblioteca usando el formulario superior.</span>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    availableAuthors.forEach(a => {
      const row = document.createElement('div');
      row.className = 'settings-tag-row';
      row.dataset.id = a.id;
      row.innerHTML = `
        <div class="tag-row-name">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--accent-purple-light);">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span class="tag-name-text">${escapeHtml(a.name)}</span>
          ${a.manga_count ? `<span class="settings-tag-count">${a.manga_count}</span>` : ''}
        </div>
        <div class="tag-row-actions">
          <button class="btn btn-secondary btn-sm btn-rename-author" data-id="${a.id}" title="Renombrar autor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span>Renombrar</span>
          </button>
          <button class="btn btn-danger btn-sm btn-delete-author" data-id="${a.id}" title="Eliminar autor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
            <span>Eliminar</span>
          </button>
        </div>
      `;

      row.querySelector('.btn-rename-author').addEventListener('click', () => {
        openRenameModal({ type: 'author', id: a.id, currentName: a.name, typeLabel: 'Autor' });
      });

      row.querySelector('.btn-delete-author').addEventListener('click', async () => {
        if (confirm(`¿Eliminar el autor "${a.name}"?\nSe desvinculará de los mangas asignados de forma segura.`)) {
          try {
            await window.lecfalAPI.deleteAuthor(a.id);
            showToast(`Autor "${a.name}" eliminado`);
            await renderSettingsAuthors();
            await populateAdvSearchAuthors();
            if (activeSeries) await reloadActiveSeries();
            refreshSeries(false);
          } catch (err) {
            showToast(`Error: ${err.message}`);
          }
        }
      });

      fragment.appendChild(row);
    });

    settingsAuthorsList.innerHTML = '';
    settingsAuthorsList.appendChild(fragment);
  } catch (err) {
    console.error('Error rendering settings authors:', err);
  }
}

async function handleCreateAuthor(e) {
  e.preventDefault();
  const name = inputNewAuthorName.value.trim();
  if (!name) return;

  try {
    const newAuthor = await window.lecfalAPI.createAuthor(name);
    inputNewAuthorName.value = '';
    showToast(`Autor "${newAuthor.name}" creado exitosamente`);
    await renderSettingsAuthors();
    await populateAdvSearchAuthors();
    if (activeSeries) await reloadActiveSeries();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function renderSettingsGroups() {
  if (!settingsGroupsList) return;
  try {
    availableGroups = await window.lecfalAPI.getAllGroups();

    if (availableGroups.length === 0) {
      settingsGroupsList.innerHTML = `
        <div class="settings-tags-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:36px;height:36px;margin-bottom:8px;opacity:0.4;">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p>No hay grupos o círculos configurados todavía.</p>
          <span style="font-size:0.82rem; color:var(--text-muted);">Añade círculos, editoriales o grupos usando el formulario superior.</span>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    availableGroups.forEach(g => {
      const row = document.createElement('div');
      row.className = 'settings-tag-row';
      row.dataset.id = g.id;
      row.innerHTML = `
        <div class="tag-row-name">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--accent-purple-light);">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span class="tag-name-text">${escapeHtml(g.name)}</span>
          ${g.manga_count ? `<span class="settings-tag-count">${g.manga_count}</span>` : ''}
        </div>
        <div class="tag-row-actions">
          <button class="btn btn-secondary btn-sm btn-rename-group" data-id="${g.id}" title="Renombrar grupo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span>Renombrar</span>
          </button>
          <button class="btn btn-danger btn-sm btn-delete-group" data-id="${g.id}" title="Eliminar grupo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
            <span>Eliminar</span>
          </button>
        </div>
      `;

      row.querySelector('.btn-rename-group').addEventListener('click', () => {
        openRenameModal({ type: 'group', id: g.id, currentName: g.name, typeLabel: 'Grupo' });
      });

      row.querySelector('.btn-delete-group').addEventListener('click', async () => {
        if (confirm(`¿Eliminar el grupo "${g.name}"?\nSe desvinculará de los mangas asignados de forma segura.`)) {
          try {
            await window.lecfalAPI.deleteGroup(g.id);
            showToast(`Grupo "${g.name}" eliminado`);
            await renderSettingsGroups();
            await populateAdvSearchGroups();
            if (activeSeries) await reloadActiveSeries();
            refreshSeries(false);
          } catch (err) {
            showToast(`Error: ${err.message}`);
          }
        }
      });

      fragment.appendChild(row);
    });

    settingsGroupsList.innerHTML = '';
    settingsGroupsList.appendChild(fragment);
  } catch (err) {
    console.error('Error rendering settings groups:', err);
  }
}

async function handleCreateGroup(e) {
  e.preventDefault();
  const name = inputNewGroupName.value.trim();
  if (!name) return;

  try {
    const newGroup = await window.lecfalAPI.createGroup(name);
    inputNewGroupName.value = '';
    showToast(`Grupo "${newGroup.name}" creado exitosamente`);
    await renderSettingsGroups();
    await populateAdvSearchGroups();
    if (activeSeries) await reloadActiveSeries();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function renderSettingsLanguages() {
  if (!settingsLanguagesList) return;
  try {
    availableLanguages = await window.lecfalAPI.getAllLanguages();

    if (availableLanguages.length === 0) {
      settingsLanguagesList.innerHTML = `
        <div class="settings-tags-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:36px;height:36px;margin-bottom:8px;opacity:0.4;">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
          </svg>
          <p>No hay idiomas configurados todavía.</p>
          <span style="font-size:0.82rem; color:var(--text-muted);">Añade los idiomas disponibles para tu biblioteca usando el formulario superior.</span>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    availableLanguages.forEach(l => {
      const row = document.createElement('div');
      row.className = 'settings-tag-row';
      row.dataset.id = l.id;
      row.innerHTML = `
        <div class="tag-row-name">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--accent-purple-light);">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
          </svg>
          <span class="tag-name-text">${escapeHtml(l.name)}</span>
          ${l.manga_count ? `<span class="settings-tag-count">${l.manga_count}</span>` : ''}
        </div>
        <div class="tag-row-actions">
          <button class="btn btn-secondary btn-sm btn-rename-lang" data-id="${l.id}" title="Renombrar idioma">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span>Renombrar</span>
          </button>
          <button class="btn btn-danger btn-sm btn-delete-lang" data-id="${l.id}" title="Eliminar idioma">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
            <span>Eliminar</span>
          </button>
        </div>
      `;

      row.querySelector('.btn-rename-lang').addEventListener('click', () => {
        openRenameModal({ type: 'language', id: l.id, currentName: l.name, typeLabel: 'Idioma' });
      });

      row.querySelector('.btn-delete-lang').addEventListener('click', async () => {
        if (confirm(`¿Eliminar el idioma "${l.name}"?\nSe desvinculará de los mangas asignados de forma segura.`)) {
          try {
            await window.lecfalAPI.deleteLanguage(l.id);
            showToast(`Idioma "${l.name}" eliminado`);
            await renderSettingsLanguages();
            await populateAdvSearchLanguages();
            if (activeSeries) await reloadActiveSeries();
            refreshSeries(false);
          } catch (err) {
            showToast(`Error: ${err.message}`);
          }
        }
      });

      fragment.appendChild(row);
    });

    settingsLanguagesList.innerHTML = '';
    settingsLanguagesList.appendChild(fragment);
  } catch (err) {
    console.error('Error rendering settings languages:', err);
  }
}

async function handleCreateLanguage(e) {
  e.preventDefault();
  const name = inputNewLanguageName.value.trim();
  if (!name) return;

  try {
    const newLang = await window.lecfalAPI.createLanguage(name);
    inputNewLanguageName.value = '';
    showToast(`Idioma "${newLang.name}" creado exitosamente`);
    await renderSettingsLanguages();
    await populateAdvSearchLanguages();
    if (activeSeries) await reloadActiveSeries();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function renderSettingsParodies() {
  if (!settingsParodiesList) return;
  try {
    availableParodies = await window.lecfalAPI.getAllParodies();

    if (availableParodies.length === 0) {
      settingsParodiesList.innerHTML = `
        <div class="settings-tags-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:36px;height:36px;margin-bottom:8px;opacity:0.4;">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <p>No hay series o parodias registradas todavía.</p>
          <span style="font-size:0.82rem; color:var(--text-muted);">Añade series o parodias (ej. Original, Naruto) usando el formulario superior.</span>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    availableParodies.forEach(p => {
      const row = document.createElement('div');
      row.className = 'settings-tag-row';
      row.dataset.id = p.id;
      row.innerHTML = `
        <div class="tag-row-name">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--accent-purple-light);">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <span class="tag-name-text">${escapeHtml(p.name)}</span>
          ${p.manga_count ? `<span class="settings-tag-count">${p.manga_count}</span>` : ''}
        </div>
        <div class="tag-row-actions">
          <button class="btn btn-secondary btn-sm btn-rename-parody" data-id="${p.id}" title="Renombrar serie o parodia">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span>Renombrar</span>
          </button>
          <button class="btn btn-danger btn-sm btn-delete-parody" data-id="${p.id}" title="Eliminar serie o parodia">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
            <span>Eliminar</span>
          </button>
        </div>
      `;

      row.querySelector('.btn-rename-parody').addEventListener('click', () => {
        openRenameModal({ type: 'parody', id: p.id, currentName: p.name, typeLabel: 'Serie o Parodia' });
      });

      row.querySelector('.btn-delete-parody').addEventListener('click', async () => {
        if (confirm(`¿Eliminar la serie o parodia "${p.name}"?\nSe desvinculará de los mangas asignados de forma segura.`)) {
          try {
            await window.lecfalAPI.deleteParody(p.id);
            showToast(`Serie / Parodia "${p.name}" eliminada`);
            await renderSettingsParodies();
            await populateAdvSearchParodies();
            if (activeSeries) await reloadActiveSeries();
            refreshSeries(false);
          } catch (err) {
            showToast(`Error: ${err.message}`);
          }
        }
      });

      fragment.appendChild(row);
    });

    settingsParodiesList.innerHTML = '';
    settingsParodiesList.appendChild(fragment);
  } catch (err) {
    console.error('Error rendering settings parodies:', err);
  }
}

async function handleCreateParody(e) {
  e.preventDefault();
  const name = inputNewParodyName.value.trim();
  if (!name) return;

  try {
    const newParody = await window.lecfalAPI.createParody(name);
    inputNewParodyName.value = '';
    showToast(`Serie / Parodia "${newParody.name}" creada exitosamente`);
    await renderSettingsParodies();
    await populateAdvSearchParodies();
    if (activeSeries) await reloadActiveSeries();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function renderSettingsFolders() {
  if (!settingsFoldersList) return;
  try {
    folders = await window.lecfalAPI.getFolders();
    if (statusFolderCount) {
      statusFolderCount.textContent = `${folders.length} carpeta${folders.length === 1 ? '' : 's'}`;
    }

    if (folders.length === 0) {
      settingsFoldersList.innerHTML = `
        <div class="settings-folders-empty">
          <p>No hay carpetas registradas en la biblioteca.</p>
          <span style="font-size: 0.82rem; color: var(--text-muted);">Añade una carpeta para comenzar a escanear tus cómics y mangas.</span>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    folders.forEach(f => {
      const isAccessible = f.accessible !== false;
      const row = document.createElement('div');
      row.className = `settings-folder-item settings-folder-row ${isAccessible ? '' : 'is-unavailable'}`;
      row.dataset.id = f.id;

      row.innerHTML = `
        <div class="settings-folder-main folder-row-main">
          <div class="settings-folder-title-row folder-row-title-line">
            <span class="settings-folder-name folder-row-name">${escapeHtml(f.name || f.path)}</span>
            ${isAccessible 
              ? '<span class="status-badge badge-accessible">Disponible</span>' 
              : '<span class="status-badge badge-unavailable">No disponible (desmontada/desconectada)</span>'
            }
          </div>
          <div class="settings-folder-path folder-row-path" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</div>
          ${!isAccessible 
            ? '<div class="folder-row-warning">El disco externo o volumen VeraCrypt no está montado en esta ruta. La carpeta se mantiene registrada pero no puede escanearse hasta que esté accesible.</div>' 
            : ''
          }
        </div>
        <div class="settings-folder-actions folder-row-actions">
          <button class="btn btn-secondary btn-sm btn-folder-scan-single" data-id="${f.id}" ${!isAccessible ? 'disabled title="Monta el disco o volumen para escanear"' : 'title="Escanear esta carpeta"'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 21h5v-5"/>
            </svg>
            <span>Escanear</span>
          </button>
          <button class="btn btn-danger btn-sm btn-folder-remove-settings" data-id="${f.id}" title="Desvincular carpeta de la biblioteca">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
            <span>Desvincular</span>
          </button>
        </div>
      `;

      row.querySelector('.btn-folder-scan-single').addEventListener('click', async () => {
        await runFolderScan(f.id);
      });

      row.querySelector('.btn-folder-remove-settings').addEventListener('click', async () => {
        if (confirm(`¿Desvincular la carpeta "${f.name || f.path}" de la biblioteca? Los archivos en tu disco no serán borrados.`)) {
          try {
            await window.lecfalAPI.removeFolder(f.id);
            await refreshFolders();
            await renderSettingsFolders();
            await refreshSeries();
            showToast('Carpeta desvinculada de la biblioteca');
          } catch (err) {
            console.error('Error removing folder:', err);
            showToast('Error al desvincular carpeta');
          }
        }
      });

      fragment.appendChild(row);
    });

    settingsFoldersList.innerHTML = '';
    settingsFoldersList.appendChild(fragment);
  } catch (err) {
    console.error('Error rendering settings folders:', err);
  }
}

// ==================== UNIVERSAL CATALOG PICKER MODAL (FOR MANGA DETAIL) ====================
function normalizeCatalogId(id) {
  if (id === null || id === undefined) return null;
  const num = Number(id);
  return isNaN(num) ? id : num;
}

async function openCatalogPicker(type) {
  if (!activeSeries || !modalCatalogPicker) return;
  currentPickerType = type;
  pickerSelectedIds = new Set();
  pickerSearchText = '';
  if (inputFilterCatalogPicker) inputFilterCatalogPicker.value = '';

  const config = {
    tag: {
      title: 'Asignar Tags / Géneros',
      desc: 'Selecciona los tags que deseas asignar a este manga. Todos los tags provienen de la configuración centralizada de la biblioteca.',
      filterPlaceholder: 'Filtrar tags disponibles...',
      emptyText: 'No hay tags creados aún en la biblioteca.',
      fetchList: () => window.lecfalAPI.getAllTags(),
      currentAssigned: activeSeries.tags_list || []
    },
    author: {
      title: 'Asignar Autores',
      desc: 'Selecciona uno o más autores del catálogo configurado para este manga.',
      filterPlaceholder: 'Filtrar autores disponibles...',
      emptyText: 'No hay autores creados aún en la biblioteca.',
      fetchList: () => window.lecfalAPI.getAllAuthors(),
      currentAssigned: activeSeries.authors_list || []
    },
    group: {
      title: 'Asignar Grupos / Círculos',
      desc: 'Selecciona uno o más grupos o círculos del catálogo configurado para este manga.',
      filterPlaceholder: 'Filtrar grupos disponibles...',
      emptyText: 'No hay grupos creados aún en la biblioteca.',
      fetchList: () => window.lecfalAPI.getAllGroups(),
      currentAssigned: activeSeries.groups_list || []
    },
    language: {
      title: 'Asignar Idiomas',
      desc: 'Selecciona los idiomas disponibles para este manga.',
      filterPlaceholder: 'Filtrar idiomas disponibles...',
      emptyText: 'No hay idiomas creados aún en la biblioteca.',
      fetchList: () => window.lecfalAPI.getAllLanguages(),
      currentAssigned: activeSeries.languages_list || []
    },
    parody: {
      title: 'Asignar Series / Parodias',
      desc: 'Selecciona la serie, universo o parodia correspondiente a este manga.',
      filterPlaceholder: 'Filtrar series o parodias disponibles...',
      emptyText: 'No hay series o parodias creadas aún en la biblioteca.',
      fetchList: () => window.lecfalAPI.getAllParodies(),
      currentAssigned: activeSeries.parodies_list || []
    }
  }[type];

  if (!config) return;

  if (modalCatalogPickerTitle) modalCatalogPickerTitle.textContent = config.title;
  if (modalCatalogPickerDesc) modalCatalogPickerDesc.textContent = config.desc;
  if (inputFilterCatalogPicker) inputFilterCatalogPicker.placeholder = config.filterPlaceholder;
  if (catalogPickerEmptyText) catalogPickerEmptyText.textContent = config.emptyText;

  try {
    currentPickerCatalog = await config.fetchList();
    if (config.currentAssigned && Array.isArray(config.currentAssigned)) {
      config.currentAssigned.forEach(item => {
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
      let rawString = '';
      if (type === 'tag' && activeSeries.tags) rawString = activeSeries.tags;
      else if (type === 'author' && activeSeries.author && activeSeries.author !== 'Desconocido') rawString = activeSeries.author;
      else if (type === 'group' && (activeSeries.group_name || activeSeries.group) && (activeSeries.group_name || activeSeries.group) !== 'Sin grupo / círculo') {
        rawString = activeSeries.group_name || activeSeries.group;
      } else if (type === 'language' && activeSeries.language && activeSeries.language !== 'Sin idioma asignado') {
        rawString = activeSeries.language;
      } else if (type === 'parody' && activeSeries.parody && activeSeries.parody !== 'Sin serie / parodia') {
        rawString = activeSeries.parody;
      }

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
      if (catalogPickerEmpty) catalogPickerEmpty.style.display = 'block';
      if (catalogPickerChipsContainer) catalogPickerChipsContainer.style.display = 'none';
    } else {
      if (catalogPickerEmpty) catalogPickerEmpty.style.display = 'none';
      if (catalogPickerChipsContainer) catalogPickerChipsContainer.style.display = 'flex';
      renderCatalogPickerChips();
    }

    modalCatalogPicker.style.display = 'flex';
    if (currentPickerCatalog.length > 0 && inputFilterCatalogPicker) {
      inputFilterCatalogPicker.focus();
    }
  } catch (err) {
    console.error('Error opening catalog picker modal:', err);
  }
}

function closeCatalogPickerModal() {
  if (modalCatalogPicker) modalCatalogPicker.style.display = 'none';
  pickerSelectedIds.clear();
  currentPickerCatalog = [];
  pickerSearchText = '';
  if (inputFilterCatalogPicker) inputFilterCatalogPicker.value = '';
}

function renderCatalogPickerChips() {
  if (!catalogPickerChipsContainer) return;
  catalogPickerChipsContainer.innerHTML = '';
  const filter = pickerSearchText.toLowerCase();

  const matchingItems = currentPickerCatalog.filter(item => 
    !filter || item.name.toLowerCase().includes(filter)
  );

  if (matchingItems.length === 0) {
    catalogPickerChipsContainer.innerHTML = '<div style="color: var(--text-dim); font-size: 0.88rem; padding: 12px; width: 100%; text-align: center;">No hay elementos coincidentes con la búsqueda</div>';
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

    catalogPickerChipsContainer.appendChild(chip);
  });
}

async function handleSaveCatalogPicker() {
  if (!activeSeries) return;
  const selectedIds = Array.from(pickerSelectedIds);

  try {
    if (currentPickerType === 'tag') {
      const updated = await window.lecfalAPI.setSeriesTags({
        seriesId: activeSeries.id,
        tagIds: selectedIds
      });
      activeSeries.tags_list = updated;
      activeSeries.tags = updated.map(t => t.name).join(', ');
      renderMangaTagsFromSeries(activeSeries);
      showToast('Tags actualizados correctamente');
    } else if (currentPickerType === 'author') {
      const updated = await window.lecfalAPI.setSeriesAuthors({
        seriesId: activeSeries.id,
        authorIds: selectedIds
      });
      activeSeries.authors_list = updated;
      activeSeries.author = updated.length > 0 ? updated.map(a => a.name).join(', ') : 'Desconocido';
      renderMangaAuthorsFromSeries(activeSeries);
      showToast('Autores actualizados correctamente');
    } else if (currentPickerType === 'group') {
      const updated = await window.lecfalAPI.setSeriesGroups({
        seriesId: activeSeries.id,
        groupIds: selectedIds
      });
      activeSeries.groups_list = updated;
      activeSeries.group = updated.length > 0 ? updated.map(g => g.name).join(', ') : 'Sin grupo / círculo';
      activeSeries.group_name = activeSeries.group;
      renderMangaGroupsFromSeries(activeSeries);
      showToast('Grupos actualizados correctamente');
    } else if (currentPickerType === 'language') {
      const updated = await window.lecfalAPI.setSeriesLanguages({
        seriesId: activeSeries.id,
        languageIds: selectedIds
      });
      activeSeries.languages_list = updated;
      activeSeries.language = updated.map(l => l.name).join(', ');
      renderMangaLanguagesFromSeries(activeSeries);
      showToast('Idiomas actualizados correctamente');
    } else if (currentPickerType === 'parody') {
      const updated = await window.lecfalAPI.setSeriesParodies({
        seriesId: activeSeries.id,
        parodyIds: selectedIds
      });
      activeSeries.parodies_list = updated;
      activeSeries.parody = updated.map(p => p.name).join(', ');
      renderMangaParodiesFromSeries(activeSeries);
      showToast('Series / Parodias actualizadas correctamente');
    }

    closeCatalogPickerModal();
    refreshSeries();
  } catch (err) {
    console.error('Error saving catalog picker:', err);
    showToast(`Error al guardar: ${err.message}`);
  }
}

// ==================== UTILS ====================
function updateFavButtonState(btn, isFav) {
  btn.classList.toggle('is-favorite', isFav);
  const heartSvg = btn.querySelector('svg');
  if (heartSvg) {
    heartSvg.setAttribute('fill', isFav ? 'currentColor' : 'none');
  }
}

function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Safely convert local filesystem cover path into valid lecfal-cover URL
function getCoverUrl(coverPath) {
  if (!coverPath || typeof coverPath !== 'string') return '';
  if (coverPath.startsWith('data:') || coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
    return coverPath;
  }
  return `lecfal-cover://cover?path=${encodeURIComponent(coverPath)}`;
}

// Generate procedural cover fallback markup
function renderCoverFallbackHtml(title, format) {
  const formatUpper = (format || 'cbz').toUpperCase();
  return `
    <div class="card-cover-fallback">
      <div class="fallback-decor">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
        </svg>
        <span class="badge-dot dot-${format || 'cbz'}"></span>
      </div>
      <div class="fallback-title">${escapeHtml(title)}</div>
      <div class="fallback-footer">${formatUpper}</div>
    </div>
  `;
}

let toastTimeout = null;
function showToast(msg) {
  toastMessage.textContent = msg;
  toastNotification.style.display = 'flex';
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastNotification.style.display = 'none';
  }, 3500);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
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

