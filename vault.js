// ==========================================
// vault.js - MedLedger Security & Sync Engine
// Handles AES-GCM Encryption, Local Backup, and Google Drive Sync
// ==========================================

// --- CREDENTIAL MANAGEMENT API & SESSION ---
async function promptToSavePassword(password) {
    if ('credentials' in navigator && window.PasswordCredential) {
        try {
            const cred = new PasswordCredential({
                id: 'MedLedger_Vault',
                password: password,
                name: 'MedLedger Encryption Key'
            });
            await navigator.credentials.store(cred);
        } catch (err) {
            console.warn("Credential save ignored or failed:", err);
        }
    }
}

function cacheSessionPassword(password) {
    if (password) {
        sessionStorage.setItem('medledger_session_key', password);
        const lockControls = document.getElementById('session-lock-controls');
        if(lockControls) lockControls.style.display = 'flex';
    }
}

function lockVaultSession() {
    sessionStorage.removeItem('medledger_session_key');
    const vaultPassInput = document.getElementById('vault-password');
    if(vaultPassInput) vaultPassInput.value = '';
    const lockControls = document.getElementById('session-lock-controls');
    if(lockControls) lockControls.style.display = 'none';
    showVaultStatus("Vault locked.", "var(--text-secondary)");
}

// --- ENCRYPTED VAULT LOGIC (Core) ---
const enc = new TextEncoder();
const dec = new TextDecoder();

async function getKeyMaterial(password) {
    return window.crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]);
}

async function getKey(keyMaterial, salt) {
    return window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
}

async function generateEncryptedBlob(password) {
    if (!db) throw new Error("Database not initialized");
    
    // 1. Dynamically scrape all IndexedDB Object Stores (meds, logs, archives, clinical_cache)
    const stores = Array.from(db.objectStoreNames);
    const dbData = {};
    
    if (stores.length > 0) {
        const tx = db.transaction(stores, "readonly");
        for (const storeName of stores) {
            dbData[storeName] = await new Promise(res => {
                const req = tx.objectStore(storeName).getAll();
                req.onsuccess = e => res(e.target.result);
                req.onerror = () => res([]);
            });
        }
    }
    
    // 2. Dynamically scrape LocalStorage for UI, Profiles, and Configurations
    const settings = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Captures cfg_ settings, medledger_ (themes/profiles), and core theme key
        if (key.startsWith('cfg_') || key.startsWith('medledger_') || key === 'theme' || key === 'gapi_token' || key === 'gapi_token_expiry') {
            settings[key] = localStorage.getItem(key);
        }
    }
    
    // 3. Compile the schema-agnostic payload
    const rawData = JSON.stringify({ 
        stores: dbData, 
        settings: settings, 
        exportedAt: new Date().toISOString() 
    });
    
    // 4. AES-GCM 256 Encryption
    const keyMaterial = await getKeyMaterial(password);
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await getKey(keyMaterial, salt);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedContent = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(rawData));
    const bundle = new Uint8Array(salt.byteLength + iv.byteLength + encryptedContent.byteLength);
    bundle.set(salt, 0); 
    bundle.set(iv, salt.byteLength); 
    bundle.set(new Uint8Array(encryptedContent), salt.byteLength + iv.byteLength);
    
    return btoa(String.fromCharCode.apply(null, bundle));
}

async function processEncryptedBlob(password, base64Blob) {
    const binaryString = atob(base64Blob);
    const bundle = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bundle[i] = binaryString.charCodeAt(i);

    const salt = bundle.slice(0, 16);
    const iv = bundle.slice(16, 28);
    const ciphertext = bundle.slice(28);

    const keyMaterial = await getKeyMaterial(password);
    const key = await getKey(keyMaterial, salt);
    const decryptedContent = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ciphertext);
    return JSON.parse(dec.decode(decryptedContent));
}

function restoreDataToDB(parsedData) {
    if (!db) return;

    function finishRestore() {
        if(typeof window.populateProfileDropdowns === 'function') window.populateProfileDropdowns();
        if(typeof loadChecklist === 'function') loadChecklist(); 
        if(typeof refreshHistory === 'function') refreshHistory();
        if(typeof calculateAdherence === 'function') calculateAdherence(); 
        if(typeof initializeTheme === 'function') initializeTheme();
    }

    // LEGACY FORMAT SUPPORT: Handle old backups before the schema-agnostic update
    if (parsedData.meds || parsedData.logs || parsedData.archived_logs) {
        const legacyStores = [];
        if (parsedData.meds && db.objectStoreNames.contains("meds")) legacyStores.push("meds");
        if (parsedData.logs && db.objectStoreNames.contains("logs")) legacyStores.push("logs");
        if (parsedData.archived_logs && db.objectStoreNames.contains("archived_logs")) legacyStores.push("archived_logs");
        
        if (legacyStores.length > 0) {
            const tx = db.transaction(legacyStores, "readwrite");
            if (parsedData.meds) { const s = tx.objectStore("meds"); s.clear(); parsedData.meds.forEach(x => s.add(x)); }
            if (parsedData.logs) { const s = tx.objectStore("logs"); s.clear(); parsedData.logs.forEach(x => s.add(x)); }
            if (parsedData.archived_logs) { const s = tx.objectStore("archived_logs"); s.clear(); parsedData.archived_logs.forEach(x => s.add(x)); }
            tx.oncomplete = finishRestore;
        } else {
            finishRestore();
        }

        if (parsedData.profiles && Array.isArray(parsedData.profiles)) {
            localStorage.setItem('cfg_profiles', JSON.stringify(parsedData.profiles));
        }
        return;
    }

    // NEW FORMAT SUPPORT: Schema-Agnostic Restore
    if (parsedData.settings) {
        Object.keys(parsedData.settings).forEach(key => {
            localStorage.setItem(key, parsedData.settings[key]);
        });
    }

    if (parsedData.stores) {
        const storesToUpdate = Object.keys(parsedData.stores).filter(s => db.objectStoreNames.contains(s));
        if (storesToUpdate.length > 0) {
            const tx = db.transaction(storesToUpdate, "readwrite");
            
            storesToUpdate.forEach(storeName => {
                const store = tx.objectStore(storeName);
                store.clear();
                parsedData.stores[storeName].forEach(item => store.add(item));
            });

            tx.oncomplete = finishRestore;
        } else {
            finishRestore();
        }
    } else {
        finishRestore();
    }
}

function togglePasswordVisibility() {
    const vaultPassInput = document.getElementById('vault-password');
    const peekIcon = document.getElementById('peek-icon');
    if (!vaultPassInput || !peekIcon) return;
    
    const isPassword = vaultPassInput.type === 'password';
    vaultPassInput.type = isPassword ? 'text' : 'password';
    if (isPassword) {
        peekIcon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
    } else {
        peekIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
    }
}

function showVaultStatus(message, color) {
    const vaultStatus = document.getElementById('vault-status');
    if(!vaultStatus) return;
    vaultStatus.textContent = message; 
    vaultStatus.style.color = color;
    setTimeout(() => { vaultStatus.textContent = ''; }, 4000);
}

// --- LOCAL VAULT (File Export/Import) ---
async function exportVaultLocal() {
    const vaultPassInput = document.getElementById('vault-password');
    const password = vaultPassInput ? vaultPassInput.value || sessionStorage.getItem('medledger_session_key') : sessionStorage.getItem('medledger_session_key');
    
    if (!password) { showVaultStatus("Password required for export.", "var(--danger-color)"); return; }
    
    promptToSavePassword(password);
    cacheSessionPassword(password);
    
    try {
        const encryptedBase64 = await generateEncryptedBlob(password);
        const blob = new Blob([encryptedBase64], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `MedLedger_${new Date().toISOString().split('T')[0]}.medvault`;
        a.click(); URL.revokeObjectURL(url);
        
        if(vaultPassInput) vaultPassInput.value = password; 
        showVaultStatus("Local Export successful.", "var(--success-color)");
    } catch (err) { console.error(err); showVaultStatus("Export failed.", "var(--danger-color)"); }
}

async function importVaultLocal(e) {
    const file = e.target.files[0];
    if (!file) return;
    const vaultPassInput = document.getElementById('vault-password');
    const password = vaultPassInput ? vaultPassInput.value : null;
    if (!password) { showVaultStatus("Password required to decrypt.", "var(--danger-color)"); e.target.value = ''; return; }

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const parsedData = await processEncryptedBlob(password, event.target.result);
            restoreDataToDB(parsedData);
            if(vaultPassInput) vaultPassInput.value = ''; 
            e.target.value = '';
            showVaultStatus("Local Import successful. Vault restored.", "var(--success-color)");
        } catch (err) {
            console.error(err); showVaultStatus("Decryption failed. Incorrect password?", "var(--danger-color)"); e.target.value = '';
        }
    };
    reader.readAsText(file);
}

// --- GOOGLE DRIVE SYNC INTEGRATION ---
let tokenClient;
let gapiToken = null;

window.initGoogleSync = function() {
    if (typeof GOOGLE_CLIENT_ID === 'undefined') return;
    
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.appdata',
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                gapiToken = tokenResponse.access_token;
                
                localStorage.setItem('gapi_token', gapiToken);
                localStorage.setItem('gapi_token_expiry', Date.now() + (55 * 60 * 1000));

                const syncControls = document.getElementById('cloud-sync-controls');
                const btnLogin = document.getElementById('btn-gdrive-login');
                if(syncControls) syncControls.style.display = 'flex';
                if(btnLogin) btnLogin.style.display = 'none';
                showVaultStatus("Google Drive Connected.", "var(--success-color)");
            }
        },
    });

    const savedToken = localStorage.getItem('gapi_token');
    const tokenExpiry = localStorage.getItem('gapi_token_expiry');
    
    if (savedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
        gapiToken = savedToken;
        const syncControls = document.getElementById('cloud-sync-controls');
        const btnLogin = document.getElementById('btn-gdrive-login');
        if(syncControls) syncControls.style.display = 'flex';
        if(btnLogin) btnLogin.style.display = 'none';
    } else {
        localStorage.removeItem('gapi_token');
        localStorage.removeItem('gapi_token_expiry');
    }
};

window.loginGoogleDrive = function() {
    if (typeof GOOGLE_CLIENT_ID === 'undefined' || GOOGLE_CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
        showVaultStatus("Please add your Client ID to app.js", "var(--danger-color)");
        return;
    }
    if(typeof tokenClient !== 'undefined') tokenClient.requestAccessToken();
};

window.logoutGoogleDrive = function() {
    gapiToken = null;
    localStorage.removeItem('gapi_token');
    localStorage.removeItem('gapi_token_expiry');
    const syncControls = document.getElementById('cloud-sync-controls');
    const btnLogin = document.getElementById('btn-gdrive-login');
    if(syncControls) syncControls.style.display = 'none';
    if(btnLogin) btnLogin.style.display = 'block';
    showVaultStatus("Cloud disconnected.", "var(--text-secondary)");
};

async function checkDriveForFile() {
    const res = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name="medledger_sync.medvault"', {
        headers: { 'Authorization': `Bearer ${gapiToken}` }
    });
    if (res.status === 401 || res.status === 403) {
        logoutGoogleDrive();
        throw new Error("Token expired.");
    }
    const data = await res.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function pushToGoogleDrive() {
    const vaultPassInput = document.getElementById('vault-password');
    const password = vaultPassInput ? vaultPassInput.value || sessionStorage.getItem('medledger_session_key') : sessionStorage.getItem('medledger_session_key');
    
    if (!password) { showVaultStatus("Password required to encrypt before push.", "var(--danger-color)"); return; }
    
    promptToSavePassword(password);
    cacheSessionPassword(password);

    showVaultStatus("Encrypting and pushing...", "var(--text-secondary)");
    try {
        const encryptedBase64 = await generateEncryptedBlob(password);
        const fileId = await checkDriveForFile();
        
        const metadata = { name: 'medledger_sync.medvault', parents: ['appDataFolder'] };
        const initUrl = fileId 
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
        const initMethod = fileId ? 'PATCH' : 'POST';

        const initRes = await fetch(initUrl, {
            method: initMethod,
            headers: {
                'Authorization': `Bearer ${gapiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(fileId ? {} : metadata)
        });

        if (!initRes.ok) {
            if (initRes.status === 401 || initRes.status === 403) logoutGoogleDrive();
            throw new Error("Failed to initiate upload");
        }

        const uploadUrl = initRes.headers.get('Location');

        const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: encryptedBase64
        });
        
        if (uploadRes.ok) {
            if(vaultPassInput) vaultPassInput.value = password;
            showVaultStatus("Successfully pushed securely to Drive.", "var(--success-color)");
        } else {
            throw new Error("Upload data failed.");
        }
    } catch (err) {
        console.error(err);
        showVaultStatus("Failed to push to Cloud. Check console.", "var(--danger-color)");
    }
}

async function pullFromGoogleDrive() {
    const vaultPassInput = document.getElementById('vault-password');
    const password = vaultPassInput ? vaultPassInput.value || sessionStorage.getItem('medledger_session_key') : sessionStorage.getItem('medledger_session_key');
    
    if (!password) { showVaultStatus("Password required to decrypt.", "var(--danger-color)"); return; }

    promptToSavePassword(password);
    cacheSessionPassword(password);

    showVaultStatus("Pulling from cloud...", "var(--text-secondary)");
    try {
        const fileId = await checkDriveForFile();
        if (!fileId) {
            showVaultStatus("No backup found in Drive.", "var(--danger-color)");
            return;
        }

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${gapiToken}` }
        });
        
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) logoutGoogleDrive();
            throw new Error("Download failed");
        }
        
        const encryptedBase64 = await res.text();
        const parsedData = await processEncryptedBlob(password, encryptedBase64);
        restoreDataToDB(parsedData);
        
        if(vaultPassInput) vaultPassInput.value = password;
        showVaultStatus("Successfully synced from Drive.", "var(--success-color)");
    } catch (err) {
        console.error(err);
        showVaultStatus("Decryption or Download failed.", "var(--danger-color)");
    }
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    const importInput = document.getElementById('import-vault-file');
    if (importInput) importInput.addEventListener('change', importVaultLocal);

    const btnExport = document.getElementById('btn-export-vault');
    if (btnExport) btnExport.addEventListener('click', exportVaultLocal);

    const btnCloudPush = document.getElementById('btn-cloud-push');
    if (btnCloudPush) btnCloudPush.addEventListener('click', pushToGoogleDrive);

    const btnCloudPull = document.getElementById('btn-cloud-pull');
    if (btnCloudPull) btnCloudPull.addEventListener('click', pullFromGoogleDrive);
    
    const btnLock = document.getElementById('btn-lock-vault');
    if (btnLock) btnLock.addEventListener('click', lockVaultSession);
});
