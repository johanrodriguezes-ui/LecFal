const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const storage = require('../core/storage');
const logger = require('../core/logger');

let nativeImage = null;
try {
  const electron = require('electron');
  nativeImage = electron.nativeImage;
} catch (_) {}

/**
 * ThumbnailGenerator
 *
 * Manages downsampled grid thumbnail generation for Library cards:
 * - Target size: maximum width of 360px, aspect ratio preserved, no cropping, no upscaling.
 * - Format: Skia-accelerated high-quality JPEG (quality 85) via Electron nativeImage (0 dependencies).
 * - Location: ~/.config/lecfal/thumbnails/grid/<stable-id>.jpg
 * - Concurrency: bounded background queue (default 3 concurrent workers).
 * - Cache: deterministic identity, invalidation on source modification/size change.
 * - Resilient: graceful fallback to original full-res cover if generation fails or is pending.
 */
class ThumbnailGenerator {
  constructor(options = {}) {
    this.storage = options.storage || storage;
    this.maxWidth = options.maxWidth || 360;
    this.quality = options.quality || 85;
    this.concurrency = options.concurrency || 3;

    this.queue = [];
    this.activeCount = 0;
    this.pendingMap = new Map(); // sourcePath -> { resolve, reject, promise }
    this.isBackfilling = false;
  }

  /**
   * Deterministically resolves the grid thumbnail file path for a source cover.
   *
   * @param {string} sourceCoverPath
   * @returns {string}
   */
  getGridThumbnailPath(sourceCoverPath) {
    if (!sourceCoverPath || typeof sourceCoverPath !== 'string') return '';
    const gridDir = this.storage.getGridThumbnailsPath();
    const ext = path.extname(sourceCoverPath).toLowerCase();
    const baseName = path.basename(sourceCoverPath, ext);

    // If source is already in the main thumbnails folder with hash name, reuse hash.
    // If source is external or arbitrary, hash the full canonical path for stable naming.
    const thumbnailsDir = path.resolve(this.storage.getThumbnailsPath());
    const resolvedSource = path.resolve(sourceCoverPath);

    let fileName;
    if (resolvedSource.startsWith(thumbnailsDir) && path.dirname(resolvedSource) === thumbnailsDir) {
      fileName = `${baseName}.jpg`;
    } else {
      const pathHash = crypto.createHash('md5').update(resolvedSource).digest('hex');
      fileName = `${baseName}_${pathHash.slice(0, 8)}.jpg`;
    }

    return path.join(gridDir, fileName);
  }

  /**
   * Checks whether a grid thumbnail already exists and is up-to-date with source cover.
   *
   * @param {string} sourceCoverPath
   * @param {string} [gridPath]
   * @returns {boolean}
   */
  isThumbnailValid(sourceCoverPath, gridPath) {
    try {
      if (!sourceCoverPath || !fs.existsSync(sourceCoverPath)) return false;
      const targetGridPath = gridPath || this.getGridThumbnailPath(sourceCoverPath);
      if (!targetGridPath || !fs.existsSync(targetGridPath)) return false;

      const sourceStat = fs.statSync(sourceCoverPath);
      const gridStat = fs.statSync(targetGridPath);

      if (gridStat.size <= 0) return false;
      // Grid thumbnail must have been modified at or after the source cover
      return gridStat.mtimeMs >= sourceStat.mtimeMs;
    } catch (_) {
      return false;
    }
  }

  /**
   * Returns the valid grid thumbnail path if it exists on disk, or null.
   *
   * @param {string} sourceCoverPath
   * @returns {string|null}
   */
  getExistingThumbnailPath(sourceCoverPath) {
    const gridPath = this.getGridThumbnailPath(sourceCoverPath);
    if (gridPath && this.isThumbnailValid(sourceCoverPath, gridPath)) {
      return gridPath;
    }
    return null;
  }

  /**
   * Generates a 360px max width thumbnail from the source cover file.
   * Preserves aspect ratio, never crops, never upscales smaller images.
   *
   * @param {string} sourceCoverPath
   * @returns {Promise<{ thumbnailPath: string, width: number, height: number, sizeBytes: number, skipped: boolean }>}
   */
  async generateThumbnail(sourceCoverPath) {
    if (!sourceCoverPath || !fs.existsSync(sourceCoverPath)) {
      throw new Error(`Source cover does not exist: "${sourceCoverPath}"`);
    }

    const gridPath = this.getGridThumbnailPath(sourceCoverPath);
    if (!gridPath) {
      throw new Error(`Cannot determine grid thumbnail path for "${sourceCoverPath}"`);
    }

    // Idempotent: return immediately if valid thumbnail already exists
    if (this.isThumbnailValid(sourceCoverPath, gridPath)) {
      const stat = fs.statSync(gridPath);
      return {
        thumbnailPath: gridPath,
        width: 0,
        height: 0,
        sizeBytes: stat.size,
        skipped: true
      };
    }

    if (!nativeImage) {
      throw new Error('Electron nativeImage is not available in current environment');
    }

    const img = nativeImage.createFromPath(sourceCoverPath);
    if (img.isEmpty()) {
      throw new Error(`Failed to decode source cover image: "${sourceCoverPath}"`);
    }

    const size = img.getSize();
    if (size.width <= 0 || size.height <= 0) {
      throw new Error(`Invalid source dimensions (${size.width}x${size.height}) for "${sourceCoverPath}"`);
    }

    let targetWidth = size.width;
    let targetHeight = size.height;

    // Scale down if wider than maxWidth (360px), preserving original aspect ratio
    if (size.width > this.maxWidth) {
      targetWidth = this.maxWidth;
      targetHeight = Math.max(1, Math.round((size.height * targetWidth) / size.width));
    }
    // Note: Do NOT upscale if size.width <= this.maxWidth

    const resized = img.resize({
      width: targetWidth,
      height: targetHeight,
      quality: 'best'
    });

    const buf = resized.toJPEG(this.quality);
    if (!buf || buf.length === 0) {
      throw new Error(`Failed to encode thumbnail JPEG for "${sourceCoverPath}"`);
    }

    // Ensure destination directory exists
    const gridDir = path.dirname(gridPath);
    if (!fs.existsSync(gridDir)) {
      fs.mkdirSync(gridDir, { recursive: true });
    }

    // Atomic write via temporary file
    const tempPath = path.join(gridDir, `.${path.basename(gridPath)}.${process.pid}.${Date.now()}.tmp`);
    try {
      fs.writeFileSync(tempPath, buf);
      fs.renameSync(tempPath, gridPath);
    } catch (writeErr) {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }
      throw writeErr;
    }

    return {
      thumbnailPath: gridPath,
      width: targetWidth,
      height: targetHeight,
      sizeBytes: buf.length,
      skipped: false
    };
  }

  /**
   * Enqueues a thumbnail generation job in the bounded concurrency queue.
   * If priority is true, the item is inserted at the front of the queue.
   *
   * @param {string} sourceCoverPath
   * @param {boolean} [priority=false]
   * @returns {Promise<string>} Resolves to grid thumbnail path or fallback source cover path.
   */
  enqueue(sourceCoverPath, priority = false) {
    if (!sourceCoverPath || typeof sourceCoverPath !== 'string') {
      return Promise.resolve(sourceCoverPath);
    }

    // If valid grid thumbnail already exists on disk, resolve immediately
    const existing = this.getExistingThumbnailPath(sourceCoverPath);
    if (existing) {
      return Promise.resolve(existing);
    }

    // If already in-flight or queued, reuse the existing promise
    if (this.pendingMap.has(sourceCoverPath)) {
      const item = this.pendingMap.get(sourceCoverPath);
      if (priority && !item.running) {
        // Elevate priority by moving towards front
        const idx = this.queue.indexOf(sourceCoverPath);
        if (idx > 0) {
          this.queue.splice(idx, 1);
          this.queue.unshift(sourceCoverPath);
        }
      }
      return item.promise;
    }

    let resolveFn;
    let rejectFn;
    const promise = new Promise((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const queueItem = {
      sourceCoverPath,
      resolve: resolveFn,
      reject: rejectFn,
      promise,
      running: false
    };

    this.pendingMap.set(sourceCoverPath, queueItem);

    if (priority) {
      this.queue.unshift(sourceCoverPath);
    } else {
      this.queue.push(sourceCoverPath);
    }

    this._processQueue();
    return promise;
  }

  /**
   * Internal queue processor with bounded concurrency.
   * Uses setImmediate to yield execution and avoid blocking UI.
   *
   * @private
   */
  _processQueue() {
    if (this.activeCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const sourceCoverPath = this.queue.shift();
      const item = this.pendingMap.get(sourceCoverPath);
      if (!item) continue;

      item.running = true;
      this.activeCount++;

      // Yield execution before generating so Electron event loop handles pending IPC/events
      setImmediate(async () => {
        try {
          const result = await this.generateThumbnail(sourceCoverPath);
          item.resolve(result.thumbnailPath);
        } catch (err) {
          logger.warn('THUMBNAIL', `Error generating thumbnail for "${sourceCoverPath}": ${err.message}. Falling back to original cover.`);
          // Graceful fallback: resolve with original source cover path so UI does not break
          item.resolve(sourceCoverPath);
        } finally {
          this.pendingMap.delete(sourceCoverPath);
          this.activeCount--;
          this._processQueue();
        }
      });
    }
  }

  /**
   * Backfills grid thumbnails for existing covers without re-scanning CBZ archives.
   * Can be supplied with an explicit list of cover paths or will scan thumbnails directory.
   *
   * @param {string[]} [coverPaths]
   * @returns {Promise<{ total: number, needed: number, queued: number }>}
   */
  async backfill(coverPaths = null) {
    if (this.isBackfilling) {
      return { total: 0, needed: 0, queued: 0, alreadyRunning: true };
    }
    this.isBackfilling = true;

    try {
      let pathsToProcess = coverPaths;

      if (!pathsToProcess || !Array.isArray(pathsToProcess)) {
        const thumbDir = this.storage.getThumbnailsPath();
        if (fs.existsSync(thumbDir)) {
          const entries = fs.readdirSync(thumbDir, { withFileTypes: true });
          pathsToProcess = entries
            .filter(e => e.isFile() && (e.name.endsWith('.jpg') || e.name.endsWith('.jpeg') || e.name.endsWith('.png') || e.name.endsWith('.webp')))
            .map(e => path.join(thumbDir, e.name));
        } else {
          pathsToProcess = [];
        }
      }

      const total = pathsToProcess.length;
      let needed = 0;
      let queued = 0;

      for (const p of pathsToProcess) {
        if (!this.isThumbnailValid(p)) {
          needed++;
          this.enqueue(p, false);
          queued++;
        }
      }

      logger.info('THUMBNAIL', `Backfill check completed: ${total} covers inspected, ${needed} needed grid thumbnails, ${queued} queued.`);
      return { total, needed, queued };
    } finally {
      this.isBackfilling = false;
    }
  }

  /**
   * Returns disk and count statistics comparing full-resolution covers to grid thumbnails.
   *
   * @returns {Object}
   */
  getStats() {
    const thumbDir = this.storage.getThumbnailsPath();
    const gridDir = this.storage.getGridThumbnailsPath();

    let fullResCount = 0;
    let fullResBytes = 0;
    let gridCount = 0;
    let gridBytes = 0;

    if (fs.existsSync(thumbDir)) {
      const entries = fs.readdirSync(thumbDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile()) {
          fullResCount++;
          try {
            fullResBytes += fs.statSync(path.join(thumbDir, e.name)).size;
          } catch (_) {}
        }
      }
    }

    if (fs.existsSync(gridDir)) {
      const entries = fs.readdirSync(gridDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile()) {
          gridCount++;
          try {
            gridBytes += fs.statSync(path.join(gridDir, e.name)).size;
          } catch (_) {}
        }
      }
    }

    const fullResAvg = fullResCount > 0 ? Math.round(fullResBytes / fullResCount) : 0;
    const gridAvg = gridCount > 0 ? Math.round(gridBytes / gridCount) : 0;
    const compressionRatio = fullResAvg > 0 ? ((1 - gridAvg / fullResAvg) * 100).toFixed(1) + '%' : '0%';

    return {
      fullRes: {
        count: fullResCount,
        totalBytes: fullResBytes,
        avgBytes: fullResAvg,
        totalMB: (fullResBytes / (1024 * 1024)).toFixed(2)
      },
      grid: {
        count: gridCount,
        totalBytes: gridBytes,
        avgBytes: gridAvg,
        totalMB: (gridBytes / (1024 * 1024)).toFixed(2)
      },
      queue: {
        pending: this.queue.length,
        active: this.activeCount,
        inFlightTotal: this.pendingMap.size
      },
      compressionRatio
    };
  }
}

// Export singleton instance as default, class as property
const defaultGenerator = new ThumbnailGenerator();
defaultGenerator.ThumbnailGenerator = ThumbnailGenerator;

module.exports = defaultGenerator;
