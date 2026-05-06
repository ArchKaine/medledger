// ==========================================
// inspector.js - Standalone Vault Reader
// Handles Decryption, Pretty-Printing, and Live Searching
// ==========================================

const CryptoUtils = {
    base64ToBuffer: function(base64) {
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    },

    deriveKey: async function(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode(password), {name: "PBKDF2"}, false, ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
        );
    },

    decryptPayload: async function(base64Blob, password) {
        try {
            let fileContent;
            try {
                fileContent = window.atob(base64Blob);
            } catch (e) {
                fileContent = base64Blob; 
            }

            try {
                const parsed = JSON.parse(fileContent);
                if (!parsed._medledger_encrypted) return parsed;

                if (!password) throw new Error("Password required for encrypted vault.");

                const salt = this.base64ToBuffer(parsed.salt);
                const iv = this.base64ToBuffer(parsed.iv);
                const encryptedData = this.base64ToBuffer(parsed.data);

                const key = await this.deriveKey(password, salt);
                const decryptedContent = await crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: iv }, key, encryptedData
                );

                const dec = new TextDecoder();
                return JSON.parse(dec.decode(decryptedContent));
            } catch (jsonErr) {
                if (jsonErr.message.includes("Password required")) throw jsonErr;

                if (!password) throw new Error("Password required for encrypted vault.");
                const bundle = new Uint8Array(fileContent.length);
                for (let i = 0; i < fileContent.length; i++) bundle[i] = fileContent.charCodeAt(i);

                const salt = bundle.slice(0, 16);
                const iv = bundle.slice(16, 28);
                const ciphertext = bundle.slice(28);

                const enc = new TextEncoder();
                const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
                const key = await crypto.subtle.deriveKey(
                    { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
                    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
                );
                
                const decryptedContent = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ciphertext);
                return JSON.parse(new TextDecoder().decode(decryptedContent));
            }
        } catch (e) {
            console.error(e);
            throw new Error("Decryption failed. Check password and file format.");
        }
    }
};

// Pretty-printer with syntax highlighting
function syntaxHighlight(json) {
    if (typeof json !== 'string') {
        json = JSON.stringify(json, undefined, 2);
    }
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

let activeData = null;

function renderData(filterText = "") {
    const jsonOutput = document.getElementById('json-output');
    if (!activeData) return;

    let dataToDisplay = activeData;

    // Basic filtering logic for search
    if (filterText) {
        const query = filterText.toLowerCase();
        // Create a shallow copy so we don't destroy activeData
        dataToDisplay = { ...activeData };
        if (dataToDisplay.stores) {
            const filteredStores = {};
            Object.keys(dataToDisplay.stores).forEach(store => {
                filteredStores[store] = dataToDisplay.stores[store].filter(item => 
                    JSON.stringify(item).toLowerCase().includes(query)
                );
            });
            dataToDisplay.stores = filteredStores;
        }
    }

    jsonOutput.innerHTML = syntaxHighlight(dataToDisplay);
}

document.getElementById('btn-inspect').addEventListener('click', () => {
    const fileInput = document.getElementById('inspector-file');
    const pwdInput = document.getElementById('inspector-password');
    const viewerContainer = document.getElementById('viewer-container');
    const searchInput = document.getElementById('inspector-search');

    if (!fileInput.files.length) {
        showStatus("Please select a .medvault file.", "var(--danger-color)");
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        showStatus("Decrypting...", "var(--text-primary)");
        try {
            activeData = await CryptoUtils.decryptPayload(e.target.result, pwdInput.value);
            renderData();
            viewerContainer.style.display = 'block';
            searchInput.style.display = 'block';
            showStatus("Decryption successful.", "var(--success-color)");
        } catch (err) {
            viewerContainer.style.display = 'none';
            searchInput.style.display = 'none';
            showStatus(err.message, "var(--danger-color)");
        }
    };
    reader.readAsText(file);
});

document.getElementById('inspector-search').addEventListener('input', (e) => {
    renderData(e.target.value);
});

document.getElementById('btn-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(activeData, null, 2)).then(() => {
        const btn = document.getElementById('btn-copy');
        btn.textContent = "Copied Raw!";
        setTimeout(() => btn.textContent = "Copy Raw JSON", 2000);
    });
});

function showStatus(msg, color) {
    const el = document.getElementById('inspector-status');
    el.textContent = msg;
    el.style.color = color;
}
