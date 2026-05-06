// ==========================================
// clinical.js - MedLedger Clinical Data Engine
// Handles OpenFDA/Wikidata queries, local caching, and Interaction Checks
// ==========================================

const CLINICAL_CACHE_STORE = "clinical_cache";

// --- Dev Mode Interceptor ---
function getMockClinicalData(drugName) {
    const name = drugName.toLowerCase();
    
    // Custom lore responses for the HFW test items
    if (name.includes('tam') || name.includes('nanobiotics')) {
        return {
            description: "Classified Tunable Adaptive Matter (TAM) lattice compound. Self-replicating nanite structure designed for accelerated cellular binding.",
            indications: "Critical trauma repair, localized tissue regeneration.",
            sideEffects: "Temporary bio-luminescence, elevated core temperature, heavy caloric burn."
        };
    }
    if (name.includes('forge') || name.includes('adrenaline')) {
        return {
            description: "High-yield, hyper-oxygenating combat stimulant manufactured by Hephaestus Forgeworks.",
            indications: "Immediate neural override, shock recovery, extreme cardiovascular stimulation.",
            sideEffects: "Severe tachycardia, micro-fractures in bone density, adrenal crash."
        };
    }
    if (name.includes('spectre') || name.includes('revenant')) {
        return {
            description: "Ultra-dense nutrient block formulated for prolonged zero-gravity operations.",
            indications: "Deep space caloric maintenance, sustained dietary replacement.",
            sideEffects: "Gastrointestinal stasis, metabolic slowing, lethargy."
        };
    }
    
    // Generic response for standard test meds
    return {
        description: `[DEV MODE] Mock clinical description generated for testing ${drugName}.`,
        indications: `[DEV MODE] Mock indications for ${drugName}.`,
        sideEffects: `[DEV MODE] Mock adverse reactions and side effects for ${drugName}.`
    };
}

// --- Interaction Engine ---
window.checkLocalInteractions = async function(newMedName) {
    try {
        const res = await fetch('interactions.json');
        const db_int = await res.json();
        
        let activeMeds = [];
        if (typeof AppSettings !== 'undefined' && AppSettings.devMode) {
            activeMeds = window.MOCK_DATA.meds;
        } else {
            activeMeds = await new Promise(r => db.transaction(["meds"], "readonly").objectStore("meds").getAll().onsuccess = e => r(e.target.result));
        }
        
        const drug = newMedName.toLowerCase().trim();
        let warnings = [];
        activeMeds.forEach(m => {
            const active = m.name.toLowerCase().trim();
            if (db_int[drug]?.[active]) warnings.push(`Warning with ${m.name}: ${db_int[drug][active]}`);
            else if (db_int[active]?.[drug]) warnings.push(`Warning with ${m.name}: ${db_int[active][drug]}`);
        });
        return warnings;
    } catch (err) { 
        return []; 
    }
};

// --- Main Retrieval Engine ---
window.fetchDrugInfo = async function(drugName) {
    // 1. Check if Dev Mode is intercepting the request
    if (typeof AppSettings !== 'undefined' && AppSettings.devMode) {
        console.log(`[MedLedger Dev Mode] Intercepting clinical fetch for: ${drugName}`);
        return getMockClinicalData(drugName);
    }

    if (!drugName) return { description: "", indications: "", sideEffects: "" };
    
    const dbName = drugName.toLowerCase().trim();

    // 2. Check Local Cache (IndexedDB)
    try {
        const cached = await new Promise((resolve, reject) => {
            if (typeof db === 'undefined') { resolve(null); return; }
            const tx = db.transaction([CLINICAL_CACHE_STORE], "readonly");
            const req = tx.objectStore(CLINICAL_CACHE_STORE).get(dbName);
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = () => resolve(null);
        });

        if (cached && (Date.now() - cached.timestamp < 30 * 24 * 60 * 60 * 1000)) { 
            return { 
                description: cached.description || "", 
                indications: cached.indications || "",
                sideEffects: cached.sideEffects || ""
            };
        }
    } catch (e) {
        console.warn("Clinical Cache Read Error:", e);
    }

    let result = { description: "", indications: "", sideEffects: "" };

    // 3. Query OpenFDA
    try {
        const fdaUrl = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodeURIComponent(dbName)}"&limit=1`;
        const fdaRes = await fetch(fdaUrl);
        if (fdaRes.ok) {
            const fdaData = await fdaRes.json();
            if (fdaData.results && fdaData.results.length > 0) {
                const label = fdaData.results[0];
                
                // Fetch Indications
                if (label.indications_and_usage) {
                    result.indications = label.indications_and_usage[0].replace(/INDICATIONS AND USAGE|Indications and Usage/g, '').trim();
                    if (result.indications.length > 150) result.indications = result.indications.substring(0, 147) + '...';
                }
                
                // Fetch Description
                if (label.description) {
                    result.description = label.description[0].replace(/DESCRIPTION|Description/g, '').trim();
                    if (result.description.length > 200) result.description = result.description.substring(0, 197) + '...';
                }

                // NEW: Fetch Adverse Reactions (Side Effects)
                if (label.adverse_reactions) {
                    result.sideEffects = label.adverse_reactions[0].replace(/ADVERSE REACTIONS|Adverse Reactions/g, '').trim();
                    if (result.sideEffects.length > 150) result.sideEffects = result.sideEffects.substring(0, 147) + '...';
                }
            }
        }
    } catch (err) {
        console.warn("OpenFDA fetch failed, trying Wikidata fallback...", err);
    }

    // 4. Fallback to Wikidata if FDA description is incomplete
    if (!result.description) {
        try {
            const wikiUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(dbName)}&language=en&format=json&origin=*`;
            const wikiRes = await fetch(wikiUrl);
            if (wikiRes.ok) {
                const wikiData = await wikiRes.json();
                if (wikiData.search && wikiData.search.length > 0) {
                    result.description = wikiData.search[0].description || "";
                    if (result.description) {
                        result.description = result.description.charAt(0).toUpperCase() + result.description.slice(1);
                    }
                }
            }
        } catch (err) {
            console.warn("Wikidata fetch failed.", err);
        }
    }

    // 5. Cache the Result
    try {
        if (typeof db !== 'undefined') {
            const tx = db.transaction([CLINICAL_CACHE_STORE], "readwrite");
            tx.objectStore(CLINICAL_CACHE_STORE).put({
                id: dbName,
                description: result.description,
                indications: result.indications,
                sideEffects: result.sideEffects,
                timestamp: Date.now()
            });
        }
    } catch (e) {
        console.warn("Clinical Cache Write Error:", e);
    }

    return result;
};

// --- Background Refresh Task ---
window.refreshAllClinicalData = async function(force = false) {
    if (typeof AppSettings !== 'undefined' && !AppSettings.clinicalLookups) return;
    if (typeof AppSettings !== 'undefined' && AppSettings.devMode) return; 
    if (typeof db === 'undefined') return;

    try {
        const tx = db.transaction(["meds"], "readonly");
        const meds = await new Promise(r => tx.objectStore("meds").getAll().onsuccess = e => r(e.target.result));
        
        for (const med of meds) {
            // Force fetch if missing description OR sideEffects (since it's a new feature)
            if (force || !med.description || !med.sideEffects) {
                const data = await window.fetchDrugInfo(med.name);
                
                if ((data.description && data.description !== med.description) || 
                    (data.indications && data.indications !== med.indications) ||
                    (data.sideEffects && data.sideEffects !== med.sideEffects)) {
                    
                    const writeTx = db.transaction(["meds"], "readwrite");
                    const store = writeTx.objectStore("meds");
                    med.description = data.description || med.description;
                    med.indications = data.indications || med.indications;
                    med.sideEffects = data.sideEffects || med.sideEffects; // Inject new data layer
                    store.put(med);
                }
                // Small delay to respect API rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        localStorage.setItem('medledger_initial_fetch_done', 'true');
    } catch (err) {
        console.error("Background clinical refresh failed:", err);
    }
};
