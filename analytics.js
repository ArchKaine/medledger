// ==========================================
// analytics.js - MedLedger Analytics Engine (Calendar View)
// Handles Adherence Heatmap, Gamification Streaks, and Deep-Dives
// ==========================================

function calculateAdherence() {
    if (typeof db === 'undefined' || !db) return; 
    
    const tx = db.transaction(["meds", "logs"], "readonly");
    const medReq = tx.objectStore("meds").getAll();
    const logReq = tx.objectStore("logs").getAll();

    tx.oncomplete = () => {
        try {
            const meds = medReq.result;
            const logs = logReq.result;
            
            const today = new Date();
            today.setHours(0,0,0,0);
            
            // The real-time clock for the "Pending vs Missed" logic
            const realNow = new Date();
            const currentHourStr = realNow.getHours().toString().padStart(2, '0') + ':' + realNow.getMinutes().toString().padStart(2, '0');
            
            const heatmapRangeSelect = document.getElementById('heatmap-range');
            const range = parseInt(heatmapRangeSelect && heatmapRangeSelect.value ? heatmapRangeSelect.value : 30);
            if (isNaN(range)) return; 
            
            let expectedWeeklyDoses = 0;
            let dailyMedDetails = {}; 
            const nonPrnMedIds = new Set();
            const dailyExpectedBlueprint = [];

            // 1. Establish the Baseline Regimen
            meds.forEach(med => {
                if (med.frequency !== "As Needed") {
                    nonPrnMedIds.add(med.id);
                    let timeCount = med.times && med.times.length > 0 ? med.times.length : 1;
                    
                    if (med.frequency === "Weekly") {
                        expectedWeeklyDoses += timeCount; 
                    } else {
                        expectedWeeklyDoses += (timeCount * 7); 
                        
                        // Build the daily blueprint with exact times attached
                        let times = med.times && med.times.length > 0 ? med.times : [null];
                        times.forEach(t => {
                            dailyExpectedBlueprint.push({ name: med.name, time: t });
                        });
                    }
                }
            });

            // 2. Initialize the timeline arrays for the requested range
            for (let i = 0; i < range; i++) {
                const simDate = new Date(today);
                simDate.setDate(today.getDate() - i);
                const dateStr = simDate.toLocaleDateString();
                dailyMedDetails[dateStr] = { expected: [...dailyExpectedBlueprint], taken: [], pending: [], missed: [], retroCount: 0 };
            }

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            let actualTaken7Day = 0;
            const logCountsByDate = {};

            // 3. Tally the Logs
            logs.forEach(log => {
                if (nonPrnMedIds.has(log.medId) && log.status === "taken") {
                    const logDate = new Date(log.dateTaken);
                    const localDateStr = logDate.toLocaleDateString();
                    
                    if (logDate >= sevenDaysAgo) actualTaken7Day++;
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

            // 4. Process Deep Dive Arrays (The "Pending vs Missed" Logic)
            Object.keys(dailyMedDetails).forEach(dateStr => {
                let details = dailyMedDetails[dateStr];
                let takenCopy = [...details.taken];
                const isToday = (dateStr === realNow.toLocaleDateString());

                details.expected.forEach(exp => {
                    const idx = takenCopy.indexOf(exp.name);
                    if (idx > -1) {
                        takenCopy.splice(idx, 1); // Checked off, remove from pool
                    } else {
                        // It was NOT taken. Let's find out why.
                        if (isToday) {
                            if (exp.time !== null && exp.time > currentHourStr) {
                                details.pending.push(exp.name); // Time hasn't happened yet
                            } else if (exp.time === null) {
                                details.pending.push(exp.name); // Unscheduled daily med, due by end of day
                            } else {
                                details.missed.push(exp.name); // Clock passed target time
                            }
                        } else {
                            details.missed.push(exp.name); // Past day, missed forever
                        }
                    }
                });
            });

            // 5. Update 7-Day Percentage Header
            const adherenceScore = document.getElementById('adherence-score');
            const adherenceSubtext = document.getElementById('adherence-subtext');
            
            if (expectedWeeklyDoses === 0) {
                if (adherenceScore) { adherenceScore.textContent = "--%"; adherenceScore.style.color = "var(--text-primary)"; }
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

            // 6. Streak Engine Calculation
            let currentStreak = 0;
            let longestStreak = 0;
            let tempStreak = 0;
            
            for (let i = range - 1; i >= 0; i--) {
                const simDate = new Date(today);
                simDate.setDate(today.getDate() - i);
                const dateStr = simDate.toLocaleDateString();
                const details = dailyMedDetails[dateStr];
                
                if (details && details.expected.length > 0) {
                    if (details.missed.length === 0) {
                        tempStreak++; // A day is "perfect" if there are 0 MISSED meds (pending is fine)
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

            // 7. Render the Calendar Grid
            const grid = document.getElementById('heatmap-grid');
            const detailsPanel = document.getElementById('heatmap-details');
            if (!grid) return; 
            
            grid.innerHTML = ''; 
            if(detailsPanel) detailsPanel.style.display = 'none';

            // Inject the Weekday Headers
            const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            weekdays.forEach(day => {
                const header = document.createElement('div');
                header.className = 'heatmap-header';
                header.textContent = day;
                grid.appendChild(header);
            });

            const startSimDate = new Date(today);
            startSimDate.setDate(today.getDate() - (range - 1));
            
            // Pad the start of the grid so rows always align perfectly with Sunday
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
                
                const details = dailyMedDetails[dateStr];
                let level = 0; 
                
                if (details && details.expected.length > 0) {
                    // Level 2 (Green) is awarded if nothing has been officially "missed" yet
                    if (details.missed.length === 0) level = 2; 
                    else if (details.taken.length > 0) level = 1; // Missed some, took some
                    else level = 0; // Missed some, took none
                } else if (details && details.taken.length > 0) {
                    level = 1; // User took an unscheduled pill on a day with 0 expected
                }

                const cell = document.createElement('div');
                cell.className = `heatmap-cell level-${level}`;
                
                // Inject the Day of the Month into the box
                cell.textContent = targetDate.getDate();

                // Transparent styling for days with zero activity scheduled
                if (details.expected.length === 0 && details.taken.length === 0) {
                    cell.style.background = 'transparent';
                    cell.style.borderColor = 'var(--border-color)';
                }

                // Ghost log styling
                if (details && details.retroCount > 0 && level > 0) {
                    cell.style.opacity = '0.45'; // Slightly faded but keeps the date readable
                }
                
                // Tap-To-Inspect Interactivity
                cell.addEventListener('click', () => {
                    document.querySelectorAll('.heatmap-cell').forEach(c => c.style.outline = 'none');
                    cell.style.outline = '2px solid var(--accent-color)';
                    
                    if (detailsPanel) {
                        let html = `<div style="font-weight: 600; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">${displayStr}</div>`;
                        if (details.expected.length === 0 && details.taken.length === 0) {
                            html += `<div style="color: var(--text-secondary);">No medications scheduled.</div>`;
                        } else {
                            if (details.taken.length > 0) {
                                html += `<div style="margin-bottom: 0.25rem;"><span style="color: var(--success-color);">✔️ Taken:</span> ${[...new Set(details.taken)].join(', ')}</div>`;
                            }
                            if (details.pending.length > 0) {
                                html += `<div style="margin-bottom: 0.25rem;"><span style="color: var(--accent-hover);">⏳ Pending:</span> ${[...new Set(details.pending)].join(', ')}</div>`;
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
        } catch (calcError) {
            console.error("Analytics Engine failed:", calcError);
        }
    };
}
