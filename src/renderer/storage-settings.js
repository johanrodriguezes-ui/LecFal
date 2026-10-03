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

import { escapeHtml } from './ui-utils.js';

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
  btnConfirmChangeMode: null
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

  // Button Listeners
  elements.btnSwitchToPortable?.addEventListener('click', () => openChangeModeModal('portable'));
  elements.btnSwitchToStandard?.addEventListener('click', () => openChangeModeModal('standard'));
  elements.btnMigrateStorage?.addEventListener('click', openMigrateModal);

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

  // Escape key support for modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isMigrateModalOpen()) closeMigrateModal();
      if (isChangeModeModalOpen()) closeChangeModeModal();
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
    isMigrateModalOpen,
    isChangeModeModalOpen
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
