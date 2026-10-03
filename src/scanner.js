const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yauzl = require('yauzl');
const logger = require('./logger');
const storage = require('./storage');
const thumbnailGenerator = require('./thumbnail-generator');

class LibraryScanner {
  constructor(thumbnailsDirOrUserDataPath) {
    if (thumbnailsDirOrUserDataPath) {
      if (thumbnailsDirOrUserDataPath.endsWith('thumbnails')) {
        this.thumbnailsDir = thumbnailsDirOrUserDataPath;
      } else {
        this.thumbnailsDir = path.join(thumbnailsDirOrUserDataPath, 'thumbnails');
      }
    } else {
      this.thumbnailsDir = storage.getThumbnailsPath();
    }
    if (!fs.existsSync(this.thumbnailsDir)) {
      fs.mkdirSync(this.thumbnailsDir, { recursive: true });
    }
    this.isCancelled = false;
    this.activeZipfiles = new Set();
    this.activeStreams = new Set();
  }

  // Cancel ongoing scan immediately
  cancel() {
    this.isCancelled = true;
    logger.info('SCANNER', 'Cancelación solicitada por el usuario.');
    for (const zip of this.activeZipfiles) {
      try { zip.close(); } catch (_) {}
    }
    this.activeZipfiles.clear();
    for (const stream of this.activeStreams) {
      try { stream.destroy(); } catch (_) {}
    }
    this.activeStreams.clear();
  }

  // Reset cancellation and tracking state for a new scan run
  reset() {
    this.isCancelled = false;
    this.activeZipfiles.clear();
    this.activeStreams.clear();
  }

  getFileHash(filePath, stats) {
    const key = `${filePath}-${stats.size}-${stats.mtimeMs}`;
    return crypto.createHash('md5').update(key).digest('hex');
  }

  parseChapterNumber(fileName) {
    // Search for "cap 1", "capítulo 08", "ch. 12.5", "c1", etc.
    const match = fileName.match(/(?:cap[íi]tulo|cap|ch|chapter|episodio|ep|c)[.\s_-]*([0-9]+(?:\.[0-9]+)?)/i);
    if (match) {
      return parseFloat(match[1]);
    }
    // Fallback: search for first number sequence
    const numMatch = fileName.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (numMatch) {
      return parseFloat(numMatch[1]);
    }
    return 0;
  }

  formatChapterTitle(fileName, chapterNum) {
    const baseName = path.basename(fileName, path.extname(fileName));
    if (/^(cap|ch|chapter|episodio)/i.test(baseName)) {
      return baseName.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    if (chapterNum > 0) {
      return `Capítulo ${chapterNum} - ${baseName}`;
    }
    return baseName.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  parseTitleAndAuthor(rawName) {
    let title = rawName;
    let author = 'Desconocido';

    // Pattern 1: [Author] Title or (Author) Title
    const prefixMatch = rawName.match(/^[\[\(](.*?)[\]\)]\s*(.*)$/);
    if (prefixMatch && prefixMatch[2].trim()) {
      author = prefixMatch[1].trim();
      title = prefixMatch[2].trim();
    } else {
      // Pattern 2: Title [Author] or Title (Author)
      const suffixMatch = rawName.match(/^(.*?)\s*[\[\(](.*?)[\]\)]$/);
      if (suffixMatch && suffixMatch[1].trim()) {
        title = suffixMatch[1].trim();
        author = suffixMatch[2].trim();
      }
    }

    title = title.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
    return { title: title || rawName, author };
  }

  // Validate that a cover file exists, is a regular file, and is non-empty
  isValidCover(filePath) {
    try {
      if (!filePath || typeof filePath !== 'string') return false;
      if (!fs.existsSync(filePath)) return false;
      const stats = fs.statSync(filePath);
      return stats.isFile() && stats.size > 0;
    } catch (_) {
      return false;
    }
  }

  // Memory-efficient cover extraction with cancellation checks and resource cleanup
  extractCbzCover(filePath, targetCoverPath) {
    return new Promise((resolve) => {
      if (this.isCancelled) {
        return resolve({ hasCover: false, pageCount: 0 });
      }
      if (this.isValidCover(targetCoverPath)) {
        return resolve({ hasCover: true, pageCount: 0 });
      }

      // If a corrupted or 0-byte thumbnail exists, clean it up before re-extracting
      if (fs.existsSync(targetCoverPath)) {
        try { fs.unlinkSync(targetCoverPath); } catch (_) {}
      }

      let zipfileRef = null;
      let readStreamRef = null;
      let writeStreamRef = null;
      let tempCoverPath = null;
      let isSettled = false;

      const cleanup = () => {
        if (zipfileRef) {
          this.activeZipfiles.delete(zipfileRef);
          try { zipfileRef.close(); } catch (_) {}
          zipfileRef = null;
        }
        if (readStreamRef) {
          this.activeStreams.delete(readStreamRef);
          try { readStreamRef.destroy(); } catch (_) {}
          readStreamRef = null;
        }
        if (writeStreamRef) {
          this.activeStreams.delete(writeStreamRef);
          try { writeStreamRef.destroy(); } catch (_) {}
          writeStreamRef = null;
        }
        if (tempCoverPath && fs.existsSync(tempCoverPath)) {
          try { fs.unlinkSync(tempCoverPath); } catch (_) {}
          tempCoverPath = null;
        }
      };

      const finish = (result) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        resolve(result);
      };

      yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
        if (err) {
          logger.warn('CBZ', `Error abriendo archivo CBZ ${path.basename(filePath)}: ${err.message}`);
          return finish({ hasCover: false, pageCount: 0 });
        }

        if (this.isCancelled) {
          try { zipfile.close(); } catch (_) {}
          return finish({ hasCover: false, pageCount: 0 });
        }

        zipfileRef = zipfile;
        this.activeZipfiles.add(zipfile);

        const imageRegex = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
        const imageEntries = [];

        zipfile.on('entry', (entry) => {
          if (this.isCancelled) {
            return finish({ hasCover: false, pageCount: 0 });
          }
          if (!entry.fileName.endsWith('/') && !entry.fileName.includes('__MACOSX') && imageRegex.test(entry.fileName)) {
            imageEntries.push(entry);
          }
          zipfile.readEntry();
        });

        zipfile.on('end', () => {
          if (this.isCancelled) {
            return finish({ hasCover: false, pageCount: 0 });
          }
          if (imageEntries.length === 0) {
            logger.warn('CBZ', `El archivo ${path.basename(filePath)} no contiene imágenes compatibles para portada.`);
            return finish({ hasCover: false, pageCount: 0 });
          }

          imageEntries.sort((a, b) =>
            a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' })
          );

          const coverEntry = imageEntries[0];
          zipfile.openReadStream(coverEntry, (streamErr, readStream) => {
            if (streamErr || this.isCancelled) {
              if (streamErr) {
                logger.warn('CBZ', `Error leyendo stream de portada en ${path.basename(filePath)}: ${streamErr.message}`);
              }
              return finish({ hasCover: false, pageCount: imageEntries.length });
            }

            tempCoverPath = storage.getTempThumbnailPath(targetCoverPath);
            const writeStream = fs.createWriteStream(tempCoverPath);

            readStreamRef = readStream;
            writeStreamRef = writeStream;
            this.activeStreams.add(readStream);
            this.activeStreams.add(writeStream);

            readStream.on('error', (rErr) => {
              logger.warn('CBZ', `Fallo al extraer portada de ${path.basename(filePath)}: ${rErr.message}`);
              finish({ hasCover: false, pageCount: imageEntries.length });
            });

            writeStream.on('error', (wErr) => {
              logger.warn('CBZ', `Error escribiendo thumbnail de ${path.basename(filePath)}: ${wErr.message}`);
              finish({ hasCover: false, pageCount: imageEntries.length });
            });

            writeStream.on('finish', () => {
              if (this.isCancelled) {
                return finish({ hasCover: false, pageCount: imageEntries.length });
              }
              try {
                fs.renameSync(tempCoverPath, targetCoverPath);
                tempCoverPath = null;
                const coverValid = this.isValidCover(targetCoverPath);
                if (coverValid) {
                  finish({ hasCover: true, pageCount: imageEntries.length });
                } else {
                  logger.warn('CBZ', `Thumbnail generado para ${path.basename(filePath)} es inválido o está vacío.`);
                  finish({ hasCover: false, pageCount: imageEntries.length });
                }
              } catch (renErr) {
                logger.warn('CBZ', `Error al guardar thumbnail de ${path.basename(filePath)}: ${renErr.message}`);
                finish({ hasCover: false, pageCount: imageEntries.length });
              }
            });

            readStream.pipe(writeStream);
          });
        });

        zipfile.on('error', (zipErr) => {
          logger.warn('CBZ', `Error durante lectura de CBZ ${path.basename(filePath)}: ${zipErr.message}`);
          finish({ hasCover: false, pageCount: 0 });
        });

        zipfile.readEntry();
      });
    });
  }

  // Walk filesystem and group files directly into series without intermediate huge arrays
  async discoverSeries(dirPath, supportedExtensions) {
    const seriesGroups = new Map();
    const queue = [dirPath];
    let fileCounter = 0;

    while (queue.length > 0) {
      if (this.isCancelled) return null;
      const currentDir = queue.shift();

      let entries;
      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      } catch (err) {
        logger.warn('SCANNER', `No se pudo acceder al directorio ${currentDir}: ${err.message}`);
        // Filesystem traversal error -> abort discovery so incomplete scan never prunes
        return null;
      }

      for (let i = 0; i < entries.length; i++) {
        if (this.isCancelled) return null;
        const entry = entries[i];
        if (entry.name.startsWith('.')) continue; // ignore hidden files/directories

        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          queue.push(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (supportedExtensions.includes(ext)) {
            fileCounter++;
            const relPath = path.relative(dirPath, fullPath);
            const parts = relPath.split(path.sep);

            let seriesKey = '';
            let seriesPath = '';
            let rawFolderTitle = '';

            if (parts.length > 1) {
              // Inside subfolder: top subfolder is Manga Series
              seriesKey = parts[0];
              seriesPath = path.join(dirPath, parts[0]);
              rawFolderTitle = parts[0];
            } else {
              // Standalone file in root directory
              seriesKey = fullPath;
              seriesPath = fullPath;
              rawFolderTitle = path.basename(entry.name, path.extname(entry.name));
            }

            if (!seriesGroups.has(seriesKey)) {
              const { title, author } = this.parseTitleAndAuthor(rawFolderTitle);
              seriesGroups.set(seriesKey, {
                title,
                author,
                path: seriesPath,
                files: []
              });
            }

            seriesGroups.get(seriesKey).files.push({
              fullPath,
              fileName: entry.name,
              ext: ext.slice(1)
            });
          }
        }

        // Yield event loop every 50 files to keep process responsive and allow cancellation
        if (fileCounter % 50 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      // Yield event loop every directory to allow cancellation and UI ticks
      await new Promise(resolve => setImmediate(resolve));
    }

    return seriesGroups;
  }

  // Backward compatibility alias
  async walkFiles(dirPath, supportedExtensions) {
    const seriesGroups = await this.discoverSeries(dirPath, supportedExtensions);
    if (!seriesGroups) return [];
    const files = [];
    for (const group of seriesGroups.values()) {
      files.push(...group.files);
    }
    return files;
  }

  // Scan directory, group files into Manga Series, and extract first chapter cover
  async scanDirectory(dirPath, {
    onProgress = null,
    onSeries = null,
    mode = 'incremental', // 'incremental' | 'full'
    registeredChapters = new Map(),
    registeredSeries = new Map()
  } = {}) {
    const startTime = Date.now();

    // Check if cancellation was already requested before scan begins
    if (this.isCancelled) {
      logger.info('SCANNER', 'Escaneo cancelado antes de iniciar.');
      return this.buildReport({
        startTime,
        totalSeries: 0,
        processedSeries: 0,
        newFiles: 0,
        modifiedFiles: 0,
        skippedFiles: 0,
        failedFiles: 0,
        cancelled: true
      });
    }

    logger.info('SCANNER', `Iniciando escaneo (${mode.toUpperCase()}): ${dirPath}`);

    const supportedExtensions = ['.cbz', '.pdf'];

    // 1. Walk filesystem and build series directly in one pass
    const seriesGroups = await this.discoverSeries(dirPath, supportedExtensions);

    if (this.isCancelled || !seriesGroups) {
      const isCancelled = Boolean(this.isCancelled);
      logger.info('SCANNER', isCancelled ? 'Escaneo cancelado durante el descubrimiento de archivos.' : 'Error durante el descubrimiento de archivos.');
      return this.buildReport({
        startTime,
        totalSeries: 0,
        processedSeries: 0,
        newFiles: 0,
        modifiedFiles: 0,
        skippedFiles: 0,
        failedFiles: 0,
        cancelled: isCancelled,
        failed: !isCancelled
      });
    }

    const discoveredSeriesPaths = new Set();
    const discoveredChapterPaths = new Set();
    for (const group of seriesGroups.values()) {
      discoveredSeriesPaths.add(group.path);
      for (const file of group.files) {
        discoveredChapterPaths.add(file.fullPath);
      }
    }

    const totalSeries = seriesGroups.size;
    logger.info('SCANNER', `Se identificaron ${totalSeries} series / mangas únicos.`);

    let currentSeriesIndex = 0;
    const stats = {
      newFiles: 0,
      modifiedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0
    };

    // 2. Process each Series incrementally
    for (const [key, group] of seriesGroups) {
      if (this.isCancelled) {
        logger.info('SCANNER', `Escaneo cancelado por el usuario en serie [${currentSeriesIndex}/${totalSeries}] "${group.title}".`);
        break;
      }

      currentSeriesIndex++;
      const seriesStart = Date.now();
      const existingSeries = registeredSeries ? registeredSeries.get(group.path) : null;

      // Process chapters with incremental check
      const chapters = [];
      let seriesHasChanges = !existingSeries;

      let fileCounterInSeries = 0;
      for (const file of group.files) {
        if (this.isCancelled) break;

        fileCounterInSeries++;
        if (fileCounterInSeries % 25 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }

        let fileStat = null;
        try {
          fileStat = await fs.promises.stat(file.fullPath);
        } catch (e) {
          logger.warn('SCANNER', `Archivo inaccesible o no legible: ${file.fullPath} (${e.message})`);
          stats.failedFiles++;
          continue;
        }

        const chapterNum = this.parseChapterNumber(file.fileName);
        const chapterTitle = this.formatChapterTitle(file.fileName, chapterNum);

        const regChapter = registeredChapters ? registeredChapters.get(file.fullPath) : null;
        let fileStatus = 'new'; // 'new' | 'modified' | 'unchanged'

        if (regChapter && mode !== 'full') {
          const sizeMatches = fileStat.size === regChapter.file_size;
          const mtimeMatches = Math.abs(fileStat.mtimeMs - regChapter.mtime_ms) <= 1000;
          if (sizeMatches && mtimeMatches) {
            fileStatus = 'unchanged';
          } else {
            fileStatus = 'modified';
          }
        } else if (regChapter && mode === 'full') {
          fileStatus = 'modified';
        }

        if (fileStatus === 'unchanged') {
          stats.skippedFiles++;
        } else if (fileStatus === 'modified') {
          stats.modifiedFiles++;
          seriesHasChanges = true;
        } else {
          stats.newFiles++;
          seriesHasChanges = true;
        }

        chapters.push({
          title: chapterTitle,
          file_name: file.fileName,
          file_path: file.fullPath,
          format: file.ext,
          file_size: fileStat.size,
          mtime_ms: fileStat.mtimeMs,
          chapter_number: chapterNum,
          status: fileStatus
        });
      }

      if (this.isCancelled) {
        break;
      }

      // Check if chapter count changed
      if (existingSeries && existingSeries.chapter_count !== chapters.length) {
        seriesHasChanges = true;
      }

      // Sort ascending by chapter number, then natural filename sort
      chapters.sort((a, b) => {
        if (a.chapter_number !== b.chapter_number && a.chapter_number > 0 && b.chapter_number > 0) {
          return a.chapter_number - b.chapter_number;
        }
        return a.file_name.localeCompare(b.file_name, undefined, { numeric: true, sensitivity: 'base' });
      });

      // Cover extraction: Extract ONLY the cover of the FIRST chapter
      const firstChapter = chapters[0];
      let coverPath = null;
      let primaryFormat = firstChapter ? firstChapter.format : 'cbz';

      if (firstChapter && !this.isCancelled) {
        try {
          // Re-use existing series cover if it is still valid on disk and not doing a full scan
          if (existingSeries && this.isValidCover(existingSeries.cover_path) && mode !== 'full') {
            coverPath = existingSeries.cover_path;
          } else {
            const hash = this.getFileHash(firstChapter.file_path, {
              size: firstChapter.file_size,
              mtimeMs: firstChapter.mtime_ms
            });
            const cachedCoverPath = path.join(this.thumbnailsDir, `${hash}.jpg`);

            if (this.isValidCover(cachedCoverPath)) {
              coverPath = cachedCoverPath;
            } else if (firstChapter.format === 'cbz') {
              const result = await this.extractCbzCover(firstChapter.file_path, cachedCoverPath);
              if (result.hasCover && this.isValidCover(cachedCoverPath)) {
                coverPath = cachedCoverPath;
                seriesHasChanges = true;
                // Enqueue background grid thumbnail generation asynchronously (non-blocking)
                thumbnailGenerator.enqueue(cachedCoverPath, false);
              } else {
                logger.warn('COVER', `No se pudo extraer portada válida para "${group.title}" desde ${firstChapter.file_name}`);
              }
            }
          }
        } catch (err) {
          logger.warn('COVER', `Error al obtener portada para "${group.title}": ${err.message}`);
        }
      }

      if (this.isCancelled) {
        break;
      }

      // Check if cover changed (e.g. was missing, updated, or stale path fixed)
      if (existingSeries && (existingSeries.cover_path || null) !== (coverPath || null)) {
        seriesHasChanges = true;
      }

      const seriesData = {
        title: group.title,
        author: group.author || 'Desconocido',
        path: group.path,
        cover_path: coverPath,
        chapter_count: chapters.length,
        primary_format: primaryFormat,
        chapters: chapters,
        hasChanges: seriesHasChanges,
        seriesId: existingSeries ? existingSeries.id : null
      };

      // Stream to callback if provided and not cancelled
      if (onSeries && !this.isCancelled) {
        try {
          await onSeries(seriesData, currentSeriesIndex, totalSeries);
        } catch (e) {
          logger.error('SCANNER', `Error en callback onSeries: ${e.message}`);
        }
      }

      if (this.isCancelled) {
        break;
      }

      const durationMs = Date.now() - seriesStart;

      if (onProgress && !this.isCancelled) {
        try {
          onProgress({
            current: currentSeriesIndex,
            total: totalSeries,
            seriesTitle: group.title,
            chapterCount: chapters.length,
            durationMs,
            hasChanges: seriesHasChanges
          });
        } catch (e) {
          logger.error('SCANNER', `Error en callback onProgress: ${e.message}`);
        }
      }

      logger.scan(
        'MANGA',
        `[${currentSeriesIndex}/${totalSeries}] "${group.title}" (${chapters.length} caps) -> Estado: ${seriesHasChanges ? 'Actualizado' : 'Sin cambios'} (${durationMs}ms)`
      );

      // Immediately free processed series memory and yield event loop
      group.files = null;
      seriesGroups.delete(key);
      await new Promise(resolve => setImmediate(resolve));
    }

    const report = this.buildReport({
      startTime,
      totalSeries,
      processedSeries: currentSeriesIndex,
      newFiles: stats.newFiles,
      modifiedFiles: stats.modifiedFiles,
      skippedFiles: stats.skippedFiles,
      failedFiles: stats.failedFiles,
      cancelled: Boolean(this.isCancelled),
      failed: false,
      discoveredSeriesPaths,
      discoveredChapterPaths
    });

    logger.info('SCANNER', `
========================================
RESUMEN DE ESCANEO (${mode.toUpperCase()})
----------------------------------------
Nuevos archivos:       ${report.newFiles}
Archivos modificados:  ${report.modifiedFiles}
Archivos omitidos:     ${report.skippedFiles}
Archivos con error:    ${report.failedFiles}
Total procesados:      ${report.totalProcessed}
Total descubiertos:    ${report.totalDiscovered}
Series identificadas:  ${report.totalSeries}
Tiempo total:          ${report.totalScanTime}
Estado:                ${report.cancelled ? 'CANCELADO' : 'COMPLETADO'}
========================================
    `.trim());

    return report;
  }

  buildReport({
    startTime,
    totalSeries,
    processedSeries,
    newFiles,
    modifiedFiles,
    skippedFiles,
    failedFiles,
    cancelled,
    failed = false,
    discoveredSeriesPaths = new Set(),
    discoveredChapterPaths = new Set(),
    prunedChapters = 0,
    prunedSeries = 0
  }) {
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    const report = {
      totalSeries,
      processedSeries,
      newFiles,
      modifiedFiles,
      skippedFiles,
      failedFiles,
      prunedChapters,
      prunedSeries,
      totalProcessed: newFiles + modifiedFiles,
      totalDiscovered: newFiles + modifiedFiles + skippedFiles + failedFiles,
      totalScanTime: `${totalDuration}s`,
      durationSeconds: parseFloat(totalDuration),
      cancelled: Boolean(cancelled),
      failed: Boolean(failed),
      discoveredSeriesPaths,
      discoveredChapterPaths
    };

    // Maintain backwards compatibility with code checking result.length
    Object.defineProperty(report, 'length', {
      get: () => report.totalSeries,
      enumerable: false
    });

    return report;
  }
}

module.exports = LibraryScanner;
