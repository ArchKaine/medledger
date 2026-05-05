// ==========================================
// help.js - MedLedger User Guide & System Documentation
// ==========================================

const HelpContent = {
    warnings: `
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger-color); padding: 1rem; border-radius: 8px; margin-bottom: 2rem;">
            <h3 style="color: var(--danger-color); margin-top: 0;">⚠️ Critical Warnings</h3>
            <p>Because this app respects your privacy, your data lives <strong>only on your device</strong>. There is no central server.</p>
            <ul style="padding-left: 1.2rem; font-size: 0.9rem;">
                <li><strong>No Password Recovery:</strong> If you set an encryption password for your Data Vault and forget it, your exported backups and cloud syncs are permanently unreadable. There is no "Forgot Password" button.</li>
                <li><strong>Browser Data:</strong> Your active schedule lives inside your browser's local storage. If you clear site data/cookies without a backup, your ledger is erased. <strong>Always backup to Device or Push to Cloud first!</strong></li>
            </ul>
        </div>
    `,
    installation: `
        <section style="margin-bottom: 1.5rem;">
            <h3 style="color: var(--accent-color);">📱 1. Installation & Offline Use</h3>
            <p>MedLedger is a Progressive Web App (PWA). You don't download it from an app store. It features a responsive layout that automatically expands into a multi-column dashboard on desktop screens.</p>
            <ul style="padding-left: 1.2rem; font-size: 0.9rem;">
                <li><strong>Desktop / Chrome / Edge:</strong> Look for the "install" icon in the right side of the URL address bar to run as a native desktop window.</li>
                <li><strong>iOS / Safari:</strong> Tap the Share button at the bottom of the screen and select "Add to Home Screen".</li>
                <li><strong>Android / Chrome:</strong> Tap the Menu (⋮) at the top right and select "Install App" or "Add to Home screen".</li>
            </ul>
            <p>Once installed, the app runs offline natively.</p>
        </section>
    `,
    scheduling: `
        <section style="margin-bottom: 1.5rem;">
            <h3 style="color: var(--accent-color);">💊 2. Adding Medications & Scheduling</h3>
            <p>MedLedger supports highly complex scheduling logic:</p>
            <ul style="padding-left: 1.2rem; font-size: 0.9rem;">
                <li><strong>Standard Schedules:</strong> Tap "+ Add Time" for multiple reminders (e.g., 8:00 AM and 8:00 PM).</li>
                <li><strong>As Needed (PRN):</strong> Appear on your daily list but never count against streaks if skipped.</li>
                <li><strong>Specific Days:</strong> Select exact days (e.g., M/W/F). The pill hides itself on off-days.</li>
                <li><strong>Cyclic (On/Off):</strong> Set "Days On" and "Days Off" (e.g., birth control). The app handles the math.</li>
                <li><strong>Zero-Knowledge Safety:</strong> Local interaction warnings will trigger if you combine dangerous medications.</li>
            </ul>
        </section>
    `,
    logging: `
        <section style="margin-bottom: 1.5rem;">
            <h3 style="color: var(--accent-color);">✅ 3. Logging Your Daily Regimen</h3>
            <p>The "Today's Regimen" list resets automatically at midnight.</p>
            <ul style="padding-left: 1.2rem; font-size: 0.9rem;">
                <li>Tap the square checkbox next to a time slot to select it.</li>
                <li><strong>Log Selected:</strong> Record only checked items. <strong>Log All:</strong> Record the entire day.</li>
                <li><strong>Time Machine (Backdating):</strong> If you took a pill hours ago, use the "Time Taken" box to set the actual time before clicking Log.</li>
            </ul>
        </section>
    `,
    analytics: `
        <section style="margin-bottom: 1.5rem;">
            <h3 style="color: var(--accent-color);">📊 4. Tracking Your Progress</h3>
            <p>The History tab features clinical-grade consistency analytics:</p>
            <ul style="padding-left: 1.2rem; font-size: 0.9rem;">
                <li><strong>Consistency Grid:</strong> 🟩 Perfect Day | 🟨 Partial Day | ⬜ Empty/Missed.</li>
                <li><strong>Pending vs Missed:</strong> Days stay Green until a scheduled target time is passed without a log.</li>
                <li><strong>Ghost Logs:</strong> Faded squares indicate one or more doses were logged retroactively via the Time Machine.</li>
                <li><strong>Tap-To-Inspect:</strong> Tap any calendar square for a granular breakdown of Taken vs Missed.</li>
            </ul>
        </section>
    `,
    mistakes: `
        <section style="margin-bottom: 1.5rem;">
            <h3 style="color: var(--accent-color);">✏️ 5. Fixing Mistakes</h3>
            <ul style="padding-left: 1.2rem; font-size: 0.9rem;">
                <li><strong>Edit a Pill:</strong> Tap the Pencil Icon to change times, instructions, or cycles.</li>
                <li><strong>Undo a Log:</strong> Tap the Trash icon in the History Log to refund a pill and uncheck the box.</li>
                <li><strong>Duplicate Warnings:</strong> Red badges flag any accidental double-logging of scheduled pills.</li>
            </ul>
        </section>
    `,
    vault: `
        <section style="margin-bottom: 1.5rem;">
            <h3 style="color: var(--accent-color);">🔐 7. The Encrypted Vault & Sync</h3>
            <ul style="padding-left: 1.2rem; font-size: 0.9rem;">
                <li><strong>Backup Device:</strong> Encrypts your database into a .medvault file for local storage.</li>
                <li><strong>Google Drive Sync:</strong> Securely syncs your encrypted file to an invisible AppData folder in your Drive.</li>
            </ul>
        </section>
    `,
    footer: `
        <div style="border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem; display: flex; gap: 1rem; font-size: 0.8rem; opacity: 0.7;">
            <a href="#" style="color: var(--text-primary);">Privacy Policy</a>
            <a href="#" style="color: var(--text-primary);">Terms of Service</a>
        </div>
    `
};

function openHelpModal() {
    let helpModal = document.getElementById('help-modal');
    
    if (!helpModal) {
        helpModal = document.createElement('dialog');
        helpModal.id = 'help-modal';
        helpModal.className = 'modal';
        document.body.appendChild(helpModal);
    }
    
    // Inject dynamic content every time to ensure translations/updates are caught
    helpModal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:1rem; margin-bottom:1rem;">
                <h2 style="margin:0;">User Guide & Warnings</h2>
                <button class="icon-btn" onclick="document.getElementById('help-modal').close()" type="button" aria-label="Close Guide">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <div id="help-scroll-area" style="max-height: 70vh; overflow-y: auto; padding-right: 10px;">
                ${HelpContent.warnings}
                ${HelpContent.installation}
                ${HelpContent.scheduling}
                ${HelpContent.logging}
                ${HelpContent.analytics}
                ${HelpContent.mistakes}
                ${HelpContent.vault}
                ${HelpContent.footer}
            </div>
            <button class="btn btn-primary" style="width:100%; margin-top:1.5rem;" onclick="document.getElementById('help-modal').close()" type="button">Close Guide</button>
        </div>
    `;

    helpModal.showModal();
}

window.openHelpModal = openHelpModal;
