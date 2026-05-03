# MedLedger

**A zero-knowledge, local-first medication and habit tracker.**

MedLedger was built to solve a specific problem: existing medication trackers either lock your data in corporate walled gardens, monetize your health habits, or require managing complex self-hosted servers. 

MedLedger is a Pure Client-Side Application (PWA) that gives you cryptographic ownership of your own medical data. It runs entirely in your browser, saves to your device's local storage, and optionally syncs an encrypted backup to your personal Google Drive. 

**Live App:** [https://ledger.hephaestusforgeworks.com](https://ledger.hephaestusforgeworks.com)

## Core Philosophy
1. **Zero-Knowledge:** There is no backend database. The developer has absolutely zero access to your data, your schedules, or your encryption passwords.
2. **Local-First:** The app relies on your hardware (via IndexedDB). It works offline and does not require an active internet connection to log your daily regimen.
3. **Bring Your Own Cloud:** Syncing is optional. If enabled, the app uses an AES-GCM encrypted blob and pushes it exclusively to a hidden `drive.appdata` folder in your own Google Drive. 

## Key Features
* **Daily Regimen Checklist:** Scheduled, PRN (As Needed), and time-specific dose tracking.
* **Consistency Analytics:** A visual 7/30/90-day heatmap grid to track adherence.
* **Pill Inventory Tracker:** Optional tracking that warns you when a specific medication is running low.
* **Clinician Reports:** Export clean, printable HTML or CSV records of your adherence history.
* **Local Notifications:** Native browser push notifications for scheduled doses (no central push server required).
* **Data Vault:** End-to-end encryption for local backups and cloud syncing.

## Running Locally for Development
Because MedLedger is a static application, you do not need Node.js, Docker, or a backend server to run it. 
1. Clone the repository.
2. Serve the directory using any basic local web server (e.g., `python -m http.server 8000` or the VS Code Live Server extension).
3. Open `localhost:8000` in your browser.

*Note: To test the Google Drive sync locally, you will need to generate your own Google Cloud OAuth Client ID and update the `GOOGLE_CLIENT_ID` variable in `app.js`.*

## License
Released under the MIT License. See `LICENSE` for details.
