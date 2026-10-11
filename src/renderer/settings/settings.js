/**
 * Settings Module for LecFal Renderer
 * 
 * Manages the Settings view:
 * - Centralized catalog management (tags, authors, groups, languages, parodies)
 * - Metadata rename modal dialog
 * - Library folders configuration table
 * - Theme selection (dark/light)
 */

import { escapeHtml } from '../utils/ui-utils.js';

// ==================== DOM ELEMENTS CACHE ====================
const elements = {
  // Appearance
  themeOptDark: null,
  themeOptLight: null,

  // Libraries
  settingsLibrariesList: null,
  btnSettingsAddLibrary: null,
  btnSettingsRefreshLibraries: null,

  // Dedicated Create Library Modal
  modalCreateLibrary: null,
  createLibraryModalInput: null,
  createLibraryModalError: null,
  btnCloseCreateLibraryModal: null,
  btnCancelCreateLibraryModal: null,
  btnConfirmCreateLibraryModal: null,

  // Folders
  settingsFoldersList: null,
  btnSettingsScanAll: null,
  btnSettingsAddFolder: null,
  btnSettingsRefreshFolders: null,
  statusFolderCount: null,
  chkAutoPackageCbz: null,

  // Ignored Values
  settingsIgnoredAuthorsList: null,
  btnRefreshIgnoredAuthors: null
};

// ==================== EXTERNAL CALLBACKS ====================
let callbacks = {
  showToast: () => {},
  refreshSeries: () => {},
  refreshFolders: () => {},
  runFolderScan: () => {},
  runAllScan: () => {},
  getActiveSeries: () => null,
  reloadActiveSeries: () => {},
  refreshAdvSearch: () => {},
  onAddFolder: () => {}
};

// ==================== SHARED CATALOG MANAGER INTEGRATION ====================
import {
  initCatalogManager,
  renderCatalog,
  refreshCatalog,
  refreshAllCatalogs,
  setCatalogSearch,
  getCatalogSearch,
  getCatalogItems,
  openRenameModal,
  closeRenameModal,
  isRenameModalOpen,
  handleConfirmRename,
  CATALOG_CONFIGS
} from './catalog-manager.js';

import {
  renderAllCatalogs,
  renderAllCatalogsItems,
  setAllCatalogsSearch,
  setAllCatalogsFilter,
  setAllCatalogsSort,
  getAllCatalogsState,
  getUnifiedCatalogItems
} from './all-catalogs.js';

import {
  initStorageSettings,
  renderStorageSettings,
  getStorageSettingsState,
  openMigrateModal,
  closeMigrateModal,
  handleConfirmMigrate,
  openChangeModeModal,
  closeChangeModeModal,
  handleConfirmChangeMode
} from './storage-settings.js';

export {
  openRenameModal,
  closeRenameModal,
  isRenameModalOpen,
  handleConfirmRename,
  initCatalogManager,
  renderCatalog,
  refreshCatalog,
  refreshAllCatalogs,
  setCatalogSearch,
  getCatalogSearch,
  getCatalogItems,
  CATALOG_CONFIGS,
  renderAllCatalogs,
  renderAllCatalogsItems,
  setAllCatalogsSearch,
  setAllCatalogsFilter,
  setAllCatalogsSort,
  getAllCatalogsState,
  getUnifiedCatalogItems,
  initStorageSettings,
  renderStorageSettings,
  getStorageSettingsState,
  openMigrateModal,
  closeMigrateModal,
  handleConfirmMigrate,
  openChangeModeModal,
  closeChangeModeModal,
  handleConfirmChangeMode
};

// ==================== CREATE LIBRARY MODAL ====================
export function openCreateLibraryModal() {
  if (elements.createLibraryModalInput) {
    elements.createLibraryModalInput.value = '';
  }
  if (elements.createLibraryModalError) {
    elements.createLibraryModalError.textContent = '';
    elements.createLibraryModalError.style.display = 'none';
  }
  if (elements.modalCreateLibrary) {
    elements.modalCreateLibrary.style.display = 'flex';
  }
  setTimeout(() => {
    if (elements.createLibraryModalInput) {
      elements.createLibraryModalInput.focus();
    }
  }, 50);
}

export function closeCreateLibraryModal() {
  if (elements.modalCreateLibrary) {
    elements.modalCreateLibrary.style.display = 'none';
  }
  if (elements.createLibraryModalError) {
    elements.createLibraryModalError.textContent = '';
    elements.createLibraryModalError.style.display = 'none';
  }
}

export function isCreateLibraryModalOpen() {
  return !!(elements.modalCreateLibrary && elements.modalCreateLibrary.style.display !== 'none');
}

export async function handleConfirmCreateLibrary() {
  const name = elements.createLibraryModalInput ? elements.createLibraryModalInput.value.trim() : '';

  if (!name) {
    if (elements.createLibraryModalError) {
      elements.createLibraryModalError.textContent = 'El nombre de la biblioteca no puede estar vacío.';
      elements.createLibraryModalError.style.display = 'block';
    }
    return;
  }

  try {
    const newLib = await window.lecfalAPI.createLibrary(name);
    callbacks.showToast(`Biblioteca "${newLib.name}" creada exitosamente`);
    closeCreateLibraryModal();
    await renderSettingsLibraries();
    await renderSettingsFolders();
  } catch (err) {
    console.error('Error creating library:', err);
    if (elements.createLibraryModalError) {
      elements.createLibraryModalError.textContent = err.message || 'Error al crear la biblioteca';
      elements.createLibraryModalError.style.display = 'block';
    } else {
      callbacks.showToast(`Error: ${err.message}`);
    }
  }
}

// ==================== LIBRARIES MANAGEMENT ====================
export async function renderSettingsLibraries() {
  if (!elements.settingsLibrariesList) return;
  try {
    const libraries = await window.lecfalAPI.getAllLibraries();

    if (!libraries || libraries.length === 0) {
      elements.settingsLibrariesList.innerHTML = `
        <div class="settings-tags-empty">
          <span style="font-size: 2rem; margin-bottom: 8px;">📚</span>
          <p>No hay bibliotecas creadas.</p>
          <span style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 12px;">Crea una biblioteca para organizar tus carpetas escaneadas en colecciones independientes.</span>
          <button class="btn btn-primary btn-sm" id="btnEmptyAddLibrary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>+ Nueva biblioteca</span>
          </button>
        </div>
      `;
      const btnEmpty = elements.settingsLibrariesList.querySelector('#btnEmptyAddLibrary');
      btnEmpty?.addEventListener('click', openCreateLibraryModal);
      return;
    }

    const fragment = document.createDocumentFragment();

    libraries.forEach(lib => {
      const row = document.createElement('div');
      row.className = 'settings-folder-item settings-folder-row settings-library-row';
      row.dataset.id = lib.id;

      const folderCountText = lib.folder_count === 1 ? '1 carpeta' : `${lib.folder_count || 0} carpetas`;

      row.innerHTML = `
        <div class="settings-folder-main folder-row-main">
          <div class="settings-folder-title-row folder-row-title-line">
            <span class="settings-library-icon">📚</span>
            <span class="settings-folder-name folder-row-name">${escapeHtml(lib.name)}</span>
          </div>
          <div class="settings-folder-path folder-row-path" style="font-family: inherit; color: var(--text-muted);">
            ${folderCountText}
          </div>
        </div>
        <div class="settings-folder-actions folder-row-actions">
          <button class="btn btn-secondary btn-sm btn-rename-library" data-id="${lib.id}" title="Renombrar biblioteca">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span>Renombrar</span>
          </button>
          <button class="btn btn-danger btn-sm btn-delete-library" data-id="${lib.id}" title="Eliminar biblioteca">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
            <span>Eliminar</span>
          </button>
        </div>
      `;

      row.querySelector('.btn-rename-library').addEventListener('click', () => {
        openRenameModal({ type: 'library', id: lib.id, currentName: lib.name, typeLabel: 'Biblioteca' });
      });

      row.querySelector('.btn-delete-library').addEventListener('click', async () => {
        const msg = `¿Eliminar la biblioteca "${lib.name}"?\n\nLas carpetas y mangas no se eliminarán. Las carpetas quedarán sin biblioteca.`;
        if (confirm(msg)) {
          try {
            await window.lecfalAPI.deleteLibrary(lib.id);
            callbacks.showToast(`Biblioteca "${lib.name}" eliminada`);
            await renderSettingsLibraries();
            await renderSettingsFolders();
          } catch (err) {
            callbacks.showToast(`Error: ${err.message}`);
          }
        }
      });

      fragment.appendChild(row);
    });

    elements.settingsLibrariesList.innerHTML = '';
    elements.settingsLibrariesList.appendChild(fragment);
  } catch (err) {
    console.error('Error rendering settings libraries:', err);
  }
}

// ==================== AUTO-PACKAGE CBZ SETTING ====================
async function loadAutoPackageSetting() {
  if (!elements.chkAutoPackageCbz) return;
  try {
    const isEnabled = await window.lecfalAPI.getSetting('auto_package_cbz', true);
    elements.chkAutoPackageCbz.checked = isEnabled !== false;
  } catch (err) {
    console.error('Error loading auto_package_cbz setting:', err);
    elements.chkAutoPackageCbz.checked = true;
  }
}

// ==================== FOLDERS MANAGEMENT ====================
export async function renderSettingsFolders() {
  loadAutoPackageSetting();
  if (!elements.settingsFoldersList) return;
  try {
    const [folders, libraries] = await Promise.all([
      window.lecfalAPI.getFolders(),
      window.lecfalAPI.getAllLibraries()
    ]);

    if (elements.statusFolderCount) {
      elements.statusFolderCount.textContent = `${folders.length} carpeta${folders.length === 1 ? '' : 's'}`;
    }

    if (folders.length === 0) {
      elements.settingsFoldersList.innerHTML = `
        <div class="settings-folders-empty">
          <p>No hay carpetas registradas en la biblioteca.</p>
          <span style="font-size: 0.82rem; color: var(--text-muted);">Añade una carpeta para comenzar a escanear tus cómics y mangas.</span>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    folders.forEach(f => {
      const isAccessible = f.accessible !== false;
      const row = document.createElement('div');
      row.className = `settings-folder-item settings-folder-row ${isAccessible ? '' : 'is-unavailable'}`;
      row.dataset.id = f.id;

      const libraryOptions = (libraries || []).map(lib => `
        <option value="${lib.id}" ${Number(f.library_id) === Number(lib.id) ? 'selected' : ''}>
          ${escapeHtml(lib.name)}
        </option>
      `).join('');

      row.innerHTML = `
        <div class="settings-folder-main folder-row-main">
          <div class="settings-folder-title-row folder-row-title-line">
            <span class="settings-folder-name folder-row-name">${escapeHtml(f.name || f.path)}</span>
            ${isAccessible 
              ? '<span class="status-badge badge-accessible">Disponible</span>' 
              : '<span class="status-badge badge-unavailable">No disponible (desmontada/desconectada)</span>'
            }
          </div>
          <div class="settings-folder-path folder-row-path" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</div>
          ${!isAccessible 
            ? '<div class="folder-row-warning">El disco externo o volumen VeraCrypt no está montado en esta ruta. La carpeta se mantiene registrada pero no puede escanearse hasta que esté accesible.</div>' 
            : ''
          }
        </div>
        <div class="settings-folder-actions folder-row-actions">
          <div class="folder-library-assign select-container" title="Biblioteca asignada">
            <select class="folder-library-select" data-id="${f.id}">
              <option value="">Sin biblioteca</option>
              ${libraryOptions}
            </select>
            <svg class="select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </div>
          <button class="btn btn-secondary btn-sm btn-folder-scan-single" data-id="${f.id}" ${!isAccessible ? 'disabled title="Monta el disco o volumen para escanear"' : 'title="Escanear esta carpeta"'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 21h5v-5"/>
            </svg>
            <span>Escanear</span>
          </button>
          <button class="btn btn-danger btn-sm btn-folder-remove-settings" data-id="${f.id}" title="Desvincular carpeta de la biblioteca">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
            <span>Desvincular</span>
          </button>
        </div>
      `;

      const libSelect = row.querySelector('.folder-library-select');
      libSelect?.addEventListener('change', async (e) => {
        const selectedVal = e.target.value;
        const targetLibId = selectedVal ? parseInt(selectedVal, 10) : null;
        try {
          await window.lecfalAPI.assignFolderToLibrary(f.id, targetLibId);
          f.library_id = targetLibId;
          const assignedLib = (libraries || []).find(l => l.id === targetLibId);
          callbacks.showToast(targetLibId && assignedLib
            ? `Carpeta asignada a "${assignedLib.name}"`
            : 'Carpeta desvinculada de la biblioteca');
          await renderSettingsLibraries();
        } catch (err) {
          callbacks.showToast(`Error: ${err.message}`);
          await renderSettingsFolders();
        }
      });

      row.querySelector('.btn-folder-scan-single').addEventListener('click', async () => {
        if (typeof callbacks.runFolderScan === 'function') {
          await callbacks.runFolderScan(f.id);
        }
      });

      row.querySelector('.btn-folder-remove-settings').addEventListener('click', async () => {
        if (confirm(`¿Desvincular la carpeta "${f.name || f.path}" de la biblioteca? Los archivos en tu disco no serán borrados.`)) {
          try {
            await window.lecfalAPI.removeFolder(f.id);
            if (typeof callbacks.refreshFolders === 'function') {
              await callbacks.refreshFolders();
            }
            await renderSettingsFolders();
            await renderSettingsLibraries();
            if (typeof callbacks.refreshSeries === 'function') {
              await callbacks.refreshSeries();
            }
            callbacks.showToast('Carpeta desvinculada de la biblioteca');
          } catch (err) {
            console.error('Error removing folder:', err);
            callbacks.showToast('Error al desvincular carpeta');
          }
        }
      });

      fragment.appendChild(row);
    });

    elements.settingsFoldersList.innerHTML = '';
    elements.settingsFoldersList.appendChild(fragment);
  } catch (err) {
    console.error('Error rendering settings folders:', err);
  }
}

// ==================== THEME MANAGEMENT ====================
export function applyTheme(theme, save = true) {
  const finalTheme = theme === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = finalTheme;

  if (elements.themeOptDark && elements.themeOptLight) {
    elements.themeOptDark.classList.toggle('active', finalTheme === 'dark');
    elements.themeOptLight.classList.toggle('active', finalTheme === 'light');
    const darkBadge = elements.themeOptDark.querySelector('.theme-card-badge');
    const lightBadge = elements.themeOptLight.querySelector('.theme-card-badge');
    if (darkBadge) darkBadge.style.display = finalTheme === 'dark' ? 'inline-block' : 'none';
    if (lightBadge) lightBadge.style.display = finalTheme === 'light' ? 'inline-block' : 'none';
  }

  if (save) {
    window.lecfalAPI.setSetting('theme', finalTheme);
    if (typeof callbacks.showToast === 'function') {
      callbacks.showToast(`Tema cambiado a ${finalTheme === 'dark' ? 'Modo Oscuro' : 'Modo Claro'}`);
    }
  }
}

// ==================== PUBLIC RENDERERS ====================
export async function renderSettingsAuthors() {
  await renderCatalog('author');
  await renderSettingsIgnoredAuthors();
}

export async function renderSettingsIgnoredAuthors() {
  const listEl = elements.settingsIgnoredAuthorsList;
  if (!listEl) return;

  try {
    const items = await window.lecfalAPI.getAllIgnoredAuthors();
    if (!items || items.length === 0) {
      listEl.innerHTML = `
        <div class="settings-tags-empty" style="padding: 12px; width: 100%;">
          <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">No hay autores o valores ignorados actualmente.</p>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'settings-tag-item';
      row.dataset.id = item.id;
      row.innerHTML = `
        <span class="settings-tag-name">${escapeHtml(item.name)}</span>
        <div class="settings-tag-actions">
          <button type="button" class="btn btn-secondary btn-sm btn-restore-ignored" data-name="${escapeHtml(item.name)}" title="Restaurar sugerencia">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            <span>Restaurar</span>
          </button>
        </div>
      `;

      row.querySelector('.btn-restore-ignored').addEventListener('click', async () => {
        try {
          await window.lecfalAPI.unignoreAuthor(item.name);
          callbacks.showToast(`"${item.name}" restaurado`);
          await renderSettingsIgnoredAuthors();
          if (callbacks.getActiveSeries && callbacks.getActiveSeries()) {
            await callbacks.reloadActiveSeries();
          }
        } catch (err) {
          callbacks.showToast(`Error: ${err.message}`);
        }
      });

      fragment.appendChild(row);
    });

    listEl.innerHTML = '';
    listEl.appendChild(fragment);
  } catch (err) {
    console.error('Error rendering settings ignored authors:', err);
  }
}

export async function renderAllSettings({ forceRefresh = true } = {}) {
  if (forceRefresh) {
    await Promise.all([
      refreshCatalog('tag'),
      refreshCatalog('author'),
      refreshCatalog('group'),
      refreshCatalog('language'),
      refreshCatalog('parody'),
      renderSettingsLibraries(),
      renderSettingsFolders(),
      renderSettingsIgnoredAuthors(),
      renderAllCatalogs(),
      renderStorageSettings()
    ]);
  } else {
    await Promise.all([
      renderCatalog('tag'),
      renderCatalog('author'),
      renderCatalog('group'),
      renderCatalog('language'),
      renderCatalog('parody'),
      renderSettingsLibraries(),
      renderSettingsFolders(),
      renderSettingsIgnoredAuthors(),
      renderAllCatalogs(),
      renderStorageSettings()
    ]);
  }
}

// ==================== SETTINGS SECTION NAVIGATION ====================
let currentSettingsSection = 'sectionAppearance';

/**
 * Returns the currently active Settings section ID.
 * @returns {string}
 */
export function getCurrentSettingsSection() {
  return currentSettingsSection;
}

/**
 * Switches the active Settings section, updating the sidebar and displaying only the target section.
 * @param {string} sectionId - Target section ID (e.g. 'sectionLibraries')
 * @returns {string} The active section ID that was switched to
 */
export function switchSettingsSection(sectionId) {
  const targetId = sectionId || currentSettingsSection || 'sectionAppearance';

  const navItems = document.querySelectorAll('.settings-nav-item');
  const sections = document.querySelectorAll('.settings-section');

  let targetExists = false;
  sections.forEach((sec) => {
    if (sec.id === targetId) {
      targetExists = true;
    }
  });

  const finalSectionId = targetExists ? targetId : 'sectionAppearance';
  currentSettingsSection = finalSectionId;

  // 1. Update active sidebar item
  navItems.forEach((btn) => {
    const isTarget = btn.dataset.section === finalSectionId;
    btn.classList.toggle('active', isTarget);
    if (isTarget) {
      btn.setAttribute('aria-selected', 'true');
    } else {
      btn.removeAttribute('aria-selected');
    }
  });

  // 2. Hide every Settings section and show only the requested section
  sections.forEach((sec) => {
    if (sec.id === finalSectionId) {
      sec.style.display = 'flex';
      sec.classList.add('active');
    } else {
      sec.style.display = 'none';
      sec.classList.remove('active');
    }
  });

  // 3. Keep section data freshly loaded on navigation switch
  const sectionCatalogMap = {
    sectionAuthors: 'author',
    sectionTags: 'tag',
    sectionLanguages: 'language',
    sectionParodies: 'parody',
    sectionGroups: 'group'
  };

  if (sectionCatalogMap[finalSectionId]) {
    refreshCatalog(sectionCatalogMap[finalSectionId]);
  } else if (finalSectionId === 'sectionAllCatalogs') {
    renderAllCatalogs();
  } else if (finalSectionId === 'sectionStorage') {
    renderStorageSettings();
  } else if (finalSectionId === 'sectionLibraries') {
    renderSettingsLibraries();
  } else if (finalSectionId === 'sectionFolders') {
    renderSettingsFolders();
  } else if (finalSectionId === 'sectionIgnoredAuthors') {
    renderSettingsIgnoredAuthors();
  }

  // 4. Reset scroll of content area to top
  const contentArea = document.getElementById('settingsContent');
  if (contentArea) {
    contentArea.scrollTop = 0;
  }

  return finalSectionId;
}

// ==================== INITIALIZATION ====================
/**
 * Initialize Settings module DOM elements and listeners.
 * @param {Object} options
 * @param {Function} options.showToast - Toast notification display
 * @param {Function} options.refreshSeries - Library grid refresh
 * @param {Function} options.refreshFolders - Refresh folders list
 * @param {Function} options.runFolderScan - Scan single folder
 * @param {Function} options.runAllScan - Scan all folders
 * @param {Function} options.getActiveSeries - Active series getter
 * @param {Function} options.reloadActiveSeries - Reload active series detail
 * @param {Function} options.refreshAdvSearch - Refresh adv search dropdown for given type
 * @param {Function} options.onAddFolder - Handler for adding a new folder
 */
export function initSettings(options = {}) {
  callbacks = {
    showToast: options.showToast || (() => {}),
    refreshSeries: options.refreshSeries || (() => {}),
    refreshFolders: options.refreshFolders || (() => {}),
    runFolderScan: options.runFolderScan || (() => {}),
    runAllScan: options.runAllScan || (() => {}),
    getActiveSeries: options.getActiveSeries || (() => null),
    reloadActiveSeries: options.reloadActiveSeries || (() => {}),
    refreshAdvSearch: options.refreshAdvSearch || (() => {}),
    onAddFolder: options.onAddFolder || (() => {})
  };

  // Cache DOM elements
  elements.themeOptDark = document.getElementById('themeOptDark');
  elements.themeOptLight = document.getElementById('themeOptLight');

  // Libraries
  elements.settingsLibrariesList = document.getElementById('settingsLibrariesList');
  elements.btnSettingsAddLibrary = document.getElementById('btnSettingsAddLibrary');
  elements.btnSettingsRefreshLibraries = document.getElementById('btnSettingsRefreshLibraries');

  // Dedicated Create Library Modal
  elements.modalCreateLibrary = document.getElementById('modalCreateLibrary');
  elements.createLibraryModalInput = document.getElementById('createLibraryModalInput');
  elements.createLibraryModalError = document.getElementById('createLibraryModalError');
  elements.btnCloseCreateLibraryModal = document.getElementById('btnCloseCreateLibraryModal');
  elements.btnCancelCreateLibraryModal = document.getElementById('btnCancelCreateLibraryModal');
  elements.btnConfirmCreateLibraryModal = document.getElementById('btnConfirmCreateLibraryModal');

  // Folders
  elements.settingsFoldersList = document.getElementById('settingsFoldersList');
  elements.btnSettingsScanAll = document.getElementById('btnSettingsScanAll');
  elements.btnSettingsAddFolder = document.getElementById('btnSettingsAddFolder');
  elements.btnSettingsRefreshFolders = document.getElementById('btnSettingsRefreshFolders');
  elements.statusFolderCount = document.getElementById('statusFolderCount');
  elements.settingsIgnoredAuthorsList = document.getElementById('settingsIgnoredAuthorsList');
  elements.btnRefreshIgnoredAuthors = document.getElementById('btnRefreshIgnoredAuthors');
  elements.chkAutoPackageCbz = document.getElementById('chkAutoPackageCbz');

  // Auto-package loose images to CBZ setting
  loadAutoPackageSetting();
  elements.chkAutoPackageCbz?.addEventListener('change', async (e) => {
    try {
      await window.lecfalAPI.setSetting('auto_package_cbz', e.target.checked);
      callbacks.showToast(e.target.checked
        ? 'Auto-empaquetado a CBZ activado'
        : 'Auto-empaquetado a CBZ desactivado'
      );
    } catch (err) {
      console.error('Error saving auto_package_cbz setting:', err);
      callbacks.showToast('Error al guardar la preferencia');
    }
  });

  // Theme listeners
  elements.themeOptDark?.addEventListener('click', () => applyTheme('dark'));
  elements.themeOptLight?.addEventListener('click', () => applyTheme('light'));

  // Library buttons & modal listeners
  elements.btnSettingsAddLibrary?.addEventListener('click', openCreateLibraryModal);
  elements.btnSettingsRefreshLibraries?.addEventListener('click', async () => {
    const btn = elements.btnSettingsRefreshLibraries;
    btn.disabled = true;
    const svg = btn.querySelector('svg');
    if (svg) svg.classList.add('spin-icon');
    try {
      await renderSettingsLibraries();
      callbacks.showToast('Bibliotecas actualizadas');
    } catch (err) {
      console.error('Error refreshing libraries:', err);
    } finally {
      if (svg) svg.classList.remove('spin-icon');
      btn.disabled = false;
    }
  });

  elements.btnCloseCreateLibraryModal?.addEventListener('click', closeCreateLibraryModal);
  elements.btnCancelCreateLibraryModal?.addEventListener('click', closeCreateLibraryModal);
  elements.btnConfirmCreateLibraryModal?.addEventListener('click', handleConfirmCreateLibrary);
  elements.createLibraryModalInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmCreateLibrary();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCreateLibraryModal();
    }
  });
  elements.modalCreateLibrary?.addEventListener('click', (e) => {
    if (e.target === elements.modalCreateLibrary) {
      closeCreateLibraryModal();
    }
  });

  // Folder buttons
  elements.btnSettingsScanAll?.addEventListener('click', () => {
    if (typeof callbacks.runAllScan === 'function') {
      callbacks.runAllScan('incremental');
    }
  });
  elements.btnSettingsRefreshFolders?.addEventListener('click', async () => {
    const btn = elements.btnSettingsRefreshFolders;
    btn.disabled = true;
    const svg = btn.querySelector('svg');
    if (svg) svg.classList.add('spin-icon');
    try {
      await renderSettingsFolders();
      if (typeof callbacks.refreshFolders === 'function') {
        await callbacks.refreshFolders();
      }
      callbacks.showToast('Carpetas actualizadas');
    } catch (err) {
      console.error('Error refreshing folders:', err);
    } finally {
      if (svg) svg.classList.remove('spin-icon');
      btn.disabled = false;
    }
  });
  elements.btnSettingsAddFolder?.addEventListener('click', async () => {
    if (typeof callbacks.onAddFolder === 'function') {
      await callbacks.onAddFolder();
    }
    await renderSettingsFolders();
    await renderSettingsLibraries();
  });

  // Ignored authors refresh button
  elements.btnRefreshIgnoredAuthors?.addEventListener('click', async () => {
    const btn = elements.btnRefreshIgnoredAuthors;
    btn.disabled = true;
    const svg = btn.querySelector('svg');
    if (svg) svg.classList.add('spin-icon');
    try {
      await renderSettingsIgnoredAuthors();
      callbacks.showToast('Valores ignorados actualizados');
    } catch (err) {
      console.error('Error refreshing ignored authors:', err);
    } finally {
      if (svg) svg.classList.remove('spin-icon');
      btn.disabled = false;
    }
  });

  // Settings Sidebar navigation listeners
  const navItems = document.querySelectorAll('.settings-nav-item');
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const sectionId = btn.dataset.section;
      if (sectionId) {
        switchSettingsSection(sectionId);
      }
    });
  });

  // Initialize Shared Catalog Manager
  initCatalogManager({
    showToast: callbacks.showToast,
    refreshAdvSearch: callbacks.refreshAdvSearch,
    reloadActiveSeries: callbacks.reloadActiveSeries,
    refreshSeries: callbacks.refreshSeries,
    onRenameLibrary: async () => {
      await renderSettingsLibraries();
      await renderSettingsFolders();
    }
  });

  // Initialize Storage Settings Module
  initStorageSettings({
    showToast: callbacks.showToast
  });

  // Ensure initial active section is properly activated
  switchSettingsSection(currentSettingsSection);

  // Expose navigation helpers globally for testing and inter-module access
  window.switchSettingsSection = switchSettingsSection;
  window.getCurrentSettingsSection = getCurrentSettingsSection;
  window.renderAllCatalogs = renderAllCatalogs;
  window.renderStorageSettings = renderStorageSettings;
  window.renderSettingsIgnoredAuthors = renderSettingsIgnoredAuthors;
  window.renderSettingsLibraries = renderSettingsLibraries;
  window.renderSettingsFolders = renderSettingsFolders;
  window.renderAllSettings = renderAllSettings;
  window.refreshCatalog = refreshCatalog;
  window.refreshAllCatalogs = refreshAllCatalogs;
}


