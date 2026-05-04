// ==========================================
// ui.js - MedLedger Interface Manager
// Handles themes, tabs, DOM injection, and status updates
// ==========================================

// --- Theme Logic ---
function updateThemeIcon(theme) {
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (!themeToggleBtn) return;
    
    if (theme === 'light') {
        themeToggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    } else if (theme === 'hc') {
        themeToggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 0 0 20z" fill="currentColor"></path></svg>`;
    } else {
        themeToggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    }
}

function initializeTheme() {
    const rootElement = document.documentElement;
    let savedTheme = localStorage.getItem('theme');
    if (savedTheme !== 'dark' && savedTheme !== 'light' && savedTheme !== 'hc') {
        savedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    rootElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            let currentTheme = rootElement.getAttribute('data-theme');
            let newTheme = currentTheme === 'dark' ? 'light' : (currentTheme === 'light' ? 'hc' : 'dark');
            rootElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }
}

// --- Tab Logic ---
function switchTab(tab) {
    const tabTodayBtn = document.getElementById('tab-today');
    const tabHistoryBtn = document.getElementById('tab-history');
    const dailyScheduleView = document.getElementById('daily-schedule');
    const logHistoryView = document.getElementById('log-history');

    if (tab === 'today') {
        if(tabTodayBtn) tabTodayBtn.classList.add('active');
        if(tabHistoryBtn) tabHistoryBtn.classList.remove('active');
        
        if(dailyScheduleView) {
            dailyScheduleView.classList.remove('hidden-view');
            dailyScheduleView.classList.add('active-view');
        }
        if(logHistoryView) {
            logHistoryView.classList.add('hidden-view');
            logHistoryView.classList.remove('active-view');
        }
    } else {
        if(tabHistoryBtn) tabHistoryBtn.classList.add('active');
        if(tabTodayBtn) tabTodayBtn.classList.remove('active');
        
        if(logHistoryView) {
            logHistoryView.classList.remove('hidden-view');
            logHistoryView.classList.add('active-view');
        }
        if(dailyScheduleView) {
            dailyScheduleView.classList.add('hidden-view');
            dailyScheduleView.classList.remove('active-view');
        }
        if(typeof calculateAdherence === 'function') calculateAdherence(); 
    }
}

// --- Dynamic Form Utilities ---
window.addTimeField = function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const input = document.createElement('input');
    input.type = 'time';
    input.className = 'time-input';
    input.style.cssText = 'padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--bg-primary); color: var(--text-primary); font-family: inherit; margin-top: 0.25rem;';
    container.appendChild(input);
    input.focus(); 
};

function getTimesFromContainer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const inputs = container.querySelectorAll('input[type="time"]');
    let times = [];
    inputs.forEach(input => {
        if (input.value) times.push(input.value);
    });
    return [...new Set(times)].sort();
}

// --- Settings Initializer ---
function initSettings() {
    const toggleBabysitter = document.getElementById('toggle-babysitter');
    const toggleExpert = document.getElementById('toggle-expert');
    const toggleReminders = document.getElementById('toggle-reminders');
    const toggleInventory = document.getElementById('toggle-inventory');
    const newMedInventory = document.getElementById('new-med-inventory');

    if (toggleBabysitter) {
        toggleBabysitter.checked = AppSettings.noBabysitter;
        toggleBabysitter.addEventListener('change', (e) => {
            AppSettings.noBabysitter = e.target.checked;
            localStorage.setItem('cfg_noBabysitter', e.target.checked);
        });
    }

    if (toggleExpert) {
        toggleExpert.checked = AppSettings.expertMode;
        toggleExpert.addEventListener('change', (e) => {
            AppSettings.expertMode = e.target.checked;
            localStorage.setItem('cfg_expertMode', e.target.checked);
            if(typeof loadChecklist === 'function') loadChecklist(); 
        });
    }

    if (toggleInventory) {
        toggleInventory.checked = AppSettings.inventory;
        if(newMedInventory) newMedInventory.style.display = AppSettings.inventory ? 'block' : 'none';
        toggleInventory.addEventListener('change', (e) => {
            AppSettings.inventory = e.target.checked;
            localStorage.setItem('cfg_inventory', e.target.checked);
            if(newMedInventory) newMedInventory.style.display = e.target.checked ? 'block' : 'none';
            if(typeof loadChecklist === 'function') loadChecklist(); 
        });
    }

    if (toggleReminders) {
        toggleReminders.checked = AppSettings.reminders;
        toggleReminders.addEventListener('change', async (e) => {
            AppSettings.reminders = e.target.checked;
            localStorage.setItem('cfg_reminders', e.target.checked);
            
            if (AppSettings.reminders && Notification.permission !== 'granted') {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    e.target.checked = false;
                    AppSettings.reminders = false;
                    localStorage.setItem('cfg_reminders', 'false');
                    alert("Notification permission denied by your browser/OS.");
                }
            }
        });
    }
}

// --- Status & Readability Utilities ---
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

function updateStatus() {
    const statusBar = document.getElementById('status-bar');
    if (!statusBar) return;
    
    const remaining = document.querySelectorAll('#checklist-container .med-checkbox:not(:disabled)');
    const total = document.querySelectorAll('#checklist-container .med-checkbox');
    if (total.length === 0) {
        statusBar.textContent = "Ready.";
        statusBar.className = "status-indicator";
    } else if (remaining.length === 0) {
        statusBar.textContent = "All regimens complete.";
        statusBar.className = "status-indicator complete";
    } else {
        statusBar.textContent = "Pending actions required.";
        statusBar.className = "status-indicator";
    }
}
