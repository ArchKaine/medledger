// ==========================================
// app.js - MedLedger Bootloader & DB Config
// ==========================================

const GOOGLE_CLIENT_ID = '254319619201-8m0phsnf5eftqpllis3kt0a03l56r6v8.apps.googleusercontent.com';

const DB_NAME = "MedLedgerDB";
const DB_VERSION = 3;
let db;
let tokenClient;
let gapiToken = null;

// --- Config State ---
const AppSettings = {
    noBabysitter: localStorage.getItem('cfg_noBabysitter') === 'true',
    expertMode: localStorage.getItem('cfg_expertMode') === 'true',
    reminders: localStorage.getItem('cfg_reminders') === 'true',
    inventory: localStorage.getItem('cfg_inventory') === 'true'
};

// --- DOM Elements (Core Bootloader Needs) ---
let checklistContainer, historyList, addMedForm, editModal, editForm, settingsModal, helpModal;

// --- Initialization / Bootloader ---
document.addEventListener('DOMContentLoaded', () => {
    // Bind core elements used directly by the engine
    checklistContainer = document.getElementById('checklist-container');
    historyList = document.getElementById('history-list');
    addMedForm = document.getElementById('add-med-form');
    editModal = document.getElementById('edit-med-modal');
    editForm = document.getElementById('edit-med-form');
    settingsModal = document.getElementById('settings-modal');
    helpModal = document.getElementById('help-modal');

    // Boot UI and Database
    if(typeof initializeTheme === 'function') initializeTheme();
    if(typeof initSettings === 'function') initSettings();
    initDB();
    registerServiceWorker();

    // Hook up Engine Listeners (Core Logic)
    document.getElementById('btn-submit-selected')?.addEventListener('click', logSelected);
    document.getElementById('btn-submit-all')?.addEventListener('click', logAll);
    document.getElementById('add-med-form')?.addEventListener('submit', handleAddMed);
    
    document.getElementById('edit-med-form')?.addEventListener('submit', saveEditedMed);
    
    // Modal Interactions (UI Logic)
    document.getElementById('settings-toggle')?.addEventListener('click', () => {
        settingsModal?.showModal();
    });
    document.getElementById('help-toggle')?.addEventListener('click', () => {
        helpModal?.showModal();
    });

    // Connect to external modules
    document.getElementById('btn-peek-password')?.addEventListener('click', togglePasswordVisibility);
    document.getElementById('btn-lock-vault')?.addEventListener('click', lockVaultSession);
    document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
    document.getElementById('btn-export-html')?.addEventListener('click', exportHTMLReport);
    document.getElementById('btn-archive-logs')?.addEventListener('click', archiveOldLogs);
    document.getElementById('btn-restore-archives')?.addEventListener('click', restoreArchivedLogs);
    
    // Heatmap Dropdown Persist & Event
    const heatmapRangeSelect = document.getElementById('heatmap-range');
    if (heatmapRangeSelect) {
        const savedRange = localStorage.getItem('cfg_heatmapRange');
        if (savedRange) heatmapRangeSelect.value = savedRange;
        
        heatmapRangeSelect.addEventListener('change', (e) => {
            localStorage.setItem('cfg_heatmapRange', e.target.value);
            if (typeof calculateAdherence === 'function') calculateAdherence();
        });
    }

    // GUARANTEED TAB LISTENERS
    document.getElementById('tab-today')?.addEventListener('click', () => switchTab('today'));
    document.getElementById('tab-history')?.addEventListener('click', () => switchTab('history'));

    document.getElementById('btn-export-vault')?.addEventListener('click', exportVaultLocal);
    document.getElementById('import-vault-file')?.addEventListener('change', importVaultLocal);
    document.getElementById('btn-cloud-push')?.addEventListener('click', pushToGoogleDrive);
    document.getElementById('btn-cloud-pull')?.addEventListener('click', pullFromGoogleDrive);

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (AppSettings.expertMode && e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            const checked = document.querySelectorAll('#checklist-container .med-checkbox:checked:not(:disabled)');
            checked.length > 0 ? logSelected() : logAll();
        }
    });

    // Global error handler
    window.addEventListener('error', (e) => {
        console.error("MedLedger runtime error:", e.error || e);
        if (typeof showVaultStatus === 'function') {
            showVaultStatus("App encountered an issue. Check console.", "var(--danger-color)");
        }
    });

    // ROBUST INITIALIZATION
    setTimeout(fullAppInit, 150);
});

function fullAppInit() {
    if (typeof loadChecklist === 'function') loadChecklist();
    if (typeof refreshHistory === 'function') refreshHistory();
    if (typeof calculateAdherence === 'function') calculateAdherence();
}

// --- Database Initialization ---
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
            medStore.openCursor().onsuccess = (event) => {
                const cursor = event.target.result;
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
    };
    
    request.onsuccess = (e) => {
        db = e.target.result;
        console.log("✅ MedLedger Database initialized successfully");
        fullAppInit();
    };
    request.onerror = (e) => {
        console.error("Database error: ", e.target.errorCode);
        if(typeof showVaultStatus === 'function') showVaultStatus("Database connection error.", "var(--danger-color)");
    };
}

// --- Service Worker ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('Service Worker Failed:', err));
    }
}

window.fullAppInit = fullAppInit;
