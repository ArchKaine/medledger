// ==========================================
// clinical.js - MedLedger External Data Layer
// Handles all network calls to OpenFDA and Wikidata
// ==========================================

async function fetchDrugInfo(drugName) {
    const info = { description: "", indications: "" };
    const cleanName = drugName.toLowerCase().trim();
    try {
        // 1. Wikidata Summary
        const wikiUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=${cleanName}&languages=en&props=descriptions&format=json&origin=*`;
        const wikiRes = await fetch(wikiUrl);
        if (wikiRes.ok) {
            const data = await wikiRes.json();
            const entityId = Object.keys(data.entities)[0];
            if (entityId !== "-1") {
                info.description = data.entities[entityId].descriptions?.en?.value || "";
            }
        }
        // 2. OpenFDA Label Data
        const fdaUrl = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${cleanName}"&limit=1`;
        const fdaRes = await fetch(fdaUrl);
        if (fdaRes.ok) {
            const data = await fdaRes.json();
            if (data.results && data.results[0]) {
                const raw = data.results[0].indications_and_usage?.[0] || "";
                info.indications = raw.split('.').slice(0, 2).join('.') + '.';
            }
        }
    } catch (err) { 
        console.warn("Clinical lookup bypassed due to network error."); 
    }
    return info;
}

/**
 * Force Refresh All Clinical Data
 * Transaction Fix: We fetch med snapshots first, then update 
 * one-by-one to prevent transaction timeouts during network calls.
 */
async function refreshAllClinicalData(isAuto = false) {
    if (typeof db === 'undefined') return;
    if (!isAuto && !confirm("This will overwrite existing clinical descriptions for all medications on this device. Continue?")) return;
    
    if(typeof showVaultStatus === 'function') showVaultStatus("Updating clinical data for all meds...", "var(--accent-color)");
    
    // 1. Get Snapshots (Transactions remain open only for the duration of the Get)
    const meds = await new Promise((resolve) => {
        const tx = db.transaction(["meds"], "readonly");
        tx.objectStore("meds").getAll().onsuccess = e => resolve(e.target.result);
    });

    // 2. Loop through snapshots and update
    for (const med of meds) {
        if (isAuto && med.description) continue; // Skip if auto-sync and data exists

        // Call fetchDrugInfo (Network wait happens here, OUTSIDE a transaction)
        const freshData = await fetchDrugInfo(med.name);
        
        // 3. Open a fresh Write transaction ONLY when we have data ready
        const writeTx = db.transaction(["meds"], "readwrite");
        const store = writeTx.objectStore("meds");
        
        const currentMed = await new Promise(res => store.get(med.id).onsuccess = e => res(e.target.result));
        if (currentMed) {
            currentMed.description = freshData.description || "";
            currentMed.indications = freshData.indications || "";
            store.put(currentMed);
        }
    }

    if(typeof showVaultStatus === 'function') showVaultStatus("Clinical data synchronized.", "var(--success-color)");
    if(typeof loadChecklist === 'function') loadChecklist();
    if (isAuto) localStorage.setItem('medledger_initial_fetch_done', 'true');
}

// Assign to window for console/HTML access
window.refreshAllClinicalData = refreshAllClinicalData;
