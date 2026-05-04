// ==========================================
// help.js - MedLedger Documentation & Help
// Handles Onboarding and Feature Explanations
// ==========================================

const HelpContent = {
    overview: `
        <h3>Welcome to MedLedger</h3>
        <p>MedLedger is a private, zero-knowledge medication tracker. All data stays on your device.</p>
    `,
    logging: `
        <h4>📝 Logging Doses</h4>
        <ul>
            <li><strong>Scheduled:</strong> Check the box next to the time to log a dose at that specific target.</li>
            <li><strong>As Needed (PRN):</strong> Use the text box to record symptoms (e.g., "Headache 5/10") before checking the box.</li>
            <li><strong>Manual Time:</strong> Use the "Log Manually" button to record doses taken at a different time than "Now."</li>
        </ul>
    `,
    inventory: `
        <h4>📦 Supply & Refills</h4>
        <p>If Inventory Tracking is enabled in Settings, the app will count down each dose logged.</p>
        <ul>
            <li><strong>Low Supply:</strong> A red banner appears when you have 10 or fewer doses left.</li>
            <li><strong>Quick Refill:</strong> Use the +30 or +90 buttons on the card to instantly restock.</li>
        </ul>
    `,
    clinical: `
        <h4>🔬 Clinical Lookups</h4>
        <p>When enabled, MedLedger queries <strong>OpenFDA</strong> and <strong>Wikidata</strong> to provide summaries and official usage indications for your medications.</p>
        <p><i>Note: Lookups require an internet connection and will update the "Drug Reference" section in your Edit Modals.</i></p>
    `,
    privacy: `
        <h4>🛡️ Data & Privacy</h4>
        <p>Your health data is <strong>never</strong> uploaded to a server. MedLedger uses IndexedDB to store everything locally in your browser's private storage.</p>
    `
};

function openHelpModal() {
    let helpModal = document.getElementById('help-modal');
    
    // Create modal if it doesn't exist in HTML
    if (!helpModal) {
        helpModal = document.createElement('dialog');
        helpModal.id = 'help-modal';
        helpModal.className = 'modal';
        helpModal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:1rem; margin-bottom:1rem;">
                    <h2 style="margin:0;">System Help</h2>
                    <button class="icon-btn" onclick="document.getElementById('help-modal').close()" type="button">✕</button>
                </div>
                <div id="help-container" style="max-height: 70vh; overflow-y: auto; padding-right: 0.5rem;"></div>
                <button class="btn btn-primary" style="width:100%; margin-top:1.5rem;" onclick="document.getElementById('help-modal').close()" type="button">Got it</button>
            </div>
        `;
        document.body.appendChild(helpModal);
    }

    const container = document.getElementById('help-container');
    container.innerHTML = `
        ${HelpContent.overview}
        ${HelpContent.logging}
        ${HelpContent.inventory}
        ${HelpContent.clinical}
        ${HelpContent.privacy}
    `;

    helpModal.showModal();
}

// Global assignment
window.openHelpModal = openHelpModal;
