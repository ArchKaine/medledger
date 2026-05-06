// ==========================================
// theming.js - MedLedger Theme Creator
// Handles GUI color picking, live swatches, and custom theme storage.
// ==========================================

const THEME_VARS = [
    { name: '--bg-primary', label: 'App Background' },
    { name: '--bg-surface', label: 'Card / Surface' },
    { name: '--text-primary', label: 'Main Heading Text' },
    { name: '--text-secondary', label: 'Muted / Sidebar Text' },
    { name: '--accent-color', label: 'Primary Accent' },
    { name: '--accent-hover', label: 'Accent Hover State' },
    { name: '--border-color', label: 'Border / Divider' },
    { name: '--success-color', label: 'Success / Complete' },
    { name: '--danger-color', label: 'Danger / Alert' }
];

window.initThemeCreator = function() {
    const container = document.getElementById('theme-creator-controls');
    if (!container) return;
    container.innerHTML = ''; 

    const styles = getComputedStyle(document.documentElement);

    THEME_VARS.forEach(v => {
        const row = document.createElement('div');
        row.className = 'form-group';
        row.style.marginBottom = '1.25rem';
        
        const currentVal = styles.getPropertyValue(v.name).trim();
        const hexVal = colorToHex(currentVal);
        
        // UI: Swatch-Button Design
        row.innerHTML = `
            <label class="form-label" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                <span style="font-weight: 500;">${v.label}</span>
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <code style="font-size:0.7rem; opacity:0.6;">${hexVal.toUpperCase()}</code>
                    <input type="color" data-var="${v.name}" value="${hexVal}" 
                        style="appearance:none; -webkit-appearance:none; border:2px solid var(--border-color); 
                        width:50px; height:32px; cursor:pointer; background:none; border-radius:4px; padding:2px;">
                </div>
            </label>
        `;
        
        container.appendChild(row);
    });

    // 2. Add Live Preview & Swatch Sync
    container.querySelectorAll('input[type="color"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const varName = e.target.getAttribute('data-var');
            const val = e.target.value;
            document.documentElement.style.setProperty(varName, val);
            
            // Update the hex code text next to the swatch
            const codeLabel = e.target.previousElementSibling;
            if(codeLabel) codeLabel.textContent = val.toUpperCase();
            
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
    updateLaunchButtonPreview(); // Refresh the main button preview
};

window.resetThemeCreator = function() {
    localStorage.removeItem('medledger_custom_theme_data');
    window.location.reload(); 
};

// Helper: Visual Preview for the Launch Button
window.updateLaunchButtonPreview = function() {
    const previewContainer = document.getElementById('theme-btn-preview');
    if (!previewContainer) return;
    const styles = getComputedStyle(document.documentElement);
    
    // Create a 3-stripe gradient of the current theme
    const colors = [
        styles.getPropertyValue('--bg-primary').trim(),
        styles.getPropertyValue('--accent-color').trim(),
        styles.getPropertyValue('--text-primary').trim()
    ];
    previewContainer.style.background = `linear-gradient(90deg, ${colors[0]} 33%, ${colors[1]} 33% 66%, ${colors[2]} 66%)`;
};

function colorToHex(color) {
    if (color.startsWith('#')) return color;
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.width = ctx.height = 1;
    const context = ctx.getContext('2d');
    context.fillStyle = color;
    context.fillRect(0,0,1,1);
    const d = context.getImageData(0,0,1,1).data;
    return "#" + ((1 << 24) + (d[0] << 16) + (d[1] << 8) + d[2]).toString(16).slice(1).split('.')[0];
}

// Ensure launch button preview updates on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateLaunchButtonPreview, 500);
});
