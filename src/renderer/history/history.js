/**
 * History & Continue Reading Module for LecFal Renderer
 *
 * Exposes reading history and in-progress chapters using the existing
 * SQLite reading progress system (reading_position, is_read, last_read_at).
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
  recentHistoryCount: null
};

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
    card.setAttribute('aria-label', `Continuar leyendo ${item.series_title || 'Manga'} - ${item.title || 'Capítulo'}`);
    card.dataset.chapterId = item.id;
    if (item.series_id) card.dataset.seriesId = item.series_id;

    const rawPos = (typeof item.reading_position === 'number' && !isNaN(item.reading_position))
      ? item.reading_position
      : 0;
    const percent = Math.min(99, Math.max(1, Math.round(rawPos * 100)));
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
      <div class="continue-card-cover-wrapper">
        <span class="continue-card-format-badge">${formatUpper}</span>
        ${coverHtml}
        <div class="continue-card-overlay">
          <div class="continue-card-overlay-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
        </div>
      </div>
      <div class="continue-card-info">
        <div class="continue-card-title-group">
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
          <button class="btn-continue-card" type="button" title="Continuar lectura">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>Continuar</span>
          </button>
        </div>
      </div>
    `;

    // Open reader on click or Enter/Space
    const triggerOpen = (e) => {
      e?.preventDefault?.();
      callbacks.openReader?.(item.id);
    };

    card.addEventListener('click', triggerOpen);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        triggerOpen(e);
      }
    });

    const continueBtn = card.querySelector('.btn-continue-card');
    if (continueBtn) {
      continueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerOpen(e);
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
      row.setAttribute('aria-label', `Abrir ${item.series_title || 'Manga'} - ${item.title || 'Capítulo'}`);
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
          <div class="recent-item-cover">
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
          <button class="recent-item-btn-open" type="button" title="Leer capítulo">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>
        </div>
      `;

      const triggerOpen = (e) => {
        e?.preventDefault?.();
        callbacks.openReader?.(item.id);
      };

      row.addEventListener('click', triggerOpen);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          triggerOpen(e);
        }
      });

      const openBtn = row.querySelector('.recent-item-btn-open');
      if (openBtn) {
        openBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerOpen(e);
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
