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

  // Scan directory, group files into Manga Series, and extract first chapter cover
  async scanDirectory(dirPath, { onProgress = null, onSeries = null } = {}) {
    const startTime = Date.now();
    logger.info('SCANNER', `Iniciando escaneo inteligente de biblioteca: ${dirPath}`);

    const supportedExtensions = ['.cbz', '.pdf'];
    const discoveredFiles = [];

    // 1. Walk filesystem recursively
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
        logger.warn('SCANNER', `No se pudo acceder a ${currentDir}: ${err.message}`);
      }
    };

    walk(dirPath);

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

    const seriesResults = [];
    let currentSeriesIndex = 0;

    // 3. Process each Series
    for (const [key, group] of seriesGroups) {
      currentSeriesIndex++;
      const seriesStart = Date.now();

      // Sort chapters naturally by chapter number
      const chapters = group.files.map(file => {
        let stats = { size: 0, mtimeMs: 0 };
        try {
          stats = fs.statSync(file.fullPath);
        } catch (e) {}

        const chapterNum = this.parseChapterNumber(file.fileName);
        const chapterTitle = this.formatChapterTitle(file.fileName, chapterNum);

        return {
          title: chapterTitle,
          file_name: file.fileName,
          file_path: file.fullPath,
          format: file.ext,
          file_size: stats.size,
          chapter_number: chapterNum
        };
      });

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
          const stats = fs.statSync(firstChapter.file_path);
          const hash = this.getFileHash(firstChapter.file_path, stats);
          const cachedCoverPath = path.join(this.thumbnailsDir, `${hash}.jpg`);

          if (fs.existsSync(cachedCoverPath)) {
            coverPath = cachedCoverPath;
          } else if (firstChapter.format === 'cbz') {
            const result = this.extractCbzCover(firstChapter.file_path, cachedCoverPath);
            if (result.hasCover) {
              coverPath = cachedCoverPath;
            }
          }
        } catch (err) {
          logger.warn('COVER', `Error al obtener portada para "${group.title}": ${err.message}`);
        }
      }

      const seriesData = {
        title: group.title,
        author: group.author || 'Desconocido',
        path: group.path,
        cover_path: coverPath,
        chapter_count: chapters.length,
        primary_format: primaryFormat,
        chapters: chapters
      };

      seriesResults.push(seriesData);

      // Stream to callback if provided
      if (onSeries) {
        try {
          onSeries(seriesData, currentSeriesIndex, totalSeries);
        } catch (e) {
          logger.error('SCANNER', `Error en callback onSeries: ${e.message}`);
        }
      }

      const durationMs = Date.now() - seriesStart;

      if (onProgress) {
        onProgress({
          current: currentSeriesIndex,
          total: totalSeries,
          seriesTitle: group.title,
          chapterCount: chapters.length,
          durationMs
        });
      }

      logger.scan(
        'MANGA',
        `[${currentSeriesIndex}/${totalSeries}] "${group.title}" (${chapters.length} caps) -> Portada: ${coverPath ? 'OK' : 'Pendiente'} (${durationMs}ms)`
      );

      // Yield event loop
      await new Promise(resolve => setImmediate(resolve));
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.perf('SCANNER', `Escaneo completado: ${seriesResults.length} series procesadas en ${totalDuration}s.`);

    return seriesResults;
  }

  // Extract first image from CBZ file as cover
  extractCbzCover(filePath, targetCoverPath) {
    try {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();

      const imageRegex = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
      const imageEntries = entries
        .filter(e => !e.isDirectory && !e.entryName.startsWith('__MACOSX') && imageRegex.test(e.entryName))
        .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true, sensitivity: 'base' }));

      if (imageEntries.length > 0) {
        if (!fs.existsSync(targetCoverPath)) {
          const firstImage = imageEntries[0];
          const imgBuffer = firstImage.getData();
          fs.writeFileSync(targetCoverPath, imgBuffer);
        }
        return { hasCover: true, pageCount: imageEntries.length };
      }
    } catch (e) {
      logger.warn('CBZ', `Fallo al extraer portada de ${path.basename(filePath)}: ${e.message}`);
    }

    return { hasCover: false, pageCount: 0 };
  }
}

module.exports = LibraryScanner;
