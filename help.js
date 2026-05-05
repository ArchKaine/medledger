// ==========================================
// help.js - MedLedger User Guide & System Documentation
// ==========================================

const HelpContent = {
    warnings: `
        <div class="help-section" style="background: rgba(239, 68, 68, 0.05); border: 1px solid var(--danger-color); padding: 1.25rem; border-radius: 8px; margin-bottom: 2rem;">
            <h3 style="color: var(--danger-color); margin-top: 0;">⚠️ Critical Warnings</h3>
            <p>Because this app respects your privacy, your data lives <b>only on your device</b>. There is no central server.</p>
            <ul style="padding-left: 1.2rem; margin-top: 0.5rem;">
                <li style="margin-bottom: 0.5rem;"><b>No Password Recovery:</b> If you set an encryption password for your Data Vault and forget it, your exported backups and cloud syncs are permanently unreadable. <i>There is no "Forgot Password" button because the developer never sees your password.</i></li>
                <li><b>Browser Data:</b> Your active schedule lives inside your browser's local storage. If you clear your browser's site data/cookies without making a backup first, your ledger will be erased. Always Backup to Device or Push to Cloud first!</li>
            </ul>
        </div>
    `,
    installation: `
        <div class="help-section">
            <h3 style="color: var(--accent-color);">📱 1. Installation & Offline Use</h3>
            <p>MedLedger is a Progressive Web App (PWA). You don't download it from an app store. It features a responsive layout that automatically expands into a multi-column dashboard on desktop screens.</p>
            <ul style="padding-left: 1.2rem; margin-top: 0.5rem;">
                <li style="margin-bottom: 0.25rem;"><b>Desktop (Chrome / Edge):</b> Look for the "install" icon in the right side of the URL address bar to run the application as a native desktop window.</li>
                <li style="margin-bottom: 0.25rem;"><b>iOS / Safari:</b> Tap the <b>Share</b> button at the bottom of the screen and select <b>"Add to Home Screen"</b>.</li>
                <li><b>Android / Chrome:</b> Tap the <b>Menu (⋮)</b> at the top right and select <b>"Install App"</b> or <b>"Add to Home screen"</b>.</li>
            </ul>
            <p style="margin-top: 0.5rem;">Once installed, the app runs offline natively without requiring an internet connection.</p>
        </div>
    `,
    scheduling: `
        <div class="help-section">
            <h3 style="color: var(--accent-color);">💊 2. Adding Medications & Scheduling</h3>
            <p>Use the "Add Medication" box to build your list. MedLedger supports highly complex scheduling to match real-world prescriptions.</p>
            <ul style="padding-left: 1.2rem; margin-top: 0.5rem;">
                <li style="margin-bottom: 0.5rem;"><b>Daily / Morning / Night / Weekly:</b> Standard schedules. Tap "+ Add Time" to create multiple specific reminders (e.g., 8:00 AM and 8:00 PM for the same pill).</li>
                <li style="margin-bottom: 0.5rem;"><b>As Needed (PRN):</b> For things like pain relievers. They always appear on your daily list so they are ready when you need them, but they <i>never</i> count against your adherence streaks if you don't take them.</li>
                <li style="margin-bottom: 0.5rem;"><b>Specific Days:</b> Select exactly which days of the week a pill should appear (e.g., Mondays, Wednesdays, Fridays). It will automatically hide itself on the off days to keep your dashboard clean.</li>
                <li style="margin-bottom: 0.5rem;"><b>Cyclic (On/Off):</b> Used for medications like birth control. Set the "Days On" (e.g., 21), the "Days Off" (e.g., 7), and the date the cycle begins. The app handles the math and automatically hides the pill during the "Off" phase.</li>
                <li><b>Zero-Knowledge Safety:</b> MedLedger contains a local interaction database. It will explicitly warn you if you attempt to combine dangerous medications (like mixing Warfarin and Aspirin), completely offline.</li>
            </ul>
        </div>
    `,
    logging: `
        <div class="help-section">
            <h3 style="color: var(--accent-color);">✅ 3. Logging Your Daily Regimen</h3>
            <p>The "Today's Regimen" list shows everything due today. It resets automatically at midnight.</p>
            <ul style="padding-left: 1.2rem; margin-top: 0.5rem;">
                <li style="margin-bottom: 0.5rem;">Tap the square checkbox next to a time slot to select it. Emergency/PRN medications will prompt you for an optional reason/symptom (e.g., "Headache 7/10").</li>
                <li style="margin-bottom: 0.5rem;">Tap <b>Log Selected</b> to record only what you checked, or <b>Log All</b> to instantly record the entire day's scheduled list. (Note: "Log All" safely ignores As-Needed PRN meds).</li>
                <li><b>Time Machine (Backdating):</b> If you took a pill hours ago but forgot to tap it, use the "Time Taken" calendar box to set the <i>actual</i> time you took it before clicking Log. Leave it blank if you are taking it exactly right now.</li>
            </ul>
        </div>
    `,
    analytics: `
        <div class="help-section">
            <h3 style="color: var(--accent-color);">📊 4. Tracking Your Progress (Analytics)</h3>
            <p>The History tab features clinical-grade analytics to monitor your consistency over time.</p>
            <ul style="padding-left: 1.2rem; margin-top: 0.5rem;">
                <li style="margin-bottom: 0.5rem;"><b>Consistency Grid (Calendar):</b> A visual calendar of your habits. 
                    <br>🟩 <b>Green:</b> Perfect day.
                    <br>🟨 <b>Yellow:</b> Partial day (missed some, took some).
                    <br>⬜ <b>Gray:</b> Empty or missed day.
                </li>
                <li style="margin-bottom: 0.5rem;"><b>Pending vs Missed:</b> A day stays Green if you haven't taken a pill <i>yet</i>, provided its scheduled target time hasn't passed. Once the clock passes the target time without a log, it becomes Missed.</li>
                <li style="margin-bottom: 0.5rem;"><b>Ghost Logs:</b> If a calendar square is faded, it means you completed the day, but one or more doses were logged retroactively (using the Time Machine box).</li>
                <li style="margin-bottom: 0.5rem;"><b>Tap-To-Inspect:</b> Tap any square on the calendar to view a granular breakdown of exactly what was Taken, Pending, and Missed on that specific date.</li>
                <li><b>Streak Engine:</b> Tracks your current and longest unbroken streaks of taking all scheduled medications. (PRN pills and off-cycle days do not break streaks).</li>
            </ul>
        </div>
    `,
    mistakes: `
        <div class="help-section">
            <h3 style="color: var(--accent-color);">✏️ 5. Fixing Mistakes</h3>
            <ul style="padding-left: 1.2rem; margin-top: 0.5rem;">
                <li style="margin-bottom: 0.5rem;"><b>Edit a Pill:</b> Tap the <b>Pencil Icon</b> on any medication card to change its times, instructions, inventory, or cycle parameters.</li>
                <li style="margin-bottom: 0.5rem;"><b>Undo a Log:</b> Accidentally checked something off? Go to the "History Log" tab and tap the <b>Trash Can</b> icon next to the entry. It will un-check the box in today's regimen, recalculate your adherence score, and refund the pill to your inventory tracker.</li>
                <li><b>Duplicate Warnings:</b> If you accidentally double-log a scheduled pill, the History tab flags it with a bold red <b>DUPLICATE</b> badge so you can easily spot and delete it.</li>
            </ul>
        </div>
    `,
    settings: `
        <div class="help-section">
            <h3 style="color: var(--accent-color);">⚙️ 6. Settings & Customization</h3>
            <p>Tap the <b>Gear Icon</b> (or Settings in the desktop sidebar) to access power-user toggles.</p>
            <ul style="padding-left: 1.2rem; margin-top: 0.5rem;">
                <li style="margin-bottom: 0.5rem;"><b>Local Reminders:</b> Let your browser/phone send native push notifications when a scheduled pill is due.</li>
                <li style="margin-bottom: 0.5rem;"><b>Expert Mode:</b> Streamlines the interface. Double-click any item on the checklist to log it instantly without hitting submit.</li>
                <li style="margin-bottom: 0.5rem;"><b>Pill Tracker:</b> Opt-in to track physical pill inventory. A red warning banner automatically appears on the pill's card when you drop to 10 pills or fewer, with quick +30/+90 refill buttons.</li>
                <li style="margin-bottom: 0.5rem;"><b>Clinical Lookups:</b> Automatically fetches FDA/Wikidata indications and descriptions when you type a drug name, providing a mini-reference guide inside the app.</li>
                <li><b>Data Archival:</b> Move old history logs to cold storage to keep the app lightning fast. Restore them instantly whenever you need to generate a complete clinical report.</li>
            </ul>
        </div>
    `,
    vault: `
        <div class="help-section">
            <h3 style="color: var(--accent-color);">🔐 7. The Encrypted Vault & Sync</h3>
            <p>Your data is completely private. You hold the encryption keys.</p>
            <ul style="padding-left: 1.2rem; margin-top: 0.5rem;">
                <li style="margin-bottom: 0.5rem;"><b>Session Unlock:</b> Type your Master Password <b>once</b> to unlock the vault for your session. A green indicator will appear when secure syncing and exporting are available.</li>
                <li style="margin-bottom: 0.5rem;"><b>Backup Device:</b> Encrypts your database into a secure <code>.medvault</code> file to store on a USB drive or email to yourself. Use "Restore Device" to load it on a new phone.</li>
                <li style="margin-bottom: 0.5rem;"><b>Google Drive Sync:</b> Click "Sign in to Google." Use Push/Pull to securely sync your encrypted <code>.medvault</code> file directly to an invisible, protected AppData folder in your Google Drive.</li>
                <li><b>Clinician Reports:</b> Generate a clean, printable HTML summary of your adherence, PRN usage, and refill requirements to hand directly to your doctor, or export raw CSV data for spreadsheet analysis.</li>
            </ul>
        </div>
    `,
    footer: `
        <div style="border-top: 1px solid var(--border-color); padding-top: 1.5rem; margin-top: 2rem; display: flex; justify-content: center; gap: 2rem; font-size: 0.85rem; opacity: 0.8;">
            <a href="privacy.html" style="color: var(--accent-color); text-decoration: none;">Privacy Policy</a>
            <a href="terms.html" style="color: var(--accent-color); text-decoration: none;">Terms of Service</a>
        </div>
    `
};

function openHelpModal() {
    let helpModal = document.getElementById('help-modal');
    
    if (!helpModal) {
        helpModal = document.createElement('dialog');
        helpModal.id = 'help-modal';
        helpModal.className = 'card modal';
        helpModal.style.cssText = 'max-height: 85vh; overflow-y: auto; max-width: 650px; width: 95%; padding: 2rem;';
        document.body.appendChild(helpModal);
    }
    
    // Inject dynamic, fully detailed content
    helpModal.innerHTML = `
        <div class="modal-content">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:1rem; margin-bottom:1.5rem;">
                <h2 style="margin:0; font-size: 1.5rem;">MedLedger Manual</h2>
                <button class="icon-btn" onclick="document.getElementById('help-modal').close()" type="button" aria-label="Close Guide">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            
            <div id="help-scroll-area" style="color: var(--text-primary);">
                ${HelpContent.warnings}
                ${HelpContent.installation}
                ${HelpContent.scheduling}
                ${HelpContent.logging}
                ${HelpContent.analytics}
                ${HelpContent.mistakes}
                ${HelpContent.settings}
                ${HelpContent.vault}
                ${HelpContent.footer}
            </div>
            
            <div class="action-group modal-actions" style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color);">
                <button class="btn btn-primary" style="width: 100%; font-size: 1.1rem; padding: 1rem;" onclick="document.getElementById('help-modal').close()" type="button">Close Manual</button>
            </div>
        </div>
    `;

    helpModal.showModal();
}

// Attach to window object for global accessibility
window.openHelpModal = openHelpModal;
