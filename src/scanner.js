const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const logger = require('./logger');

class LibraryScanner {
  constructor(userDataPath) {
    this.thumbnailsDir = path.join(userDataPath, 'thumbnails');
    if (!fs.existsSync(this.thumbnailsDir)) {
      fs.mkdirSync(this.thumbnailsDir, { recursive: true });
    }
  }

  getFileHash(filePath, stats) {
    const key = `${filePath}-${stats.size}-${stats.mtimeMs}`;
    return crypto.createHash('md5').update(key).digest('hex');
  }

  // Scan a directory recursively for .cbz and .pdf files with event-loop yielding
  async scanDirectory(dirPath, { onProgress = null, onItem = null } = {}) {
    const startTime = Date.now();
    logger.info('SCANNER', `Iniciando escaneo del directorio: ${dirPath}`);

    const supportedExtensions = ['.cbz', '.pdf'];
    const discoveredFiles = [];

    // 1. Discovery phase (walking the filesystem)
    const walk = (currentDir) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.')) {
              walk(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (supportedExtensions.includes(ext)) {
              discoveredFiles.push({
                fullPath,
                fileName: entry.name,
                ext: ext.slice(1) // 'cbz' or 'pdf'
              });
            }
          }
        }
      } catch (err) {
        logger.warn('SCANNER', `No se pudo leer el subdirectorio ${currentDir}: ${err.message}`);
      }
    };

    walk(dirPath);

    const total = discoveredFiles.length;
    const cbzCount = discoveredFiles.filter(f => f.ext === 'cbz').length;
    const pdfCount = discoveredFiles.filter(f => f.ext === 'pdf').length;

    logger.info(
      'SCANNER',
      `Descubiertos ${total} archivos en total (${cbzCount} CBZ, ${pdfCount} PDF). Procesando...`
    );

    const items = [];

    // 2. Processing phase: non-blocking iteration
    for (let i = 0; i < total; i++) {
      const file = discoveredFiles[i];
      const fileStart = Date.now();

      try {
        const stats = fs.statSync(file.fullPath);
        const hash = this.getFileHash(file.fullPath, stats);
        const cachedCoverPath = path.join(this.thumbnailsDir, `${hash}.jpg`);

        let coverPath = null;
        let pageCount = 0;
        let isCached = false;

        // Check if cover already exists in thumbnail cache
        if (fs.existsSync(cachedCoverPath)) {
          coverPath = cachedCoverPath;
          isCached = true;
        }

        const baseName = path.basename(file.fileName, path.extname(file.fileName));
        const cleanTitle = baseName.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

        // Extract CBZ cover if not already in cache
        if (file.ext === 'cbz') {
          if (!isCached) {
            try {
              const result = this.extractCbzInfo(file.fullPath, cachedCoverPath);
              pageCount = result.pageCount;
              if (result.hasCover) {
                coverPath = cachedCoverPath;
              }
            } catch (e) {
              logger.warn('CBZ', `Error extrayendo portada de ${file.fileName}: ${e.message}`);
            }
          } else {
            coverPath = cachedCoverPath;
          }
        }

        const durationMs = Date.now() - fileStart;
        const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);

        const item = {
          title: cleanTitle,
          file_name: file.fileName,
          file_path: file.fullPath,
          format: file.ext,
          file_size: stats.size,
          page_count: pageCount,
          cover_path: coverPath,
          hash: hash,
          cached_cover_path: cachedCoverPath
        };

        items.push(item);

        // Stream item to caller immediately so it can be saved and displayed live
        if (onItem) {
          try {
            onItem(item, i + 1, total);
          } catch (e) {
            logger.error('SCANNER', `Error en callback onItem: ${e.message}`);
          }
        }

        // Notify progress
        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            file: file.fileName,
            durationMs,
            isCached
          });
        }

        // Detailed logging: log every file or heavy files
        if (durationMs > 250) {
          logger.warn(
            'PERF',
            `[${i + 1}/${total}] ${file.fileName} (${sizeMb} MB) tardó ${durationMs}ms`
          );
        } else if (i % 25 === 0 || i === total - 1 || !isCached) {
          logger.scan(
            'SCAN',
            `[${i + 1}/${total}] ${file.fileName} (${sizeMb} MB) ${isCached ? '⚡(Caché)' : '🖼️(Extraído)'} en ${durationMs}ms`
          );
        }
      } catch (err) {
        logger.error('SCANNER', `Fallo al procesar ${file.fileName}: ${err.message}`);
      }

      // CRITICAL FOR RESPONSIVENESS:
      // Yield execution to the Node.js event loop after EVERY file so Electron
      // can handle OS window manager pings, IPC, and UI repaints without freezing.
      await new Promise(resolve => setImmediate(resolve));

      // Every 15 files, insert a tiny 5ms break to let OS/GC breathe
      if ((i + 1) % 15 === 0) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.perf(
      'SCANNER',
      `Escaneo finalizado con éxito: ${items.length} archivos procesados en ${totalDuration}s`
    );

    return items;
  }

  // Extract first image from CBZ file and count pages
  extractCbzInfo(filePath, targetCoverPath) {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    const imageRegex = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
    const imageEntries = entries
      .filter(e => !e.isDirectory && !e.entryName.startsWith('__MACOSX') && imageRegex.test(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true, sensitivity: 'base' }));

    let hasCover = false;
    if (imageEntries.length > 0) {
      if (!fs.existsSync(targetCoverPath)) {
        try {
          const firstImage = imageEntries[0];
          const imgBuffer = firstImage.getData();
          fs.writeFileSync(targetCoverPath, imgBuffer);
          hasCover = true;
        } catch (e) {
          logger.warn('CBZ', `Fallo al escribir portada en disco: ${e.message}`);
        }
      } else {
        hasCover = true;
      }
    }

    return {
      pageCount: imageEntries.length,
      hasCover
    };
  }

  saveThumbnailBuffer(targetCoverPath, buffer) {
    try {
      fs.writeFileSync(targetCoverPath, buffer);
      return true;
    } catch (err) {
      logger.error('THUMBNAIL', `Error guardando miniatura: ${err.message}`);
      return false;
    }
  }
}

module.exports = LibraryScanner;
