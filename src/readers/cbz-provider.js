const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');
const logger = require('../core/logger');

const IMAGE_REGEX = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;

class CBZProvider {
  constructor() {
    // Cache manifests in memory: key -> { timestamp, manifest, entriesByName, entriesByIndex }
    this.manifestCache = new Map();
    this.inFlightManifests = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Determine MIME type from file extension.
   * @param {string} fileName
   * @returns {string}
   */
  getMimeType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.avif':
        return 'image/avif';
      case '.bmp':
        return 'image/bmp';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Generate cache key for a given file path.
   * @param {string} filePath
   * @returns {string}
   */
  getCacheKey(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return `${filePath}:${stats.size}:${stats.mtimeMs}`;
    } catch (_) {
      return filePath;
    }
  }

  /**
   * Fast lightweight image dimension parser from image file magic headers.
   * Reads only the first chunk (up to 512 bytes) without decoding pixels.
   * Supported: PNG (IHDR), WebP (VP8, VP8L, VP8X), JPEG (SOF0/1/2/9/10/11).
   * @param {Buffer} buf
   * @param {string} fileName
   * @returns {{width: number, height: number}|null}
   */
  parseImageDimensions(buf, fileName) {
    if (!buf || buf.length < 8) return null;
    const ext = path.extname(fileName).toLowerCase();

    // 1. PNG: IHDR chunk holds width & height at bytes 16-23 (Big-Endian)
    if (ext === '.png' && buf.length >= 24) {
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
        return {
          width: buf.readUInt32BE(16),
          height: buf.readUInt32BE(20)
        };
      }
    }

    // 2. WebP: RIFF container with WEBP chunk
    if (ext === '.webp' && buf.length >= 30) {
      if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        const chunkType = buf.toString('ascii', 12, 16);
        if (chunkType === 'VP8 ') {
          // Lossy VP8: width & height in 14 bits at bytes 26, 28
          const w = buf.readUInt16LE(26) & 0x3FFF;
          const h = buf.readUInt16LE(28) & 0x3FFF;
          if (w > 0 && h > 0) return { width: w, height: h };
        } else if (chunkType === 'VP8L') {
          // Lossless VP8L: signature 0x2F at byte 20
          const b1 = buf.readUInt8(21);
          const b2 = buf.readUInt8(22);
          const b3 = buf.readUInt8(23);
          const b4 = buf.readUInt8(24);
          const w = 1 + (((b2 & 0x3F) << 8) | b1);
          const h = 1 + (((b4 & 0xF) << 10) | (b3 << 2) | ((b2 & 0xC0) >> 6));
          if (w > 0 && h > 0) return { width: w, height: h };
        } else if (chunkType === 'VP8X') {
          // Extended VP8X: 24-bit width-1 at byte 24, height-1 at byte 27
          const w = 1 + buf.readUIntLE(24, 3);
          const h = 1 + buf.readUIntLE(27, 3);
          if (w > 0 && h > 0) return { width: w, height: h };
        }
      }
    }

    // 3. JPEG: Start Of Frame markers (SOF0 = 0xC0, SOF1 = 0xC1, SOF2 = 0xC2)
    if ((ext === '.jpg' || ext === '.jpeg') && buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
      let offset = 2;
      while (offset < buf.length - 8) {
        if (buf[offset] !== 0xFF) break;
        const marker = buf[offset + 1];
        if (marker === 0xD9 || marker === 0xDA) break; // EOI or SOS (start of scan)
        const len = buf.readUInt16BE(offset + 2);
        if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC9 && marker <= 0xCB)) {
          const height = buf.readUInt16BE(offset + 5);
          const width = buf.readUInt16BE(offset + 7);
          if (width > 0 && height > 0) return { width, height };
        }
        offset += 2 + len;
      }
    }

    return null;
  }

  /**
   * Probe an entry's image header without decoding pixels.
   * Times out after 100ms so it can never block chapter opening.
   * @param {import('yauzl').ZipFile} zipfile
   * @param {import('yauzl').Entry} entry
   * @returns {Promise<{width: number, height: number}|null>}
   */
  probeEntryDimensions(zipfile, entry) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const timeout = setTimeout(() => finish(null), 100);

      try {
        zipfile.openReadStream(entry, (err, stream) => {
          if (err || !stream) {
            clearTimeout(timeout);
            return finish(null);
          }
          stream.once('data', (chunk) => {
            clearTimeout(timeout);
            try { stream.destroy(); } catch (_) {}
            const dims = this.parseImageDimensions(chunk, entry.fileName);
            finish(dims);
          });
          stream.once('error', () => {
            clearTimeout(timeout);
            finish(null);
          });
        });
      } catch (_) {
        clearTimeout(timeout);
        finish(null);
      }
    });
  }

  /**
   * Inspect a CBZ file and build an ordered manifest of image pages.
   * Also builds an in-memory entry index for O(1) direct page streaming.
   * Does NOT extract images to disk and does NOT load page contents into memory.
   *
   * @param {string} filePath - Absolute path to the CBZ archive
   * @returns {Promise<{pageCount: number, pages: Array<{index: number, entryName: string, uncompressedSize: number}>}>}
   */
  async getManifest(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`El archivo CBZ no existe: ${filePath}`);
    }

    const cacheKey = this.getCacheKey(filePath);
    const cached = this.manifestCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.cacheTTL) && cached.manifest) {
      return cached.manifest;
    }

    if (this.inFlightManifests.has(cacheKey)) {
      return this.inFlightManifests.get(cacheKey);
    }

    const manifestPromise = new Promise((resolve, reject) => {
      yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
        if (err) {
          logger.error('CBZ_READER', `Error al abrir CBZ "${path.basename(filePath)}": ${err.message}`);
          return reject(new Error(`No se pudo abrir el archivo CBZ: ${err.message}`));
        }

        const validEntries = [];

        zipfile.on('entry', (entry) => {
          // Exclude directories, macOS metadata, and non-image files
          if (!entry.fileName.endsWith('/') && !entry.fileName.includes('__MACOSX') && IMAGE_REGEX.test(entry.fileName)) {
            validEntries.push(entry);
          }
          zipfile.readEntry();
        });

        zipfile.on('end', async () => {
          // Sort pages in natural numeric reading order
          validEntries.sort((a, b) =>
            a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' })
          );

          // Phase 3.3: Probe first entry for real aspect ratio before decoding any full images
          let estimatedAspectRatio = 1.414;
          let firstPageDimensions = null;
          if (validEntries.length > 0) {
            try {
              const dims = await this.probeEntryDimensions(zipfile, validEntries[0]);
              if (dims && dims.width > 0 && dims.height > 0) {
                estimatedAspectRatio = Number((dims.height / dims.width).toFixed(4));
                firstPageDimensions = dims;
              }
            } catch (_) {}
          }
          try { zipfile.close(); } catch (_) {}

          // Build O(1) in-memory lookup indexes for direct entry streaming
          const entriesByName = new Map();
          const entriesByIndex = [];

          const pages = validEntries.map((entry, index) => {
            entriesByName.set(entry.fileName, entry);
            entriesByName.set(this.normalizeEntry(entry.fileName), entry);
            entriesByIndex[index] = entry;
            return {
              index,
              entryName: entry.fileName,
              compressedSize: entry.compressedSize,
              uncompressedSize: entry.uncompressedSize,
              mimeType: this.getMimeType(entry.fileName),
              naturalWidth: (firstPageDimensions && firstPageDimensions.width) || null,
              naturalHeight: (firstPageDimensions && firstPageDimensions.height) || null
            };
          });

          const manifest = {
            pageCount: pages.length,
            pages,
            estimatedAspectRatio,
            firstPageDimensions
          };

          // Cache manifest and entry index together
          this.manifestCache.set(cacheKey, {
            timestamp: Date.now(),
            manifest,
            entriesByName,
            entriesByIndex
          });

          // Clean older cache entries if cache grows
          if (this.manifestCache.size > 50) {
            const oldestKey = this.manifestCache.keys().next().value;
            this.manifestCache.delete(oldestKey);
          }

          resolve(manifest);
        });

        zipfile.on('error', (zErr) => {
          try { zipfile.close(); } catch (_) {}
          logger.error('CBZ_READER', `Error leyendo entradas de "${path.basename(filePath)}": ${zErr.message}`);
          reject(zErr);
        });

        // Trigger first entry read
        zipfile.readEntry();
      });
    }).finally(() => {
      this.inFlightManifests.delete(cacheKey);
    });

    this.inFlightManifests.set(cacheKey, manifestPromise);
    return manifestPromise;
  }

  /**
   * Normalize ZIP entry paths to ensure cross-platform consistency.
   * @param {string} name
   * @returns {string}
   */
  normalizeEntry(name) {
    if (!name) return '';
    return name.replace(/\\/g, '/').replace(/^\/+/, '').normalize('NFC');
  }

  /**
   * Open a read stream for a single entry in the CBZ archive on demand.
   * Phase 3.2: Uses in-memory entry index for O(1) direct offset retrieval without scanning.
   *
   * @param {string} filePath - Path to CBZ
   * @param {string} [targetEntryName] - Entry name inside the ZIP
   * @param {number|null} [pageIndex=null] - Optional page index fallback
   * @returns {Promise<{stream: import('stream').Readable, mimeType: string, size: number}>}
   */
  async getEntryStream(filePath, targetEntryName, pageIndex = null) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`El archivo CBZ no existe: ${filePath}`);
    }

    const cacheKey = this.getCacheKey(filePath);
    let cached = this.manifestCache.get(cacheKey);

    // Ensure the manifest and entry index are loaded
    if (!cached || (Date.now() - cached.timestamp >= this.cacheTTL) || !cached.entriesByName) {
      await this.getManifest(filePath);
      cached = this.manifestCache.get(cacheKey);
    }

    if (!cached || !cached.entriesByName) {
      throw new Error(`No se pudo inicializar el índice del archivo CBZ: ${filePath}`);
    }

    // Direct O(1) entry lookup from index
    let targetEntry = null;

    // 1. Try lookup by pageIndex if provided
    if (pageIndex !== null && pageIndex >= 0 && cached.entriesByIndex && cached.entriesByIndex[pageIndex]) {
      const candidate = cached.entriesByIndex[pageIndex];
      if (!targetEntryName || candidate.fileName === targetEntryName || this.normalizeEntry(candidate.fileName) === this.normalizeEntry(targetEntryName)) {
        targetEntry = candidate;
      }
    }

    // 2. Try lookup by entryName
    if (!targetEntry && targetEntryName) {
      targetEntry = cached.entriesByName.get(targetEntryName) ||
                    cached.entriesByName.get(this.normalizeEntry(targetEntryName));
    }

    // 3. Fallback: resolve entryName from manifest pages by pageIndex
    if (!targetEntry && pageIndex !== null && pageIndex >= 0 && cached.manifest && cached.manifest.pages && cached.manifest.pages[pageIndex]) {
      const pageInfo = cached.manifest.pages[pageIndex];
      targetEntry = cached.entriesByName.get(pageInfo.entryName);
    }

    if (!targetEntry) {
      throw new Error(`La imagen "${targetEntryName || pageIndex}" no se encontró en el archivo CBZ.`);
    }

    // Direct entry streaming: seeks directly to entry.relativeOffsetOfLocalHeader without iterating entries
    return new Promise((resolve, reject) => {
      let isSettled = false;

      yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
        if (err) {
          return reject(new Error(`Fallo al abrir archivo CBZ: ${err.message}`));
        }

        const safeReject = (error) => {
          if (isSettled) return;
          isSettled = true;
          try { zipfile.close(); } catch (_) {}
          reject(error);
        };

        zipfile.openReadStream(targetEntry, (streamErr, readStream) => {
          if (streamErr) {
            return safeReject(new Error(`Error al leer stream de ${targetEntry.fileName}: ${streamErr.message}`));
          }

          isSettled = true;

          // Ensure zipfile is closed as soon as the read stream completes, closes, or errors
          const closeZip = () => {
            try { zipfile.close(); } catch (_) {}
          };
          readStream.once('end', closeZip);
          readStream.once('close', closeZip);
          readStream.once('error', closeZip);

          resolve({
            stream: readStream,
            mimeType: this.getMimeType(targetEntry.fileName),
            size: targetEntry.uncompressedSize
          });
        });
      });
    });
  }
}

module.exports = new CBZProvider();
