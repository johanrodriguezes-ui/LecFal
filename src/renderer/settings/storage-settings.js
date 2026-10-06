/**
 * Storage & Portability Settings Module for LecFal Renderer
 * Phase 5.2
 *
 * Manages Settings > Datos > Ubicación de datos:
 * - Current storage mode display ("Estándar" or "Portable")
 * - Storage root path display
 * - Explanatory details regarding stored artifacts (DB, thumbnails, config, logs)
 * - Safe manual actions:
 *   - "Cambiar a modo portable"
 *   - "Cambiar a modo estándar"
 *   - "Migrar datos"
 * - Confirmation modals for mode change and migration
 * - Destination writability and existing files validation
 * - Clear restart guidance without automatic or invented restarts
 */

import { escapeHtml } from '../utils/ui-utils.js';

// ==================== STATE ====================
let storageState = {
  mode: 'standard', // 'standard' | 'portable'
  isPortable: false,
  storageRoot: '',
  standardPath: '',
  portablePath: '',
  isPortableAvailable: true,
  appDir: ''
};

let destinationCheck = {
  targetMode: 'portable',
  targetPath: '',
  isWritable: true,
  hasExistingData: false,
  existingFiles: []
};

let callbacks = {
  showToast: () => {}
};

let pendingTargetMode = null;

// ==================== DOM ELEMENTS CACHE ====================
const elements = {
  // Main Section
  sectionStorage: null,
  storageCurrentModeBadge: null,
  storageCurrentPath: null,
  storagePortableRow: null,
  storagePortablePathValue: null,
  btnChoosePortablePath: null,
  storageDestPath: null,
  storageDestStatus: null,
  storageDestStatusText: null,
  storageDestStatusDot: null,
  storageFeedbackBanner: null,

  // Action Buttons
  btnSwitchToPortable: null,
  btnSwitchToStandard: null,
  btnMigrateStorage: null,

  // Migration Modal
  modalMigrateStorage: null,
  migrateModalSource: null,
  migrateModalDestination: null,
  migrateModalNotice: null,
  migrateModalError: null,
  btnCloseMigrateModal: null,
  btnCancelMigrateStorage: null,
  btnConfirmMigrateStorage: null,

  // Change Mode Modal
  modalChangeStorageMode: null,
  changeModeModalTitle: null,
  changeModeModalDesc: null,
  changeModeModalTargetPath: null,
  changeModeModalError: null,
  btnCloseChangeModeModal: null,
  btnCancelChangeMode: null,
  btnConfirmChangeMode: null,

  // Reset Application Modal
  btnOpenResetModal: null,
  modalResetApplication: null,
  btnCloseResetModal: null,
  btnCancelResetApp: null,
  btnConfirmResetApp: null,
  resetAppModalError: null,

  // Clear History Modal
  btnOpenClearHistoryModal: null,
  modalClearHistory: null,
  btnCloseClearHistoryModal: null,
  btnCancelClearHistory: null,
  btnConfirmClearHistory: null,
  clearHistoryModalError: null,

  // Reset History and Progress Modal
  btnOpenResetProgressModal: null,
  modalResetProgress: null,
  btnCloseResetProgressModal: null,
  btnCancelResetProgress: null,
  btnConfirmResetProgress: null,
  resetProgressModalError: null
};

// ==================== INITIALIZATION ====================
export function initStorageSettings(options = {}) {
  callbacks = {
    showToast: options.showToast || (() => {})
  };

  // Cache Section Elements
  elements.sectionStorage = document.getElementById('sectionStorage');
  elements.storageCurrentModeBadge = document.getElementById('storageCurrentModeBadge');
  elements.storageCurrentPath = document.getElementById('storageCurrentPath');
  elements.storagePortableRow = document.getElementById('storagePortableRow');
  elements.storagePortablePathValue = document.getElementById('storagePortablePathValue');
  elements.btnChoosePortablePath = document.getElementById('btnChoosePortablePath');
  elements.storageDestPath = document.getElementById('storageDestPath');
  elements.storageDestStatus = document.getElementById('storageDestStatus');
  elements.storageDestStatusText = document.getElementById('storageDestStatusText');
  elements.storageDestStatusDot = document.getElementById('storageDestStatusDot');
  elements.storageFeedbackBanner = document.getElementById('storageFeedbackBanner');

  // Cache Action Buttons
  elements.btnSwitchToPortable = document.getElementById('btnSwitchToPortable');
  elements.btnSwitchToStandard = document.getElementById('btnSwitchToStandard');
  elements.btnMigrateStorage = document.getElementById('btnMigrateStorage');

  // Cache Migration Modal Elements
  elements.modalMigrateStorage = document.getElementById('modalMigrateStorage');
  elements.migrateModalSource = document.getElementById('migrateModalSource');
  elements.migrateModalDestination = document.getElementById('migrateModalDestination');
  elements.migrateModalNotice = document.getElementById('migrateModalNotice');
  elements.migrateModalError = document.getElementById('migrateModalError');
  elements.btnCloseMigrateModal = document.getElementById('btnCloseMigrateModal');
  elements.btnCancelMigrateStorage = document.getElementById('btnCancelMigrateStorage');
  elements.btnConfirmMigrateStorage = document.getElementById('btnConfirmMigrateStorage');

  // Cache Change Mode Modal Elements
  elements.modalChangeStorageMode = document.getElementById('modalChangeStorageMode');
  elements.changeModeModalTitle = document.getElementById('changeModeModalTitle');
  elements.changeModeModalDesc = document.getElementById('changeModeModalDesc');
  elements.changeModeModalTargetPath = document.getElementById('changeModeModalTargetPath');
  elements.changeModeModalError = document.getElementById('changeModeModalError');
  elements.btnCloseChangeModeModal = document.getElementById('btnCloseChangeModeModal');
  elements.btnCancelChangeMode = document.getElementById('btnCancelChangeMode');
  elements.btnConfirmChangeMode = document.getElementById('btnConfirmChangeMode');

  // Cache Reset Application Elements
  elements.btnOpenResetModal = document.getElementById('btnOpenResetModal');
  elements.modalResetApplication = document.getElementById('modalResetApplication');
  elements.btnCloseResetModal = document.getElementById('btnCloseResetModal');
  elements.btnCancelResetApp = document.getElementById('btnCancelResetApp');
  elements.btnConfirmResetApp = document.getElementById('btnConfirmResetApp');
  elements.resetAppModalError = document.getElementById('resetAppModalError');

  // Cache Clear History Elements
  elements.btnOpenClearHistoryModal = document.getElementById('btnOpenClearHistoryModal');
  elements.modalClearHistory = document.getElementById('modalClearHistory');
  elements.btnCloseClearHistoryModal = document.getElementById('btnCloseClearHistoryModal');
  elements.btnCancelClearHistory = document.getElementById('btnCancelClearHistory');
  elements.btnConfirmClearHistory = document.getElementById('btnConfirmClearHistory');
  elements.clearHistoryModalError = document.getElementById('clearHistoryModalError');

  // Cache Reset History and Progress Elements
  elements.btnOpenResetProgressModal = document.getElementById('btnOpenResetProgressModal');
  elements.modalResetProgress = document.getElementById('modalResetProgress');
  elements.btnCloseResetProgressModal = document.getElementById('btnCloseResetProgressModal');
  elements.btnCancelResetProgress = document.getElementById('btnCancelResetProgress');
  elements.btnConfirmResetProgress = document.getElementById('btnConfirmResetProgress');
  elements.resetProgressModalError = document.getElementById('resetProgressModalError');

  // Button Listeners
  elements.btnSwitchToPortable?.addEventListener('click', () => openChangeModeModal('portable'));
  elements.btnSwitchToStandard?.addEventListener('click', () => openChangeModeModal('standard'));
  elements.btnMigrateStorage?.addEventListener('click', openMigrateModal);
  elements.btnChoosePortablePath?.addEventListener('click', handleChoosePortablePath);
  elements.btnChoosePortablePath?.addEventListener('click', handleChoosePortablePath);
  elements.btnOpenResetModal?.addEventListener('click', openResetModal);
  elements.btnOpenClearHistoryModal?.addEventListener('click', openClearHistoryModal);
  elements.btnOpenResetProgressModal?.addEventListener('click', openResetProgressModal);

  // Migration Modal Listeners
  elements.btnCloseMigrateModal?.addEventListener('click', closeMigrateModal);
  elements.btnCancelMigrateStorage?.addEventListener('click', closeMigrateModal);
  elements.btnConfirmMigrateStorage?.addEventListener('click', handleConfirmMigrate);
  elements.modalMigrateStorage?.addEventListener('click', (e) => {
    if (e.target === elements.modalMigrateStorage) {
      closeMigrateModal();
    }
  });

  // Change Mode Modal Listeners
  elements.btnCloseChangeModeModal?.addEventListener('click', closeChangeModeModal);
  elements.btnCancelChangeMode?.addEventListener('click', closeChangeModeModal);
  elements.btnConfirmChangeMode?.addEventListener('click', handleConfirmChangeMode);
  elements.modalChangeStorageMode?.addEventListener('click', (e) => {
    if (e.target === elements.modalChangeStorageMode) {
      closeChangeModeModal();
    }
  });

  // Reset Application Modal Listeners
  elements.btnCloseResetModal?.addEventListener('click', closeResetModal);
  elements.btnCancelResetApp?.addEventListener('click', closeResetModal);
  elements.btnConfirmResetApp?.addEventListener('click', handleResetApplication);
  elements.modalResetApplication?.addEventListener('click', (e) => {
    if (e.target === elements.modalResetApplication) {
      closeResetModal();
    }
  });

  // Clear History Modal Listeners
  elements.btnCloseClearHistoryModal?.addEventListener('click', closeClearHistoryModal);
  elements.btnCancelClearHistory?.addEventListener('click', closeClearHistoryModal);
  elements.btnConfirmClearHistory?.addEventListener('click', handleClearHistory);
  elements.modalClearHistory?.addEventListener('click', (e) => {
    if (e.target === elements.modalClearHistory) {
      closeClearHistoryModal();
    }
  });

  // Reset History and Progress Modal Listeners
  elements.btnCloseResetProgressModal?.addEventListener('click', closeResetProgressModal);
  elements.btnCancelResetProgress?.addEventListener('click', closeResetProgressModal);
  elements.btnConfirmResetProgress?.addEventListener('click', handleResetProgress);
  elements.modalResetProgress?.addEventListener('click', (e) => {
    if (e.target === elements.modalResetProgress) {
      closeResetProgressModal();
    }
  });

  // Escape key support for modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isMigrateModalOpen()) closeMigrateModal();
      if (isChangeModeModalOpen()) closeChangeModeModal();
      if (isResetModalOpen()) closeResetModal();
      if (isClearHistoryModalOpen()) closeClearHistoryModal();
      if (isResetProgressModalOpen()) closeResetProgressModal();
    }
  });

  // Expose module globally for tests
  window.storageSettings = {
    renderStorageSettings,
    getStorageSettingsState,
    openMigrateModal,
    closeMigrateModal,
    handleConfirmMigrate,
    openChangeModeModal,
    closeChangeModeModal,
    handleConfirmChangeMode,
    handleChoosePortablePath,
    isMigrateModalOpen,
    isChangeModeModalOpen,
    openResetModal,
    closeResetModal,
    handleResetApplication,
    isResetModalOpen,
    openClearHistoryModal,
    closeClearHistoryModal,
    handleClearHistory,
    isClearHistoryModalOpen,
    openResetProgressModal,
    closeResetProgressModal,
    handleResetProgress,
    isResetProgressModalOpen
  };
}

// ==================== RENDERING ====================
export async function renderStorageSettings() {
  if (!window.lecfalAPI || typeof window.lecfalAPI.getStorageInfo !== 'function') {
    return;
  }

  try {
    const info = await window.lecfalAPI.getStorageInfo();
    storageState = { ...info };

    const targetMode = storageState.isPortable ? 'standard' : 'portable';
    let destInfo = {
      targetMode,
      targetPath: targetMode === 'portable' ? storageState.portablePath : storageState.standardPath,
      isWritable: true,
      hasExistingData: false,
      existingFiles: []
    };

    if (typeof window.lecfalAPI.checkStorageDestination === 'function') {
      try {
        destInfo = await window.lecfalAPI.checkStorageDestination({ targetMode });
      } catch (_) {}
    }
    destinationCheck = { ...destInfo };

    // Update Mode Badge
    if (elements.storageCurrentModeBadge) {
      const isPortable = storageState.mode === 'portable';
      elements.storageCurrentModeBadge.textContent = isPortable ? 'Portable' : 'Estándar';
      elements.storageCurrentModeBadge.className = `storage-badge ${isPortable ? 'storage-badge-portable' : 'storage-badge-standard'}`;
    }

    // Update Current Path
    if (elements.storageCurrentPath) {
      elements.storageCurrentPath.textContent = storageState.storageRoot || 'Cargando...';
    }

    // Update Portable data directory row (only meaningful in Portable mode)
    if (elements.storagePortableRow) {
  if (storageState.mode === 'portable') {
    elements.storagePortableRow.style.display = 'flex';

    const configured = storageState.configuredPortablePath || '';
    if (elements.storagePortablePathValue) {
      elements.storagePortablePathValue.textContent = configured || 'No configurado';
    }
    if (elements.btnChoosePortablePath) {
      const label = elements.btnChoosePortablePath.querySelector('span');
      if (label) {
        label.textContent = configured ? 'Cambiar…' : 'Elegir carpeta…';
      }
    }

    if (storageState.portablePathError) {
      showStorageFeedback(
        'error',
        'Directorio portable no disponible',
        `${escapeHtml(storageState.portablePathError)}<br>Selecciona otro directorio para continuar en modo portable. Tus datos no se han modificado.`
      );
    }
  } else {
    elements.storagePortableRow.style.display = 'none';
  }
}

    // Update Destination Preview
    if (elements.storageDestPath) {
      elements.storageDestPath.textContent = destinationCheck.targetPath || '—';
    }

    if (elements.storageDestStatusText && elements.storageDestStatusDot) {
      if (destinationCheck.targetMode === 'portable' && !destinationCheck.isWritable) {
        elements.storageDestStatusText.textContent = 'Directorio no escribible (solo lectura)';
        elements.storageDestStatusText.style.color = '#f87171';
        elements.storageDestStatusDot.className = 'status-indicator-dot status-dot-unavailable';
      } else {
        elements.storageDestStatusText.textContent = destinationCheck.hasExistingData
          ? 'Disponible (contiene archivos existentes)'
          : 'Disponible (directorio preparado)';
        elements.storageDestStatusText.style.color = '#34d399';
        elements.storageDestStatusDot.className = 'status-indicator-dot status-dot-available';
      }
    }

    // Configure Action Buttons: ONLY show actions that make sense for current mode
    if (storageState.mode === 'portable') {
      if (elements.btnSwitchToPortable) elements.btnSwitchToPortable.style.display = 'none';
      if (elements.btnSwitchToStandard) elements.btnSwitchToStandard.style.display = 'inline-flex';
      if (elements.btnMigrateStorage) elements.btnMigrateStorage.style.display = 'inline-flex';
    } else {
      if (elements.btnSwitchToPortable) elements.btnSwitchToPortable.style.display = 'inline-flex';
      if (elements.btnSwitchToStandard) elements.btnSwitchToStandard.style.display = 'none';
      if (elements.btnMigrateStorage) elements.btnMigrateStorage.style.display = 'inline-flex';
    }
  } catch (err) {
    if (err && err.message && err.message.includes('No handler registered')) {
      return;
    }
    console.error('[storage-settings] Error rendering storage settings:', err);
  }
}
// ==================== CHOOSE PORTABLE DATA DIRECTORY ====================
export async function handleChoosePortablePath() {
  if (!window.lecfalAPI || typeof window.lecfalAPI.selectStorageDirectory !== 'function') {
    callbacks.showToast('Función de selección de directorio no disponible');
    return;
  }

  // 1. Native folder picker
  let chosen = null;
  try {
    chosen = await window.lecfalAPI.selectStorageDirectory();
  } catch (err) {
    callbacks.showToast(`Error al abrir el selector: ${err.message}`);
    return;
  }

  if (!chosen) {
    // User cancelled
    return;
  }

  // 2. Persist the choice via StorageManager (does not copy or delete data)
  let result = null;
  try {
    result = await window.lecfalAPI.setPortableDataPath(chosen);
  } catch (err) {
    showStorageFeedback(
      'error',
      'No se pudo configurar el directorio portable',
      `${err.message}`
    );
    return;
  }

  if (!result || !result.success) {
    showStorageFeedback(
      'error',
      'No se pudo configurar el directorio portable',
      (result && result.error) || 'Error desconocido'
    );
    return;
  }

  // 3. Refresh UI and inform the user
  await renderStorageSettings();

  showStorageFeedback(
    'success',
    'Directorio portable configurado',
    `Ubicación: <strong>${escapeHtml(result.path)}</strong><br>
     Para que la base de datos y todos los servicios usen la nueva ubicación, reinicia LecFal manualmente.`
  );

  callbacks.showToast('Directorio portable configurado');
}

// ==================== FEEDBACK BANNER HELPER ====================
function showStorageFeedback(kind, title, htmlBody) {
  if (!elements.storageFeedbackBanner) return;
  const cls = kind === 'error'
    ? 'storage-banner storage-banner-error'
    : (kind === 'warning' ? 'storage-banner storage-banner-warning' : 'storage-banner storage-banner-success');
  elements.storageFeedbackBanner.className = cls;
  elements.storageFeedbackBanner.innerHTML = `
    <div class="storage-banner-title"><span>${escapeHtml(title)}</span></div>
    <div>${htmlBody}</div>
  `;
  elements.storageFeedbackBanner.style.display = 'flex';
}
// ==================== STATE GETTER ====================
export function getStorageSettingsState() {
  return {
    ...storageState,
    destination: { ...destinationCheck }
  };
}

// ==================== MIGRATION MODAL ====================
export async function openMigrateModal() {
  if (!elements.modalMigrateStorage) return;

  const targetMode = storageState.mode === 'portable' ? 'standard' : 'portable';
  const targetLabel = targetMode === 'portable' ? 'Modo Portable' : 'Modo Estándar';

  // Check destination freshness
  if (window.lecfalAPI && typeof window.lecfalAPI.checkStorageDestination === 'function') {
    try {
      destinationCheck = await window.lecfalAPI.checkStorageDestination({ targetMode });
    } catch (_) {}
  }

  if (elements.migrateModalSource) {
    elements.migrateModalSource.textContent = storageState.storageRoot;
  }
  if (elements.migrateModalDestination) {
    elements.migrateModalDestination.textContent = destinationCheck.targetPath;
  }

  // Notice about existing destination files or writability
  if (elements.migrateModalNotice) {
    if (!destinationCheck.isWritable) {
      elements.migrateModalNotice.innerHTML = `
        <div class="storage-callout-warning">
          <strong>Advertencia de permisos:</strong> El directorio de destino no tiene permisos de escritura. No se puede iniciar la migración hacia esta ubicación.
        </div>
      `;
    } else if (destinationCheck.hasExistingData) {
      elements.migrateModalNotice.innerHTML = `
        <div class="storage-callout-warning">
          <strong>Aviso:</strong> El directorio de destino ya contiene archivos. Los archivos ya existentes no serán sobrescritos ni modificados.
        </div>
      `;
    } else {
      elements.migrateModalNotice.innerHTML = '';
    }
  }

  if (elements.migrateModalError) {
    elements.migrateModalError.textContent = '';
    elements.migrateModalError.style.display = 'none';
  }

  if (elements.btnConfirmMigrateStorage) {
    elements.btnConfirmMigrateStorage.disabled = !destinationCheck.isWritable;
    elements.btnConfirmMigrateStorage.textContent = `Confirmar migración a ${targetLabel}`;
  }

  elements.modalMigrateStorage.style.display = 'flex';
}

export function closeMigrateModal() {
  if (elements.modalMigrateStorage) {
    elements.modalMigrateStorage.style.display = 'none';
  }
  if (elements.migrateModalError) {
    elements.migrateModalError.textContent = '';
    elements.migrateModalError.style.display = 'none';
  }
  if (elements.btnConfirmMigrateStorage) {
    elements.btnConfirmMigrateStorage.disabled = false;
  }
}

export function isMigrateModalOpen() {
  return !!(elements.modalMigrateStorage && elements.modalMigrateStorage.style.display !== 'none');
}

export async function handleConfirmMigrate() {
  const targetMode = storageState.mode === 'portable' ? 'standard' : 'portable';

  // 1. Validate destination writability before starting
  if (!destinationCheck.isWritable) {
    if (elements.migrateModalError) {
      elements.migrateModalError.textContent = 'El directorio de destino no tiene permisos de escritura.';
      elements.migrateModalError.style.display = 'block';
    }
    return;
  }

  if (elements.btnConfirmMigrateStorage) {
    elements.btnConfirmMigrateStorage.disabled = true;
    elements.btnConfirmMigrateStorage.textContent = 'Migrando datos...';
  }

  try {
    const result = await window.lecfalAPI.migrateStorageData({
      targetMode,
      includeRegenerable: true,
      includeLogs: true,
      switchModeAfter: true
    });

    if (!result || !result.success) {
      const errMsg = (result && (result.error || (result.errors && result.errors[0]))) || 'Error desconocido durante la migración.';
      if (elements.migrateModalError) {
        elements.migrateModalError.textContent = `Error en la migración: ${errMsg}. Tus datos de origen permanecen intactos.`;
        elements.migrateModalError.style.display = 'block';
      }
      if (elements.btnConfirmMigrateStorage) {
        elements.btnConfirmMigrateStorage.disabled = false;
        elements.btnConfirmMigrateStorage.textContent = 'Reintentar migración';
      }
      return;
    }

    // Success!
    closeMigrateModal();
    await renderStorageSettings();

    // Show persistent success banner
    if (elements.storageFeedbackBanner) {
      const copiedCount = (result.copied && result.copied.length) || 0;
      const skippedCount = (result.skipped && result.skipped.length) || 0;
      const newModeName = targetMode === 'portable' ? 'Modo Portable' : 'Modo Estándar';

      elements.storageFeedbackBanner.className = 'storage-banner storage-banner-success';
      elements.storageFeedbackBanner.innerHTML = `
        <div class="storage-banner-title">
          <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Migración completada con éxito</span>
        </div>
        <div>
          Se han transferido los datos a <strong>${escapeHtml(result.target)}</strong> (${copiedCount} archivos copiados, ${skippedCount} omitidos sin sobreescribir).
          Tus datos de origen en <em>${escapeHtml(result.source)}</em> se mantienen intactos.
        </div>
        <div style="margin-top: 6px; font-weight: 500; color: #f1f5f9;">
          Modo activo actualizado a ${newModeName}. Para que la base de datos y todos los servicios operen en la nueva ubicación, por favor reinicia LecFal manualmente.
        </div>
      `;
      elements.storageFeedbackBanner.style.display = 'flex';
    }

    callbacks.showToast('Migración completada con éxito');
  } catch (err) {
    if (elements.migrateModalError) {
      elements.migrateModalError.textContent = `Fallo de comunicación: ${err.message}. Origen no modificado.`;
      elements.migrateModalError.style.display = 'block';
    }
    if (elements.btnConfirmMigrateStorage) {
      elements.btnConfirmMigrateStorage.disabled = false;
      elements.btnConfirmMigrateStorage.textContent = 'Reintentar';
    }
  }
}

// ==================== CHANGE MODE MODAL ====================
export function openChangeModeModal(targetMode) {
  if (!elements.modalChangeStorageMode) return;
  pendingTargetMode = targetMode;

  const targetLabel = targetMode === 'portable' ? 'Modo Portable' : 'Modo Estándar';
  const targetPath = targetMode === 'portable' ? storageState.portablePath : storageState.standardPath;

  if (elements.changeModeModalTitle) {
    elements.changeModeModalTitle.textContent = `Cambiar a ${targetLabel}`;
  }

  if (elements.changeModeModalTargetPath) {
    elements.changeModeModalTargetPath.textContent = targetPath;
  }

  if (elements.changeModeModalError) {
    elements.changeModeModalError.textContent = '';
    elements.changeModeModalError.style.display = 'none';
  }

  if (elements.btnConfirmChangeMode) {
    elements.btnConfirmChangeMode.disabled = false;
    elements.btnConfirmChangeMode.textContent = `Cambiar a ${targetLabel}`;
  }

  elements.modalChangeStorageMode.style.display = 'flex';
}

export function closeChangeModeModal() {
  if (elements.modalChangeStorageMode) {
    elements.modalChangeStorageMode.style.display = 'none';
  }
  if (elements.changeModeModalError) {
    elements.changeModeModalError.textContent = '';
    elements.changeModeModalError.style.display = 'none';
  }
  pendingTargetMode = null;
}

export function isChangeModeModalOpen() {
  return !!(elements.modalChangeStorageMode && elements.modalChangeStorageMode.style.display !== 'none');
}

export async function handleConfirmChangeMode() {
  if (!pendingTargetMode) return;

  if (elements.btnConfirmChangeMode) {
    elements.btnConfirmChangeMode.disabled = true;
  }

  try {
    const result = await window.lecfalAPI.setStorageMode({ mode: pendingTargetMode });

    if (!result || !result.success) {
      // Special case: switching to Portable requires a configured data directory.
      // Prompt for it via the native picker, persist, then retry once.
      if (result && result.needsPortablePath && pendingTargetMode === 'portable') {
        let chosen = null;
        try {
          chosen = await window.lecfalAPI.selectStorageDirectory();
        } catch (err) {
          chosen = null;
        }

        if (!chosen) {
          if (elements.changeModeModalError) {
            elements.changeModeModalError.textContent =
              'Debes seleccionar un directorio de datos para usar el modo Portable.';
            elements.changeModeModalError.style.display = 'block';
          }
          if (elements.btnConfirmChangeMode) {
            elements.btnConfirmChangeMode.disabled = false;
            elements.btnConfirmChangeMode.textContent = 'Cambiar a Modo Portable';
          }
          return;
        }

        const setRes = await window.lecfalAPI.setPortableDataPath(chosen);
        if (!setRes || !setRes.success) {
          if (elements.changeModeModalError) {
            elements.changeModeModalError.textContent =
              (setRes && setRes.error) || 'No se pudo configurar el directorio portable.';
            elements.changeModeModalError.style.display = 'block';
          }
          if (elements.btnConfirmChangeMode) {
            elements.btnConfirmChangeMode.disabled = false;
            elements.btnConfirmChangeMode.textContent = 'Cambiar a Modo Portable';
          }
          return;
        }

        // Retry the mode switch now that a portable path is configured.
        return handleConfirmChangeMode();
      }

      const errMsg = (result && result.error) || 'No se pudo cambiar el modo de almacenamiento.';
      if (elements.changeModeModalError) {
        elements.changeModeModalError.textContent = errMsg;
        elements.changeModeModalError.style.display = 'block';
      }
      if (elements.btnConfirmChangeMode) {
        elements.btnConfirmChangeMode.disabled = false;
      }
      return;
    }

    const newModeLabel = pendingTargetMode === 'portable' ? 'Modo Portable' : 'Modo Estándar';
    closeChangeModeModal();
    await renderStorageSettings();

    // Show feedback banner
    if (elements.storageFeedbackBanner) {
      elements.storageFeedbackBanner.className = 'storage-banner storage-banner-warning';
      elements.storageFeedbackBanner.innerHTML = `
        <div class="storage-banner-title">
          <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Modo cambiado a ${newModeLabel}</span>
        </div>
        <div>
          La configuración se ha actualizado. Si necesitas que tus bibliotecas existentes estén disponibles en la nueva ubicación, utiliza <strong>"Migrar datos"</strong>.
        </div>
        <div style="margin-top: 4px; font-weight: 500;">
          Para que la aplicación opere completamente con la nueva ubicación en todos sus servicios, por favor reinicia LecFal manualmente.
        </div>
      `;
      elements.storageFeedbackBanner.style.display = 'flex';
    }

    callbacks.showToast(`Modo cambiado a ${newModeLabel}`);
  } catch (err) {
    if (elements.changeModeModalError) {
      elements.changeModeModalError.textContent = `Error: ${err.message}`;
      elements.changeModeModalError.style.display = 'block';
    }
    if (elements.btnConfirmChangeMode) {
      elements.btnConfirmChangeMode.disabled = false;
    }
  }
}

// ==================== RESET APPLICATION LOGIC ====================
export function isResetModalOpen() {
  return !!(elements.modalResetApplication && elements.modalResetApplication.style.display !== 'none');
}

export function openResetModal() {
  if (elements.resetAppModalError) {
    elements.resetAppModalError.style.display = 'none';
    elements.resetAppModalError.textContent = '';
  }
  if (elements.btnConfirmResetApp) {
    elements.btnConfirmResetApp.disabled = false;
    elements.btnConfirmResetApp.textContent = 'Restablecer aplicación';
  }
  if (elements.modalResetApplication) {
    elements.modalResetApplication.style.display = 'flex';
  }
}

export function closeResetModal() {
  if (elements.modalResetApplication) {
    elements.modalResetApplication.style.display = 'none';
  }
}

export async function handleResetApplication() {
  if (elements.btnConfirmResetApp) {
    elements.btnConfirmResetApp.disabled = true;
    elements.btnConfirmResetApp.textContent = 'Restableciendo...';
  }
  if (elements.resetAppModalError) {
    elements.resetAppModalError.style.display = 'none';
    elements.resetAppModalError.textContent = '';
  }

  try {
    const res = await window.lecfalAPI.resetApplication();
    if (res && res.success) {
      closeResetModal();
      callbacks.showToast('Aplicación restablecida con éxito. Reiniciando...');
    } else {
      if (elements.resetAppModalError) {
        elements.resetAppModalError.textContent = res?.error || 'Fallo al restablecer la aplicación.';
        elements.resetAppModalError.style.display = 'block';
      }
      if (elements.btnConfirmResetApp) {
        elements.btnConfirmResetApp.disabled = false;
        elements.btnConfirmResetApp.textContent = 'Restablecer aplicación';
      }
    }
  } catch (err) {
    if (elements.resetAppModalError) {
      elements.resetAppModalError.textContent = `Error: ${err.message}`;
      elements.resetAppModalError.style.display = 'block';
    }
    if (elements.btnConfirmResetApp) {
      elements.btnConfirmResetApp.disabled = false;
      elements.btnConfirmResetApp.textContent = 'Restablecer aplicación';
    }
  }
}

// ==================== CLEAR HISTORY LOGIC ====================
export function isClearHistoryModalOpen() {
  return !!(elements.modalClearHistory && elements.modalClearHistory.style.display !== 'none');
}

export function openClearHistoryModal() {
  if (elements.clearHistoryModalError) {
    elements.clearHistoryModalError.style.display = 'none';
    elements.clearHistoryModalError.textContent = '';
  }
  if (elements.btnConfirmClearHistory) {
    elements.btnConfirmClearHistory.disabled = false;
    elements.btnConfirmClearHistory.textContent = 'Limpiar historial';
  }
  if (elements.modalClearHistory) {
    elements.modalClearHistory.style.display = 'flex';
  }
}

export function closeClearHistoryModal() {
  if (elements.modalClearHistory) {
    elements.modalClearHistory.style.display = 'none';
  }
}

export async function handleClearHistory() {
  if (elements.btnConfirmClearHistory) {
    elements.btnConfirmClearHistory.disabled = true;
    elements.btnConfirmClearHistory.textContent = 'Limpiando...';
  }
  if (elements.clearHistoryModalError) {
    elements.clearHistoryModalError.style.display = 'none';
    elements.clearHistoryModalError.textContent = '';
  }

  try {
    if (window.lecfalAPI && typeof window.lecfalAPI.clearAllReadingHistory === 'function') {
      await window.lecfalAPI.clearAllReadingHistory();
    }
    closeClearHistoryModal();
    if (callbacks.showToast) {
      callbacks.showToast('Historial de lectura limpiado con éxito.');
    }
    if (window.historyModule && typeof window.historyModule.loadAndRenderHistory === 'function') {
      window.historyModule.loadAndRenderHistory();
    }
  } catch (err) {
    if (elements.clearHistoryModalError) {
      elements.clearHistoryModalError.textContent = `Error: ${err.message}`;
      elements.clearHistoryModalError.style.display = 'block';
    }
    if (elements.btnConfirmClearHistory) {
      elements.btnConfirmClearHistory.disabled = false;
      elements.btnConfirmClearHistory.textContent = 'Limpiar historial';
    }
  }
}

// ==================== RESET HISTORY AND PROGRESS ====================
export function isResetProgressModalOpen() {
  return !!(elements.modalResetProgress && elements.modalResetProgress.style.display !== 'none');
}

export function openResetProgressModal() {
  if (elements.resetProgressModalError) {
    elements.resetProgressModalError.style.display = 'none';
    elements.resetProgressModalError.textContent = '';
  }
  if (elements.btnConfirmResetProgress) {
    elements.btnConfirmResetProgress.disabled = false;
    elements.btnConfirmResetProgress.textContent = 'Reiniciar todo';
  }
  if (elements.modalResetProgress) {
    elements.modalResetProgress.style.display = 'flex';
  }
}

export function closeResetProgressModal() {
  if (elements.modalResetProgress) {
    elements.modalResetProgress.style.display = 'none';
  }
}

export async function handleResetProgress() {
  if (elements.btnConfirmResetProgress) {
    elements.btnConfirmResetProgress.disabled = true;
    elements.btnConfirmResetProgress.textContent = 'Reiniciando...';
  }
  if (elements.resetProgressModalError) {
    elements.resetProgressModalError.style.display = 'none';
    elements.resetProgressModalError.textContent = '';
  }

  try {
    if (window.lecfalAPI && typeof window.lecfalAPI.resetAllReadingHistoryAndProgress === 'function') {
      await window.lecfalAPI.resetAllReadingHistoryAndProgress();
    }
    closeResetProgressModal();
    if (callbacks.showToast) {
      callbacks.showToast('Historial y progreso restablecidos con éxito.');
    }
    if (window.historyModule && typeof window.historyModule.loadAndRenderHistory === 'function') {
      window.historyModule.loadAndRenderHistory();
    }
  } catch (err) {
    if (elements.resetProgressModalError) {
      elements.resetProgressModalError.textContent = `Error: ${err.message}`;
      elements.resetProgressModalError.style.display = 'block';
    }
    if (elements.btnConfirmResetProgress) {
      elements.btnConfirmResetProgress.disabled = false;
      elements.btnConfirmResetProgress.textContent = 'Reiniciar todo';
    }
  }
}
