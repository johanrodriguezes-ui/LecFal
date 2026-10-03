/**
 * Test Suite: Storage & Portability Abstraction (Phase 5.1)
 *
 * Verifies:
 * A. Standard mode path resolution
 * B. Portable mode path resolution
 * C. Database path belongs to selected storage root
 * D. Cache path belongs to selected storage root
 * E. Thumbnail path belongs to selected storage root
 * F. Logs path belongs to selected storage root
 * G. ensureDirectories creates required directories
 * H. Migration from standard -> portable
 * I. Migration preserves database contents
 * J. Migration preserves thumbnails (including grid)
 * K. Migration is idempotent
 * L. Migration does not overwrite existing target files
 * M. Migration does not delete source data
 * N. Migration failure leaves source intact
 * O. No production module independently hardcodes ~/.config/lecfal
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const storage = require('../../src/core/storage');
const { StorageManager, migrateStorage, DATA_CLASSIFICATION } = storage;

async function runStorageTests() {
  console.log('======================================================');
  console.log('  TEST: STORAGE & PORTABILITY ABSTRACTION (PHASE 5.1)');
  console.log('======================================================');

  const rootTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'lecfal_test_storage_'));

  try {
    // ----------------------------------------------------
    // TEST A: Standard mode path resolution
    // ----------------------------------------------------
    console.log('\n--- Test A: Standard Mode Path Resolution ---');
    const stdTempDir = path.join(rootTemp, 'std_root');
    const appTempDir = path.join(rootTemp, 'app_dir');
    fs.mkdirSync(stdTempDir, { recursive: true });
    fs.mkdirSync(appTempDir, { recursive: true });

    const smStd = new StorageManager();
    smStd.init({
      mode: 'standard',
      dataRoot: stdTempDir,
      appDir: appTempDir
    });

    assert.strictEqual(smStd.getStorageMode(), 'standard', 'Mode must be standard');
    assert.strictEqual(smStd.isPortableMode(), false, 'isPortableMode must be false');
    assert.strictEqual(smStd.isPortable(), false, 'isPortable alias must be false');
    assert.strictEqual(smStd.getStorageRoot(), path.resolve(stdTempDir), 'Storage root must match dataRoot');
    assert.strictEqual(smStd.getDataPath(), path.resolve(stdTempDir), 'getDataPath must match storage root');
    assert.strictEqual(smStd.getDataRoot(), path.resolve(stdTempDir), 'getDataRoot must match storage root');
    console.log('✓ Test A passed: Standard mode path resolution verified.');

    // ----------------------------------------------------
    // TEST B: Portable mode path resolution
    // ----------------------------------------------------
    console.log('\n--- Test B: Portable Mode Path Resolution ---');
    const smPort = new StorageManager();
    smPort.init({
      mode: 'portable',
      appDir: appTempDir
    });

    const expectedPortableData = path.join(path.resolve(appTempDir), 'data');
    assert.strictEqual(smPort.getStorageMode(), 'portable', 'Mode must be portable');
    assert.strictEqual(smPort.isPortableMode(), true, 'isPortableMode must be true');
    assert.strictEqual(smPort.isPortable(), true, 'isPortable alias must be true');
    assert.strictEqual(smPort.getAppDirectory(), path.resolve(appTempDir), 'getAppDirectory must match appDir');
    assert.strictEqual(smPort.getPortableDataPath(), expectedPortableData, 'getPortableDataPath must be <appDir>/data');
    assert.strictEqual(smPort.getStorageRoot(), expectedPortableData, 'getStorageRoot in portable mode must be <appDir>/data');
    assert.strictEqual(smPort.getDataPath(), expectedPortableData, 'getDataPath must match portable storage root');

    // Sub-check: Read-only application directory safety guard
    const readOnlyAppDir = path.join(rootTemp, 'ro_app_dir');
    fs.mkdirSync(readOnlyAppDir, { recursive: true });
    fs.chmodSync(readOnlyAppDir, 0o555);

    const smReadOnly = new StorageManager();
    const isAvail = smReadOnly.isWritable(path.join(readOnlyAppDir, 'data'));
    assert.strictEqual(isAvail, false, 'isWritable must return false for read-only directory');

    smReadOnly.init({
      mode: 'portable',
      appDir: readOnlyAppDir
    });
    assert.strictEqual(smReadOnly.getStorageMode(), 'standard', 'Must fallback to standard mode when appDir is read-only');
    assert.strictEqual(smReadOnly.isPortableMode(), false, 'isPortableMode must be false after fallback');

    fs.chmodSync(readOnlyAppDir, 0o755);
    console.log('  ✓ Read-only application directory safely rejected without crash');
    console.log('✓ Test B passed: Portable mode path resolution verified.');

    // ----------------------------------------------------
    // TEST C: Database path belongs to selected storage root
    // ----------------------------------------------------
    console.log('\n--- Test C: Database Path Belongs to Selected Storage Root ---');
    const stdDbPath = smStd.getDatabasePath();
    const portDbPath = smPort.getDatabasePath();

    assert.strictEqual(stdDbPath, path.join(stdTempDir, 'lecfal.db'), 'Standard DB path must be <root>/lecfal.db');
    assert.strictEqual(portDbPath, path.join(expectedPortableData, 'lecfal.db'), 'Portable DB path must be <portableRoot>/lecfal.db');
    assert.ok(stdDbPath.startsWith(smStd.getStorageRoot()), 'Standard DB path must belong to standard root');
    assert.ok(portDbPath.startsWith(smPort.getStorageRoot()), 'Portable DB path must belong to portable root');
    assert.strictEqual(smStd.getDatabaseDir(), smStd.getStorageRoot(), 'getDatabaseDir must return storage root');
    console.log('✓ Test C passed: Database path belongs to selected storage root in both modes.');

    // ----------------------------------------------------
    // TEST D: Cache path belongs to selected storage root
    // ----------------------------------------------------
    console.log('\n--- Test D: Cache Path Belongs to Selected Storage Root ---');
    const stdCachePath = smStd.getCachePath();
    const stdReaderCachePath = smStd.getReaderCachePath();
    const portCachePath = smPort.getCachePath();
    const portReaderCachePath = smPort.getReaderCachePath();

    assert.strictEqual(stdCachePath, path.join(stdTempDir, 'cache'), 'Standard cache path must be <root>/cache');
    assert.strictEqual(stdReaderCachePath, path.join(stdTempDir, 'cache', 'reader'), 'Standard reader cache must be <root>/cache/reader');
    assert.strictEqual(portCachePath, path.join(expectedPortableData, 'cache'), 'Portable cache path must be <portableRoot>/cache');
    assert.strictEqual(portReaderCachePath, path.join(expectedPortableData, 'cache', 'reader'), 'Portable reader cache must be <portableRoot>/cache/reader');
    assert.ok(stdCachePath.startsWith(smStd.getStorageRoot()), 'Standard cache must belong to standard root');
    assert.ok(portCachePath.startsWith(smPort.getStorageRoot()), 'Portable cache must belong to portable root');
    console.log('✓ Test D passed: Cache and reader cache paths belong to selected storage root.');

    // ----------------------------------------------------
    // TEST E: Thumbnail path belongs to selected storage root
    // ----------------------------------------------------
    console.log('\n--- Test E: Thumbnail Path Belongs to Selected Storage Root ---');
    const stdThumbPath = smStd.getThumbnailsPath();
    const stdGridThumbPath = smStd.getGridThumbnailsPath();
    const portThumbPath = smPort.getThumbnailsPath();
    const portGridThumbPath = smPort.getGridThumbnailsPath();

    assert.strictEqual(stdThumbPath, path.join(stdTempDir, 'thumbnails'), 'Standard thumbnails path must be <root>/thumbnails');
    assert.strictEqual(stdGridThumbPath, path.join(stdTempDir, 'thumbnails', 'grid'), 'Standard grid thumbnails must be <root>/thumbnails/grid');
    assert.strictEqual(portThumbPath, path.join(expectedPortableData, 'thumbnails'), 'Portable thumbnails path must be <portableRoot>/thumbnails');
    assert.strictEqual(portGridThumbPath, path.join(expectedPortableData, 'thumbnails', 'grid'), 'Portable grid thumbnails must be <portableRoot>/thumbnails/grid');
    assert.ok(stdThumbPath.startsWith(smStd.getStorageRoot()), 'Standard thumbnails must belong to standard root');
    assert.ok(portThumbPath.startsWith(smPort.getStorageRoot()), 'Portable thumbnails must belong to portable root');

    const sampleHash = 'abcdef0123456789abcdef0123456789';
    assert.strictEqual(smStd.getThumbnailFilePath(sampleHash), path.join(stdThumbPath, `${sampleHash}.jpg`), 'Thumbnail file path resolution matches');
    console.log('✓ Test E passed: Thumbnail and grid thumbnail paths belong to selected storage root.');

    // ----------------------------------------------------
    // TEST F: Logs path belongs to selected storage root
    // ----------------------------------------------------
    console.log('\n--- Test F: Logs Path Belongs to Selected Storage Root ---');
    const stdLogsPath = smStd.getLogsPath();
    const portLogsPath = smPort.getLogsPath();
    const stdLogFile = smStd.getLogFilePath();
    const portLogFile = smPort.getLogFilePath();

    assert.strictEqual(stdLogsPath, path.join(stdTempDir, 'logs'), 'Standard logs directory must be <root>/logs');
    assert.strictEqual(portLogsPath, path.join(expectedPortableData, 'logs'), 'Portable logs directory must be <portableRoot>/logs');
    assert.ok(stdLogFile.startsWith(smStd.getStorageRoot()), 'Standard log file must belong to standard root');
    assert.ok(portLogFile.startsWith(smPort.getStorageRoot()), 'Portable log file must belong to portable root');
    console.log('✓ Test F passed: Logs directory and log file belong to selected storage root.');

    // ----------------------------------------------------
    // TEST G: ensureDirectories creates required directories
    // ----------------------------------------------------
    console.log('\n--- Test G: ensureDirectories Creates Required Directories ---');
    const freshRoot = path.join(rootTemp, 'fresh_ensure_dir');
    const smFresh = new StorageManager();
    smFresh.init({ dataRoot: freshRoot });

    assert.ok(fs.existsSync(smFresh.getStorageRoot()), 'Storage root directory must exist');
    assert.ok(fs.existsSync(smFresh.getThumbnailsPath()), 'Thumbnails directory must exist');
    assert.ok(fs.existsSync(smFresh.getGridThumbnailsPath()), 'Grid thumbnails directory must exist');
    assert.ok(fs.existsSync(smFresh.getCachePath()), 'Cache directory must exist');
    assert.ok(fs.existsSync(smFresh.getReaderCachePath()), 'Reader cache directory must exist');
    assert.ok(fs.existsSync(smFresh.getConfigPath()), 'Config directory must exist');
    assert.ok(fs.existsSync(smFresh.getLogsPath()), 'Logs directory must exist');
    console.log('✓ Test G passed: ensureDirectories creates all required storage directories.');

    // ----------------------------------------------------
    // TEST H: Migration from standard -> portable
    // ----------------------------------------------------
    console.log('\n--- Test H: Migration from Standard -> Portable ---');
    const migSrc = path.join(rootTemp, 'migration_src');
    const migDst = path.join(rootTemp, 'migration_dst');
    fs.mkdirSync(migSrc, { recursive: true });

    // Setup source with sample files across classifications
    // 1. PERSISTENT: SQLite DB
    const SQL = await initSqlJs();
    const initialDb = new SQL.Database();
    initialDb.run('CREATE TABLE series (id INT, title TEXT);');
    initialDb.run("INSERT INTO series VALUES (1, 'One Piece'), (2, 'Berserk');");
    fs.writeFileSync(path.join(migSrc, 'lecfal.db'), Buffer.from(initialDb.export()));
    initialDb.close();

    // 2. REGENERABLE: thumbnails & grid thumbnails
    fs.mkdirSync(path.join(migSrc, 'thumbnails', 'grid'), { recursive: true });
    fs.writeFileSync(path.join(migSrc, 'thumbnails', 'cover_a.jpg'), 'thumbnail_data_a');
    fs.writeFileSync(path.join(migSrc, 'thumbnails', 'grid', 'thumb_grid_a.jpg'), 'grid_thumbnail_data_a');

    // 3. REGENERABLE: cache
    fs.mkdirSync(path.join(migSrc, 'cache', 'reader'), { recursive: true });
    fs.writeFileSync(path.join(migSrc, 'cache', 'reader', 'cached_page.bin'), 'reader_cached_content');

    // 4. OPTIONAL: logs
    fs.writeFileSync(path.join(migSrc, 'lecfal.log'), 'session_log_data_123');

    // 5. UNRELATED/FOREIGN file (should NOT be migrated per data classification)
    fs.mkdirSync(path.join(migSrc, 'GPUCache'), { recursive: true });
    fs.writeFileSync(path.join(migSrc, 'GPUCache', 'data_0'), 'chromium_gpu_cache_binary');

    const migResult = migrateStorage(migSrc, migDst);
    assert.strictEqual(migResult.success, true, 'Migration must report success');
    assert.ok(migResult.copied.length >= 4, 'Must have copied database, thumbnails, cache, logs');

    // Verify foreign file was NOT migrated
    assert.strictEqual(fs.existsSync(path.join(migDst, 'GPUCache')), false, 'Unrelated files (GPUCache) must NOT be migrated');
    console.log('✓ Test H passed: Standard -> portable migration completed successfully with proper classification.');

    // ----------------------------------------------------
    // TEST I: Migration preserves database contents
    // ----------------------------------------------------
    console.log('\n--- Test I: Migration Preserves Database Contents ---');
    const migratedDbBuffer = fs.readFileSync(path.join(migDst, 'lecfal.db'));
    const verifiedDb = new SQL.Database(migratedDbBuffer);
    const rows = verifiedDb.exec('SELECT id, title FROM series ORDER BY id ASC');
    assert.strictEqual(rows[0].values.length, 2, 'Must contain 2 series rows');
    assert.strictEqual(rows[0].values[0][1], 'One Piece', 'First row title matches');
    assert.strictEqual(rows[0].values[1][1], 'Berserk', 'Second row title matches');
    verifiedDb.close();

    const srcDbHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(migSrc, 'lecfal.db'))).digest('hex');
    const dstDbHash = crypto.createHash('sha256').update(migratedDbBuffer).digest('hex');
    assert.strictEqual(srcDbHash, dstDbHash, 'Migrated database must have exact identical SHA256 checksum');
    console.log('✓ Test I passed: SQLite database contents preserved byte-for-byte.');

    // ----------------------------------------------------
    // TEST J: Migration preserves thumbnails
    // ----------------------------------------------------
    console.log('\n--- Test J: Migration Preserves Thumbnails ---');
    assert.strictEqual(fs.readFileSync(path.join(migDst, 'thumbnails', 'cover_a.jpg'), 'utf8'), 'thumbnail_data_a');
    assert.strictEqual(fs.readFileSync(path.join(migDst, 'thumbnails', 'grid', 'thumb_grid_a.jpg'), 'utf8'), 'grid_thumbnail_data_a');
    console.log('✓ Test J passed: Full-res and grid thumbnails preserved.');

    // ----------------------------------------------------
    // TEST K: Migration is idempotent
    // ----------------------------------------------------
    console.log('\n--- Test K: Migration is Idempotent ---');
    const migResult2 = migrateStorage(migSrc, migDst);
    assert.strictEqual(migResult2.success, true, 'Second migration run must succeed');
    assert.strictEqual(migResult2.copied.length, 0, 'No files should be copied again if already matching');
    assert.ok(migResult2.skipped.length >= 4, 'Existing identical files must be cleanly skipped');
    console.log('✓ Test K passed: Repeated migration is idempotent and safe.');

    // ----------------------------------------------------
    // TEST L: Migration does not overwrite existing target files
    // ----------------------------------------------------
    console.log('\n--- Test L: Migration Does Not Overwrite Existing Target Files ---');
    const conflictDst = path.join(rootTemp, 'conflict_dst');
    fs.mkdirSync(conflictDst, { recursive: true });
    fs.writeFileSync(path.join(conflictDst, 'lecfal.db'), 'CONFLICTING_EXISTING_DB_DATA');

    const conflictResult = migrateStorage(migSrc, conflictDst);
    assert.strictEqual(conflictResult.success, true, 'Migration completes skipping conflicting file');
    const preservedContent = fs.readFileSync(path.join(conflictDst, 'lecfal.db'), 'utf8');
    assert.strictEqual(preservedContent, 'CONFLICTING_EXISTING_DB_DATA', 'Target file must NOT be overwritten');
    const conflictSkipped = conflictResult.skipped.find(s => s.relativePath === 'lecfal.db');
    assert.ok(conflictSkipped, 'lecfal.db must be recorded in skipped list');
    assert.ok(conflictSkipped.reason.includes('sobreescritura rechazada'), 'Reason must indicate overwrite rejected');
    console.log('✓ Test L passed: Existing target files are never overwritten.');

    // ----------------------------------------------------
    // TEST M: Migration does not delete source data
    // ----------------------------------------------------
    console.log('\n--- Test M: Migration Does Not Delete Source Data ---');
    assert.ok(fs.existsSync(path.join(migSrc, 'lecfal.db')), 'Source database must still exist');
    assert.ok(fs.existsSync(path.join(migSrc, 'thumbnails', 'cover_a.jpg')), 'Source thumbnail must still exist');
    assert.ok(fs.existsSync(path.join(migSrc, 'thumbnails', 'grid', 'thumb_grid_a.jpg')), 'Source grid thumbnail must still exist');
    assert.ok(fs.existsSync(path.join(migSrc, 'lecfal.log')), 'Source log must still exist');
    console.log('✓ Test M passed: Source data is strictly preserved and never deleted.');

    // ----------------------------------------------------
    // TEST N: Migration failure leaves source intact
    // ----------------------------------------------------
    console.log('\n--- Test N: Migration Failure Leaves Source Intact ---');
    const invalidTarget = '/dev/null/impossible_dir/data';
    const failResult = migrateStorage(migSrc, invalidTarget);
    assert.strictEqual(failResult.success, false, 'Migration to invalid target must fail cleanly');
    assert.ok(failResult.errors.length > 0, 'Failure result must report errors');
    assert.ok(fs.existsSync(path.join(migSrc, 'lecfal.db')), 'Source database remains untouched on failure');
    console.log('✓ Test N passed: Failed migration leaves source completely intact.');

    // ----------------------------------------------------
    // TEST O: No production module independently hardcodes ~/.config/lecfal
    // ----------------------------------------------------
    console.log('\n--- Test O: No Production Module Independently Hardcodes ~/.config/lecfal ---');
    const srcDir = path.resolve(__dirname, '..', '..', 'src');
    const prodFiles = [];

    function findJsFiles(dir) {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          findJsFiles(fullPath);
        } else if (item.isFile() && item.name.endsWith('.js') && !item.name.endsWith('.min.js')) {
          prodFiles.push(fullPath);
        }
      }
    }

    findJsFiles(srcDir);
    assert.ok(prodFiles.length > 5, 'Must have found production JS files in src/');

    const hardcodedOccurrences = [];
    for (const file of prodFiles) {
      const content = fs.readFileSync(file, 'utf8');
      // Strip block comments and line comments to check only executable code
      const codeWithoutComments = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      // Check for hardcoded string patterns reconstructing ~/.config/lecfal
      if (
        codeWithoutComments.includes('.config/lecfal') ||
        codeWithoutComments.includes('~/.config/lecfal')
      ) {
        hardcodedOccurrences.push({
          file: path.relative(path.resolve(__dirname, '..'), file)
        });
      }
    }

    assert.strictEqual(
      hardcodedOccurrences.length,
      0,
      `No production module may hardcode ~/.config/lecfal in executable code. Found: ${JSON.stringify(hardcodedOccurrences)}`
    );
    console.log('✓ Test O passed: Zero production modules independently hardcode ~/.config/lecfal.');

    console.log('\n======================================================');
    console.log('  ALL PHASE 5.1 STORAGE TESTS PASSED (A - O)');
    console.log('======================================================\n');
  } finally {
    try {
      fs.rmSync(rootTemp, { recursive: true, force: true });
    } catch (_) {}
  }
}

(async () => {
  try {
    await runStorageTests();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ STORAGE TEST FAILED:', err);
    process.exit(1);
  }
})();
