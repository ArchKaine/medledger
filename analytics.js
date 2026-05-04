// ==========================================
// analytics.js - MedLedger Analytics Engine (V1.0 Compatible)
// Handles Adherence Heatmap, Gamification Streaks, and Deep-Dives
// ==========================================

function calculateAdherence() {
    if (typeof db === 'undefined' || !db) return; // Wait for app.js to initialize DB
    
    const tx = db.transaction(["meds", "logs"], "readonly");
    const medReq = tx.objectStore("meds").getAll();
    const logReq = tx.objectStore("logs").getAll();

    tx.oncomplete = () => {
        try {
            const meds = medReq.result;
            const logs = logReq.result;
            
            const today = new Date();
            today.setHours(0,0,0,0);
            
            const heatmapRangeSelect = document.getElementById('heatmap-range');
            const range = parseInt(heatmapRangeSelect && heatmapRangeSelect.value ? heatmapRangeSelect.value : 90);
            if (isNaN(range)) return; 
            
            let expectedWeeklyDoses = 0;
            let expectedDailyDoses = 0; 
            let dailyMedDetails = {}; 
            const nonPrnMedIds = new Set();
            const expectedMedsList = [];

            // 1. Establish the Baseline Regimen
            meds.forEach(med => {
                if (med.frequency !== "As Needed") {
                    nonPrnMedIds.add(med.id);
                    let timeCount = med.times && med.times.length > 0 ? med.times.length : 1;
                    
                    if (med.frequency === "Weekly") {
                        expectedWeeklyDoses += timeCount; 
                    } else {
                        expectedWeeklyDoses += (timeCount * 7); 
                        expectedDailyDoses += timeCount;
                        for(let d=0; d<timeCount; d++) expectedMedsList.push(med.name);
                    }
                }
            });

            // Initialize daily details array for the requested range
            for (let i = 0; i < range; i++) {
                const simDate = new Date(today);
                simDate.setDate(today.getDate() - i);
                const dateStr = simDate.toLocaleDateString();
                dailyMedDetails[dateStr] = { expected: [...expectedMedsList], taken: [], missed: [], retroCount: 0 };
            }

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            let actualTaken7Day = 0;
            const logCountsByDate = {};

            // 2. Tally the Logs
            logs.forEach(log => {
                if (nonPrnMedIds.has(log.medId) && log.status === "taken") {
                    const logDate = new Date(log.dateTaken);
                    const localDateStr = logDate.toLocaleDateString();
                    
                    if (logDate >= sevenDaysAgo) {
                        actualTaken7Day++;
                    }

                    logCountsByDate[localDateStr] = (logCountsByDate[localDateStr] || 0) + 1;
                    
                    if (dailyMedDetails[localDateStr]) {
                        dailyMedDetails[localDateStr].taken.push(log.medName);
                        
                        // Ghost log tracking
                        const sysTime = log.systemLoggedTime || new Date(log.dateTaken).getTime();
                        const claimedTime = new Date(log.dateTaken).getTime();
                        const deltaHours = (sysTime - claimedTime) / (1000 * 60 * 60);
                        if (deltaHours > 4) {
                            dailyMedDetails[localDateStr].retroCount++;
                        }
                    }
                }
            });

            // 3. Process Deep Dive Arrays (What was missed?)
            Object.keys(dailyMedDetails).forEach(dateStr => {
                let takenCopy = [...dailyMedDetails[dateStr].taken];
                dailyMedDetails[dateStr].expected.forEach(expMed => {
                    const idx = takenCopy.indexOf(expMed);
                    if (idx > -1) takenCopy.splice(idx, 1);
                    else dailyMedDetails[dateStr].missed.push(expMed);
                });
            });

            // 4. Update 7-Day Score Header
            const adherenceScore = document.getElementById('adherence-score');
            const adherenceSubtext = document.getElementById('adherence-subtext');
            
            if (expectedWeeklyDoses === 0) {
                if (adherenceScore) adherenceScore.textContent = "--%";
                if (adherenceScore) adherenceScore.style.color = "var(--text-primary)";
                if (adherenceSubtext) adherenceSubtext.textContent = "No scheduled medications";
                const grid = document.getElementById('heatmap-grid');
                if (grid) grid.innerHTML = '';
                return;
            }

            if (adherenceScore && adherenceSubtext) {
                let percent = Math.min(100, Math.round((actualTaken7Day / expectedWeeklyDoses) * 100));
                adherenceScore.textContent = `${percent}%`;
                adherenceSubtext.textContent = `${actualTaken7Day} of ${expectedWeeklyDoses} expected doses (Past 7 Days)`;

                if (percent >= 90) adherenceScore.style.color = "var(--success-color)";
                else if (percent >= 75) adherenceScore.style.color = "#f59e0b"; 
                else adherenceScore.style.color = "var(--danger-color)"; 
            }

            // 5. Streak Engine
            let currentStreak = 0;
            let longestStreak = 0;
            let tempStreak = 0;
            
            for (let i = range - 1; i >= 0; i--) {
                const simDate = new Date(today);
                simDate.setDate(today.getDate() - i);
                const dateStr = simDate.toLocaleDateString();
                
                const exp = expectedDailyDoses;
                const act = logCountsByDate[dateStr] || 0;
                
                if (exp > 0) {
                    if (act >= exp) {
                        tempStreak++;
                        if (tempStreak > longestStreak) longestStreak = tempStreak;
                    } else {
                        if (i !== 0) tempStreak = 0; // Break streak if not today
                    }
                }
                if (i === 0) currentStreak = tempStreak;
            }

            const streakEl = document.getElementById('current-streak');
            const maxStreakEl = document.getElementById('longest-streak');
            if (streakEl) streakEl.textContent = currentStreak;
            if (maxStreakEl) maxStreakEl.textContent = longestStreak;

            // 6. GitHub-Style Grid Rendering
            const grid = document.getElementById('heatmap-grid');
            const detailsPanel = document.getElementById('heatmap-details');
            if (!grid) return; 
            
            grid.innerHTML = ''; 
            if(detailsPanel) detailsPanel.style.display = 'none'; // Reset details on render

            const startSimDate = new Date(today);
            startSimDate.setDate(today.getDate() - (range - 1));
            
            // Pad the grid so dates align with days of the week (Sun-Sat)
            const startDayOfWeek = startSimDate.getDay();
            for(let p = 0; p < startDayOfWeek; p++) {
                const spacer = document.createElement('div');
                spacer.className = 'heatmap-cell spacer';
                grid.appendChild(spacer);
            }

            for (let i = range - 1; i >= 0; i--) {
                const targetDate = new Date();
                targetDate.setDate(today.getDate() - i);
                const dateStr = targetDate.toLocaleDateString();
                const displayStr = targetDate.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
                
                const count = logCountsByDate[dateStr] || 0;
                const expectedForThisCell = expectedDailyDoses;
                const details = dailyMedDetails[dateStr];
                let level = 0; 
                
                if (expectedForThisCell > 0) {
                    if (count >= expectedForThisCell) level = 2; 
                    else if (count > 0) level = 1; 
                } else if (count > 0 && expectedForThisCell === 0) {
                    level = 1;
                }

                const cell = document.createElement('div');
                cell.className = `heatmap-cell level-${level}`;
                
                if (expectedForThisCell === 0 && count === 0) {
                    cell.style.background = 'transparent';
                    cell.style.border = '1px solid var(--border-color)';
                }

                if (details && details.retroCount > 0 && level > 0) {
                    cell.style.opacity = '0.35'; 
                }
                
                // Tap-To-Inspect Interactivity
                cell.addEventListener('click', () => {
                    document.querySelectorAll('.heatmap-cell').forEach(c => c.style.outline = 'none');
                    cell.style.outline = '2px solid var(--primary-color)';
                    
                    if (detailsPanel) {
                        let html = `<div style="font-weight: 600; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">${displayStr}</div>`;
                        if (expectedForThisCell === 0 && count === 0) {
                            html += `<div style="color: var(--text-secondary);">No medications scheduled.</div>`;
                        } else {
                            if (details.taken.length > 0) {
                                html += `<div style="margin-bottom: 0.25rem;"><span style="color: var(--success-color);">✔️ Taken:</span> ${[...new Set(details.taken)].join(', ')}</div>`;
                            }
                            if (details.missed.length > 0) {
                                html += `<div style="margin-bottom: 0.25rem;"><span style="color: var(--danger-color);">❌ Missed:</span> ${[...new Set(details.missed)].join(', ')}</div>`;
                            }
                            if (details.retroCount > 0) {
                                html += `<div style="color: #f59e0b; font-size: 0.85rem; margin-top: 0.5rem;">⚠️ ${details.retroCount} log(s) backdated</div>`;
                            }
                        }
                        detailsPanel.innerHTML = html;
                        detailsPanel.style.display = 'block';
                    }
                });
                
                grid.appendChild(cell);
            }

            // Auto-scroll the grid to the extreme right (latest day)
            grid.scrollLeft = grid.scrollWidth;

        } catch (calcError) {
            console.error("Analytics Engine failed:", calcError);
        }
    };
}
