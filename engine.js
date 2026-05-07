// ==========================================
// engine.js - MedLedger Core Logic
// Checklist, Regimen Logic, Refills, and High-Fidelity Reports
// ==========================================

// --- 1. Helper Logic ---

function getTimesFromContainer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const inputs = container.querySelectorAll('input[type="time"]');
    let times = [];
    inputs.forEach(input => { if (input.value) times.push(input.value); });
    return [...new Set(times)].sort();
}

/**
 * Generates a localized YYYY-MM-DD string for logic comparisons.
 * This anchors logs to the user's actual day, preventing timezone drift.
 */
function getLogicalDateString(dateObj) {
    return dateObj.getFullYear() + '-' + 
           String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + 
           String(dateObj.getDate()).padStart(2, '0');
}

// Ensures the inventory input on the main dashboard is visible if the feature is enabled
function updateInventoryUI() {
    const invEnabled = (typeof AppSettings !== 'undefined' && AppSettings.inventory);
    const newInv = document.getElementById('new-med-inventory');
    const newQty = document.getElementById('new-med-prescribed-qty');
    if (newInv) newInv.style.display = invEnabled ? 'block' : 'none';
    if (newQty) newQty.style.display = invEnabled ? 'block' : 'none';
}

// --- 2. Archiving Logic ---

function archiveOldLogs() {
    const archiveDaysEl = document.getElementById('archive-days');
    const days = parseInt(archiveDaysEl ? archiveDaysEl.value : 90) || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    if (AppSettings.devMode && window.MOCK_DATA) {
        window.MOCK_DATA.logs = window.MOCK_DATA.logs.filter(l => new Date(l.dateTaken) >= cutoffDate);
        window.syncDevData();
        if(typeof showVaultStatus === 'function') showVaultStatus(`Dev logs older than ${days} days purged.`, "var(--success-color)");
        refreshHistory();
        if(typeof calculateAdherence === 'function') calculateAdherence(); 
        return;
    }

    const tx = db.transaction(["logs", "archived_logs"], "readwrite");
    const logStore = tx.objectStore("logs");
    const archiveStore = tx.objectStore("archived_logs");

    logStore.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            if (new Date(cursor.value.dateTaken) < cutoffDate) {
                archiveStore.add(cursor.value);
                cursor.delete();
            }
            cursor.continue();
        }
    };
    tx.oncomplete = () => {
        if(typeof showVaultStatus === 'function') showVaultStatus(`History older than ${days} days archived.`, "var(--success-color)");
        refreshHistory();
        if(typeof calculateAdherence === 'function') calculateAdherence(); 
    };
}

function restoreArchivedLogs() {
    if (AppSettings.devMode) return;
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
        if(typeof showVaultStatus === 'function') showVaultStatus("Archives restored to active memory.", "var(--success-color)");
        refreshHistory();
        if(typeof calculateAdherence === 'function') calculateAdherence(); 
    };
}

// --- 3. PRN Efficacy Engine ---

window.updateEfficacy = function(ts) {
    const outcome = prompt("What was the outcome of this dose? (e.g. Headache resolved, Relief 2/10):");
    if (outcome === null) return;

    if (AppSettings.devMode && window.MOCK_DATA) {
        const log = window.MOCK_DATA.logs.find(l => l.timestamp === ts);
        if (log) log.efficacy = outcome;
        window.syncDevData();
        refreshHistory();
        return;
    }

    const tx = db.transaction(["logs"], "readwrite");
    const store = tx.objectStore("logs");
    store.get(ts).onsuccess = (e) => {
        const log = e.target.result;
        if (log) { 
            log.efficacy = outcome; 
            store.put(log); 
        }
    };
    tx.oncomplete = refreshHistory;
};

// --- 4. Configuration Logic (CRUD) ---

async function handleAddMed(e) {
    e.preventDefault();
    const nameInput = document.getElementById('new-med-name').value.trim();
    const doseInput = document.getElementById('new-med-dose').value.trim();
    const freqInput = document.getElementById('new-med-freq').value;
    const profileInput = document.getElementById('new-med-profile').value;
    const instructionsInput = document.getElementById('new-med-instructions').value.trim();
    const sideEffectsInput = document.getElementById('new-med-side-effects').value.trim();
    const inventoryInput = document.getElementById('new-med-inventory')?.value.trim() || "";
    
    // Logic: Use typical prescribed quantity if field is left blank
    const prescribedQtyInput = document.getElementById('new-med-prescribed-qty')?.value.trim();
    const finalPrescribedQty = prescribedQtyInput || (typeof window.getTypicalPrescribedQuantity === 'function' ? window.getTypicalPrescribedQuantity(nameInput) : 30);
    
    const rxNumberInput = document.getElementById('new-med-rx')?.value.trim() || "";
    const doctorInput = document.getElementById('new-med-doctor')?.value.trim() || "";
    const pharmacyPhoneInput = document.getElementById('new-med-phone')?.value.trim() || "";
    const timesArray = getTimesFromContainer('new-med-times-container');

    if (!nameInput || !doseInput) return;

    if (typeof checkLocalInteractions === 'function') {
        const warnings = await checkLocalInteractions(nameInput);
        if (warnings.length > 0 && !confirm(`⚠️ POTENTIAL INTERACTION DETECTED ⚠️\n\n${warnings.join('\n\n')}\n\nAdd anyway?`)) return;
    }

    let clinicalData = { description: "", indications: "", sideEffects: "" };
    if (document.getElementById('toggle-lookup')?.checked && typeof fetchDrugInfo === 'function') {
        clinicalData = await fetchDrugInfo(nameInput);
    }

    const specificDaysChecked = Array.from(document.querySelectorAll('input[name="new-med-days"]:checked')).map(cb => parseInt(cb.value));

    const newMed = {
        id: crypto.randomUUID(), name: nameInput, dose: doseInput, frequency: freqInput, times: timesArray,
        profile: profileInput, 
        instructions: instructionsInput, 
        sideEffects: sideEffectsInput || clinicalData.sideEffects, 
        inventory: AppSettings.inventory ? inventoryInput : "",
        prescribedQty: AppSettings.inventory ? (parseInt(finalPrescribedQty) || 30) : 30,
        rxNumber: rxNumberInput, doctor: doctorInput, pharmacyPhone: pharmacyPhoneInput,
        specificDays: freqInput === 'Specific Days' ? specificDaysChecked : [],
        cycleOn: freqInput === 'Cyclic' ? parseInt(document.getElementById('new-med-cycle-on').value) || 0 : null,
        cycleOff: freqInput === 'Cyclic' ? parseInt(document.getElementById('new-med-cycle-off').value) || 0 : null,
        cycleStartDate: freqInput === 'Cyclic' ? document.getElementById('new-med-cycle-start').value : null,
        description: clinicalData.description, indications: clinicalData.indications
    };

    if (AppSettings.devMode && window.MOCK_DATA) {
        window.MOCK_DATA.meds.push(newMed);
        window.syncDevData();
        document.getElementById('add-med-form').reset();
        loadChecklist(); 
        if (typeof populateProfileDropdowns === 'function') populateProfileDropdowns();
        if(typeof showVaultStatus === 'function') showVaultStatus("Test Medication added.", "var(--success-color)");
        return;
    }

    const tx = db.transaction(["meds"], "readwrite");
    tx.objectStore("meds").add(newMed);
    tx.oncomplete = () => {
        document.getElementById('add-med-form').reset();
        loadChecklist(); 
        if (typeof populateProfileDropdowns === 'function') populateProfileDropdowns();
        if(typeof showVaultStatus === 'function') showVaultStatus("Medication added.", "var(--success-color)");
    };
}

window.openEditModal = async function(id) {
    let med;
    if (AppSettings.devMode && window.MOCK_DATA) {
        med = window.MOCK_DATA.meds.find(m => m.id === id);
    } else {
        if (typeof db === 'undefined') return;
        const tx = db.transaction(["meds"], "readonly");
        med = await new Promise(r => tx.objectStore("meds").get(id).onsuccess = e => r(e.target.result));
    }
    
    if (!med) return;

    document.getElementById('edit-med-id').value = med.id;
    document.getElementById('edit-med-name').value = med.name;
    document.getElementById('edit-med-dose').value = med.dose;
    document.getElementById('edit-med-profile').value = med.profile || "Primary";
    document.getElementById('edit-med-freq').value = med.frequency || 'Daily';
    document.getElementById('edit-med-instructions').value = med.instructions || '';
    document.getElementById('edit-med-side-effects').value = med.sideEffects || ''; 
    document.getElementById('edit-med-rx').value = med.rxNumber || '';
    document.getElementById('edit-med-doctor').value = med.doctor || '';
    document.getElementById('edit-med-phone').value = med.pharmacyPhone || '';
    
    const invGroup = document.getElementById('edit-inventory-group');
    if (AppSettings.inventory && invGroup) {
        invGroup.style.display = 'block';
        document.getElementById('edit-med-inventory').value = med.inventory || '';
        document.getElementById('edit-med-prescribed-qty').value = med.prescribedQty || 30;
    } else if (invGroup) {
        invGroup.style.display = 'none';
    }
    
    const specDiv = document.getElementById('edit-med-specific-days');
    const cycDiv = document.getElementById('edit-med-cyclic');
    if(specDiv) specDiv.style.display = (med.frequency === 'Specific Days') ? 'block' : 'none';
    if(cycDiv) cycDiv.style.display = (med.frequency === 'Cyclic') ? 'flex' : 'none';

    document.querySelectorAll('input[name="edit-med-days"]').forEach(cb => {
        cb.checked = (med.specificDays && med.specificDays.includes(parseInt(cb.value)));
    });

    document.getElementById('edit-med-cycle-on').value = med.cycleOn || '';
    document.getElementById('edit-med-cycle-off').value = med.cycleOff || '';
    document.getElementById('edit-med-cycle-start').value = med.cycleStartDate || '';
    
    const container = document.getElementById('edit-med-times-container');
    container.innerHTML = ''; 
    (med.times || []).forEach(t => {
        if(typeof addTimeField === 'function') addTimeField('edit-med-times-container');
        if(container.lastElementChild) container.lastElementChild.value = t;
    });

    document.getElementById('edit-med-modal')?.showModal();
};

async function saveEditedMed(e) {
    e.preventDefault();
    const id = document.getElementById('edit-med-id').value;
    const name = document.getElementById('edit-med-name').value.trim();
    const freq = document.getElementById('edit-med-freq').value;
    
    let existing;
    if (AppSettings.devMode && window.MOCK_DATA) {
        existing = window.MOCK_DATA.meds.find(m => m.id === id);
    } else {
        const tx = db.transaction(["meds"], "readonly");
        existing = await new Promise(res => tx.objectStore("meds").get(id).onsuccess = ev => res(ev.target.result));
    }

    const updatedMed = { 
        ...existing,
        name, 
        dose: document.getElementById('edit-med-dose').value.trim(), 
        profile: document.getElementById('edit-med-profile').value,
        frequency: freq, 
        times: getTimesFromContainer('edit-med-times-container'),
        instructions: document.getElementById('edit-med-instructions').value.trim(),
        sideEffects: document.getElementById('edit-med-side-effects').value.trim(),
        rxNumber: document.getElementById('edit-med-rx').value.trim(),
        doctor: document.getElementById('edit-med-doctor').value.trim(),
        pharmacyPhone: document.getElementById('edit-med-phone').value.trim(),
        inventory: AppSettings.inventory ? document.getElementById('edit-med-inventory').value.trim() : "",
        prescribedQty: AppSettings.inventory ? (parseInt(document.getElementById('edit-med-prescribed-qty').value) || 30) : 30,
        specificDays: freq === 'Specific Days' ? Array.from(document.querySelectorAll('input[name="edit-med-days"]:checked')).map(cb => parseInt(cb.value)) : [],
        cycleOn: freq === 'Cyclic' ? parseInt(document.getElementById('edit-med-cycle-on').value) || 0 : null,
        cycleOff: freq === 'Cyclic' ? parseInt(document.getElementById('edit-med-cycle-off').value) || 0 : null,
        cycleStartDate: freq === 'Cyclic' ? document.getElementById('edit-med-cycle-start').value : null
    };

    if (AppSettings.devMode && window.MOCK_DATA) {
        let idx = window.MOCK_DATA.meds.findIndex(m => m.id === id);
        window.MOCK_DATA.meds[idx] = updatedMed;
        window.syncDevData();
        document.getElementById('edit-med-modal')?.close(); 
        loadChecklist(); 
        if (typeof populateProfileDropdowns === 'function') populateProfileDropdowns();
        return;
    }

    const txWrite = db.transaction(["meds"], "readwrite");
    txWrite.objectStore("meds").put(updatedMed);
    txWrite.oncomplete = () => { 
        document.getElementById('edit-med-modal')?.close(); 
        loadChecklist(); 
        if (typeof populateProfileDropdowns === 'function') populateProfileDropdowns(); 
    };
}

window.deleteMedication = function() {
    if (!AppSettings.noBabysitter && !confirm("Remove medication?")) return;
    const id = document.getElementById('edit-med-id').value;

    if (AppSettings.devMode && window.MOCK_DATA) {
        window.MOCK_DATA.meds = window.MOCK_DATA.meds.filter(m => m.id !== id);
        window.syncDevData();
        document.getElementById('edit-med-modal')?.close(); 
        loadChecklist(); 
        if (typeof populateProfileDropdowns === 'function') populateProfileDropdowns();
        return;
    }

    const tx = db.transaction(["meds"], "readwrite");
    tx.objectStore("meds").delete(id);
    tx.oncomplete = () => { 
        document.getElementById('edit-med-modal')?.close(); 
        loadChecklist(); 
        if (typeof populateProfileDropdowns === 'function') populateProfileDropdowns(); 
    };
}

window.refillMed = function(id, amount) {
    const qty = parseInt(amount);
    if (isNaN(qty) || qty <= 0) return;

    if (AppSettings.devMode && window.MOCK_DATA) {
        let m = window.MOCK_DATA.meds.find(x => x.id === id);
        if (m && m.inventory !== "" && m.inventory !== null && m.inventory !== undefined) {
            let current = parseInt(m.inventory);
            if (!isNaN(current)) m.inventory = current + qty;
        }
        window.syncDevData();
        loadChecklist();
        return;
    }

    const tx = db.transaction(["meds"], "readwrite");
    const medStore = tx.objectStore("meds");
    medStore.get(id).onsuccess = (e) => {
        const m = e.target.result;
        if (m && m.inventory !== "" && m.inventory !== null && m.inventory !== undefined) { 
            let current = parseInt(m.inventory);
            if (!isNaN(current)) {
                m.inventory = current + qty; 
                medStore.put(m); 
            }
        }
    };
    tx.oncomplete = loadChecklist;
};

// --- 5. Regimen Logic ---

function loadChecklist() {
    updateInventoryUI();
    const container = document.getElementById('checklist-container');
    if(!container) return;

    if (AppSettings.devMode && window.MOCK_DATA) {
        const filtered = window.MOCK_DATA.meds.filter(m => (m.profile || 'Primary') === AppSettings.activeProfile);
        renderChecklistUI(filtered, window.MOCK_DATA.logs, container);
        return;
    }

    if(typeof db === 'undefined') return;
    const tx = db.transaction(["meds", "logs"], "readonly");
    const medReq = tx.objectStore("meds").getAll();
    const logReq = tx.objectStore("logs").getAll();

    tx.oncomplete = () => {
        const filtered = medReq.result.filter(m => (m.profile || 'Primary') === AppSettings.activeProfile);
        renderChecklistUI(filtered, logReq.result, container);
    };
}

function renderChecklistUI(rawMeds, logs, container) {
    container.innerHTML = '';
    
    if (rawMeds.length === 0) { 
        const isFilt = AppSettings.activeProfile !== 'Primary';
        container.innerHTML = `
            <div class="card ftue-card" style="text-align: center; padding: 3rem 2rem; background: linear-gradient(145deg, var(--bg-surface), var(--bg-primary)); border: 2px dashed var(--border-color); box-shadow: none; grid-column: 1 / -1; margin-bottom: 2rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">${isFilt ? '📂' : '🛡️'}</div>
                <h3 style="margin-bottom: 0.5rem; color: var(--text-primary); font-size: 1.25rem;">${isFilt ? `Profile: ${AppSettings.activeProfile}` : 'Welcome to MedLedger'}</h3>
                <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.5rem; max-width: 400px; margin-left: auto; margin-right: auto;">
                    ${isFilt ? `No medications have been assigned to this profile yet.` : 'Your zero-knowledge, local-first health vault. All data is encrypted and stored exclusively on your device.'}
                </p>
                <button type="button" class="btn btn-primary" onclick="document.getElementById('new-med-name').focus();" style="padding: 0.75rem 1.5rem; font-size: 0.9rem; border-radius: 8px;">
                    + Add Medication to ${AppSettings.activeProfile}
                </button>
            </div>
        `; 
        
        if(typeof updateStatus === 'function') updateStatus(0, 0);
        const adhereEl = document.getElementById('adherence-score');
        if (adhereEl) adhereEl.innerText = '--%';
        return; 
    }

    rawMeds.sort((a, b) => {
        const weights = { "Morning": 1, "Daily": 2, "Night": 3, "Weekly": 4, "As Needed": 5, "Specific Days": 6, "Cyclic": 7 };
        return (weights[a.frequency] || 99) - (weights[b.frequency] || 99) || a.name.localeCompare(b.name);
    });

    const today = new Date(); today.setHours(0,0,0,0);
    const logicalTodayStr = getLogicalDateString(today);
    const todayLocaleStr = today.toLocaleDateString();
    
    let takenCount = 0;
    let visibleCount = 0;

    rawMeds.forEach(med => {
        let shouldRender = true;
        if (med.frequency === "Specific Days" && med.specificDays && !med.specificDays.includes(today.getDay())) shouldRender = false;
        else if (med.frequency === "Cyclic" && med.cycleStartDate) {
            const start = new Date(med.cycleStartDate + 'T00:00:00');
            if (today < start) shouldRender = false;
            else {
                const diffDays = Math.floor(Math.abs(today - start) / 86400000);
                const cycleLen = (parseInt(med.cycleOn) + parseInt(med.cycleOff));
                if ((diffDays % cycleLen) >= parseInt(med.cycleOn)) shouldRender = false;
            }
        }
        if (!shouldRender && med.frequency !== "As Needed") return;

        // DYNAMIC INVENTORY LOGIC (Brain in clinical.js)
        const status = (typeof window.calculateInventoryStatus === 'function') 
            ? window.calculateInventoryStatus(med) 
            : { isLow: false, runOutDate: "Unknown" };

        const card = document.createElement('div');
        card.className = 'card'; card.style.padding = '0'; card.style.overflow = 'hidden';

        let timesHtml = '<div class="checklist" style="padding: 0.5rem 1rem;">';
        const timesToProcess = (med.times && med.times.length > 0) ? med.times : [null];
        const isPrn = med.frequency === "As Needed";
        
        timesToProcess.forEach(t => {
            const compId = t ? `${med.id}|${t}` : `${med.id}|none`;
            const taken = logs.some(l => l.compositeId === compId && (l.logicalDate === logicalTodayStr || new Date(l.dateTaken).toLocaleDateString() === todayLocaleStr));
            
            if (!isPrn) {
                visibleCount++;
                if (taken) takenCount++;
            }

            timesHtml += `
                <label class="med-item ${taken ? 'completed' : ''}" style="padding: 0.5rem 1rem;">
                    <input type="checkbox" value="${compId}" data-name="${med.name}" class="med-checkbox ${isPrn ? 'prn-checkbox' : ''}" ${taken ? 'checked disabled' : ''}>
                    <span class="med-details"><span>${t ? `@ ${t}` : 'Take Dosage'}</span></span>
                </label>
                ${isPrn && !taken ? `<div style="padding: 0 1rem 0.5rem 2.25rem;"><input type="text" id="prn-reason-${compId}" placeholder="Reason/Symptom..." style="width:100%; font-size:0.8rem; background:var(--bg-surface); border:1px solid var(--border-color); color:var(--text-primary); padding:6px; border-radius:4px;"></div>` : ''}
            `;
        });
        timesHtml += '</div>';

        const refillBanner = (AppSettings.inventory && status.isLow) ? `
            <div style="padding:0.75rem 1rem; background:rgba(239,68,68,0.05); border-top:1px solid var(--border-color); display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:var(--danger-color); font-size:0.75rem; font-weight:700;">⚠️ Supply Alert: ${med.inventory} remaining</span>
                    <div style="display:flex; gap:6px;">
                        ${med.pharmacyPhone ? `<a href="tel:${med.pharmacyPhone.replace(/[^0-9+]/g, '')}" class="btn btn-primary" style="padding:2px 8px; font-size:0.7rem; text-decoration:none;">📞 Call Rx</a>` : ''}
                        <button class="btn btn-secondary" type="button" style="padding:2px 8px; font-size:0.7rem;" onclick="refillMed('${med.id}', ${med.prescribedQty || 30})">Refill (+${med.prescribedQty || 30})</button>
                    </div>
                </div>
                <div style="font-size: 0.7rem; color: var(--text-secondary);">
                    Typical Prescribed Qty: <strong>${med.prescribedQty} units</strong> | Projected Run-Out: <strong>${status.runOutDate}</strong>
                </div>
            </div>` : '';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; padding:1rem; background:var(--bg-surface); border-bottom:1px solid var(--border-color);">
                <div><h3 style="margin:0; font-size:1.1rem;">${med.name}</h3><div style="font-size:0.85rem; color:var(--text-secondary);">${med.dose}</div></div>
                <button class="icon-btn" onclick="openEditModal('${med.id}')" type="button">✏️</button>
            </div>
            ${timesHtml}
            ${(med.instructions || med.sideEffects || med.description || med.indications || med.rxNumber || med.doctor || med.pharmacyPhone) ? `<div style="padding:0.75rem 1rem; border-top:1px solid var(--border-color); background:var(--bg-primary); font-size:0.8rem; color:var(--text-secondary); display:flex; flex-direction:column; gap:4px; max-height:200px; overflow-y:auto;">
                ${med.instructions ? `<div><i>${med.instructions}</i></div>` : ''}
                ${med.sideEffects ? `<div>ℹ️ ${med.sideEffects}</div>` : ''}
                ${med.description ? `<div style="border-top:1px dashed var(--border-color); padding-top:4px; margin-top:4px;"><strong>Info:</strong> ${med.description}</div>` : ''}
                ${med.indications ? `<div style="font-size: 0.75rem; opacity: 0.8;"><strong>Use:</strong> ${med.indications}</div>` : ''}
                
                <div style="display:flex; flex-wrap:wrap; gap: 1rem; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 0.75rem;">
                    ${med.rxNumber ? `<span><strong>Rx:</strong> ${med.rxNumber}</span>` : ''}
                    ${med.doctor ? `<span><strong>Dr:</strong> ${med.doctor}</span>` : ''}
                    ${med.pharmacyPhone ? `<span><strong>Ph:</strong> <a href="tel:${med.pharmacyPhone.replace(/[^0-9+]/g, '')}" style="color:var(--accent-color); text-decoration:none;">${med.pharmacyPhone}</a></span>` : ''}
                </div>
            </div>` : ''}
            ${refillBanner}
        `;
        container.appendChild(card);
    });

    if (visibleCount === 0 && rawMeds.filter(m => m.frequency !== "As Needed").length > 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary); grid-column: 1 / -1;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5;">🌿</div>
                <div style="font-weight: 500;">Clear schedule for today.</div>
            </div>
        `;
    }

    if(typeof updateStatus === 'function') updateStatus(takenCount, visibleCount);
    if(typeof calculateAdherence === 'function') calculateAdherence();
}

// --- 6. Logging Logic ---

window.logSelected = function() {
    const checked = document.querySelectorAll('#checklist-container .med-checkbox:checked:not(:disabled)');
    if (checked.length === 0) return;
    
    const manualInput = document.getElementById('manual-time')?.value;
    const logDateObj = manualInput ? new Date(manualInput) : new Date();
    const timestamp = logDateObj.toISOString();
    const logicalDateStr = getLogicalDateString(logDateObj);

    if (AppSettings.devMode) {
        checked.forEach(cb => {
            const [id, target] = cb.value.split('|');
            const reason = document.getElementById(`prn-reason-${cb.value}`)?.value || "";
            const med = window.MOCK_DATA.meds.find(m => m.id === id);
            window.MOCK_DATA.logs.push({
                timestamp: new Date().toISOString() + '-' + crypto.randomUUID(),
                dateTaken: timestamp, 
                logicalDate: logicalDateStr,
                profile: med.profile || 'Primary', 
                systemLoggedTime: Date.now(), 
                medId: id,
                targetTime: target === 'none' ? null : target, 
                compositeId: cb.value,
                medName: cb.getAttribute('data-name'), 
                status: "taken", 
                prnReason: reason,
                efficacy: "",
                isBackdated: !!manualInput
            });
            if (AppSettings.inventory) {
                let m = window.MOCK_DATA.meds.find(x => x.id === id);
                if (m && m.inventory !== "" && m.inventory !== null && m.inventory !== undefined) {
                    let current = parseInt(m.inventory);
                    if (!isNaN(current)) m.inventory = Math.max(0, current - 1);
                }
            }
        });
        window.syncDevData();
        loadChecklist(); refreshHistory(); if(typeof calculateAdherence === 'function') calculateAdherence();
        return;
    }

    const tx = db.transaction(["logs", "meds"], "readwrite");
    checked.forEach(cb => {
        const [id, target] = cb.value.split('|');
        const reason = document.getElementById(`prn-reason-${cb.value}`)?.value || "";
        tx.objectStore("meds").get(id).onsuccess = (e) => {
            const med = e.target.result;
            tx.objectStore("logs").add({
                timestamp: new Date().toISOString() + '-' + crypto.randomUUID(),
                dateTaken: timestamp, 
                logicalDate: logicalDateStr,
                profile: med.profile || 'Primary',
                systemLoggedTime: Date.now(), 
                medId: id,
                targetTime: target === 'none' ? null : target, 
                compositeId: cb.value,
                medName: cb.getAttribute('data-name'),
                status: "taken",
                prnReason: reason,
                efficacy: "",
                isBackdated: !!manualInput
            });
            if (AppSettings.inventory && med.inventory !== "" && med.inventory !== null && med.inventory !== undefined) { 
                let current = parseInt(med.inventory);
                if (!isNaN(current)) {
                    med.inventory = Math.max(0, current - 1); 
                    tx.objectStore("meds").put(med); 
                }
            }
        };
    });
    tx.oncomplete = () => { loadChecklist(); refreshHistory(); if(typeof calculateAdherence === 'function') calculateAdherence(); };
}

window.logAll = function() {
    const boxes = document.querySelectorAll('#checklist-container .med-checkbox:not(:disabled):not(.prn-checkbox)');
    boxes.forEach(b => b.checked = true);
    logSelected();
}

window.refreshHistory = function() {
    const list = document.getElementById('history-list');
    if(!list) return;

    if (AppSettings.devMode && window.MOCK_DATA) {
        renderHistoryUI(window.MOCK_DATA.logs, list);
        return;
    }

    if(typeof db === 'undefined') return;
    db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = (e) => {
        renderHistoryUI(e.target.result, list);
    };
}

function renderHistoryUI(logsArray, list) {
    const profileLogs = logsArray.filter(l => (l.profile || 'Primary') === AppSettings.activeProfile);
    const sortedLogs = profileLogs.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));
    list.innerHTML = '';
    const tracker = {};
    
    sortedLogs.forEach(log => { 
        if (log.targetTime) { 
            const trackingDate = log.logicalDate || new Date(log.dateTaken).toLocaleDateString();
            const key = trackingDate + '|' + log.compositeId; 
            tracker[key] = (tracker[key] || 0) + 1; 
        } 
    });
    
    list.innerHTML = sortedLogs.slice(0, 15).map(l => {
        const trackingDate = l.logicalDate || new Date(l.dateTaken).toLocaleDateString();
        const isDup = l.targetTime && tracker[trackingDate + '|' + l.compositeId] > 1;
        const isPrn = !l.targetTime;
        const needsEff = isPrn && !l.efficacy;
        
        return `
        <li class="history-item" style="flex-direction: column; align-items: flex-start; gap: 8px;">
            <div style="display: flex; justify-content: space-between; width: 100%;">
                <div class="history-info">
                    <strong>${l.medName}</strong> ${isDup ? '<span style="color:var(--danger-color); font-size:0.7rem; border:1px solid; padding:0 4px; border-radius:4px; font-weight:bold;">DUPLICATE</span>' : ''}
                    <div style="font-size:0.7rem; color:var(--text-secondary);">${new Date(l.dateTaken).toLocaleString()}</div>
                </div>
                <button class="icon-btn" onclick="deleteLog('${l.timestamp}')" type="button">🗑️</button>
            </div>
            ${l.prnReason ? `<div style="font-size:0.75rem; color:var(--accent-color);">📝 Reason: ${l.prnReason}</div>` : ''}
            ${l.efficacy ? `<div style="font-size:0.75rem; color:var(--success-color);">✨ Outcome: ${l.efficacy}</div>` : ''}
            ${needsEff ? `<button class="btn btn-secondary" style="font-size: 0.7rem; padding: 4px 8px; margin-top: 4px;" onclick="updateEfficacy('${l.timestamp}')">📝 Update Outcome?</button>` : ''}
        </li>`;
    }).join('') || '<li style="text-align:center; padding:1rem; color:var(--text-secondary);">No history found for this profile.</li>';
}

window.deleteLog = function(ts) {
    if (!AppSettings.noBabysitter && !confirm("Remove this entry?")) return;
    
    if (AppSettings.devMode) {
        let logIdx = window.MOCK_DATA.logs.findIndex(l => l.timestamp === ts);
        if (logIdx > -1) {
            let log = window.MOCK_DATA.logs[logIdx];
            window.MOCK_DATA.logs.splice(logIdx, 1);
            if (AppSettings.inventory && log.medId) {
                let m = window.MOCK_DATA.meds.find(x => x.id === log.medId);
                if (m && m.inventory !== "" && m.inventory !== null && m.inventory !== undefined) {
                    let current = parseInt(m.inventory);
                    if (!isNaN(current)) m.inventory = current + 1;
                }
            }
            window.syncDevData();
        }
        refreshHistory(); loadChecklist(); if(typeof calculateAdherence === 'function') calculateAdherence();
        return;
    }

    const tx = db.transaction(["logs", "meds"], "readwrite");
    tx.objectStore("logs").get(ts).onsuccess = (e) => {
        const log = e.target.result;
        if (log) {
            tx.objectStore("logs").delete(ts);
            if (AppSettings.inventory && log.medId) {
                tx.objectStore("meds").get(log.medId).onsuccess = (ev) => {
                    const m = ev.target.result;
                    if (m && m.inventory !== "" && m.inventory !== null && m.inventory !== undefined) { 
                        let current = parseInt(m.inventory);
                        if (!isNaN(current)) {
                            m.inventory = current + 1; 
                            tx.objectStore("meds").put(m); 
                        }
                    }
                };
            }
        }
    };
    tx.oncomplete = () => { refreshHistory(); loadChecklist(); if(typeof calculateAdherence === 'function') calculateAdherence(); };
};

// --- 8. Initialization & Tasks ---

document.addEventListener('DOMContentLoaded', () => {
    updateInventoryUI(); 
    const toggle = document.getElementById('toggle-lookup');
    if (toggle) {
        toggle.checked = localStorage.getItem('medledger_clinical_lookups') !== 'false';
        toggle.addEventListener('change', (e) => localStorage.setItem('medledger_clinical_lookups', e.target.checked));
    }
});

function checkReminders() {
    if (!AppSettings.reminders || Notification.permission !== 'granted' || typeof db === 'undefined') return;
    const now = new Date();
    const curTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const logicalTodayStr = getLogicalDateString(now);
    
    const checkSet = (meds, logs) => {
        meds.forEach(m => {
            if (m.frequency === "As Needed") return;
            (m.times || []).forEach(t => {
                if (curTime >= t) {
                    const cid = `${m.id}|${t}`;
                    if (!logs.some(l => l.compositeId === cid && (l.logicalDate === logicalTodayStr || new Date(l.dateTaken).toLocaleDateString() === now.toLocaleDateString()))) {
                        if (!window._notified) window._notified = {};
                        if (!window._notified[cid + logicalTodayStr]) {
                            navigator.serviceWorker.ready.then(r => r.showNotification("MedLedger", { body: `Due: ${m.name} (@${m.profile}) at ${t}` }));
                            window._notified[cid + logicalTodayStr] = true;
                        }
                    }
                }
            });
        });
    };

    if (AppSettings.devMode) checkSet(window.MOCK_DATA.meds, window.MOCK_DATA.logs);
    else db.transaction(["meds", "logs"], "readonly").objectStore("meds").getAll().onsuccess = e => {
        const m = e.target.result;
        db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = ev => checkSet(m, ev.target.result);
    };
}
setInterval(checkReminders, 60000);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const current = getLogicalDateString(new Date());
        if (typeof lastCheckedDate !== 'undefined' && current !== lastCheckedDate) {
            lastCheckedDate = current;
            loadChecklist(); 
            refreshHistory(); 
            if(typeof calculateAdherence === 'function') calculateAdherence(); 
        }
    }
});
