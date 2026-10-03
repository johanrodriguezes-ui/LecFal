/**
 * Scanner UI Module for LecFal
 * 
 * Encapsulates scan controls (rescan, dropdown modes, cancel),
 * progress banner UI, IPC scan event subscriptions, and scan execution workflows.
 */

import { showToast } from '../utils/ui-utils.js';

// ==================== DOM ELEMENTS ====================
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
const btnRescan = document.getElementById('btnRescan');

// ==================== MODULE STATE ====================
let isScanningState = false;
let isCancellingState = false;
let finishTimer = null;
let latestProgressData = null;
let progressRafScheduled = false;

let callbacks = {
  refreshSeries: null,
  refreshFolders: null,
  showToast: null,
  getFolders: null,
  onScanStateChange: null,
  onSeriesBatch: null
};

function toast(msg) {
  if (callbacks.showToast) {
    callbacks.showToast(msg);
  } else {
    showToast(msg);
  }
}

/**
 * Return whether a scan operation is currently in progress.
 * @returns {boolean}
 */
export function isScanning() {
  return isScanningState;
}

/**
 * Return whether a scan cancellation has been requested and is pending.
 * @returns {boolean}
 */
export function isCancelling() {
  return isCancellingState;
}

/**
 * Update the visibility of the primary top-bar rescan button based on folder count.
 * @param {boolean} hasFolders 
 */
export function updateRescanButtonVisibility(hasFolders) {
  if (btnRescan) {
    btnRescan.style.display = hasFolders ? 'inline-flex' : 'none';
  }
}

/**
 * Reset the visual state of the cancel button back to idle/ready.
 */
function resetCancelButtonUI() {
  if (!btnCancelScan) return;
  btnCancelScan.disabled = false;
  btnCancelScan.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
    <span>Cancelar</span>
  `;
}

/**
 * Clean up and finalize the scan progress banner and controls.
 * @param {boolean} isCancelled - Whether scan ended via user cancellation
 */
function finishScanUI(isCancelled) {
  isScanningState = false;
  isCancellingState = false;

  if (btnRescan) btnRescan.classList.remove('scanning');
  if (scanProgressBanner) scanProgressBanner.classList.remove('cancelling');

  callbacks.onScanStateChange?.({ isScanning: false, isCancelling: false });
  resetCancelButtonUI();

  if (isCancelled) {
    if (scanBannerTitle) scanBannerTitle.textContent = 'Escaneo cancelado';
    if (scanBannerFile) scanBannerFile.textContent = 'Operación detenida por el usuario.';
  } else {
    if (scanBannerTitle) scanBannerTitle.textContent = 'Escaneo completado';
  }

  if (finishTimer) clearTimeout(finishTimer);
  finishTimer = setTimeout(() => {
    if (scanProgressBanner) scanProgressBanner.style.display = 'none';
  }, 1500);

  // Guarantee final refresh with clean state
  callbacks.refreshSeries?.(true);
}

/**
 * Request cancellation of the active scan.
 */
export async function cancelScan() {
  if (isScanningState && !isCancellingState) {
    isCancellingState = true;

    if (btnCancelScan) {
      btnCancelScan.disabled = true;
      btnCancelScan.innerHTML = '<span>Cancelando...</span>';
    }
    if (scanBannerTitle) scanBannerTitle.textContent = 'Cancelando escaneo...';
    if (scanBannerFile) scanBannerFile.textContent = 'Deteniendo procesos y guardando progreso...';
    if (scanProgressBanner) scanProgressBanner.classList.add('cancelling');

    callbacks.onScanStateChange?.({ isScanning: true, isCancelling: true });

    try {
      await window.lecfalAPI.cancelScan();
    } catch (err) {
      console.error('Error al solicitar cancelación:', err);
    }
  }
}

/**
 * Scan a specific folder by ID.
 * @param {number|string} folderId 
 * @param {string} [mode='incremental'] 
 */
export async function runFolderScan(folderId, mode = 'incremental') {
  if (isScanningState) return;
  isScanningState = true;
  isCancellingState = false;

  if (scanProgressBanner) {
    scanProgressBanner.classList.remove('cancelling');
    scanProgressBanner.style.display = 'block';
  }
  if (scanProgressBar) scanProgressBar.style.width = '0%';
  if (scanBannerCount) scanBannerCount.textContent = '0/0';
  if (scanBannerTitle) scanBannerTitle.textContent = 'Iniciando escaneo...';
  if (scanBannerFile) scanBannerFile.textContent = 'Analizando estructura de carpetas...';
  if (btnRescan) btnRescan.classList.add('scanning');

  callbacks.onScanStateChange?.({ isScanning: true, isCancelling: false });
  resetCancelButtonUI();

  try {
    const result = await window.lecfalAPI.scanFolder(folderId, { mode });
    if (result.unavailable) {
      toast('Carpeta no disponible (disco externo o volumen VeraCrypt desmontado)');
      finishScanUI(false);
    } else if (result.cancelled) {
      toast('Escaneo cancelado por el usuario');
      finishScanUI(true);
    } else {
      if (result.newFiles > 0 || result.modifiedFiles > 0) {
        toast(`Escaneo finalizado: +${result.newFiles} nuevos, ${result.modifiedFiles} actualizados (${result.totalScanTime})`);
      } else {
        toast(`Biblioteca al día: ${result.skippedFiles || result.count} archivos verificados (0 cambios)`);
      }
      finishScanUI(false);
    }
  } catch (err) {
    console.error('Scan error:', err);
    toast('Error durante el escaneo');
    finishScanUI(false);
  }
}

/**
 * Scan all registered library folders.
 * @param {string} [mode='incremental'] 
 */
export async function runAllScan(mode = 'incremental') {
  if (isScanningState) return;
  isScanningState = true;
  isCancellingState = false;

  if (scanProgressBanner) {
    scanProgressBanner.classList.remove('cancelling');
    scanProgressBanner.style.display = 'block';
  }
  if (scanProgressBar) scanProgressBar.style.width = '0%';
  if (scanBannerCount) scanBannerCount.textContent = '0/0';
  if (scanBannerTitle) scanBannerTitle.textContent = 'Iniciando escaneo...';
  if (scanBannerFile) scanBannerFile.textContent = 'Analizando biblioteca...';
  if (btnRescan) btnRescan.classList.add('scanning');

  callbacks.onScanStateChange?.({ isScanning: true, isCancelling: false });
  resetCancelButtonUI();

  const modeLabel = mode === 'full' ? 'completo' : 'incremental';
  toast(`Iniciando escaneo ${modeLabel}...`);

  try {
    const result = await window.lecfalAPI.scanAll({ mode });
    if (result.cancelled) {
      toast('Escaneo cancelado por el usuario');
      finishScanUI(true);
    } else {
      if (result.newFiles > 0 || result.modifiedFiles > 0) {
        toast(`Escaneo finalizado: +${result.newFiles} nuevos, ${result.modifiedFiles} actualizados (${result.totalScanned} mangas)`);
      } else {
        toast(`Biblioteca al día: ${result.skippedFiles || result.totalScanned} archivos verificados (0 cambios)`);
      }
      finishScanUI(false);
    }
  } catch (err) {
    console.error('Scan all error:', err);
    toast('Error al escanear carpetas');
    finishScanUI(false);
  }
}

/**
 * Rescan trigger for the main toolbar button.
 */
export async function handleRescan() {
  const folders = callbacks.getFolders ? callbacks.getFolders() : [];
  if (isScanningState || !folders || folders.length === 0) return;
  await runAllScan('incremental');
}

/**
 * Subscribe to scan status changes from backend IPC.
 */
function setupScanStatusListener() {
  if (window.lecfalAPI?.onScanStatus) {
    window.lecfalAPI.onScanStatus((data) => {
      if (data.status === 'cancelling') {
        isCancellingState = true;
        if (scanBannerTitle) scanBannerTitle.textContent = 'Cancelando escaneo...';
        if (scanBannerFile) scanBannerFile.textContent = 'Deteniendo procesos y guardando progreso...';
        if (scanProgressBanner) scanProgressBanner.classList.add('cancelling');
        if (btnCancelScan) {
          btnCancelScan.disabled = true;
          btnCancelScan.innerHTML = '<span>Cancelando...</span>';
        }
        callbacks.onScanStateChange?.({ isScanning: true, isCancelling: true });
      } else if (data.status === 'cancelled') {
        finishScanUI(true);
      } else if (data.status === 'completed') {
        finishScanUI(false);
      }
    });
  }
}

/**
 * Subscribe to incremental scan progress events and throttle UI updates via rAF.
 */
function setupScanProgressListener() {
  if (window.lecfalAPI?.onScanProgress) {
    window.lecfalAPI.onScanProgress((data) => {
      latestProgressData = data;
      if (!progressRafScheduled) {
        progressRafScheduled = true;
        requestAnimationFrame(() => {
          progressRafScheduled = false;
          if (!latestProgressData || isCancellingState) return;
          const d = latestProgressData;
          if (scanBannerTitle) scanBannerTitle.textContent = `Escaneando: ${d.folderName || 'Carpeta'}`;
          if (scanBannerFile) scanBannerFile.textContent = `${d.file || ''} (${d.durationMs ? d.durationMs + 'ms' : ''})`;
          const percent = d.total > 0 ? Math.round((d.current / d.total) * 100) : 0;
          if (scanProgressBar) scanProgressBar.style.width = `${percent}%`;
          if (scanBannerCount) scanBannerCount.textContent = `${d.current}/${d.total}`;
        });
      }
    });
  }
}

/**
 * Subscribe to streaming series batch updates during active scanning.
 */
function setupScanSeriesBatchListener() {
  if (window.lecfalAPI?.onSeriesBatch) {
    window.lecfalAPI.onSeriesBatch(() => {
      callbacks.onSeriesBatch?.();
    });
  }
}

/**
 * Initialize Scanner UI listeners and IPC subscriptions.
 * 
 * @param {Object} options
 * @param {Function} options.refreshSeries
 * @param {Function} [options.refreshFolders]
 * @param {Function} [options.showToast]
 * @param {Function} [options.getFolders]
 * @param {Function} [options.onScanStateChange]
 * @param {Function} [options.onSeriesBatch]
 */
export function initScannerUI(options = {}) {
  callbacks = { ...callbacks, ...options };

  btnRescan?.addEventListener('click', handleRescan);
  btnCancelScan?.addEventListener('click', cancelScan);

  // Scan modes dropdown menu
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

  setupScanProgressListener();
  setupScanStatusListener();
  setupScanSeriesBatchListener();
}
