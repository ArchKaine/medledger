// ==========================================
// app.js - MedLedger Core Engine & Bootloader
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

    // Hook up Engine Listeners
    document.getElementById('btn-submit-selected')?.addEventListener('click', logSelected);
    document.getElementById('btn-submit-all')?.addEventListener('click', logAll);
    addMedForm?.addEventListener('submit', handleAddMed);
    document.getElementById('btn-cancel-edit')?.addEventListener('click', () => editModal.close());
    document.getElementById('btn-delete-med')?.addEventListener('click', deleteMedication);
    editForm?.addEventListener('submit', saveEditedMed);
    
    // Modal Interactions
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
    document.getElementById('btn-close-settings')?.addEventListener('click', () => settingsModal.close());
    
    document.getElementById('help-toggle')?.addEventListener('click', () => {
        helpModal?.showModal();
        if(helpModal) helpModal.scrollTop = 0; 
    });
    document.getElementById('btn-close-help')?.addEventListener('click', () => helpModal.close());

    // Connect to external modules
    document.getElementById('btn-peek-password')?.addEventListener('click', togglePasswordVisibility);
    document.getElementById('btn-lock-vault')?.addEventListener('click', lockVaultSession);
    document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
    document.getElementById('btn-export-html')?.addEventListener('click', exportHTMLReport);
    document.getElementById('btn-archive-logs')?.addEventListener('click', archiveOldLogs);
    document.getElementById('btn-restore-archives')?.addEventListener('click', restoreArchivedLogs);
    
    document.getElementById('heatmap-range')?.addEventListener('change', calculateAdherence);
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
        loadChecklist();
        refreshHistory();
    };
    request.onerror = (e) => {
        console.error("Database error: ", e.target.errorCode);
        if(typeof showVaultStatus === 'function') showVaultStatus("Database connection error.", "var(--danger-color)");
    };
}

// --- Archiving Logic ---
function archiveOldLogs() {
    const archiveDaysEl = document.getElementById('archive-days');
    const days = parseInt(archiveDaysEl ? archiveDaysEl.value : 90) || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const tx = db.transaction(["logs", "archived_logs"], "readwrite");
    const logStore = tx.objectStore("logs");
    const archiveStore = tx.objectStore("archived_logs");

    logStore.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const log = cursor.value;
            if (new Date(log.dateTaken) < cutoffDate) {
                archiveStore.add(log);
                cursor.delete();
            }
            cursor.continue();
        }
    };

    tx.oncomplete = () => {
        if(typeof showVaultStatus === 'function') showVaultStatus(`Logs older than ${days} days moved to cold storage.`, "var(--success-color)");
        refreshHistory();
        if(typeof calculateAdherence === 'function') calculateAdherence(); 
    };
}

function restoreArchivedLogs() {
    const tx = db.transaction(["logs", "archived_logs"], "readwrite");
    const logStore = tx.objectStore("logs");
    const archiveStore = tx.objectStore("archived_logs");

    archiveStore.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            logStore.add(cursor.value);
            cursor.delete();
            cursor.continue();
        }
    };

    tx.oncomplete = () => {
        if(typeof showVaultStatus === 'function') showVaultStatus("All archives restored to active memory.", "var(--success-color)");
        refreshHistory();
        if(typeof calculateAdherence === 'function') calculateAdherence(); 
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
    const nameInput = document.getElementById('new-med-name').value.trim();
    const doseInput = document.getElementById('new-med-dose').value.trim();
    const freqInput = document.getElementById('new-med-freq').value;
    const instructionsInput = document.getElementById('new-med-instructions').value.trim();
    const sideEffectsInput = document.getElementById('new-med-side-effects').value.trim();
    const inventoryInput = document.getElementById('new-med-inventory')?.value.trim() || "";
    const timesArray = getTimesFromContainer('new-med-times-container');

    if (!nameInput || !doseInput) return;

    const warnings = await checkLocalInteractions(nameInput);

    if (warnings.length > 0) {
        const alertMessage = `⚠️ POTENTIAL INTERACTION DETECTED ⚠️\n\n${warnings.join('\n\n')}\n\nDo you still want to add this medication to your regimen?`;
        if (!confirm(alertMessage)) {
            if(typeof showVaultStatus === 'function') showVaultStatus("Medication aborted.", "var(--text-secondary)");
            return;
        }
    }

    const newMed = {
        id: crypto.randomUUID(),
        name: nameInput,
        dose: doseInput,
        frequency: freqInput,
        times: timesArray,
        instructions: instructionsInput,
        sideEffects: sideEffectsInput,
        inventory: AppSettings.inventory ? inventoryInput : ""
    };

    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").add(newMed);

    transaction.oncomplete = () => {
        addMedForm.reset();
        document.getElementById('new-med-freq').value = 'Daily';
        document.getElementById('new-med-times-container').innerHTML = `<input type="time" class="time-input" style="padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--bg-primary); color: var(--text-primary); font-family: inherit;">`;
        loadChecklist();
        if (warnings.length > 0) {
            if(typeof showVaultStatus === 'function') showVaultStatus("Medication added with warnings.", "var(--danger-color)");
        }
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
            document.getElementById('edit-med-side-effects').value = med.sideEffects || ''; 
            
            const editInventoryGroup = document.getElementById('edit-inventory-group');
            if (AppSettings.inventory && editInventoryGroup) {
                editInventoryGroup.style.display = 'block';
                document.getElementById('edit-med-inventory').value = med.inventory || '';
            } else if (editInventoryGroup) {
                editInventoryGroup.style.display = 'none';
            }
            
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
            editModal?.showModal();
            if(editModal) editModal.scrollTop = 0; 
            document.getElementById('edit-med-name').focus(); 
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
    const sideEffects = document.getElementById('edit-med-side-effects').value.trim(); 
    const inventory = AppSettings.inventory ? document.getElementById('edit-med-inventory').value.trim() : "";
    const timesArray = getTimesFromContainer('edit-med-times-container');

    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").put({ 
        id: id, 
        name: name, 
        dose: dose, 
        frequency: freq,
        times: timesArray,
        instructions: instructions,
        sideEffects: sideEffects,
        inventory: inventory
    });

    transaction.oncomplete = () => {
        editModal?.close();
        loadChecklist();
    };
}

function deleteMedication() {
    if (!AppSettings.noBabysitter && !confirm("Remove this medication completely from the regimen?")) return;
    const id = document.getElementById('edit-med-id').value;
    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").delete(id);

    transaction.oncomplete = () => {
        editModal?.close();
        loadChecklist();
    };
}

// --- Regimen Logic (Checklist & Logging) ---
function loadChecklist() {
    if(!checklistContainer) return;
    
    const tx = db.transaction(["meds", "logs"], "readonly");
    const medReq = tx.objectStore("meds").getAll();
    const logReq = tx.objectStore("logs").getAll();

    tx.oncomplete = () => {
        const rawMeds = medReq.result;
        const logs = logReq.result;
        checklistContainer.innerHTML = '';

        if (rawMeds.length === 0) {
            checklistContainer.innerHTML = '<p style="color: var(--text-secondary);">No medications added yet.</p>';
            if(typeof updateStatus === 'function') updateStatus();
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

            const safeMedName = med.name.replace(/"/g, '&quot;');

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
                            ${med.name} ${freqHtml}
                        </h3>
                        <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.25rem; display: flex; align-items: center;">
                            ${med.dose} ${inventoryBadgeHtml}
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
        if(typeof updateStatus === 'function') updateStatus();
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
        if(typeof updateStatus === 'function') updateStatus();
        refreshHistory(); 
        loadChecklist(); 
        if(typeof calculateAdherence === 'function') calculateAdherence(); 
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
    if(!historyList) return;
    const transaction = db.transaction(["logs"], "readonly");
    const request = transaction.objectStore("logs").getAll();

    request.onsuccess = () => {
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
        loadChecklist(); 
        if(typeof calculateAdherence === 'function') calculateAdherence(); 
    };
};

function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('Service Worker Failed:', err));
    }
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
        if(typeof showVaultStatus === 'function') showVaultStatus("No history to export.", "var(--danger-color)");
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
    
    if(typeof showVaultStatus === 'function') showVaultStatus("CSV Export downloaded.", "var(--success-color)");
}

async function exportHTMLReport() {
    const logs = await new Promise(res => {
        const tx = db.transaction(["logs"], "readonly");
        tx.objectStore("logs").getAll().onsuccess = e => res(e.target.result);
    });

    if (!logs || logs.length === 0) {
        if(typeof showVaultStatus === 'function') showVaultStatus("No history to export.", "var(--danger-color)");
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

    if(typeof showVaultStatus === 'function') showVaultStatus("HTML Report downloaded.", "var(--success-color)");
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

// --- Midnight Rollover Engine ---
let lastCheckedDate = new Date().toLocaleDateString();

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const currentDate = new Date().toLocaleDateString();
        if (currentDate !== lastCheckedDate) {
            lastCheckedDate = currentDate;
            loadChecklist(); 
            refreshHistory(); 
            if(typeof calculateAdherence === 'function') calculateAdherence(); 
        }
    }
});
