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

// Current Active View: 'library' or 'manga'
let currentView = 'library';
let activeSeries = null;
let activeChapters = [];
let currentChapterSort = 'asc'; // 'asc' or 'desc'
let chapterFilterText = '';

// Edit Field Modal State
let currentEditField = null; // 'title' or 'author'

// ==================== DOM ELEMENTS ====================
// Views
const libraryView = document.getElementById('libraryView');
const mangaView = document.getElementById('mangaView');
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

const mangaHeroAuthor = document.getElementById('mangaHeroAuthor');
const btnEditAuthor = document.getElementById('btnEditAuthor');

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
  setupLogging();

  // Load saved preferences
  const savedSize = await window.lecfalAPI.getSetting('grid_size', 185);
  applyGridSize(savedSize, false);

  const savedSort = await window.lecfalAPI.getSetting('sort_order', 'title_asc');
  currentSort = savedSort;
  sortSelect.value = savedSort;

  // Load folders & series
  await refreshFolders();
  await refreshSeries();
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  // Navigation
  brandHomeBtn.addEventListener('click', navigateToLibrary);
  btnBackToLibrary.addEventListener('click', navigateToLibrary);

  // Folder management
  btnAddFolder.addEventListener('click', handleAddFolder);
  btnSelectInitialFolder.addEventListener('click', handleAddFolder);
  btnAddAnotherFolder.addEventListener('click', handleAddFolder);
  btnRescan.addEventListener('click', handleRescan);
  btnManageFolders.addEventListener('click', () => openFoldersModal());
  btnCloseModalFolders.addEventListener('click', () => closeFoldersModal());
  btnModalCloseDone.addEventListener('click', () => closeFoldersModal());

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
    if (isScanning) {
      btnCancelScan.disabled = true;
      btnCancelScan.innerHTML = '<span>Cancelando...</span>';
      await window.lecfalAPI.cancelScan();
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
    refreshSeries();
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
  btnEditTitle.addEventListener('click', () => {
    if (!activeSeries) return;
    openEditFieldModal('title', 'Renombrar Manga', 'Nuevo título para este manga:', activeSeries.title);
  });

  // Edit author
  btnEditAuthor.addEventListener('click', () => {
    if (!activeSeries) return;
    openEditFieldModal('author', 'Editar Autor', 'Nombre del autor o creador:', activeSeries.author === 'Desconocido' ? '' : activeSeries.author);
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

  // Add tag
  btnAddTag.addEventListener('click', async () => {
    if (!activeSeries) return;
    const tag = prompt('Introduce el nombre del tag o género (ej. Acción, Shonen, Romance):');
    if (tag && tag.trim()) {
      const cleanTag = tag.trim();
      const currentTags = activeSeries.tags ? activeSeries.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      if (!currentTags.includes(cleanTag)) {
        currentTags.push(cleanTag);
        const updatedTagsStr = currentTags.join(', ');
        await window.lecfalAPI.updateSeriesMetadata({
          seriesId: activeSeries.id,
          tags: updatedTagsStr
        });
        activeSeries.tags = updatedTagsStr;
        renderMangaTags(currentTags);
        showToast(`Tag "${cleanTag}" añadido`);
      }
    }
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
      if (modalEditField.style.display !== 'none') closeEditFieldModal();
      else if (modalFolders.style.display !== 'none') closeFoldersModal();
      else if (currentView === 'manga') navigateToLibrary();
      else if (searchQuery) {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        refreshSeries();
      }
    }
  });
}

// ==================== VIEW NAVIGATION ====================
function navigateToLibrary() {
  currentView = 'library';
  mangaView.style.display = 'none';
  libraryView.style.display = 'flex';
  navSearchContainer.style.visibility = 'visible';
  activeSeries = null;
  activeChapters = [];
  refreshSeries(false);
}

async function openMangaView(seriesId) {
  currentView = 'manga';
  libraryView.style.display = 'none';
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
  mangaHeroAuthor.textContent = activeSeries.author || 'Desconocido';
  mangaHeroDesc.textContent = activeSeries.description || 'Sin descripción';
  mangaHeroFormatBadge.textContent = (activeSeries.primary_format || 'CBZ').toUpperCase();
  mangaHeroFormatBadge.className = `manga-hero-format-badge badge-${activeSeries.primary_format || 'cbz'}`;

  if (activeSeries.cover_path) {
    mangaHeroCoverImg.src = `lecfal-cover://${encodeURIComponent(activeSeries.cover_path)}`;
    mangaHeroCoverImg.style.display = 'block';
  } else {
    mangaHeroCoverImg.style.display = 'none';
  }

  updateFavButtonState(btnMangaFav, activeSeries.favorite === 1);

  // Render tags
  const tagsArray = activeSeries.tags ? activeSeries.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
  renderMangaTags(tagsArray);

  // Render chapters
  renderChaptersList();
  updateChapterCounters();

  // Scroll to top
  document.querySelector('.manga-view-scrollable').scrollTop = 0;
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
    renderChaptersList();
    updateChapterCounters();
  }
}

function renderMangaTags(tagsArray) {
  mangaTagsList.innerHTML = '';
  tagsArray.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'manga-tag-chip';
    chip.innerHTML = `
      <span>${escapeHtml(tag)}</span>
      <button class="btn-remove-tag" data-tag="${escapeHtml(tag)}" title="Eliminar tag">×</button>
    `;

    chip.querySelector('.btn-remove-tag').addEventListener('click', async (e) => {
      e.stopPropagation();
      const tagToRemove = e.target.dataset.tag;
      const updated = tagsArray.filter(t => t !== tagToRemove);
      const updatedStr = updated.join(', ');
      await window.lecfalAPI.updateSeriesMetadata({
        seriesId: activeSeries.id,
        tags: updatedStr
      });
      activeSeries.tags = updatedStr;
      renderMangaTags(updated);
    });

    mangaTagsList.appendChild(chip);
  });
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
  folders = await window.lecfalAPI.getFolders();
  statusFolderCount.textContent = `${folders.length} carpeta${folders.length === 1 ? '' : 's'}`;

  if (folders.length > 0) {
    const defaultFolder = folders[0];
    currentFolderName.textContent = defaultFolder.name || defaultFolder.path;
    currentFolderName.title = defaultFolder.path;
    btnRescan.style.display = 'inline-flex';
  } else {
    currentFolderName.textContent = 'Sin carpeta asignada';
    currentFolderName.title = '';
    btnRescan.style.display = 'none';
  }
}

async function handleAddFolder() {
  try {
    const folderPath = await window.lecfalAPI.selectFolder();
    if (!folderPath) return;

    showToast('Añadiendo carpeta y escaneando...');
    const newFolder = await window.lecfalAPI.addFolder(folderPath);
    await refreshFolders();

    if (newFolder) {
      await runFolderScan(newFolder.id);
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

async function runFolderScan(folderId, mode = 'incremental') {
  if (isScanning) return;
  isScanning = true;
  scanProgressBanner.style.display = 'block';
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
    if (result.cancelled) {
      showToast('Escaneo cancelado por el usuario');
    } else if (result.newFiles > 0 || result.modifiedFiles > 0) {
      showToast(`Escaneo finalizado: +${result.newFiles} nuevos, ${result.modifiedFiles} actualizados (${result.totalScanTime})`);
    } else {
      showToast(`Biblioteca al día: ${result.skippedFiles || result.count} archivos verificados (0 cambios)`);
    }
    await refreshSeries();
  } catch (err) {
    console.error('Scan error:', err);
    showToast('Error durante el escaneo');
  } finally {
    isScanning = false;
    setTimeout(() => {
      scanProgressBanner.style.display = 'none';
    }, 1500);
    btnRescan.classList.remove('scanning');
    logIndicatorDot.classList.remove('active');
  }
}

async function runAllScan(mode = 'incremental') {
  if (isScanning) return;
  isScanning = true;
  scanProgressBanner.style.display = 'block';
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
    } else if (result.newFiles > 0 || result.modifiedFiles > 0) {
      showToast(`Escaneo finalizado: +${result.newFiles} nuevos, ${result.modifiedFiles} actualizados (${result.totalScanned} mangas)`);
    } else {
      showToast(`Biblioteca al día: ${result.skippedFiles || result.totalScanned} archivos verificados (0 cambios)`);
    }
    await refreshSeries();
  } catch (err) {
    console.error('Scan all error:', err);
    showToast('Error al escanear carpetas');
  } finally {
    isScanning = false;
    setTimeout(() => {
      scanProgressBanner.style.display = 'none';
    }, 1500);
    btnRescan.classList.remove('scanning');
    logIndicatorDot.classList.remove('active');
  }
}

function setupScanProgressListener() {
  window.lecfalAPI.onScanProgress((data) => {
    scanBannerTitle.textContent = `Escaneando: ${data.folderName || 'Carpeta'}`;
    scanBannerFile.textContent = `${data.file || ''} (${data.durationMs ? data.durationMs + 'ms' : ''})`;
    const percent = Math.round((data.current / data.total) * 100);
    scanProgressBar.style.width = `${percent}%`;
    scanBannerCount.textContent = `${data.current}/${data.total}`;
  });
}

// ==================== SERIES & GRID RENDERING ====================
async function refreshSeries(triggerPdfCover = true) {
  const queryParams = {
    searchQuery,
    format: currentFilter === 'favorite' ? 'all' : currentFilter,
    favoriteOnly: currentFilter === 'favorite',
    sortBy: currentSort
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
      const coverUrl = `lecfal-cover://${encodeURIComponent(series.cover_path)}`;
      coverHtml = `<img class="card-cover-img" src="${coverUrl}" alt="${escapeHtml(series.title)}" loading="lazy">`;
    } else {
      coverHtml = `
        <div class="card-cover-fallback">
          <div class="fallback-decor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
            </svg>
            <span class="badge-dot dot-${series.primary_format || 'cbz'}"></span>
          </div>
          <div class="fallback-title">${escapeHtml(series.title)}</div>
          <div class="fallback-footer">${formatUpper}</div>
        </div>
      `;
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

  window.lecfalAPI.onLog((entry) => {
    appendLogToTerminal(entry);
  });

  // Streaming real-time series during scanning
  window.lecfalAPI.onSeriesBatch(() => {
    if (currentView === 'library') {
      refreshSeries(false);
    }
  });

  window.lecfalAPI.getLogs().then(logs => {
    if (Array.isArray(logs)) {
      logs.forEach(appendLogToTerminal);
    }
  });
}

function appendLogToTerminal(entry) {
  logCount++;
  logCountBadge.textContent = `${logCount} eventos`;

  const line = document.createElement('div');
  line.className = 'log-line';

  const levelClass = `log-level-${(entry.level || 'info').toLowerCase()}`;
  line.innerHTML = `
    <span class="log-time">${entry.timestamp || ''}</span>
    <span class="log-level ${levelClass}">[${entry.level || 'INFO'}]</span>
    <span class="log-tag">[${escapeHtml(entry.tag || 'APP')}]</span>
    <span class="log-msg">${escapeHtml(entry.message || '')}</span>
  `;

  logTerminal.appendChild(line);

  if (logTerminal.children.length > 300) {
    logTerminal.removeChild(logTerminal.firstElementChild);
  }

  const isNearBottom = logTerminal.scrollHeight - logTerminal.clientHeight - logTerminal.scrollTop < 120;
  if (isNearBottom || logDrawer.style.display !== 'none') {
    logTerminal.scrollTop = logTerminal.scrollHeight;
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
    const item = document.createElement('div');
    item.className = 'folder-item';
    item.innerHTML = `
      <div class="folder-item-info">
        <div class="folder-item-title-row">
          <span class="folder-item-name">${escapeHtml(f.name)}</span>
          ${isDefault ? '<span class="folder-item-default-badge">Por defecto</span>' : ''}
        </div>
        <div class="folder-item-path" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</div>
      </div>
      <div class="folder-item-actions">
        <button class="btn-folder-action btn-folder-rescan" data-id="${f.id}" title="Escanear esta carpeta">
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
      if (confirm(`¿Eliminar la carpeta "${f.name}" de la biblioteca? Los archivos en tu disco no serán borrados.`)) {
        await window.lecfalAPI.removeFolder(f.id);
        await refreshFolders();
        await renderFoldersList();
        await refreshSeries();
        showToast('Carpeta eliminada de la biblioteca');
      }
    });

    foldersList.appendChild(item);
  });
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

// Initialize application
init();
