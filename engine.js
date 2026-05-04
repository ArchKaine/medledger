// ==========================================
// engine.js - MedLedger Core Logic
// Handles Checklist generation, logging, history, and notifications
// ==========================================

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

    // --- CLINICAL LOOKUP INTEGRATION ---
    let clinicalData = { description: "", indications: "" };
    const doLookup = document.getElementById('toggle-lookup')?.checked;
    if (doLookup && typeof fetchDrugInfo === 'function') {
        if(typeof showVaultStatus === 'function') showVaultStatus("Fetching clinical data...", "var(--accent-color)");
        clinicalData = await fetchDrugInfo(nameInput);
    }

    const specificDaysChecked = Array.from(document.querySelectorAll('input[name="new-med-days"]:checked')).map(cb => parseInt(cb.value));
    const cycleOn = parseInt(document.getElementById('new-med-cycle-on').value) || 0;
    const cycleOff = parseInt(document.getElementById('new-med-cycle-off').value) || 0;
    const cycleStart = document.getElementById('new-med-cycle-start').value;

    const newMed = {
        id: crypto.randomUUID(),
        name: nameInput,
        dose: doseInput,
        frequency: freqInput,
        times: timesArray,
        instructions: instructionsInput,
        sideEffects: sideEffectsInput,
        inventory: AppSettings.inventory ? inventoryInput : "",
        specificDays: freqInput === 'Specific Days' ? specificDaysChecked : [],
        cycleOn: freqInput === 'Cyclic' ? cycleOn : null,
        cycleOff: freqInput === 'Cyclic' ? cycleOff : null,
        cycleStartDate: freqInput === 'Cyclic' ? cycleStart : null,
        // Save fetched data
        description: clinicalData.description || "",
        indications: clinicalData.indications || ""
    };

    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").add(newMed);

    transaction.oncomplete = () => {
        const addMedForm = document.getElementById('add-med-form');
        if (addMedForm) addMedForm.reset();
        document.getElementById('new-med-freq').value = 'Daily';
        document.getElementById('new-med-specific-days').style.display = 'none';
        document.getElementById('new-med-cyclic').style.display = 'none';
        document.getElementById('new-med-times-container').innerHTML = `<input type="time" class="time-input" style="padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--bg-primary); color: var(--text-primary); font-family: inherit;">`;
        loadChecklist();
        if (warnings.length > 0) {
            if(typeof showVaultStatus === 'function') showVaultStatus("Added with warnings.", "var(--danger-color)");
        } else {
            if(typeof showVaultStatus === 'function') showVaultStatus("Medication added.", "var(--success-color)");
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
            
            const specificDaysDiv = document.getElementById('edit-med-specific-days');
            const cyclicDiv = document.getElementById('edit-med-cyclic');
            if(specificDaysDiv) specificDaysDiv.style.display = (med.frequency === 'Specific Days') ? 'block' : 'none';
            if(cyclicDiv) cyclicDiv.style.display = (med.frequency === 'Cyclic') ? 'flex' : 'none';

            const dayCheckboxes = document.querySelectorAll('input[name="edit-med-days"]');
            dayCheckboxes.forEach(cb => {
                cb.checked = (med.specificDays && med.specificDays.includes(parseInt(cb.value)));
            });

            document.getElementById('edit-med-cycle-on').value = med.cycleOn || '';
            document.getElementById('edit-med-cycle-off').value = med.cycleOff || '';
            document.getElementById('edit-med-cycle-start').value = med.cycleStartDate || '';
            
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
            const editModal = document.getElementById('edit-med-modal');
            editModal?.showModal();
            if(editModal) editModal.scrollTop = 0; 
            document.getElementById('edit-med-name').focus(); 
        }
    };
};

async function saveEditedMed(e) {
    e.preventDefault();
    const id = document.getElementById('edit-med-id').value;
    const name = document.getElementById('edit-med-name').value.trim();
    const dose = document.getElementById('edit-med-dose').value.trim();
    const freq = document.getElementById('edit-med-freq').value;
    const instructions = document.getElementById('edit-med-instructions').value.trim();
    const sideEffects = document.getElementById('edit-med-side-effects').value.trim(); 
    const inventory = AppSettings.inventory ? document.getElementById('edit-med-inventory').value.trim() : "";
    const timesArray = getTimesFromContainer('edit-med-times-container');

    const specificDaysChecked = Array.from(document.querySelectorAll('input[name="edit-med-days"]:checked')).map(cb => parseInt(cb.value));
    const cycleOn = parseInt(document.getElementById('edit-med-cycle-on').value) || 0;
    const cycleOff = parseInt(document.getElementById('edit-med-cycle-off').value) || 0;
    const cycleStart = document.getElementById('edit-med-cycle-start').value;

    const transaction = db.transaction(["meds"], "readwrite");
    const medStore = transaction.objectStore("meds");
    
    // Check if name changed to potentially refresh clinical data
    const existingMed = await new Promise(res => medStore.get(id).onsuccess = ev => res(ev.target.result));
    let description = existingMed.description || "";
    let indications = existingMed.indications || "";

    const doLookup = document.getElementById('toggle-lookup')?.checked;
    if (doLookup && existingMed.name !== name && typeof fetchDrugInfo === 'function') {
        const clinicalData = await fetchDrugInfo(name);
        description = clinicalData.description;
        indications = clinicalData.indications;
    }

    medStore.put({ 
        id: id, name: name, dose: dose, frequency: freq, times: timesArray,
        instructions: instructions, sideEffects: sideEffects, inventory: inventory,
        specificDays: freq === 'Specific Days' ? specificDaysChecked : [],
        cycleOn: freq === 'Cyclic' ? cycleOn : null,
        cycleOff: freq === 'Cyclic' ? cycleOff : null,
        cycleStartDate: freq === 'Cyclic' ? cycleStart : null,
        description: description,
        indications: indications
    });

    transaction.oncomplete = () => {
        document.getElementById('edit-med-modal')?.close();
        loadChecklist();
    };
}

function deleteMedication() {
    if (!AppSettings.noBabysitter && !confirm("Remove this medication completely from the regimen?")) return;
    const id = document.getElementById('edit-med-id').value;
    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").delete(id);

    transaction.oncomplete = () => {
        document.getElementById('edit-med-modal')?.close();
        loadChecklist();
    };
}

// --- Quick Refill API ---
window.refillMed = function(id, amount) {
    let addAmount = 0;
    if (amount === 'custom') {
        const inputEl = document.getElementById(`refill-custom-${id}`);
        addAmount = parseInt(inputEl.value) || 0;
    } else {
        addAmount = parseInt(amount) || 0;
    }

    if (addAmount <= 0) return;

    const transaction = db.transaction(["meds"], "readwrite");
    const medStore = transaction.objectStore("meds");
    const request = medStore.get(id);

    request.onsuccess = () => {
        const med = request.result;
        if (med) {
            let currentInv = parseInt(med.inventory) || 0;
            med.inventory = currentInv + addAmount;
            medStore.put(med);
        }
    };

    transaction.oncomplete = () => {
        loadChecklist(); 
    };
};

// --- Regimen Logic (Checklist & Logging) ---
function loadChecklist() {
    const checklistContainer = document.getElementById('checklist-container');
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
            const freqWeight = { "Morning": 1, "Daily": 2, "Night": 3, "Weekly": 4, "As Needed": 5, "Specific Days": 6, "Cyclic": 7 };
            const weightA = freqWeight[a.frequency] || 99;
            const weightB = freqWeight[b.frequency] || 99;
            if (weightA !== weightB) return weightA - weightB;
            return a.name.localeCompare(b.name);
        });

        const todayDate = new Date();
        todayDate.setHours(0,0,0,0);
        const todayDayOfWeek = todayDate.getDay();
        const todayStr = new Date().toLocaleDateString();
        let visibleMedsCount = 0;

        rawMeds.forEach(med => {
            let shouldRender = true;
            if (med.frequency === "Specific Days" && med.specificDays) {
                if (!med.specificDays.includes(todayDayOfWeek)) shouldRender = false;
            } 
            else if (med.frequency === "Cyclic" && med.cycleStartDate && med.cycleOn && med.cycleOff) {
                const cycleStart = new Date(med.cycleStartDate + 'T00:00:00');
                cycleStart.setHours(0,0,0,0);
                if (todayDate < cycleStart) shouldRender = false;
                else {
                    const diffTime = Math.abs(todayDate - cycleStart);
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    const cycleLength = parseInt(med.cycleOn) + parseInt(med.cycleOff);
                    if ((diffDays % cycleLength) >= parseInt(med.cycleOn)) shouldRender = false;
                }
            }

            if (!shouldRender && med.frequency !== "As Needed") return;
            visibleMedsCount++;

            let times = med.times && med.times.length > 0 ? med.times : [null];
            const freqClass = med.frequency === "As Needed" ? "freq-badge prn" : "freq-badge";
            let badgeText = med.frequency;
            if (med.frequency === 'Specific Days' && med.specificDays) badgeText = `Scheduled Today`;
            else if (med.frequency === 'Cyclic' && med.cycleOn) badgeText = `Cycle: ${med.cycleOn} On / ${med.cycleOff} Off`;
            const freqHtml = med.frequency ? `<span class="${freqClass}">${badgeText}</span>` : '';

            let inventoryBadgeHtml = '';
            let refillHtml = '';
            if (AppSettings.inventory && med.inventory !== undefined && med.inventory !== "") {
                const invCount = parseInt(med.inventory);
                const isLow = invCount <= 10;
                inventoryBadgeHtml = `<span style="margin-left: 0.5rem; font-size: 0.75rem; background: ${isLow ? 'rgba(239, 68, 68, 0.15)' : 'transparent'}; color: ${isLow ? 'var(--danger-color)' : 'var(--text-secondary)'}; padding: 0.1rem 0.5rem; border-radius: 12px; border: 1px solid ${isLow ? 'var(--danger-color)' : 'var(--border-color)'}; font-weight: ${isLow ? 'bold' : 'normal'};">💊 ${invCount} left</span>`;
                if (isLow) {
                    refillHtml = `
                        <div style="padding: 0.75rem 1rem; border-top: 1px solid var(--border-color); background-color: rgba(239, 68, 68, 0.05); display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
                            <span style="color: var(--danger-color); font-size: 0.85rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">⚠️ Low Supply</span>
                            <div style="display: flex; gap: 0.5rem; align-items: stretch;">
                                <button type="button" class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="refillMed('${med.id}', 30)">+30</button>
                                <button type="button" class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="refillMed('${med.id}', 90)">+90</button>
                                <div style="display: flex; align-items: stretch;">
                                    <input type="number" id="refill-custom-${med.id}" placeholder="Qty" style="width: 50px; padding: 0.25rem; font-size: 0.8rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 4px 0 0 4px; color: var(--text-primary); border-right: none;" min="1">
                                    <button type="button" class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; border-radius: 0 4px 4px 0;" onclick="refillMed('${med.id}', 'custom')">Add</button>
                                </div>
                            </div>
                        </div>`;
                }
            }

            const card = document.createElement('div');
            card.className = 'card'; card.style.padding = '0'; card.style.overflow = 'hidden'; card.style.marginBottom = '1rem';
            
            let checkboxesHtml = '<div class="checklist" style="padding: 0.5rem 1rem;">';
            times.forEach(t => {
                const compositeLogId = t ? `${med.id}|${t}` : `${med.id}|none`;
                const isCompletedToday = logs.some(log => log.compositeId === compositeLogId && new Date(log.dateTaken).toLocaleDateString() === todayStr);
                let timeLabel = "Take Dosage";
                if (t) {
                    const [h, m] = t.split(':');
                    timeLabel = `@ ${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
                } else if (med.frequency === 'As Needed') timeLabel = "Log PRN Dose";

                const labelId = 'lbl-' + crypto.randomUUID();
                checkboxesHtml += `
                    <label class="med-item ${isCompletedToday ? 'completed' : ''}" id="${labelId}">
                        <input type="checkbox" name="med" value="${compositeLogId}" data-name="${med.name.replace(/"/g, '&quot;')}" class="med-checkbox" ${isCompletedToday ? 'checked disabled' : ''}>
                        <span class="med-details" style="width: 100%;">
                            <span class="med-name" style="color: ${isCompletedToday ? 'var(--text-secondary)' : 'var(--text-primary)'};">${timeLabel}</span>
                        </span>
                    </label>`;

                if (med.frequency === 'As Needed' && !isCompletedToday) {
                    checkboxesHtml += `
                        <div style="padding-left: 2.25rem; margin-top: -0.25rem; margin-bottom: 0.5rem;">
                            <input type="text" id="prn-reason-${compositeLogId}" placeholder="Reason / Symptom (e.g., Headache 7/10)" style="width: 100%; max-width: 300px; padding: 0.35rem 0.5rem; font-size: 0.8rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                        </div>`;
                }
            });
            checkboxesHtml += '</div>';

            let extrasHtml = '';
            if (med.instructions || med.sideEffects || med.description || med.indications) {
                extrasHtml = `<div style="padding: 0.75rem 1rem; border-top: 1px solid var(--border-color); background-color: var(--bg-primary); display: flex; flex-direction: column; gap: 0.5rem;">`;
                if (med.instructions) extrasHtml += `<div class="med-instructions-box" style="margin-top:0;"><i>${med.instructions}</i></div>`;
                if (med.sideEffects) extrasHtml += `<div style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 500;">ℹ️ ${med.sideEffects}</div>`;
                
                // --- CLINICAL INFO DISPLAY ---
                if (med.description || med.indications) {
                    extrasHtml += `<div style="font-size: 0.8rem; color: var(--text-secondary); border-top: 1px solid var(--border-color); padding-top: 0.5rem; margin-top: 0.25rem; border-color: rgba(255,255,255,0.05);">
                        ${med.description ? `<div style="margin-bottom: 0.25rem;"><strong>Info:</strong> ${med.description}</div>` : ''}
                        ${med.indications ? `<div><strong>Primary Uses:</strong> ${med.indications}</div>` : ''}
                    </div>`;
                }
                extrasHtml += `</div>`;
            }

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem; border-bottom: 1px solid var(--border-color); background-color: var(--bg-surface);">
                    <div><h3 style="margin: 0; font-size: 1.1rem;">${med.name} ${freqHtml}</h3><div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.25rem;">${med.dose} ${inventoryBadgeHtml}</div></div>
                    <button type="button" class="icon-btn" onclick="openEditModal('${med.id}')">✏️</button>
                </div>` + checkboxesHtml + extrasHtml + refillHtml;
            checklistContainer.appendChild(card);
        });
        
        if (visibleMedsCount === 0) checklistContainer.innerHTML = '<p style="color: var(--text-secondary);">No medications scheduled for today.</p>';
        if(typeof updateStatus === 'function') updateStatus();
    };
}

function logSelected() {
    const checkboxes = document.querySelectorAll('#checklist-container .med-checkbox:checked:not(:disabled)');
    if (checkboxes.length === 0) return;
    processBatchLog(Array.from(checkboxes).map(cb => ({ compId: cb.value, medName: cb.getAttribute('data-name'), checkboxElement: cb })));
}

function logAll() {
    const checkboxes = document.querySelectorAll('#checklist-container .med-checkbox:not(:disabled)');
    if (checkboxes.length === 0) return;
    processBatchLog(Array.from(checkboxes).map(cb => ({ compId: cb.value, medName: cb.getAttribute('data-name'), checkboxElement: cb })));
}

function processBatchLog(items) {
    items.forEach(item => { if (item.checkboxElement) item.checkboxElement.disabled = true; });
    const tx = db.transaction(["logs", "meds"], "readwrite");
    const manualTimeInput = document.getElementById('manual-time');
    const now = Date.now();
    const baseTimestamp = (manualTimeInput && manualTimeInput.value) ? new Date(manualTimeInput.value).toISOString() : new Date(now).toISOString();
    let decrements = {}; 

    items.forEach(item => {
        const parts = item.compId.split('|');
        decrements[parts[0]] = (decrements[parts[0]] || 0) + 1;
        const reasonInput = document.getElementById(`prn-reason-${item.compId}`);
        tx.objectStore("logs").add({
            timestamp: new Date().toISOString() + '-' + crypto.randomUUID(), 
            dateTaken: baseTimestamp, systemLoggedTime: now, medId: parts[0],
            targetTime: parts[1] === 'none' ? null : parts[1], compositeId: item.compId,
            medName: item.medName, status: "taken", prnReason: reasonInput ? reasonInput.value.trim() : ""
        });
    });

    if (AppSettings.inventory) {
        Object.keys(decrements).forEach(id => {
            const req = tx.objectStore("meds").get(id);
            req.onsuccess = () => {
                const med = req.result;
                if (med && med.inventory !== undefined && med.inventory !== "") {
                    med.inventory = Math.max(0, parseInt(med.inventory) - decrements[id]);
                    tx.objectStore("meds").put(med);
                }
            };
        });
    }

    tx.oncomplete = () => {
        if (manualTimeInput) manualTimeInput.value = '';
        refreshHistory(); loadChecklist(); 
        if(typeof calculateAdherence === 'function') calculateAdherence(); 
    };
}

function refreshHistory() {
    const historyList = document.getElementById('history-list');
    if(!historyList) return;
    db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = (e) => {
        const logs = e.target.result.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));
        historyList.innerHTML = '';
        const tracker = {};
        logs.forEach(log => { if (log.targetTime) { const key = new Date(log.dateTaken).toLocaleDateString() + '|' + log.compositeId; tracker[key] = (tracker[key] || 0) + 1; } });

        logs.slice(0, 15).forEach(log => {
            const dateObj = new Date(log.dateTaken);
            const slotInfo = log.targetTime ? `<span style="font-size: 0.75rem; color: var(--text-secondary);">(Scheduled ${log.targetTime})</span>` : '';
            const isDup = log.targetTime && tracker[new Date(log.dateTaken).toLocaleDateString() + '|' + log.compositeId] > 1;
            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `
                <div class="history-info">
                    <span class="history-med">${log.medName} ${slotInfo} ${isDup ? '<span class="badge-dup">Duplicate</span>' : ''}</span>
                    <span class="history-time">${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    ${log.prnReason ? `<div style="font-size: 0.8rem; color: var(--accent-color);">📝 ${log.prnReason}</div>` : ''}
                </div>
                <button class="icon-btn" onclick="deleteLog('${log.timestamp}')">🗑️</button>`;
            historyList.appendChild(li);
        });
    };
}

window.deleteLog = function(timestampKey) {
    if (!AppSettings.noBabysitter && !confirm("Remove this log entry and refund inventory?")) return;
    const tx = db.transaction(["logs", "meds"], "readwrite");
    tx.objectStore("logs").get(timestampKey).onsuccess = (e) => {
        const log = e.target.result;
        if (log) {
            tx.objectStore("logs").delete(timestampKey);
            if (AppSettings.inventory && log.medId) {
                tx.objectStore("meds").get(log.medId).onsuccess = (ev) => {
                    const med = ev.target.result;
                    if (med && med.inventory !== undefined && med.inventory !== "") {
                        med.inventory = parseInt(med.inventory) + 1;
                        tx.objectStore("meds").put(med);
                    }
                };
            }
        }
    };
    tx.oncomplete = () => { refreshHistory(); loadChecklist(); if(typeof calculateAdherence === 'function') calculateAdherence(); };
};

// --- CLINICIAN EXPORTS (CSV & High-Fidelity HTML Summary) ---
async function exportCSV() {
    const logs = await new Promise(res => db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = e => res(e.target.result));
    if (!logs || logs.length === 0) return;
    logs.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));
    let csv = "Date,Time,Medication,Target,Status,PRN Reason\n";
    logs.forEach(l => {
        const d = new Date(l.dateTaken);
        csv += `${d.toLocaleDateString()},${d.toLocaleTimeString()},"${l.medName}",${l.targetTime || 'PRN'},${l.status},"${(l.prnReason || '').replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `MedLedger_Report.csv`; a.click();
}

async function exportHTMLReport() {
    const tx = db.transaction(["meds", "logs"], "readonly");
    const meds = await new Promise(res => tx.objectStore("meds").getAll().onsuccess = e => res(e.target.result));
    const logs = await new Promise(res => tx.objectStore("logs").getAll().onsuccess = e => res(e.target.result));
    if (!logs || logs.length === 0) { if(typeof showVaultStatus === 'function') showVaultStatus("No history to export.", "var(--danger-color)"); return; }

    const lowInventoryMeds = meds.filter(m => AppSettings.inventory && parseInt(m.inventory) <= 10);
    const groupedLogs = {};
    logs.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken)).forEach(log => {
        const dateStr = new Date(log.dateTaken).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        if (!groupedLogs[dateStr]) groupedLogs[dateStr] = [];
        groupedLogs[dateStr].push(log);
    });

    let clinicalBodyHtml = "";
    Object.keys(groupedLogs).forEach(date => {
        clinicalBodyHtml += `
            <div class="date-group">
                <div class="date-header">${date}</div>
                <table class="clinical-table">
                    <thead><tr><th style="width: 100px;">Time</th><th>Medication & Context</th><th style="width: 120px; text-align: center;">Target</th></tr></thead>
                    <tbody>${groupedLogs[date].map(log => `
                        <tr class="${!log.targetTime ? 'prn-row' : ''}">
                            <td><strong>${new Date(log.dateTaken).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></td>
                            <td><div class="med-name-cell">${log.medName} ${!log.targetTime ? '<span class="prn-badge">As Needed</span>' : ''}</div>
                                ${log.prnReason ? `<div class="note-box">📝 ${log.prnReason}</div>` : ""}</td>
                            <td style="text-align: center; color: #64748b;">${log.targetTime || '--'}</td>
                        </tr>`).join('')}</tbody>
                </table>
            </div>`;
    });

    const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Clinical Summary</title><style>
        body { font-family: -apple-system, system-ui, sans-serif; color: #1e293b; line-height: 1.5; padding: 40px; background: #f8fafc; }
        .report-paper { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 900px; margin: 0 auto; border-top: 8px solid #2563eb; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
        .patient-meta { font-size: 14px; color: #64748b; }
        .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #f1f5f9; padding: 15px; border-radius: 6px; text-align: center; }
        .stat-val { font-size: 20px; font-weight: 800; color: #2563eb; }
        .stat-lab { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
        .date-group { margin-bottom: 40px; }
        .date-header { font-size: 16px; font-weight: 700; background: #e2e8f0; padding: 8px 15px; border-radius: 4px; margin-bottom: 10px; }
        .clinical-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .clinical-table th { text-align: left; padding: 10px; border-bottom: 1px solid #cbd5e1; }
        .clinical-table td { padding: 12px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        .med-name-cell { font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .prn-badge { background: #dbeafe; color: #1e40af; font-size: 10px; padding: 2px 6px; border-radius: 10px; text-transform: uppercase; }
        .prn-row { background-color: #f0f9ff; }
        .note-box { margin-top: 4px; font-style: italic; color: #2563eb; }
        .refill-section { background: #fff1f2; border: 1px solid #fecdd3; padding: 20px; border-radius: 8px; margin-top: 30px; }
        .btn-print { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; margin-bottom: 20px; }
        @media print { body { padding: 0; background: white; } .report-paper { box-shadow: none; border: none; max-width: 100%; padding: 0; } .no-print { display: none; } }
    </style></head><body>
    <div class="no-print" style="text-align:right;"><button class="btn-print" onclick="window.print()">Print Clinical Summary</button></div>
    <div class="report-paper"><div class="header"><div><h1>Medication Adherence Summary</h1><div class="patient-meta">Patient: <strong>Brian E Turner</strong> | Generated: ${new Date().toLocaleString()}</div></div><div style="text-align: right;"><div style="font-weight: 900; font-size: 20px; color: #2563eb;">MedLedger</div><div class="patient-meta">Self-Reported Adherence Data</div></div></div>
    <div class="stat-grid"><div class="stat-card"><div class="stat-val">${logs.length}</div><div class="stat-lab">Total Doses Logged</div></div><div class="stat-card"><div class="stat-val">${logs.filter(l => !l.targetTime).length}</div><div class="stat-lab">PRN Instances</div></div><div class="stat-card"><div class="stat-val">${lowInventoryMeds.length}</div><div class="stat-lab">Meds Needing Refill</div></div></div>
    ${lowInventoryMeds.length > 0 ? `<div class="refill-section"><h3 style="color: #e11d48; margin-top: 0;">⚠️ Refill Requirements</h3>${lowInventoryMeds.map(m => `<div><strong>${m.name}</strong> (${m.inventory} left)</div>`).join('')}</div>` : ""}
    <h2 style="font-size: 18px; margin-top: 30px; border-bottom: 2px solid #2563eb; display: inline-block;">Detailed Daily Logs</h2>
    ${clinicalBodyHtml}<div style="margin-top: 50px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px;">MedLedger Health Analytics | Data resides locally on user device.</div></div></body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `MedLedger_Clinical_Summary.html`; link.click();
    if(typeof showVaultStatus === 'function') showVaultStatus("Summary Generated.", "var(--success-color)");
}

// --- LOCAL NOTIFICATION ENGINE ---
let notifiedToday = JSON.parse(localStorage.getItem('notifiedMeds')) || {};
function checkReminders() {
    if (!AppSettings.reminders || Notification.permission !== 'granted') return;
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) { notifiedToday = {}; localStorage.setItem('notifiedMeds', JSON.stringify(notifiedToday)); }
    const currentHourStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const todayStr = now.toLocaleDateString();
    db.transaction(["meds", "logs"], "readonly").objectStore("meds").getAll().onsuccess = (e) => {
        const meds = e.target.result;
        db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = (ev) => {
            const logs = ev.target.result;
            meds.forEach(med => {
                if (med.frequency === "As Needed") return;
                (med.times || []).forEach(targetTime => {
                    if (currentHourStr >= targetTime) {
                        const compId = `${med.id}|${targetTime}`;
                        if (notifiedToday[compId] === todayStr) return;
                        if (!logs.some(log => log.compositeId === compId && new Date(log.dateTaken).toLocaleDateString() === todayStr)) {
                            navigator.serviceWorker.ready.then(reg => {
                                reg.showNotification("MedLedger Reminder", { body: `Pending: ${med.name} (${med.dose}) at ${targetTime}`, requireInteraction: true });
                            });
                            notifiedToday[compId] = todayStr; localStorage.setItem('notifiedMeds', JSON.stringify(notifiedToday));
                        }
                    }
                });
            });
        };
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
            lastCheckedDate = currentDate; loadChecklist(); refreshHistory();
            if(typeof calculateAdherence === 'function') calculateAdherence(); 
        }
    }
});// ==========================================
// engine.js - MedLedger Core Logic
// Handles Checklist generation, logging, history, and notifications
// ==========================================

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

    const specificDaysChecked = Array.from(document.querySelectorAll('input[name="new-med-days"]:checked')).map(cb => parseInt(cb.value));
    const cycleOn = parseInt(document.getElementById('new-med-cycle-on').value) || 0;
    const cycleOff = parseInt(document.getElementById('new-med-cycle-off').value) || 0;
    const cycleStart = document.getElementById('new-med-cycle-start').value;

    const newMed = {
        id: crypto.randomUUID(),
        name: nameInput,
        dose: doseInput,
        frequency: freqInput,
        times: timesArray,
        instructions: instructionsInput,
        sideEffects: sideEffectsInput,
        inventory: AppSettings.inventory ? inventoryInput : "",
        specificDays: freqInput === 'Specific Days' ? specificDaysChecked : [],
        cycleOn: freqInput === 'Cyclic' ? cycleOn : null,
        cycleOff: freqInput === 'Cyclic' ? cycleOff : null,
        cycleStartDate: freqInput === 'Cyclic' ? cycleStart : null
    };

    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").add(newMed);

    transaction.oncomplete = () => {
        const addMedForm = document.getElementById('add-med-form');
        if (addMedForm) addMedForm.reset();
        document.getElementById('new-med-freq').value = 'Daily';
        document.getElementById('new-med-specific-days').style.display = 'none';
        document.getElementById('new-med-cyclic').style.display = 'none';
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
            
            const specificDaysDiv = document.getElementById('edit-med-specific-days');
            const cyclicDiv = document.getElementById('edit-med-cyclic');
            if(specificDaysDiv) specificDaysDiv.style.display = (med.frequency === 'Specific Days') ? 'block' : 'none';
            if(cyclicDiv) cyclicDiv.style.display = (med.frequency === 'Cyclic') ? 'flex' : 'none';

            const dayCheckboxes = document.querySelectorAll('input[name="edit-med-days"]');
            dayCheckboxes.forEach(cb => {
                cb.checked = (med.specificDays && med.specificDays.includes(parseInt(cb.value)));
            });

            document.getElementById('edit-med-cycle-on').value = med.cycleOn || '';
            document.getElementById('edit-med-cycle-off').value = med.cycleOff || '';
            document.getElementById('edit-med-cycle-start').value = med.cycleStartDate || '';
            
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
            const editModal = document.getElementById('edit-med-modal');
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

    const specificDaysChecked = Array.from(document.querySelectorAll('input[name="edit-med-days"]:checked')).map(cb => parseInt(cb.value));
    const cycleOn = parseInt(document.getElementById('edit-med-cycle-on').value) || 0;
    const cycleOff = parseInt(document.getElementById('edit-med-cycle-off').value) || 0;
    const cycleStart = document.getElementById('edit-med-cycle-start').value;

    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").put({ 
        id: id, name: name, dose: dose, frequency: freq, times: timesArray,
        instructions: instructions, sideEffects: sideEffects, inventory: inventory,
        specificDays: freq === 'Specific Days' ? specificDaysChecked : [],
        cycleOn: freq === 'Cyclic' ? cycleOn : null,
        cycleOff: freq === 'Cyclic' ? cycleOff : null,
        cycleStartDate: freq === 'Cyclic' ? cycleStart : null
    });

    transaction.oncomplete = () => {
        document.getElementById('edit-med-modal')?.close();
        loadChecklist();
    };
}

function deleteMedication() {
    if (!AppSettings.noBabysitter && !confirm("Remove this medication completely from the regimen?")) return;
    const id = document.getElementById('edit-med-id').value;
    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").delete(id);

    transaction.oncomplete = () => {
        document.getElementById('edit-med-modal')?.close();
        loadChecklist();
    };
}

// --- Quick Refill API ---
window.refillMed = function(id, amount) {
    let addAmount = 0;
    if (amount === 'custom') {
        const inputEl = document.getElementById(`refill-custom-${id}`);
        addAmount = parseInt(inputEl.value) || 0;
    } else {
        addAmount = parseInt(amount) || 0;
    }

    if (addAmount <= 0) return;

    const transaction = db.transaction(["meds"], "readwrite");
    const medStore = transaction.objectStore("meds");
    const request = medStore.get(id);

    request.onsuccess = () => {
        const med = request.result;
        if (med) {
            let currentInv = parseInt(med.inventory) || 0;
            med.inventory = currentInv + addAmount;
            medStore.put(med);
        }
    };

    transaction.oncomplete = () => {
        loadChecklist(); 
    };
};

// --- Regimen Logic (Checklist & Logging) ---
function loadChecklist() {
    const checklistContainer = document.getElementById('checklist-container');
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
            const freqWeight = { "Morning": 1, "Daily": 2, "Night": 3, "Weekly": 4, "As Needed": 5, "Specific Days": 6, "Cyclic": 7 };
            const weightA = freqWeight[a.frequency] || 99;
            const weightB = freqWeight[b.frequency] || 99;
            if (weightA !== weightB) return weightA - weightB;
            return a.name.localeCompare(b.name);
        });

        const todayDate = new Date();
        todayDate.setHours(0,0,0,0);
        const todayDayOfWeek = todayDate.getDay();
        const todayStr = new Date().toLocaleDateString();
        let visibleMedsCount = 0;

        rawMeds.forEach(med => {
            let shouldRender = true;
            if (med.frequency === "Specific Days" && med.specificDays) {
                if (!med.specificDays.includes(todayDayOfWeek)) shouldRender = false;
            } 
            else if (med.frequency === "Cyclic" && med.cycleStartDate && med.cycleOn && med.cycleOff) {
                const cycleStart = new Date(med.cycleStartDate + 'T00:00:00');
                cycleStart.setHours(0,0,0,0);
                if (todayDate < cycleStart) shouldRender = false;
                else {
                    const diffTime = Math.abs(todayDate - cycleStart);
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    const cycleLength = parseInt(med.cycleOn) + parseInt(med.cycleOff);
                    if ((diffDays % cycleLength) >= parseInt(med.cycleOn)) shouldRender = false;
                }
            }

            if (!shouldRender && med.frequency !== "As Needed") return;
            visibleMedsCount++;

            let times = med.times && med.times.length > 0 ? med.times : [null];
            const freqClass = med.frequency === "As Needed" ? "freq-badge prn" : "freq-badge";
            let badgeText = med.frequency;
            if (med.frequency === 'Specific Days' && med.specificDays) badgeText = `Scheduled Today`;
            else if (med.frequency === 'Cyclic' && med.cycleOn) badgeText = `Cycle: ${med.cycleOn} On / ${med.cycleOff} Off`;
            const freqHtml = med.frequency ? `<span class="${freqClass}">${badgeText}</span>` : '';

            let inventoryBadgeHtml = '';
            let refillHtml = '';
            if (AppSettings.inventory && med.inventory !== undefined && med.inventory !== "") {
                const invCount = parseInt(med.inventory);
                const isLow = invCount <= 10;
                inventoryBadgeHtml = `<span style="margin-left: 0.5rem; font-size: 0.75rem; background: ${isLow ? 'rgba(239, 68, 68, 0.15)' : 'transparent'}; color: ${isLow ? 'var(--danger-color)' : 'var(--text-secondary)'}; padding: 0.1rem 0.5rem; border-radius: 12px; border: 1px solid ${isLow ? 'var(--danger-color)' : 'var(--border-color)'}; font-weight: ${isLow ? 'bold' : 'normal'};">💊 ${invCount} left</span>`;
                if (isLow) {
                    refillHtml = `
                        <div style="padding: 0.75rem 1rem; border-top: 1px solid var(--border-color); background-color: rgba(239, 68, 68, 0.05); display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
                            <span style="color: var(--danger-color); font-size: 0.85rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">⚠️ Low Supply</span>
                            <div style="display: flex; gap: 0.5rem; align-items: stretch;">
                                <button type="button" class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="refillMed('${med.id}', 30)">+30</button>
                                <button type="button" class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="refillMed('${med.id}', 90)">+90</button>
                                <div style="display: flex; align-items: stretch;">
                                    <input type="number" id="refill-custom-${med.id}" placeholder="Qty" style="width: 50px; padding: 0.25rem; font-size: 0.8rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 4px 0 0 4px; color: var(--text-primary); border-right: none;" min="1">
                                    <button type="button" class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; border-radius: 0 4px 4px 0;" onclick="refillMed('${med.id}', 'custom')">Add</button>
                                </div>
                            </div>
                        </div>`;
                }
            }

            const card = document.createElement('div');
            card.className = 'card'; card.style.padding = '0'; card.style.overflow = 'hidden'; card.style.marginBottom = '1rem';
            
            let checkboxesHtml = '<div class="checklist" style="padding: 0.5rem 1rem;">';
            times.forEach(t => {
                const compositeLogId = t ? `${med.id}|${t}` : `${med.id}|none`;
                const isCompletedToday = logs.some(log => log.compositeId === compositeLogId && new Date(log.dateTaken).toLocaleDateString() === todayStr);
                let timeLabel = "Take Dosage";
                if (t) {
                    const [h, m] = t.split(':');
                    timeLabel = `@ ${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
                } else if (med.frequency === 'As Needed') timeLabel = "Log PRN Dose";

                const labelId = 'lbl-' + crypto.randomUUID();
                checkboxesHtml += `
                    <label class="med-item ${isCompletedToday ? 'completed' : ''}" id="${labelId}">
                        <input type="checkbox" name="med" value="${compositeLogId}" data-name="${med.name.replace(/"/g, '&quot;')}" class="med-checkbox" ${isCompletedToday ? 'checked disabled' : ''}>
                        <span class="med-details" style="width: 100%;">
                            <span class="med-name" style="color: ${isCompletedToday ? 'var(--text-secondary)' : 'var(--text-primary)'};">${timeLabel}</span>
                        </span>
                    </label>`;

                if (med.frequency === 'As Needed' && !isCompletedToday) {
                    checkboxesHtml += `
                        <div style="padding-left: 2.25rem; margin-top: -0.25rem; margin-bottom: 0.5rem;">
                            <input type="text" id="prn-reason-${compositeLogId}" placeholder="Reason / Symptom (e.g., Headache 7/10)" style="width: 100%; max-width: 300px; padding: 0.35rem 0.5rem; font-size: 0.8rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                        </div>`;
                }
            });
            checkboxesHtml += '</div>';

            let extrasHtml = '';
            if (med.instructions || med.sideEffects) {
                extrasHtml = `<div style="padding: 0.75rem 1rem; border-top: 1px solid var(--border-color); background-color: var(--bg-primary); display: flex; flex-direction: column; gap: 0.5rem;">`;
                if (med.instructions) extrasHtml += `<div class="med-instructions-box" style="margin-top:0;"><i>${med.instructions}</i></div>`;
                if (med.sideEffects) extrasHtml += `<div style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 500;">ℹ️ ${med.sideEffects}</div>`;
                extrasHtml += `</div>`;
            }

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem; border-bottom: 1px solid var(--border-color); background-color: var(--bg-surface);">
                    <div><h3 style="margin: 0; font-size: 1.1rem;">${med.name} ${freqHtml}</h3><div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.25rem;">${med.dose} ${inventoryBadgeHtml}</div></div>
                    <button type="button" class="icon-btn" onclick="openEditModal('${med.id}')">✏️</button>
                </div>` + checkboxesHtml + extrasHtml + refillHtml;
            checklistContainer.appendChild(card);
        });
        
        if (visibleMedsCount === 0) checklistContainer.innerHTML = '<p style="color: var(--text-secondary);">No medications scheduled for today.</p>';
        if(typeof updateStatus === 'function') updateStatus();
    };
}

function logSelected() {
    const checkboxes = document.querySelectorAll('#checklist-container .med-checkbox:checked:not(:disabled)');
    if (checkboxes.length === 0) return;
    processBatchLog(Array.from(checkboxes).map(cb => ({ compId: cb.value, medName: cb.getAttribute('data-name'), checkboxElement: cb })));
}

function logAll() {
    const checkboxes = document.querySelectorAll('#checklist-container .med-checkbox:not(:disabled)');
    if (checkboxes.length === 0) return;
    processBatchLog(Array.from(checkboxes).map(cb => ({ compId: cb.value, medName: cb.getAttribute('data-name'), checkboxElement: cb })));
}

function processBatchLog(items) {
    items.forEach(item => { if (item.checkboxElement) item.checkboxElement.disabled = true; });
    const tx = db.transaction(["logs", "meds"], "readwrite");
    const manualTimeInput = document.getElementById('manual-time');
    const now = Date.now();
    const baseTimestamp = (manualTimeInput && manualTimeInput.value) ? new Date(manualTimeInput.value).toISOString() : new Date(now).toISOString();
    let decrements = {}; 

    items.forEach(item => {
        const parts = item.compId.split('|');
        decrements[parts[0]] = (decrements[parts[0]] || 0) + 1;
        const reasonInput = document.getElementById(`prn-reason-${item.compId}`);
        tx.objectStore("logs").add({
            timestamp: new Date().toISOString() + '-' + crypto.randomUUID(), 
            dateTaken: baseTimestamp, systemLoggedTime: now, medId: parts[0],
            targetTime: parts[1] === 'none' ? null : parts[1], compositeId: item.compId,
            medName: item.medName, status: "taken", prnReason: reasonInput ? reasonInput.value.trim() : ""
        });
    });

    if (AppSettings.inventory) {
        Object.keys(decrements).forEach(id => {
            const req = tx.objectStore("meds").get(id);
            req.onsuccess = () => {
                const med = req.result;
                if (med && med.inventory !== undefined && med.inventory !== "") {
                    med.inventory = Math.max(0, parseInt(med.inventory) - decrements[id]);
                    tx.objectStore("meds").put(med);
                }
            };
        });
    }

    tx.oncomplete = () => {
        if (manualTimeInput) manualTimeInput.value = '';
        refreshHistory(); loadChecklist(); 
        if(typeof calculateAdherence === 'function') calculateAdherence(); 
    };
}

function refreshHistory() {
    const historyList = document.getElementById('history-list');
    if(!historyList) return;
    db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = (e) => {
        const logs = e.target.result.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));
        historyList.innerHTML = '';
        const tracker = {};
        logs.forEach(log => { if (log.targetTime) { const key = new Date(log.dateTaken).toLocaleDateString() + '|' + log.compositeId; tracker[key] = (tracker[key] || 0) + 1; } });

        logs.slice(0, 15).forEach(log => {
            const dateObj = new Date(log.dateTaken);
            const slotInfo = log.targetTime ? `<span style="font-size: 0.75rem; color: var(--text-secondary);">(Scheduled ${log.targetTime})</span>` : '';
            const isDup = log.targetTime && tracker[new Date(log.dateTaken).toLocaleDateString() + '|' + log.compositeId] > 1;
            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `
                <div class="history-info">
                    <span class="history-med">${log.medName} ${slotInfo} ${isDup ? '<span class="badge-dup">Duplicate</span>' : ''}</span>
                    <span class="history-time">${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    ${log.prnReason ? `<div style="font-size: 0.8rem; color: var(--accent-color);">📝 ${log.prnReason}</div>` : ''}
                </div>
                <button class="icon-btn" onclick="deleteLog('${log.timestamp}')">🗑️</button>`;
            historyList.appendChild(li);
        });
    };
}

window.deleteLog = function(timestampKey) {
    if (!AppSettings.noBabysitter && !confirm("Remove this log entry and refund inventory?")) return;
    const tx = db.transaction(["logs", "meds"], "readwrite");
    tx.objectStore("logs").get(timestampKey).onsuccess = (e) => {
        const log = e.target.result;
        if (log) {
            tx.objectStore("logs").delete(timestampKey);
            if (AppSettings.inventory && log.medId) {
                tx.objectStore("meds").get(log.medId).onsuccess = (ev) => {
                    const med = ev.target.result;
                    if (med && med.inventory !== undefined && med.inventory !== "") {
                        med.inventory = parseInt(med.inventory) + 1;
                        tx.objectStore("meds").put(med);
                    }
                };
            }
        }
    };
    tx.oncomplete = () => { refreshHistory(); loadChecklist(); if(typeof calculateAdherence === 'function') calculateAdherence(); };
};

// --- CLINICIAN EXPORTS (CSV & High-Fidelity HTML Summary) ---
async function exportCSV() {
    const logs = await new Promise(res => db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = e => res(e.target.result));
    if (!logs || logs.length === 0) return;
    logs.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));
    let csv = "Date,Time,Medication,Target,Status,PRN Reason\n";
    logs.forEach(l => {
        const d = new Date(l.dateTaken);
        csv += `${d.toLocaleDateString()},${d.toLocaleTimeString()},"${l.medName}",${l.targetTime || 'PRN'},${l.status},"${(l.prnReason || '').replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `MedLedger_Report.csv`; a.click();
}

async function exportHTMLReport() {
    const tx = db.transaction(["meds", "logs"], "readonly");
    const meds = await new Promise(res => tx.objectStore("meds").getAll().onsuccess = e => res(e.target.result));
    const logs = await new Promise(res => tx.objectStore("logs").getAll().onsuccess = e => res(e.target.result));
    if (!logs || logs.length === 0) { if(typeof showVaultStatus === 'function') showVaultStatus("No history to export.", "var(--danger-color)"); return; }

    const lowInventoryMeds = meds.filter(m => AppSettings.inventory && parseInt(m.inventory) <= 10);
    const groupedLogs = {};
    logs.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken)).forEach(log => {
        const dateStr = new Date(log.dateTaken).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        if (!groupedLogs[dateStr]) groupedLogs[dateStr] = [];
        groupedLogs[dateStr].push(log);
    });

    let clinicalBodyHtml = "";
    Object.keys(groupedLogs).forEach(date => {
        clinicalBodyHtml += `
            <div class="date-group">
                <div class="date-header">${date}</div>
                <table class="clinical-table">
                    <thead><tr><th style="width: 100px;">Time</th><th>Medication & Context</th><th style="width: 120px; text-align: center;">Target</th></tr></thead>
                    <tbody>${groupedLogs[date].map(log => `
                        <tr class="${!log.targetTime ? 'prn-row' : ''}">
                            <td><strong>${new Date(log.dateTaken).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></td>
                            <td><div class="med-name-cell">${log.medName} ${!log.targetTime ? '<span class="prn-badge">As Needed</span>' : ''}</div>
                                ${log.prnReason ? `<div class="note-box">📝 ${log.prnReason}</div>` : ""}</td>
                            <td style="text-align: center; color: #64748b;">${log.targetTime || '--'}</td>
                        </tr>`).join('')}</tbody>
                </table>
            </div>`;
    });

    const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Clinical Summary</title><style>
        body { font-family: -apple-system, system-ui, sans-serif; color: #1e293b; line-height: 1.5; padding: 40px; background: #f8fafc; }
        .report-paper { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 900px; margin: 0 auto; border-top: 8px solid #2563eb; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
        .patient-meta { font-size: 14px; color: #64748b; }
        .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #f1f5f9; padding: 15px; border-radius: 6px; text-align: center; }
        .stat-val { font-size: 20px; font-weight: 800; color: #2563eb; }
        .stat-lab { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
        .date-group { margin-bottom: 40px; }
        .date-header { font-size: 16px; font-weight: 700; background: #e2e8f0; padding: 8px 15px; border-radius: 4px; margin-bottom: 10px; }
        .clinical-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .clinical-table th { text-align: left; padding: 10px; border-bottom: 1px solid #cbd5e1; }
        .clinical-table td { padding: 12px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        .med-name-cell { font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .prn-badge { background: #dbeafe; color: #1e40af; font-size: 10px; padding: 2px 6px; border-radius: 10px; text-transform: uppercase; }
        .prn-row { background-color: #f0f9ff; }
        .note-box { margin-top: 4px; font-style: italic; color: #2563eb; }
        .refill-section { background: #fff1f2; border: 1px solid #fecdd3; padding: 20px; border-radius: 8px; margin-top: 30px; }
        .btn-print { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; margin-bottom: 20px; }
        @media print { body { padding: 0; background: white; } .report-paper { box-shadow: none; border: none; max-width: 100%; padding: 0; } .no-print { display: none; } }
    </style></head><body>
    <div class="no-print" style="text-align:right;"><button class="btn-print" onclick="window.print()">Print Clinical Summary</button></div>
    <div class="report-paper"><div class="header"><div><h1>Medication Adherence Summary</h1><div class="patient-meta">Patient: <strong>Brian E Turner</strong> | Generated: ${new Date().toLocaleString()}</div></div><div style="text-align: right;"><div style="font-weight: 900; font-size: 20px; color: #2563eb;">MedLedger</div><div class="patient-meta">Self-Reported Adherence Data</div></div></div>
    <div class="stat-grid"><div class="stat-card"><div class="stat-val">${logs.length}</div><div class="stat-lab">Total Doses Logged</div></div><div class="stat-card"><div class="stat-val">${logs.filter(l => !l.targetTime).length}</div><div class="stat-lab">PRN Instances</div></div><div class="stat-card"><div class="stat-val">${lowInventoryMeds.length}</div><div class="stat-lab">Meds Needing Refill</div></div></div>
    ${lowInventoryMeds.length > 0 ? `<div class="refill-section"><h3 style="color: #e11d48; margin-top: 0;">⚠️ Refill Requirements</h3>${lowInventoryMeds.map(m => `<div><strong>${m.name}</strong> (${m.inventory} left)</div>`).join('')}</div>` : ""}
    <h2 style="font-size: 18px; margin-top: 30px; border-bottom: 2px solid #2563eb; display: inline-block;">Detailed Daily Logs</h2>
    ${clinicalBodyHtml}<div style="margin-top: 50px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px;">MedLedger Health Analytics | Data resides locally on user device.</div></div></body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `MedLedger_Clinical_Summary.html`; link.click();
    if(typeof showVaultStatus === 'function') showVaultStatus("Summary Generated.", "var(--success-color)");
}

// --- LOCAL NOTIFICATION ENGINE ---
let notifiedToday = JSON.parse(localStorage.getItem('notifiedMeds')) || {};
function checkReminders() {
    if (!AppSettings.reminders || Notification.permission !== 'granted') return;
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) { notifiedToday = {}; localStorage.setItem('notifiedMeds', JSON.stringify(notifiedToday)); }
    const currentHourStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const todayStr = now.toLocaleDateString();
    db.transaction(["meds", "logs"], "readonly").objectStore("meds").getAll().onsuccess = (e) => {
        const meds = e.target.result;
        db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = (ev) => {
            const logs = ev.target.result;
            meds.forEach(med => {
                if (med.frequency === "As Needed") return;
                (med.times || []).forEach(targetTime => {
                    if (currentHourStr >= targetTime) {
                        const compId = `${med.id}|${targetTime}`;
                        if (notifiedToday[compId] === todayStr) return;
                        if (!logs.some(log => log.compositeId === compId && new Date(log.dateTaken).toLocaleDateString() === todayStr)) {
                            navigator.serviceWorker.ready.then(reg => {
                                reg.showNotification("MedLedger Reminder", { body: `Pending: ${med.name} (${med.dose}) at ${targetTime}`, requireInteraction: true });
                            });
                            notifiedToday[compId] = todayStr; localStorage.setItem('notifiedMeds', JSON.stringify(notifiedToday));
                        }
                    }
                });
            });
        };
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
            lastCheckedDate = currentDate; loadChecklist(); refreshHistory();
            if(typeof calculateAdherence === 'function') calculateAdherence(); 
        }
    }
});
