import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.min.mjs';

// Configure PDF.js worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
} catch (e) {
  console.warn('PDF.js worker could not be configured:', e);
}

// State
let items = [];
let folders = [];
let currentFilter = 'all';
let searchQuery = '';
let currentSort = 'title_asc';
let currentFolderId = null;
let selectedItem = null;
let isScanning = false;
let pdfCoverQueue = [];
let isProcessingPdfQueue = false;

// DOM Elements
const comicsGrid = document.getElementById('comicsGrid');
const emptyStateNoFolders = document.getElementById('emptyStateNoFolders');
const emptyStateNoResults = document.getElementById('emptyStateNoResults');

const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');

const currentFolderName = document.getElementById('currentFolderName');
const btnManageFolders = document.getElementById('btnManageFolders');
const btnAddFolder = document.getElementById('btnAddFolder');
const btnRescan = document.getElementById('btnRescan');
const btnSelectInitialFolder = document.getElementById('btnSelectInitialFolder');
const btnResetFilters = document.getElementById('btnResetFilters');

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

const scanProgressBanner = document.getElementById('scanProgressBanner');
const scanBannerTitle = document.getElementById('scanBannerTitle');
const scanBannerFile = document.getElementById('scanBannerFile');
const scanProgressBar = document.getElementById('scanProgressBar');
const scanBannerCount = document.getElementById('scanBannerCount');

// Modals
const modalFolders = document.getElementById('modalFolders');
const foldersList = document.getElementById('foldersList');
const btnCloseModalFolders = document.getElementById('btnCloseModalFolders');
const btnModalCloseDone = document.getElementById('btnModalCloseDone');
const btnAddAnotherFolder = document.getElementById('btnAddAnotherFolder');

const modalDetail = document.getElementById('modalDetail');
const btnCloseModalDetail = document.getElementById('btnCloseModalDetail');
const detailCoverImg = document.getElementById('detailCoverImg');
const detailFormatBadge = document.getElementById('detailFormatBadge');
const detailTitle = document.getElementById('detailTitle');
const detailFormat = document.getElementById('detailFormat');
const detailSize = document.getElementById('detailSize');
const detailPages = document.getElementById('detailPages');
const detailDate = document.getElementById('detailDate');
const detailPath = document.getElementById('detailPath');
const btnDetailFav = document.getElementById('btnDetailFav');
const btnDetailOpen = document.getElementById('btnDetailOpen');
const btnDetailShowFolder = document.getElementById('btnDetailShowFolder');

const toastNotification = document.getElementById('toastNotification');
const toastMessage = document.getElementById('toastMessage');

// Log & Diagnostics DOM Elements
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

  // Load folders & items
  await refreshFolders();
  await refreshItems();
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  // Folder actions
  btnAddFolder.addEventListener('click', handleAddFolder);
  btnSelectInitialFolder.addEventListener('click', handleAddFolder);
  btnAddAnotherFolder.addEventListener('click', handleAddFolder);
  btnRescan.addEventListener('click', handleRescan);
  btnManageFolders.addEventListener('click', () => openFoldersModal());
  btnCloseModalFolders.addEventListener('click', () => closeFoldersModal());
  btnModalCloseDone.addEventListener('click', () => closeFoldersModal());

  // Search input
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
    debounce(refreshItems, 200)();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    refreshItems();
  });

  btnResetFilters.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    currentFilter = 'all';
    filterChips.forEach(c => c.classList.remove('active'));
    document.querySelector('.filter-chip[data-filter="all"]').classList.add('active');
    refreshItems();
  });

  // Filter chips
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      refreshItems();
    });
  });

  // Sort dropdown
  sortSelect.addEventListener('change', async (e) => {
    currentSort = e.target.value;
    await window.lecfalAPI.setSetting('sort_order', currentSort);
    refreshItems();
  });

  // Grid size buttons (Small, Medium, Large)
  sizeButtonGroup.addEventListener('click', async (e) => {
    const btn = e.target.closest('.size-btn');
    if (!btn) return;
    const sizeType = btn.dataset.size;
    let pxVal = 185;
    if (sizeType === 'small') pxVal = 130;
    if (sizeType === 'medium') pxVal = 185;
    if (sizeType === 'large') pxVal = 260;

    applyGridSize(pxVal, true);
  });

  // Size slider fine-tuning
  sizeSlider.addEventListener('input', (e) => {
    const pxVal = parseInt(e.target.value, 10);
    applyGridSize(pxVal, false);
  });

  sizeSlider.addEventListener('change', async (e) => {
    const pxVal = parseInt(e.target.value, 10);
    await window.lecfalAPI.setSetting('grid_size', pxVal);
  });

  // Detail Modal Actions
  btnCloseModalDetail.addEventListener('click', () => closeDetailModal());
  btnDetailOpen.addEventListener('click', async () => {
    if (selectedItem) {
      try {
        await window.lecfalAPI.openFile(selectedItem.file_path);
      } catch (err) {
        showToast('Error al abrir el archivo: ' + err.message);
      }
    }
  });

  btnDetailShowFolder.addEventListener('click', async () => {
    if (selectedItem) {
      await window.lecfalAPI.showInFolder(selectedItem.file_path);
    }
  });

  btnDetailFav.addEventListener('click', async () => {
    if (selectedItem) {
      const isFav = await window.lecfalAPI.toggleFavorite(selectedItem.id);
      selectedItem.favorite = isFav;
      updateFavButtonState(btnDetailFav, isFav);
      refreshItems(false);
    }
  });

  // Modal backdrop click to close
  window.addEventListener('click', (e) => {
    if (e.target === modalFolders) closeFoldersModal();
    if (e.target === modalDetail) closeDetailModal();
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    if (e.key === 'Escape') {
      if (modalFolders.style.display !== 'none') closeFoldersModal();
      else if (modalDetail.style.display !== 'none') closeDetailModal();
      else if (searchQuery) {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        refreshItems();
      }
    }
  });
}

// ==================== GRID SIZE CONTROLS ====================
function applyGridSize(pxVal, save = true) {
  document.documentElement.style.setProperty('--grid-item-min-width', `${pxVal}px`);
  sizeSlider.value = pxVal;

  // Update button active state
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
  showToast('Iniciando re-escaneo de la biblioteca...');
  await runAllScan();
}

async function runFolderScan(folderId) {
  if (isScanning) return;
  isScanning = true;
  scanProgressBanner.style.display = 'block';
  btnRescan.classList.add('scanning');
  logIndicatorDot.classList.add('active');

  try {
    const result = await window.lecfalAPI.scanFolder(folderId);
    showToast(`Escaneo completado: ${result.count} archivos detectados`);
    await refreshItems();
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

async function runAllScan() {
  if (isScanning) return;
  isScanning = true;
  scanProgressBanner.style.display = 'block';
  btnRescan.classList.add('scanning');
  logIndicatorDot.classList.add('active');

  try {
    const result = await window.lecfalAPI.scanAll();
    showToast(`Escaneo completado: ${result.totalScanned} mangas y cómics encontrados`);
    await refreshItems();
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

  // Streaming real-time logs from main process
  window.lecfalAPI.onLog((entry) => {
    appendLogToTerminal(entry);
  });

  // Streaming item batch from scanning: refresh UI progressively
  window.lecfalAPI.onItemsBatch(() => {
    refreshItems(false);
  });

  // Load existing logs
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

  // Keep terminal from having infinite DOM elements (max 300)
  if (logTerminal.children.length > 300) {
    logTerminal.removeChild(logTerminal.firstElementChild);
  }

  // Auto-scroll if drawer is open or near bottom
  const isNearBottom = logTerminal.scrollHeight - logTerminal.clientHeight - logTerminal.scrollTop < 120;
  if (isNearBottom || logDrawer.style.display !== 'none') {
    logTerminal.scrollTop = logTerminal.scrollHeight;
  }
}

// ==================== ITEMS & RENDERING ====================
async function refreshItems(triggerPdfWorker = true) {
  const queryParams = {
    searchQuery,
    format: currentFilter === 'favorite' ? 'all' : currentFilter,
    favoriteOnly: currentFilter === 'favorite',
    sortBy: currentSort
  };

  items = await window.lecfalAPI.getItems(queryParams);

  // Update counters
  await updateCounters();

  // Handle empty states
  if (folders.length === 0) {
    emptyStateNoFolders.style.display = 'flex';
    emptyStateNoResults.style.display = 'none';
    comicsGrid.style.display = 'none';
    statusCount.textContent = '0 mangas';
    return;
  }

  emptyStateNoFolders.style.display = 'none';

  if (items.length === 0) {
    emptyStateNoResults.style.display = 'flex';
    comicsGrid.style.display = 'none';
    statusCount.textContent = '0 mangas';
    return;
  }

  emptyStateNoResults.style.display = 'none';
  comicsGrid.style.display = 'grid';
  statusCount.textContent = `${items.length} manga${items.length === 1 ? '' : 's'}`;

  renderGrid(items);

  if (triggerPdfWorker) {
    enqueuePdfCovers(items);
  }
}

async function updateCounters() {
  const allItems = await window.lecfalAPI.getItems({ format: 'all' });
  let cbzCount = 0;
  let pdfCount = 0;
  let favCount = 0;

  for (const item of allItems) {
    if (item.format === 'cbz') cbzCount++;
    if (item.format === 'pdf') pdfCount++;
    if (item.favorite) favCount++;
  }

  countAll.textContent = allItems.length;
  countCbz.textContent = cbzCount;
  countPdf.textContent = pdfCount;
  countFav.textContent = favCount;
}

function renderGrid(itemList) {
  comicsGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  itemList.forEach(item => {
    const card = document.createElement('article');
    card.className = 'comic-card';
    card.dataset.id = item.id;
    card.tabIndex = 0;

    const isFav = item.favorite === 1;
    const formatUpper = (item.format || 'CBZ').toUpperCase();
    const formattedSize = formatBytes(item.file_size);
    const pagesLabel = item.page_count > 0 ? `${item.page_count} pág.` : '';

    // Cover markup: use image if cover_path exists, or procedural fallback
    let coverHtml = '';
    if (item.cover_path) {
      const coverUrl = `lecfal-cover://${encodeURIComponent(item.cover_path)}`;
      coverHtml = `<img class="card-cover-img" src="${coverUrl}" alt="${escapeHtml(item.title)}" loading="lazy">`;
    } else {
      coverHtml = `
        <div class="card-cover-fallback">
          <div class="fallback-decor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
            </svg>
            <span class="badge-dot dot-${item.format}"></span>
          </div>
          <div class="fallback-title">${escapeHtml(item.title)}</div>
          <div class="fallback-footer">${formatUpper}</div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="card-cover-wrapper">
        <span class="card-badge badge-${item.format}">${formatUpper}</span>
        <button class="card-fav-btn ${isFav ? 'is-favorite' : ''}" data-id="${item.id}" title="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}">
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
            Abrir
          </span>
        </div>
      </div>
      <div class="card-details">
        <div class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="card-meta-row">
          <span>${formattedSize}</span>
          <span>${pagesLabel}</span>
        </div>
      </div>
    `;

    // Click: open detail modal
    card.addEventListener('click', (e) => {
      // Don't open modal if clicked favorite button
      if (e.target.closest('.card-fav-btn')) return;
      openDetailModal(item);
    });

    // Double click: open file immediately
    card.addEventListener('dblclick', async () => {
      try {
        await window.lecfalAPI.openFile(item.file_path);
      } catch (err) {
        showToast('Error al abrir: ' + err.message);
      }
    });

    // Favorite button click
    const favBtn = card.querySelector('.card-fav-btn');
    favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const newFavState = await window.lecfalAPI.toggleFavorite(item.id);
      item.favorite = newFavState;
      favBtn.classList.toggle('is-favorite', newFavState === 1);
      const heartSvg = favBtn.querySelector('svg');
      heartSvg.setAttribute('fill', newFavState === 1 ? 'currentColor' : 'none');
      updateCounters();
    });

    fragment.appendChild(card);
  });

  comicsGrid.appendChild(fragment);
}

// ==================== PDF COVER EXTRACTION WORKER ====================
function enqueuePdfCovers(itemList) {
  // Filter PDFs that do not have a cover_path yet
  const pendingPdfs = itemList.filter(item => item.format === 'pdf' && !item.cover_path);
  if (pendingPdfs.length === 0) return;

  pdfCoverQueue = pendingPdfs;
  if (!isProcessingPdfQueue) {
    processNextPdfCover();
  }
}

async function processNextPdfCover() {
  if (pdfCoverQueue.length === 0) {
    isProcessingPdfQueue = false;
    return;
  }

  isProcessingPdfQueue = true;
  const item = pdfCoverQueue.shift();

  try {
    const fileUrl = `lecfal-file://${encodeURIComponent(item.file_path)}`;
    const loadingTask = pdfjsLib.getDocument({
      url: fileUrl,
      cMapUrl: '../../node_modules/pdfjs-dist/cmaps/',
      cMapPacked: true
    });

    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(1);

    // Render first page to offscreen canvas
    const viewport = page.getViewport({ scale: 0.8 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // Save cover via IPC
    const savedCoverPath = await window.lecfalAPI.savePdfCover({
      filePath: item.file_path,
      dataUrl: dataUrl,
      pageCount: pdfDoc.numPages
    });

    if (savedCoverPath) {
      item.cover_path = savedCoverPath;
      item.page_count = pdfDoc.numPages;

      // Update card DOM element if visible
      const card = comicsGrid.querySelector(`.comic-card[data-id="${item.id}"]`);
      if (card) {
        const coverWrapper = card.querySelector('.card-cover-wrapper');
        const fallback = coverWrapper.querySelector('.card-cover-fallback');
        if (fallback) {
          const img = document.createElement('img');
          img.className = 'card-cover-img';
          img.src = `lecfal-cover://${encodeURIComponent(savedCoverPath)}`;
          img.alt = item.title;
          coverWrapper.replaceChild(img, fallback);
        }
        // Update page count in card meta
        const pagesSpan = card.querySelectorAll('.card-meta-row span')[1];
        if (pagesSpan) {
          pagesSpan.textContent = `${pdfDoc.numPages} pág.`;
        }
      }
    }
  } catch (err) {
    console.warn(`Could not render cover for PDF ${item.title}:`, err.message);
  }

  // Small delay so UI remains silky smooth
  setTimeout(processNextPdfCover, 50);
}

// ==================== MODALS ====================
function openDetailModal(item) {
  selectedItem = item;
  detailTitle.textContent = item.title;
  detailFormat.textContent = (item.format || 'CBZ').toUpperCase();
  detailFormatBadge.textContent = (item.format || 'CBZ').toUpperCase();
  detailFormatBadge.className = `format-badge-large badge-${item.format}`;
  detailSize.textContent = formatBytes(item.file_size);
  detailPages.textContent = item.page_count > 0 ? `${item.page_count} páginas` : 'No escaneado';
  detailDate.textContent = item.created_at ? new Date(item.created_at).toLocaleDateString('es-ES') : '-';
  detailPath.textContent = item.file_path;

  if (item.cover_path) {
    detailCoverImg.src = `lecfal-cover://${encodeURIComponent(item.cover_path)}`;
    detailCoverImg.style.display = 'block';
  } else {
    detailCoverImg.src = '';
    detailCoverImg.style.display = 'none';
  }

  updateFavButtonState(btnDetailFav, item.favorite === 1);
  modalDetail.style.display = 'flex';
}

function closeDetailModal() {
  modalDetail.style.display = 'none';
  selectedItem = null;
}

function updateFavButtonState(btn, isFav) {
  btn.classList.toggle('is-favorite', isFav);
  const heartSvg = btn.querySelector('svg');
  if (heartSvg) {
    heartSvg.setAttribute('fill', isFav ? 'currentColor' : 'none');
  }
}

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

    // Rescan button
    item.querySelector('.btn-folder-rescan').addEventListener('click', async () => {
      closeFoldersModal();
      await runFolderScan(f.id);
    });

    // Delete button
    item.querySelector('.btn-folder-delete').addEventListener('click', async () => {
      if (confirm(`¿Eliminar la carpeta "${f.name}" de la biblioteca? Los archivos en tu disco no serán borrados.`)) {
        await window.lecfalAPI.removeFolder(f.id);
        await refreshFolders();
        await renderFoldersList();
        await refreshItems();
        showToast('Carpeta eliminada de la biblioteca');
      }
    });

    foldersList.appendChild(item);
  });
}

// ==================== UTILS ====================
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
  return text
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

// Start app
init();
