/**
 * LecFal Canonical Test Suite Runner
 *
 * Runs the permanent, verified regression tests:
 * 1. Scanner E2E Tests (isolated temp environment)
 * 2. Reader Persistent Reading Position Suite (Phase 4.1, 50 checks)
 * 3. Reader UX & Progress Badges Suite (Phase 4.2, 56 checks)
 * 4. Library UX, Grid Virtualization & Soak Suite (Phase 5.6, 10 checks)
 */

const { spawn } = require('child_process');
const path = require('path');

const tests = [
  {
    name: 'Scanner E2E Isolation Tests',
    cmd: process.execPath, // node
    args: [path.join(__dirname, 'scanner', 'test_scanner_e2e.js')]
  },
  {
    name: 'Phase 7.1 Catalog Autocomplete Tests',
    cmd: process.execPath, // node
    args: [path.join(__dirname, 'phase71', 'test_catalog_autocomplete.js')]
  },
  {
    name: 'Advanced Search Boolean Semantics Tests',
    cmd: process.execPath, // node
    args: [path.join(__dirname, 'test_advanced_search_semantics.js')]
  },
  {
    name: 'Ignored Authors Detection & Precedence Tests',
    cmd: process.execPath, // node
    args: [path.join(__dirname, 'test_ignored_authors.js')]
  },
  {
    name: 'Phase 1 Library Backend & Data Model Tests',
    cmd: process.execPath, // node
    args: [path.join(__dirname, 'test_libraries.js')]
  },
  {
    name: 'Phase 2 Library Settings UI & Management Tests',
    cmd: process.execPath, // node
    args: [path.join(__dirname, 'test_settings_libraries.js')]
  },
  {
    name: 'Phase 3 Library Toolbar & Filtering Tests',
    cmd: process.execPath, // node
    args: [path.join(__dirname, 'test_toolbar_libraries.js')]
  },
  {
    name: 'Reader Persistent Reading Position Suite',
    cmd: 'npx',
    args: ['electron', path.join(__dirname, 'phase41', 'test_reader_position.js')]
  },
  {
    name: 'Reader UX & Invariants Suite',
    cmd: 'npx',
    args: ['electron', path.join(__dirname, 'phase42', 'test_reader_ux.js')]
  },
  {
    name: 'Library Grid Virtualization & UX Suite',
    cmd: 'npx',
    args: ['electron', path.join(__dirname, 'phase56', 'test_library_ux.js')]
  },
  {
    name: 'Advanced Search Result Rendering & Race Guard Suite',
    cmd: 'npx',
    args: ['electron', path.join(__dirname, 'test_advanced_search_results.js')]
  },
  {
    name: 'Settings UI Redesign Phase 1 Navigation Suite',
    cmd: 'npx',
    args: ['electron', path.join(__dirname, 'test_settings_navigation.js')]
  },
  {
    name: 'Settings UI Redesign Phase 2 Catalog Manager Suite',
    cmd: 'npx',
    args: ['electron', path.join(__dirname, 'test_settings_catalog_manager.js')]
  },
  {
    name: 'Settings UI Redesign Phase 3 All Catalogs Suite',
    cmd: 'npx',
    args: ['electron', path.join(__dirname, 'test_settings_all_catalogs.js')]
  },
  {
    name: 'Settings UI Redesign Phase 4 UX Polish Suite',
    cmd: 'npx',
    args: ['electron', path.join(__dirname, 'test_settings_ux_polish.js')]
  },
  {
    name: 'Storage & Portability Isolation Suite (Phase 5.1)',
    cmd: process.execPath,
    args: [path.join(__dirname, 'test_storage.js')]
  },
  {
    name: 'Storage & Portability Settings UI Suite (Phase 5.2)',
    cmd: 'npx',
    args: ['electron', path.join(__dirname, 'test_storage_settings.js')]
  }
];

async function runTest(testItem) {
  return new Promise((resolve) => {
    console.log(`\n======================================================`);
    console.log(`RUNNING: ${testItem.name}`);
    console.log(`======================================================`);

    const proc = spawn(testItem.cmd, testItem.args, {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    proc.on('close', (code) => {
      resolve({ name: testItem.name, code });
    });

    proc.on('error', (err) => {
      console.error(`Failed to start ${testItem.name}:`, err);
      resolve({ name: testItem.name, code: 1, error: err });
    });
  });
}

async function main() {
  console.log(`======================================================`);
  console.log(`  LECFAL CANONICAL REGRESSION SUITE RUNNER`);
  console.log(`======================================================`);

  const results = [];
  for (const t of tests) {
    const res = await runTest(t);
    results.push(res);
    if (res.code !== 0) {
      console.error(`\n❌ ${t.name} failed with code ${res.code}`);
    } else {
      console.log(`\n✓ ${t.name} passed successfully.`);
    }
  }

  console.log(`\n======================================================`);
  console.log(`  TEST RESULTS SUMMARY`);
  console.log(`======================================================`);
  let allPassed = true;
  results.forEach(r => {
    const status = r.code === 0 ? 'PASS' : 'FAIL';
    if (r.code !== 0) allPassed = false;
    console.log(`  [${status}] ${r.name}`);
  });

  if (allPassed) {
    console.log(`\nALL CANONICAL TESTS PASSED PERFECTLY!\n`);
    process.exit(0);
  } else {
    console.error(`\nSOME TESTS FAILED.\n`);
    process.exit(1);
  }
}

main();
