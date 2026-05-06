// ==========================================
// profiles.js - MedLedger Profile Management
// Dedicated state, persistence, and UI logic for multi-profile support.
// ==========================================

window.ProfileManager = {
    getSavedProfiles: function() {
        return JSON.parse(localStorage.getItem('cfg_profiles') || '["Primary"]');
    },
    saveProfile: function(name) {
        const profiles = this.getSavedProfiles();
        if (!profiles.includes(name)) {
            profiles.push(name);
            localStorage.setItem('cfg_profiles', JSON.stringify(profiles));
        }
    },
    getAllUniqueProfiles: async function() {
        let meds = [];
        let logs = [];
        if (AppSettings.devMode) {
            meds = window.MOCK_DATA?.meds || [];
            logs = window.MOCK_DATA?.logs || [];
        } else if (typeof db !== 'undefined' && db) {
            const tx = db.transaction(["meds", "logs"], "readonly");
            meds = await new Promise(r => tx.objectStore("meds").getAll().onsuccess = e => r(e.target.result));
            logs = await new Promise(r => tx.objectStore("logs").getAll().onsuccess = e => r(e.target.result));
        }

        const saved = this.getSavedProfiles();
        const allUnique = new Set([
            ...saved,
            ...meds.map(m => m.profile),
            ...logs.map(l => l.profile)
        ].filter(p => p && p !== "Primary"));

        const merged = ["Primary", ...Array.from(allUnique).sort()];
        localStorage.setItem('cfg_profiles', JSON.stringify(merged));
        return merged;
    }
};

window.populateProfileDropdowns = async function() {
    const profiles = await window.ProfileManager.getAllUniqueProfiles();
    const selectors = ['global-profile-sidebar', 'global-profile-header', 'profile-filter', 'new-med-profile', 'edit-med-profile'];

    selectors.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentVal = el.value;

        el.innerHTML = profiles.map(p => {
            const label = (id === 'profile-filter') ? `Profile: ${p}` : p;
            return `<option value="${p}">${label}</option>`;
        }).join('') + `<option value="ADD_NEW">+ Create New Profile...</option>`;

        if (id === 'profile-filter' || id.startsWith('global-profile')) {
            el.value = AppSettings.activeProfile || "Primary";
        } else {
            el.value = currentVal || "Primary";
        }
    });
};

window.handleProfileChange = function(selectId) {
    const el = document.getElementById(selectId);
    if (el.value === "ADD_NEW") {
        const name = prompt("Enter a name for the new profile:");
        if (name && name.trim()) {
            const cleanName = name.trim();
            window.ProfileManager.saveProfile(cleanName);

            window.populateProfileDropdowns().then(() => {
                const updatedEl = document.getElementById(selectId);
                if(updatedEl) updatedEl.value = cleanName;
            });
        } else {
            el.value = "Primary";
        }
    }
};

window.switchActiveProfile = function(val) {
    let profileName = val;
    if (val === 'ADD_NEW') {
        const name = prompt("Enter a name for the new profile:");
        if (name && name.trim()) {
            profileName = name.trim();
            window.ProfileManager.saveProfile(profileName);
        } else {
            profileName = "Primary";
        }
    }

    AppSettings.activeProfile = profileName;
    localStorage.setItem('cfg_activeProfile', profileName);

    const syncIds = ['global-profile-sidebar', 'global-profile-header', 'profile-filter'];
    syncIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = profileName;
    });

    if (typeof populateProfileDropdowns === 'function') populateProfileDropdowns();
    if (typeof loadChecklist === 'function') loadChecklist();
    if (typeof refreshHistory === 'function') refreshHistory();
    if (typeof calculateAdherence === 'function') calculateAdherence();
};
