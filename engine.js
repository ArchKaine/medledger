// ==========================================
// engine.js - MedLedger Core Logic
// Checklist, Clinical Lookups, Refills, and High-Fidelity Reports
// ==========================================

// --- Clinical Data Fetcher (Integrated) ---
async function fetchDrugInfo(drugName) {
    const info = { description: "", indications: "" };
    const cleanName = drugName.toLowerCase().trim();
    try {
        // 1. Wikidata Lookup (General Summary)
        const wikiUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=${cleanName}&languages=en&props=descriptions&format=json&origin=*`;
        const wikiRes = await fetch(wikiUrl);
        if (wikiRes.ok) {
            const data = await wikiRes.json();
            const entityId = Object.keys(data.entities)[0];
            if (entityId !== "-1") info.description = data.entities[entityId].descriptions?.en?.value || "";
        }
        // 2. OpenFDA Lookup (Official Clinical Use)
        const fdaUrl = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${cleanName}"&limit=1`;
        const fdaRes = await fetch(fdaUrl);
        if (fdaRes.ok) {
            const data = await fdaRes.json();
            if (data.results && data.results[0]) {
                const raw = data.results[0].indications_and_usage?.[0] || "";
                info.indications = raw.split('.').slice(0, 2).join('.') + '.';
            }
        }
    } catch (err) { console.warn("Clinical lookup bypassed."); }
    return info;
}

// --- Archiving Logic ---
function archiveOldLogs() {
    const archiveDaysEl = document.getElementById('archive-days');
    const days = parseInt(archiveDaysEl ? archiveDaysEl.value : 90) || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const tx = db.transaction(["logs", "archived_logs"], "readwrite");
    tx.objectStore("logs").openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            if (new Date(cursor.value.dateTaken) < cutoffDate) {
                tx.objectStore("archived_logs").add(cursor.value);
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
    tx.objectStore("archived_logs").openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            tx.objectStore("logs").add(cursor.value);
            cursor.delete();
            cursor.continue();
        }
    };
    tx.oncomplete = () => {
        if(typeof showVaultStatus === 'function') showVaultStatus("All archives restored.", "var(--success-color)");
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
            if (interactionDB[newDrug]?.[activeDrug]) warnings.push(`Warning with ${med.name}: ${interactionDB[newDrug][activeDrug]}`);
            else if (interactionDB[activeDrug]?.[newDrug]) warnings.push(`Warning with ${med.name}: ${interactionDB[activeDrug][newDrug]}`);
        });
        return warnings;
    } catch (err) { return []; }
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
    if (warnings.length > 0 && !confirm(`⚠️ INTERACTION DETECTED ⚠️\n\n${warnings.join('\n\n')}\n\nAdd anyway?`)) return;

    // Clinical Lookup Integration
    let clinicalData = { description: "", indications: "" };
    if (document.getElementById('toggle-lookup')?.checked) {
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

    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").add(newMed);
    transaction.oncomplete = () => {
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
    db.transaction(["meds"], "readonly").objectStore("meds").get(id).onsuccess = (e) => {
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
        specDiv.style.display = (med.frequency === 'Specific Days') ? 'block' : 'none';
        cycDiv.style.display = (med.frequency === 'Cyclic') ? 'flex' : 'none';

        document.querySelectorAll('input[name="edit-med-days"]').forEach(cb => {
            cb.checked = (med.specificDays && med.specificDays.includes(parseInt(cb.value)));
        });

        document.getElementById('edit-med-cycle-on').value = med.cycleOn || '';
        document.getElementById('edit-med-cycle-off').value = med.cycleOff || '';
        document.getElementById('edit-med-cycle-start').value = med.cycleStartDate || '';
        
        const timesContainer = document.getElementById('edit-med-times-container');
        timesContainer.innerHTML = ''; 
        const timesToRender = med.times || [];
        if (timesToRender.length === 0) addTimeField('edit-med-times-container');
        else timesToRender.forEach(t => { addTimeField('edit-med-times-container'); timesContainer.lastElementChild.value = t; });
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
    if (document.getElementById('toggle-lookup')?.checked && existing.name !== name) {
        const clinicalData = await fetchDrugInfo(name);
        description = clinicalData.description;
        indications = clinicalData.indications;
    }

    medStore.put({ 
        id, name, dose: document.getElementById('edit-med-dose').value.trim(), 
        frequency: document.getElementById('edit-med-freq').value,
        times: getTimesFromContainer('edit-med-times-container'),
        instructions: document.getElementById('edit-med-instructions').value.trim(),
        sideEffects: document.getElementById('edit-med-side-effects').value.trim(),
        inventory: AppSettings.inventory ? document.getElementById('edit-med-inventory').value.trim() : "",
        specificDays: document.getElementById('edit-med-freq').value === 'Specific Days' ? Array.from(document.querySelectorAll('input[name="edit-med-days"]:checked')).map(cb => parseInt(cb.value)) : [],
        cycleOn: parseInt(document.getElementById('edit-med-cycle-on').value) || null,
        cycleOff: parseInt(document.getElementById('edit-med-cycle-off').value) || null,
        cycleStartDate: document.getElementById('edit-med-cycle-start').value || null,
        description, indications
    });

    tx.oncomplete = () => { document.getElementById('edit-med-modal')?.close(); loadChecklist(); };
}

function deleteMedication() {
    if (!AppSettings.noBabysitter && !confirm("Remove this medication?")) return;
    const id = document.getElementById('edit-med-id').value;
    const tx = db.transaction(["meds"], "readwrite");
    tx.objectStore("meds").delete(id);
    tx.oncomplete = () => { document.getElementById('edit-med-modal')?.close(); loadChecklist(); };
}

window.refillMed = function(id, amount) {
    const addAmount = amount === 'custom' ? (parseInt(document.getElementById(`refill-custom-${id}`).value) || 0) : parseInt(amount);
    if (addAmount <= 0) return;
    const transaction = db.transaction(["meds"], "readwrite");
    transaction.objectStore("meds").get(id).onsuccess = (e) => {
        const med = e.target.result;
        if (med) { med.inventory = (parseInt(med.inventory) || 0) + addAmount; transaction.objectStore("meds").put(med); }
    };
    transaction.oncomplete = loadChecklist;
};

// --- Regimen Logic ---
function loadChecklist() {
    const checklistContainer = document.getElementById('checklist-container');
    if(!checklistContainer || typeof db === 'undefined') return;
    
    const tx = db.transaction(["meds", "logs"], "readonly");
    const medReq = tx.objectStore("meds").getAll();
    const logReq = tx.objectStore("logs").getAll();

    tx.oncomplete = () => {
        const rawMeds = medReq.result;
        const logs = logReq.result;
        checklistContainer.innerHTML = '';
        if (rawMeds.length === 0) { checklistContainer.innerHTML = '<p style="color: var(--text-secondary);">No medications added.</p>'; return; }

        rawMeds.sort((a, b) => a.name.localeCompare(b.name));

        const today = new Date(); today.setHours(0,0,0,0);
        const todayStr = new Date().toLocaleDateString();
        let visibleCount = 0;

        rawMeds.forEach(med => {
            let shouldRender = true;
            if (med.frequency === "Specific Days" && med.specificDays && !med.specificDays.includes(today.getDay())) shouldRender = false;
            else if (med.frequency === "Cyclic" && med.cycleStartDate) {
                const start = new Date(med.cycleStartDate + 'T00:00:00');
                if (today < start) shouldRender = false;
                else {
                    const diff = Math.floor(Math.abs(today - start) / 86400000);
                    const cycleLen = (parseInt(med.cycleOn) + parseInt(med.cycleOff));
                    if ((diff % cycleLen) >= parseInt(med.cycleOn)) shouldRender = false;
                }
            }
            if (!shouldRender && med.frequency !== "As Needed") return;
            visibleCount++;

            const isLow = AppSettings.inventory && parseInt(med.inventory) <= 10;
            const card = document.createElement('div');
            card.className = 'card'; card.style.padding = '0'; card.style.marginBottom = '1rem'; card.style.overflow = 'hidden';

            let timesHtml = '<div class="checklist" style="padding: 0.5rem 1rem;">';
            (med.times || [null]).forEach(t => {
                const compId = t ? `${med.id}|${t}` : `${med.id}|none`;
                const taken = logs.some(l => l.compositeId === compId && new Date(l.dateTaken).toLocaleDateString() === todayStr);
                timesHtml += `
                    <label class="med-item ${taken ? 'completed' : ''}" style="padding: 0.5rem 1rem;">
                        <input type="checkbox" value="${compId}" data-name="${med.name}" class="med-checkbox" ${taken ? 'checked disabled' : ''}>
                        <span class="med-details"><span>${t ? `@ ${t}` : 'Take Dosage'}</span></span>
                    </label>
                    ${med.frequency === 'As Needed' && !taken ? `<div style="padding: 0 1rem 0.5rem 2.5rem;"><input type="text" id="prn-reason-${compId}" placeholder="Reason/Symptom..." style="width:100%; font-size:0.8rem; background:var(--bg-surface); border:1px solid var(--border-color); color:var(--text-primary); padding:4px; border-radius:4px;"></div>` : ''}
                `;
            });
            timesHtml += '</div>';

            const refillBanner = isLow ? `
                <div style="padding:0.75rem 1rem; background:rgba(239,68,68,0.05); display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color);">
                    <span style="color:var(--danger-color); font-size:0.75rem; font-weight:700;">⚠️ Low Supply (${med.inventory})</span>
                    <div style="display:flex; gap:4px;">
                        <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.7rem;" onclick="refillMed('${med.id}', 30)">+30</button>
                        <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.7rem;" onclick="refillMed('${med.id}', 90)">+90</button>
                    </div>
                </div>` : '';

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; padding:1rem; background:var(--bg-surface); border-bottom:1px solid var(--border-color);">
                    <div><h3 style="margin:0; font-size:1.1rem;">${med.name}</h3><div style="font-size:0.85rem; color:var(--text-secondary);">${med.dose}</div></div>
                    <button class="icon-btn" onclick="openEditModal('${med.id}')">✏️</button>
                </div>
                ${timesHtml}
                ${(med.instructions || med.sideEffects || med.description) ? `<div style="padding:0.75rem 1rem; border-top:1px solid var(--border-color); background:var(--bg-primary); font-size:0.8rem; color:var(--text-secondary); display:flex; flex-direction:column; gap:4px;">
                    ${med.instructions ? `<div><i>${med.instructions}</i></div>` : ''}
                    ${med.sideEffects ? `<div>ℹ️ ${med.sideEffects}</div>` : ''}
                    ${med.description ? `<div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:4px; margin-top:4px;"><strong>Info:</strong> ${med.description}</div>` : ''}
                </div>` : ''}
                ${refillBanner}
            `;
            checklistContainer.appendChild(card);
        });
        if (visibleCount === 0) checklistContainer.innerHTML = '<p style="color:var(--text-secondary);">Clear for today.</p>';
        if(typeof updateStatus === 'function') updateStatus();
    };
}

function logSelected() {
    const checked = document.querySelectorAll('#checklist-container .med-checkbox:checked:not(:disabled)');
    if (checked.length === 0) return;
    const tx = db.transaction(["logs", "meds"], "readwrite");
    const manual = document.getElementById('manual-time')?.value;
    const timestamp = manual ? new Date(manual).toISOString() : new Date().toISOString();

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
        list.innerHTML = logs.slice(0, 15).map(l => `
            <li class="history-item">
                <div class="history-info">
                    <strong>${l.medName}</strong> <span style="font-size:0.7rem; color:var(--text-secondary);">${new Date(l.dateTaken).toLocaleString()}</span>
                    ${l.prnReason ? `<div style="font-size:0.75rem; color:var(--accent-color);">📝 ${l.prnReason}</div>` : ''}
                </div>
                <button class="icon-btn" onclick="deleteLog('${l.timestamp}')">🗑️</button>
            </li>
        `).join('') || '<li style="text-align:center; padding:1rem; color:var(--text-secondary);">No history found.</li>';
    };
}

window.deleteLog = function(ts) {
    if (!AppSettings.noBabysitter && !confirm("Delete log?")) return;
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

// --- HIGH-FIDELITY CLINICAL REPORTS ---
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
        clinicalBody += `
            <div style="margin-bottom:30px;">
                <div style="background:#f1f5f9; padding:8px 15px; border-radius:4px; font-weight:700; color:#334155; margin-bottom:10px;">${date}</div>
                <table style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead><tr><th style="text-align:left; color:#64748b; padding:8px;">Time</th><th style="text-align:left; color:#64748b; padding:8px;">Medication & Notes</th><th style="text-align:right; color:#64748b; padding:8px;">Target</th></tr></thead>
                    <tbody>${grouped[date].map(l => `
                        <tr>
                            <td style="padding:10px; border-bottom:1px solid #f1f5f9; width:90px;"><strong>${new Date(l.dateTaken).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</strong></td>
                            <td style="padding:10px; border-bottom:1px solid #f1f5f9;"><strong>${l.medName}</strong> ${l.prnReason ? `<br><span style="color:#2563eb; font-style:italic;">📝 ${l.prnReason}</span>`:''}</td>
                            <td style="padding:10px; border-bottom:1px solid #f1f5f9; text-align:right; color:#64748b;">${l.targetTime || 'As Needed'}</td>
                        </tr>`).join('')}</tbody>
                </table>
            </div>`;
    });

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Clinical Summary</title><style>
        body { font-family: -apple-system, sans-serif; color: #1e293b; line-height: 1.5; padding: 40px; background: #f8fafc; }
        .paper { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 850px; margin: auto; border-top: 8px solid #2563eb; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 25px; }
        .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }
        .stat-card { background: #f8fafc; padding: 15px; border-radius: 6px; text-align: center; border: 1px solid #e2e8f0; }
        .refill-box { background: #fff1f2; border: 1px solid #fecdd3; padding: 15px; border-radius: 6px; margin-bottom: 30px; }
    </style></head><body><div class="paper">
        <div class="header"><div><h1>Clinical Adherence Summary</h1><p>Patient: <strong>Brian E Turner</strong><br>Generated: ${new Date().toLocaleString()}</p></div><div style="text-align:right;"><h2 style="color:#2563eb; margin:0;">MedLedger</h2><p style="font-size:12px; color:#64748b;">Self-Reported Data</p></div></div>
        <div class="stat-grid"><div class="stat-card"><strong>${logs.length}</strong><br><small>Total Doses</small></div><div class="stat-card"><strong>${logs.filter(l => !l.targetTime).length}</strong><br><small>PRN Instances</small></div><div class="stat-card"><strong>${lowInv.length}</strong><br><small>Low Supply</small></div></div>
        ${lowInv.length ? `<div class="refill-box"><h3 style="color:#e11d48; margin:0 0 10px 0;">⚠️ Refill Requirements</h3>${lowInv.map(m => `<div>• <strong>${m.name}</strong> (${m.inventory} left)</div>`).join('')}</div>` : ''}
        <h2 style="font-size:18px; border-bottom:2px solid #2563eb; display:inline-block; margin-bottom:20px; padding-right:20px;">Detailed Adherence Logs</h2>${clinicalBody}
    </div></body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `MedLedger_Summary_${new Date().toISOString().split('T')[0]}.html`; a.click();
}

// --- Reminders & Utility ---
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

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const current = new Date().toLocaleDateString();
        if (typeof lastCheckedDate !== 'undefined' && current !== lastCheckedDate) {
            lastCheckedDate = current;
            loadChecklist(); refreshHistory(); if(typeof calculateAdherence === 'function') calculateAdherence();
        }
    }
});
