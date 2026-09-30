const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yauzl = require('yauzl');
const logger = require('./logger');

class LibraryScanner {
  constructor(userDataPath) {
    this.thumbnailsDir = path.join(userDataPath, 'thumbnails');
    if (!fs.existsSync(this.thumbnailsDir)) {
      fs.mkdirSync(this.thumbnailsDir, { recursive: true });
    }
    this.isCancelled = false;
  }

  // Cancel ongoing scan
  cancel() {
    this.isCancelled = true;
    logger.info('SCANNER', 'Cancelación solicitada por el usuario.');
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
    // If the base name already starts with Cap or Chapter, use it cleanly
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

  // Memory-efficient cover extraction using yauzl streaming (no full-archive buffering)
  extractCbzCover(filePath, targetCoverPath) {
    return new Promise((resolve) => {
      if (fs.existsSync(targetCoverPath)) {
        return resolve({ hasCover: true, pageCount: 0 });
      }

      yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
        if (err) {
          logger.warn('CBZ', `Error abriendo archivo CBZ ${path.basename(filePath)}: ${err.message}`);
          return resolve({ hasCover: false, pageCount: 0 });
        }

        const imageRegex = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
        const imageEntries = [];

        zipfile.on('entry', (entry) => {
          if (!entry.fileName.endsWith('/') && !entry.fileName.includes('__MACOSX') && imageRegex.test(entry.fileName)) {
            imageEntries.push(entry);
          }
          zipfile.readEntry();
        });

        zipfile.on('end', () => {
          if (imageEntries.length === 0) {
            zipfile.close();
            return resolve({ hasCover: false, pageCount: 0 });
          }

          // Sort naturally to identify cover image (001.jpg, cover.png, etc.)
          imageEntries.sort((a, b) => 
            a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' })
          );

          const coverEntry = imageEntries[0];
          zipfile.openReadStream(coverEntry, (streamErr, readStream) => {
            if (streamErr) {
              zipfile.close();
              logger.warn('CBZ', `Error leyendo stream de portada en ${path.basename(filePath)}: ${streamErr.message}`);
              return resolve({ hasCover: false, pageCount: imageEntries.length });
            }

            const tempCoverPath = `${targetCoverPath}.tmp.${Date.now()}`;
            const writeStream = fs.createWriteStream(tempCoverPath);

            readStream.on('error', (rErr) => {
              zipfile.close();
              writeStream.destroy();
              try { if (fs.existsSync(tempCoverPath)) fs.unlinkSync(tempCoverPath); } catch (_) {}
              logger.warn('CBZ', `Fallo al extraer portada de ${path.basename(filePath)}: ${rErr.message}`);
              resolve({ hasCover: false, pageCount: imageEntries.length });
            });

            writeStream.on('error', (wErr) => {
              zipfile.close();
              try { if (fs.existsSync(tempCoverPath)) fs.unlinkSync(tempCoverPath); } catch (_) {}
              logger.warn('CBZ', `Error escribiendo thumbnail de ${path.basename(filePath)}: ${wErr.message}`);
              resolve({ hasCover: false, pageCount: imageEntries.length });
            });

            writeStream.on('finish', () => {
              zipfile.close();
              try {
                fs.renameSync(tempCoverPath, targetCoverPath);
                resolve({ hasCover: true, pageCount: imageEntries.length });
              } catch (renErr) {
                try { if (fs.existsSync(tempCoverPath)) fs.unlinkSync(tempCoverPath); } catch (_) {}
                resolve({ hasCover: false, pageCount: imageEntries.length });
              }
            });

            readStream.pipe(writeStream);
          });
        });

        zipfile.on('error', (zipErr) => {
          try { zipfile.close(); } catch (_) {}
          logger.warn('CBZ', `Error durante lectura de CBZ ${path.basename(filePath)}: ${zipErr.message}`);
          resolve({ hasCover: false, pageCount: 0 });
        });

        zipfile.readEntry();
      });
    });
  }

  // Asynchronous and non-blocking directory walk
  async walkFiles(dirPath, supportedExtensions) {
    const discoveredFiles = [];
    const queue = [dirPath];

    while (queue.length > 0) {
      if (this.isCancelled) break;
      const currentDir = queue.shift();

      let entries;
      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      } catch (err) {
        logger.warn('SCANNER', `No se pudo acceder al directorio ${currentDir}: ${err.message}`);
        continue;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // ignore hidden files/directories
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          queue.push(fullPath);
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

      // Yield event loop periodically to prevent UI freezes
      if (queue.length % 5 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    return discoveredFiles;
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
    this.isCancelled = false;

    logger.info('SCANNER', `Iniciando escaneo (${mode.toUpperCase()}): ${dirPath}`);

    const supportedExtensions = ['.cbz', '.pdf'];

    // 1. Asynchronously walk filesystem without blocking event loop
    const discoveredFiles = await this.walkFiles(dirPath, supportedExtensions);

    if (this.isCancelled) {
      logger.info('SCANNER', 'Escaneo cancelado durante el descubrimiento de archivos.');
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

    logger.info('SCANNER', `Descubiertos ${discoveredFiles.length} archivos de cómics/mangas. Agrupando por series...`);

    // 2. Group files by Series (using immediate subfolder under dirPath as Manga title)
    const seriesGroups = new Map();

    for (const file of discoveredFiles) {
      const relPath = path.relative(dirPath, file.fullPath);
      const parts = relPath.split(path.sep);

      let seriesKey = '';
      let seriesPath = '';
      let rawFolderTitle = '';

      if (parts.length > 1) {
        // The file is inside a subfolder: the top subfolder is the Manga Series
        seriesKey = parts[0];
        seriesPath = path.join(dirPath, parts[0]);
        rawFolderTitle = parts[0];
      } else {
        // Standalone file in the root directory
        seriesKey = file.fullPath;
        seriesPath = file.fullPath;
        rawFolderTitle = path.basename(file.fileName, path.extname(file.fileName));
      }

      const { title, author } = this.parseTitleAndAuthor(rawFolderTitle);

      if (!seriesGroups.has(seriesKey)) {
        seriesGroups.set(seriesKey, {
          title,
          author,
          path: seriesPath,
          files: []
        });
      }

      seriesGroups.get(seriesKey).files.push(file);
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

    // 3. Process each Series incrementally
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

      for (const file of group.files) {
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

      if (firstChapter) {
        try {
          // If existing series already has a valid cover on disk, reuse it
          if (existingSeries && existingSeries.cover_path && fs.existsSync(existingSeries.cover_path)) {
            coverPath = existingSeries.cover_path;
          } else {
            const hash = this.getFileHash(firstChapter.file_path, {
              size: firstChapter.file_size,
              mtimeMs: firstChapter.mtime_ms
            });
            const cachedCoverPath = path.join(this.thumbnailsDir, `${hash}.jpg`);

            if (fs.existsSync(cachedCoverPath)) {
              coverPath = cachedCoverPath;
            } else if (firstChapter.format === 'cbz') {
              const result = await this.extractCbzCover(firstChapter.file_path, cachedCoverPath);
              if (result.hasCover) {
                coverPath = cachedCoverPath;
                seriesHasChanges = true;
              }
            }
          }
        } catch (err) {
          logger.warn('COVER', `Error al obtener portada para "${group.title}": ${err.message}`);
        }
      }

      // If cover was found now but series didn't have one before, mark changed
      if (coverPath && existingSeries && !existingSeries.cover_path) {
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

      // Stream to callback if provided
      if (onSeries) {
        try {
          await onSeries(seriesData, currentSeriesIndex, totalSeries);
        } catch (e) {
          logger.error('SCANNER', `Error en callback onSeries: ${e.message}`);
        }
      }

      const durationMs = Date.now() - seriesStart;

      if (onProgress) {
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

      // Free group memory and yield to event loop
      group.files = null;
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
      cancelled: this.isCancelled
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

  buildReport({ startTime, totalSeries, processedSeries, newFiles, modifiedFiles, skippedFiles, failedFiles, cancelled }) {
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    const report = {
      totalSeries,
      processedSeries,
      newFiles,
      modifiedFiles,
      skippedFiles,
      failedFiles,
      totalProcessed: newFiles + modifiedFiles,
      totalDiscovered: newFiles + modifiedFiles + skippedFiles + failedFiles,
      totalScanTime: `${totalDuration}s`,
      durationSeconds: parseFloat(totalDuration),
      cancelled
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
