const DB_NAME = "MedLedgerDB";
const DB_VERSION = 1;
let db;

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

// Password Peek Elements
const peekBtn = document.getElementById('btn-peek-password');
const peekIcon = document.getElementById('peek-icon');

// Help Elements
const helpModal = document.getElementById('help-modal');

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
    
    document.getElementById('settings-toggle').addEventListener('click', () => settingsModal.showModal());
    document.getElementById('btn-close-settings').addEventListener('click', () => settingsModal.close());
    
    // Help Listeners
    document.getElementById('help-toggle').addEventListener('click', () => helpModal.showModal());
    document.getElementById('btn-close-help').addEventListener('click', () => helpModal.close());

    // Password Peek Listener
    peekBtn.addEventListener('click', togglePasswordVisibility);

    document.getElementById('btn-export-vault').addEventListener('click', exportVault);
    document.getElementById('import-vault-file').addEventListener('change', importVault);

    document.addEventListener('keydown', (e) => {
        if (AppSettings.expertMode && e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            const checked = document.querySelectorAll('.med-checkbox:checked:not(:disabled)');
            checked.length > 0 ? logSelected() : logAll();
        }
    });
});

// --- Dynamic Time Field Utility ---
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

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        rootElement.setAttribute('data-theme', savedTheme);
    } else {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        rootElement.setAttribute('data-theme', systemPrefersDark ? 'dark' : 'light');
    }
}

themeToggleBtn.addEventListener('click', () => {
    let currentTheme = rootElement.getAttribute('data-theme');
    if (!currentTheme) {
        currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    let newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    rootElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

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
        // Reset times container to single input
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
            
            // Handle legacy DB upgrades silently (time string -> times array)
            let timesToRender = med.times || [];
            if (!med.times && med.time) timesToRender = [med.time];

            const timesContainer = document.getElementById('edit-med-times-container');
            timesContainer.innerHTML = ''; // Clear existing
            
            if (timesToRender.length === 0) {
                addTimeField('edit-med-times-container'); // Ensure at least one blank field
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

        // Flatten meds into individual scheduled items
        let schedule = [];
        rawMeds.forEach(med => {
            // Data upgrade check
            let times = med.times || [];
            if (!med.times && med.time) times = [med.time];

            if (times.length > 0) {
                times.forEach(t => schedule.push({...med, targetTime: t}));
            } else {
                schedule.push({...med, targetTime: null});
            }
        });

        // Priority Sort: Time -> Frequency -> Name
        schedule.sort((a, b) => {
            if (a.targetTime && b.targetTime && a.targetTime !== b.targetTime) {
                return a.targetTime.localeCompare(b.targetTime);
            }
            
            const freqWeight = { "Morning": 1, "Daily": 2, "Night": 3, "Weekly": 4, "As Needed": 5 };
            const weightA = freqWeight[a.frequency] || 99;
            const weightB = freqWeight[b.frequency] || 99;
            
            if (weightA !== weightB) return weightA - weightB;
            return a.name.localeCompare(b.name);
        });

        const todayStr = new Date().toLocaleDateString();

        schedule.forEach(item => {
            // Check if this specific instance has been logged today
            const compositeLogId = item.targetTime ? `${item.id}|${item.targetTime}` : `${item.id}|none`;
            const isCompletedToday = logs.some(log => 
                log.compositeId === compositeLogId && 
                new Date(log.dateTaken).toLocaleDateString() === todayStr
            );

            const freqClass = item.frequency === "As Needed" ? "freq-badge prn" : "freq-badge";
            const freqHtml = item.frequency ? `<span class="${freqClass}">${item.frequency}</span>` : '';
            
            let timeHtml = '';
            if (item.targetTime) {
                const [h, m] = item.targetTime.split(':');
                const period = h >= 12 ? 'PM' : 'AM';
                const formattedHour = h % 12 || 12;
                timeHtml = `<span style="font-size: 0.85rem; font-weight: 700; color: var(--accent-color); margin-left: 0.5rem; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">@ ${formattedHour}:${m} ${period}</span>`;
            }

            const instructionsHtml = item.instructions ? `<span class="med-instructions-box">${item.instructions}</span>` : '';
            
            // Unique ID for the label/input relation
            const uniqueDomId = crypto.randomUUID();

            const wrapper = document.createElement('div');
            wrapper.className = 'med-item-wrapper';
            wrapper.innerHTML = `
                <label class="med-item ${isCompletedToday ? 'completed' : ''}" id="label-${uniqueDomId}" title="${AppSettings.expertMode ? 'Double-click to instantly log' : ''}">
                    <input type="checkbox" name="med" value="${compositeLogId}" class="med-checkbox" ${isCompletedToday ? 'checked disabled' : ''}>
                    <span class="med-details">
                        <span class="med-name" data-name="${item.name}">${item.name} ${timeHtml} ${freqHtml}</span>
                        <span class="med-dose">${item.dose}</span>
                        ${instructionsHtml}
                    </span>
                </label>
                <button type="button" class="btn-icon" onclick="openEditModal('${item.id}')" aria-label="Edit Medication" title="Edit Master Record">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
            `;
            checklistContainer.appendChild(wrapper);

            if (AppSettings.expertMode && !isCompletedToday) {
                const labelElement = wrapper.querySelector(`#label-${uniqueDomId}`);
                labelElement.addEventListener('dblclick', (e) => {
                    e.preventDefault(); 
                    const checkbox = labelElement.querySelector('input');
                    if (!checkbox.disabled) processBatchLog([compositeLogId]);
                });
            }
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
        // Find the checkbox by value. Because | can be special, escape it if necessary.
        // The safest selector is input[value="medId|time"].
        const checkbox = document.querySelector(`input[value="${compId}"]`);
        const nameElement = checkbox.closest('.med-item').querySelector('.med-name');
        
        // Extract base ID and target time for logging
        const parts = compId.split('|');
        const coreId = parts[0];
        const targetTime = parts[1] === 'none' ? null : parts[1];
        
        store.add({
            timestamp: new Date().toISOString() + '-' + crypto.randomUUID(), 
            dateTaken: baseTimestamp, 
            medId: coreId,
            targetTime: targetTime,
            compositeId: compId,
            medName: nameElement.getAttribute('data-name'),
            status: "taken"
        });
    });

    transaction.oncomplete = () => {
        compositeIds.forEach(compId => {
            const checkbox = document.querySelector(`input[value="${compId}"]`);
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
            
            // Show what scheduled slot this fulfilled
            let slotInfo = '';
            if (log.targetTime) {
                const [h, m] = log.targetTime.split(':');
                const period = h >= 12 ? 'PM' : 'AM';
                slotInfo = ` (Scheduled for ${h % 12 || 12}:${m} ${period})`;
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
    // Reload checklist to un-check the item if it was deleted today
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
// --- ENCRYPTED VAULT LOGIC ---
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

async function exportVault() {
    const password = vaultPassInput.value;
    if (!password) { showVaultStatus("Password required for export.", "var(--accent-color)"); return; }

    try {
        const meds = await new Promise(res => db.transaction(["meds"], "readonly").objectStore("meds").getAll().onsuccess = e => res(e.target.result));
        const logs = await new Promise(res => db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = e => res(e.target.result));
        
        const rawData = JSON.stringify({ meds, logs, exportedAt: new Date().toISOString() });
        const keyMaterial = await getKeyMaterial(password);
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const key = await getKey(keyMaterial, salt);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const encryptedContent = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(rawData));
        const bundle = new Uint8Array(salt.byteLength + iv.byteLength + encryptedContent.byteLength);
        bundle.set(salt, 0); bundle.set(iv, salt.byteLength); bundle.set(new Uint8Array(encryptedContent), salt.byteLength + iv.byteLength);

        const blob = new Blob([btoa(String.fromCharCode.apply(null, bundle))], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `MedLedger_${new Date().toISOString().split('T')[0]}.medvault`;
        a.click(); URL.revokeObjectURL(url);

        vaultPassInput.value = '';
        showVaultStatus("Export successful.", "var(--success-color)");
    } catch (err) { console.error(err); showVaultStatus("Export failed.", "#ef4444"); }
}

async function importVault(e) {
    const file = e.target.files[0];
    if (!file) return;

    const password = vaultPassInput.value;
    if (!password) { showVaultStatus("Password required to decrypt.", "var(--accent-color)"); e.target.value = ''; return; }

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const binaryString = atob(event.target.result);
            const bundle = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bundle[i] = binaryString.charCodeAt(i);

            const salt = bundle.slice(0, 16);
            const iv = bundle.slice(16, 28);
            const ciphertext = bundle.slice(28);

            const keyMaterial = await getKeyMaterial(password);
            const key = await getKey(keyMaterial, salt);
            const decryptedContent = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ciphertext);
            const parsedData = JSON.parse(dec.decode(decryptedContent));

            const transaction = db.transaction(["meds", "logs"], "readwrite");
            const medStore = transaction.objectStore("meds");
            const logStore = transaction.objectStore("logs");

            medStore.clear(); logStore.clear();
            parsedData.meds.forEach(med => medStore.add(med));
            parsedData.logs.forEach(log => logStore.add(log));

            transaction.oncomplete = () => {
                vaultPassInput.value = ''; e.target.value = '';
                loadChecklist(); refreshHistory();
                showVaultStatus("Import successful. Vault restored.", "var(--success-color)");
            };
        } catch (err) {
            console.error(err);
            showVaultStatus("Decryption failed. Incorrect password?", "#ef4444");
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}

function showVaultStatus(message, color) {
    vaultStatus.textContent = message; vaultStatus.style.color = color;
    setTimeout(() => { vaultStatus.textContent = ''; }, 4000);
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
            // Data upgrade check
            let times = med.times || [];
            if (!med.times && med.time) times = [med.time]; 

            times.forEach(targetTime => {
                if (currentHourStr >= targetTime) {
                    const compId = `${med.id}|${targetTime}`;
                    if (notifiedToday[compId] === todayStr) return; 

                    // Check if it was actually logged
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
