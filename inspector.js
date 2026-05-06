// ==========================================
// inspector.js - Standalone Vault Reader
// Reads and decrypts .medvault files for user transparency.
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
            // Check if it's new JSON-packed format or old binary format
            let fileContent;
            try {
                // Try decoding as base64 first (old format or outer wrapper)
                fileContent = window.atob(base64Blob);
            } catch (e) {
                // If it fails, it might just be raw JSON text
                fileContent = base64Blob; 
            }

            // 1. Try parsing as JSON (New Format / Unencrypted)
            try {
                const parsed = JSON.parse(fileContent);
                if (!parsed._medledger_encrypted) return parsed; // Unencrypted JSON

                if (!password) throw new Error("Password required to decrypt this vault.");

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
                // 2. Fallback to Legacy Binary Format
                if (jsonErr.message.includes("Password required")) throw jsonErr;

                if (!password) throw new Error("Password required to decrypt this vault.");
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
                const dec = new TextDecoder();
                return JSON.parse(dec.decode(decryptedContent));
            }
        } catch (e) {
            console.error(e);
            throw new Error("Decryption failed. Incorrect password or invalid file.");
        }
    }
};

function showStatus(msg, color) {
    const el = document.getElementById('inspector-status');
    el.textContent = msg;
    el.style.color = color;
}

document.getElementById('btn-inspect').addEventListener('click', () => {
    const fileInput = document.getElementById('inspector-file');
    const pwdInput = document.getElementById('inspector-password');
    const viewerContainer = document.getElementById('viewer-container');
    const jsonOutput = document.getElementById('json-output');

    if (!fileInput.files.length) {
        showStatus("Please select a .medvault file.", "var(--danger-color)");
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        showStatus("Decrypting...", "var(--text-primary)");
        try {
            const rawText = e.target.result;
            const decryptedObj = await CryptoUtils.decryptPayload(rawText, pwdInput.value);
            
            // Format the JSON to be human-readable (2 spaces indentation)
            const prettyJson = JSON.stringify(decryptedObj, null, 2);
            
            jsonOutput.textContent = prettyJson;
            viewerContainer.style.display = 'block';
            showStatus("Decryption successful.", "var(--success-color)");
        } catch (err) {
            viewerContainer.style.display = 'none';
            jsonOutput.textContent = "";
            showStatus(err.message, "var(--danger-color)");
        }
    };

    reader.readAsText(file);
});

document.getElementById('btn-copy').addEventListener('click', () => {
    const jsonText = document.getElementById('json-output').textContent;
    navigator.clipboard.writeText(jsonText).then(() => {
        const btn = document.getElementById('btn-copy');
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = "Copy JSON", 2000);
    });
});
