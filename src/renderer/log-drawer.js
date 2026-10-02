/**
 * Log Drawer & Real-time Diagnostics UI Module for LecFal
 * 
 * Encapsulates the slide-up log terminal drawer, auto-scrolling,
 * IPC log subscriptions, log formatting, and indicator dot states.
 */

import { escapeHtml } from './ui-utils.js';

// ==================== DOM ELEMENTS ====================
const logDrawer = document.getElementById('logDrawer');
const logTerminal = document.getElementById('logTerminal');
const logCountBadge = document.getElementById('logCountBadge');
const btnToggleLogs = document.getElementById('btnToggleLogs');
const logIndicatorDot = document.getElementById('logIndicatorDot');
const btnCloseLogDrawer = document.getElementById('btnCloseLogDrawer');
const btnOpenLogFile = document.getElementById('btnOpenLogFile');
const btnClearLogs = document.getElementById('btnClearLogs');

// ==================== MODULE STATE ====================
let logCount = 0;

/**
 * Initialize the Log Drawer UI, event listeners, and IPC subscriptions.
 */
export function initLogDrawer() {
  btnToggleLogs?.addEventListener('click', toggleLogDrawer);
  btnCloseLogDrawer?.addEventListener('click', closeLogDrawer);

  btnOpenLogFile?.addEventListener('click', async () => {
    try {
      await window.lecfalAPI.openLogFile();
    } catch (err) {
      console.error('Error opening log file:', err);
    }
  });

  btnClearLogs?.addEventListener('click', clearLogs);

  if (window.lecfalAPI?.onLog) {
    window.lecfalAPI.onLog((entryOrBatch) => {
      appendLogsToTerminal(entryOrBatch);
    });
  }

  if (window.lecfalAPI?.getLogs) {
    window.lecfalAPI.getLogs().then(logs => {
      if (Array.isArray(logs)) {
        appendLogsToTerminal(logs);
      }
    }).catch(err => {
      console.error('Error fetching initial logs:', err);
    });
  }
}

/**
 * Open the log drawer, highlight footer button, and scroll to newest entry.
 */
export function openLogDrawer() {
  if (logDrawer) logDrawer.style.display = 'flex';
  if (btnToggleLogs) btnToggleLogs.classList.add('active');
  if (logTerminal) {
    logTerminal.scrollTop = logTerminal.scrollHeight;
  }
}

/**
 * Close the log drawer and remove active highlight from toggle button.
 */
export function closeLogDrawer() {
  if (logDrawer) logDrawer.style.display = 'none';
  if (btnToggleLogs) btnToggleLogs.classList.remove('active');
}

/**
 * Toggle log drawer visibility.
 */
export function toggleLogDrawer() {
  if (isLogDrawerOpen()) {
    closeLogDrawer();
  } else {
    openLogDrawer();
  }
}

/**
 * Check if the log drawer is currently visible.
 * @returns {boolean}
 */
export function isLogDrawerOpen() {
  return Boolean(logDrawer && logDrawer.style.display !== 'none');
}

/**
 * Clear the log terminal in memory, UI, and backend.
 */
export async function clearLogs() {
  try {
    await window.lecfalAPI.clearLogs();
  } catch (err) {
    console.error('Error clearing logs:', err);
  }
  if (logTerminal) logTerminal.innerHTML = '';
  logCount = 0;
  if (logCountBadge) logCountBadge.textContent = '0 eventos';
}

/**
 * Toggle the pulsing active class on the log indicator dot.
 * @param {boolean} active 
 */
export function setLogIndicatorActive(active) {
  if (logIndicatorDot) {
    logIndicatorDot.classList.toggle('active', Boolean(active));
  }
}

/**
 * Format and append incoming log entries to the terminal DOM.
 * Automatically scrolls to bottom if already near bottom or drawer is open.
 * Caps rendered entries to 150 lines to prevent DOM bloat.
 * 
 * @param {Object|Array<Object>} entries - Single log entry or batch of entries
 */
export function appendLogsToTerminal(entries) {
  if (!entries) return;
  if (!Array.isArray(entries)) {
    entries = [entries];
  }
  if (entries.length === 0) return;

  logCount += entries.length;
  if (logCountBadge) logCountBadge.textContent = `${logCount} eventos`;

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

  if (logTerminal) {
    logTerminal.appendChild(fragment);

    // Keep terminal lightweight: max 150 entries in DOM
    while (logTerminal.children.length > 150) {
      logTerminal.removeChild(logTerminal.firstElementChild);
    }

    if (logDrawer && logDrawer.style.display !== 'none') {
      const isNearBottom = logTerminal.scrollHeight - logTerminal.clientHeight - logTerminal.scrollTop < 120;
      if (isNearBottom) {
        logTerminal.scrollTop = logTerminal.scrollHeight;
      }
    }
  }
}
