// ==========================================
// app.js - MedLedger Bootloader & DB Config
// ==========================================

const GOOGLE_CLIENT_ID = '254319619201-8m0phsnf5eftqpllis3kt0a03l56r6v8.apps.googleusercontent.com';

const DB_NAME = "MedLedgerDB";
const DB_VERSION = 5; // Schema V5: Multi-Profile & Efficacy
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
    activeProfile: localStorage.getItem('cfg_activeProfile') || 'Primary'
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

    if(typeof initializeTheme === 'function') initializeTheme();
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

    setTimeout(fullAppInit, 150);
});

function bindCoreListeners() {
    getEl('btn-submit-selected')?.addEventListener('click', logSelected);
    getEl('btn-submit-all')?.addEventListener('click', logAll);
    getEl('add-med-form')?.addEventListener('submit', handleAddMed);
    getEl('btn-delete-med')?.addEventListener('click', deleteMedication);
    getEl('edit-med-form')?.addEventListener('submit', saveEditedMed);
    
    // Profile Filter Change
    getEl('profile-filter')?.addEventListener('change', (e) => {
        AppSettings.activeProfile = e.target.value;
        localStorage.setItem('cfg_activeProfile', e.target.value);
        loadChecklist();
        refreshHistory();
        if(typeof calculateAdherence === 'function') calculateAdherence();
    });
}

function bindModalListeners() {
    getEl('settings-toggle')?.addEventListener('click', () => {
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
    });
    getEl('btn-close-settings')?.addEventListener('click', () => settingsModal?.close());
    
    getEl('help-toggle')?.addEventListener('click', () => {
        helpModal?.showModal();
        if(helpModal) helpModal.scrollTop = 0;
    });
    getEl('btn-close-help')?.addEventListener('click', () => helpModal?.close());
}

function bindExportListeners() {
    getEl('btn-peek-password')?.addEventListener('click', togglePasswordVisibility);
    getEl('btn-lock-vault')?.addEventListener('click', lockVaultSession);
    getEl('btn-export-csv')?.addEventListener('click', exportCSV);
    getEl('btn-export-html')?.addEventListener('click', exportHTMLReport);
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
}

function bindVaultListeners() {
    getEl('btn-export-vault')?.addEventListener('click', exportVaultLocal);
    getEl('import-vault-file')?.addEventListener('change', importVaultLocal);
    getEl('btn-cloud-push')?.addEventListener('click', pushToGoogleDrive);
    getEl('btn-cloud-pull')?.addEventListener('click', pullFromGoogleDrive);
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
            showVaultStatus("App encountered an issue. Check console.", "var(--danger-color)");
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
        const transaction = e.target.transaction;

        if (oldVersion < 1) {
            db.createObjectStore("meds", { keyPath: "id" });
            db.createObjectStore("logs", { keyPath: "timestamp" });
        }
        
        if (oldVersion >= 1 && oldVersion < 2) {
            const medStore = transaction.objectStore("meds");
            medStore.openCursor().onsuccess = (ev) => {
                const cursor = ev.target.result;
                if (cursor) {
                    const med = cursor.value;
                    if (med.sideEffects === undefined) med.sideEffects = "";
                    cursor.update(med);
                    cursor.continue();
                }
            };
        }
        
        if (oldVersion < 3) {
            if (!db.objectStoreNames.contains("archived_logs")) {
                db.createObjectStore("archived_logs", { keyPath: "timestamp" });
            }
        }

        if (oldVersion >= 1 && oldVersion < 4) {
            const medStore = transaction.objectStore("meds");
            medStore.openCursor().onsuccess = (ev) => {
                const cursor = ev.target.result;
                if (cursor) {
                    const med = cursor.value;
                    let changed = false;
                    if (med.rxNumber === undefined) { med.rxNumber = ""; changed = true; }
                    if (med.doctor === undefined) { med.doctor = ""; changed = true; }
                    if (med.pharmacyPhone === undefined) { med.pharmacyPhone = ""; changed = true; }
                    if (changed) cursor.update(med);
                    cursor.continue();
                }
            };
        }

        // V5 Migration: Profile Isolation & Efficacy
        if (oldVersion >= 1 && oldVersion < 5) {
            const medStore = transaction.objectStore("meds");
            const logStore = transaction.objectStore("logs");

            medStore.openCursor().onsuccess = (ev) => {
                const cursor = ev.target.result;
                if (cursor) {
                    const med = cursor.value;
                    if (med.profile === undefined) med.profile = "Primary";
                    cursor.update(med);
                    cursor.continue();
                }
            };

            logStore.openCursor().onsuccess = (ev) => {
                const cursor = ev.target.result;
                if (cursor) {
                    const log = cursor.value;
                    if (log.profile === undefined) log.profile = "Primary";
                    if (log.efficacy === undefined) log.efficacy = "";
                    cursor.update(log);
                    cursor.continue();
                }
            };
        }
    };
    
    request.onsuccess = (e) => {
        db = e.target.result;
        console.log("✅ MedLedger DB ready (V" + DB_VERSION + ")");
        fullAppInit();
    };
    request.onerror = (e) => {
        console.error("Database error: ", e.target.errorCode);
        if(typeof showVaultStatus === 'function') showVaultStatus("Database connection error.", "var(--danger-color)");
    };
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('Service Worker Failed:', err));
    }
}

window.fullAppInit = fullAppInit;
