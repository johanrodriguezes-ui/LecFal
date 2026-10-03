/**
 * ThumbnailPrefetcher - Direction-Aware Bounded Thumbnail Prefetcher for LecFal Library
 *
 * Phase 5.4 Experimental Architecture:
 * - Operates independently from the rendered DOM (zero extra DOM elements, zero visible layout impact).
 * - Prefetches only dedicated grid thumbnails (lecfal-cover://...?type=grid).
 * - Direction-aware: prioritizes rows ahead of the visible+buffered range in the scroll direction.
 * - Modes:
 *   - 'none' (Mode A - No Prefetch, default baseline)
 *   - 'small' (Mode B - 1 additional row beyond buffer)
 *   - 'aggressive' (Mode C - 2 additional rows beyond buffer)
 * - Bounded concurrency: maxConcurrency = 2 (default)
 * - Stale request cancellation: drops queued requests if scroll direction reverses or jumps
 * - Duplicate & in-flight suppression
 * - Complete telemetry for A/B/C benchmarking
 */

export class ThumbnailPrefetcher {
  constructor(options = {}) {
    this.mode = options.mode || 'none'; // 'none' | 'small' | 'aggressive'
    this.maxConcurrency = options.maxConcurrency || 2;
    this.getThumbnailUrlFn = options.getThumbnailUrlFn || null;

    this.activeRequests = 0;
    this.peakActiveRequests = 0;
    this.queue = []; // Array of { url, row }
    this.inFlight = new Set();
    this.completed = new Set(); // Cache of completed URLs

    this.lastScrollTop = 0;
    this.scrollDirection = 'down'; // 'down' | 'up'

    // Telemetry counters
    this.stats = {
      prefetchRequests: 0,
      successfulPrefetches: 0,
      failedPrefetches: 0,
      duplicateAvoided: 0,
      droppedStale: 0,
      peakConcurrent: 0
    };
  }

  /**
   * Sets prefetch mode ('none' | 'small' | 'aggressive')
   * @param {'none' | 'small' | 'aggressive'} mode
   */
  setMode(mode) {
    if (['none', 'small', 'aggressive'].includes(mode)) {
      this.mode = mode;
      if (mode === 'none') {
        this.cancelAll();
      }
    }
  }

  getMode() {
    return this.mode;
  }

  resetStats() {
    this.stats = {
      prefetchRequests: 0,
      successfulPrefetches: 0,
      failedPrefetches: 0,
      duplicateAvoided: 0,
      droppedStale: 0,
      peakConcurrent: 0
    };
    this.completed.clear();
    this.inFlight.clear();
    this.queue = [];
    this.activeRequests = 0;
    this.peakActiveRequests = 0;
  }

  getStats() {
    return {
      mode: this.mode,
      ...this.stats,
      activeRequests: this.activeRequests,
      peakConcurrent: this.peakActiveRequests,
      queueLength: this.queue.length
    };
  }

  cancelAll() {
    this.stats.droppedStale += this.queue.length;
    this.queue = [];
  }

  /**
   * Evaluates current virtual range and queues prefetch rows ahead in the scroll direction.
   * @param {Object} context
   */
  onScroll(context) {
    if (this.mode === 'none') return;
    if (!context || !context.dataset || context.dataset.length === 0) return;

    const { scrollTop, startRow, endRow, totalRows, columns, dataset } = context;

    // 1. Detect scroll direction
    if (scrollTop > this.lastScrollTop) {
      this.scrollDirection = 'down';
    } else if (scrollTop < this.lastScrollTop) {
      this.scrollDirection = 'up';
    }
    this.lastScrollTop = scrollTop;

    // 2. Determine target prefetch rows beyond the rendered/buffered range
    const prefetchRowsCount = (this.mode === 'aggressive') ? 2 : 1;
    const targetRows = [];

    if (this.scrollDirection === 'down') {
      for (let i = 1; i <= prefetchRowsCount; i++) {
        const r = endRow + i;
        if (r < totalRows) targetRows.push(r);
      }
    } else {
      for (let i = 1; i <= prefetchRowsCount; i++) {
        const r = startRow - i;
        if (r >= 0) targetRows.push(r);
      }
    }

    if (targetRows.length === 0) {
      this.cancelAll();
      return;
    }

    // 3. Drop stale items from queue that do not match the current target rows
    const targetRowSet = new Set(targetRows);
    const validQueue = [];
    for (const item of this.queue) {
      if (targetRowSet.has(item.row)) {
        validQueue.push(item);
      } else {
        this.stats.droppedStale++;
      }
    }
    this.queue = validQueue;

    // 4. Collect candidate series for target rows
    const queuedUrlSet = new Set(this.queue.map(item => item.url));

    for (const r of targetRows) {
      const startIndex = r * columns;
      const endIndex = Math.min(dataset.length, startIndex + columns);

      for (let i = startIndex; i < endIndex; i++) {
        const series = dataset[i];
        if (!series || !series.cover_path) continue;

        const url = this.getThumbnailUrlFn ? this.getThumbnailUrlFn(series.cover_path) : '';
        if (!url) continue;

        // Skip if already in flight or completed
        if (this.inFlight.has(url) || this.completed.has(url)) {
          this.stats.duplicateAvoided++;
          continue;
        }

        // Skip if already in queue
        if (queuedUrlSet.has(url)) continue;

        this.queue.push({ url, row: r });
        queuedUrlSet.add(url);
      }
    }

    // 5. Process queue with bounded concurrency
    this._processQueue();
  }

  _processQueue() {
    if (this.mode === 'none') return;

    while (this.activeRequests < this.maxConcurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      const url = item.url;

      if (this.inFlight.has(url) || this.completed.has(url)) {
        this.stats.duplicateAvoided++;
        continue;
      }

      this.activeRequests++;
      if (this.activeRequests > this.peakActiveRequests) {
        this.peakActiveRequests = this.activeRequests;
        this.stats.peakConcurrent = this.peakActiveRequests;
      }
      this.stats.prefetchRequests++;
      this.inFlight.add(url);

      const img = new Image();
      const onDone = (success) => {
        this.inFlight.delete(url);
        this.activeRequests = Math.max(0, this.activeRequests - 1);
        if (success) {
          this.completed.add(url);
          this.stats.successfulPrefetches++;
        } else {
          this.stats.failedPrefetches++;
        }
        // Yield to browser event loop before processing next item
        setTimeout(() => this._processQueue(), 0);
      };

      img.onload = () => onDone(true);
      img.onerror = () => onDone(false);
      img.src = url;
    }
  }
}

export default ThumbnailPrefetcher;
