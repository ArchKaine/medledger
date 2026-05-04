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

// --- Initialization / Bootloader ---
document.addEventListener('DOMContentLoaded', () => {

    // Boot UI and Database
    if(typeof initializeTheme === 'function') initializeTheme();
    if(typeof initSettings === 'function') initSettings();
    initDB();
    registerServiceWorker();

    // Hook up Engine Listeners (Core Logic)
    document.getElementById('btn-submit-selected')?.addEventListener('click', logSelected);
    document.getElementById('btn-submit-all')?.addEventListener('click', logAll);
    document.getElementById('add-med-form')?.addEventListener('click', (e) => {
        if(e.target.type === 'submit') handleAddMed(e);
    });
    
    const editModal = document.getElementById('edit-med-modal');
    document.getElementById('btn-cancel-edit')?.addEventListener('click', () => editModal?.close());
    document.getElementById('btn-delete-med')?.addEventListener('click', deleteMedication);
    document.getElementById('edit-med-form')?.addEventListener('submit', saveEditedMed);
    
    // Modal Interactions (UI Logic)
    const settingsModal = document.getElementById('settings-modal');
    document.getElementById('settings-toggle')?.addEventListener('click', () => {
        const cachedPass = sessionStorage.getItem('medledger_session_key');
        const vaultPassInput = document.getElementById('vault-password');
        const sessionLockControls = document.getElementById('session-lock-controls');
        
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
    document.getElementById('btn-close-settings')?.addEventListener('click', () => settingsModal?.close());
    
    const helpModal = document.getElementById('help-modal');
    document.getElementById('help-toggle')?.addEventListener('click', () => {
        helpModal?.showModal();
        if(helpModal) helpModal.scrollTop = 0; 
    });
    document.getElementById('btn-close-help')?.addEventListener('click', () => helpModal?.close());

    // Connect to external modules
    document.getElementById('btn-peek-password')?.addEventListener('click', togglePasswordVisibility);
    document.getElementById('btn-lock-vault')?.addEventListener('click', lockVaultSession);
    document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
    document.getElementById('btn-export-html')?.addEventListener('click', exportHTMLReport);
    document.getElementById('btn-archive-logs')?.addEventListener('click', archiveOldLogs);
    document.getElementById('btn-restore-archives')?.addEventListener('click', restoreArchivedLogs);
    
    document.getElementById('heatmap-range')?.addEventListener('change', calculateAdherence);
    
    const heatmapRangeSelect = document.getElementById('heatmap-range');
    if (heatmapRangeSelect) {
        const savedRange = localStorage.getItem('cfg_heatmapRange');
        if (savedRange) heatmapRangeSelect.value = savedRange;
        
        heatmapRangeSelect.addEventListener('change', (e) => {
            localStorage.setItem('cfg_heatmapRange', e.target.value);
            if (typeof calculateAdherence === 'function') calculateAdherence();
        });
    }
    
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
});

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
        if(typeof loadChecklist === 'function') loadChecklist();
        if(typeof refreshHistory === 'function') refreshHistory();
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
