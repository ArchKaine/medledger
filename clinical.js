// ==========================================
// clinical.js - MedLedger Multi-Source Fetcher
// Fetches data from OpenFDA and Wikidata
// ==========================================

async function fetchDrugInfo(drugName) {
    const info = {
        description: "",
        indications: "",
        source: "Local"
    };

    const cleanName = drugName.toLowerCase().trim();

    try {
        // 1. Fetch from Wikidata (Plain English Summary)
        const wikiUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=${cleanName}&languages=en&props=descriptions&format=json&origin=*`;
        const wikiRes = await fetch(wikiUrl);
        const wikiData = await wikiRes.json();
        const entities = wikiData.entities;
        const entityId = Object.keys(entities)[0];
        if (entityId !== "-1") {
            info.description = entities[entityId].descriptions?.en?.value || "";
        }

        // 2. Fetch from OpenFDA (Official Clinical Indications)
        const fdaUrl = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${cleanName}"&limit=1`;
        const fdaRes = await fetch(fdaUrl);
        const fdaData = await fdaRes.json();
        if (fdaData.results && fdaData.results[0]) {
            // Get the first few sentences of the Indications section
            const rawIndications = fdaData.results[0].indications_and_usage?.[0] || "";
            info.indications = rawIndications.split('.').slice(0, 2).join('.') + '.';
        }

        info.source = "FDA/Wikidata";
    } catch (err) {
        console.warn("Clinical lookup failed for:", drugName, err);
    }

    return info;
}
