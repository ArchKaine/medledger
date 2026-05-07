// ==========================================
// app.js - MedLedger Bootloader & DB Config
// ==========================================

const GOOGLE_CLIENT_ID = '254319619201-8m0phsnf5eftqpllis3kt0a03l56r6v8.apps.googleusercontent.com';

const DB_NAME = "MedLedgerDB";
const DB_VERSION = 6; 
let db;
let tokenClient;
let gapiToken = null;

// --- Config State ---
const AppSettings = {
    devMode: localStorage.getItem('cfg_devMode') === 'true',
    noBabysitter: localStorage.getItem('cfg_noBabysitter') === 'true',
    expertMode: localStorage.getItem('cfg_expertMode') === 'true',
    reminders: localStorage.getItem('cfg_reminders') === 'true',
    inventory: localStorage.getItem('cfg_inventory') === 'true',
    activeProfile: localStorage.getItem('cfg_activeProfile') || 'Primary',
    clinicalLookups: localStorage.getItem('medledger_clinical_lookups') !== 'false'
};

window.AppSettings = AppSettings;

// --- DOM Elements ---
let checklistContainer, historyList, addMedForm, editModal, editForm, settingsModal, helpModal;

function getEl(id) {
    return document.getElementById(id);
}

// --- Initialization / Bootloader ---
document.addEventListener('DOMContentLoaded', () => {
    checklistContainer = getEl('checklist-container');
    historyList = getEl('history-list');
    addMedForm = getEl('add-med-form');
    editModal = getEl('edit-med-modal');
    editForm = getEl('edit-med-form');
    settingsModal = getEl('settings-modal');
    helpModal = getEl('help-modal');

    if(typeof initSettings === 'function') initSettings();
    initDB(); 
    registerServiceWorker();

    bindCoreListeners();
    bindModalListeners();
    bindExportListeners();
    bindHeatmapListener();
    bindTabListeners();
    bindVaultListeners();
    bindKeyboardShortcuts();
    bindGlobalErrorHandler();
});

function bindCoreListeners() {
    getEl('btn-submit-selected')?.addEventListener('click', logSelected);
    getEl('btn-submit-all')?.addEventListener('click', logAll);
    getEl('add-med-form')?.addEventListener('submit', handleAddMed);
    getEl('btn-delete-med')?.addEventListener('click', deleteMedication);
    getEl('edit-med-form')?.addEventListener('submit', saveEditedMed);
    getEl('btn-add-time')?.addEventListener('click', () => addTimeField('new-med-times-container'));
    getEl('btn-edit-add-time')?.addEventListener('click', () => addTimeField('edit-med-times-container'));
    getEl('btn-cancel-edit')?.addEventListener('click', () => editModal?.close());
    
    document.querySelectorAll('.global-profile-select').forEach(select => {
        select.addEventListener('change', (e) => {
            if (typeof window.switchActiveProfile === 'function') {
                window.switchActiveProfile(e.target.value);
            } else {
                AppSettings.activeProfile = e.target.value;
                localStorage.setItem('cfg_activeProfile', e.target.value);
                if (typeof loadChecklist === 'function') loadChecklist();
                if (typeof refreshHistory === 'function') refreshHistory();
                if (typeof calculateAdherence === 'function') calculateAdherence();
            }
        });
    });

    getEl('new-med-profile')?.addEventListener('change', (e) => handleProfileChange('new-med-profile'));
    getEl('edit-med-profile')?.addEventListener('change', (e) => handleProfileChange('edit-med-profile'));
}

function bindModalListeners() {
    const openSettings = () => {
        const cachedPass = sessionStorage.getItem('medledger_session_key');
        const vaultPassInput = getEl('vault-password');
        const sessionLockControls = getEl('session-lock-controls');
        if (cachedPass && vaultPassInput && sessionLockControls) {
            vaultPassInput.value = cachedPass;
            sessionLockControls.style.display = 'flex';
        } else if (vaultPassInput && sessionLockControls) {
            vaultPassInput.value = '';
            sessionLockControls.style.display = 'none';
        }
        settingsModal?.showModal();
        if(settingsModal) settingsModal.scrollTop = 0;
    };

    getEl('settings-toggle')?.addEventListener('click', openSettings);
    getEl('nav-settings-toggle')?.addEventListener('click', openSettings);
    getEl('btn-close-settings')?.addEventListener('click', () => settingsModal?.close());
    
    const openHelp = () => {
        if (typeof openHelpModal === 'function') openHelpModal();
        else { helpModal?.showModal(); if(helpModal) helpModal.scrollTop = 0; }
    };
    getEl('nav-help-toggle')?.addEventListener('click', openHelp);
    getEl('header-help-toggle')?.addEventListener('click', openHelp);
    getEl('help-toggle')?.addEventListener('click', openHelp);

    getEl('btn-launch-theme-creator')?.addEventListener('click', () => {
        getEl('theme-creator-modal')?.showModal();
        if (typeof initThemeCreator === 'function') initThemeCreator();
    });
    getEl('btn-reset-theme')?.addEventListener('click', () => typeof resetThemeCreator === 'function' && resetThemeCreator());
    getEl('btn-save-theme')?.addEventListener('click', () => typeof saveCustomTheme === 'function' && saveCustomTheme());
}

function bindExportListeners() {
    getEl('btn-peek-password')?.addEventListener('click', togglePasswordVisibility);
    getEl('btn-lock-vault')?.addEventListener('click', lockVaultSession);
    getEl('btn-export-csv')?.addEventListener('click', exportCSV);
    getEl('btn-export-html')?.addEventListener('click', exportHTMLReport);
    getEl('nav-export-report')?.addEventListener('click', exportHTMLReport);
    getEl('btn-archive-logs')?.addEventListener('click', archiveOldLogs);
    getEl('btn-restore-archives')?.addEventListener('click', restoreArchivedLogs);
}

function bindHeatmapListener() {
    const heatmapRangeSelect = getEl('heatmap-range');
    if (heatmapRangeSelect) {
        const savedRange = localStorage.getItem('cfg_heatmapRange');
        if (savedRange) heatmapRangeSelect.value = savedRange;
        heatmapRangeSelect.addEventListener('change', (e) => {
            localStorage.setItem('cfg_heatmapRange', e.target.value);
            if (typeof calculateAdherence === 'function') calculateAdherence();
        });
    }
}

function bindTabListeners() {
    getEl('tab-today')?.addEventListener('click', () => switchTab('today'));
    getEl('tab-history')?.addEventListener('click', () => switchTab('history'));
    const dashFunc = () => window.location.href = 'index.html';
    getEl('nav-dashboard')?.addEventListener('click', dashFunc);
    getEl('header-dash')?.addEventListener('click', dashFunc);
}

function bindVaultListeners() {
    getEl('btn-export-vault')?.addEventListener('click', exportVaultLocal);
    getEl('import-vault-file')?.addEventListener('change', importVaultLocal);
    getEl('btn-cloud-push')?.addEventListener('click', pushToGoogleDrive);
    getEl('btn-cloud-pull')?.addEventListener('click', pullFromGoogleDrive);
    getEl('btn-gdrive-login')?.addEventListener('click', () => typeof loginGoogleDrive === 'function' && loginGoogleDrive());
    getEl('btn-gdrive-logout')?.addEventListener('click', () => typeof logoutGoogleDrive === 'function' && logoutGoogleDrive());
}

function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (AppSettings.expertMode && e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            const checked = document.querySelectorAll('#checklist-container .med-checkbox:checked:not(:disabled)');
            checked.length > 0 ? logSelected() : logAll();
        }
    });
}

function bindGlobalErrorHandler() {
    window.addEventListener('error', (e) => {
        console.error("MedLedger runtime error:", e);
        if (typeof showVaultStatus === 'function') {
            showVaultStatus("App issue detected.", "var(--danger-color)");
        }
    });
}

function fullAppInit() {
    if (typeof loadChecklist === 'function') loadChecklist();
    if (typeof refreshHistory === 'function') refreshHistory();
    if (typeof calculateAdherence === 'function') calculateAdherence();
    if (typeof populateProfileDropdowns === 'function') populateProfileDropdowns();
}

function initDB() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        const oldVersion = e.oldVersion;
        if (oldVersion < 1) {
            db.createObjectStore("meds", { keyPath: "id" });
            db.createObjectStore("logs", { keyPath: "timestamp" });
            db.createObjectStore("clinical_cache", { keyPath: "id" });
        }
        if (oldVersion < 3 && !db.objectStoreNames.contains("archived_logs")) {
            db.createObjectStore("archived_logs", { keyPath: "timestamp" });
        }
        if (oldVersion >= 1 && oldVersion < 6) {
            const medStore = e.target.transaction.objectStore("meds");
            medStore.openCursor().onsuccess = (ev) => {
                const cursor = ev.target.result;
                if (cursor) {
                    const med = cursor.value;
                    if (med.prescribedQty === undefined) {
                        med.prescribedQty = (typeof getTypicalPrescribedQuantity === 'function') ? getTypicalPrescribedQuantity(med.name) : 30;
                        cursor.update(med);
                    }
                    cursor.continue();
                }
            };
        }
    };
    request.onsuccess = (e) => { db = e.target.result; fullAppInit(); };
    request.onerror = (e) => { if(typeof showVaultStatus === 'function') showVaultStatus("Database error.", "var(--danger-color)"); };
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('Service Worker Failed:', err));
    }
}

window.fullAppInit = fullAppInit;
