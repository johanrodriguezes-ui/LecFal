/**
 * History & Continue Reading Module for LecFal Renderer
 *
 * Exposes reading history and in-progress chapters using the dedicated
 * reading_history SQLite model while preserving independent chapter reading
 * state (reading_position, is_read).
 */

import {
  escapeHtml,
  getCoverUrl,
  getGridThumbnailUrl,
  renderCoverFallbackHtml
} from '../utils/ui-utils.js';

// Cached callbacks
let callbacks = {
  openReader: null,
  openMangaView: null,
  showToast: null
};

// Cached DOM elements
const elements = {
  historyView: null,
  continueReadingGrid: null,
  continueReadingEmpty: null,
  continueReadingCount: null,
  recentHistoryContainer: null,
  recentHistoryEmpty: null,
  recentHistoryCount: null,
  // Delete modal elements
  modalDeleteHistory: null,
  btnCloseDeleteHistoryModal: null,
  btnCancelDeleteHistory: null,
  btnConfirmDeleteHistory: null,
  deleteHistoryMessage: null,
  deleteHistorySeriesTitle: null,
  deleteHistoryChapterTitle: null,
  deleteHistoryTimestamp: null,
  deleteHistorySafeNotice: null,
  checkResetMangaHistory: null,
  resetMangaWarning: null,
  deleteHistoryModalError: null
};

// Currently tracked item for deletion modal
let activeDeleteItem = null;

/**
 * Initialize the History module with host callbacks.
 * @param {Object} cbs
 * @param {Function} cbs.openReader
 * @param {Function} [cbs.openMangaView]
 * @param {Function} [cbs.showToast]
 */
export function initHistory(cbs = {}) {
  callbacks = { ...callbacks, ...cbs };

  elements.historyView = document.getElementById('historyView');
  elements.continueReadingGrid = document.getElementById('continueReadingGrid');
  elements.continueReadingEmpty = document.getElementById('continueReadingEmpty');
  elements.continueReadingCount = document.getElementById('continueReadingCount');
  elements.recentHistoryContainer = document.getElementById('recentHistoryContainer');
  elements.recentHistoryEmpty = document.getElementById('recentHistoryEmpty');
  elements.recentHistoryCount = document.getElementById('recentHistoryCount');

  // Cache delete modal elements
  elements.modalDeleteHistory = document.getElementById('modalDeleteHistory');
  elements.btnCloseDeleteHistoryModal = document.getElementById('btnCloseDeleteHistoryModal');
  elements.btnCancelDeleteHistory = document.getElementById('btnCancelDeleteHistory');
  elements.btnConfirmDeleteHistory = document.getElementById('btnConfirmDeleteHistory');
  elements.deleteHistoryMessage = document.getElementById('deleteHistoryMessage');
  elements.deleteHistorySeriesTitle = document.getElementById('deleteHistorySeriesTitle');
  elements.deleteHistoryChapterTitle = document.getElementById('deleteHistoryChapterTitle');
  elements.deleteHistoryTimestamp = document.getElementById('deleteHistoryTimestamp');
  elements.deleteHistorySafeNotice = document.getElementById('deleteHistorySafeNotice');
  elements.checkResetMangaHistory = document.getElementById('checkResetMangaHistory');
  elements.resetMangaWarning = document.getElementById('resetMangaWarning');
  elements.deleteHistoryModalError = document.getElementById('deleteHistoryModalError');

  // Modal event listeners
  elements.btnCloseDeleteHistoryModal?.addEventListener('click', closeDeleteHistoryModal);
  elements.btnCancelDeleteHistory?.addEventListener('click', closeDeleteHistoryModal);
  elements.btnConfirmDeleteHistory?.addEventListener('click', handleConfirmDeleteHistory);
  elements.modalDeleteHistory?.addEventListener('click', (e) => {
    if (e.target === elements.modalDeleteHistory) {
      closeDeleteHistoryModal();
    }
  });

  elements.checkResetMangaHistory?.addEventListener('change', () => {
    const isReset = !!elements.checkResetMangaHistory.checked;
    if (isReset) {
      if (elements.resetMangaWarning) elements.resetMangaWarning.style.display = 'block';
      if (elements.btnConfirmDeleteHistory) elements.btnConfirmDeleteHistory.textContent = 'Reiniciar manga';
      if (elements.deleteHistorySafeNotice) {
        elements.deleteHistorySafeNotice.innerHTML = '<strong>Atención:</strong> Se eliminará todo el historial de este manga y todos sus capítulos volverán a marcarse como no leídos (posición 0%). Tus archivos CBZ/PDF originales <strong>NO</strong> se modificarán ni eliminarán.';
      }
    } else {
      if (elements.resetMangaWarning) elements.resetMangaWarning.style.display = 'none';
      if (elements.btnConfirmDeleteHistory) elements.btnConfirmDeleteHistory.textContent = 'Quitar del historial';
      if (elements.deleteHistorySafeNotice && activeDeleteItem) {
        const timeFormatted = formatDateDetailed(activeDeleteItem.last_read_at);
        elements.deleteHistorySafeNotice.innerHTML = `Se eliminará el registro de actividad de que viste este capítulo por última vez el <strong>${escapeHtml(timeFormatted)}</strong> y ya no aparecerá en tu historial.<br><br><strong>Tu progreso se conservará:</strong> El progreso de lectura de este capítulo no se perderá. Si abres el manga de nuevo desde la Biblioteca, podrás continuar desde la posición guardada.`;
      }
    }
  });

  // Global Escape key support
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isDeleteHistoryModalOpen()) closeDeleteHistoryModal();
    }
  });

  // Expose module globally for tests and host application
  window.historyModule = {
    initHistory,
    loadAndRenderHistory,
    renderContinueReading,
    renderRecentHistory,
    openDeleteHistoryModal,
    closeDeleteHistoryModal,
    handleConfirmDeleteHistory,
    isDeleteHistoryModalOpen,
    formatRelativeTime,
    formatDateDetailed,
    getDateGroupKey,
    parseDbDate
  };
}

/**
 * Parse an SQLite DATETIME string (UTC) or ISO string into a JavaScript Date.
 * SQLite CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS" in UTC.
 * @param {string|Date} dateVal
 * @returns {Date|null}
 */
export function parseDbDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (!trimmed) return null;
    const isoString = trimmed.includes(' ') && !trimmed.includes('Z') && !trimmed.includes('+')
      ? trimmed.replace(' ', 'T') + 'Z'
      : trimmed;
    const parsed = new Date(isoString);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Format timestamp into Spanish human-readable relative time string.
 * Examples: "Hace un momento", "Hace 2 horas", "Ayer", "Hace 3 días".
 * @param {string|Date} dateVal
 * @returns {string}
 */
export function formatRelativeTime(dateVal) {
  const date = parseDbDate(dateVal);
  if (!date) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 45) return 'Hace un momento';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return 'Hace 1 minuto';
  if (diffMin < 60) return `Hace ${diffMin} minutos`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return 'Hace 1 hora';
  if (diffHours < 24) {
    const isToday = now.getDate() === date.getDate() &&
                    now.getMonth() === date.getMonth() &&
                    now.getFullYear() === date.getFullYear();
    if (isToday) {
      return `Hace ${diffHours} horas`;
    }
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const itemTime = date.getTime();

  if (itemTime >= yesterdayStart && itemTime < todayStart) {
    return 'Ayer';
  }

  const diffDays = Math.floor(diffMs / (24 * 3600 * 1000));
  if (diffDays <= 6) return `Hace ${diffDays} días`;
  if (diffDays <= 27) {
    const weeks = Math.max(1, Math.floor(diffDays / 7));
    return weeks === 1 ? 'Hace 1 semana' : `Hace ${weeks} semanas`;
  }

  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/**
 * Format timestamp into Spanish human-readable detailed date string.
 * Example: "1 de octubre de 2026 a las 10:00"
 * @param {string|Date} dateVal
 * @returns {string}
 */
export function formatDateDetailed(dateVal) {
  const date = parseDbDate(dateVal);
  if (!date) return 'Fecha no disponible';
  try {
    const day = date.getDate();
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day} de ${month} de ${year} a las ${hours}:${minutes}`;
  } catch (_) {
    return String(dateVal);
  }
}

/**
 * Group key determination for chronological recent history.
 * Groups by "Hoy", "Ayer", "Esta semana", "Este mes", or "Anteriores".
 * @param {string|Date} dateVal
 * @returns {string} Group title
 */
export function getDateGroupKey(dateVal) {
  const date = parseDbDate(dateVal);
  if (!date) return 'Anteriores';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const itemTime = date.getTime();

  if (itemTime >= todayStart) {
    return 'Hoy';
  }
  if (itemTime >= yesterdayStart) {
    return 'Ayer';
  }

  const weekStart = todayStart - 6 * 86400000;
  if (itemTime >= weekStart) {
    return 'Esta semana';
  }

  const monthStart = todayStart - 29 * 86400000;
  if (itemTime >= monthStart) {
    return 'Este mes';
  }

  return 'Anteriores';
}

/**
 * Load fresh history data via IPC and render the entire History view.
 */
export async function loadAndRenderHistory() {
  if (!window.lecfalAPI) return;

  try {
    const [continueItems, historyItems] = await Promise.all([
      window.lecfalAPI.getContinueReading(20),
      window.lecfalAPI.getReadingHistory(50)
    ]);

    renderContinueReading(continueItems || []);
    renderRecentHistory(historyItems || []);
  } catch (err) {
    console.error('[LecFal History] Error al cargar historial:', err);
    if (callbacks.showToast) {
      callbacks.showToast('Error al cargar historial');
    }
  }
}

/**
 * Check if the delete history modal is currently visible.
 * @returns {boolean}
 */
export function isDeleteHistoryModalOpen() {
  const modal = elements.modalDeleteHistory || document.getElementById('modalDeleteHistory');
  return !!(modal && modal.style.display !== 'none');
}

/**
 * Open the confirmation modal to delete a history entry.
 * @param {Object} item History record
 */
export function openDeleteHistoryModal(item) {
  if (!item) return;
  activeDeleteItem = item;

  const modal = elements.modalDeleteHistory || document.getElementById('modalDeleteHistory');
  const seriesEl = elements.deleteHistorySeriesTitle || document.getElementById('deleteHistorySeriesTitle');
  const chapterEl = elements.deleteHistoryChapterTitle || document.getElementById('deleteHistoryChapterTitle');
  const timeEl = elements.deleteHistoryTimestamp || document.getElementById('deleteHistoryTimestamp');
  const checkReset = elements.checkResetMangaHistory || document.getElementById('checkResetMangaHistory');
  const resetWarning = elements.resetMangaWarning || document.getElementById('resetMangaWarning');
  const safeNotice = elements.deleteHistorySafeNotice || document.getElementById('deleteHistorySafeNotice');
  const confirmBtn = elements.btnConfirmDeleteHistory || document.getElementById('btnConfirmDeleteHistory');
  const errorEl = elements.deleteHistoryModalError || document.getElementById('deleteHistoryModalError');

  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }

  if (seriesEl) seriesEl.textContent = item.series_title || 'Manga';
  if (chapterEl) chapterEl.textContent = item.title || item.file_name || 'Capítulo';

  const formattedDate = formatDateDetailed(item.last_read_at);
  if (timeEl) {
    timeEl.textContent = `Última lectura: ${formattedDate}`;
  }

  if (checkReset) {
    checkReset.checked = false;
  }
  if (resetWarning) {
    resetWarning.style.display = 'none';
  }
  if (safeNotice) {
    safeNotice.innerHTML = `Se eliminará el registro de actividad de que viste este capítulo por última vez el <strong>${escapeHtml(formattedDate)}</strong> y ya no aparecerá en tu historial.<br><br><strong>Tu progreso se conservará:</strong> El progreso de lectura de este capítulo no se perderá. Si abres el manga de nuevo desde la Biblioteca, podrás continuar desde la posición guardada.`;
  }
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Quitar del historial';
  }

  if (modal) {
    modal.style.display = 'flex';
  }
}

/**
 * Close the delete history confirmation modal.
 */
export function closeDeleteHistoryModal() {
  activeDeleteItem = null;
  const modal = elements.modalDeleteHistory || document.getElementById('modalDeleteHistory');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Confirm and execute the deletion of a history entry or full manga reset.
 */
export async function handleConfirmDeleteHistory() {
  if (!activeDeleteItem) return;
  const item = activeDeleteItem;

  const checkReset = elements.checkResetMangaHistory || document.getElementById('checkResetMangaHistory');
  const isReset = !!(checkReset && checkReset.checked);
  const confirmBtn = elements.btnConfirmDeleteHistory || document.getElementById('btnConfirmDeleteHistory');
  const errorEl = elements.deleteHistoryModalError || document.getElementById('deleteHistoryModalError');

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = isReset ? 'Reiniciando...' : 'Quitando...';
  }
  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }

  try {
    if (isReset) {
      if (window.lecfalAPI && typeof window.lecfalAPI.resetSeriesReadingHistory === 'function') {
        await window.lecfalAPI.resetSeriesReadingHistory(item.series_id);
      }
      closeDeleteHistoryModal();
      callbacks.showToast?.('Historial y progreso del manga reiniciados con éxito.');
    } else {
      const chapterId = item.id || item.chapter_id;
      if (window.lecfalAPI && typeof window.lecfalAPI.deleteReadingHistoryEntry === 'function') {
        await window.lecfalAPI.deleteReadingHistoryEntry(chapterId);
      }
      closeDeleteHistoryModal();
      callbacks.showToast?.('Capítulo quitado del historial.');
    }

    await loadAndRenderHistory();
  } catch (err) {
    console.error('[LecFal History] Error al eliminar registro:', err);
    if (errorEl) {
      errorEl.textContent = `Error: ${err.message}`;
      errorEl.style.display = 'block';
    }
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = isReset ? 'Reiniciar manga' : 'Quitar del historial';
    }
  }
}

/**
 * Render Section A: Continue Reading cards.
 * @param {Array<Object>} items
 */
export function renderContinueReading(items = []) {
  if (!elements.continueReadingGrid || !elements.continueReadingEmpty) return;

  const validItems = Array.isArray(items) ? items : [];

  if (elements.continueReadingCount) {
    elements.continueReadingCount.textContent = validItems.length;
    elements.continueReadingCount.style.display = validItems.length > 0 ? 'inline-flex' : 'none';
  }

  if (validItems.length === 0) {
    elements.continueReadingGrid.innerHTML = '';
    elements.continueReadingGrid.style.display = 'none';
    elements.continueReadingEmpty.style.display = 'flex';
    return;
  }

  elements.continueReadingEmpty.style.display = 'none';
  elements.continueReadingGrid.style.display = 'grid';
  elements.continueReadingGrid.innerHTML = '';

  const fragment = document.createDocumentFragment();

  validItems.forEach(item => {
    const card = document.createElement('article');
    card.className = 'continue-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Ver detalles de ${item.series_title || 'Manga'} - ${item.title || 'Capítulo'}`);
    card.dataset.chapterId = item.id;
    if (item.series_id) card.dataset.seriesId = item.series_id;

    const rawPos = (typeof item.reading_position === 'number' && !isNaN(item.reading_position))
      ? item.reading_position
      : 0;
    const percent = Math.round(rawPos * 100);
    const timeStr = formatRelativeTime(item.last_read_at);
    const formatUpper = (item.format || item.series_format || 'CBZ').toUpperCase();

    let coverHtml = '';
    if (item.series_cover_path) {
      const gridUrl = getGridThumbnailUrl(item.series_cover_path);
      const fallbackUrl = getCoverUrl(item.series_cover_path);
      coverHtml = `<img class="continue-card-cover-img" src="${gridUrl}" alt="${escapeHtml(item.series_title || '')}" loading="lazy" onerror="if(this.src!=='${escapeHtml(fallbackUrl)}'){this.src='${escapeHtml(fallbackUrl)}';}">`;
    } else {
      coverHtml = renderCoverFallbackHtml(item.series_title || 'Manga', item.series_format || item.format);
    }

    card.innerHTML = `
      <div class="continue-card-cover-wrapper" title="Ver detalles del manga">
        <span class="continue-card-format-badge">${formatUpper}</span>
        ${coverHtml}
        <div class="continue-card-overlay">
          <div class="continue-card-overlay-icon" aria-hidden="true" title="Ver detalles">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
        </div>
      </div>
      <div class="continue-card-info">
        <div class="continue-card-title-group" title="Ver detalles del manga">
          <div class="continue-card-manga" title="${escapeHtml(item.series_title || 'Manga')}">${escapeHtml(item.series_title || 'Manga')}</div>
          <div class="continue-card-chapter" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || 'Capítulo')}</div>
        </div>
        <div class="continue-progress-wrap">
          <div class="continue-card-meta-row">
            <span class="continue-card-percent">${percent}%</span>
            ${timeStr ? `<span class="continue-card-time">${escapeHtml(timeStr)}</span>` : ''}
          </div>
          <div class="continue-progress-bar-bg" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
            <div class="continue-progress-bar-fill" style="width: ${percent}%;"></div>
          </div>
        </div>
        <div class="continue-card-actions">
          <button class="btn-delete-card" type="button" title="Quitar del historial" aria-label="Quitar del historial">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
          <button class="btn-continue-card" type="button" title="Continuar lectura">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>Continuar</span>
          </button>
        </div>
      </div>
    `;

    // Clicking the cover opens Manga Detail
    const coverWrapper = card.querySelector('.continue-card-cover-wrapper');

    if (coverWrapper) {
      coverWrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.series_id) {
        callbacks.openMangaView?.(item.series_id);
        }
      });
    }

    // Clicking "Continuar" opens the exact chapter in the reader
    const continueBtn = card.querySelector('.btn-continue-card');
    if (continueBtn) {
      continueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.openReader?.(item.id);
      });
    }

    // Clicking delete opens delete modal
    const deleteBtn = card.querySelector('.btn-delete-card');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteHistoryModal(item);
      });
    }

    // Attach image error fallback handler if image exists
    const imgEl = card.querySelector('.continue-card-cover-img');
    if (imgEl) {
      imgEl.addEventListener('error', () => {
        const fallbackContainer = document.createElement('div');
        fallbackContainer.innerHTML = renderCoverFallbackHtml(item.series_title || 'Manga', item.series_format || item.format);
        imgEl.replaceWith(fallbackContainer.firstElementChild);
      }, { once: true });
    }

    fragment.appendChild(card);
  });

  elements.continueReadingGrid.appendChild(fragment);
}

/**
 * Render Section B: Grouped Recent History list.
 * @param {Array<Object>} items
 */
export function renderRecentHistory(items = []) {
  if (!elements.recentHistoryContainer || !elements.recentHistoryEmpty) return;

  const validItems = Array.isArray(items) ? items : [];

  if (elements.recentHistoryCount) {
    elements.recentHistoryCount.textContent = validItems.length;
    elements.recentHistoryCount.style.display = validItems.length > 0 ? 'inline-flex' : 'none';
  }

  if (validItems.length === 0) {
    elements.recentHistoryContainer.innerHTML = '';
    elements.recentHistoryContainer.style.display = 'none';
    elements.recentHistoryEmpty.style.display = 'flex';
    return;
  }

  elements.recentHistoryEmpty.style.display = 'none';
  elements.recentHistoryContainer.style.display = 'flex';
  elements.recentHistoryContainer.innerHTML = '';

  // Group items by date bucket maintaining order
  const groupOrder = ['Hoy', 'Ayer', 'Esta semana', 'Este mes', 'Anteriores'];
  const groups = new Map();

  validItems.forEach(item => {
    const groupKey = getDateGroupKey(item.last_read_at);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(item);
  });

  const fragment = document.createDocumentFragment();

  // Render in predetermined chronological hierarchy
  const orderedKeys = [
    ...groupOrder.filter(k => groups.has(k)),
    ...Array.from(groups.keys()).filter(k => !groupOrder.includes(k))
  ];

  orderedKeys.forEach(groupKey => {
    const groupItems = groups.get(groupKey) || [];
    if (groupItems.length === 0) return;

    const groupSection = document.createElement('div');
    groupSection.className = 'recent-group';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'recent-group-header';
    groupHeader.innerHTML = `
      <span class="recent-group-title">${escapeHtml(groupKey)}</span>
      <span class="recent-group-badge">${groupItems.length}</span>
    `;
    groupSection.appendChild(groupHeader);

    const listContainer = document.createElement('div');
    listContainer.className = 'recent-list';

    groupItems.forEach(item => {
      const row = document.createElement('div');
      row.className = 'recent-item';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Ver detalles de ${item.series_title || 'Manga'} - ${item.title || 'Capítulo'}`);
      row.dataset.chapterId = item.id;
      if (item.series_id) row.dataset.seriesId = item.series_id;

      // Completion status vs partial progress
      const isCompleted = item.is_read === 1 || (typeof item.reading_position === 'number' && item.reading_position >= 0.90);
      const rawPos = (typeof item.reading_position === 'number' && !isNaN(item.reading_position)) ? item.reading_position : 0;
      const progressPercent = Math.min(100, Math.max(0, Math.round(rawPos * 100)));
      const timeStr = formatRelativeTime(item.last_read_at);

      const statusBadgeHtml = isCompleted
        ? `<span class="history-status-badge completed" title="Capítulo completado">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Completado
          </span>`
        : `<span class="history-status-badge in-progress" title="Progreso de lectura">${progressPercent}%</span>`;

      let coverHtml = '';
      if (item.series_cover_path) {
        const gridUrl = getGridThumbnailUrl(item.series_cover_path);
        const fallbackUrl = getCoverUrl(item.series_cover_path);
        coverHtml = `<img src="${gridUrl}" alt="${escapeHtml(item.series_title || '')}" loading="lazy" onerror="if(this.src!=='${escapeHtml(fallbackUrl)}'){this.src='${escapeHtml(fallbackUrl)}';}">`;
      } else {
        coverHtml = renderCoverFallbackHtml(item.series_title || 'Manga', item.series_format || item.format);
      }

      row.innerHTML = `
        <div class="recent-item-left">
          <div class="recent-item-cover" title="Ver detalles del manga">
            ${coverHtml}
          </div>
          <div class="recent-item-details">
            <div class="recent-item-series" title="${escapeHtml(item.series_title || 'Manga')}">${escapeHtml(item.series_title || 'Manga')}</div>
            <div class="recent-item-chapter" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || 'Capítulo')}</div>
          </div>
        </div>
        <div class="recent-item-right">
          ${statusBadgeHtml}
          ${timeStr ? `<span class="recent-item-time">${escapeHtml(timeStr)}</span>` : ''}
          <button class="recent-item-btn-delete" type="button" title="Quitar del historial" aria-label="Quitar del historial">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
          <button class="recent-item-btn-open" type="button" title="Leer capítulo">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>
        </div>
      `;

      // Clicking only the cover opens Manga Detail
      const cover = row.querySelector('.recent-item-cover');

      if (cover) {
        cover.addEventListener('click', (e) => {
          e.stopPropagation();
          if (item.series_id) {
            callbacks.openMangaView?.(item.series_id);
          }
        });
      }

      // Clicking open button triggers reader for exact chapter
      const openBtn = row.querySelector('.recent-item-btn-open');
      if (openBtn) {
        openBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          callbacks.openReader?.(item.id);
        });
      }

      // Clicking delete button opens delete modal
      const deleteBtn = row.querySelector('.recent-item-btn-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openDeleteHistoryModal(item);
        });
      }

      const imgEl = row.querySelector('.recent-item-cover img');
      if (imgEl) {
        imgEl.addEventListener('error', () => {
          const fallbackContainer = document.createElement('div');
          fallbackContainer.innerHTML = renderCoverFallbackHtml(item.series_title || 'Manga', item.series_format || item.format);
          imgEl.replaceWith(fallbackContainer.firstElementChild);
        }, { once: true });
      }

      listContainer.appendChild(row);
    });

    groupSection.appendChild(listContainer);
    fragment.appendChild(groupSection);
  });

  elements.recentHistoryContainer.appendChild(fragment);
}
