// ==========================================
// reports.js - MedLedger Clinical Reporting Suite
// Handles high-fidelity HTML summaries and CSV data exports.
// ==========================================

/**
 * Generates a clinical-grade HTML report isolated to the active profile.
 */
window.exportHTMLReport = async function() {
    let meds, logs;
    const activeProfile = AppSettings.activeProfile || 'Primary';
    
    // 1. Data Retrieval
    if (AppSettings.devMode && window.MOCK_DATA) {
        meds = window.MOCK_DATA.meds;
        logs = window.MOCK_DATA.logs;
    } else {
        if (!db) return;
        const tx = db.transaction(["meds", "logs"], "readonly");
        meds = await new Promise(r => tx.objectStore("meds").getAll().onsuccess = e => r(e.target.result));
        logs = await new Promise(r => tx.objectStore("logs").getAll().onsuccess = e => r(e.target.result));
    }
    
    // 2. Filter by Profile
    const profileMeds = meds.filter(m => (m.profile || 'Primary') === activeProfile);
    const profileLogs = logs.filter(l => (l.profile || 'Primary') === activeProfile);

    if (!profileLogs.length && !profileMeds.length) {
        if(typeof showVaultStatus === 'function') showVaultStatus(`No data found for ${activeProfile}.`, "var(--danger-color)");
        return;
    }

    // 3. Prepare Clinical Overview (Regimen + Side Effects)
    const lowInv = profileMeds.filter(m => AppSettings.inventory && parseInt(m.inventory) <= 10);
    
    let regimenHtml = `
        <div class="regimen-section" style="margin-bottom: 40px; padding: 20px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <h3 style="color: #0f172a; margin-top: 0; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Current Regimen & Clinical Overview</h3>
            <table class="clinical-table">
                <thead>
                    <tr>
                        <th style="width: 25%;">Medication & Dose</th>
                        <th>Clinical Context (Indications & Side Effects)</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (profileMeds.length === 0) {
        regimenHtml += `<tr><td colspan="2" style="text-align:center; color:#64748b;">No active medications found in this profile.</td></tr>`;
    } else {
        regimenHtml += profileMeds.map(m => `
            <tr>
                <td>
                    <strong style="color: #2563eb; font-size: 14px;">${m.name}</strong><br>
                    <span style="font-size: 13px; color: #334155;">${m.dose}</span><br>
                    <span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">${m.frequency}</span>
                </td>
                <td>
                    ${m.indications ? `<div style="font-size: 12px; margin-bottom: 6px; color: #334155;"><strong>Target Indication:</strong> ${m.indications}</div>` : ''}
                    ${m.sideEffects ? `<div style="font-size: 12px; color: #9f1239; background: #fff1f2; padding: 6px; border-radius: 4px; border-left: 2px solid #e11d48;"><strong>Known Side Effects:</strong> ${m.sideEffects}</div>` : '<div style="font-size: 12px; color: #64748b; font-style: italic;">No clinical side effect data fetched.</div>'}
                    ${m.instructions ? `<div style="font-size: 12px; margin-top: 6px; color: #0f766e;"><strong>Patient Notes:</strong> ${m.instructions}</div>` : ''}
                </td>
            </tr>
        `).join('');
    }
    regimenHtml += `</tbody></table></div>`;

    // 4. Group Logs by Logical Date
    const grouped = {};
    profileLogs.sort((a,b) => new Date(b.dateTaken) - new Date(a.dateTaken)).forEach(l => {
        const dateKey = l.logicalDate ? 
            new Date(l.logicalDate + 'T12:00:00').toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'}) :
            new Date(l.dateTaken).toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'});
        
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(l);
    });

    // 5. Build Log Body
    let clinicalBody = "";
    Object.keys(grouped).forEach(date => {
        clinicalBody += `
            <div class="date-group">
                <div class="date-header">${date}</div>
                <table class="clinical-table">
                    <thead>
                        <tr>
                            <th style="width: 100px;">Time</th>
                            <th>Medication & Context</th>
                            <th style="width: 120px; text-align: center;">Target</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        clinicalBody += grouped[date].map(l => {
            const timeStr = new Date(l.dateTaken).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const isPrn = !l.targetTime;
            return `
                <tr class="${isPrn ? 'prn-row' : ''}">
                    <td><strong>${timeStr}</strong></td>
                    <td>
                        <div class="med-name-cell">
                            ${l.medName} 
                            ${isPrn ? '<span class="prn-badge">As Needed</span>' : ''}
                        </div>
                        ${l.prnReason ? `<div class="note-box">📝 Reason: ${l.prnReason}</div>` : ''}
                        ${l.efficacy ? `<div class="outcome-box">✨ Outcome: ${l.efficacy}</div>` : ''}
                    </td>
                    <td style="text-align: center; color: #64748b;">${l.targetTime || '--'}</td>
                </tr>`;
        }).join('');
        
        clinicalBody += `</tbody></table></div>`;
    });

    // 6. Build Final HTML Document
    const refillHtml = lowInv.length ? `
        <div class="refill-section">
            <h3 style="color: #e11d48; margin-top: 0; font-size: 16px;">⚠️ Refill Requirements</h3>
            ${lowInv.map(m => `
                <div class="refill-item">
                    • <strong>${m.name}</strong> (${m.inventory} left) 
                    <span class="refill-meta">
                        ${m.rxNumber ? `[Rx: ${m.rxNumber}]` : ''} 
                        ${m.doctor ? `[Dr: ${m.doctor}]` : ''}
                    </span>
                </div>
            `).join('')}
        </div>` : "";

    const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>MedLedger: ${activeProfile}</title><style>
        body { font-family: -apple-system, system-ui, sans-serif; color: #1e293b; line-height: 1.5; padding: 40px; background: #f8fafc; }
        .report-paper { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 900px; margin: 0 auto; border-top: 8px solid #2563eb; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
        .patient-meta { font-size: 14px; color: #64748b; }
        .active-profile-tag { background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; text-transform: uppercase; }
        .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #f1f5f9; padding: 15px; border-radius: 6px; text-align: center; }
        .stat-val { font-size: 20px; font-weight: 800; color: #2563eb; }
        .stat-lab { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
        .date-header { font-size: 16px; font-weight: 700; background: #e2e8f0; padding: 8px 15px; border-radius: 4px; margin-bottom: 10px; margin-top: 30px; }
        .clinical-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .clinical-table th { text-align: left; padding: 10px; border-bottom: 1px solid #cbd5e1; }
        .clinical-table td { padding: 12px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        .med-name-cell { font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .prn-badge { background: #f1f5f9; color: #475569; font-size: 10px; padding: 2px 6px; border-radius: 10px; text-transform: uppercase; border: 1px solid #e2e8f0; }
        .prn-row { background-color: #f0f9ff; }
        .note-box { margin-top: 4px; font-style: italic; color: #64748b; font-size: 12px; }
        .outcome-box { margin-top: 4px; font-weight: 600; color: #059669; font-size: 12px; }
        .refill-section { background: #fff1f2; border: 1px solid #fecdd3; padding: 20px; border-radius: 8px; margin-top: 30px; margin-bottom: 30px; }
        .refill-item { font-size: 14px; margin-bottom: 5px; }
        .refill-meta { color: #64748b; font-size: 12px; margin-left: 10px; }
        .btn-print { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; margin-bottom: 20px; }
        @media print { body { padding: 0; background: white; } .report-paper { box-shadow: none; border: none; max-width: 100%; padding: 0; } .no-print { display: none; } }
    </style></head><body><div class="no-print" style="text-align:right;"><button class="btn-print" onclick="window.print()">Print Clinical Summary</button></div><div class="report-paper">
    <div class="header"><div><h1>Medication Adherence Summary</h1><div class="patient-meta">Patient Name: <strong>_______________________</strong> | Profile: <span class="active-profile-tag">${activeProfile}</span></div></div><div style="text-align: right;"><div style="font-weight: 900; font-size: 20px; color: #2563eb;">MedLedger</div><div class="patient-meta">Generated: ${new Date().toLocaleString()}</div></div></div>
    
    <div class="stat-grid"><div class="stat-card"><div class="stat-val">${profileLogs.length}</div><div class="stat-lab">Total Doses Logged</div></div><div class="stat-card"><div class="stat-val">${profileLogs.filter(l => !l.targetTime).length}</div><div class="stat-lab">PRN Instances</div></div><div class="stat-card"><div class="stat-val">${lowInv.length}</div><div class="stat-lab">Refills Required</div></div></div>
    
    ${refillHtml}
    
    ${regimenHtml}

    <h2 style="font-size: 18px; margin-top: 40px; border-bottom: 2px solid #2563eb; display: inline-block;">Detailed Daily Logs</h2>
    ${clinicalBody || '<p style="color: #64748b; font-style: italic;">No adherence logs recorded.</p>'}
    
    <div style="margin-top: 50px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px;">MedLedger Health Analytics | Profile-Isolated Clinical Data</div></div></body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `MedLedger_${activeProfile}_${new Date().toISOString().split('T')[0]}.html`; a.click();
};

/**
 * Exports profile-isolated log data to CSV.
 */
window.exportCSV = async function() {
    let logs;
    const activeProfile = AppSettings.activeProfile || 'Primary';
    
    if (AppSettings.devMode && window.MOCK_DATA) {
        logs = window.MOCK_DATA.logs;
    } else {
        if (!db) return;
        const tx = db.transaction(["logs"], "readonly");
        logs = await new Promise(r => tx.objectStore("logs").getAll().onsuccess = e => r(e.target.result));
    }
    
    const profileLogs = logs.filter(l => (l.profile || 'Primary') === activeProfile);
    if (!profileLogs.length) {
        if(typeof showVaultStatus === 'function') showVaultStatus("No logs to export.", "var(--danger-color)");
        return;
    }

    let csv = "Date,Time,Medication,TargetTime,Status,PRN_Reason,Outcome,Profile\n";
    profileLogs.sort((a,b) => new Date(b.dateTaken) - new Date(a.dateTaken)).forEach(l => {
        const d = new Date(l.dateTaken);
        csv += `${d.toLocaleDateString()},${d.toLocaleTimeString()},"${l.medName}",${l.targetTime || 'PRN'},${l.status},"${(l.prnReason || '')}","${(l.efficacy || '')}","${activeProfile}"\n`;
    });
    
    const a = document.createElement("a"); 
    a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'})); 
    a.download = `MedLedger_${activeProfile}_Data.csv`; 
    a.click();
};
