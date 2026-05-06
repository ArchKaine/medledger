// ==========================================
// ui.js - MedLedger Interface Manager
// Handles themes, tabs, DOM injection, and status updates
// ==========================================

// --- Theme Logic ---
window.updateThemeIcon = function(theme) {
    const iconSlots = document.querySelectorAll('.theme-icon-slot');
    if (iconSlots.length === 0) return;
    
    let svgContent = '';
    let textLabel = '';

    if (theme === 'light') {
        svgContent = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
        textLabel = "Light Mode";
    } else if (theme === 'hc') {
        svgContent = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 0 0 20z" fill="currentColor"></path></svg>`;
        textLabel = "High Contrast";
    } else if (theme === 'old-blood') {
        // Drop/Shield icon for Arcanum aesthetic
        svgContent = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
        textLabel = "Old Blood";
    } else {
        svgContent = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
        textLabel = "Dark Mode";
    }

    iconSlots.forEach(slot => { slot.innerHTML = svgContent; });
    
    const textSlots = document.querySelectorAll('.theme-text-slot');
    textSlots.forEach(slot => { slot.textContent = textLabel; });
}

window.initializeTheme = function() {
    const rootElement = document.documentElement;
    
    // Check both potential storage keys just in case
    let savedTheme = localStorage.getItem('theme') || localStorage.getItem('medledger_theme');
    const themes = ['dark', 'light', 'hc', 'old-blood'];
    
    if (!themes.includes(savedTheme)) {
        savedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    
    rootElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    // Attach to any buttons with the class
    const themeToggleBtns = document.querySelectorAll('.theme-toggle-btn');
    themeToggleBtns.forEach(btn => {
        // Remove old listeners by cloning (standard JS trick)
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', window.cycleTheme);
    });
}

// Global function so inline onclick="cycleTheme()" in HTML also works
window.cycleTheme = function(e) {
    if(e) e.preventDefault();
    const rootElement = document.documentElement;
    const themes = ['dark', 'light', 'hc', 'old-blood'];
    
    let currentTheme = rootElement.getAttribute('data-theme') || 'dark';
    let nextIndex = (themes.indexOf(currentTheme) + 1) % themes.length;
    let newTheme = themes[nextIndex];
    
    rootElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    localStorage.setItem('medledger_theme', newTheme); // Sync both keys
    
    updateThemeIcon(newTheme);
}

// --- Tab Logic ---
window.switchTab = function(tab) {
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

window.getTimesFromContainer = function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const inputs = container.querySelectorAll('input[type="time"]');
    let times = [];
    inputs.forEach(input => {
        if (input.value) times.push(input.value);
    });
    return [...new Set(times)].sort();
}

// --- Complex Scheduling UI Toggles ---
window.handleFrequencyToggle = function(freqId, specificDaysId, cyclicId) {
    const freqSelect = document.getElementById(freqId);
    const specificDaysDiv = document.getElementById(specificDaysId);
    const cyclicDiv = document.getElementById(cyclicId);

    if (!freqSelect || !specificDaysDiv || !cyclicDiv) return;

    freqSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        specificDaysDiv.style.display = (val === 'Specific Days') ? 'block' : 'none';
        cyclicDiv.style.display = (val === 'Cyclic') ? 'flex' : 'none';
    });
}

// --- Settings Initializer ---
window.initSettings = function() {
    const toggleBabysitter = document.getElementById('toggle-babysitter');
    const toggleExpert = document.getElementById('toggle-expert');
    const toggleReminders = document.getElementById('toggle-reminders');
    const toggleInventory = document.getElementById('toggle-inventory');
    const toggleLookup = document.getElementById('toggle-lookup');
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
    
    if (toggleLookup) {
        toggleLookup.checked = AppSettings.clinicalLookups;
        toggleLookup.addEventListener('change', (e) => {
            AppSettings.clinicalLookups = e.target.checked;
            localStorage.setItem('medledger_clinical_lookups', e.target.checked);
        });
    }

    // --- Dev Mode Safety Gate ---
    const toggleDevMenu = document.getElementById('toggle-dev-menu');
    const devMenuWarning = document.getElementById('dev-menu-warning');
    const confirmDevMode = document.getElementById('confirm-dev-mode');
    const navDevModeBtns = document.querySelectorAll('.nav-dev-mode-btn'); 

    if (toggleDevMenu && devMenuWarning && confirmDevMode) {
        const isDevMenuEnabled = localStorage.getItem('cfg_devMenu') === 'true';
        
        toggleDevMenu.checked = isDevMenuEnabled;
        confirmDevMode.checked = isDevMenuEnabled;
        devMenuWarning.style.display = isDevMenuEnabled ? 'block' : 'none';
        navDevModeBtns.forEach(btn => btn.style.display = isDevMenuEnabled ? 'block' : 'none');

        toggleDevMenu.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            devMenuWarning.style.display = isChecked ? 'block' : 'none';
            
            if (!isChecked) {
                confirmDevMode.checked = false;
                navDevModeBtns.forEach(btn => btn.style.display = 'none');
                localStorage.setItem('cfg_devMenu', 'false');
                
                if (window.AppSettings && window.AppSettings.devMode) {
                    if (typeof toggleDevMode === 'function') toggleDevMode();
                }
            }
        });

        confirmDevMode.addEventListener('change', (e) => {
            const isConfirmed = e.target.checked;
            navDevModeBtns.forEach(btn => btn.style.display = isConfirmed ? 'block' : 'none');
            localStorage.setItem('cfg_devMenu', isConfirmed ? 'true' : 'false');
            
            if (!isConfirmed && window.AppSettings && window.AppSettings.devMode) {
                if (typeof toggleDevMode === 'function') toggleDevMode();
            }
        });
    }
}

// --- Status & Readability Utilities ---
window.togglePasswordVisibility = function() {
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

window.showVaultStatus = function(message, color) {
    const vaultStatus = document.getElementById('vault-status');
    if(!vaultStatus) return;
    vaultStatus.textContent = message; 
    vaultStatus.style.color = color;
    setTimeout(() => { vaultStatus.textContent = ''; }, 4000);
}

window.updateStatus = function(takenCount, visibleCount) {
    const mobileStatusBar = document.getElementById('status-bar');
    const desktopStatusBar = document.getElementById('sidebar-status');
    
    let text = "Ready.";
    let className = "status-indicator";

    if (typeof takenCount !== 'undefined' && typeof visibleCount !== 'undefined') {
        if (visibleCount === 0) {
            text = "Ready.";
        } else if (takenCount >= visibleCount) {
            text = "All regimens complete.";
            className = "status-indicator complete";
        } else {
            text = "Pending actions required.";
        }
    } else {
        const remaining = document.querySelectorAll('#checklist-container .med-checkbox:not(:disabled):not(.prn-checkbox)');
        const total = document.querySelectorAll('#checklist-container .med-checkbox:not(.prn-checkbox)');
        if (total.length === 0) {
            text = "Ready.";
        } else if (remaining.length === 0) {
            text = "All regimens complete.";
            className = "status-indicator complete";
        } else {
            text = "Pending actions required.";
        }
    }

    if (mobileStatusBar) {
        mobileStatusBar.textContent = text;
        mobileStatusBar.className = className;
    }
    if (desktopStatusBar) {
        desktopStatusBar.textContent = text;
        desktopStatusBar.className = className;
    }
}

// --- Initialization & Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    setTimeout(initSettings, 100);

    handleFrequencyToggle('new-med-freq', 'new-med-specific-days', 'new-med-cyclic');
    handleFrequencyToggle('edit-med-freq', 'edit-med-specific-days', 'edit-med-cyclic');
    
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    if (btnCancelEdit) {
        btnCancelEdit.addEventListener('click', () => {
            const modal = document.getElementById('edit-med-modal');
            if (modal) modal.close();
        });
    }

    const btnCloseSettings = document.getElementById('btn-close-settings');
    if (btnCloseSettings) {
        btnCloseSettings.addEventListener('click', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.close();
        });
    }

    const btnCloseHelp = document.getElementById('btn-close-help');
    if (btnCloseHelp) {
        btnCloseHelp.addEventListener('click', () => {
            const modal = document.getElementById('help-modal');
            if (modal) modal.close();
        });
    }

    const btnPeekPassword = document.getElementById('btn-peek-password');
    if (btnPeekPassword) {
        btnPeekPassword.addEventListener('click', togglePasswordVisibility);
    }
});
