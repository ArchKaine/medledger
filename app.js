// ==========================================
// REPLACE THIS WITH YOUR GENERATED CLIENT ID
const GOOGLE_CLIENT_ID = '254319619201-8m0phsnf5eftqpllis3kt0a03l56r6v8.apps.googleusercontent.com';
// ==========================================

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

// --- DOM Elements (Populated on Load to Prevent Init Crashes) ---
let themeToggleBtn, rootElement, statusBar, checklistContainer, historyList, addMedForm, editModal, editForm;
let settingsModal, toggleBabysitter, toggleExpert, toggleReminders, toggleInventory;
let newMedInventory, editInventoryGroup, vaultPassInput, vaultStatus, peekBtn, peekIcon, helpModal;
let tabTodayBtn, tabHistoryBtn, dailyScheduleView, logHistoryView, sessionLockControls;
let btnLockVault, btnExportCSV, btnExportHTML, adherenceScore, adherenceSubtext, heatmapRangeSelect;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Safely bind all elements
        themeToggleBtn = document.getElementById('theme-toggle');
        rootElement = document.documentElement;
        statusBar = document.getElementById('status-bar');
        checklistContainer = document.getElementById('checklist-container');
        historyList = document.getElementById('history-list');
        addMedForm = document.getElementById('add-med-form');
        editModal = document.getElementById('edit-med-modal');
        editForm = document.getElementById('edit-med-form');
        settingsModal = document.getElementById('settings-modal');
        toggleBabysitter = document.getElementById('toggle-babysitter');
        toggleExpert = document.getElementById('toggle-expert');
        toggleReminders = document.getElementById('toggle-reminders');
        toggleInventory = document.getElementById('toggle-inventory');
        newMedInventory = document.getElementById('new-med-inventory');
        editInventoryGroup = document.getElementById('edit-inventory-group');
        vaultPassInput = document.getElementById('vault-password');
        vaultStatus = document.getElementById('vault-status');
        peekBtn = document.getElementById('btn-peek-password');
        peekIcon = document.getElementById('peek-icon');
        helpModal = document.getElementById('help-modal');
        tabTodayBtn = document.getElementById('tab-today');
        tabHistoryBtn = document.getElementById('tab-history');
        dailyScheduleView = document.getElementById('daily-schedule');
        logHistoryView = document.getElementById('log-history');
        sessionLockControls = document.getElementById('session-lock-controls');
        btnLockVault = document.getElementById('btn-lock-vault');
        btnExportCSV = document.getElementById('btn-export-csv');
        btnExportHTML = document.getElementById('btn-export-html');
        adherenceScore = document.getElementById('adherence-score');
        adherenceSubtext = document.getElementById('adherence-subtext');
        heatmapRangeSelect = document.getElementById('heatmap-range');

        // Boot Sequence
        initializeTheme();
        initSettings();
        injectAdvancedUI(); 
        initDB();
        registerServiceWorker();

        // Safe Event Listeners
        if (document.getElementById('btn-submit-selected')) document.getElementById('btn-submit-selected').addEventListener('click', logSelected);
        if (document.getElementById('btn-submit-all')) document.getElementById('btn-submit-all').addEventListener('click', logAll);
        if (addMedForm) addMedForm.addEventListener('submit', handleAddMed);
        if (document.getElementById('btn-cancel-edit')) document.getElementById('btn-cancel-edit').addEventListener('click', () => { if (editModal) editModal.close(); });
        if (document.getElementById('btn-delete-med')) document.getElementById('btn-delete-med').addEventListener('click', deleteMedication);
        if (editForm) editForm.addEventListener('submit', saveEditedMed);
        
        if (document.getElementById('settings-toggle')) document.getElementById('settings-toggle').addEventListener('click', () => {
            const cachedPass = sessionStorage.getItem('medledger_session_key');
            if (vaultPassInput && sessionLockControls) {
                if (cachedPass) {
                    vaultPassInput.value = cachedPass;
                    sessionLockControls.style.display = 'flex';
                } else {
                    vaultPassInput.value = '';
                    sessionLockControls.style.display = 'none';
                }
            }
            if (settingsModal) {
                settingsModal.showModal();
                settingsModal.scrollTop = 0; 
            }
        });
        
        if (document.getElementById('btn-close-settings')) document.getElementById('btn-close-settings').addEventListener('click', () => { if (settingsModal) settingsModal.close(); });
        
        if (document.getElementById('help-toggle')) document.getElementById('help-toggle').addEventListener('click', () => {
            if (helpModal) {
                helpModal.showModal();
                helpModal.scrollTop = 0; 
            }
        });
        if (document.getElementById('btn-close-help')) document.getElementById('btn-close-help').addEventListener('click', () => { if (helpModal) helpModal.close(); });

        if (peekBtn) peekBtn.addEventListener('click', togglePasswordVisibility);
        if (btnLockVault) btnLockVault.addEventListener('click', lockVaultSession);
        if (btnExportCSV) btnExportCSV.addEventListener('click', exportCSV);
        if (btnExportHTML) btnExportHTML.addEventListener('click', exportHTMLReport);

        const btnArchiveLogs = document.getElementById('btn-archive-logs');
        if (btnArchiveLogs) btnArchiveLogs.addEventListener('click', archiveOldLogs);
        
        const btnRestoreArchives = document.getElementById('btn-restore-archives');
        if (btnRestoreArchives) btnRestoreArchives.addEventListener('click', restoreArchivedLogs);

        if (heatmapRangeSelect) {
            heatmapRangeSelect.addEventListener('change', calculateAdherence);
        }

        if (tabTodayBtn) tabTodayBtn.addEventListener('click', () => switchTab('today'));
        if (tabHistoryBtn) tabHistoryBtn.addEventListener('click', () => switchTab('history'));

        if (document.getElementById('btn-export-vault')) document.getElementById('btn-export-vault').addEventListener('click', exportVaultLocal);
        if (document.getElementById('import-vault-file')) document.getElementById('import-vault-file').addEventListener('change', importVaultLocal);

        if (document.getElementById('btn-cloud-push')) document.getElementById('btn-cloud-push').addEventListener('click', pushToGoogleDrive);
        if (document.getElementById('btn-cloud-pull')) document.getElementById('btn-cloud-pull').addEventListener('click', pullFromGoogleDrive);

        document.addEventListener('keydown', (e) => {
            if (AppSettings.expertMode && e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                const checked = document.querySelectorAll('#checklist-container .med-checkbox:checked:not(:disabled)');
                checked.length > 0 ? logSelected() : logAll();
            }
        });
    } catch (err) {
        console.error("Critical Boot Failure:", err);
        if (statusBar) statusBar.textContent = "Initialization Error. Check Console.";
    }
});

// --- Theme Logic ---
function updateThemeIcon(theme) {
    if (!themeToggleBtn) return;
    if (theme === 'light') {
        themeToggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    } else if (theme === 'hc') {
        themeToggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 0 0 20z" fill="currentColor"></path></svg>`;
    } else {
        themeToggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    }
}

function initializeTheme() {
    let savedTheme = localStorage.getItem('theme');
    if (savedTheme !== 'dark' && savedTheme !== 'light' && savedTheme !== 'hc') {
        savedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (rootElement) rootElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            let currentTheme = rootElement.getAttribute('data-theme');
            let newTheme = currentTheme === 'dark' ? 'light' : (currentTheme === 'light' ? 'hc' : 'dark');
            rootElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }
}

// --- Tab Logic ---
function switchTab(tab) {
    try {
        if (tab === 'today') {
            if (tabTodayBtn) tabTodayBtn.classList.add('active');
            if (tabHistoryBtn) tabHistoryBtn.classList.remove('active');
            if (dailyScheduleView) dailyScheduleView.classList.remove('hidden-view');
            if (logHistoryView) logHistoryView.classList.add('hidden-view');
        } else {
            if (tabHistoryBtn) tabHistoryBtn.classList.add('active');
            if (tabTodayBtn) tabTodayBtn.classList.remove('active');
            if (logHistoryView) logHistoryView.classList.remove('hidden-view');
            if (dailyScheduleView) dailyScheduleView.classList.add('hidden-view');
            calculateAdherence(); 
        }
    } catch (e) {
        console.error("Tab switch failed:", e);
    }
}

window.addTimeField = function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const input = document.createElement('input');
    input.type = 'time';
    input.className = 'time-input';
    input.style.cssText = 'padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--bg-primary); color: var(--text-primary); font-family: inherit; margin-top: 0.25rem;';
    container.appendChild(input);
    input.focus(); 
};

function getTimesFromContainer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const inputs = container.querySelectorAll('input[type="time"]');
    let times = [];
    inputs.forEach(input => {
        if (input.value) times.push(input.value);
    });
    return [...new Set(times)].sort();
}

// --- Settings Logic ---
function initSettings() {
    if (toggleBabysitter) toggleBabysitter.checked = AppSettings.noBabysitter;
    if (toggleExpert) toggleExpert.checked = AppSettings.expertMode;
    if (toggleReminders) toggleReminders.checked = AppSettings.reminders;
    if (toggleInventory) toggleInventory.checked = AppSettings.inventory;

    if (newMedInventory) newMedInventory.style.display = AppSettings.inventory ? 'block' : 'none';

    if (toggleBabysitter) {
        toggleBabysitter.addEventListener('change', (e) => {
            AppSettings.noBabysitter = e.target.checked;
            localStorage.setItem('cfg_noBabysitter', e.target.checked);
        });
    }

    if (toggleExpert) {
        toggleExpert.addEventListener('change', (e) => {
            AppSettings.expertMode = e.target.checked;
            localStorage.setItem('cfg_expertMode', e.target.checked);
            loadChecklist(); 
        });
    }

    if (toggleInventory) {
        toggleInventory.addEventListener('change', (e) => {
            AppSettings.inventory = e.target.checked;
            localStorage.setItem('cfg_inventory', e.target.checked);
            if(newMedInventory) newMedInventory.style.display = e.target.checked ? 'block' : 'none';
            loadChecklist(); 
        });
    }

    if (toggleReminders) {
        toggleReminders.addEventListener('change', async (e) => {
            AppSettings.reminders = e.target.checked;
            localStorage.setItem('cfg_reminders', e.target.checked);
            
            if (AppSettings.reminders && Notification.permission !== 'granted') {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    e.target.checked = false;
                    AppSettings.reminders = false;
                    localStorage.setItem('cfg_reminders', 'false');
                    alert("Notification permission denied by your browser/OS.");
                }
            }
        });
    }
}

// --- Advanced Regimen DOM Injection ---
function injectAdvancedUI() {
    const advOptions = `
        <option value="Every Other Day">Every Other Day</option>
        <option value="Cycle 21/7">Cycle (21 On / 7 Off)</option>
        <option value="Weekdays Only">Weekdays Only</option>
        <option value="Weekends Only">Weekends Only</option>
        <option value="Taper">Taper Schedule</option>
    `;

    const newFreq = document.getElementById('new-med-freq');
    if (newFreq && newFreq.tagName === 'SELECT') {
        newFreq.insertAdjacentHTML('beforeend', advOptions);
        const taperHtml = `
            <div id="new-taper-container" style="display:none; padding: 1rem; border: 1px dashed var(--border-color); border-radius: 6px; margin-top: 1rem; background: var(--bg-surface);">
                <label style="font-size: 0.9rem; color: var(--text-secondary);">Taper Steps (Days & Dose)</label>
                <div id="new-taper-steps" style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;"></div>
                <button type="button" class="btn btn-secondary" onclick="addTaperStep('new')" style="margin-top: 0.5rem; font-size: 0.8rem; padding: 0.25rem 0.5rem; width: fit-content;">+ Add Step</button>
            </div>
        `;
        newFreq.insertAdjacentHTML('afterend', taperHtml);
        newFreq.addEventListener('change', (e) => {
            const container = document.getElementById('new-taper-container');
            if (container) {
                container.style.display = e.target.value === 'Taper' ? 'flex' : 'none';
                container.style.flexDirection = 'column';
            }
        });
    }

    const editFreq = document.getElementById('edit-med-freq');
    if (editFreq && editFreq.tagName === 'SELECT') {
        editFreq.insertAdjacentHTML('beforeend', advOptions);
        const taperHtmlEdit = `
            <div id="edit-taper-container" style="display:none; padding: 1rem; border: 1px dashed var(--border-color); border-radius: 6px; margin-top: 1rem; background: var(--bg-surface);">
                <label style="font-size: 0.9rem; color: var(--text-secondary);">Taper Steps (Days & Dose)</label>
                <div id="edit-taper-steps" style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;"></div>
                <button type="button" class="btn btn-secondary" onclick="addTaperStep('edit')" style="margin-top: 0.5rem; font-size: 0.8rem; padding: 0.25rem 0.5rem; width: fit-content;">+ Add Step</button>
            </div>
        `;
        editFreq.insertAdjacentHTML('afterend', taperHtmlEdit);
        editFreq.addEventListener('change', (e) => {
            const container = document.getElementById('edit-taper-container');
            if (container) {
                container.style.display = e.target.value === 'Taper' ? 'flex' : 'none';
                container.style.flexDirection = 'column';
            }
        });
    }
}

window.addTaperStep = function(mode, days = '', dose = '') {
    const container = document.getElementById(`${mode}-taper-steps`);
    if (!container) return;
    const stepHtml = `
        <div class="taper-step" style="display: flex; gap: 0.5rem; align-items: center;">
            <input type="number" class="taper-days" placeholder="Days (e.g. 5)" value="${days}" style="width: 80px; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary);">
            <span style="color: var(--text-secondary);">@</span>
            <input type="text" class="taper-dose" placeholder="Dose (e.g. 10mg)" value="${dose}" style="flex: 1; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary);">
            <button type="button" onclick="this.parentElement.remove()" style="background: none; border: none; color: var(--danger-color); cursor: pointer; font-size: 1.2rem; padding: 0 0.5rem;">&times;</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', stepHtml);
}

function getTaperSteps(mode) {
    const container = document.getElementById(`${mode}-taper-steps`);
    if (!container) return [];
    const steps = [];
    container.querySelectorAll('.taper-step').forEach(row => {
        const days = parseInt(row.querySelector('.taper-days').value);
        const dose = row.querySelector('.taper-dose').value.trim();
        if (days && dose) steps.push({ days, dose });
    });
    return steps;
}

// --- Database Logic & Migration ---
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
        loadChecklist();
        refreshHistory();
    };
    request.onerror = (e) => {
        console.error("Database error: ", e.target.errorCode);
        if (statusBar) statusBar.textContent = "Database error.";
    };
}

// --- Zero-Knowledge Interaction Engine ---
async function checkLocalInteractions(newMedName) {
    try {
        const response = await fetch('interactions.json');
        const interactionDB = await response.json();

        const activeMeds = await new Promise(res => {
            db.transaction(["meds"], "readonly").objectStore("meds").getAll().onsuccess = e => res(e.target.result);
        });

        const newDrug = newMedName.toLowerCase().trim();
        let warnings = [];

        activeMeds.forEach(med => {
            const activeDrug = med.name.toLowerCase().trim();
            if (interactionDB[newDrug] && interactionDB[newDrug][activeDrug]) {
                warnings.push(`Warning with ${med.name}: ${interactionDB[newDrug][activeDrug]}`);
            }
            else if (interactionDB[activeDrug] && interactionDB[activeDrug][newDrug]) {
                warnings.push(`Warning with ${med.name}: ${interactionDB[activeDrug][newDrug]}`);
            }
        });

        return warnings;
    } catch (err) {
        console.warn("Interaction DB not found or failed to load. Bypassing check.");
        return []; 
    }
}

// --- Configuration Logic (Add/Edit/Delete Meds) ---
async function handleAddMed(e) {
    e.preventDefault();
    const nameInput = document.getElementById('new-med-name') ? document.getElementById('new-med-name').value.trim() : "";
    const doseInput = document.getElementById('new-med-dose') ? document.getElementById('new-med-dose').value.trim() : "";
    const freqInput = document.getElementById('new-med-freq') ? document.getElementById('new-med-freq').value : "Daily";
    const instructionsInput = document.getElementById('new-med-instructions') ? document.getElementById('new-med-instructions').value.trim() : "";
    const sideEffectsInput = document.getElementById('new-med-side-effects') ? document.getElementById('new-med-side-effects').value.trim() : "";
    const inventoryInput = document.getElementById('new-med-inventory') ? document.getElementById('new-med-inventory').value.trim() : "";
    const timesArray = getTimesFromContainer('new-med-times-container');
    const taperSteps = freqInput === 'Taper' ? getTaperSteps('new') : [];

    if (!nameInput || !doseInput) return;

    const warnings = await checkLocalInteractions(nameInput);
    if (warnings.length > 0) {
        const alertMessage = `⚠️ POTENTIAL INTERACTION DETECTED ⚠️\n\n${warnings.join('\n\n')}\n\nDo you still want to add this medication to your regimen?`;
        if (!confirm(alertMessage)) {
            showVaultStatus("Medication aborted.", "var(--text-secondary)");
            return; 
        }
    }

    const newMed = { 
        id: crypto.randomUUID(), 
        name: nameInput, 
        dose: doseInput, 
        frequency: freqInput,
        taperSteps: taperSteps,
        startDate: new Date().toISOString(),
        times: timesArray,
        instructions: instructionsInput,
        sideEffects: sideEffectsInput,
        inventory: AppSettings.inventory ? inventoryInput : ""
    };
    
    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").add(newMed);

    transaction.oncomplete = () => {
        if (addMedForm) addMedForm.reset();
        if (document.getElementById('new-med-freq')) document.getElementById('new-med-freq').value = 'Daily'; 
        const taperContainer = document.getElementById('new-taper-container');
        if (taperContainer) taperContainer.style.display = 'none';
        
        const timesContainer = document.getElementById('new-med-times-container');
        if (timesContainer) {
            timesContainer.innerHTML = `<input type="time" class="time-input" style="padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--bg-primary); color: var(--text-primary); font-family: inherit;">`;
        }
        
        loadChecklist();
        if (warnings.length > 0) {
            showVaultStatus("Medication added with warnings.", "var(--danger-color)");
        }
    };
}

window.openEditModal = function(id) {
    const transaction = db.transaction(["meds"], "readonly");
    const request = transaction.objectStore("meds").get(id);

    request.onsuccess = () => {
        const med = request.result;
        if (med) {
            if (document.getElementById('edit-med-id')) document.getElementById('edit-med-id').value = med.id;
            if (document.getElementById('edit-med-name')) document.getElementById('edit-med-name').value = med.name;
            if (document.getElementById('edit-med-dose')) document.getElementById('edit-med-dose').value = med.dose;
            if (document.getElementById('edit-med-freq')) document.getElementById('edit-med-freq').value = med.frequency || 'Daily';
            if (document.getElementById('edit-med-instructions')) document.getElementById('edit-med-instructions').value = med.instructions || '';
            if (document.getElementById('edit-med-side-effects')) document.getElementById('edit-med-side-effects').value = med.sideEffects || ''; 
            
            if (AppSettings.inventory && editInventoryGroup) {
                editInventoryGroup.style.display = 'block';
                if (document.getElementById('edit-med-inventory')) document.getElementById('edit-med-inventory').value = med.inventory || '';
            } else if (editInventoryGroup) {
                editInventoryGroup.style.display = 'none';
            }
            
            const editTaperContainer = document.getElementById('edit-taper-container');
            const editTaperSteps = document.getElementById('edit-taper-steps');
            if (editTaperSteps) editTaperSteps.innerHTML = ''; 
            
            if (med.frequency === 'Taper' && editTaperContainer) {
                editTaperContainer.style.display = 'flex';
                editTaperContainer.style.flexDirection = 'column';
                if (med.taperSteps) {
                    med.taperSteps.forEach(step => addTaperStep('edit', step.days, step.dose));
                }
            } else if (editTaperContainer) {
                editTaperContainer.style.display = 'none';
            }
            
            let timesToRender = med.times || [];
            if (!med.times && med.time) timesToRender = [med.time];

            const timesContainer = document.getElementById('edit-med-times-container');
            if (timesContainer) {
                timesContainer.innerHTML = ''; 
                if (timesToRender.length === 0) {
                    addTimeField('edit-med-times-container'); 
                } else {
                    timesToRender.forEach(timeVal => {
                        addTimeField('edit-med-times-container');
                        timesContainer.lastElementChild.value = timeVal;
                    });
                }
            }
            if (editModal) {
                editModal.showModal();
                editModal.scrollTop = 0; 
            }
            if (document.getElementById('edit-med-name')) document.getElementById('edit-med-name').focus(); 
        }
    };
};

function saveEditedMed(e) {
    e.preventDefault();
    const id = document.getElementById('edit-med-id') ? document.getElementById('edit-med-id').value : "";
    if (!id) return;
    
    const name = document.getElementById('edit-med-name') ? document.getElementById('edit-med-name').value.trim() : "";
    const dose = document.getElementById('edit-med-dose') ? document.getElementById('edit-med-dose').value.trim() : "";
    const freq = document.getElementById('edit-med-freq') ? document.getElementById('edit-med-freq').value : "Daily";
    const instructions = document.getElementById('edit-med-instructions') ? document.getElementById('edit-med-instructions').value.trim() : "";
    const sideEffects = document.getElementById('edit-med-side-effects') ? document.getElementById('edit-med-side-effects').value.trim() : ""; 
    const inventory = AppSettings.inventory ? (document.getElementById('edit-med-inventory') ? document.getElementById('edit-med-inventory').value.trim() : "") : "";
    const timesArray = getTimesFromContainer('edit-med-times-container');
    const taperSteps = freq === 'Taper' ? getTaperSteps('edit') : [];

    const transaction = db.transaction(["meds"], "readwrite");
    const medStore = transaction.objectStore("meds");
    
    medStore.get(id).onsuccess = (event) => {
        const existingMed = event.target.result;
        if (!existingMed) return;
        
        medStore.put({ 
            id: id, 
            name: name, 
            dose: dose, 
            frequency: freq,
            taperSteps: taperSteps,
            startDate: existingMed.startDate || new Date().toISOString(), 
            times: timesArray,
            instructions: instructions,
            sideEffects: sideEffects,
            inventory: inventory
        });
    };

    transaction.oncomplete = () => {
        if (editModal) editModal.close();
        loadChecklist();
    };
}

function deleteMedication() {
    if (!AppSettings.noBabysitter && !confirm("Remove this medication completely from the regimen?")) return;
    const id = document.getElementById('edit-med-id') ? document.getElementById('edit-med-id').value : null;
    if (!id) return;
    
    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").delete(id);

    transaction.oncomplete = () => {
        if (editModal) editModal.close();
        loadChecklist();
    };
}

// --- Core Engine: State Resolution Simulator ---
function getMedStateOnDate(med, targetDate) {
    let state = { shouldRender: true, dose: med.dose, freqLabel: med.frequency };
    
    if (med.frequency === "As Needed") {
        state.shouldRender = true;
        return state;
    }

    if (med.startDate) {
        const tDate = new Date(targetDate);
        tDate.setHours(0,0,0,0);
        const sDate = new Date(med.startDate);
        sDate.setHours(0,0,0,0);
        
        // Math.round fixes the "daylight savings time" 23-hour day bug
        const daysElapsed = Math.round((tDate - sDate) / (1000 * 60 * 60 * 24));
        
        if (isNaN(daysElapsed) || daysElapsed < 0) {
            state.shouldRender = false; 
            return state;
        }

        if (med.frequency === "Every Other Day" && daysElapsed % 2 !== 0) {
            state.shouldRender = false;
        } else if (med.frequency === "Cycle 21/7") {
            const cycleDay = daysElapsed % 28;
            if (cycleDay >= 21) state.shouldRender = false;
            state.freqLabel = `Cycle (Day ${cycleDay + 1}/28)`;
        } else if (med.frequency === "Weekdays Only" && (tDate.getDay() === 0 || tDate.getDay() === 6)) {
            state.shouldRender = false;
        } else if (med.frequency === "Weekends Only" && (tDate.getDay() !== 0 && tDate.getDay() !== 6)) {
            state.shouldRender = false;
        } else if (med.frequency === "Taper" && Array.isArray(med.taperSteps)) {
            let runningDays = 0;
            let activeStep = null;
            for (let step of med.taperSteps) {
                if (daysElapsed >= runningDays && daysElapsed < runningDays + step.days) {
                    activeStep = step;
                    break;
                }
                runningDays += step.days;
            }
            
            if (activeStep) {
                state.dose = activeStep.dose;
                state.freqLabel = `Taper (Day ${daysElapsed + 1})`;
            } else {
                state.shouldRender = false; 
            }
        }
    }
    return state;
}

// --- Regimen Logic (Checklist & Logging) ---
function loadChecklist() {
    if (!checklistContainer || !db) return;
    
    const tx = db.transaction(["meds", "logs"], "readonly");
    const medReq = tx.objectStore("meds").getAll();
    const logReq = tx.objectStore("logs").getAll();

    tx.oncomplete = () => {
        try {
            const rawMeds = medReq.result;
            const logs = logReq.result;
            checklistContainer.innerHTML = '';

            if (rawMeds.length === 0) {
                checklistContainer.innerHTML = '<p style="color: var(--text-secondary);">No medications added yet.</p>';
                if (statusBar) statusBar.textContent = "Ready.";
                return;
            }

            rawMeds.sort((a, b) => {
                const freqWeight = { "Morning": 1, "Daily": 2, "Night": 3, "Weekly": 4, "As Needed": 5 };
                const weightA = freqWeight[a.frequency] || 99;
                const weightB = freqWeight[b.frequency] || 99;
                if (weightA !== weightB) return weightA - weightB;
                return (a.name || "").localeCompare(b.name || "");
            });

            const todayStr = new Date().toLocaleDateString();

            rawMeds.forEach(med => {
                const state = getMedStateOnDate(med, new Date());
                if (!state.shouldRender) return; 

                let times = med.times && med.times.length > 0 ? med.times : [null];
                const freqClass = med.frequency === "As Needed" ? "freq-badge prn" : "freq-badge";
                const freqHtml = state.freqLabel ? `<span class="${freqClass}">${state.freqLabel}</span>` : '';

                const safeMedName = med.name ? med.name.replace(/"/g, '&quot;') : "Unknown";

                let inventoryBadgeHtml = '';
                if (AppSettings.inventory && med.inventory !== undefined && med.inventory !== "") {
                    const invCount = parseInt(med.inventory);
                    const isLow = invCount <= 10;
                    const badgeColor = isLow ? 'var(--danger-color)' : 'var(--text-secondary)';
                    const badgeBg = isLow ? 'rgba(239, 68, 68, 0.15)' : 'transparent';
                    const badgeBorder = isLow ? 'var(--danger-color)' : 'var(--border-color)';
                    inventoryBadgeHtml = `<span style="margin-left: 0.5rem; font-size: 0.75rem; background: ${badgeBg}; color: ${badgeColor}; padding: 0.1rem 0.5rem; border-radius: 12px; border: 1px solid ${badgeBorder}; font-weight: ${isLow ? 'bold' : 'normal'};">💊 ${invCount} left</span>`;
                }

                const card = document.createElement('div');
                card.className = 'card';
                card.style.padding = '0';
                card.style.overflow = 'hidden';
                card.style.marginBottom = '1rem';

                const headerHtml = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem; border-bottom: 1px solid var(--border-color); background-color: var(--bg-surface);">
                        <div>
                            <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                ${safeMedName} ${freqHtml}
                            </h3>
                            <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.25rem; display: flex; align-items: center;">
                                ${state.dose} ${inventoryBadgeHtml}
                            </div>
                        </div>
                        <button type="button" class="icon-btn" onclick="openEditModal('${med.id}')" aria-label="Edit" style="margin: -0.25rem -0.25rem 0 0;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                    </div>
                `;

                let checkboxesHtml = '<div class="checklist" style="padding: 0.5rem 1rem;">';
                
                times.forEach(t => {
                    const compositeLogId = t ? `${med.id}|${t}` : `${med.id}|none`;
                    const isCompletedToday = logs.some(log => 
                        log.compositeId === compositeLogId && 
                        new Date(log.dateTaken).toLocaleDateString() === todayStr
                    );

                    let timeLabel = "Take Dosage";
                    if (t) {
                        const [h, m] = t.split(':');
                        const period = h >= 12 ? 'PM' : 'AM';
                        const formattedHour = h % 12 || 12;
                        timeLabel = `@ ${formattedHour}:${m} ${period}`;
                    } else if (med.frequency === 'As Needed') {
                        timeLabel = "Log PRN Dose";
                    }

                    const labelId = 'lbl-' + crypto.randomUUID();

                    checkboxesHtml += `
                        <label class="med-item ${isCompletedToday ? 'completed' : ''}" id="${labelId}" title="${AppSettings.expertMode && !isCompletedToday ? 'Double-click to instantly log' : ''}">
                            <input type="checkbox" name="med" value="${compositeLogId}" data-name="${safeMedName}" class="med-checkbox" ${isCompletedToday ? 'checked disabled' : ''}>
                            <span class="med-details" style="width: 100%;">
                                <span class="med-name" style="color: ${isCompletedToday ? 'var(--text-secondary)' : 'var(--text-primary)'};">${timeLabel}</span>
                            </span>
                        </label>
                    `;

                    if (AppSettings.expertMode && !isCompletedToday) {
                        setTimeout(() => {
                            const el = document.getElementById(labelId);
                            if (el) {
                                el.addEventListener('dblclick', (e) => {
                                    e.preventDefault();
                                    const checkbox = el.querySelector('input');
                                    if (!checkbox.disabled) {
                                        processBatchLog([{
                                            compId: compositeLogId,
                                            medName: med.name,
                                            checkboxElement: checkbox
                                        }]);
                                    }
                                });
                            }
                        }, 0);
                    }
                });
                checkboxesHtml += '</div>';

                let extrasHtml = '';
                if (med.instructions || med.sideEffects) {
                    extrasHtml += `<div style="padding: 0.75rem 1rem; border-top: 1px solid var(--border-color); background-color: var(--bg-primary); display: flex; flex-direction: column; gap: 0.5rem;">`;
                    
                    if (med.instructions) {
                        extrasHtml += `<div class="med-instructions-box" style="margin-top:0;"><i>${med.instructions}</i></div>`;
                    }
                    if (med.sideEffects) {
                        extrasHtml += `<div style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 500; display: flex; align-items: center; gap: 0.35rem;">
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                          ${med.sideEffects}
                                       </div>`;
                    }
                    extrasHtml += `</div>`;
                }

                card.innerHTML = headerHtml + checkboxesHtml + extrasHtml;
                checklistContainer.appendChild(card);
            });
            updateStatus();
        } catch (renderError) {
            console.error("Checklist rendering failed:", renderError);
        }
    };
}

function logSelected() {
    const checkboxes = document.querySelectorAll('#checklist-container .med-checkbox:checked:not(:disabled)');
    if (checkboxes.length === 0) return;
    const items = Array.from(checkboxes).map(cb => ({
        compId: cb.value,
        medName: cb.getAttribute('data-name'),
        checkboxElement: cb
    }));
    processBatchLog(items);
}

function logAll() {
    const checkboxes = document.querySelectorAll('#checklist-container .med-checkbox:not(:disabled)');
    if (checkboxes.length === 0) return;
    const items = Array.from(checkboxes).map(cb => ({
        compId: cb.value,
        medName: cb.getAttribute('data-name'),
        checkboxElement: cb
    }));
    processBatchLog(items);
}

function processBatchLog(items) {
    items.forEach(item => {
        if (item.checkboxElement) item.checkboxElement.disabled = true;
    });

    const transaction = db.transaction(["logs", "meds"], "readwrite");
    const logStore = transaction.objectStore("logs");
    const medStore = transaction.objectStore("meds");
    
    const manualTimeInput = document.getElementById('manual-time');
    
    const exactExecutionTimestamp = Date.now();
    const baseTimestamp = (manualTimeInput && manualTimeInput.value) 
        ? new Date(manualTimeInput.value).toISOString() 
        : new Date(exactExecutionTimestamp).toISOString();

    let decrements = {}; 

    items.forEach(item => {
        const parts = item.compId.split('|');
        const coreId = parts[0];
        const targetTime = parts[1] === 'none' ? null : parts[1];
        
        decrements[coreId] = (decrements[coreId] || 0) + 1;
        
        logStore.add({
            timestamp: new Date().toISOString() + '-' + crypto.randomUUID(), 
            dateTaken: baseTimestamp, 
            systemLoggedTime: exactExecutionTimestamp,
            medId: coreId,
            targetTime: targetTime,
            compositeId: item.compId,
            medName: item.medName,
            status: "taken"
        });
    });

    if (AppSettings.inventory) {
        Object.keys(decrements).forEach(id => {
            const req = medStore.get(id);
            req.onsuccess = () => {
                const med = req.result;
                if (med && med.inventory !== undefined && med.inventory !== "") {
                    med.inventory = Math.max(0, parseInt(med.inventory) - decrements[id]);
                    medStore.put(med);
                }
            };
        });
    }

    transaction.oncomplete = () => {
        if (manualTimeInput) manualTimeInput.value = '';
        updateStatus();
        refreshHistory(); 
        loadChecklist(); 
    };

    transaction.onerror = () => {
        items.forEach(item => {
            if (item.checkboxElement) item.checkboxElement.disabled = false;
        });
        console.error("Batch log failed.");
    };
}

// --- History, Duplicate Tracking & Refund Logic ---
function refreshHistory() {
    if (!historyList || !db) return;
    const transaction = db.transaction(["logs"], "readonly");
    const request = transaction.objectStore("logs").getAll();

    request.onsuccess = () => {
        try {
            const logs = request.result.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));
            historyList.innerHTML = '';
            
            const tracker = {};
            logs.forEach(log => {
                if (log.targetTime) { 
                    const dayKey = new Date(log.dateTaken).toLocaleDateString() + '|' + log.compositeId;
                    tracker[dayKey] = (tracker[dayKey] || 0) + 1;
                }
            });

            const recentLogs = logs.slice(0, 15);

            if (recentLogs.length === 0) {
                historyList.innerHTML = '<li style="color: var(--text-secondary); text-align:center; padding: 2rem;">No logs found.</li>';
                return;
            }

            recentLogs.forEach(log => {
                const dateObj = new Date(log.dateTaken);
                const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateString = dateObj.toLocaleDateString();
                
                let slotInfo = '';
                if (log.targetTime) {
                    const [h, m] = log.targetTime.split(':');
                    const period = h >= 12 ? 'PM' : 'AM';
                    slotInfo = `<span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: normal;">(Scheduled ${h % 12 || 12}:${m} ${period})</span>`;
                }

                let duplicateTag = '';
                if (log.targetTime) {
                    const dayKey = dateString + '|' + log.compositeId;
                    if (tracker[dayKey] > 1) {
                        duplicateTag = `<span style="margin-left: 0.5rem; font-size: 0.7rem; background: rgba(239, 68, 68, 0.15); color: var(--danger-color); padding: 0.1rem 0.4rem; border-radius: 4px; border: 1px solid var(--danger-color);">Duplicate</span>`;
                    }
                }

                const li = document.createElement('li');
                li.className = 'history-item';
                li.innerHTML = `
                    <div class="history-info" style="display:flex; flex-direction:column; gap:0.25rem;">
                        <span class="history-med">${log.medName} ${slotInfo} ${duplicateTag}</span>
                        <span class="history-time">${dateString} ${timeString}</span>
                    </div>
                    <button class="btn-delete-log icon-btn" onclick="deleteLog('${log.timestamp}')" aria-label="Delete Log" title="${AppSettings.noBabysitter ? 'Delete Instantly' : 'Delete'}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                `;
                historyList.appendChild(li);
            });
        } catch (err) {
            console.error("History rendering failed:", err);
        }
    };
}

window.deleteLog = function(timestampKey) {
    if (!AppSettings.noBabysitter && !confirm("Remove this log entry and refund the pill to inventory?")) return;
    
    const transaction = db.transaction(["logs", "meds"], "readwrite");
    const logStore = transaction.objectStore("logs");
    const medStore = transaction.objectStore("meds");

    const getLogReq = logStore.get(timestampKey);

    getLogReq.onsuccess = () => {
        const log = getLogReq.result;
        if (log) {
            logStore.delete(timestampKey);

            if (AppSettings.inventory && log.medId) {
                const getMedReq = medStore.get(log.medId);
                getMedReq.onsuccess = () => {
                    const med = getMedReq.result;
                    if (med && med.inventory !== undefined && med.inventory !== "") {
                        med.inventory = parseInt(med.inventory) + 1;
                        medStore.put(med);
                    }
                };
            }
        }
    };

    transaction.oncomplete = () => {
        refreshHistory();
        calculateAdherence();
        loadChecklist(); 
    };
};

function calculateAdherence() {
    if (!db) return; 
    
    const tx = db.transaction(["meds", "logs"], "readonly");
    const medReq = tx.objectStore("meds").getAll();
    const logReq = tx.objectStore("logs").getAll();

    tx.oncomplete = () => {
        try {
            const meds = medReq.result;
            const logs = logReq.result;
            
            const today = new Date();
            today.setHours(0,0,0,0);
            
            const range = parseInt(heatmapRangeSelect && heatmapRangeSelect.value ? heatmapRangeSelect.value : 30);
            if (isNaN(range)) return; 
            
            let expected7DayDoses = 0;
            let actualTaken7Day = 0;
            let expectedDailyDosesMap = {}; 
            const nonPrnMedIds = new Set();

            for (let i = 0; i < range; i++) {
                const simDate = new Date(today);
                simDate.setDate(today.getDate() - i);
                const dateStr = simDate.toLocaleDateString();
                expectedDailyDosesMap[dateStr] = 0;
                
                meds.forEach(med => {
                    if (med.frequency !== "As Needed") {
                        nonPrnMedIds.add(med.id);
                        const state = getMedStateOnDate(med, simDate);
                        
                        if (state && state.shouldRender) {
                            let timeCount = med.times && med.times.length > 0 ? med.times.length : 1;
                            expectedDailyDosesMap[dateStr] += timeCount;
                            
                            if (i >= 1 && i <= 7) {
                                expected7DayDoses += timeCount;
                            }
                        }
                    }
                });
            }

            const logCountsByDate = {};
            const retroCountsByDate = {}; 

            logs.forEach(log => {
                if (nonPrnMedIds.has(log.medId) && log.status === "taken") {
                    const logDate = new Date(log.dateTaken);
                    logDate.setHours(0,0,0,0);
                    const localDateStr = logDate.toLocaleDateString();
                    
                    logCountsByDate[localDateStr] = (logCountsByDate[localDateStr] || 0) + 1;
                    
                    const daysDiff = Math.round((today - logDate) / (1000 * 60 * 60 * 24));
                    if (daysDiff >= 1 && daysDiff <= 7) {
                        actualTaken7Day++;
                    }

                    const sysTime = log.systemLoggedTime || new Date(log.dateTaken).getTime();
                    const claimedTime = new Date(log.dateTaken).getTime();
                    const deltaHours = (sysTime - claimedTime) / (1000 * 60 * 60);
                    if (deltaHours > 4) {
                        retroCountsByDate[localDateStr] = (retroCountsByDate[localDateStr] || 0) + 1;
                    }
                }
            });

            if (adherenceScore && adherenceSubtext) {
                let percent = expected7DayDoses === 0 ? 100 : Math.min(100, Math.round((actualTaken7Day / expected7DayDoses) * 100));
                adherenceScore.textContent = `${percent}%`;
                adherenceSubtext.textContent = `${actualTaken7Day} of ${expected7DayDoses} expected doses (Past 7 Days)`;

                if (percent >= 90) adherenceScore.style.color = "var(--success-color)";
                else if (percent >= 75) adherenceScore.style.color = "#f59e0b"; 
                else adherenceScore.style.color = "var(--danger-color)"; 
            }

            const grid = document.getElementById('heatmap-grid');
            if (!grid) return; 
            grid.innerHTML = ''; 

            for (let i = range - 1; i >= 0; i--) {
                const targetDate = new Date();
                targetDate.setDate(today.getDate() - i);
                const dateStr = targetDate.toLocaleDateString();
                const displayStr = targetDate.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
                
                const count = logCountsByDate[dateStr] || 0;
                const retroCount = retroCountsByDate[dateStr] || 0;
                const expectedForThisCell = expectedDailyDosesMap[dateStr] || 0;
                let level = 0; 
                
                if (expectedForThisCell > 0) {
                    if (count >= expectedForThisCell) level = 2; 
                    else if (count > 0) level = 1; 
                } else if (count > 0 && expectedForThisCell === 0) {
                    level = 1;
                }

                const cell = document.createElement('div');
                cell.className = `heatmap-cell level-${level}`;
                
                if (expectedForThisCell === 0 && count === 0) {
                    cell.title = `${displayStr}: No doses scheduled`;
                    cell.style.background = 'transparent';
                    cell.style.border = '1px solid var(--border-color)';
                } else if (level === 2) {
                    cell.title = `${displayStr}: Perfect (${count} doses)`;
                } else if (level === 1) {
                    cell.title = `${displayStr}: Partial (${count} of ${expectedForThisCell} doses)`;
                } else {
                    cell.title = `${displayStr}: Missed doses`;
                }

                if (retroCount > 0 && level > 0) {
                    cell.style.opacity = '0.35'; 
                    cell.title += ` ⚠️ (${retroCount} backdated)`;
                }
                
                grid.appendChild(cell);
            }
        } catch (calcError) {
            console.error("Analytics Engine failed:", calcError);
        }
    };
}

function updateStatus() {
    if (!statusBar) return;
    const remaining = document.querySelectorAll('#checklist-container .med-checkbox:not(:disabled)');
    const total = document.querySelectorAll('#checklist-container .med-checkbox');
    if (total.length === 0) {
        statusBar.textContent = "Ready.";
        statusBar.className = "status-indicator";
    } else if (remaining.length === 0) {
        statusBar.textContent = "All regimens complete.";
        statusBar.className = "status-indicator complete";
    } else {
        statusBar.textContent = "Pending actions required.";
        statusBar.className = "status-indicator";
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('Service Worker Failed:', err));
    }
}

// ==========================================
// --- CREDENTIAL MANAGEMENT API & SESSION ---
// ==========================================

async function promptToSavePassword(password) {
    if ('credentials' in navigator && window.PasswordCredential) {
        try {
            const cred = new PasswordCredential({
                id: 'MedLedger_Vault',
                password: password,
                name: 'MedLedger Encryption Key'
            });
            await navigator.credentials.store(cred);
        } catch (err) {
            console.warn("Credential save ignored or failed:", err);
        }
    }
}

function cacheSessionPassword(password) {
    if (password) {
        sessionStorage.setItem('medledger_session_key', password);
        if(sessionLockControls) sessionLockControls.style.display = 'flex';
    }
}

function lockVaultSession() {
    sessionStorage.removeItem('medledger_session_key');
    if (vaultPassInput) vaultPassInput.value = '';
    if(sessionLockControls) sessionLockControls.style.display = 'none';
    showVaultStatus("Vault locked.", "var(--text-secondary)");
}

// ==========================================
// --- ENCRYPTED VAULT LOGIC (Core) ---
// ==========================================
const enc = new TextEncoder();
const dec = new TextDecoder();

async function getKeyMaterial(password) {
    return window.crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]);
}

async function getKey(keyMaterial, salt) {
    return window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
}

async function generateEncryptedBlob(password) {
    const meds = await new Promise(res => db.transaction(["meds"], "readonly").objectStore("meds").getAll().onsuccess = e => res(e.target.result));
    const logs = await new Promise(res => db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = e => res(e.target.result));
    const archived_logs = await new Promise(res => db.transaction(["archived_logs"], "readonly").objectStore("archived_logs").getAll().onsuccess = e => res(e.target.result));
    
    const rawData = JSON.stringify({ meds, logs, archived_logs, exportedAt: new Date().toISOString() });
    
    const keyMaterial = await getKeyMaterial(password);
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await getKey(keyMaterial, salt);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedContent = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(rawData));
    const bundle = new Uint8Array(salt.byteLength + iv.byteLength + encryptedContent.byteLength);
    bundle.set(salt, 0); 
    bundle.set(iv, salt.byteLength); 
    bundle.set(new Uint8Array(encryptedContent), salt.byteLength + iv.byteLength);
    
    return btoa(String.fromCharCode.apply(null, bundle));
}

async function processEncryptedBlob(password, base64Blob) {
    const binaryString = atob(base64Blob);
    const bundle = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bundle[i] = binaryString.charCodeAt(i);

    const salt = bundle.slice(0, 16);
    const iv = bundle.slice(16, 28);
    const ciphertext = bundle.slice(28);

    const keyMaterial = await getKeyMaterial(password);
    const key = await getKey(keyMaterial, salt);
    const decryptedContent = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ciphertext);
    return JSON.parse(dec.decode(decryptedContent));
}

function restoreDataToDB(parsedData) {
    const transaction = db.transaction(["meds", "logs", "archived_logs"], "readwrite");
    const medStore = transaction.objectStore("meds");
    const logStore = transaction.objectStore("logs");
    const archiveStore = transaction.objectStore("archived_logs");

    medStore.clear(); 
    logStore.clear(); 
    archiveStore.clear();

    if (parsedData.meds) parsedData.meds.forEach(med => medStore.add(med));
    if (parsedData.logs) parsedData.logs.forEach(log => logStore.add(log));
    if (parsedData.archived_logs) parsedData.archived_logs.forEach(log => archiveStore.add(log));

    transaction.oncomplete = () => {
        loadChecklist(); 
        refreshHistory();
        calculateAdherence();
    };
}

function togglePasswordVisibility() {
    if (!vaultPassInput || !peekIcon) return;
    const isPassword = vaultPassInput.type === 'password';
    vaultPassInput.type = isPassword ? 'text' : 'password';
    if (isPassword) {
        peekIcon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
    } else {
        peekIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
    }
}

function showVaultStatus(message, color) {
    if(!vaultStatus) return;
    vaultStatus.textContent = message; vaultStatus.style.color = color;
    setTimeout(() => { vaultStatus.textContent = ''; }, 4000);
}

// ==========================================
// --- CLINICIAN EXPORTS (CSV & HTML) ---
// ==========================================
async function exportCSV() {
    const logs = await new Promise(res => {
        const tx = db.transaction(["logs"], "readonly");
        tx.objectStore("logs").getAll().onsuccess = e => res(e.target.result);
    });

    if (!logs || logs.length === 0) {
        showVaultStatus("No history to export.", "var(--danger-color)");
        return;
    }

    logs.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));

    let csvContent = "Date,Time Taken,Medication,Scheduled Target,Status,System Logged Time\n";

    logs.forEach(log => {
        const dateObj = new Date(log.dateTaken);
        const dateStr = dateObj.toLocaleDateString();
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const safeMedName = `"${log.medName.replace(/"/g, '""')}"`;
        
        let targetStr = "Unscheduled";
        if (log.targetTime) {
            const [h, m] = log.targetTime.split(':');
            const period = h >= 12 ? 'PM' : 'AM';
            targetStr = `${h % 12 || 12}:${m} ${period}`;
        }
        
        let systemLogStr = "N/A";
        if (log.systemLoggedTime) {
            const sysDate = new Date(log.systemLoggedTime);
            systemLogStr = `${sysDate.toLocaleDateString()} ${sysDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }

        csvContent += `${dateStr},${timeStr},${safeMedName},${targetStr},${log.status},${systemLogStr}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `MedLedger_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showVaultStatus("CSV Export downloaded.", "var(--success-color)");
}

async function exportHTMLReport() {
    const logs = await new Promise(res => {
        const tx = db.transaction(["logs"], "readonly");
        tx.objectStore("logs").getAll().onsuccess = e => res(e.target.result);
    });

    if (!logs || logs.length === 0) {
        showVaultStatus("No history to export.", "var(--danger-color)");
        return;
    }

    logs.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));

    let rowsHtml = "";
    logs.forEach(log => {
        const dateObj = new Date(log.dateTaken);
        const dateStr = dateObj.toLocaleDateString();
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let targetStr = "Unscheduled";
        if (log.targetTime) {
            const [h, m] = log.targetTime.split(':');
            const period = h >= 12 ? 'PM' : 'AM';
            targetStr = `${h % 12 || 12}:${m} ${period}`;
        }

        rowsHtml += `
            <tr>
                <td>${dateStr}</td>
                <td>${timeStr}</td>
                <td><strong>${log.medName}</strong></td>
                <td>${targetStr}</td>
                <td class="status-${log.status}">${log.status.toUpperCase()}</td>
            </tr>
        `;
    });

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>MedLedger Clinical Report</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; color: #111; line-height: 1.5; padding: 2rem; max-width: 900px; margin: 0 auto; background: #fff; }
        h1 { border-bottom: 2px solid #222; padding-bottom: 0.5rem; margin-bottom: 0.5rem; }
        .meta-info { color: #555; margin-bottom: 2rem; font-size: 0.9rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.95rem; }
        th, td { border: 1px solid #ddd; padding: 0.75rem; text-align: left; }
        th { background-color: #f9fafb; font-weight: 600; color: #333; }
        tr:nth-child(even) { background-color: #fdfdfd; }
        .status-taken { color: #166534; font-weight: bold; }
        .status-missed { color: #991b1b; font-weight: bold; }
        .btn-print { padding: 0.5rem 1rem; cursor: pointer; background: #2563eb; color: white; border: none; border-radius: 4px; font-weight: 600; font-size: 1rem; transition: background 0.2s; }
        .btn-print:hover { background: #1d4ed8; }
        @media print { 
            body { padding: 0; max-width: none; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div style="display: flex; justify-content: space-between; align-items: flex-end;" class="no-print">
        <h1>Medication Adherence Report</h1>
        <button class="btn-print" onclick="window.print()">Print Report</button>
    </div>
    <div class="meta-info">Generated on: ${new Date().toLocaleString()}</div>
    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Time Taken</th>
                <th>Medication</th>
                <th>Scheduled Target</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
    </table>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `MedLedger_Printable_Report_${new Date().toISOString().split('T')[0]}.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showVaultStatus("HTML Report downloaded.", "var(--success-color)");
}

// ==========================================
// --- LOCAL VAULT (File Export/Import) ---
// ==========================================
async function exportVaultLocal() {
    const password = vaultPassInput ? vaultPassInput.value || sessionStorage.getItem('medledger_session_key') : sessionStorage.getItem('medledger_session_key');
    
    if (!password) { showVaultStatus("Password required for export.", "var(--danger-color)"); return; }
    
    promptToSavePassword(password);
    cacheSessionPassword(password);
    
    try {
        const encryptedBase64 = await generateEncryptedBlob(password);
        const blob = new Blob([encryptedBase64], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `MedLedger_${new Date().toISOString().split('T')[0]}.medvault`;
        a.click(); URL.revokeObjectURL(url);
        
        if (vaultPassInput) vaultPassInput.value = password; 
        showVaultStatus("Local Export successful.", "var(--success-color)");
    } catch (err) { console.error(err); showVaultStatus("Export failed.", "var(--danger-color)"); }
}

async function importVaultLocal(e) {
    const file = e.target.files[0];
    if (!file) return;
    const password = vaultPassInput ? vaultPassInput.value : null;
    if (!password) { showVaultStatus("Password required to decrypt.", "var(--danger-color)"); e.target.value = ''; return; }

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const parsedData = await processEncryptedBlob(password, event.target.result);
            restoreDataToDB(parsedData);
            if (vaultPassInput) vaultPassInput.value = ''; e.target.value = '';
            showVaultStatus("Local Import successful. Vault restored.", "var(--success-color)");
        } catch (err) {
            console.error(err); showVaultStatus("Decryption failed. Incorrect password?", "var(--danger-color)"); e.target.value = '';
        }
    };
    reader.readAsText(file);
}

// ==========================================
// --- GOOGLE DRIVE SYNC INTEGRATION ---
// ==========================================

window.initGoogleSync = function() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.appdata',
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                gapiToken = tokenResponse.access_token;
                
                localStorage.setItem('gapi_token', gapiToken);
                localStorage.setItem('gapi_token_expiry', Date.now() + (55 * 60 * 1000));

                const syncControls = document.getElementById('cloud-sync-controls');
                const btnLogin = document.getElementById('btn-gdrive-login');
                if(syncControls) syncControls.style.display = 'flex';
                if(btnLogin) btnLogin.style.display = 'none';
                showVaultStatus("Google Drive Connected.", "var(--success-color)");
            }
        },
    });

    const savedToken = localStorage.getItem('gapi_token');
    const tokenExpiry = localStorage.getItem('gapi_token_expiry');
    
    if (savedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
        gapiToken = savedToken;
        const syncControls = document.getElementById('cloud-sync-controls');
        const btnLogin = document.getElementById('btn-gdrive-login');
        if(syncControls) syncControls.style.display = 'flex';
        if(btnLogin) btnLogin.style.display = 'none';
    } else {
        localStorage.removeItem('gapi_token');
        localStorage.removeItem('gapi_token_expiry');
    }
};

window.loginGoogleDrive = function() {
    if (GOOGLE_CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
        showVaultStatus("Please add your Client ID to app.js", "var(--danger-color)");
        return;
    }
    tokenClient.requestAccessToken();
};

window.logoutGoogleDrive = function() {
    gapiToken = null;
    localStorage.removeItem('gapi_token');
    localStorage.removeItem('gapi_token_expiry');
    const syncControls = document.getElementById('cloud-sync-controls');
    const btnLogin = document.getElementById('btn-gdrive-login');
    if(syncControls) syncControls.style.display = 'none';
    if(btnLogin) btnLogin.style.display = 'block';
    showVaultStatus("Cloud disconnected.", "var(--text-secondary)");
};

async function checkDriveForFile() {
    const res = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name="medledger_sync.medvault"', {
        headers: { 'Authorization': `Bearer ${gapiToken}` }
    });
    if (res.status === 401 || res.status === 403) {
        logoutGoogleDrive();
        throw new Error("Token expired.");
    }
    const data = await res.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function pushToGoogleDrive() {
    const password = vaultPassInput ? vaultPassInput.value || sessionStorage.getItem('medledger_session_key') : sessionStorage.getItem('medledger_session_key');
    
    if (!password) { showVaultStatus("Password required to encrypt before push.", "var(--danger-color)"); return; }
    
    promptToSavePassword(password);
    cacheSessionPassword(password);

    showVaultStatus("Encrypting and pushing...", "var(--text-secondary)");
    try {
        const encryptedBase64 = await generateEncryptedBlob(password);
        const fileId = await checkDriveForFile();
        
        const metadata = { name: 'medledger_sync.medvault', parents: ['appDataFolder'] };
        const initUrl = fileId 
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
        const initMethod = fileId ? 'PATCH' : 'POST';

        const initRes = await fetch(initUrl, {
            method: initMethod,
            headers: {
                'Authorization': `Bearer ${gapiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(fileId ? {} : metadata)
        });

        if (!initRes.ok) {
            if (initRes.status === 401 || initRes.status === 403) logoutGoogleDrive();
            throw new Error("Failed to initiate upload");
        }

        const uploadUrl = initRes.headers.get('Location');

        const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: encryptedBase64
        });
        
        if (uploadRes.ok) {
            if (vaultPassInput) vaultPassInput.value = password;
            showVaultStatus("Successfully pushed securely to Drive.", "var(--success-color)");
        } else {
            throw new Error("Upload data failed.");
        }
    } catch (err) {
        console.error(err);
        showVaultStatus("Failed to push to Cloud. Check console.", "var(--danger-color)");
    }
}

async function pullFromGoogleDrive() {
    const password = vaultPassInput ? vaultPassInput.value || sessionStorage.getItem('medledger_session_key') : sessionStorage.getItem('medledger_session_key');
    
    if (!password) { showVaultStatus("Password required to decrypt.", "var(--danger-color)"); return; }

    promptToSavePassword(password);
    cacheSessionPassword(password);

    showVaultStatus("Pulling from cloud...", "var(--text-secondary)");
    try {
        const fileId = await checkDriveForFile();
        if (!fileId) {
            showVaultStatus("No backup found in Drive.", "var(--danger-color)");
            return;
        }

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${gapiToken}` }
        });
        
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) logoutGoogleDrive();
            throw new Error("Download failed");
        }
        
        const encryptedBase64 = await res.text();
        const parsedData = await processEncryptedBlob(password, encryptedBase64);
        restoreDataToDB(parsedData);
        
        if (vaultPassInput) vaultPassInput.value = password;
        showVaultStatus("Successfully synced from Drive.", "var(--success-color)");
    } catch (err) {
        console.error(err);
        showVaultStatus("Decryption or Download failed.", "var(--danger-color)");
    }
}

// ==========================================
// --- LOCAL NOTIFICATION ENGINE ---
// ==========================================
let notifiedToday = JSON.parse(localStorage.getItem('notifiedMeds')) || {};

function checkReminders() {
    if (!AppSettings.reminders || Notification.permission !== 'granted') return;

    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
        notifiedToday = {};
        localStorage.setItem('notifiedMeds', JSON.stringify(notifiedToday));
    }

    const currentHourStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const todayStr = now.toLocaleDateString();

    const tx = db.transaction(["meds", "logs"], "readonly");
    const medReq = tx.objectStore("meds").getAll();
    const logReq = tx.objectStore("logs").getAll();

    tx.oncomplete = () => {
        const rawMeds = medReq.result;
        const logs = logReq.result;

        rawMeds.forEach(med => {
            if (med.frequency === "As Needed") return;

            const state = getMedStateOnDate(med, now);
            if (!state || !state.shouldRender) return;

            let times = med.times || [];
            if (!med.times && med.time) times = [med.time]; 

            times.forEach(targetTime => {
                if (currentHourStr >= targetTime) {
                    const compId = `${med.id}|${targetTime}`;
                    if (notifiedToday[compId] === todayStr) return; 

                    const takenToday = logs.some(log => log.compositeId === compId && new Date(log.dateTaken).toLocaleDateString() === todayStr);

                    if (!takenToday) {
                        navigator.serviceWorker.ready.then(registration => {
                            const [h, m] = targetTime.split(':');
                            const period = h >= 12 ? 'PM' : 'AM';
                            const formattedTime = `${h % 12 || 12}:${m} ${period}`;
                            
                            registration.showNotification("MedLedger Reminder", {
                                body: `Pending: ${med.name} (${state.dose}) at ${formattedTime}`,
                                icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzE4MTgxYiIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjQwIiBmaWxsPSIjM2I4MmY2Ii8+PC9zdmc+",
                                badge: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzE4MTgxYiIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjQwIiBmaWxsPSIjM2I4MmY2Ii8+PC9zdmc+",
                                requireInteraction: true
                            });
                        });

                        notifiedToday[compId] = todayStr;
                        localStorage.setItem('notifiedMeds', JSON.stringify(notifiedToday));
                    }
                }
            });
        });
    };
}

setInterval(checkReminders, 60000);
setTimeout(checkReminders, 2000);

// --- Midnight Rollover Engine ---
let lastCheckedDate = new Date().toLocaleDateString();

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const currentDate = new Date().toLocaleDateString();
        if (currentDate !== lastCheckedDate) {
            lastCheckedDate = currentDate;
            loadChecklist(); 
            refreshHistory(); 
            calculateAdherence(); 
        }
    }
});
