/**
 * Settings Module for LecFal Renderer
 * 
 * Manages the Settings view:
 * - Centralized catalog management (tags, authors, groups, languages, parodies)
 * - Metadata rename modal dialog
 * - Library folders configuration table
 * - Theme selection (dark/light)
 */

import { escapeHtml } from './ui-utils.js';

// ==================== LOCAL STATE ====================
let pendingRenameConfig = null; // { type, id, currentName, typeLabel }

// ==================== DOM ELEMENTS CACHE ====================
const elements = {
  // Tags
  formCreateTag: null,
  inputNewTagName: null,
  settingsTagsList: null,

  // Authors
  formCreateAuthor: null,
  inputNewAuthorName: null,
  settingsAuthorsList: null,

  // Groups
  formCreateGroup: null,
  inputNewGroupName: null,
  settingsGroupsList: null,

  // Languages
  formCreateLanguage: null,
  inputNewLanguageName: null,
  settingsLanguagesList: null,

  // Series / Parodies
  formCreateParody: null,
  inputNewParodyName: null,
  settingsParodiesList: null,

  // Appearance
  themeOptDark: null,
  themeOptLight: null,

  // Folders
  settingsFoldersList: null,
  btnSettingsScanAll: null,
  btnSettingsAddFolder: null,
  statusFolderCount: null,

  // Dedicated Rename Modal
  modalRenameMetadata: null,
  renameModalTitle: null,
  renameModalLabel: null,
  renameModalInput: null,
  renameModalError: null,
  btnCloseRenameModal: null,
  btnCancelRenameModal: null,
  btnConfirmRenameModal: null
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

// ==================== CATALOG CONFIGURATION ====================
const CATALOG_TYPES = {
  tag: {
    key: 'tag',
    typeLabel: 'Tag',
    listKey: 'settingsTagsList',
    formKey: 'formCreateTag',
    inputKey: 'inputNewTagName',
    btnClassSuffix: 'tag',
    fetchList: () => window.lecfalAPI.getAllTags(),
    create: (name) => window.lecfalAPI.createTag(name),
    rename: (id, name) => window.lecfalAPI.renameTag(id, name),
    delete: (id) => window.lecfalAPI.deleteTag(id),
    emptyTextTitle: 'No hay tags creados todavía.',
    emptyTextDesc: 'Usa el formulario superior para registrar tags y géneros para tu biblioteca.',
    emptyIcon: `<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>`,
    rowIcon: `<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>`,
    confirmDeleteMsg: (name) => `¿Eliminar el tag "${name}"?\nSe desvinculará de los mangas asignados de forma segura.`,
    createdMsg: (name) => `Tag "${name}" creado exitosamente`,
    deletedMsg: (name) => `Tag "${name}" eliminado`,
    renamedMsg: (name) => `Tag renombrado a "${name}"`
  },
  author: {
    key: 'author',
    typeLabel: 'Autor',
    listKey: 'settingsAuthorsList',
    formKey: 'formCreateAuthor',
    inputKey: 'inputNewAuthorName',
    btnClassSuffix: 'author',
    fetchList: () => window.lecfalAPI.getAllAuthors(),
    create: (name) => window.lecfalAPI.createAuthor(name),
    rename: (id, name) => window.lecfalAPI.renameAuthor(id, name),
    delete: (id) => window.lecfalAPI.deleteAuthor(id),
    emptyTextTitle: 'No hay autores registrados todavía.',
    emptyTextDesc: 'Añade autores oficiales para tu biblioteca usando el formulario superior.',
    emptyIcon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    rowIcon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    confirmDeleteMsg: (name) => `¿Eliminar el autor "${name}"?\nSe desvinculará de los mangas asignados de forma segura.`,
    createdMsg: (name) => `Autor "${name}" creado exitosamente`,
    deletedMsg: (name) => `Autor "${name}" eliminado`,
    renamedMsg: (name) => `Autor renombrado a "${name}"`
  },
  group: {
    key: 'group',
    typeLabel: 'Grupo',
    listKey: 'settingsGroupsList',
    formKey: 'formCreateGroup',
    inputKey: 'inputNewGroupName',
    btnClassSuffix: 'group',
    fetchList: () => window.lecfalAPI.getAllGroups(),
    create: (name) => window.lecfalAPI.createGroup(name),
    rename: (id, name) => window.lecfalAPI.renameGroup(id, name),
    delete: (id) => window.lecfalAPI.deleteGroup(id),
    emptyTextTitle: 'No hay grupos o círculos configurados todavía.',
    emptyTextDesc: 'Añade círculos, editoriales o grupos usando el formulario superior.',
    emptyIcon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    rowIcon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    confirmDeleteMsg: (name) => `¿Eliminar el grupo "${name}"?\nSe desvinculará de los mangas asignados de forma segura.`,
    createdMsg: (name) => `Grupo "${name}" creado exitosamente`,
    deletedMsg: (name) => `Grupo "${name}" eliminado`,
    renamedMsg: (name) => `Grupo renombrado a "${name}"`
  },
  language: {
    key: 'language',
    typeLabel: 'Idioma',
    listKey: 'settingsLanguagesList',
    formKey: 'formCreateLanguage',
    inputKey: 'inputNewLanguageName',
    btnClassSuffix: 'lang',
    fetchList: () => window.lecfalAPI.getAllLanguages(),
    create: (name) => window.lecfalAPI.createLanguage(name),
    rename: (id, name) => window.lecfalAPI.renameLanguage(id, name),
    delete: (id) => window.lecfalAPI.deleteLanguage(id),
    emptyTextTitle: 'No hay idiomas configurados todavía.',
    emptyTextDesc: 'Añade los idiomas disponibles para tu biblioteca usando el formulario superior.',
    emptyIcon: `<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"/>`,
    rowIcon: `<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>`,
    confirmDeleteMsg: (name) => `¿Eliminar el idioma "${name}"?\nSe desvinculará de los mangas asignados de forma segura.`,
    createdMsg: (name) => `Idioma "${name}" creado exitosamente`,
    deletedMsg: (name) => `Idioma "${name}" eliminado`,
    renamedMsg: (name) => `Idioma renombrado a "${name}"`
  },
  parody: {
    key: 'parody',
    typeLabel: 'Serie o Parodia',
    listKey: 'settingsParodiesList',
    formKey: 'formCreateParody',
    inputKey: 'inputNewParodyName',
    btnClassSuffix: 'parody',
    fetchList: () => window.lecfalAPI.getAllParodies(),
    create: (name) => window.lecfalAPI.createParody(name),
    rename: (id, name) => window.lecfalAPI.renameParody(id, name),
    delete: (id) => window.lecfalAPI.deleteParody(id),
    emptyTextTitle: 'No hay series o parodias registradas todavía.',
    emptyTextDesc: 'Añade series o parodias (ej. Original, Naruto) usando el formulario superior.',
    emptyIcon: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>`,
    rowIcon: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>`,
    confirmDeleteMsg: (name) => `¿Eliminar la serie o parodia "${name}"?\nSe desvinculará de los mangas asignados de forma segura.`,
    createdMsg: (name) => `Serie / Parodia "${name}" creada exitosamente`,
    deletedMsg: (name) => `Serie / Parodia "${name}" eliminada`,
    renamedMsg: (name) => `Serie / Parodia renombrada a "${name}"`
  }
};

/**
 * Render a single catalog list inside Settings.
 * @param {'tag'|'author'|'group'|'language'|'parody'} type
 */
async function renderSettingsCatalog(type) {
  const cfg = CATALOG_TYPES[type];
  if (!cfg) return;
  const listEl = elements[cfg.listKey];
  if (!listEl) return;

  try {
    const items = await cfg.fetchList();
    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="settings-tags-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:36px;height:36px;margin-bottom:8px;opacity:0.4;">
            ${cfg.emptyIcon}
          </svg>
          <p>${cfg.emptyTextTitle}</p>
          <span style="font-size:0.82rem; color:var(--text-muted);">${cfg.emptyTextDesc}</span>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'settings-tag-row';
      row.dataset.id = item.id;
      row.innerHTML = `
        <div class="tag-row-name">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--accent-purple-light);">
            ${cfg.rowIcon}
          </svg>
          <span class="tag-name-text">${escapeHtml(item.name)}</span>
          ${item.manga_count ? `<span class="settings-tag-count">${item.manga_count}</span>` : ''}
        </div>
        <div class="tag-row-actions">
          <button class="btn btn-secondary btn-sm btn-rename-${cfg.btnClassSuffix}" data-id="${item.id}" title="Renombrar ${cfg.typeLabel.toLowerCase()}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span>Renombrar</span>
          </button>
          <button class="btn btn-danger btn-sm btn-delete-${cfg.btnClassSuffix}" data-id="${item.id}" title="Eliminar ${cfg.typeLabel.toLowerCase()}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
            <span>Eliminar</span>
          </button>
        </div>
      `;

      row.querySelector(`.btn-rename-${cfg.btnClassSuffix}`).addEventListener('click', () => {
        openRenameModal({ type, id: item.id, currentName: item.name, typeLabel: cfg.typeLabel });
      });

      row.querySelector(`.btn-delete-${cfg.btnClassSuffix}`).addEventListener('click', async () => {
        if (confirm(cfg.confirmDeleteMsg(item.name))) {
          try {
            await cfg.delete(item.id);
            callbacks.showToast(cfg.deletedMsg(item.name));
            await renderSettingsCatalog(type);
            if (typeof callbacks.refreshAdvSearch === 'function') {
              await callbacks.refreshAdvSearch(type);
            }
            if (callbacks.getActiveSeries && callbacks.getActiveSeries()) {
              await callbacks.reloadActiveSeries();
            }
            if (typeof callbacks.refreshSeries === 'function') {
              callbacks.refreshSeries(false);
            }
          } catch (err) {
            callbacks.showToast(`Error: ${err.message}`);
          }
        }
      });

      fragment.appendChild(row);
    });

    listEl.innerHTML = '';
    listEl.appendChild(fragment);
  } catch (err) {
    console.error(`Error rendering settings ${type}:`, err);
  }
}

/**
 * Handle form creation of a new catalog item.
 * @param {'tag'|'author'|'group'|'language'|'parody'} type
 * @param {Event} e
 */
async function handleCreateCatalogItem(type, e) {
  if (e && e.preventDefault) e.preventDefault();
  const cfg = CATALOG_TYPES[type];
  if (!cfg) return;
  const inputEl = elements[cfg.inputKey];
  if (!inputEl) return;
  const name = inputEl.value.trim();
  if (!name) return;

  try {
    const newItem = await cfg.create(name);
    inputEl.value = '';
    callbacks.showToast(cfg.createdMsg(newItem.name));
    await renderSettingsCatalog(type);
    if (typeof callbacks.refreshAdvSearch === 'function') {
      await callbacks.refreshAdvSearch(type);
    }
    if (callbacks.getActiveSeries && callbacks.getActiveSeries()) {
      await callbacks.reloadActiveSeries();
    }
  } catch (err) {
    callbacks.showToast(`Error: ${err.message}`);
  }
}

// ==================== DEDICATED METADATA RENAME MODAL ====================
export function openRenameModal({ type, id, currentName, typeLabel }) {
  pendingRenameConfig = { type, id, currentName, typeLabel };
  if (elements.renameModalTitle) {
    elements.renameModalTitle.textContent = `Renombrar ${typeLabel || 'Metadato'}`;
  }
  if (elements.renameModalLabel) {
    elements.renameModalLabel.textContent = `Nuevo nombre para "${currentName}":`;
  }
  if (elements.renameModalInput) {
    elements.renameModalInput.value = currentName;
  }
  if (elements.renameModalError) {
    elements.renameModalError.textContent = '';
    elements.renameModalError.style.display = 'none';
  }
  if (elements.modalRenameMetadata) {
    elements.modalRenameMetadata.style.display = 'flex';
  }
  setTimeout(() => {
    if (elements.renameModalInput) {
      elements.renameModalInput.focus();
      elements.renameModalInput.select();
    }
  }, 50);
}

export function closeRenameModal() {
  if (elements.modalRenameMetadata) {
    elements.modalRenameMetadata.style.display = 'none';
  }
  pendingRenameConfig = null;
  if (elements.renameModalError) {
    elements.renameModalError.textContent = '';
    elements.renameModalError.style.display = 'none';
  }
}

export function isRenameModalOpen() {
  return !!(elements.modalRenameMetadata && elements.modalRenameMetadata.style.display !== 'none');
}

export async function handleConfirmRename() {
  if (!pendingRenameConfig) return;
  const { type, id, currentName } = pendingRenameConfig;
  const cfg = CATALOG_TYPES[type];
  if (!cfg) return;

  const newName = elements.renameModalInput ? elements.renameModalInput.value.trim() : '';

  if (!newName) {
    if (elements.renameModalError) {
      elements.renameModalError.textContent = 'El nombre no puede estar vacío.';
      elements.renameModalError.style.display = 'block';
    }
    return;
  }

  if (newName === currentName) {
    closeRenameModal();
    return;
  }

  try {
    await cfg.rename(id, newName);
    callbacks.showToast(cfg.renamedMsg(newName));
    await renderSettingsCatalog(type);
    if (typeof callbacks.refreshAdvSearch === 'function') {
      await callbacks.refreshAdvSearch(type);
    }
    closeRenameModal();

    if (callbacks.getActiveSeries && callbacks.getActiveSeries()) {
      await callbacks.reloadActiveSeries();
    }
    if (typeof callbacks.refreshSeries === 'function') {
      callbacks.refreshSeries(false);
    }
  } catch (err) {
    console.error('Error renaming metadata:', err);
    if (elements.renameModalError) {
      elements.renameModalError.textContent = err.message || 'Error al renombrar';
      elements.renameModalError.style.display = 'block';
    } else {
      callbacks.showToast(`Error: ${err.message}`);
    }
  }
}

// ==================== FOLDERS MANAGEMENT ====================
export async function renderSettingsFolders() {
  if (!elements.settingsFoldersList) return;
  try {
    const folders = await window.lecfalAPI.getFolders();
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
export async function renderSettingsTags() {
  return renderSettingsCatalog('tag');
}

export async function renderSettingsAuthors() {
  return renderSettingsCatalog('author');
}

export async function renderSettingsGroups() {
  return renderSettingsCatalog('group');
}

export async function renderSettingsLanguages() {
  return renderSettingsCatalog('language');
}

export async function renderSettingsParodies() {
  return renderSettingsCatalog('parody');
}

export async function renderAllSettings() {
  await Promise.all([
    renderSettingsCatalog('tag'),
    renderSettingsCatalog('author'),
    renderSettingsCatalog('group'),
    renderSettingsCatalog('language'),
    renderSettingsCatalog('parody'),
    renderSettingsFolders()
  ]);
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
  elements.formCreateTag = document.getElementById('formCreateTag');
  elements.inputNewTagName = document.getElementById('inputNewTagName');
  elements.settingsTagsList = document.getElementById('settingsTagsList');

  elements.formCreateAuthor = document.getElementById('formCreateAuthor');
  elements.inputNewAuthorName = document.getElementById('inputNewAuthorName');
  elements.settingsAuthorsList = document.getElementById('settingsAuthorsList');

  elements.formCreateGroup = document.getElementById('formCreateGroup');
  elements.inputNewGroupName = document.getElementById('inputNewGroupName');
  elements.settingsGroupsList = document.getElementById('settingsGroupsList');

  elements.formCreateLanguage = document.getElementById('formCreateLanguage');
  elements.inputNewLanguageName = document.getElementById('inputNewLanguageName');
  elements.settingsLanguagesList = document.getElementById('settingsLanguagesList');

  elements.formCreateParody = document.getElementById('formCreateParody');
  elements.inputNewParodyName = document.getElementById('inputNewParodyName');
  elements.settingsParodiesList = document.getElementById('settingsParodiesList');

  elements.themeOptDark = document.getElementById('themeOptDark');
  elements.themeOptLight = document.getElementById('themeOptLight');

  elements.settingsFoldersList = document.getElementById('settingsFoldersList');
  elements.btnSettingsScanAll = document.getElementById('btnSettingsScanAll');
  elements.btnSettingsAddFolder = document.getElementById('btnSettingsAddFolder');
  elements.statusFolderCount = document.getElementById('statusFolderCount');

  elements.modalRenameMetadata = document.getElementById('modalRenameMetadata');
  elements.renameModalTitle = document.getElementById('renameModalTitle');
  elements.renameModalLabel = document.getElementById('renameModalLabel');
  elements.renameModalInput = document.getElementById('renameModalInput');
  elements.renameModalError = document.getElementById('renameModalError');
  elements.btnCloseRenameModal = document.getElementById('btnCloseRenameModal');
  elements.btnCancelRenameModal = document.getElementById('btnCancelRenameModal');
  elements.btnConfirmRenameModal = document.getElementById('btnConfirmRenameModal');

  // Register form listeners
  elements.formCreateTag?.addEventListener('submit', (e) => handleCreateCatalogItem('tag', e));
  elements.formCreateAuthor?.addEventListener('submit', (e) => handleCreateCatalogItem('author', e));
  elements.formCreateGroup?.addEventListener('submit', (e) => handleCreateCatalogItem('group', e));
  elements.formCreateLanguage?.addEventListener('submit', (e) => handleCreateCatalogItem('language', e));
  elements.formCreateParody?.addEventListener('submit', (e) => handleCreateCatalogItem('parody', e));

  // Theme listeners
  elements.themeOptDark?.addEventListener('click', () => applyTheme('dark'));
  elements.themeOptLight?.addEventListener('click', () => applyTheme('light'));

  // Folder buttons
  elements.btnSettingsScanAll?.addEventListener('click', () => {
    if (typeof callbacks.runAllScan === 'function') {
      callbacks.runAllScan('incremental');
    }
  });
  elements.btnSettingsAddFolder?.addEventListener('click', async () => {
    if (typeof callbacks.onAddFolder === 'function') {
      await callbacks.onAddFolder();
    }
    await renderSettingsFolders();
  });

  // Dedicated Rename Modal listeners
  elements.btnCloseRenameModal?.addEventListener('click', closeRenameModal);
  elements.btnCancelRenameModal?.addEventListener('click', closeRenameModal);
  elements.btnConfirmRenameModal?.addEventListener('click', handleConfirmRename);
  elements.renameModalInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeRenameModal();
    }
  });
  elements.modalRenameMetadata?.addEventListener('click', (e) => {
    if (e.target === elements.modalRenameMetadata) {
      closeRenameModal();
    }
  });
}
