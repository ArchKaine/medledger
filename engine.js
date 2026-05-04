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

// --- 2. Archiving Logic ---
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

// --- 3. Zero-Knowledge Interaction Engine ---
async function checkLocalInteractions(newMedName) {
    try {
        const res = await fetch('interactions.json');
        const db_int = await res.json();
        const activeMeds = await new Promise(r => db.transaction(["meds"], "readonly").objectStore("meds").getAll().onsuccess = e => r(e.target.result));
        const drug = newMedName.toLowerCase().trim();
        let warnings = [];
        activeMeds.forEach(m => {
            const active = m.name.toLowerCase().trim();
            if (db_int[drug]?.[active]) warnings.push(`Warning with ${m.name}: ${db_int[drug][active]}`);
            else if (db_int[active]?.[drug]) warnings.push(`Warning with ${m.name}: ${db_int[active][drug]}`);
        });
        return warnings;
    } catch (err) { return []; }
}

// --- 4. Configuration Logic (Add/Edit/Delete) ---
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
    if (warnings.length > 0 && !confirm(`⚠️ POTENTIAL INTERACTION DETECTED ⚠️\n\n${warnings.join('\n\n')}\n\nAdd anyway?`)) return;

    // References external fetchDrugInfo from clinical.js
    let clinicalData = { description: "", indications: "" };
    if (document.getElementById('toggle-lookup')?.checked && typeof fetchDrugInfo === 'function') {
        if(typeof showVaultStatus === 'function') showVaultStatus("Querying clinical databases...", "var(--accent-color)");
        clinicalData = await fetchDrugInfo(nameInput);
    }

    const specificDaysChecked = Array.from(document.querySelectorAll('input[name="new-med-days"]:checked')).map(cb => parseInt(cb.value));
    const cycleOn = parseInt(document.getElementById('new-med-cycle-on').value) || 0;
    const cycleOff = parseInt(document.getElementById('new-med-cycle-off').value) || 0;
    const cycleStart = document.getElementById('new-med-cycle-start').value;

    const newMed = {
        id: crypto.randomUUID(), name: nameInput, dose: doseInput, frequency: freqInput, times: timesArray,
        instructions: instructionsInput, sideEffects: sideEffectsInput, inventory: AppSettings.inventory ? inventoryInput : "",
        specificDays: freqInput === 'Specific Days' ? specificDaysChecked : [],
        cycleOn: freqInput === 'Cyclic' ? cycleOn : null,
        cycleOff: freqInput === 'Cyclic' ? cycleOff : null,
        cycleStartDate: freqInput === 'Cyclic' ? cycleStart : null,
        description: clinicalData.description, indications: clinicalData.indications
    };

    const tx = db.transaction(["meds"], "readwrite");
    tx.objectStore("meds").add(newMed);
    tx.oncomplete = () => {
        document.getElementById('add-med-form').reset();
        document.getElementById('new-med-freq').value = 'Daily';
        document.getElementById('new-med-specific-days').style.display = 'none';
        document.getElementById('new-med-cyclic').style.display = 'none';
        document.getElementById('new-med-times-container').innerHTML = `<input type="time" class="time-input" style="padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--bg-primary); color: var(--text-primary);">`;
        loadChecklist();
        if(typeof showVaultStatus === 'function') showVaultStatus("Medication added.", "var(--success-color)");
    };
}

window.openEditModal = function(id) {
    if (typeof db === 'undefined') return;
    const tx = db.transaction(["meds"], "readonly");
    tx.objectStore("meds").get(id).onsuccess = (e) => {
        const med = e.target.result;
        if (!med) return;
        document.getElementById('edit-med-id').value = med.id;
        document.getElementById('edit-med-name').value = med.name;
        document.getElementById('edit-med-dose').value = med.dose;
        document.getElementById('edit-med-freq').value = med.frequency || 'Daily';
        document.getElementById('edit-med-instructions').value = med.instructions || '';
        document.getElementById('edit-med-side-effects').value = med.sideEffects || ''; 
        
        const invGroup = document.getElementById('edit-inventory-group');
        if (AppSettings.inventory && invGroup) {
            invGroup.style.display = 'block';
            document.getElementById('edit-med-inventory').value = med.inventory || '';
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
        const times = med.times || [];
        if (times.length === 0) {
            if(typeof addTimeField === 'function') addTimeField('edit-med-times-container');
        } else {
            times.forEach(t => {
                if(typeof addTimeField === 'function') addTimeField('edit-med-times-container');
                if(container.lastElementChild) container.lastElementChild.value = t;
            });
        }

        // --- SCROLLABLE CLINICAL INFO DISPLAY IN EDIT MODAL ---
        let clinicalPanel = document.getElementById('modal-clinical-info');
        if (!clinicalPanel) {
            clinicalPanel = document.createElement('div');
            clinicalPanel.id = 'modal-clinical-info';
            clinicalPanel.style.marginTop = '1.5rem';
            clinicalPanel.style.padding = '1rem';
            clinicalPanel.style.background = 'var(--bg-primary)';
            clinicalPanel.style.border = '1px solid var(--border-color)';
            clinicalPanel.style.borderRadius = '6px';
            clinicalPanel.style.maxHeight = '150px';
            clinicalPanel.style.overflowY = 'auto';
            document.querySelector('#edit-med-modal form').appendChild(clinicalPanel);
        }
        clinicalPanel.innerHTML = (med.description || med.indications) ? `
            <div style="font-size: 0.8rem; line-height: 1.5;">
                <h4 style="margin: 0 0 0.5rem 0; color: var(--accent-color); font-size: 0.75rem; text-transform: uppercase;">Drug Reference (Fetched Data)</h4>
                ${med.description ? `<p style="margin-bottom: 0.5rem;"><strong>Summary:</strong> ${med.description}</p>` : ''}
                ${med.indications ? `<p style="margin: 0;"><strong>Primary Indications:</strong> ${med.indications}</p>` : ''}
            </div>` : '<p style="font-size:0.7rem; color:var(--text-secondary); text-align:center;">No clinical data cached for this pill.</p>';

        document.getElementById('edit-med-modal')?.showModal();
    };
};

async function saveEditedMed(e) {
    e.preventDefault();
    const id = document.getElementById('edit-med-id').value;
    const name = document.getElementById('edit-med-name').value.trim();
    const tx = db.transaction(["meds"], "readwrite");
    const medStore = tx.objectStore("meds");
    const existing = await new Promise(res => medStore.get(id).onsuccess = ev => res(ev.target.result));

    let description = existing.description || "";
    let indications = existing.indications || "";
    
    // References external fetchDrugInfo from clinical.js
    if (document.getElementById('toggle-lookup')?.checked && existing.name !== name && typeof fetchDrugInfo === 'function') {
        const clinicalData = await fetchDrugInfo(name);
        description = clinicalData.description;
        indications = clinicalData.indications;
    }

    const freq = document.getElementById('edit-med-freq').value;
    medStore.put({ 
        id, name, dose: document.getElementById('edit-med-dose').value.trim(), 
        frequency: freq, times: getTimesFromContainer('edit-med-times-container'),
        instructions: document.getElementById('edit-med-instructions').value.trim(),
        sideEffects: document.getElementById('edit-med-side-effects').value.trim(),
        inventory: AppSettings.inventory ? document.getElementById('edit-med-inventory').value.trim() : "",
        specificDays: freq === 'Specific Days' ? Array.from(document.querySelectorAll('input[name="edit-med-days"]:checked')).map(cb => parseInt(cb.value)) : [],
        cycleOn: parseInt(document.getElementById('edit-med-cycle-on').value) || null,
        cycleOff: parseInt(document.getElementById('edit-med-cycle-off').value) || null,
        cycleStartDate: document.getElementById('edit-med-cycle-start').value || null,
        description, indications
    });

    tx.oncomplete = () => { document.getElementById('edit-med-modal')?.close(); loadChecklist(); };
}

function deleteMedication() {
    if (!AppSettings.noBabysitter && !confirm("Remove medication?")) return;
    const id = document.getElementById('edit-med-id').value;
    const tx = db.transaction(["meds"], "readwrite");
    tx.objectStore("meds").delete(id);
    tx.oncomplete = () => { document.getElementById('edit-med-modal')?.close(); loadChecklist(); };
}

window.refillMed = function(id, amount) {
    const qty = amount === 'custom' ? (parseInt(document.getElementById(`refill-custom-${id}`).value) || 0) : parseInt(amount);
    if (qty <= 0) return;
    const tx = db.transaction(["meds"], "readwrite");
    const medStore = tx.objectStore("meds");
    medStore.get(id).onsuccess = (e) => {
        const m = e.target.result;
        if (m) { m.inventory = (parseInt(m.inventory) || 0) + qty; medStore.put(m); }
    };
    tx.oncomplete = loadChecklist;
};

// --- 5. Regimen Logic ---
function loadChecklist() {
    const container = document.getElementById('checklist-container');
    if(!container || typeof db === 'undefined') return;
    const tx = db.transaction(["meds", "logs"], "readonly");
    const medReq = tx.objectStore("meds").getAll();
    const logReq = tx.objectStore("logs").getAll();

    tx.oncomplete = () => {
        const rawMeds = medReq.result;
        const logs = logReq.result;
        container.innerHTML = '';
        if (rawMeds.length === 0) { container.innerHTML = '<p style="color: var(--text-secondary);">No medications added.</p>'; return; }

        rawMeds.sort((a, b) => {
            const weights = { "Morning": 1, "Daily": 2, "Night": 3, "Weekly": 4, "As Needed": 5, "Specific Days": 6, "Cyclic": 7 };
            return (weights[a.frequency] || 99) - (weights[b.frequency] || 99) || a.name.localeCompare(b.name);
        });

        const today = new Date(); today.setHours(0,0,0,0);
        const todayStr = today.toLocaleDateString();
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
            visibleCount++;

            const isLow = AppSettings.inventory && parseInt(med.inventory) <= 10;
            const card = document.createElement('div');
            card.className = 'card'; card.style.padding = '0'; card.style.marginBottom = '1.5rem'; card.style.overflow = 'hidden';

            let timesHtml = '<div class="checklist" style="padding: 0.5rem 1rem;">';
            (med.times || [null]).forEach(t => {
                const compId = t ? `${med.id}|${t}` : `${med.id}|none`;
                const taken = logs.some(l => l.compositeId === compId && new Date(l.dateTaken).toLocaleDateString() === todayStr);
                timesHtml += `
                    <label class="med-item ${taken ? 'completed' : ''}" style="padding: 0.5rem 1rem;">
                        <input type="checkbox" value="${compId}" data-name="${med.name}" class="med-checkbox" ${taken ? 'checked disabled' : ''}>
                        <span class="med-details"><span>${t ? `@ ${t}` : 'Take Dosage'}</span></span>
                    </label>
                    ${med.frequency === 'As Needed' && !taken ? `<div style="padding: 0 1rem 0.5rem 2.25rem;"><input type="text" id="prn-reason-${compId}" placeholder="Reason/Symptom (e.g. Headache 7/10)..." style="width:100%; font-size:0.8rem; background:var(--bg-surface); border:1px solid var(--border-color); color:var(--text-primary); padding:6px; border-radius:4px;"></div>` : ''}
                `;
            });
            timesHtml += '</div>';

            const refillBanner = isLow ? `
                <div style="padding:0.75rem 1rem; background:rgba(239,68,68,0.05); display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); flex-wrap:wrap; gap:0.5rem;">
                    <span style="color:var(--danger-color); font-size:0.75rem; font-weight:700;">⚠️ Low Supply (${med.inventory})</span>
                    <div style="display:flex; gap:4px;">
                        <button class="btn btn-secondary" type="button" style="padding:2px 8px; font-size:0.7rem;" onclick="refillMed('${med.id}', 30)">+30</button>
                        <button class="btn btn-secondary" type="button" style="padding:2px 8px; font-size:0.7rem;" onclick="refillMed('${med.id}', 90)">+90</button>
                    </div>
                </div>` : '';

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; padding:1rem; background:var(--bg-surface); border-bottom:1px solid var(--border-color);">
                    <div><h3 style="margin:0; font-size:1.1rem;">${med.name}</h3><div style="font-size:0.85rem; color:var(--text-secondary);">${med.dose}</div></div>
                    <button class="icon-btn" onclick="openEditModal('${med.id}')" type="button">✏️</button>
                </div>
                ${timesHtml}
                ${(med.instructions || med.sideEffects || med.description || med.indications) ? `<div style="padding:0.75rem 1rem; border-top:1px solid var(--border-color); background:var(--bg-primary); font-size:0.8rem; color:var(--text-secondary); display:flex; flex-direction:column; gap:4px; max-height:100px; overflow-y:auto;">
                    ${med.instructions ? `<div><i>${med.instructions}</i></div>` : ''}
                    ${med.sideEffects ? `<div>ℹ️ ${med.sideEffects}</div>` : ''}
                    ${med.description ? `<div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:4px; margin-top:4px;"><strong>Info:</strong> ${med.description}</div>` : ''}
                    ${med.indications ? `<div style="font-size: 0.75rem; opacity: 0.8;"><strong>Use:</strong> ${med.indications}</div>` : ''}
                </div>` : ''}
                ${refillBanner}
            `;
            container.appendChild(card);
        });
        if (visibleCount === 0) container.innerHTML = '<p style="color:var(--text-secondary);">Clear for today.</p>';
        if(typeof updateStatus === 'function') updateStatus();
    };
}

// --- 6. Logging Logic ---
function logSelected() {
    const checked = document.querySelectorAll('#checklist-container .med-checkbox:checked:not(:disabled)');
    if (checked.length === 0) return;
    const tx = db.transaction(["logs", "meds"], "readwrite");
    const manualInput = document.getElementById('manual-time')?.value;
    const timestamp = manualInput ? new Date(manualInput).toISOString() : new Date().toISOString();

    checked.forEach(cb => {
        const [id, target] = cb.value.split('|');
        const reason = document.getElementById(`prn-reason-${cb.value}`)?.value || "";
        tx.objectStore("logs").add({
            timestamp: new Date().toISOString() + '-' + crypto.randomUUID(),
            dateTaken: timestamp, systemLoggedTime: Date.now(), medId: id,
            targetTime: target === 'none' ? null : target, compositeId: cb.value,
            medName: cb.getAttribute('data-name'), status: "taken", prnReason: reason
        });
        if (AppSettings.inventory) {
            tx.objectStore("meds").get(id).onsuccess = (e) => {
                const m = e.target.result;
                if (m && m.inventory) { m.inventory = Math.max(0, parseInt(m.inventory) - 1); tx.objectStore("meds").put(m); }
            };
        }
    });
    tx.oncomplete = () => { loadChecklist(); refreshHistory(); if(typeof calculateAdherence === 'function') calculateAdherence(); };
}

function logAll() {
    const boxes = document.querySelectorAll('#checklist-container .med-checkbox:not(:disabled)');
    boxes.forEach(b => b.checked = true);
    logSelected();
}

function refreshHistory() {
    const list = document.getElementById('history-list');
    if(!list || typeof db === 'undefined') return;
    db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = (e) => {
        const logs = e.target.result.sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken));
        const tracker = {};
        logs.forEach(log => { if (log.targetTime) { const key = new Date(log.dateTaken).toLocaleDateString() + '|' + log.compositeId; tracker[key] = (tracker[key] || 0) + 1; } });
        
        list.innerHTML = logs.slice(0, 15).map(l => {
            const isDup = l.targetTime && tracker[new Date(l.dateTaken).toLocaleDateString() + '|' + l.compositeId] > 1;
            return `
            <li class="history-item">
                <div class="history-info">
                    <strong>${l.medName}</strong> ${isDup ? '<span style="color:var(--danger-color); font-size:0.7rem; border:1px solid; padding:0 4px; border-radius:4px;">DUP</span>' : ''}
                    <div style="font-size:0.7rem; color:var(--text-secondary);">${new Date(l.dateTaken).toLocaleString()}</div>
                    ${l.prnReason ? `<div style="font-size:0.75rem; color:var(--accent-color);">📝 ${l.prnReason}</div>` : ''}
                </div>
                <button class="icon-btn" onclick="deleteLog('${l.timestamp}')" type="button">🗑️</button>
            </li>`;
        }).join('') || '<li style="text-align:center; padding:1rem; color:var(--text-secondary);">No history found.</li>';
    };
}

window.deleteLog = function(ts) {
    if (!AppSettings.noBabysitter && !confirm("Delete entry?")) return;
    const tx = db.transaction(["logs", "meds"], "readwrite");
    tx.objectStore("logs").get(ts).onsuccess = (e) => {
        const log = e.target.result;
        if (log) {
            tx.objectStore("logs").delete(ts);
            if (AppSettings.inventory && log.medId) {
                tx.objectStore("meds").get(log.medId).onsuccess = (ev) => {
                    const m = ev.target.result;
                    if (m && m.inventory !== undefined) { m.inventory = (parseInt(m.inventory) || 0) + 1; tx.objectStore("meds").put(m); }
                };
            }
        }
    };
    tx.oncomplete = () => { refreshHistory(); loadChecklist(); if(typeof calculateAdherence === 'function') calculateAdherence(); };
};

// --- 7. High-Fidelity Exports ---
async function exportHTMLReport() {
    const tx = db.transaction(["meds", "logs"], "readonly");
    const meds = await new Promise(r => tx.objectStore("meds").getAll().onsuccess = e => r(e.target.result));
    const logs = await new Promise(r => tx.objectStore("logs").getAll().onsuccess = e => r(e.target.result));
    if (!logs.length) return;

    const lowInv = meds.filter(m => AppSettings.inventory && parseInt(m.inventory) <= 10);
    const grouped = {};
    logs.sort((a,b) => new Date(b.dateTaken) - new Date(a.dateTaken)).forEach(l => {
        const d = new Date(l.dateTaken).toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'});
        if (!grouped[d]) grouped[d] = [];
        grouped[d].push(l);
    });

    let clinicalBody = "";
    Object.keys(grouped).forEach(date => {
        clinicalBody += `<div class="date-group"><div class="date-header">${date}</div><table class="clinical-table"><thead><tr><th style="width: 100px;">Time</th><th>Medication & Context</th><th style="width: 120px; text-align: center;">Target</th></tr></thead><tbody>`;
        clinicalBody += grouped[date].map(l => {
            const timeStr = new Date(l.dateTaken).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const isPrn = !l.targetTime;
            return `<tr class="${isPrn ? 'prn-row' : ''}"><td><strong>${timeStr}</strong></td><td><div class="med-name-cell">${l.medName} ${isPrn ? '<span class="prn-badge">As Needed</span>' : ''}</div>${l.prnReason ? `<div class="note-box">📝 ${l.prnReason}</div>`:''}</td><td style="text-align: center; color: #64748b;">${l.targetTime || '--'}</td></tr>`;
        }).join('');
        clinicalBody += `</tbody></table></div>`;
    });

    const refillHtml = lowInv.length ? `<div class="refill-section"><h3 style="color: #e11d48; margin-top: 0;">⚠️ Refill Requirements</h3>${lowInv.map(m => `<div>• <strong>${m.name}</strong> (${m.inventory} left)</div>`).join('')}</div>` : "";

    const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>MedLedger Clinical Summary</title><style>
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
    </style></head><body><div class="no-print" style="text-align:right;"><button class="btn-print" onclick="window.print()">Print Clinical Summary</button></div><div class="report-paper">
    <div class="header"><div><h1>Medication Adherence Summary</h1><div class="patient-meta">Patient: <strong>Brian E Turner</strong> | Generated: ${new Date().toLocaleString()}</div></div><div style="text-align: right;"><div style="font-weight: 900; font-size: 20px; color: #2563eb;">MedLedger</div><div class="patient-meta">Self-Reported Adherence Data</div></div></div>
    <div class="stat-grid"><div class="stat-card"><div class="stat-val">${logs.length}</div><div class="stat-lab">Total Doses Logged</div></div><div class="stat-card"><div class="stat-val">${logs.filter(l => !l.targetTime).length}</div><div class="stat-lab">PRN Instances</div></div><div class="stat-card"><div class="stat-val">${lowInv.length}</div><div class="stat-lab">Meds Needing Refill</div></div></div>
    ${refillHtml}<h2 style="font-size: 18px; margin-top: 30px; border-bottom: 2px solid #2563eb; display: inline-block;">Detailed Daily Logs</h2>${clinicalBody}
    <div style="margin-top: 50px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px;">MedLedger Health Analytics | Data resides locally on user device.</div></div></body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `MedLedger_Report_${new Date().toISOString().split('T')[0]}.html`; a.click();
}

async function exportCSV() {
    const logs = await new Promise(r => db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = e => r(e.target.result));
    if (!logs.length) return;
    let csv = "Date,Time,Medication,Target,Status,PRN Reason\n";
    logs.sort((a,b) => new Date(b.dateTaken) - new Date(a.dateTaken)).forEach(l => {
        const d = new Date(l.dateTaken);
        csv += `${d.toLocaleDateString()},${d.toLocaleTimeString()},"${l.medName}",${l.targetTime || 'PRN'},${l.status},"${(l.prnReason || '')}"\n`;
    });
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'})); a.download = "MedLedger_Data.csv"; a.click();
}

// --- 8. Persistence & Initialisation ---
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle-lookup');
    if (toggle) {
        if (localStorage.getItem('medledger_clinical_lookups') === null) {
            localStorage.setItem('medledger_clinical_lookups', 'true');
        }
        toggle.checked = localStorage.getItem('medledger_clinical_lookups') === 'true';
        
        toggle.addEventListener('change', (e) => {
            localStorage.setItem('medledger_clinical_lookups', e.target.checked);
        });

        // References external refreshAllClinicalData from clinical.js
        if (toggle.checked && localStorage.getItem('medledger_initial_fetch_done') !== 'true') {
            const checkDB = setInterval(() => {
                if (typeof db !== 'undefined' && typeof refreshAllClinicalData === 'function') {
                    clearInterval(checkDB);
                    refreshAllClinicalData(true);
                }
            }, 500);
        }
    }
});

// --- Notifications & Rollover ---
function checkReminders() {
    if (!AppSettings.reminders || Notification.permission !== 'granted' || typeof db === 'undefined') return;
    const now = new Date();
    const curTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const todayStr = now.toLocaleDateString();
    db.transaction(["meds", "logs"], "readonly").objectStore("meds").getAll().onsuccess = (e) => {
        const meds = e.target.result;
        db.transaction(["logs"], "readonly").objectStore("logs").getAll().onsuccess = (ev) => {
            const logs = ev.target.result;
            meds.forEach(m => {
                if (m.frequency === "As Needed") return;
                (m.times || []).forEach(t => {
                    if (curTime >= t) {
                        const cid = `${m.id}|${t}`;
                        if (!logs.some(l => l.compositeId === cid && new Date(l.dateTaken).toLocaleDateString() === todayStr)) {
                            if (!window._notified) window._notified = {};
                            if (!window._notified[cid + todayStr]) {
                                navigator.serviceWorker.ready.then(r => r.showNotification("MedLedger", { body: `Due: ${m.name} at ${t}` }));
                                window._notified[cid + todayStr] = true;
                            }
                        }
                    }
                });
            });
        };
    };
}
setInterval(checkReminders, 60000);

let lastDate = new Date().toLocaleDateString();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const current = new Date().toLocaleDateString();
        if (current !== lastDate) {
            lastDate = current;
            loadChecklist(); refreshHistory(); if(typeof calculateAdherence === 'function') calculateAdherence();
        }
    }
});
