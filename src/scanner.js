const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

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

  // Scan a directory recursively for .cbz and .pdf files
  async scanDirectory(dirPath, onProgress = null) {
    const supportedExtensions = ['.cbz', '.pdf'];
    const discoveredFiles = [];

    const walk = (currentDir) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            // Ignore hidden directories (.git, .cache, etc.)
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
        console.warn(`Could not read directory ${currentDir}:`, err.message);
      }
    };

    walk(dirPath);

    const items = [];
    const total = discoveredFiles.length;

    for (let i = 0; i < total; i++) {
      const file = discoveredFiles[i];
      try {
        const stats = fs.statSync(file.fullPath);
        const hash = this.getFileHash(file.fullPath, stats);
        const cachedCoverPath = path.join(this.thumbnailsDir, `${hash}.jpg`);

        let coverPath = null;
        let pageCount = 0;

        // Check if cover already exists in cache
        if (fs.existsSync(cachedCoverPath)) {
          coverPath = cachedCoverPath;
        }

        // Clean title: remove extension and replace underscores/periods with spaces
        const baseName = path.basename(file.fileName, path.extname(file.fileName));
        const cleanTitle = baseName.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

        // Extract CBZ cover and page count if not cached
        if (file.ext === 'cbz') {
          try {
            const result = this.extractCbzInfo(file.fullPath, cachedCoverPath);
            pageCount = result.pageCount;
            if (result.hasCover) {
              coverPath = cachedCoverPath;
            }
          } catch (e) {
            console.warn(`Error reading CBZ ${file.fileName}:`, e.message);
          }
        }

        items.push({
          title: cleanTitle,
          file_name: file.fileName,
          file_path: file.fullPath,
          format: file.ext,
          file_size: stats.size,
          page_count: pageCount,
          cover_path: coverPath,
          hash: hash,
          cached_cover_path: cachedCoverPath
        });

        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            file: file.fileName
          });
        }
      } catch (err) {
        console.error(`Error processing file ${file.fullPath}:`, err);
      }
    }

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
          console.warn('Failed to write CBZ cover to cache:', e);
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

  // Save thumbnail data (e.g. from PDF canvas render) directly to cache
  saveThumbnailBuffer(targetCoverPath, buffer) {
    try {
      fs.writeFileSync(targetCoverPath, buffer);
      return true;
    } catch (err) {
      console.error('Error saving thumbnail buffer:', err);
      return false;
    }
  }
}

module.exports = LibraryScanner;
