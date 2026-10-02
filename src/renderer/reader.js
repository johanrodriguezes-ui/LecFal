/**
 * LecFal Webtoon Reader Controller
 * Handles vertical continuous reading for CBZ and PDF formats.
 * Implements on-demand progressive loading, DOM virtualization,
 * memory-bounded resource eviction, and keyboard navigation.
 */

// Phase 3.5: Internally configurable CBZ image loading concurrency limit
const MAX_CONCURRENT_CBZ_REQUESTS = 3;

/**
 * Phase 3.5: Bounded FIFO Concurrency Scheduler for CBZ Page Image Loading.
 * Bounds simultaneous network/decompression/decoding requests to prevent frame drops
 * during rapid scrolling. Prioritizes visible pages over preload-only pages.
 */
class CBZRequestScheduler {
  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
    this.queue = []; // Array of { index, slotData, executeFn, queuedAt }
    this.activeRequests = new Map(); // pageIndex -> { startedAt, slotData }
    this.reader = null;

    // Diagnostic Metrics for Phase 3.5 profiling
    this.metrics = {
      maxSimultaneousActive: 0,
      totalQueued: 0,
      completedCount: 0,
      failedCount: 0,
      cancelledCount: 0,
      queueWaitTimes: [],
      loadDurations: [],
      activeTimeWeightedSum: 0,
      activeTotalDuration: 0,
      lastSampleTime: null,
      lastActiveCount: 0,
      lastQueuedCount: 0
    };
  }

  setReader(reader) {
    this.reader = reader;
  }

  setMaxConcurrent(limit) {
    if (typeof limit === 'number' && limit > 0) {
      this.maxConcurrent = limit;
      this.processNext();
    }
  }

  get activeCount() {
    return this.activeRequests.size;
  }

  get queueLength() {
    return this.queue.length;
  }

  isQueued(index) {
    return this.queue.some(item => item.index === index);
  }

  isActive(index) {
    return this.activeRequests.has(index);
  }

  recordSample() {
    const now = performance.now();
    const active = this.activeRequests.size;
    const queued = this.queue.length;

    if (this.metrics.lastSampleTime !== null) {
      const dt = now - this.metrics.lastSampleTime;
      if (this.metrics.lastActiveCount > 0 || this.metrics.lastQueuedCount > 0) {
        this.metrics.activeTimeWeightedSum += this.metrics.lastActiveCount * dt;
        this.metrics.activeTotalDuration += dt;
      }
    }

    this.metrics.lastSampleTime = now;
    this.metrics.lastActiveCount = active;
    this.metrics.lastQueuedCount = queued;
  }

  enqueue(index, slotData, executeFn) {
    // Avoid duplicate requests for the same page
    if (this.isActive(index) || this.isQueued(index)) {
      return false;
    }

    this.metrics.totalQueued++;
    slotData.status = 'queued';

    // If queue is empty and active count is below bounded limit, start immediately
    if (this.queue.length === 0 && this.activeCount < this.maxConcurrent) {
      this.dispatch(index, slotData, executeFn, performance.now());
      return true;
    }

    // Otherwise, place request in the queue
    this.queue.push({
      index,
      slotData,
      executeFn,
      queuedAt: performance.now()
    });
    this.recordSample();

    this.processNext();
    return true;
  }

  dispatch(index, slotData, executeFn, queuedAt) {
    const startedAt = performance.now();
    const waitTime = Math.max(0, startedAt - queuedAt);
    this.metrics.queueWaitTimes.push(waitTime);

    slotData.status = 'loading';
    this.activeRequests.set(index, { startedAt, slotData });

    if (this.activeRequests.size > this.metrics.maxSimultaneousActive) {
      this.metrics.maxSimultaneousActive = this.activeRequests.size;
    }
    this.recordSample();

    try {
      executeFn();
    } catch (err) {
      console.error(`[CBZRequestScheduler] Error al iniciar carga de página ${index}:`, err);
      this.onRequestFinished(index, false);
    }
  }

  onRequestFinished(index, success = true) {
    const activeInfo = this.activeRequests.get(index);
    if (activeInfo) {
      const now = performance.now();
      const duration = Math.max(0, now - activeInfo.startedAt);
      this.metrics.loadDurations.push(duration);
      this.activeRequests.delete(index);
      if (success) {
        this.metrics.completedCount++;
      } else {
        this.metrics.failedCount++;
      }
    }
    this.recordSample();
    this.processNext();
  }

  cancelQueued(index) {
    const qIndex = this.queue.findIndex(item => item.index === index);
    if (qIndex !== -1) {
      this.queue.splice(qIndex, 1);
      this.metrics.cancelledCount++;
      this.recordSample();
      return true;
    }
    return false;
  }

  processNext() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    // Phase 3.5: Clean up any queued requests that have moved far outside viewport (>2200px) before dispatching
    if (this.reader && typeof this.reader.getPageDistanceFromViewport === 'function') {
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const item = this.queue[i];
        const dist = this.reader.getPageDistanceFromViewport(item.index);
        if (dist > 2200) {
          this.queue.splice(i, 1);
          if (item.slotData) {
            item.slotData.status = 'unloaded';
          }
          this.metrics.cancelledCount++;
        }
      }
      this.recordSample();
    }

    if (this.queue.length === 0) {
      return;
    }

    // Select next request: prioritize visible pages before preload pages; FIFO within each tier
    let selectedIdx = 0;
    if (this.reader && typeof this.reader.isPageVisible === 'function') {
      const visibleIdx = this.queue.findIndex(item => this.reader.isPageVisible(item.index));
      if (visibleIdx !== -1) {
        selectedIdx = visibleIdx;
      }
    }

    const next = this.queue.splice(selectedIdx, 1)[0];
    if (next) {
      // If page was evicted / marked unloaded while queued, skip and process next
      if (next.slotData && next.slotData.status === 'unloaded') {
        this.processNext();
        return;
      }
      this.dispatch(next.index, next.slotData, next.executeFn, next.queuedAt);
    }
  }

  clear() {
    for (const item of this.queue) {
      if (item.slotData && item.slotData.status === 'queued') {
        item.slotData.status = 'unloaded';
      }
    }
    this.queue = [];
    this.activeRequests.clear();
    this.recordSample();
  }

  resetMetrics() {
    this.recordSample();
    this.metrics.maxSimultaneousActive = this.activeRequests.size;
    this.metrics.totalQueued = 0;
    this.metrics.completedCount = 0;
    this.metrics.failedCount = 0;
    this.metrics.cancelledCount = 0;
    this.metrics.queueWaitTimes = [];
    this.metrics.loadDurations = [];
    this.metrics.activeTimeWeightedSum = 0;
    this.metrics.activeTotalDuration = 0;
    this.metrics.lastSampleTime = performance.now();
    this.metrics.lastActiveCount = this.activeRequests.size;
    this.metrics.lastQueuedCount = this.queue.length;
  }

  getMetricsSummary() {
    this.recordSample();
    const waitTimes = this.metrics.queueWaitTimes;
    const loadTimes = this.metrics.loadDurations;

    const avgWait = waitTimes.length > 0
      ? Number((waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length).toFixed(2))
      : 0;
    const maxWait = waitTimes.length > 0
      ? Number(Math.max(...waitTimes).toFixed(2))
      : 0;

    const avgLoad = loadTimes.length > 0
      ? Number((loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length).toFixed(2))
      : 0;
    const maxLoad = loadTimes.length > 0
      ? Number(Math.max(...loadTimes).toFixed(2))
      : 0;

    const avgSimultaneous = this.metrics.activeTotalDuration > 0
      ? Number((this.metrics.activeTimeWeightedSum / this.metrics.activeTotalDuration).toFixed(2))
      : this.activeRequests.size;

    return {
      maxConcurrentLimit: this.maxConcurrent,
      maxSimultaneousActive: this.metrics.maxSimultaneousActive,
      avgSimultaneousActive: avgSimultaneous,
      totalQueued: this.metrics.totalQueued,
      completedCount: this.metrics.completedCount,
      failedCount: this.metrics.failedCount,
      cancelledCount: this.metrics.cancelledCount,
      avgQueueWaitMs: avgWait,
      maxQueueWaitMs: maxWait,
      avgLoadDurationMs: avgLoad,
      maxLoadDurationMs: maxLoad,
      currentActive: this.activeRequests.size,
      currentQueued: this.queue.length
    };
  }
}

class WebtoonReader {
  constructor() {
    this.api = window.lecfalAPI;
    this.pdfjsLib = null;

    // Callbacks
    this.onCloseCallback = null;
    this.onChapterChangeCallback = null;
    this.onMarkReadCallback = null;

    // State
    this.isOpen = false;
    this.currentSessionId = 0;
    this.chapterData = null;
    this.pages = []; // Array of page descriptors
    this.pdfDocument = null;
    this.observer = null;
    this.isReadTriggered = false;
    this.currentWidthIndex = 2; // Default: 750px
    this.widths = ['500px', '600px', '750px', '900px', '1000px', '1200px', '100%'];
    this.currentSpacingIndex = 2; // Default: 10px
    this.spacings = ['0px', '5px', '10px', '15px', '20px', '30px', '40px', '50px'];
    this.headerHideTimer = null;
    this.isHeaderVisible = true;
    this.activeSlots = new Map(); // pageIndex -> { element, status, canvas, img }
    this.renderedHeights = new Map(); // pageIndex -> height in px
    this.currentAspectRatio = 1.414; // Phase 3.3: Default aspect ratio (height / width)
    this.scrollRaf = null;

    // Phase 4.1: Persistent Reading Position state
    this.savedReadingPosition = 0;
    this.currentReadingPosition = 0;
    this.lastSavedPosition = -1;
    this.isRestoringPosition = false;
    this.positionSaveTimer = null;

    // Phase 3.5: CBZ image request concurrency scheduler (bounded FIFO queue)
    this.cbzScheduler = new CBZRequestScheduler(MAX_CONCURRENT_CBZ_REQUESTS);
    this.cbzScheduler.setReader(this);

    // Phase 3.8: Adaptive Hybrid CBZ Decode Pipeline (default: 'auto')
    this.cbzDecodeExperiment = (typeof window !== 'undefined' && window.CBZ_DECODE_EXPERIMENT) || 'auto';
    this.cbzDecodeWorker = null;
    this.cbzWorkerUrl = null;
    this.cbzWorkerReqId = 0;
    this.cbzWorkerPending = new Map();
    this.experimentalDiagnostics = {
      pages: [],
      loadedIndices: new Set(),
      duplicateLoads: 0
    };

    // Phase 3.1: Cached layout metadata for O(log N) scroll tracking
    this.pageHeights = null; // Float64Array of individual page heights
    this.pageTops = null;    // Float64Array of cumulative top offsets
    this.pageCenters = null; // Float64Array of cumulative center offsets
    this.lastActivePage = -1;
    this.lastProgressPercent = -1;
    this.lastReportedProgress = -1;

    // DOM Elements
    this.viewEl = null;
    this.headerEl = null;
    this.containerEl = null;
    this.streamEl = null;
    this.footerEl = null;
    this.errorStateEl = null;
    this.progressFillEl = null;
    this.topHoverZoneEl = null;

    // Header buttons & texts
    this.btnBack = null;
    this.headerNavEl = null;
    this.btnHeaderPrevChapter = null;
    this.btnHeaderNextChapter = null;
    this.seriesTitleEl = null;
    this.chapterTitleEl = null;
    this.pageIndicatorEl = null;
    this.btnWidthToggle = null;
    this.widthLabelEl = null;
    this.btnSpacingToggle = null;
    this.spacingLabelEl = null;
    this.btnExternal = null;
    this.btnFullscreen = null;
    this.iconFullscreenEnter = null;
    this.iconFullscreenExit = null;

    // Footer buttons
    this.btnPrevChapter = null;
    this.btnNextChapter = null;
    this.btnFooterBack = null;

    // Bound listeners
    this.boundHandleScroll = this.handleScroll.bind(this);
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Initialize reader bindings and connect to DOM elements.
   * @param {Object} options
   * @param {Object} options.pdfjsLib - The Mozilla PDF.js library instance
   * @param {Function} options.onClose - Callback when exiting the reader
   * @param {Function} options.onChapterChange - Callback when switching chapters
   * @param {Function} options.onMarkRead - Callback when chapter threshold is reached
   */
  init({ pdfjsLib, onClose, onChapterChange, onMarkRead }) {
    this.pdfjsLib = pdfjsLib;
    this.onCloseCallback = onClose;
    this.onChapterChangeCallback = onChapterChange;
    this.onMarkReadCallback = onMarkRead;

    // Cache DOM Elements
    this.viewEl = document.getElementById('readerView');
    this.headerEl = document.getElementById('readerHeader');
    this.containerEl = document.getElementById('readerContainer');
    this.streamEl = document.getElementById('readerStream');
    this.footerEl = document.getElementById('readerFooter');
    this.errorStateEl = document.getElementById('readerErrorState');
    this.progressFillEl = document.getElementById('readerProgressFill');
    this.topHoverZoneEl = document.getElementById('readerTopHoverZone');

    this.btnBack = document.getElementById('btnReaderBack');
    this.headerNavEl = document.getElementById('readerHeaderNav');
    this.btnHeaderPrevChapter = document.getElementById('btnHeaderPrevChapter');
    this.btnHeaderNextChapter = document.getElementById('btnHeaderNextChapter');
    this.seriesTitleEl = document.getElementById('readerSeriesTitle');
    this.chapterTitleEl = document.getElementById('readerChapterTitle');
    this.pageIndicatorEl = document.getElementById('readerPageIndicator');
    this.btnWidthToggle = document.getElementById('btnReaderWidthToggle');
    this.widthLabelEl = document.getElementById('readerWidthLabel');
    this.btnSpacingToggle = document.getElementById('btnReaderSpacingToggle');
    this.spacingLabelEl = document.getElementById('readerSpacingLabel');
    this.btnExternal = document.getElementById('btnReaderExternal');
    this.btnFullscreen = document.getElementById('btnReaderFullscreen');
    this.iconFullscreenEnter = document.getElementById('iconFullscreenEnter');
    this.iconFullscreenExit = document.getElementById('iconFullscreenExit');

    this.btnPrevChapter = document.getElementById('btnReaderPrevChapter');
    this.btnNextChapter = document.getElementById('btnReaderNextChapter');
    this.btnFooterBack = document.getElementById('btnReaderFooterBack');

    // Error state buttons
    const btnErrorBack = document.getElementById('btnReaderErrorBack');
    const btnErrorExternal = document.getElementById('btnReaderErrorExternal');

    // Attach UI event listeners
    if (this.btnBack) this.btnBack.addEventListener('click', () => this.close());
    if (this.btnFooterBack) this.btnFooterBack.addEventListener('click', () => this.close());
    if (btnErrorBack) btnErrorBack.addEventListener('click', () => this.close());

    if (this.btnWidthToggle) {
      this.btnWidthToggle.addEventListener('click', () => this.cycleWidth());
    }

    if (this.btnSpacingToggle) {
      this.btnSpacingToggle.addEventListener('click', () => this.cycleSpacing());
    }

    if (this.btnExternal) {
      this.btnExternal.addEventListener('click', () => this.openInExternalApp());
    }
    if (btnErrorExternal) {
      btnErrorExternal.addEventListener('click', () => this.openInExternalApp());
    }

    if (this.btnFullscreen) {
      this.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
    }

    if (this.btnHeaderPrevChapter) {
      this.btnHeaderPrevChapter.addEventListener('click', () => this.goToPrevChapter());
    }

    if (this.btnHeaderNextChapter) {
      this.btnHeaderNextChapter.addEventListener('click', () => this.goToNextChapter());
    }

    if (this.btnPrevChapter) {
      this.btnPrevChapter.addEventListener('click', () => this.goToPrevChapter());
    }

    if (this.btnNextChapter) {
      this.btnNextChapter.addEventListener('click', () => this.goToNextChapter());
    }

    // Top hover trigger zone to reveal controls
    if (this.topHoverZoneEl) {
      this.topHoverZoneEl.addEventListener('mouseenter', () => {
        this.showHeader();
        this.resetHeaderHideTimer();
      });
    }

    // Listen for window fullscreen changes from main process
    if (this.api && this.api.onFullscreenChange) {
      this.api.onFullscreenChange((isFull) => {
        this.updateFullscreenIcon(isFull);
        if (this.isOpen && this.streamEl) {
          this.handleWindowResize();
        }
      });
    }

    // Listen for window resize to rebuild page positions preserving normalized reading position
    window.addEventListener('resize', () => {
      if (this.isOpen && this.streamEl) {
        this.handleWindowResize();
      }
    });
  }

  /**
   * Open a chapter in the vertical reader.
   * @param {number} chapterId
   */
  async open(chapterId) {
    // Phase 4.1: If there was a previous chapter open, persist its position immediately before switching
    if (this.isOpen && this.chapterData && this.chapterData.chapter) {
      this.saveReadingPosition(true);
    }

    this.currentSessionId = (this.currentSessionId || 0) + 1;
    const sessionId = this.currentSessionId;

    this.isOpen = true;
    this.isReadTriggered = false;
    this.renderedHeights.clear();
    this.currentAspectRatio = 1.414;
    this.cleanupActiveDocument();

    // Show view, hide error state
    if (this.viewEl) this.viewEl.style.display = 'flex';
    if (this.errorStateEl) this.errorStateEl.style.display = 'none';
    if (this.streamEl) {
      this.streamEl.style.display = 'flex';
      this.streamEl.innerHTML = '';
    }
    if (this.footerEl) this.footerEl.style.display = 'none';

    // Show loading state in header
    if (this.pageIndicatorEl) this.pageIndicatorEl.textContent = 'Cargando capítulo...';
    if (this.chapterTitleEl) this.chapterTitleEl.textContent = 'Cargando...';
    if (this.progressFillEl) this.progressFillEl.style.width = '0%';

    // Reset scroll position to top
    if (this.containerEl) this.containerEl.scrollTop = 0;

    // Apply saved or current reading width and vertical page spacing
    this.applyWidth();
    this.applySpacing();

    // Add scroll, mouse and key listeners
    if (this.containerEl) this.containerEl.addEventListener('scroll', this.boundHandleScroll, { passive: true });
    window.addEventListener('mousemove', this.boundHandleMouseMove);
    window.addEventListener('keydown', this.boundHandleKeyDown);

    // Initial header visibility
    this.showHeader();
    this.resetHeaderHideTimer();

    try {
      const data = await this.api.getChapterForReader(chapterId);
      if (!this.isOpen || this.currentSessionId !== sessionId) {
        return;
      }

      if (!data || !data.chapter) {
        throw new Error('No se pudo obtener información del capítulo.');
      }

      this.chapterData = data;
      const chapter = data.chapter;

      // Phase 4.1: Retrieve saved reading position
      const isCompleted = chapter.isRead === 1;
      const rawPos = (typeof chapter.readingPosition === 'number' && !isNaN(chapter.readingPosition)) ? chapter.readingPosition : 0;
      this.savedReadingPosition = isCompleted ? 0 : Math.max(0, Math.min(1.0, rawPos));
      this.currentReadingPosition = this.savedReadingPosition;
      this.lastSavedPosition = this.savedReadingPosition;

      // If an incomplete position is saved, activate restoration protection
      if (this.savedReadingPosition > 0.005 && this.savedReadingPosition < 0.90) {
        this.isRestoringPosition = true;
      } else {
        this.isRestoringPosition = false;
      }

      // Update Header info
      if (this.seriesTitleEl) this.seriesTitleEl.textContent = chapter.seriesTitle || 'Manga';
      if (this.chapterTitleEl) this.chapterTitleEl.textContent = chapter.title || chapter.fileName;

      // Contextual back button label & accessibility for standalone PDF vs Manga Chapter
      const hasSeriesContext = Boolean(chapter.seriesId || chapter.series_id);
      const isStandalonePDF = chapter.format === 'pdf' && !hasSeriesContext;

      const backText = isStandalonePDF ? 'Volver a la biblioteca' : 'Volver al manga';
      const backTitle = isStandalonePDF ? 'Volver a la biblioteca (Esc)' : 'Volver al detalle del manga (Esc)';
      if (this.btnBack) {
        this.btnBack.title = backTitle;
        this.btnBack.setAttribute('aria-label', isStandalonePDF ? 'Volver a la biblioteca' : 'Volver al detalle del manga');
      }
      const backSpan = document.getElementById('btnReaderBackText');
      if (backSpan) backSpan.textContent = 'Volver';
      const footerBackSpan = document.getElementById('readerFooterBackText');
      if (footerBackSpan) footerBackSpan.textContent = backText;
      const errorBackBtn = document.getElementById('btnReaderErrorBack');
      if (errorBackBtn) {
        errorBackBtn.textContent = backText;
        errorBackBtn.setAttribute('aria-label', backText);
      }

      // Setup Previous & Next navigation controls (Header & Footer)
      if (this.headerNavEl) {
        this.headerNavEl.style.display = isStandalonePDF ? 'none' : 'inline-flex';
      }
      if (this.btnHeaderPrevChapter) {
        this.btnHeaderPrevChapter.disabled = !data.prevChapter;
      }
      if (this.btnHeaderNextChapter) {
        this.btnHeaderNextChapter.disabled = !data.nextChapter;
      }
      if (this.btnPrevChapter) {
        this.btnPrevChapter.disabled = !data.prevChapter;
        this.btnPrevChapter.style.display = (data.prevChapter && !isStandalonePDF) ? 'inline-flex' : 'none';
      }
      if (this.btnNextChapter) {
        this.btnNextChapter.disabled = !data.nextChapter;
        this.btnNextChapter.style.display = (data.nextChapter && !isStandalonePDF) ? 'inline-flex' : 'none';
      }

      // Format-specific page manifest discovery
      if (chapter.format === 'cbz') {
        await this.setupCBZ(data.pages);
      } else if (chapter.format === 'pdf') {
        await this.setupPDF(chapter.filePath);
      } else {
        throw new Error(`Formato de archivo no compatible: ${chapter.format}`);
      }

      if (!this.isOpen || this.currentSessionId !== sessionId) {
        return;
      }

      // Phase 4.1: Restore reading position after layout placeholders are established
      if (this.savedReadingPosition > 0.005 && this.savedReadingPosition < 0.90) {
        await this.restoreReadingPosition(this.savedReadingPosition, sessionId);
      }

      // Notify chapter change callback
      if (this.onChapterChangeCallback) {
        this.onChapterChangeCallback(chapter.id);
      }
    } catch (err) {
      if (!this.isOpen || this.currentSessionId !== sessionId) {
        return;
      }
      console.error('[WebtoonReader] Error abriendo capítulo:', err);
      this.showFatalError(err.message || 'Error al cargar el capítulo.');
    }
  }

  /**
   * Setup CBZ reading slots from archive manifest.
   * @param {Array} pages
   */
  async setupCBZ(pages) {
    if (!pages || pages.length === 0) {
      throw new Error('El archivo CBZ no contiene páginas de imagen compatibles.');
    }

    // Phase 3.3: Aspect-ratio aware height reservation
    this.currentAspectRatio = (this.chapterData && this.chapterData.chapter && this.chapterData.chapter.estimatedAspectRatio) || 1.414;

    this.pages = pages;
    if (this.pageIndicatorEl) {
      this.pageIndicatorEl.textContent = `1 / ${pages.length} (0%)`;
    }
    if (this.progressFillEl) this.progressFillEl.style.width = '0%';

    this.buildPageSlots(pages.length);
    this.initIntersectionObserver();
  }

  /**
   * Setup PDF document and build page slots.
   * @param {string} filePath
   */
  async setupPDF(filePath) {
    if (!this.pdfjsLib) {
      throw new Error('El motor de renderizado PDF.js no está disponible.');
    }

    if (this.pageIndicatorEl) this.pageIndicatorEl.textContent = 'Analizando PDF...';

    const pdfUrl = `lecfal-file://file?path=${encodeURIComponent(filePath)}`;
    const loadingTask = this.pdfjsLib.getDocument({
      url: pdfUrl,
      cMapUrl: '../../node_modules/pdfjs-dist/cmaps/',
      cMapPacked: true
    });

    const sessionId = this.currentSessionId;
    const doc = await loadingTask.promise;
    if (!this.isOpen || this.currentSessionId !== sessionId) {
      try { doc.destroy(); } catch (_) {}
      return;
    }
    this.pdfDocument = doc;
    const pageCount = this.pdfDocument.numPages;

    if (pageCount === 0) {
      throw new Error('El documento PDF no contiene páginas legibles.');
    }

    // Phase 3.3: Extract exact page aspect ratio from PDF metadata before rasterizing
    try {
      const firstPage = await this.pdfDocument.getPage(1);
      const vp = firstPage.getViewport({ scale: 1.0 });
      if (vp && vp.width > 0 && vp.height > 0) {
        this.currentAspectRatio = vp.height / vp.width;
      } else {
        this.currentAspectRatio = 1.414;
      }
    } catch (_) {
      this.currentAspectRatio = 1.414;
    }

    this.pages = Array.from({ length: pageCount }, (_, i) => ({ index: i, pageNumber: i + 1 }));

    if (this.pageIndicatorEl) {
      this.pageIndicatorEl.textContent = `1 / ${pageCount} (0%)`;
    }
    if (this.progressFillEl) this.progressFillEl.style.width = '0%';

    this.buildPageSlots(pageCount);
    this.initIntersectionObserver();
  }

  /**
   * Build virtualized DOM page slots.
   * Initially, slots are lightweight placeholders without rendered images/canvases.
   * @param {number} count
   */
  buildPageSlots(count) {
    if (!this.streamEl) return;
    this.streamEl.innerHTML = '';
    this.activeSlots.clear();

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
      const slot = document.createElement('div');
      slot.className = 'reader-page-slot';
      slot.dataset.pageIndex = i;
      slot.id = `readerSlot_${i}`;

      // Phase 3.3: Initial placeholder content provides estimated aspect-ratio dimensions
      const placeholder = document.createElement('div');
      placeholder.className = 'reader-placeholder';
      const slotHeight = this.renderedHeights.get(i) || this.getEstimatedPageHeight(i);
      placeholder.style.minHeight = `${slotHeight}px`;
      placeholder.innerHTML = `
        <div class="reader-page-number-tag">Pág. ${i + 1}</div>
        <div class="reader-spinner-box">
          <div class="reader-spinner"></div>
          <span class="reader-spinner-text">Cargando página ${i + 1}...</span>
        </div>
      `;

      slot.appendChild(placeholder);
      fragment.appendChild(slot);

      this.activeSlots.set(i, {
        element: slot,
        status: 'unloaded',
        img: null,
        canvas: null,
        renderTask: null
      });
    }

    this.streamEl.appendChild(fragment);

    // Phase 3.1: Initialize cumulative layout metadata for O(log N) position tracking
    this.initPagePositions(count);

    // Show footer navigation at end
    if (this.footerEl) {
      this.footerEl.style.display = 'block';
    }
  }

  /**
   * Setup IntersectionObserver for viewport-based progressive loading and eviction.
   */
  initIntersectionObserver() {
    if (this.observer) {
      this.observer.disconnect();
    }

    // Preload margin: 800px ahead/behind viewport
    const options = {
      root: this.containerEl,
      rootMargin: '800px 0px 800px 0px',
      threshold: [0, 0.05, 0.5]
    };

    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const pageIndex = parseInt(entry.target.dataset.pageIndex, 10);
        if (isNaN(pageIndex)) continue;

        if (entry.isIntersecting) {
          // Page is approaching or inside viewport -> render it
          this.mountPage(pageIndex);
        } else {
          // Check distance to viewport for bounded memory eviction
          this.checkAndEvictPage(pageIndex, entry);
        }
      }
    }, options);

    // Observe all page slots
    const slots = this.streamEl.querySelectorAll('.reader-page-slot');
    slots.forEach(slot => this.observer.observe(slot));
  }

  /**
   * Mount and display the page image or canvas.
   * @param {number} index
   */
  async mountPage(index) {
    const slotData = this.activeSlots.get(index);
    if (!slotData || slotData.status === 'loaded' || slotData.status === 'loading' || slotData.status === 'queued') {
      return;
    }

    if (this.chapterData.chapter.format === 'cbz') {
      this.mountCBZPage(index, slotData);
    } else if (this.chapterData.chapter.format === 'pdf') {
      slotData.status = 'loading';
      this.mountPDFPage(index, slotData);
    }
  }

  /**
   * Mount a CBZ page on demand using streaming protocol.
   * Concurrency is controlled via bounded CBZRequestScheduler.
   * @param {number} index
   * @param {Object} slotData
   */
  mountCBZPage(index, slotData) {
    const sessionId = this.currentSessionId;
    slotData.sessionId = sessionId;
    this.cbzScheduler.enqueue(index, slotData, () => {
      if (!this.isOpen || this.currentSessionId !== sessionId) {
        return;
      }
      this.executeCBZPageLoad(index, slotData);
    });
  }

  /**
   * Phase 3.8: Deterministic adaptive CBZ decode pipeline selector.
   * Uses page metadata to route to either 'img' (Path A) or 'worker-bitmap' (Path B).
   *
   * Priority Rules:
   * 1. naturalWidth > 1600 -> 'worker-bitmap' ('large-width')
   * 2. compressedSize > 2 * 1024 * 1024 (2MB) -> 'worker-bitmap' ('large-file')
   * 3. image format is PNG and naturalWidth > 1200 -> 'worker-bitmap' ('large-png')
   * Otherwise -> 'img' ('img-default')
   *
   * @param {Object} page
   * @returns {{ path: 'img' | 'worker-bitmap', reason: 'large-width' | 'large-file' | 'large-png' | 'img-default' | 'manual-override-worker' | 'manual-override-img' }}
   */
  selectCBZDecodePath(page) {
    if (!page) {
      return { path: 'img', reason: 'img-default' };
    }

    // Allow manual overrides during comparative benchmarking tests if explicitly configured
    if (this.cbzDecodeExperiment === 'img') {
      return { path: 'img', reason: 'manual-override-img' };
    }
    if (this.cbzDecodeExperiment === 'worker-bitmap') {
      return { path: 'worker-bitmap', reason: 'manual-override-worker' };
    }

    const width = page.naturalWidth || (this.chapterData && this.chapterData.chapter && this.chapterData.chapter.firstPageDimensions && this.chapterData.chapter.firstPageDimensions.width) || 0;
    const compressedSize = page.compressedSize || 0;
    const isPng = page.mimeType === 'image/png' || (page.entryName && /\.png$/i.test(page.entryName));

    // Rule 1: naturalWidth > 1600
    if (width > 1600) {
      return { path: 'worker-bitmap', reason: 'large-width' };
    }

    // Rule 2: compressedSize > 2 * 1024 * 1024 (2MB)
    if (compressedSize > 2 * 1024 * 1024) {
      return { path: 'worker-bitmap', reason: 'large-file' };
    }

    // Rule 3: image format is PNG and naturalWidth > 1200
    if (isPng && width > 1200) {
      return { path: 'worker-bitmap', reason: 'large-png' };
    }

    // Fallback: normal <img> path
    return { path: 'img', reason: 'img-default' };
  }

  /**
   * Execute actual CBZ page image fetch and DOM insertion when dispatched by scheduler.
   * Adaptively routes to either lightweight <img> path or Worker bitmap path based on page metadata.
   * @param {number} index
   * @param {Object} slotData
   */
  executeCBZPageLoad(index, slotData) {
    const page = this.pages[index];
    if (!page) {
      this.cbzScheduler.onRequestFinished(index, false);
      return;
    }

    // Phase 3.8: Deterministic adaptive pipeline selection
    const decision = this.selectCBZDecodePath(page);
    slotData.selectedPath = decision.path;
    slotData.selectionReason = decision.reason;

    if (decision.path === 'worker-bitmap') {
      this.executeCBZPageLoadWorkerBitmap(index, slotData, decision);
      return;
    }

    this.executeCBZPageLoadImg(index, slotData, decision);
  }

  /**
   * Phase 3.8: Production Path A (lightweight <img> rendering).
   * @param {number} index
   * @param {Object} slotData
   * @param {{ path: string, reason: string }} decision
   */
  executeCBZPageLoadImg(index, slotData, decision = { path: 'img', reason: 'img-default' }) {
    const sessionId = slotData.sessionId || this.currentSessionId;
    const page = this.pages[index];
    if (!page) {
      this.cbzScheduler.onRequestFinished(index, false);
      return;
    }

    const loadStartTime = performance.now();
    const slotEl = slotData.element;
    const img = document.createElement('img');
    img.className = 'reader-page-img';
    img.loading = 'eager';
    img.alt = `Página ${index + 1}`;

    // Stream directly via lecfal-cbz custom protocol
    const pageUrl = `lecfal-cbz://entry?chapterId=${this.chapterData.chapter.id}&entry=${encodeURIComponent(page.entryName)}&page=${index}`;
    img.src = pageUrl;

    img.onload = () => {
      img.onload = null;
      img.onerror = null;

      if (!this.isOpen || this.currentSessionId !== sessionId) {
        return;
      }

      this.cbzScheduler.onRequestFinished(index, true);

      if (slotData.status === 'unloaded') return;

      slotData.status = 'loaded';
      slotData.img = img;

      // Measure and store rendered height for eviction placeholder
      const measuredHeight = img.offsetHeight || Math.round(this.getAvailablePageWidth() * (img.naturalHeight / img.naturalWidth)) || img.naturalHeight || 800;
      this.renderedHeights.set(index, measuredHeight);
      this.updatePageHeight(index, measuredHeight);

      // Clear loading placeholder and insert image
      slotEl.innerHTML = '';
      slotEl.appendChild(img);
      // Remove min-height from slot so height equals image height exactly without ghost padding
      slotEl.style.minHeight = '';

      // Phase 3.3: Refine estimated aspect ratio for subsequent unmeasured placeholders
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        this.refineAspectRatio(img.naturalWidth, img.naturalHeight);
        page.naturalWidth = img.naturalWidth;
        page.naturalHeight = img.naturalHeight;
      }

      // Phase 3.8: Record page load telemetry
      const totalDuration = Number((performance.now() - loadStartTime).toFixed(2));
      const format = (page.entryName && /\.png$/i.test(page.entryName)) ? 'png' : ((page.entryName && /\.webp$/i.test(page.entryName)) ? 'webp' : 'jpeg');
      this.recordPageDiagnostics({
        pageIndex: index,
        format,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        decodedWidth: img.naturalWidth,
        decodedHeight: img.naturalHeight,
        compressedSize: page.compressedSize || null,
        selectedPath: 'img',
        reason: decision.reason,
        decodeDuration: 0,
        totalPageLoadDuration: totalDuration,
        activeCBZRequests: this.cbzScheduler.activeCount,
        queuedRequestsCount: this.cbzScheduler.queueLength,
        usedExperimentalPath: false
      });
    };

    img.onerror = (e) => {
      img.onload = null;
      img.onerror = null;

      if (!this.isOpen || this.currentSessionId !== sessionId) {
        return;
      }

      this.cbzScheduler.onRequestFinished(index, false);

      console.error(`[WebtoonReader] Error cargando página CBZ ${index + 1}:`, {
        url: pageUrl,
        entry: page.entryName,
        index
      });
      // Diagnostic check to determine the exact protocol/network error status
      fetch(pageUrl)
        .then(res => {
          if (!res.ok) {
            console.error(`[WebtoonReader] Diagnóstico página ${index + 1} - HTTP ${res.status} (${res.statusText})`);
          }
        })
        .catch(fetchErr => {
          console.error(`[WebtoonReader] Diagnóstico página ${index + 1} - Fallo de red/protocolo:`, fetchErr.message);
        });

      slotData.status = 'error';
      this.renderSlotError(index, slotData, 'No se pudo cargar la imagen de esta página.');
    };
  }

  /**
   * Phase 3.7: Experimental CBZ image decode pipeline.
   * lecfal-cbz:// -> fetch() -> ArrayBuffer -> Web Worker -> createImageBitmap(targetWidth <= 1600) -> ImageBitmap -> Canvas bitmaprenderer
   * @param {number} index
   * @param {Object} slotData
   */
  async executeCBZPageLoadWorkerBitmap(index, slotData, decision = { path: 'worker-bitmap', reason: 'large-width' }) {
    const sessionId = slotData.sessionId || this.currentSessionId;
    const page = this.pages[index];
    if (!page) {
      this.cbzScheduler.onRequestFinished(index, false);
      return;
    }

    const slotEl = slotData.element;
    const pageUrl = `lecfal-cbz://entry?chapterId=${this.chapterData.chapter.id}&entry=${encodeURIComponent(page.entryName)}&page=${index}`;
    const loadStartTime = performance.now();

    try {
      const fetchStart = performance.now();
      const res = await fetch(pageUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} (${res.statusText})`);
      }
      const buffer = await res.arrayBuffer();
      const fetchEnd = performance.now();
      const fetchDuration = fetchEnd - fetchStart;
      const byteSize = buffer.byteLength;

      if (!this.isOpen || this.currentSessionId !== sessionId) {
        return;
      }

      if (slotData.status === 'unloaded') {
        this.cbzScheduler.onRequestFinished(index, true);
        return;
      }

      // Delegate decode and ceiling downsample to Worker
      const worker = this.getDecodeWorker();
      const reqId = ++this.cbzWorkerReqId;
      const workerSendTime = performance.now();

      const workerPromise = new Promise((resolve, reject) => {
        this.cbzWorkerPending.set(reqId, { resolve, reject, pageIndex: index });
      });

      worker.postMessage({
        id: reqId,
        buffer,
        mimeType: page.mimeType || ''
      }, [buffer]);

      const workerResult = await workerPromise;
      const workerReceiveTime = performance.now();
      const totalWorkerRoundTrip = workerReceiveTime - workerSendTime;
      const transferTimeMs = Math.max(0, totalWorkerRoundTrip - workerResult.workerTimeMs);

      // Check if session changed or page was unloaded/evicted while worker was decoding
      if (!this.isOpen || this.currentSessionId !== sessionId) {
        if (workerResult && workerResult.bitmap) {
          try { workerResult.bitmap.close(); } catch (_) {}
        }
        return;
      }

      if (slotData.status === 'unloaded') {
        if (workerResult && workerResult.bitmap) {
          try { workerResult.bitmap.close(); } catch (_) {}
        }
        this.cbzScheduler.onRequestFinished(index, true);
        return;
      }

      // Render to Canvas via ImageBitmapRenderingContext (zero-copy transfer)
      const canvas = document.createElement('canvas');
      canvas.className = 'reader-page-canvas';
      canvas.width = workerResult.decodedWidth;
      canvas.height = workerResult.decodedHeight;

      const canvasRenderStart = performance.now();
      const bmpCtx = canvas.getContext('bitmaprenderer');
      if (bmpCtx) {
        bmpCtx.transferFromImageBitmap(workerResult.bitmap);
      } else {
        const ctx2d = canvas.getContext('2d');
        ctx2d.drawImage(workerResult.bitmap, 0, 0);
        workerResult.bitmap.close();
      }
      const canvasRenderEnd = performance.now();

      this.cbzScheduler.onRequestFinished(index, true);

      slotData.status = 'loaded';
      slotData.canvas = canvas;

      // Clear loading placeholder and insert canvas
      slotEl.innerHTML = '';
      slotEl.appendChild(canvas);
      slotEl.style.minHeight = '';

      // Measure and store rendered height for eviction placeholder
      const measuredHeight = canvas.offsetHeight || Math.round(this.getAvailablePageWidth() * (canvas.height / canvas.width)) || canvas.height || 800;
      this.renderedHeights.set(index, measuredHeight);
      this.updatePageHeight(index, measuredHeight);

      // Refine estimated aspect ratio using natural image dimensions
      if (workerResult.naturalWidth > 0 && workerResult.naturalHeight > 0) {
        this.refineAspectRatio(workerResult.naturalWidth, workerResult.naturalHeight);
        page.naturalWidth = workerResult.naturalWidth;
        page.naturalHeight = workerResult.naturalHeight;
      }

      // Phase 3.8: Record experimental diagnostics
      const totalPageLoadTimeMs = Number((performance.now() - loadStartTime).toFixed(2));
      const format = (page.entryName && /\.png$/i.test(page.entryName)) ? 'png' : ((page.entryName && /\.webp$/i.test(page.entryName)) ? 'webp' : 'jpeg');
      this.recordPageDiagnostics({
        pageIndex: index,
        format,
        naturalWidth: workerResult.naturalWidth,
        naturalHeight: workerResult.naturalHeight,
        decodedWidth: workerResult.decodedWidth,
        decodedHeight: workerResult.decodedHeight,
        compressedSize: page.compressedSize || byteSize,
        selectedPath: 'worker-bitmap',
        reason: (decision && decision.reason) || 'large-width',
        decodeDuration: workerResult.workerTimeMs,
        totalPageLoadDuration: totalPageLoadTimeMs,
        byteSize,
        fetchTimeMs: Number(fetchDuration.toFixed(2)),
        decodeTimeMs: workerResult.workerTimeMs,
        workerProcessingTimeMs: workerResult.workerTimeMs,
        transferTimeMs: Number(transferTimeMs.toFixed(2)),
        canvasTransferTimeMs: Number((canvasRenderEnd - canvasRenderStart).toFixed(2)),
        totalPageLoadTimeMs,
        usedExperimentalPath: true,
        activeCBZRequests: this.cbzScheduler.activeCount,
        activeRequestsCount: this.cbzScheduler.activeCount,
        queuedRequestsCount: this.cbzScheduler.queueLength
      });

    } catch (err) {
      if (!this.isOpen || this.currentSessionId !== sessionId) {
        return;
      }
      this.cbzScheduler.onRequestFinished(index, false);
      if (slotData.status === 'unloaded') return;

      console.error(`[WebtoonReader] (worker-bitmap) Error cargando página CBZ ${index + 1}:`, err);
      slotData.status = 'error';
      this.renderSlotError(index, slotData, 'No se pudo decodificar la imagen de esta página.');
    }
  }

  /**
   * Phase 3.7: Lazy initialization of dedicated CBZ decode worker.
   * Sniffs image dimensions from raw buffer header and decodes with max 1600px ceiling.
   */
  getDecodeWorker() {
    if (this.cbzDecodeWorker) return this.cbzDecodeWorker;

    const workerScript = `
      function sniffDimensions(buffer) {
        if (!buffer || buffer.byteLength < 8) return null;
        const view = new DataView(buffer);
        const len = buffer.byteLength;

        // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
        if (len >= 24 &&
            view.getUint8(0) === 0x89 &&
            view.getUint8(1) === 0x50 &&
            view.getUint8(2) === 0x4E &&
            view.getUint8(3) === 0x47) {
          return {
            naturalWidth: view.getUint32(16, false),
            naturalHeight: view.getUint32(20, false)
          };
        }

        // 2. WebP: RIFF .... WEBP
        if (len >= 30 &&
            view.getUint8(0) === 0x52 && view.getUint8(1) === 0x49 && view.getUint8(2) === 0x46 && view.getUint8(3) === 0x46 &&
            view.getUint8(8) === 0x57 && view.getUint8(9) === 0x45 && view.getUint8(10) === 0x42 && view.getUint8(11) === 0x50) {
          const c12 = view.getUint8(12);
          const c13 = view.getUint8(13);
          const c14 = view.getUint8(14);
          const c15 = view.getUint8(15);

          if (c12 === 0x56 && c13 === 0x50 && c14 === 0x38 && c15 === 0x20) {
            const w = view.getUint16(26, true) & 0x3FFF;
            const h = view.getUint16(28, true) & 0x3FFF;
            if (w > 0 && h > 0) return { naturalWidth: w, naturalHeight: h };
          } else if (c12 === 0x56 && c13 === 0x50 && c14 === 0x38 && c15 === 0x4C) {
            if (len >= 25 && view.getUint8(20) === 0x2F) {
              const b1 = view.getUint8(21);
              const b2 = view.getUint8(22);
              const b3 = view.getUint8(23);
              const b4 = view.getUint8(24);
              const w = 1 + (((b2 & 0x3F) << 8) | b1);
              const h = 1 + (((b4 & 0xF) << 10) | (b3 << 2) | ((b2 & 0xC0) >> 6));
              if (w > 0 && h > 0) return { naturalWidth: w, naturalHeight: h };
            }
          } else if (c12 === 0x56 && c13 === 0x50 && c14 === 0x38 && c15 === 0x58) {
            if (len >= 30) {
              const w = 1 + (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16));
              const h = 1 + (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16));
              if (w > 0 && h > 0) return { naturalWidth: w, naturalHeight: h };
            }
          }
        }

        // 3. JPEG: FF D8
        if (len > 4 && view.getUint8(0) === 0xFF && view.getUint8(1) === 0xD8) {
          let offset = 2;
          while (offset < len - 8) {
            if (view.getUint8(offset) !== 0xFF) break;
            const marker = view.getUint8(offset + 1);
            if (marker === 0xD9 || marker === 0xDA) break;
            const blockLen = view.getUint16(offset + 2, false);
            if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC9 && marker <= 0xCB)) {
              const h = view.getUint16(offset + 5, false);
              const w = view.getUint16(offset + 7, false);
              if (w > 0 && h > 0) return { naturalWidth: w, naturalHeight: h };
            }
            offset += 2 + blockLen;
          }
        }

        return null;
      }

      self.onmessage = async (e) => {
        const { id, buffer, mimeType } = e.data;
        const t0 = performance.now();
        try {
          const dims = sniffDimensions(buffer);
          const blob = new Blob([buffer], { type: mimeType || '' });
          let naturalWidth = 0;
          let naturalHeight = 0;
          let bmp = null;

          if (dims && dims.naturalWidth && dims.naturalHeight) {
            naturalWidth = dims.naturalWidth;
            naturalHeight = dims.naturalHeight;
            let targetWidth = naturalWidth;
            let targetHeight = naturalHeight;
            if (naturalWidth > 1600) {
              targetWidth = 1600;
              targetHeight = Math.round(1600 * (naturalHeight / naturalWidth));
            }
            const opts = (targetWidth < naturalWidth)
              ? { resizeWidth: targetWidth, resizeHeight: targetHeight, resizeQuality: 'high' }
              : {};
            bmp = await createImageBitmap(blob, opts);
          } else {
            // Fallback: decode directly, inspect dimensions, downsample if needed
            bmp = await createImageBitmap(blob);
            naturalWidth = bmp.width;
            naturalHeight = bmp.height;
            if (naturalWidth > 1600) {
              const targetWidth = 1600;
              const targetHeight = Math.round(1600 * (naturalHeight / naturalWidth));
              const resized = await createImageBitmap(bmp, {
                resizeWidth: targetWidth,
                resizeHeight: targetHeight,
                resizeQuality: 'high'
              });
              bmp.close();
              bmp = resized;
            }
          }

          const t1 = performance.now();
          self.postMessage({
            id,
            success: true,
            naturalWidth,
            naturalHeight,
            decodedWidth: bmp.width,
            decodedHeight: bmp.height,
            workerTimeMs: Number((t1 - t0).toFixed(2)),
            bitmap: bmp
          }, [bmp]);
        } catch (err) {
          self.postMessage({
            id,
            success: false,
            error: (err && err.message) || String(err)
          });
        }
      };
    `;

    const blob = new Blob([workerScript], { type: 'application/javascript' });
    this.cbzWorkerUrl = URL.createObjectURL(blob);
    this.cbzDecodeWorker = new Worker(this.cbzWorkerUrl);

    this.cbzDecodeWorker.onmessage = (e) => {
      const { id } = e.data;
      const pending = this.cbzWorkerPending.get(id);
      if (pending) {
        this.cbzWorkerPending.delete(id);
        if (e.data.success) {
          pending.resolve(e.data);
        } else {
          pending.reject(new Error(e.data.error || 'Worker decode failed'));
        }
      }
    };

    this.cbzDecodeWorker.onerror = (err) => {
      console.error('[WebtoonReader] CBZ decode worker unhandled error:', err);
    };

    return this.cbzDecodeWorker;
  }

  /**
   * Phase 3.7: Terminate decode worker and free pending requests.
   */
  cleanupDecodeWorker() {
    if (this.cbzDecodeWorker) {
      try { this.cbzDecodeWorker.terminate(); } catch (_) {}
      this.cbzDecodeWorker = null;
    }
    if (this.cbzWorkerUrl) {
      try { URL.revokeObjectURL(this.cbzWorkerUrl); } catch (_) {}
      this.cbzWorkerUrl = null;
    }
    if (this.cbzWorkerPending) {
      for (const req of this.cbzWorkerPending.values()) {
        try { req.reject(new Error('Worker terminated')); } catch (_) {}
      }
      this.cbzWorkerPending.clear();
    }
  }

  /**
   * Phase 3.7: Record per-page diagnostic telemetry.
   * @param {Object} diag
   */
  recordPageDiagnostics(diag) {
    if (!this.experimentalDiagnostics) return;
    if (this.experimentalDiagnostics.loadedIndices.has(diag.pageIndex)) {
      this.experimentalDiagnostics.duplicateLoads++;
    } else {
      this.experimentalDiagnostics.loadedIndices.add(diag.pageIndex);
    }
    this.experimentalDiagnostics.pages.push(diag);
  }

  /**
   * Mount a PDF page on demand by rendering to HTML5 canvas via PDF.js.
   * @param {number} index
   * @param {Object} slotData
   */
  async mountPDFPage(index, slotData) {
    if (!this.pdfDocument) return;

    const sessionId = this.currentSessionId;
    slotData.sessionId = sessionId;
    const pageNumber = index + 1;
    const slotEl = slotData.element;

    try {
      const page = await this.pdfDocument.getPage(pageNumber);
      if (!this.isOpen || this.currentSessionId !== sessionId || slotData.status === 'unloaded') return;

      // Determine viewport scale based on stream container width
      const containerWidth = this.streamEl.clientWidth || 900;
      const initialViewport = page.getViewport({ scale: 1.0 });
      const scale = (containerWidth / initialViewport.width) * (window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: Math.max(scale, 1.0) });

      const canvas = document.createElement('canvas');
      canvas.className = 'reader-page-canvas';
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const ctx = canvas.getContext('2d', { alpha: false });
      const renderTask = page.render({
        canvasContext: ctx,
        viewport
      });

      slotData.renderTask = renderTask;

      await renderTask.promise;

      if (!this.isOpen || this.currentSessionId !== sessionId || slotData.status === 'unloaded') {
        canvas.width = 0;
        canvas.height = 0;
        return;
      }

      slotData.status = 'loaded';
      slotData.canvas = canvas;

      // Store rendered height for eviction placeholder
      const renderedHeight = Math.floor(viewport.height / (window.devicePixelRatio || 1));
      this.renderedHeights.set(index, renderedHeight);
      this.updatePageHeight(index, renderedHeight);

      // Clear placeholder and insert canvas
      slotEl.innerHTML = '';
      slotEl.appendChild(canvas);
      slotEl.style.minHeight = '';
    } catch (err) {
      if (err.name === 'RenderingCancelledException') return;
      console.warn(`[WebtoonReader] Error renderizando página PDF ${pageNumber}:`, err);
      slotData.status = 'error';
      this.renderSlotError(index, slotData, 'Error al rasterizar la página PDF.');
    }
  }

  /**
   * Evict page resources if it scrolls far outside the active viewport.
   * Keeps the page slot in the DOM with exact preserved height to prevent layout shifts.
   * @param {number} index
   * @param {IntersectionObserverEntry} entry
   */
  checkAndEvictPage(index, entry) {
    const slotData = this.activeSlots.get(index);
    if (!slotData) return;

    // Phase 3.1: Check vertical distance from container viewport without triggering DOM reflow
    let distanceFromViewport = 0;
    if (entry && entry.rootBounds && entry.boundingClientRect) {
      distanceFromViewport = Math.max(
        entry.rootBounds.top - entry.boundingClientRect.bottom,
        entry.boundingClientRect.top - entry.rootBounds.bottom
      );
    } else {
      distanceFromViewport = this.getPageDistanceFromViewport(index);
    }

    // Evict only if farther than 2.5 screens away (~2200px)
    if (distanceFromViewport > 2200) {
      // Phase 3.5: If page request is queued waiting to start, safely cancel it from queue
      if (this.cbzScheduler && this.cbzScheduler.isQueued(index)) {
        this.cbzScheduler.cancelQueued(index);
        slotData.status = 'unloaded';
        return;
      }

      if (slotData.status !== 'loaded') return;

      const slotEl = slotData.element;

      // Cancel any ongoing PDF rendering
      if (slotData.renderTask) {
        try { slotData.renderTask.cancel(); } catch (_) {}
        slotData.renderTask = null;
      }

      // Free canvas GPU buffer
      if (slotData.canvas) {
        slotData.canvas.width = 0;
        slotData.canvas.height = 0;
        slotData.canvas.remove();
        slotData.canvas = null;
      }

      // Free image memory (detach handlers first to prevent error event on empty src)
      if (slotData.img) {
        slotData.img.onload = null;
        slotData.img.onerror = null;
        slotData.img.src = '';
        slotData.img.remove();
        slotData.img = null;
      }

      // Preserve height on lightweight placeholder to prevent scroll jumps
      const preservedHeight = this.renderedHeights.get(index) || this.getEstimatedPageHeight(index);
      slotEl.innerHTML = `
        <div class="reader-placeholder" style="min-height: ${preservedHeight}px;">
          <div class="reader-page-number-tag">Pág. ${index + 1}</div>
        </div>
      `;
      slotEl.style.minHeight = '';

      slotData.status = 'unloaded';
    }
  }

  /**
   * Render an in-slot retryable error state when an individual page fails.
   * @param {number} index
   * @param {Object} slotData
   * @param {string} errorMsg
   */
  renderSlotError(index, slotData, errorMsg) {
    const slotEl = slotData.element;
    slotEl.innerHTML = `
      <div class="reader-page-error-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>${errorMsg}</p>
        <button class="btn btn-secondary btn-sm btn-retry-page" data-page="${index}">
          <span>Reintentar página ${index + 1}</span>
        </button>
      </div>
    `;

    const btnRetry = slotEl.querySelector('.btn-retry-page');
    if (btnRetry) {
      btnRetry.addEventListener('click', (e) => {
        e.stopPropagation();
        slotData.status = 'unloaded';
        slotEl.innerHTML = `
          <div class="reader-placeholder">
            <div class="reader-spinner"></div>
            <span>Reintentando página ${index + 1}...</span>
          </div>
        `;
        this.mountPage(index);
      });
    }
  }

  /**
   * Determine available page width in pixels based on reader stream container.
   * @returns {number}
   */
  getAvailablePageWidth() {
    if (this.streamEl && this.streamEl.clientWidth > 0) {
      return this.streamEl.clientWidth;
    }
    const widthVal = this.widths[this.currentWidthIndex];
    if (widthVal && widthVal !== '100%') {
      return parseInt(widthVal, 10) || 900;
    }
    if (this.containerEl && this.containerEl.clientWidth > 0) {
      return this.containerEl.clientWidth;
    }
    return 900;
  }

  /**
   * Calculate predicted or cached slot height for a page before rendering.
   * Uses real measured height if previously rendered (or evicted),
   * otherwise estimates height using current aspect ratio and available width.
   * @param {number} index
   * @returns {number}
   */
  getEstimatedPageHeight(index) {
    if (this.renderedHeights && this.renderedHeights.has(index)) {
      return this.renderedHeights.get(index);
    }
    const width = this.getAvailablePageWidth();
    const ratio = this.currentAspectRatio || 1.414;
    return Math.round(width * ratio);
  }

  /**
   * Refine aspect ratio when actual image dimensions become known from loaded page.
   * Updates placeholders for unmeasured pages to prevent future layout shifts.
   * @param {number} naturalWidth
   * @param {number} naturalHeight
   */
  refineAspectRatio(naturalWidth, naturalHeight) {
    if (!naturalWidth || !naturalHeight || naturalWidth <= 0 || naturalHeight <= 0) return;
    const realRatio = naturalHeight / naturalWidth;
    if (Math.abs(realRatio - (this.currentAspectRatio || 1.414)) > 0.02) {
      this.currentAspectRatio = realRatio;
      if (this.activeSlots && this.pageHeights) {
        let changed = false;
        const width = this.getAvailablePageWidth();
        const newEstimatedH = Math.round(width * realRatio);

        for (const [idx, slot] of this.activeSlots.entries()) {
          if (slot.status === 'unloaded' && !this.renderedHeights.has(idx)) {
            this.pageHeights[idx] = newEstimatedH;
            const placeholder = slot.element.querySelector('.reader-placeholder');
            if (placeholder) {
              placeholder.style.minHeight = `${newEstimatedH}px`;
            }
            changed = true;
          }
        }
        if (changed) {
          this.rebuildPagePositions();
        }
      }
    }
  }

  /**
   * Get current vertical spacing gap in pixels.
   * @returns {number}
   */
  getSpacingPx() {
    const spacingStr = this.spacings[this.currentSpacingIndex] || '10px';
    return parseInt(spacingStr, 10) || 0;
  }

  /**
   * Initialize layout metadata arrays for O(log N) scroll position tracking.
   * Uses known heights where available, otherwise falls back to estimated height.
   * @param {number} count
   */
  initPagePositions(count) {
    if (count <= 0) return;
    this.pageHeights = new Float64Array(count);
    this.pageTops = new Float64Array(count);
    this.pageCenters = new Float64Array(count);
    this.lastActivePage = -1;
    this.lastProgressPercent = -1;
    this.lastReportedProgress = -1;

    const spacing = this.getSpacingPx();
    const paddingTop = 68; // CSS padding-top of .reader-stream
    const defaultEstimatedHeight = this.getEstimatedPageHeight(0);

    let currentTop = paddingTop;
    for (let i = 0; i < count; i++) {
      const h = this.renderedHeights.get(i) || defaultEstimatedHeight;
      this.pageHeights[i] = h;
      this.pageTops[i] = currentTop;
      this.pageCenters[i] = currentTop + (h / 2);
      currentTop += h + spacing;
    }
  }

  /**
   * Update a page's height and propagate offset delta to subsequent pages in O(N) array time.
   * Runs only at image/canvas load time, never inside scroll events.
   * @param {number} index
   * @param {number} newHeight
   */
  updatePageHeight(index, newHeight) {
    if (!this.pageHeights || index < 0 || index >= this.pageHeights.length) return;
    const oldHeight = this.pageHeights[index];
    const delta = newHeight - oldHeight;
    if (Math.abs(delta) < 1) return; // Ignore subpixel deviations

    this.pageHeights[index] = newHeight;
    this.pageCenters[index] = this.pageTops[index] + (newHeight / 2);

    const len = this.pageHeights.length;
    for (let i = index + 1; i < len; i++) {
      this.pageTops[i] += delta;
      this.pageCenters[i] += delta;
    }
  }

  /**
   * Rebuild cumulative page offsets when spacing, width or window bounds change.
   */
  rebuildPagePositions() {
    if (!this.pageHeights || this.pageHeights.length === 0) return;
    const count = this.pageHeights.length;
    const spacing = this.getSpacingPx();
    const paddingTop = 68;
    let currentTop = paddingTop;

    for (let i = 0; i < count; i++) {
      const h = this.pageHeights[i];
      this.pageTops[i] = currentTop;
      this.pageCenters[i] = currentTop + (h / 2);
      currentTop += h + spacing;
    }

    this.updateReadingProgress(false);
  }

  /**
   * Find the page index closest to the vertical center of the container viewport.
   * Pure O(log N) binary search over memory array without any DOM reads or layout reflow.
   * @param {number} targetCenter
   * @returns {number}
   */
  findClosestPageIndex(targetCenter) {
    const centers = this.pageCenters;
    if (!centers || centers.length === 0) return 0;
    const len = centers.length;
    if (len === 1) return 0;

    let low = 0;
    let high = len - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const c = centers[mid];
      if (c === targetCenter) return mid;
      if (c < targetCenter) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const l = Math.min(len - 1, Math.max(0, low));
    const h = Math.min(len - 1, Math.max(0, high));
    return Math.abs(centers[l] - targetCenter) <= Math.abs(centers[h] - targetCenter) ? l : h;
  }

  /**
   * Determine if a page currently intersects the visible reading viewport.
   * Evaluated via cached layout offsets without any DOM reads or layout reflow.
   * @param {number} index
   * @returns {boolean}
   */
  isPageVisible(index) {
    if (!this.containerEl || !this.pageTops || !this.pageHeights) return false;
    const scrollTop = this.containerEl.scrollTop;
    const clientHeight = this.containerEl.clientHeight;
    const pageTop = this.pageTops[index];
    if (pageTop === undefined) return false;
    const pageHeight = (this.renderedHeights && this.renderedHeights.get(index)) || this.pageHeights[index];
    const pageBottom = pageTop + pageHeight;
    return pageBottom >= scrollTop && pageTop <= (scrollTop + clientHeight);
  }

  /**
   * Calculate vertical distance in pixels between a page and the visible reading viewport.
   * Returns 0 if page is within or intersecting viewport.
   * Uses cached layout positions without any DOM calls.
   * @param {number} index
   * @returns {number}
   */
  getPageDistanceFromViewport(index) {
    if (!this.containerEl || !this.pageTops || !this.pageHeights) return 0;
    const scrollTop = this.containerEl.scrollTop;
    const clientHeight = this.containerEl.clientHeight;
    const pageTop = this.pageTops[index];
    if (pageTop === undefined) return 0;
    const pageHeight = (this.renderedHeights && this.renderedHeights.get(index)) || this.pageHeights[index];
    const pageBottom = pageTop + pageHeight;

    if (pageBottom < scrollTop) {
      return scrollTop - pageBottom;
    } else if (pageTop > (scrollTop + clientHeight)) {
      return pageTop - (scrollTop + clientHeight);
    }
    return 0;
  }

  /**
   * Scroll handler: throttled via requestAnimationFrame for high performance.
   */
  handleScroll() {
    if (!this.isOpen || !this.containerEl) return;

    if (this.scrollRaf) return;
    this.scrollRaf = requestAnimationFrame(() => {
      this.scrollRaf = null;
      this.updateReadingProgress(true);
    });
  }

  /**
   * Compute reading progress, active page closest to viewport, and read threshold.
   * Phase 3.1: Uses cached layout positions and binary search - zero getBoundingClientRect calls.
   * @param {boolean} isScrollEvent - True if invoked by user scrolling
   */
  updateReadingProgress(isScrollEvent = true) {
    if (!this.isOpen || !this.containerEl || !this.pages || this.pages.length === 0) return;

    const scrollTop = this.containerEl.scrollTop;
    const clientHeight = this.containerEl.clientHeight;
    const scrollHeight = this.containerEl.scrollHeight;
    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const scrollRatio = Math.min(1, Math.max(0, scrollTop / maxScroll));
    const progressPercent = Math.round(scrollRatio * 100);

    // Update subtle reading progress indicators only when changed
    if (progressPercent !== this.lastProgressPercent) {
      this.lastProgressPercent = progressPercent;
      if (this.progressFillEl) {
        this.progressFillEl.style.width = `${progressPercent}%`;
      }
    }

    // Detect 90% read threshold
    if (!this.isReadTriggered && scrollHeight > clientHeight) {
      if (scrollRatio >= 0.90) {
        this.isReadTriggered = true;
        this.markAsRead();
      }
    }

    // Phase 4.1: Track normalized position and schedule throttled SQLite persistence during scroll
    if (!this.isRestoringPosition && isScrollEvent) {
      this.currentReadingPosition = scrollRatio;
      if (scrollRatio < 0.90) {
        this.scheduleThrottledPositionSave();
      }
    }

    // Determine currently visible page closest to reading viewport vertical center via O(log N) binary search
    const targetCenter = scrollTop + (clientHeight / 2);
    const closestPage = this.findClosestPageIndex(targetCenter);

    if (closestPage !== this.lastActivePage || progressPercent !== this.lastReportedProgress) {
      this.lastActivePage = closestPage;
      this.lastReportedProgress = progressPercent;
      if (this.pageIndicatorEl) {
        this.pageIndicatorEl.textContent = `${closestPage + 1} / ${this.pages.length} páginas (${progressPercent}%)`;
      }
    }
  }

  /**
   * Mark current chapter as read in database and UI.
   */
  async markAsRead() {
    if (!this.chapterData || !this.chapterData.chapter) return;
    const chapterId = this.chapterData.chapter.id;

    try {
      await this.api.setChapterRead(chapterId, 1);
      this.chapterData.chapter.isRead = 1;
      this.currentReadingPosition = 1.0;
      this.lastSavedPosition = 1.0;
      if (this.positionSaveTimer) {
        clearTimeout(this.positionSaveTimer);
        this.positionSaveTimer = null;
      }
      if (this.onMarkReadCallback) {
        this.onMarkReadCallback(chapterId);
      }
    } catch (err) {
      console.warn('[WebtoonReader] No se pudo marcar capítulo como leído:', err);
    }
  }

  /**
   * Phase 4.1: Calculate normalized reading position [0.0, 1.0].
   * Normalized formula: scrollTop / (scrollHeight - clientHeight).
   * Safe handling for scrollHeight <= clientHeight, empty chapters, very short chapters.
   * @returns {number}
   */
  calculateReadingPosition() {
    if (!this.containerEl) return 0;
    const scrollTop = this.containerEl.scrollTop;
    const scrollHeight = this.containerEl.scrollHeight;
    const clientHeight = this.containerEl.clientHeight;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 0) return 0;
    const ratio = scrollTop / maxScroll;
    return Math.max(0, Math.min(1.0, isNaN(ratio) ? 0 : ratio));
  }

  /**
   * Phase 4.1: Schedule throttled persistence of reading position to database.
   * Persists at most approximately every 600 ms while continuously scrolling.
   */
  scheduleThrottledPositionSave() {
    if (this.isRestoringPosition || !this.chapterData || !this.chapterData.chapter) return;
    if (this.positionSaveTimer) return;

    this.positionSaveTimer = setTimeout(() => {
      this.positionSaveTimer = null;
      this.saveReadingPosition(false);
    }, 600);
  }

  /**
   * Phase 4.1: Persist reading position to SQLite via IPC.
   * @param {boolean} force - If true, persist immediately without waiting for throttle timer
   */
  saveReadingPosition(force = false) {
    if (this.positionSaveTimer) {
      clearTimeout(this.positionSaveTimer);
      this.positionSaveTimer = null;
    }

    if (!this.chapterData || !this.chapterData.chapter) return;
    const chapter = this.chapterData.chapter;
    const chapterId = chapter.id;
    if (!chapterId) return;

    // Completed chapter or threshold reached stores 1.0
    const pos = (chapter.isRead === 1 || this.isReadTriggered || this.currentReadingPosition >= 0.90)
      ? 1.0
      : this.currentReadingPosition;

    // Skip redundant writes if position change is negligible (< 0.005) unless forced
    if (!force && this.lastSavedPosition >= 0 && Math.abs(pos - this.lastSavedPosition) < 0.005) {
      return;
    }

    this.lastSavedPosition = pos;
    try {
      this.api.setChapterReadingPosition(chapterId, pos);
    } catch (err) {
      console.warn('[WebtoonReader] Error al guardar posición de lectura:', err);
    }
  }

  /**
   * Phase 4.1: Restore scroll position from normalized position.
   * targetScrollTop = savedPosition * (scrollHeight - clientHeight).
   * Restores only after page slots and placeholders stabilize, using double rAF.
   * @param {number} targetPosition
   * @param {number} sessionId
   * @returns {Promise<boolean>}
   */
  async restoreReadingPosition(targetPosition, sessionId) {
    if (!this.isOpen || this.currentSessionId !== sessionId) {
      this.isRestoringPosition = false;
      return false;
    }

    if (!this.containerEl || typeof targetPosition !== 'number' || targetPosition <= 0.005 || targetPosition >= 0.90) {
      this.isRestoringPosition = false;
      return false;
    }

    this.isRestoringPosition = true;

    // Allow one frame for DOM layout to settle
    await new Promise(resolve => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(resolve);
      }
      setTimeout(resolve, 30);
    });

    if (!this.isOpen || this.currentSessionId !== sessionId || !this.containerEl) {
      this.isRestoringPosition = false;
      return false;
    }

    const clientHeight = this.containerEl.clientHeight;
    const scrollHeight = this.containerEl.scrollHeight;

    if (scrollHeight > clientHeight) {
      const maxScroll = scrollHeight - clientHeight;
      const targetScrollTop = Math.max(0, Math.min(maxScroll, Math.round(targetPosition * maxScroll)));
      this.containerEl.scrollTop = targetScrollTop;
      this.currentReadingPosition = targetPosition;
      this.lastSavedPosition = targetPosition;
      // Trigger reading progress update immediately so UI reflects restored position
      this.updateReadingProgress(false);
    }

    // Keep isRestoringPosition true through the programmatic scroll event tick
    await new Promise(resolve => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(resolve);
      }
      setTimeout(resolve, 50);
    });

    if (this.currentSessionId === sessionId) {
      this.isRestoringPosition = false;
    }
    return true;
  }

  /**
   * Header autohide mouse movement management.
   */
  handleMouseMove(e) {
    if (!this.isOpen) return;

    // Keep header visible if cursor is near top of screen
    if (e.clientY <= 85) {
      this.showHeader();
      this.clearHeaderHideTimer();
      return;
    }

    // Show header on mouse move, then autohide after delay
    this.showHeader();
    this.resetHeaderHideTimer();
  }

  showHeader() {
    if (this.headerEl && !this.isHeaderVisible) {
      this.headerEl.classList.remove('reader-header-hidden');
      this.headerEl.setAttribute('aria-hidden', 'false');
      this.isHeaderVisible = true;
    }
  }

  hideHeader() {
    if (this.headerEl && this.isHeaderVisible) {
      if (document.activeElement && this.headerEl.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      this.headerEl.classList.add('reader-header-hidden');
      this.headerEl.setAttribute('aria-hidden', 'true');
      this.isHeaderVisible = false;
    }
  }

  resetHeaderHideTimer() {
    this.clearHeaderHideTimer();
    this.headerHideTimer = setTimeout(() => {
      this.hideHeader();
    }, 2500);
  }

  clearHeaderHideTimer() {
    if (this.headerHideTimer) {
      clearTimeout(this.headerHideTimer);
      this.headerHideTimer = null;
    }
  }

  /**
   * Navigate to the previous chapter in series order.
   * Flushes current reading position before opening.
   */
  goToPrevChapter() {
    if (this.chapterData && this.chapterData.prevChapter && this.chapterData.prevChapter.id) {
      this.open(this.chapterData.prevChapter.id);
    }
  }

  /**
   * Navigate to the next chapter in series order.
   * Flushes current reading position before opening.
   */
  goToNextChapter() {
    if (this.chapterData && this.chapterData.nextChapter && this.chapterData.nextChapter.id) {
      this.open(this.chapterData.nextChapter.id);
    }
  }

  /**
   * Handle window resize or fullscreen transition by preserving the normalized reading position.
   * Captures the normalized position before recalculating geometry and restores it smoothly.
   */
  handleWindowResize() {
    if (!this.isOpen || !this.containerEl || !this.pageHeights || this.pageHeights.length === 0) return;

    // 1. Capture current normalized reading position before geometry changes
    const currentRatio = this.calculateReadingPosition();

    // 2. Rebuild cumulative page offsets
    this.rebuildPagePositions();

    // 3. Restore the equivalent scroll position from the normalized ratio
    const scrollHeight = this.containerEl.scrollHeight;
    const clientHeight = this.containerEl.clientHeight;
    const maxScroll = scrollHeight - clientHeight;

    if (maxScroll > 0 && currentRatio > 0) {
      const targetScrollTop = Math.max(0, Math.min(maxScroll, Math.round(currentRatio * maxScroll)));
      this.containerEl.scrollTop = targetScrollTop;
      this.currentReadingPosition = currentRatio;
    }
  }

  /**
   * Keyboard navigation shortcuts handling.
   */
  handleKeyDown(e) {
    if (!this.isOpen) return;

    // Prevent shortcuts when user is typing into an input/textarea/select
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable)) {
      return;
    }

    // Handle Escape: exit fullscreen first, otherwise exit reader
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.api && this.api.isFullscreen) {
        this.api.isFullscreen().then(isFull => {
          if (isFull) {
            this.toggleFullscreen();
          } else {
            this.close();
          }
        });
      } else {
        this.close();
      }
      return;
    }

    // Dedicated chapter navigation shortcuts: '[' (prev), ']' (next) or Shift+ArrowLeft/Right
    const isPrevChapterKey = e.key === '[' || (e.shiftKey && e.key === 'ArrowLeft');
    const isNextChapterKey = e.key === ']' || (e.shiftKey && e.key === 'ArrowRight');

    if (isPrevChapterKey) {
      if (this.chapterData && this.chapterData.prevChapter && this.chapterData.prevChapter.id) {
        e.preventDefault();
        this.goToPrevChapter();
      }
      return;
    }

    if (isNextChapterKey) {
      if (this.chapterData && this.chapterData.nextChapter && this.chapterData.nextChapter.id) {
        e.preventDefault();
        this.goToNextChapter();
      }
      return;
    }

    // Reading/navigation keys must NOT unnecessarily wake the header
    const isReadingKey = (
      e.key === ' ' ||
      e.key === 'Spacebar' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowUp' ||
      e.key === 'PageDown' ||
      e.key === 'PageUp' ||
      e.key === 'Home' ||
      e.key === 'End'
    );

    if (!isReadingKey) {
      this.showHeader();
      this.resetHeaderHideTimer();
    }

    // Smooth navigation scrolling
    if (e.key === 'Home') {
      e.preventDefault();
      if (this.containerEl) this.containerEl.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (e.key === 'End') {
      e.preventDefault();
      if (this.containerEl) this.containerEl.scrollTo({ top: this.containerEl.scrollHeight, behavior: 'smooth' });
    } else if (e.key === ' ' || e.key === 'PageDown') {
      e.preventDefault();
      if (this.containerEl) {
        this.containerEl.scrollBy({ top: Math.round(this.containerEl.clientHeight * 0.85), behavior: 'smooth' });
      }
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      if (this.containerEl) {
        this.containerEl.scrollBy({ top: -Math.round(this.containerEl.clientHeight * 0.85), behavior: 'smooth' });
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.containerEl) this.containerEl.scrollBy({ top: 140, behavior: 'smooth' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.containerEl) this.containerEl.scrollBy({ top: -140, behavior: 'smooth' });
    }
  }

  /**
   * Cycle reading stream width through sensible increments.
   */
  cycleWidth() {
    this.currentWidthIndex = (this.currentWidthIndex + 1) % this.widths.length;
    this.applyWidth();
  }

  applyWidth() {
    const widthVal = this.widths[this.currentWidthIndex];
    if (this.streamEl) {
      this.streamEl.style.maxWidth = widthVal;
    }
    if (this.widthLabelEl) {
      this.widthLabelEl.textContent = widthVal === '100%' ? 'Ajustar (100%)' : widthVal;
    }
    // Update layout positions for newly scaled widths if images or canvases are active
    if (this.streamEl && this.activeSlots && this.pageHeights) {
      for (const [idx, slot] of this.activeSlots.entries()) {
        if (slot.status === 'loaded' && (slot.img || slot.canvas)) {
          const el = slot.img || slot.canvas;
          const h = el.offsetHeight || (slot.img ? slot.img.naturalHeight : slot.canvas.height);
          if (h && h > 0) {
            this.renderedHeights.set(idx, h);
            this.pageHeights[idx] = h;
          }
        } else if (slot.status === 'unloaded' || slot.status === 'queued') {
          const estimatedH = this.getEstimatedPageHeight(idx);
          this.pageHeights[idx] = estimatedH;
          const placeholder = slot.element.querySelector('.reader-placeholder');
          if (placeholder) {
            placeholder.style.minHeight = `${estimatedH}px`;
          }
        }
      }
      this.rebuildPagePositions();
    }
  }

  /**
   * Cycle vertical gap between consecutive pages.
   */
  cycleSpacing() {
    this.currentSpacingIndex = (this.currentSpacingIndex + 1) % this.spacings.length;
    this.applySpacing();
  }

  applySpacing() {
    const spacingVal = this.spacings[this.currentSpacingIndex];
    if (this.streamEl) {
      this.streamEl.style.setProperty('--page-spacing', spacingVal);
    }
    if (this.spacingLabelEl) {
      this.spacingLabelEl.textContent = spacingVal;
    }
    this.rebuildPagePositions();
  }

  /**
   * Fullscreen toggle and state icon update.
   */
  async toggleFullscreen() {
    if (this.api && this.api.toggleFullscreen) {
      const isFull = await this.api.toggleFullscreen();
      this.updateFullscreenIcon(isFull);
    }
  }

  updateFullscreenIcon(isFull) {
    if (this.iconFullscreenEnter && this.iconFullscreenExit) {
      this.iconFullscreenEnter.style.display = isFull ? 'none' : 'block';
      this.iconFullscreenExit.style.display = isFull ? 'block' : 'none';
    }
  }

  /**
   * Open the chapter in the external default operating system reader as fallback.
   */
  openInExternalApp() {
    if (this.chapterData && this.chapterData.chapter && this.chapterData.chapter.filePath) {
      this.api.openFile(this.chapterData.chapter.filePath).catch(err => {
        alert('Error al abrir con lector externo: ' + err.message);
      });
    }
  }

  /**
   * Show fatal error state when chapter file is completely missing or unreadable.
   * @param {string} message
   */
  showFatalError(message) {
    if (this.streamEl) this.streamEl.style.display = 'none';
    if (this.footerEl) this.footerEl.style.display = 'none';
    if (this.errorStateEl) {
      this.errorStateEl.style.display = 'flex';
      const msgEl = document.getElementById('readerErrorMessage');
      if (msgEl) msgEl.textContent = message;
    }
    if (this.pageIndicatorEl) this.pageIndicatorEl.textContent = 'Error';
  }

  /**
   * Cleanup any active documents, observers, and memory buffers.
   */
  cleanupActiveDocument() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.scrollRaf) {
      cancelAnimationFrame(this.scrollRaf);
      this.scrollRaf = null;
    }

    // Detach window/container listeners to prevent duplicates across chapter navigations
    if (this.containerEl) {
      this.containerEl.removeEventListener('scroll', this.boundHandleScroll);
    }
    window.removeEventListener('mousemove', this.boundHandleMouseMove);
    window.removeEventListener('keydown', this.boundHandleKeyDown);

    if (this.pdfDocument) {
      try { this.pdfDocument.destroy(); } catch (_) {}
      this.pdfDocument = null;
    }

    if (this.cbzScheduler) {
      this.cbzScheduler.clear();
    }

    // Phase 3.7: Clean up decode worker on document unload
    this.cleanupDecodeWorker();

    // Free all active canvas GPU buffers, images, and render tasks before clearing slots
    for (const slotData of this.activeSlots.values()) {
      if (slotData.renderTask) {
        try { slotData.renderTask.cancel(); } catch (_) {}
        slotData.renderTask = null;
      }
      if (slotData.canvas) {
        slotData.canvas.width = 0;
        slotData.canvas.height = 0;
        slotData.canvas.remove();
        slotData.canvas = null;
      }
      if (slotData.img) {
        slotData.img.onload = null;
        slotData.img.onerror = null;
        slotData.img.src = '';
        slotData.img.remove();
        slotData.img = null;
      }
      slotData.status = 'unloaded';
    }

    this.activeSlots.clear();
    if (this.streamEl) {
      this.streamEl.innerHTML = '';
    }
    this.pages = [];
    this.pageHeights = null;
    this.pageTops = null;
    this.pageCenters = null;
    this.lastActivePage = -1;
    this.lastProgressPercent = -1;
    this.lastReportedProgress = -1;

    // Phase 4.1: Reset reading position state and pending timers
    if (this.positionSaveTimer) {
      clearTimeout(this.positionSaveTimer);
      this.positionSaveTimer = null;
    }
    this.savedReadingPosition = 0;
    this.currentReadingPosition = 0;
    this.lastSavedPosition = -1;
    this.isRestoringPosition = false;
  }

  /**
   * Close reader view and return to previous application view.
   */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    // Phase 4.1: Persist latest in-memory position immediately on close
    this.saveReadingPosition(true);

    this.clearHeaderHideTimer();
    window.removeEventListener('mousemove', this.boundHandleMouseMove);
    window.removeEventListener('keydown', this.boundHandleKeyDown);
    if (this.containerEl) {
      this.containerEl.removeEventListener('scroll', this.boundHandleScroll);
    }

    const chapterToPass = this.chapterData ? this.chapterData.chapter : null;

    this.cleanupActiveDocument();

    if (this.progressFillEl) this.progressFillEl.style.width = '0%';

    if (this.viewEl) this.viewEl.style.display = 'none';

    // Trigger close callback to restore Manga Detail view
    if (this.onCloseCallback) {
      this.onCloseCallback(chapterToPass);
    }

    this.chapterData = null;
  }

  /**
   * Phase 3.5: Retrieve diagnostic metrics from the CBZ request concurrency scheduler.
   */
  getCBZMetrics() {
    return this.cbzScheduler ? this.cbzScheduler.getMetricsSummary() : null;
  }

  /**
   * Phase 3.5: Reset diagnostic metrics in the CBZ request concurrency scheduler.
   */
  resetCBZMetrics() {
    if (this.cbzScheduler) {
      this.cbzScheduler.resetMetrics();
    }
    this.resetCBZExperimentalDiagnostics();
  }

  /**
   * Phase 3.8: Set CBZ decode pipeline mode ('auto', 'img', or 'worker-bitmap').
   * @param {string} mode
   */
  setDecodeExperiment(mode) {
    if (mode === 'auto' || mode === 'img' || mode === 'worker-bitmap') {
      this.cbzDecodeExperiment = mode;
      if (typeof window !== 'undefined') {
        window.CBZ_DECODE_EXPERIMENT = mode;
      }
    }
  }

  /**
   * Phase 3.8: Retrieve per-page telemetry and adaptive hybrid experiment diagnostics.
   */
  getCBZExperimentalDiagnostics() {
    const sched = this.cbzScheduler ? this.cbzScheduler.getMetricsSummary() : null;
    const pages = this.experimentalDiagnostics ? this.experimentalDiagnostics.pages : [];
    const numImg = pages.filter(p => p.selectedPath === 'img').length;
    const numWorker = pages.filter(p => p.selectedPath === 'worker-bitmap').length;
    const total = pages.length;

    const reasons = {
      'large-width': pages.filter(p => p.reason === 'large-width').length,
      'large-file': pages.filter(p => p.reason === 'large-file').length,
      'large-png': pages.filter(p => p.reason === 'large-png').length,
      'img-default': pages.filter(p => p.reason === 'img-default').length,
      'manual-override-worker': pages.filter(p => p.reason === 'manual-override-worker').length,
      'manual-override-img': pages.filter(p => p.reason === 'manual-override-img').length
    };

    return {
      mode: this.cbzDecodeExperiment,
      session: {
        numImgPages: numImg,
        numWorkerBitmapPages: numWorker,
        percentageImg: total > 0 ? Number(((numImg / total) * 100).toFixed(1)) : 0,
        percentageWorkerBitmap: total > 0 ? Number(((numWorker / total) * 100).toFixed(1)) : 0,
        selectionReasons: reasons,
        maxConcurrentCBZRequests: sched ? sched.maxSimultaneousActive : 0,
        completedRequests: sched ? sched.completedCount : 0,
        cancelledRequests: sched ? sched.cancelledCount : 0,
        failedRequests: sched ? sched.failedCount : 0,
        duplicateLoads: this.experimentalDiagnostics ? this.experimentalDiagnostics.duplicateLoads : 0
      },
      pages,
      scheduler: sched,
      loadedPagesCount: total
    };
  }

  /**
   * Phase 3.7: Reset experiment diagnostics.
   */
  resetCBZExperimentalDiagnostics() {
    this.experimentalDiagnostics = {
      pages: [],
      loadedIndices: new Set(),
      duplicateLoads: 0
    };
  }
}

// Export singleton instance
const webtoonReader = new WebtoonReader();
export default webtoonReader;
