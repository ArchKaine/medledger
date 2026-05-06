// ==========================================
// theming.js - MedLedger Theme Creator
// Handles GUI color picking and custom theme storage.
// ==========================================

const THEME_VARS = [
    { name: '--bg-primary', label: 'Primary Background' },
    { name: '--bg-surface', label: 'Surface/Card Background' },
    { name: '--text-primary', label: 'Main Text' },
    { name: '--text-secondary', label: 'Secondary Text' },
    { name: '--accent-color', label: 'Accent/Brand Color' },
    { name: '--border-color', label: 'Border/Divider Color' },
    { name: '--danger-color', label: 'Danger/Alert Color' }
];

window.initThemeCreator = function() {
    const container = document.getElementById('theme-creator-controls');
    if (!container) return;
    container.innerHTML = ''; // Clear

    // 1. Get current computed styles to use as the base
    const styles = getComputedStyle(document.documentElement);

    THEME_VARS.forEach(v => {
        const row = document.createElement('div');
        row.className = 'form-group';
        row.style.marginBottom = '1rem';
        
        // Extract current hex (roughly) or use current value
        const currentVal = styles.getPropertyValue(v.name).trim();
        
        row.innerHTML = `
            <label class="form-label" style="display:flex; justify-content:space-between; align-items:center;">
                ${v.label}
                <input type="color" data-var="${v.name}" value="${colorToHex(currentVal)}" style="border:none; width:40px; height:24px; cursor:pointer;">
            </label>
        `;
        
        container.appendChild(row);
    });

    // 2. Add Live Preview Listeners
    container.querySelectorAll('input[type="color"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const varName = e.target.getAttribute('data-var');
            const val = e.target.value;
            document.documentElement.style.setProperty(varName, val);
            
            // Force "Custom" mode if they start tweaking
            if (document.documentElement.getAttribute('data-theme') !== 'custom') {
                setCustomThemeActive();
            }
        });
    });
};

function setCustomThemeActive() {
    document.documentElement.setAttribute('data-theme', 'custom');
    localStorage.setItem('theme', 'custom');
    if (typeof updateThemeIcon === 'function') updateThemeIcon('custom');
}

window.saveCustomTheme = function() {
    const config = {};
    document.querySelectorAll('#theme-creator-controls input').forEach(input => {
        config[input.getAttribute('data-var')] = input.value;
    });
    
    localStorage.setItem('medledger_custom_theme_data', JSON.stringify(config));
    setCustomThemeActive();
    document.getElementById('theme-creator-modal').close();
    if (typeof showVaultStatus === 'function') showVaultStatus("Custom Theme Saved.", "var(--success-color)");
};

window.resetThemeCreator = function() {
    // Re-initialize from the theme they were using before "custom"
    localStorage.removeItem('medledger_custom_theme_data');
    window.location.reload(); 
};

// Helper: Converts rgb() or named colors to #hex for the color picker
function colorToHex(color) {
    if (color.startsWith('#')) return color;
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = color;
    return ctx.fillStyle;
}
