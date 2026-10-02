/**
 * Generic UI Utilities for LecFal Renderer Process
 * 
 * Reusable, state-independent helpers for string escaping, formatting,
 * timing, toasts, and procedural image fallbacks.
 */

/**
 * Safely escape special HTML characters in strings.
 * @param {string} text - Raw string
 * @returns {string} HTML-escaped string
 */
export function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format raw byte values into human-readable strings (B, KB, MB, GB, TB).
 * @param {number|string} bytes - Raw byte count
 * @param {number} [decimals=1] - Decimal precision
 * @returns {string} Formatted size string
 */
export function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Standard debounce wrapper for rate-limiting frequent event invocations.
 * @param {Function} func - Function to debounce
 * @param {number} wait - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
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

let toastTimeout = null;

/**
 * Display a temporary floating notification toast message.
 * @param {string} msg - Message to display
 */
export function showToast(msg) {
  const toastMessage = document.getElementById('toastMessage');
  const toastNotification = document.getElementById('toastNotification');
  if (!toastMessage || !toastNotification) return;

  toastMessage.textContent = msg;
  toastNotification.style.display = 'flex';
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastNotification.style.display = 'none';
  }, 3500);
}

/**
 * Synchronize the visual state of a favorite toggle button with its boolean status.
 * @param {HTMLElement} btn - Button element
 * @param {boolean} isFav - Whether the item is favorite
 */
export function updateFavButtonState(btn, isFav) {
  if (!btn) return;
  btn.classList.toggle('is-favorite', isFav);
  const heartSvg = btn.querySelector('svg');
  if (heartSvg) {
    heartSvg.setAttribute('fill', isFav ? 'currentColor' : 'none');
  }
}

/**
 * Safely convert a local filesystem cover path into a valid lecfal-cover URL (full resolution).
 * @param {string} coverPath - Absolute path to cover file
 * @returns {string} Custom protocol URL
 */
export function getCoverUrl(coverPath) {
  if (!coverPath || typeof coverPath !== 'string') return '';
  if (coverPath.startsWith('data:') || coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
    return coverPath;
  }
  return `lecfal-cover://cover?path=${encodeURIComponent(coverPath)}`;
}

/**
 * Convert a local filesystem cover path into a downsampled 360px grid thumbnail URL.
 * @param {string} coverPath - Absolute path to cover file
 * @returns {string} Custom protocol URL with type=grid parameter
 */
export function getGridThumbnailUrl(coverPath) {
  if (!coverPath || typeof coverPath !== 'string') return '';
  if (coverPath.startsWith('data:') || coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
    return coverPath;
  }
  return `lecfal-cover://cover?path=${encodeURIComponent(coverPath)}&type=grid`;
}

/**
 * Generate procedural cover fallback HTML when an image is missing or fails to decode.
 * @param {string} title - Series title
 * @param {string} format - Archive format ('cbz', 'pdf', etc.)
 * @returns {string} Fallback card HTML
 */
export function renderCoverFallbackHtml(title, format) {
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
