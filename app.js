// ==========================================
// REPLACE THIS WITH YOUR GENERATED CLIENT ID
const GOOGLE_CLIENT_ID = '254319619201-8m0phsnf5eftqpllis3kt0a03l56r6v8.apps.googleusercontent.com';
// ==========================================

const DB_NAME = "MedLedgerDB";
const DB_VERSION = 1;
let db;
let tokenClient;
let gapiToken = null;

// --- Config State ---
const AppSettings = {
    noBabysitter: localStorage.getItem('cfg_noBabysitter') === 'true',
    expertMode: localStorage.getItem('cfg_expertMode') === 'true',
    reminders: localStorage.getItem('cfg_reminders') === 'true'
};

// --- DOM Elements ---
const themeToggleBtn = document.getElementById('theme-toggle');
const rootElement = document.documentElement;
const statusBar = document.getElementById('status-bar');
const checklistContainer = document.getElementById('checklist-container');
const historyList = document.getElementById('history-list');
const addMedForm = document.getElementById('add-med-form');
const editModal = document.getElementById('edit-med-modal');
const editForm = document.getElementById('edit-med-form');

const settingsModal = document.getElementById('settings-modal');
const toggleBabysitter = document.getElementById('toggle-babysitter');
const toggleExpert = document.getElementById('toggle-expert');
const toggleReminders = document.getElementById('toggle-reminders');
const vaultPassInput = document.getElementById('vault-password');
const vaultStatus = document.getElementById('vault-status');
const peekBtn = document.getElementById('btn-peek-password');
const peekIcon = document.getElementById('peek-icon');
const helpModal = document.getElementById('help-modal');

const tabTodayBtn = document.getElementById('tab-today');
const tabHistoryBtn = document.getElementById('tab-history');
const dailyScheduleView = document.getElementById('daily-schedule');
const logHistoryView = document.getElementById('log-history');

const sessionLockControls = document.getElementById('session-lock-controls');
const btnLockVault = document.getElementById('btn-lock-vault');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    initSettings();
    initDB();
    registerServiceWorker();

    document.getElementById('btn-submit-selected').addEventListener('click', logSelected);
    document.getElementById('btn-submit-all').addEventListener('click', logAll);
    addMedForm.addEventListener('submit', handleAddMed);
    document.getElementById('btn-cancel-edit').addEventListener('click', () => editModal.close());
    document.getElementById('btn-delete-med').addEventListener('click', deleteMedication);
    editForm.addEventListener('submit', saveEditedMed);
    
    // Auto-fill logic when opening settings
    document.getElementById('settings-toggle').addEventListener('click', () => {
        const cachedPass = sessionStorage.getItem('medledger_session_key');
        if (cachedPass) {
            vaultPassInput.value = cachedPass;
            sessionLockControls.style.display = 'flex';
        } else {
            vaultPassInput.value = '';
            sessionLockControls.style.display = 'none';
        }
        settingsModal.showModal();
    });
    
    document.getElementById('btn-close-settings').addEventListener('click', () => settingsModal.close());
    document.getElementById('help-toggle').addEventListener('click', () => helpModal.showModal());
    document.getElementById('btn-close-help').addEventListener('click', () => helpModal.close());

    peekBtn.addEventListener('click', togglePasswordVisibility);
    btnLockVault.addEventListener('click', lockVaultSession);

    tabTodayBtn.addEventListener('click', () => switchTab('today'));
    tabHistoryBtn.addEventListener('click', () => switchTab('history'));

    // Local Vault
    document.getElementById('btn-export-vault').addEventListener('click', exportVaultLocal);
    document.getElementById('import-vault-file').addEventListener('change', importVaultLocal);

    // Cloud Vault Actions
    document.getElementById('btn-cloud-push').addEventListener('click', pushToGoogleDrive);
    document.getElementById('btn-cloud-pull').addEventListener('click', pullFromGoogleDrive);

    document.addEventListener('keydown', (e) => {
        if (AppSettings.expertMode && e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            const checked = document.querySelectorAll('.med-checkbox:checked:not(:disabled)');
            checked.length > 0 ? logSelected() : logAll();
        }
    });
});

// --- Theme Logic ---
function updateThemeIcon(theme) {
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
    
    // Ensure we don't have corrupted states
    if (savedTheme !== 'dark' && savedTheme !== 'light' && savedTheme !== 'hc') {
        savedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    
    rootElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

themeToggleBtn.addEventListener('click', () => {
    let currentTheme = rootElement.getAttribute('data-theme');
    
    let newTheme;
    if (currentTheme === 'dark') {
        newTheme = 'light';
    } else if (currentTheme === 'light') {
        newTheme = 'hc';
    } else {
        newTheme = 'dark'; // Fallback to dark if unknown or HC
    }
    
    rootElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
});

// --- Tab Logic ---
function switchTab(tab) {
    if (tab === 'today') {
        tabTodayBtn.classList.add('active');
        tabHistoryBtn.classList.remove('active');
        dailyScheduleView.classList.remove('hidden-view');
        logHistoryView.classList.add('hidden-view');
    } else {
        tabHistoryBtn.classList.add('active');
        tabTodayBtn.classList.remove('active');
        logHistoryView.classList.remove('hidden-view');
        dailyScheduleView.classList.add('hidden-view');
    }
}

window.addTimeField = function(containerId) {
    const container = document.getElementById(containerId);
    const input = document.createElement('input');
    input.type = 'time';
    input.className = 'time-input';
    input.style.cssText = 'padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--bg-primary); color: var(--text-primary); font-family: inherit; margin-top: 0.25rem;';
    container.appendChild(input);
};

function getTimesFromContainer(containerId) {
    const container = document.getElementById(containerId);
    const inputs = container.querySelectorAll('input[type="time"]');
    let times = [];
    inputs.forEach(input => {
        if (input.value) times.push(input.value);
    });
    return [...new Set(times)].sort();
}

// --- Settings Logic ---
function initSettings() {
    toggleBabysitter.checked = AppSettings.noBabysitter;
    toggleExpert.checked = AppSettings.expertMode;
    toggleReminders.checked = AppSettings.reminders;

    toggleBabysitter.addEventListener('change', (e) => {
        AppSettings.noBabysitter = e.target.checked;
        localStorage.setItem('cfg_noBabysitter', e.target.checked);
    });

    toggleExpert.addEventListener('change', (e) => {
        AppSettings.expertMode = e.target.checked;
        localStorage.setItem('cfg_expertMode', e.target.checked);
        loadChecklist(); 
    });

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

// --- Database Logic ---
function initDB() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("meds")) db.createObjectStore("meds", { keyPath: "id" });
        if (!db.objectStoreNames.contains("logs")) db.createObjectStore("logs", { keyPath: "timestamp" });
    };
    request.onsuccess = (e) => {
        db = e.target.result;
        loadChecklist();
        refreshHistory();
    };
    request.onerror = (e) => {
        console.error("Database error: ", e.target.errorCode);
        statusBar.textContent = "Database error.";
    };
}

// --- Configuration Logic (Add/Edit/Delete Meds) ---
function handleAddMed(e) {
    e.preventDefault();
    const nameInput = document.getElementById('new-med-name').value.trim();
    const doseInput = document.getElementById('new-med-dose').value.trim();
    const freqInput = document.getElementById('new-med-freq').value;
    const instructionsInput = document.getElementById('new-med-instructions').value.trim();
    const timesArray = getTimesFromContainer('new-med-times-container');

    if (!nameInput || !doseInput) return;

    const newMed = { 
        id: crypto.randomUUID(), 
        name: nameInput, 
        dose: doseInput, 
        frequency: freqInput,
        times: timesArray,
        instructions: instructionsInput 
    };
    
    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").add(newMed);

    transaction.oncomplete = () => {
        addMedForm.reset();
        document.getElementById('new-med-freq').value = 'Daily'; 
        document.getElementById('new-med-times-container').innerHTML = `<input type="time" class="time-input" style="padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--bg-primary); color: var(--text-primary); font-family: inherit;">`;
        loadChecklist();
    };
}

window.openEditModal = function(id) {
    const transaction = db.transaction(["meds"], "readonly");
    const request = transaction.objectStore("meds").get(id);

    request.onsuccess = () => {
        const med = request.result;
        if (med) {
            document.getElementById('edit-med-id').value = med.id;
            document.getElementById('edit-med-name').value = med.name;
            document.getElementById('edit-med-dose').value = med.dose;
            document.getElementById('edit-med-freq').value = med.frequency || 'Daily';
            document.getElementById('edit-med-instructions').value = med.instructions || '';
            
            let timesToRender = med.times || [];
            if (!med.times && med.time) timesToRender = [med.time];

            const timesContainer = document.getElementById('edit-med-times-container');
            timesContainer.innerHTML = ''; 
            
            if (timesToRender.length === 0) {
                addTimeField('edit-med-times-container'); 
            } else {
                timesToRender.forEach(timeVal => {
                    addTimeField('edit-med-times-container');
                    timesContainer.lastElementChild.value = timeVal;
                });
            }
            editModal.showModal();
        }
    };
};

function saveEditedMed(e) {
    e.preventDefault();
    const id = document.getElementById('edit-med-id').value;
    const name = document.getElementById('edit-med-name').value.trim();
    const dose = document.getElementById('edit-med-dose').value.trim();
    const freq = document.getElementById('edit-med-freq').value;
    const instructions = document.getElementById('edit-med-instructions').value.trim();
    const timesArray = getTimesFromContainer('edit-med-times-container');

    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").put({ 
        id: id, 
        name: name, 
        dose: dose, 
        frequency: freq,
        times: timesArray,
        instructions: instructions 
    });

    transaction.oncomplete = () => {
        editModal.close();
        loadChecklist();
    };
}

function deleteMedication() {
    if (!AppSettings.noBabysitter && !confirm("Remove this medication completely from the regimen?")) return;
    const id = document.getElementById('edit-med-id').value;
    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").delete(id);

    transaction.oncomplete = () => {
        editModal.close();
        loadChecklist();
    };
}

// --- Regimen Logic (Checklist & Logging) ---
function loadChecklist() {
    const tx = db.transaction(["meds", "logs"], "readonly");
    const medReq = tx.objectStore("meds").getAll();
    const logReq = tx.objectStore("logs").getAll();

    tx.oncomplete = () => {
        const rawMeds = medReq.result;
        const logs = logReq.result;
        checklistContainer.innerHTML = '';

        if (rawMeds.length === 0) {
            checklistContainer.innerHTML = '<p style="color: var(--text-secondary);">No medications added yet.</p>';
            statusBar.textContent = "Ready.";
            return;
        }

        rawMeds.sort((a, b) => {
            const freqWeight = { "Morning": 1, "Daily": 2, "Night": 3, "Weekly": 4, "As Needed": 5 };
            const weightA = freqWeight[a.frequency] || 99;
            const weightB = freqWeight[b.frequency] || 99;
            if (weightA !== weightB) return weightA - weightB;
            return a.name.localeCompare(b.name);
        });

        const todayStr = new Date().toLocaleDateString();

        rawMeds.forEach(med => {
            let times = med.times && med.times.length > 0 ? med.times : [null];
            const freqClass = med.frequency === "As Needed" ? "freq-badge prn" : "freq-badge";
            const freqHtml = med.frequency ? `<span class="${freqClass}">${med.frequency}</span>` : '';

            const card = document.createElement('div');
            card.style.cssText = 'border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 1rem; background-color: var(--bg-surface); overflow: hidden; display: flex; flex-direction: column;';

            const headerHtml = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem; border-bottom: 1px solid var(--border-color); background-color: var(--bg-primary);">
                    <div>
                        <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                            ${med.name} ${freqHtml}
                        </h3>
                        <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.25rem;">${med.dose}</div>
                    </div>
                    <button type="button" class="btn-icon" onclick="openEditModal('${med.id}')" aria-label="Edit" style="margin: -0.5rem -0.5rem 0 0;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                </div>
            `;

            let checkboxesHtml = '<div style="padding: 0.5rem 1rem; display: flex; flex-direction: column; gap: 0.5rem;">';
            
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
                    <label class="med-item ${isCompletedToday ? 'completed' : ''}" id="${labelId}" style="margin: 0; padding: 0.5rem; border-radius: 4px; transition: background-color 0.2s; cursor: pointer;" title="${AppSettings.expertMode && !isCompletedToday ? 'Double-click to instantly log' : ''}">
                        <input type="checkbox" name="med" value="${compositeLogId}" data-name="${med.name}" class="med-checkbox" ${isCompletedToday ? 'checked disabled' : ''}>
                        <span class="med-details" style="display: flex; align-items: center; width: 100%;">
                            <span class="med-name" style="font-weight: 600; color: ${isCompletedToday ? 'var(--text-secondary)' : 'var(--text-primary)'};">${timeLabel}</span>
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
                                if (!checkbox.disabled) processBatchLog([compositeLogId]);
                            });
                        }
                    }, 0);
                }
            });
            checkboxesHtml += '</div>';

            const instructionsHtml = med.instructions ? `
                <div style="padding: 0.75rem 1rem; border-top: 1px solid var(--border-color); font-size: 0.85rem; color: var(--text-secondary); background-color: rgba(0,0,0,0.1); font-style: italic;">
                    ${med.instructions}
                </div>
            ` : '';

            card.innerHTML = headerHtml + checkboxesHtml + instructionsHtml;
            checklistContainer.appendChild(card);
        });
        updateStatus();
    };
}

function logSelected() {
    const checkboxes = document.querySelectorAll('.med-checkbox:checked:not(:disabled)');
    const selectedMeds = Array.from(checkboxes).map(cb => cb.value);
    if (selectedMeds.length === 0) return;
    processBatchLog(selectedMeds);
}

function logAll() {
    const checkboxes = document.querySelectorAll('.med-checkbox:not(:disabled)');
    const allMeds = Array.from(checkboxes).map(cb => cb.value);
    if (allMeds.length === 0) return;
    processBatchLog(allMeds);
}

function processBatchLog(compositeIds) {
    const transaction = db.transaction(["logs"], "readwrite");
    const store = transaction.objectStore("logs");
    
    const manualTimeInput = document.getElementById('manual-time');
    const baseTimestamp = (manualTimeInput && manualTimeInput.value) 
        ? new Date(manualTimeInput.value).toISOString() 
        : new Date().toISOString();

    compositeIds.forEach(compId => {
        const safeCompId = compId.replace(/\|/g, '\\|');
        const checkbox = document.querySelector(`input[value="${safeCompId}"]`);
        const actualMedName = checkbox.getAttribute('data-name');
        
        const parts = compId.split('|');
        const coreId = parts[0];
        const targetTime = parts[1] === 'none' ? null : parts[1];
        
        store.add({
            timestamp: new Date().toISOString() + '-' + crypto.randomUUID(), 
            dateTaken: baseTimestamp, 
            medId: coreId,
            targetTime: targetTime,
            compositeId: compId,
            medName: actualMedName,
            status: "taken"
        });
    });

    transaction.oncomplete = () => {
        compositeIds.forEach(compId => {
            const safeCompId = compId.replace(/\|/g, '\\|');
            const checkbox = document.querySelector(`input[value="${safeCompId}"]`);
            if (checkbox) {
                checkbox.checked = false;
                checkbox.disabled = true;
                checkbox.closest('.med-item').classList.add('completed');
            }
        });
        
        if (manualTimeInput) manualTimeInput.value = '';
        updateStatus();
        refreshHistory();
    };
}

// --- History Logic ---
function refreshHistory() {
    const transaction = db.transaction(["logs"], "readonly");
    const request = transaction.objectStore("logs").getAll();

    request.onsuccess = () => {
        const logs = request.result.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));
        historyList.innerHTML = '';
        const recentLogs = logs.slice(0, 15);

        if (recentLogs.length === 0) {
            historyList.innerHTML = '<li style="color: var(--text-secondary);">No logs found.</li>';
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
                slotInfo = ` (Scheduled ${h % 12 || 12}:${m} ${period})`;
            }

            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `
                <div class="history-info">
                    <span class="history-med">${log.medName} <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: normal;">${slotInfo}</span></span>
                    <span class="history-time">${dateString} ${timeString}</span>
                </div>
                <button class="btn-delete-log" onclick="deleteLog('${log.timestamp}')" aria-label="Delete Log" title="${AppSettings.noBabysitter ? 'Delete Instantly' : 'Delete'}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            `;
            historyList.appendChild(li);
        });
    };
}

window.deleteLog = function(timestampKey) {
    if (!AppSettings.noBabysitter && !confirm("Remove this log entry?")) return;
    const transaction = db.transaction(["logs"], "readwrite");
    transaction.objectStore("logs").delete(timestampKey);
    transaction.oncomplete = () => {
        refreshHistory();
        loadChecklist();
    };
};

function updateStatus() {
    const remaining = document.querySelectorAll('.med-checkbox:not(:disabled)');
    const total = document.querySelectorAll('.med-checkbox');
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
        sessionLockControls.style.display = 'flex';
    }
}

function lockVaultSession() {
    sessionStorage.removeItem('medledger_session_key');
    vaultPassInput.value = '';
    sessionLockControls.style.display = 'none';
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
    const rawData = JSON.stringify({ meds, logs, exportedAt: new Date().toISOString() });
    
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
    const transaction = db.transaction(["meds", "logs"], "readwrite");
    const medStore = transaction.objectStore("meds");
    const logStore = transaction.objectStore("logs");

    medStore.clear(); logStore.clear();
    parsedData.meds.forEach(med => medStore.add(med));
    parsedData.logs.forEach(log => logStore.add(log));

    transaction.oncomplete = () => {
        loadChecklist(); refreshHistory();
    };
}

function togglePasswordVisibility() {
    const isPassword = vaultPassInput.type === 'password';
    vaultPassInput.type = isPassword ? 'text' : 'password';
    if (isPassword) {
        peekIcon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
    } else {
        peekIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
    }
}

function showVaultStatus(message, color) {
    vaultStatus.textContent = message; vaultStatus.style.color = color;
    setTimeout(() => { vaultStatus.textContent = ''; }, 4000);
}

// ==========================================
// --- LOCAL VAULT (File Export/Import) ---
// ==========================================
async function exportVaultLocal() {
    const password = vaultPassInput.value || sessionStorage.getItem('medledger_session_key');
    
    if (!password) { showVaultStatus("Password required for export.", "var(--accent-color)"); return; }
    
    promptToSavePassword(password);
    cacheSessionPassword(password);
    
    try {
        const encryptedBase64 = await generateEncryptedBlob(password);
        const blob = new Blob([encryptedBase64], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `MedLedger_${new Date().toISOString().split('T')[0]}.medvault`;
        a.click(); URL.revokeObjectURL(url);
        
        vaultPassInput.value = password; 
        showVaultStatus("Local Export successful.", "var(--success-color)");
    } catch (err) { console.error(err); showVaultStatus("Export failed.", "#ef4444"); }
}

async function importVaultLocal(e) {
    const file = e.target.files[0];
    if (!file) return;
    const password = vaultPassInput.value;
    if (!password) { showVaultStatus("Password required to decrypt.", "var(--accent-color)"); e.target.value = ''; return; }

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const parsedData = await processEncryptedBlob(password, event.target.result);
            restoreDataToDB(parsedData);
            vaultPassInput.value = ''; e.target.value = '';
            showVaultStatus("Local Import successful. Vault restored.", "var(--success-color)");
        } catch (err) {
            console.error(err); showVaultStatus("Decryption failed. Incorrect password?", "#ef4444"); e.target.value = '';
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
                document.getElementById('cloud-sync-controls').style.display = 'flex';
                document.getElementById('btn-gdrive-login').style.display = 'none';
                showVaultStatus("Google Drive Connected.", "var(--success-color)");
            }
        },
    });
};

window.loginGoogleDrive = function() {
    if (GOOGLE_CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
        showVaultStatus("Please add your Client ID to app.js", "#ef4444");
        return;
    }
    tokenClient.requestAccessToken();
};

async function checkDriveForFile() {
    const res = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name="medledger_sync.medvault"', {
        headers: { 'Authorization': `Bearer ${gapiToken}` }
    });
    const data = await res.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
}

// Use Resumable Upload to avoid strict multipart/related restrictions in standard fetch
async function pushToGoogleDrive() {
    const password = vaultPassInput.value || sessionStorage.getItem('medledger_session_key');
    
    if (!password) { showVaultStatus("Password required to encrypt before push.", "var(--accent-color)"); return; }
    
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

        if (!initRes.ok) throw new Error("Failed to initiate upload");

        const uploadUrl = initRes.headers.get('Location');

        const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: encryptedBase64
        });
        
        if (uploadRes.ok) {
            vaultPassInput.value = password;
            showVaultStatus("Successfully pushed securely to Drive.", "var(--success-color)");
        } else {
            throw new Error("Upload data failed.");
        }
    } catch (err) {
        console.error(err);
        showVaultStatus("Failed to push to Cloud. Check console.", "#ef4444");
    }
}

async function pullFromGoogleDrive() {
    const password = vaultPassInput.value || sessionStorage.getItem('medledger_session_key');
    
    if (!password) { showVaultStatus("Password required to decrypt.", "var(--accent-color)"); return; }

    promptToSavePassword(password);
    cacheSessionPassword(password);

    showVaultStatus("Pulling from cloud...", "var(--text-secondary)");
    try {
        const fileId = await checkDriveForFile();
        if (!fileId) {
            showVaultStatus("No backup found in Drive.", "#ef4444");
            return;
        }

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${gapiToken}` }
        });
        
        if (!res.ok) throw new Error("Download failed");
        
        const encryptedBase64 = await res.text();
        const parsedData = await processEncryptedBlob(password, encryptedBase64);
        restoreDataToDB(parsedData);
        
        vaultPassInput.value = password;
        showVaultStatus("Successfully synced from Drive.", "var(--success-color)");
    } catch (err) {
        console.error(err);
        showVaultStatus("Decryption or Download failed.", "#ef4444");
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
                                body: `Pending: ${med.name} (${med.dose}) at ${formattedTime}`,
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
