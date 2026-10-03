/**
 * Manga Detail & Chapter Management Module for LecFal
 * 
 * Encapsulates Manga Detail view rendering, hero metadata, metadata chip management,
 * chapter list virtualization/rendering, chapter search/filtering/sorting, reading progress tracking,
 * and the metadata field edit modal.
 */

import {
  escapeHtml,
  formatBytes,
  showToast,
  updateFavButtonState,
  getCoverUrl
} from '../utils/ui-utils.js';

// ==================== DOM ELEMENTS ====================
// Manga Detail Hero & Controls
const btnBackToLibrary = document.getElementById('btnBackToLibrary');
const btnOpenMangaFolder = document.getElementById('btnOpenMangaFolder');
const btnToggleMarkAllRead = document.getElementById('btnToggleMarkAllRead');
const btnMarkAllText = document.getElementById('btnMarkAllText');

const mangaHeroCoverImg = document.getElementById('mangaHeroCoverImg');
const mangaHeroFormatBadge = document.getElementById('mangaHeroFormatBadge');
const mangaHeroTitle = document.getElementById('mangaHeroTitle');
const btnEditTitle = document.getElementById('btnEditTitle');
const btnMangaFav = document.getElementById('btnMangaFav');

const mangaAuthorsList = document.getElementById('mangaAuthorsList');
const btnAddAuthor = document.getElementById('btnAddAuthor');
const detectedAuthorHint = document.getElementById('detectedAuthorHint');

const mangaGroupsList = document.getElementById('mangaGroupsList');
const btnAddGroup = document.getElementById('btnAddGroup');

const mangaParodiesList = document.getElementById('mangaParodiesList');
const btnAddParody = document.getElementById('btnAddParody');

const mangaLanguagesList = document.getElementById('mangaLanguagesList');
const btnAddLanguage = document.getElementById('btnAddLanguage');

const mangaTagsList = document.getElementById('mangaTagsList');
const btnAddTag = document.getElementById('btnAddTag');

const mangaHeroDesc = document.getElementById('mangaHeroDesc');
const btnEditDesc = document.getElementById('btnEditDesc');
const descEditorContainer = document.getElementById('descEditorContainer');
const descEditTextArea = document.getElementById('descEditTextArea');
const btnCancelEditDesc = document.getElementById('btnCancelEditDesc');
const btnSaveEditDesc = document.getElementById('btnSaveEditDesc');

const btnStartReading = document.getElementById('btnStartReading');
const btnStartReadingText = document.getElementById('btnStartReadingText');

// Chapters Elements
const chaptersCountBadge = document.getElementById('chaptersCountBadge');
const chaptersReadBadge = document.getElementById('chaptersReadBadge');
const chapterFilterInput = document.getElementById('chapterFilterInput');
const btnToggleChapterSort = document.getElementById('btnToggleChapterSort');
const chapterSortLabel = document.getElementById('chapterSortLabel');
const chaptersList = document.getElementById('chaptersList');

// Edit Field Modal
const modalEditField = document.getElementById('modalEditField');
const editFieldModalTitle = document.getElementById('editFieldModalTitle');
const editFieldLabel = document.getElementById('editFieldLabel');
const editFieldInput = document.getElementById('editFieldInput');
const btnCloseEditFieldModal = document.getElementById('btnCloseEditFieldModal');
const btnCancelEditField = document.getElementById('btnCancelEditField');
const btnSaveEditField = document.getElementById('btnSaveEditField');

// Delete Manga Controls & Modals
const btnDeleteManga = document.getElementById('btnDeleteManga');

const modalDeleteMangaChoice = document.getElementById('modalDeleteMangaChoice');
const btnCloseDeleteMangaChoice = document.getElementById('btnCloseDeleteMangaChoice');
const btnCancelDeleteChoice = document.getElementById('btnCancelDeleteChoice');
const btnConfirmRemoveFromLibrary = document.getElementById('btnConfirmRemoveFromLibrary');
const btnChooseDeletePermanently = document.getElementById('btnChooseDeletePermanently');

const modalConfirmDeletePermanently = document.getElementById('modalConfirmDeletePermanently');
const btnClosePermanentDelete = document.getElementById('btnClosePermanentDelete');
const btnCancelPermanentDelete = document.getElementById('btnCancelPermanentDelete');
const btnConfirmPermanentDelete = document.getElementById('btnConfirmPermanentDelete');
const permanentDeleteMangaTitle = document.getElementById('permanentDeleteMangaTitle');
const permanentDeleteChapterCount = document.getElementById('permanentDeleteChapterCount');
const permanentDeleteSize = document.getElementById('permanentDeleteSize');
const permanentDeleteError = document.getElementById('permanentDeleteError');

// ==================== MODULE STATE ====================
let activeSeries = null;
let activeChapters = [];
let currentChapterSort = 'asc'; // 'asc' or 'desc'
let chapterFilterText = '';
let currentEditField = null; // 'title' | 'author'

let callbacks = {
  navigateToLibrary: null,
  openReader: null,
  refreshSeries: null,
  openCatalogPicker: null,
  refreshAdvSearch: null,
  showToast: null
};

function toast(msg) {
  if (callbacks.showToast) {
    callbacks.showToast(msg);
  } else {
    showToast(msg);
  }
}

// ==================== METADATA CONFIGURATION ====================
const DETAIL_METADATA_CONFIG = {
  author: {
    listEl: mangaAuthorsList,
    listProp: 'authors_list',
    textProp: 'author',
    emptyText: (s) => s.author || 'Desconocido',
    removeIpc: 'setSeriesAuthors',
    idsParam: 'authorIds',
    formatDisplay: (updated) => (updated.length > 0 ? updated.map(a => a.name).join(', ') : 'Desconocido'),
    removeToast: 'Autor desvinculado de este manga'
  },
  group: {
    listEl: mangaGroupsList,
    listProp: 'groups_list',
    textProp: 'group',
    emptyText: (s) => s.group_name || s.group || 'Sin grupo / círculo',
    removeIpc: 'setSeriesGroups',
    idsParam: 'groupIds',
    formatDisplay: (updated) => (updated.length > 0 ? updated.map(g => g.name).join(', ') : 'Sin grupo / círculo'),
    extraUpdate: (s, display) => { s.group_name = display; },
    removeToast: 'Grupo desvinculado de este manga'
  },
  parody: {
    listEl: mangaParodiesList,
    listProp: 'parodies_list',
    textProp: 'parody',
    emptyText: (s) => s.parody || 'Sin serie / parodia',
    removeIpc: 'setSeriesParodies',
    idsParam: 'parodyIds',
    formatDisplay: (updated) => updated.map(p => p.name).join(', '),
    removeToast: 'Serie / Parodia desvinculada de este manga'
  },
  language: {
    listEl: mangaLanguagesList,
    listProp: 'languages_list',
    textProp: 'language',
    emptyText: (s) => s.language || 'Sin idioma asignado',
    removeIpc: 'setSeriesLanguages',
    idsParam: 'languageIds',
    formatDisplay: (updated) => updated.map(l => l.name).join(', '),
    removeToast: 'Idioma desvinculado de este manga'
  }
};

// ==================== STATE GETTERS / SETTERS ====================
export function getActiveSeries() {
  return activeSeries;
}

export function setActiveSeries(series) {
  activeSeries = series;
}

export function clearActiveSeries() {
  activeSeries = null;
  activeChapters = [];
}

export function getActiveChapters() {
  return activeChapters;
}

// ==================== DETAIL RENDERING ====================
/**
 * Load and render complete detail view for a specific series.
 * @param {number|string} seriesId 
 */
export async function renderMangaDetail(seriesId) {
  const data = await window.lecfalAPI.getSeriesDetail({
    seriesId,
    sortOrder: currentChapterSort
  });

  if (!data) {
    toast('No se pudo cargar la información del manga');
    callbacks.navigateToLibrary?.();
    return;
  }

  activeSeries = data;
  activeChapters = data.chapters || [];
  chapterFilterText = '';
  if (chapterFilterInput) chapterFilterInput.value = '';

  // Render hero
  if (mangaHeroTitle) mangaHeroTitle.textContent = activeSeries.title;
  if (mangaHeroDesc) mangaHeroDesc.textContent = activeSeries.description || 'Sin descripción';
  if (mangaHeroFormatBadge) {
    mangaHeroFormatBadge.textContent = (activeSeries.primary_format || 'CBZ').toUpperCase();
    mangaHeroFormatBadge.className = `manga-hero-format-badge badge-${activeSeries.primary_format || 'cbz'}`;
  }

  if (activeSeries.cover_path) {
    if (mangaHeroCoverImg) {
      mangaHeroCoverImg.src = getCoverUrl(activeSeries.cover_path);
      mangaHeroCoverImg.style.display = 'block';
      mangaHeroCoverImg.onerror = () => {
        console.warn(`[LecFal UI] Fallo al cargar portada hero para "${activeSeries.title}" (${activeSeries.cover_path})`);
        mangaHeroCoverImg.style.display = 'none';
      };
    }
  } else {
    if (mangaHeroCoverImg) mangaHeroCoverImg.style.display = 'none';
  }

  if (btnMangaFav) {
    updateFavButtonState(btnMangaFav, activeSeries.favorite === 1);
  }

  // Render metadata chips
  renderMangaAuthorsFromSeries(activeSeries);
  renderMangaGroupsFromSeries(activeSeries);
  renderMangaParodiesFromSeries(activeSeries);
  renderMangaLanguagesFromSeries(activeSeries);
  renderMangaTagsFromSeries(activeSeries);

  // Render chapters
  renderChaptersList();
  updateChapterCounters();

  // Scroll to top
  const scrollable = document.querySelector('.manga-view-scrollable');
  if (scrollable) scrollable.scrollTop = 0;
}

/**
 * Reload activeSeries from DB in-place without resetting scroll position.
 */
export async function reloadActiveSeries() {
  if (!activeSeries) return;
  const data = await window.lecfalAPI.getSeriesDetail({
    seriesId: activeSeries.id,
    sortOrder: currentChapterSort
  });
  if (data) {
    activeSeries = data;
    activeChapters = data.chapters || [];
    renderMangaAuthorsFromSeries(activeSeries);
    renderMangaGroupsFromSeries(activeSeries);
    renderMangaParodiesFromSeries(activeSeries);
    renderMangaLanguagesFromSeries(activeSeries);
    renderMangaTagsFromSeries(activeSeries);
    renderChaptersList();
    updateChapterCounters();
  }
}

// ==================== METADATA CHIPS LOGIC ====================
/**
 * Update metadata chips in Manga Detail view for a given catalog type.
 * @param {string} type - 'tag' | 'author' | 'group' | 'language' | 'parody'
 * @param {Object} [series] - Optional series object; defaults to activeSeries
 */
export function updateDetailMetadata(type, series = activeSeries) {
  if (!series) return;
  if (type === 'tag') {
    renderMangaTagsFromSeries(series);
  } else if (DETAIL_METADATA_CONFIG[type]) {
    renderMetadataChips(type, series);
  }
}

function renderMetadataChips(type, series) {
  const cfg = DETAIL_METADATA_CONFIG[type];
  if (!cfg || !cfg.listEl) return;
  cfg.listEl.innerHTML = '';
  const items = series[cfg.listProp] || [];

  if (items.length === 0) {
    const emptySpan = document.createElement('span');
    emptySpan.textContent = cfg.emptyText(series);
    emptySpan.style.color = 'var(--text-muted)';
    emptySpan.style.fontSize = '0.85rem';
    cfg.listEl.appendChild(emptySpan);
  } else {
    items.forEach(item => {
      const chip = document.createElement('span');
      chip.className = 'manga-meta-chip';
      chip.innerHTML = `
        <span>${escapeHtml(item.name)}</span>
        <button class="btn-remove-chip" data-id="${item.id}" title="Eliminar de este manga">×</button>
      `;
      chip.querySelector('.btn-remove-chip').addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleRemoveMetadataItem(type, item.id);
      });
      cfg.listEl.appendChild(chip);
    });
  }

  // Handle detected author hint specifically for authors
  if (type === 'author') {
    renderDetectedAuthorHint(series, items);
  }
}

async function handleRemoveMetadataItem(type, itemId) {
  if (!activeSeries) return;
  const cfg = DETAIL_METADATA_CONFIG[type];
  if (!cfg) return;

  const currentList = activeSeries[cfg.listProp] || [];
  const remainingIds = currentList.filter(item => item.id !== itemId).map(item => item.id);
  const updated = await window.lecfalAPI[cfg.removeIpc]({
    seriesId: activeSeries.id,
    [cfg.idsParam]: remainingIds
  });

  activeSeries[cfg.listProp] = updated;
  const displayVal = cfg.formatDisplay(updated);
  activeSeries[cfg.textProp] = displayVal;
  if (cfg.extraUpdate) {
    cfg.extraUpdate(activeSeries, displayVal);
  }

  renderMetadataChips(type, activeSeries);
  callbacks.refreshSeries?.();
  toast(cfg.removeToast);
}

function renderDetectedAuthorHint(series, authors) {
  if (!detectedAuthorHint) return;
  const detected = (series.detected_author || '').trim();
  const alreadyAssigned = authors.some(a => a.name.toLowerCase() === detected.toLowerCase());
  if (detected && !alreadyAssigned && !series.is_author_ignored) {
    detectedAuthorHint.innerHTML = `
      <span>Detectado en carpeta: <strong>"${escapeHtml(detected)}"</strong></span>
      <button type="button" class="hint-btn" id="btnQuickAddDetectedAuthor">Añadir a Ajustes</button>
      <button type="button" class="hint-btn hint-btn-ignore" id="btnIgnoreDetectedAuthor">Ignorar</button>
    `;
    detectedAuthorHint.style.display = 'inline-flex';
    const btnQuick = detectedAuthorHint.querySelector('#btnQuickAddDetectedAuthor');
    if (btnQuick) {
      btnQuick.addEventListener('click', async () => {
        try {
          await window.lecfalAPI.createAuthor(detected);
          toast(`Autor "${detected}" creado y asignado`);
          await reloadActiveSeries();
          callbacks.refreshAdvSearch?.();
        } catch (err) {
          toast(err.message);
        }
      });
    }
    const btnIgnore = detectedAuthorHint.querySelector('#btnIgnoreDetectedAuthor');
    if (btnIgnore) {
      btnIgnore.addEventListener('click', async () => {
        try {
          await window.lecfalAPI.ignoreAuthor(detected);
          series.is_author_ignored = true;
          toast(`"${detected}" ignorado`);
          detectedAuthorHint.style.display = 'none';
          detectedAuthorHint.innerHTML = '';
        } catch (err) {
          toast(err.message);
        }
      });
    }
  } else {
    detectedAuthorHint.style.display = 'none';
    detectedAuthorHint.innerHTML = '';
  }
}

export function renderMangaAuthorsFromSeries(series) {
  renderMetadataChips('author', series);
}

export function renderMangaGroupsFromSeries(series) {
  renderMetadataChips('group', series);
}

export function renderMangaParodiesFromSeries(series) {
  renderMetadataChips('parody', series);
}

export function renderMangaLanguagesFromSeries(series) {
  renderMetadataChips('language', series);
}

export function renderMangaTagsFromSeries(series) {
  if (!mangaTagsList) return;
  mangaTagsList.innerHTML = '';
  let tags = [];
  if (series.tags_list && Array.isArray(series.tags_list) && series.tags_list.length > 0) {
    tags = series.tags_list;
  } else if (series.tags) {
    tags = series.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => ({ id: null, name: t }));
  }

  tags.forEach(t => {
    const chip = document.createElement('span');
    chip.className = 'manga-tag-chip';
    chip.innerHTML = `
      <span>${escapeHtml(t.name)}</span>
      <button class="btn-remove-tag" data-tag-name="${escapeHtml(t.name)}" ${t.id ? `data-tag-id="${t.id}"` : ''} title="Eliminar tag de este manga">×</button>
    `;

    chip.querySelector('.btn-remove-tag').addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleRemoveTagFromSeries(t);
    });

    mangaTagsList.appendChild(chip);
  });
}

async function handleRemoveTagFromSeries(tagObj) {
  if (!activeSeries) return;

  if (tagObj.id) {
    const currentList = activeSeries.tags_list || [];
    const remainingIds = currentList.filter(t => t.id !== tagObj.id).map(t => t.id);
    const updated = await window.lecfalAPI.setSeriesTags({
      seriesId: activeSeries.id,
      tagIds: remainingIds
    });
    activeSeries.tags_list = updated;
    activeSeries.tags = updated.map(t => t.name).join(', ');
  } else {
    const currentTags = activeSeries.tags ? activeSeries.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const updated = currentTags.filter(t => t.toLowerCase() !== tagObj.name.toLowerCase());
    const updatedStr = updated.join(', ');
    await window.lecfalAPI.updateSeriesMetadata({
      seriesId: activeSeries.id,
      tags: updatedStr
    });
    activeSeries.tags = updatedStr;
    activeSeries.tags_list = updated.map(name => ({ id: null, name }));
  }
  renderMangaTagsFromSeries(activeSeries);
  callbacks.refreshSeries?.();
  toast(`Tag "${tagObj.name}" eliminado de este manga`);
}

// ==================== CHAPTER LIST RENDERING ====================
export function renderChaptersList() {
  if (!chaptersList) return;
  chaptersList.innerHTML = '';

  let filtered = activeChapters;
  if (chapterFilterText) {
    filtered = activeChapters.filter(c =>
      c.title.toLowerCase().includes(chapterFilterText) ||
      c.file_name.toLowerCase().includes(chapterFilterText)
    );
  }

  if (filtered.length === 0) {
    chaptersList.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-dim); font-size: 0.88rem;">No se encontraron capítulos coincidentes</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  filtered.forEach(ch => {
    const row = document.createElement('div');
    row.className = `chapter-row ${ch.is_read ? 'is-read' : ''}`;
    row.dataset.id = ch.id;

    const formattedSize = formatBytes(ch.file_size);

    // Subtle reading progress badge for partially read chapters (0 < pos < 0.90)
    const isCompleted = ch.is_read === 1 || (typeof ch.reading_position === 'number' && ch.reading_position >= 0.90);
    const rawPos = (typeof ch.reading_position === 'number' && !isNaN(ch.reading_position)) ? ch.reading_position : 0;
    const hasPartialProgress = !isCompleted && rawPos > 0.005 && rawPos < 0.90;
    const progressPercent = hasPartialProgress ? Math.round(rawPos * 100) : 0;
    const progressBadgeHtml = hasPartialProgress
      ? `<span class="chapter-progress-badge" title="Progreso de lectura: ${progressPercent}%">${progressPercent}%</span>`
      : '';

    row.innerHTML = `
      <div class="chapter-left">
        <button class="btn-read-check ${ch.is_read ? 'checked' : ''}" title="${ch.is_read ? 'Marcar como no leído' : 'Marcar como leído'}">
          <svg viewBox="0 0 24 24" fill="${ch.is_read ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </button>
        <span class="chapter-title-text" title="${escapeHtml(ch.title)}">${escapeHtml(ch.title)}</span>
      </div>

      <div class="chapter-right">
        ${progressBadgeHtml}
        <span class="chapter-badge badge-${ch.format}">${(ch.format || 'CBZ').toUpperCase()}</span>
        <span class="chapter-size">${formattedSize}</span>
        <button class="btn-chapter-open" title="Abrir capítulo con el visor del sistema">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span>Leer</span>
        </button>
        <button class="btn-chapter-folder" title="Mostrar archivo en carpeta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      </div>
    `;

    // Toggle read status
    row.querySelector('.btn-read-check').addEventListener('click', async (e) => {
      e.stopPropagation();
      const isRead = await window.lecfalAPI.toggleChapterRead(ch.id);
      ch.is_read = isRead;
      row.classList.toggle('is-read', isRead === 1);
      const checkBtn = row.querySelector('.btn-read-check');
      checkBtn.classList.toggle('checked', isRead === 1);
      const checkSvg = checkBtn.querySelector('svg');
      checkSvg.setAttribute('fill', isRead === 1 ? 'currentColor' : 'none');

      // Update progress badge display if read status changes
      const badge = row.querySelector('.chapter-progress-badge');
      if (badge) {
        badge.style.display = isRead === 1 ? 'none' : 'inline-flex';
      }
      updateChapterCounters();
    });

    // Open chapter
    const openHandler = async (e) => {
      e.stopPropagation();
      callbacks.openReader?.(ch.id);
    };

    row.querySelector('.btn-chapter-open').addEventListener('click', openHandler);
    row.addEventListener('dblclick', openHandler);

    // Show in folder
    row.querySelector('.btn-chapter-folder').addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.lecfalAPI.showInFolder(ch.file_path);
    });

    fragment.appendChild(row);
  });

  chaptersList.appendChild(fragment);
}

export function updateChapterCounters() {
  const total = activeChapters.length;
  const readCount = activeChapters.filter(c => c.is_read).length;
  if (chaptersCountBadge) chaptersCountBadge.textContent = `${total} capítulo${total === 1 ? '' : 's'}`;
  if (chaptersReadBadge) chaptersReadBadge.textContent = `${readCount} / ${total} leídos`;

  // Update Mark All Read button text
  if (btnMarkAllText) {
    btnMarkAllText.textContent = readCount === total ? 'Marcar todo no leído' : 'Marcar todo leído';
  }

  // Update Start reading button
  if (btnStartReadingText) {
    const firstUnread = activeChapters.find(c => !c.is_read);
    if (firstUnread) {
      btnStartReadingText.textContent = `Continuar (${firstUnread.title})`;
    } else if (activeChapters.length > 0) {
      btnStartReadingText.textContent = `Releer (${activeChapters[0].title})`;
    } else {
      btnStartReadingText.textContent = 'Sin capítulos';
    }
  }
}

/**
 * Synchronize a single chapter's is_read state from reader events without full reload.
 * @param {number|string} chapterId 
 */
export function syncChapterRead(chapterId) {
  const ch = activeChapters.find(c => c.id === chapterId);
  if (ch) {
    ch.is_read = 1;
    renderChaptersList();
    updateChapterCounters();
  }
}

export function focusChapterFilter() {
  if (chapterFilterInput) {
    chapterFilterInput.focus();
    chapterFilterInput.select();
  }
}

// ==================== EDIT FIELD MODAL (TITLE / AUTHOR) ====================
export function openEditFieldModal(fieldKey, titleText, labelText, initialValue) {
  currentEditField = fieldKey;
  if (editFieldModalTitle) editFieldModalTitle.textContent = titleText;
  if (editFieldLabel) editFieldLabel.textContent = labelText;
  if (editFieldInput) {
    editFieldInput.value = initialValue || '';
    modalEditField.style.display = 'flex';
    editFieldInput.focus();
  }
}

export function closeEditFieldModal() {
  if (modalEditField) modalEditField.style.display = 'none';
  currentEditField = null;
}

export function isEditFieldModalOpen() {
  return Boolean(modalEditField && modalEditField.style.display !== 'none');
}

async function handleSaveEditField() {
  if (!activeSeries || !currentEditField) return;
  const val = editFieldInput ? editFieldInput.value.trim() : '';

  if (currentEditField === 'title') {
    const finalTitle = val || activeSeries.title;
    await window.lecfalAPI.updateSeriesMetadata({
      seriesId: activeSeries.id,
      title: finalTitle
    });
    activeSeries.title = finalTitle;
    if (mangaHeroTitle) mangaHeroTitle.textContent = finalTitle;
    toast('Título del manga actualizado');
    callbacks.refreshSeries?.(false);
  } else if (currentEditField === 'author') {
    const finalAuthor = val || 'Desconocido';
    await window.lecfalAPI.updateSeriesMetadata({
      seriesId: activeSeries.id,
      author: finalAuthor
    });
    activeSeries.author = finalAuthor;
    toast('Autor actualizado');
  }

  closeEditFieldModal();
}

// ==================== DELETE MANGA MODALS & LOGIC ====================
function openDeleteMangaChoiceModal() {
  if (!activeSeries) return;
  if (modalDeleteMangaChoice) {
    modalDeleteMangaChoice.style.display = 'flex';
  }
}

function closeDeleteMangaChoiceModal() {
  if (modalDeleteMangaChoice) {
    modalDeleteMangaChoice.style.display = 'none';
  }
}

function openPermanentDeleteModal() {
  if (!activeSeries) return;
  closeDeleteMangaChoiceModal();

  if (permanentDeleteMangaTitle) {
    permanentDeleteMangaTitle.textContent = activeSeries.title || 'Manga seleccionado';
  }
  if (permanentDeleteChapterCount) {
    const count = activeChapters ? activeChapters.length : (activeSeries.chapter_count || 0);
    permanentDeleteChapterCount.textContent = `${count} ${count === 1 ? 'capítulo' : 'capítulos'}`;
  }
  if (permanentDeleteSize) {
    const totalBytes = activeChapters ? activeChapters.reduce((acc, c) => acc + (c.file_size || 0), 0) : 0;
    permanentDeleteSize.textContent = totalBytes > 0 ? formatBytes(totalBytes) : 'Desconocido';
  }
  if (permanentDeleteError) {
    permanentDeleteError.style.display = 'none';
    permanentDeleteError.textContent = '';
  }

  if (btnConfirmPermanentDelete) {
    btnConfirmPermanentDelete.disabled = false;
    btnConfirmPermanentDelete.textContent = 'Eliminar definitivamente';
  }

  if (modalConfirmDeletePermanently) {
    modalConfirmDeletePermanently.style.display = 'flex';
  }
}

function closePermanentDeleteModal() {
  if (modalConfirmDeletePermanently) {
    modalConfirmDeletePermanently.style.display = 'none';
  }
}

async function handleRemoveFromLibrary() {
  if (!activeSeries) return;
  const seriesId = activeSeries.id;
  closeDeleteMangaChoiceModal();

  try {
    const res = await window.lecfalAPI.removeFromLibrary(seriesId);
    if (res && res.success) {
      toast('Manga quitado de la biblioteca');
      callbacks.navigateToLibrary?.();
      callbacks.refreshSeries?.(false);
      callbacks.refreshAdvSearch?.();
    } else {
      toast(res?.error || 'Error al quitar el manga de la biblioteca');
    }
  } catch (err) {
    toast(`Error: ${err.message}`);
  }
}

async function handlePermanentDelete() {
  if (!activeSeries) return;
  const seriesId = activeSeries.id;

  if (btnConfirmPermanentDelete) {
    btnConfirmPermanentDelete.disabled = true;
    btnConfirmPermanentDelete.textContent = 'Eliminando archivos...';
  }
  if (permanentDeleteError) {
    permanentDeleteError.style.display = 'none';
    permanentDeleteError.textContent = '';
  }

  try {
    const res = await window.lecfalAPI.deletePermanently(seriesId);
    if (res && res.success) {
      closePermanentDeleteModal();
      toast('Manga y archivos eliminados definitivamente');
      callbacks.navigateToLibrary?.();
      callbacks.refreshSeries?.(false);
      callbacks.refreshAdvSearch?.();
    } else {
      if (permanentDeleteError) {
        permanentDeleteError.textContent = res?.error || 'Error al eliminar definitivamente el manga.';
        permanentDeleteError.style.display = 'block';
      }
      if (btnConfirmPermanentDelete) {
        btnConfirmPermanentDelete.disabled = false;
        btnConfirmPermanentDelete.textContent = 'Eliminar definitivamente';
      }
    }
  } catch (err) {
    if (permanentDeleteError) {
      permanentDeleteError.textContent = `Error: ${err.message}`;
      permanentDeleteError.style.display = 'block';
    }
    if (btnConfirmPermanentDelete) {
      btnConfirmPermanentDelete.disabled = false;
      btnConfirmPermanentDelete.textContent = 'Eliminar definitivamente';
    }
  }
}

// ==================== EVENT LISTENERS & INITIALIZATION ====================
function setupDetailEventListeners() {
  btnBackToLibrary?.addEventListener('click', () => callbacks.navigateToLibrary?.());

  btnMangaFav?.addEventListener('click', async () => {
    if (activeSeries) {
      const isFav = await window.lecfalAPI.toggleSeriesFavorite(activeSeries.id);
      activeSeries.favorite = isFav;
      updateFavButtonState(btnMangaFav, isFav);
      callbacks.refreshSeries?.(false);
    }
  });

  btnOpenMangaFolder?.addEventListener('click', async () => {
    if (activeSeries) {
      await window.lecfalAPI.showInFolder(activeSeries.path);
    }
  });

  btnToggleMarkAllRead?.addEventListener('click', async () => {
    if (!activeSeries || !activeChapters.length) return;
    const hasUnread = activeChapters.some(c => !c.is_read);
    await window.lecfalAPI.markAllChaptersRead({ seriesId: activeSeries.id, isRead: hasUnread });
    await reloadActiveSeries();
    toast(hasUnread ? 'Todos los capítulos marcados como leídos' : 'Capítulos marcados como no leídos');
  });

  // Edit title
  btnEditTitle?.addEventListener('click', () => {
    if (!activeSeries) return;
    openEditFieldModal('title', 'Renombrar Manga', 'Nuevo título para este manga:', activeSeries.title);
  });

  // Assign metadata buttons (open centralized catalog picker)
  btnAddAuthor?.addEventListener('click', async () => {
    if (!activeSeries) return;
    await callbacks.openCatalogPicker?.('author');
  });

  btnAddGroup?.addEventListener('click', async () => {
    if (!activeSeries) return;
    await callbacks.openCatalogPicker?.('group');
  });

  btnAddParody?.addEventListener('click', async () => {
    if (!activeSeries) return;
    await callbacks.openCatalogPicker?.('parody');
  });

  btnAddLanguage?.addEventListener('click', async () => {
    if (!activeSeries) return;
    await callbacks.openCatalogPicker?.('language');
  });

  btnAddTag?.addEventListener('click', async () => {
    if (!activeSeries) return;
    await callbacks.openCatalogPicker?.('tag');
  });

  // Edit description
  btnEditDesc?.addEventListener('click', () => {
    if (!activeSeries) return;
    if (descEditTextArea) {
      descEditTextArea.value = activeSeries.description === 'Sin descripción' ? '' : activeSeries.description;
    }
    if (mangaHeroDesc) mangaHeroDesc.style.display = 'none';
    if (descEditorContainer) descEditorContainer.style.display = 'block';
    descEditTextArea?.focus();
  });

  btnCancelEditDesc?.addEventListener('click', () => {
    if (descEditorContainer) descEditorContainer.style.display = 'none';
    if (mangaHeroDesc) mangaHeroDesc.style.display = 'block';
  });

  btnSaveEditDesc?.addEventListener('click', async () => {
    if (!activeSeries) return;
    const newDesc = descEditTextArea ? (descEditTextArea.value.trim() || 'Sin descripción') : 'Sin descripción';
    await window.lecfalAPI.updateSeriesMetadata({
      seriesId: activeSeries.id,
      description: newDesc
    });
    activeSeries.description = newDesc;
    if (mangaHeroDesc) mangaHeroDesc.textContent = newDesc;
    if (descEditorContainer) descEditorContainer.style.display = 'none';
    if (mangaHeroDesc) mangaHeroDesc.style.display = 'block';
    toast('Descripción guardada');
  });

  // Chapter list controls
  btnToggleChapterSort?.addEventListener('click', async () => {
    currentChapterSort = currentChapterSort === 'asc' ? 'desc' : 'asc';
    if (chapterSortLabel) {
      chapterSortLabel.textContent = currentChapterSort === 'asc' ? '1 → 99' : '99 → 1';
    }
    await reloadActiveSeries();
  });

  chapterFilterInput?.addEventListener('input', (e) => {
    chapterFilterText = e.target.value.toLowerCase().trim();
    renderChaptersList();
  });

  // Start reading button
  btnStartReading?.addEventListener('click', async () => {
    if (!activeChapters.length) return;
    const targetChapter = activeChapters.find(c => !c.is_read) || activeChapters[0];
    if (targetChapter) {
      callbacks.openReader?.(targetChapter.id);
    }
  });

  // Edit Field Modal
  btnCloseEditFieldModal?.addEventListener('click', closeEditFieldModal);
  btnCancelEditField?.addEventListener('click', closeEditFieldModal);
  btnSaveEditField?.addEventListener('click', handleSaveEditField);

  // Delete Manga Modals
  btnDeleteManga?.addEventListener('click', openDeleteMangaChoiceModal);
  btnCloseDeleteMangaChoice?.addEventListener('click', closeDeleteMangaChoiceModal);
  btnCancelDeleteChoice?.addEventListener('click', closeDeleteMangaChoiceModal);
  btnConfirmRemoveFromLibrary?.addEventListener('click', handleRemoveFromLibrary);
  btnChooseDeletePermanently?.addEventListener('click', openPermanentDeleteModal);

  btnClosePermanentDelete?.addEventListener('click', closePermanentDeleteModal);
  btnCancelPermanentDelete?.addEventListener('click', closePermanentDeleteModal);
  btnConfirmPermanentDelete?.addEventListener('click', handlePermanentDelete);
}

/**
 * Initialize Manga Detail module with necessary cross-feature callbacks.
 * 
 * @param {Object} options
 * @param {Function} options.navigateToLibrary
 * @param {Function} options.openReader
 * @param {Function} options.refreshSeries
 * @param {Function} options.openCatalogPicker
 * @param {Function} [options.refreshAdvSearch]
 * @param {Function} [options.showToast]
 */
export function initDetail(options = {}) {
  callbacks = { ...callbacks, ...options };
  setupDetailEventListeners();
}
