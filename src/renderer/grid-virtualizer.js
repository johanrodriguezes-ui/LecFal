/**
 * GridVirtualizer - High-Performance Zero-Dependency True Grid Virtualizer for LecFal
 *
 * Architecture:
 * - .comics-grid (virtual viewport/container with .is-virtualized class)
 *   - .comics-grid-track (spans full virtual height calculated from row geometry)
 *     - .virtual-row (absolutely positioned row elements containing up to N columns)
 *       - .comic-card (native LecFal series card with identical styles and hover effects)
 *
 * Performance Principles:
 * - Mathematical range calculation from scroll position and cached row geometry.
 * - Zero getBoundingClientRect() calls during scrolling.
 * - Single rAF-throttled scroll listener.
 * - Window/container resize observation via ResizeObserver.
 * - Event delegation for card clicks and favorite toggling.
 * - Normalized scroll position preservation across card-size slider changes.
 */

export class GridVirtualizer {
  constructor(options = {}) {
    this.container = options.container; // Element (#comicsGrid)
    this.scrollContainer = options.scrollContainer; // Element (#mainContent)
    this.createCardFn = options.createCardFn; // Function(series) -> HTMLElement
    this.onFavoriteToggle = options.onFavoriteToggle || null;
    this.onCardClick = options.onCardClick || null;
    this.prefetcher = options.prefetcher || null;

    this.dataset = [];
    this.bufferRows = options.bufferRows || 3; // 3 buffer rows above and below viewport

    // Cached Geometry
    this.containerWidth = 0;
    this.viewportHeight = 0;
    this.minCardWidth = 185;
    this.gap = 20;
    this.columns = 6;
    this.cardWidth = 185;
    this.cardHeight = 345;
    this.rowHeight = 365;
    this.totalRows = 0;
    this.totalVirtualHeight = 0;

    // Active virtual state
    this.mountedStartRow = -1;
    this.mountedEndRow = -1;
    this.isTicking = false;
    this.trackEl = null;
    this.resizeObserver = null;

    if (this.container) {
      this.container.__virtualizer = this;
    }

    this._initDOM();
    this._bindEvents();
  }

  /**
   * Initializes virtual track container and delegates DOM layout.
   * @private
   */
  _initDOM() {
    this.container.classList.add('is-virtualized');
    this.container.innerHTML = '';

    this.trackEl = document.createElement('div');
    this.trackEl.className = 'comics-grid-track';
    this.container.appendChild(this.trackEl);
  }

  /**
   * Binds scroll listener, resize observer, and centralized event delegation.
   * @private
   */
  _bindEvents() {
    // 1. Throttled scroll listener
    this.scrollContainer.addEventListener('scroll', () => {
      if (this.isTicking) return;
      this.isTicking = true;
      requestAnimationFrame(() => {
        this.isTicking = false;
        this.updateVisibleRange();
      });
    }, { passive: true });

    // 2. ResizeObserver for responsive width changes
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newWidth = Math.round(entry.contentRect.width);
          if (newWidth > 0 && Math.abs(newWidth - this.containerWidth) > 2) {
            this.handleResize();
          }
        }
      });
      this.resizeObserver.observe(this.container);
    }

    // 3. Centralized Event Delegation for Card Clicks & Favorite Toggles
    this.container.addEventListener('click', async (e) => {
      const favBtn = e.target.closest('.card-fav-btn');
      if (favBtn) {
        e.stopPropagation();
        const seriesId = parseInt(favBtn.dataset.id, 10);
        if (this.onFavoriteToggle) {
          await this.onFavoriteToggle(seriesId, favBtn);
        }
        return;
      }

      const card = e.target.closest('.comic-card');
      if (card && card.dataset.id) {
        const seriesId = parseInt(card.dataset.id, 10);
        if (this.onCardClick) {
          this.onCardClick(seriesId);
        }
      }
    });

    // 4. Keyboard Accessibility (Enter / Space to activate focused card)
    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.comic-card');
        if (card && card.dataset.id && e.target === card) {
          e.preventDefault();
          const seriesId = parseInt(card.dataset.id, 10);
          if (this.onCardClick) {
            this.onCardClick(seriesId);
          }
        }
      }
    });
  }

  /**
   * Sets new dataset and refreshes virtual view.
   * @param {Array} seriesArray
   * @param {boolean} [resetScroll=false]
   */
  setDataset(seriesArray, resetScroll = false) {
    this.dataset = Array.isArray(seriesArray) ? seriesArray : [];

    if (resetScroll) {
      this.scrollContainer.scrollTop = 0;
    }

    if (this.prefetcher) {
      this.prefetcher.cancelAll();
    }

    this.recalculateGeometry();
    this.updateVisibleRange(true);
  }

  /**
   * Finds an item in the active virtual dataset.
   * @param {number} seriesId
   * @returns {Object|null}
   */
  findSeries(seriesId) {
    return this.dataset.find(s => s.id === seriesId) || null;
  }

  /**
   * Measures card height accurately using a representative sample in the real CSS cascade.
   * Runs only when geometry changes (never during scrolling).
   * @returns {number}
   */
  measureCardHeight() {
    if (this.dataset.length === 0 && this.cardWidth <= 0) {
      return 345;
    }

    const sample = this.dataset[0] || {
      id: -1,
      title: 'Sample Series Title Clamped Line 1 Sample Title Line 2',
      chapter_count: 99,
      author: 'Author Name',
      primary_format: 'cbz',
      cover_path: ''
    };

    const tempCard = this.createCardFn(sample);
    tempCard.style.position = 'absolute';
    tempCard.style.visibility = 'hidden';
    tempCard.style.pointerEvents = 'none';
    tempCard.style.top = '-9999px';
    tempCard.style.left = '0';
    tempCard.style.width = `${Math.round(this.cardWidth)}px`;

    this.container.appendChild(tempCard);
    const measuredHeight = Math.ceil(tempCard.offsetHeight);
    tempCard.remove();

    return Math.max(120, measuredHeight || 345);
  }

  /**
   * Recalculates all grid geometry, columns, card width, card height, and total height.
   */
  recalculateGeometry() {
    const rawWidth = this.container.clientWidth;
    this.containerWidth = rawWidth > 0 ? rawWidth : 1200;
    this.viewportHeight = this.scrollContainer.clientHeight || 800;

    // Read CSS variable for minimum card width
    const cssMin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grid-item-min-width'));
    this.minCardWidth = (!isNaN(cssMin) && cssMin > 0) ? cssMin : 185;
    this.gap = 20;

    // Columns = floor((containerWidth + gap) / (minCardWidth + gap))
    this.columns = Math.max(1, Math.floor((this.containerWidth + this.gap) / (this.minCardWidth + this.gap)));

    // Actual card width = (containerWidth - (columns - 1) * gap) / columns
    this.cardWidth = Math.max(100, (this.containerWidth - (this.columns - 1) * this.gap) / this.columns);

    // Measure representative card height
    this.cardHeight = this.measureCardHeight();
    this.rowHeight = this.cardHeight + this.gap;

    // Virtual height
    this.totalRows = Math.ceil(this.dataset.length / this.columns);
    this.totalVirtualHeight = this.totalRows > 0 ? (this.totalRows * this.cardHeight + (this.totalRows - 1) * this.gap) : 0;

    // Apply track dimensions
    this.trackEl.style.height = `${this.totalVirtualHeight}px`;
    this.container.style.setProperty('--virtual-cols', this.columns);
  }

  /**
   * Handles container resize or card-size slider changes while preserving normalized scroll ratio.
   */
  handleResize() {
    if (this.prefetcher) {
      this.prefetcher.cancelAll();
    }

    const oldScrollTop = this.scrollContainer.scrollTop;
    const oldScrollHeight = this.scrollContainer.scrollHeight;
    const viewportHeight = this.scrollContainer.clientHeight;
    const scrollRatio = oldScrollTop / Math.max(1, oldScrollHeight - viewportHeight);

    this.recalculateGeometry();
    this.updateVisibleRange(true);

    // Restore normalized scroll position
    const newScrollHeight = this.scrollContainer.scrollHeight;
    this.scrollContainer.scrollTop = Math.round(scrollRatio * Math.max(0, newScrollHeight - viewportHeight));
  }

  /**
   * Calculates visible and buffered row ranges, updating mounted rows only if changed.
   * @param {boolean} [force=false]
   */
  updateVisibleRange(force = false) {
    if (this.totalRows === 0 || this.rowHeight <= 0) {
      if (this.mountedStartRow !== -1 || force) {
        this.trackEl.replaceChildren();
        this.mountedStartRow = -1;
        this.mountedEndRow = -1;
      }
      return;
    }

    const scrollTop = this.scrollContainer.scrollTop;
    const viewportHeight = this.viewportHeight || 800;

    const visibleStartRow = Math.floor(scrollTop / this.rowHeight);
    const visibleEndRow = Math.ceil((scrollTop + viewportHeight) / this.rowHeight);

    const startRow = Math.max(0, visibleStartRow - this.bufferRows);
    const endRow = Math.min(this.totalRows - 1, visibleEndRow + this.bufferRows);

    if (!force && startRow === this.mountedStartRow && endRow === this.mountedEndRow) {
      if (this.prefetcher) {
        this.prefetcher.onScroll({
          scrollTop,
          startRow,
          endRow,
          totalRows: this.totalRows,
          columns: this.columns,
          dataset: this.dataset
        });
      }
      return; // Range unchanged, zero DOM writes!
    }

    this.renderRows(startRow, endRow);

    if (this.prefetcher) {
      this.prefetcher.onScroll({
        scrollTop,
        startRow,
        endRow,
        totalRows: this.totalRows,
        columns: this.columns,
        dataset: this.dataset
      });
    }
  }

  /**
   * Mounts only the requested row range into the track container.
   * @param {number} startRow
   * @param {number} endRow
   */
  renderRows(startRow, endRow) {
    this.mountedStartRow = startRow;
    this.mountedEndRow = endRow;

    if (startRow > endRow || startRow < 0) {
      this.trackEl.replaceChildren();
      return;
    }

    const fragment = document.createDocumentFragment();

    for (let r = startRow; r <= endRow; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'virtual-row';
      rowEl.dataset.row = r;
      rowEl.style.top = `${r * this.rowHeight}px`;
      rowEl.style.height = `${this.cardHeight}px`;

      const startIndex = r * this.columns;
      const endIndex = Math.min(this.dataset.length, startIndex + this.columns);

      for (let i = startIndex; i < endIndex; i++) {
        const card = this.createCardFn(this.dataset[i]);
        rowEl.appendChild(card);
      }

      fragment.appendChild(rowEl);
    }

    // Atomic native node replacement (zero memory leaks, avoids innerHTML re-parsing)
    this.trackEl.replaceChildren(fragment);
  }

  /**
   * Returns current mounted card count and DOM node statistics.
   * @returns {{ mountedCards: number, mountedRows: number, totalCards: number, totalRows: number }}
   */
  getStats() {
    const mountedRows = (this.mountedStartRow >= 0 && this.mountedEndRow >= this.mountedStartRow)
      ? (this.mountedEndRow - this.mountedStartRow + 1)
      : 0;
    const cards = this.trackEl.querySelectorAll('.comic-card');

    return {
      mountedCards: cards.length,
      mountedRows,
      totalCards: this.dataset.length,
      totalRows: this.totalRows,
      virtualHeight: this.totalVirtualHeight,
      columns: this.columns
    };
  }
}

export default GridVirtualizer;
