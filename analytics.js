// ==========================================
// analytics.js - MedLedger Analytics Engine (Date-Math Filtered)
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
            
            const realNow = new Date();
            const currentHourStr = realNow.getHours().toString().padStart(2, '0') + ':' + realNow.getMinutes().toString().padStart(2, '0');
            
            const heatmapRangeSelect = document.getElementById('heatmap-range');
            const range = parseInt(heatmapRangeSelect && heatmapRangeSelect.value ? heatmapRangeSelect.value : 30);
            if (isNaN(range)) return; 
            
            // --- EPOCH CALCULATION ---
            let globalStartDate = new Date(today);
            if (logs.length > 0) {
                const earliestLog = logs.reduce((min, log) => {
                    const logDate = new Date(log.dateTaken);
                    return logDate < min ? logDate : min;
                }, new Date());
                globalStartDate = new Date(earliestLog);
            } else if (meds.length > 0) {
                const earliestMed = meds.reduce((min, med) => {
                    const medDate = med.startDate ? new Date(med.startDate) : new Date();
                    return medDate < min ? medDate : min;
                }, new Date());
                globalStartDate = new Date(earliestMed);
            }
            globalStartDate.setHours(0,0,0,0);
            
            let dailyMedDetails = {}; 
            const nonPrnMedIds = new Set();
            meds.forEach(med => { if (med.frequency !== "As Needed") nonPrnMedIds.add(med.id); });

            // 1. Initialize timeline and apply Date-Math Filters per day
            for (let i = 0; i < range; i++) {
                const simDate = new Date(today);
                simDate.setDate(today.getDate() - i);
                const dateStr = simDate.toLocaleDateString();
                const dayOfWeek = simDate.getDay();
                
                let expectedToday = [];
                let expectedCount = 0;

                // Evaluate every medication against this specific day
                if (simDate >= globalStartDate) {
                    meds.forEach(med => {
                        if (med.frequency === "As Needed") return;

                        let isScheduledToday = true;

                        // Filter 1: Specific Days
                        if (med.frequency === "Specific Days" && med.specificDays) {
                            if (!med.specificDays.includes(dayOfWeek)) isScheduledToday = false;
                        } 
                        // Filter 2: Cyclic (On/Off)
                        else if (med.frequency === "Cyclic" && med.cycleStartDate && med.cycleOn && med.cycleOff) {
                            const cycleStart = new Date(med.cycleStartDate + 'T00:00:00'); // Force local midnight
                            cycleStart.setHours(0,0,0,0);
                            
                            if (simDate < cycleStart) {
                                isScheduledToday = false; // Cycle hasn't started yet
                            } else {
                                const diffTime = Math.abs(simDate - cycleStart);
                                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                                const cycleLength = parseInt(med.cycleOn) + parseInt(med.cycleOff);
                                const dayInCycle = diffDays % cycleLength;
                                
                                // If the day in the cycle is greater than or equal to the "On" phase, it's an "Off" day
                                if (dayInCycle >= parseInt(med.cycleOn)) isScheduledToday = false;
                            }
                        }

                        // Build the expected pill roster for this day
                        if (isScheduledToday) {
                            let times = med.times && med.times.length > 0 ? med.times : [null];
                            expectedCount += times.length;
                            times.forEach(t => {
                                expectedToday.push({ name: med.name, time: t });
                            });
                        }
                    });
                }

                dailyMedDetails[dateStr] = { expected: expectedToday, expectedCount: expectedCount, taken: [], pending: [], missed: [], retroCount: 0 };
            }

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            let actualTaken7Day = 0;

            // 2. Tally the Logs
            logs.forEach(log => {
                if (nonPrnMedIds.has(log.medId) && log.status === "taken") {
                    const logDate = new Date(log.dateTaken);
                    const localDateStr = logDate.toLocaleDateString();
                    
                    if (logDate >= sevenDaysAgo) actualTaken7Day++;
                    
                    if (dailyMedDetails[localDateStr]) {
                        dailyMedDetails[localDateStr].taken.push(log.medName);
                        
                        const sysTime = log.systemLoggedTime || new Date(log.dateTaken).getTime();
                        const claimedTime = new Date(log.dateTaken).getTime();
                        const deltaHours = (sysTime - claimedTime) / (1000 * 60 * 60);
                        if (deltaHours > 4) dailyMedDetails[localDateStr].retroCount++;
                    }
                }
            });

            // 3. Process Pending vs Missed Status
            Object.keys(dailyMedDetails).forEach(dateStr => {
                let details = dailyMedDetails[dateStr];
                let takenCopy = [...details.taken];
                const isToday = (dateStr === realNow.toLocaleDateString());

                details.expected.forEach(exp => {
                    const idx = takenCopy.indexOf(exp.name);
                    if (idx > -1) {
                        takenCopy.splice(idx, 1); 
                    } else {
                        if (isToday) {
                            if (exp.time !== null && exp.time > currentHourStr) details.pending.push(exp.name); 
                            else if (exp.time === null) details.pending.push(exp.name); 
                            else details.missed.push(exp.name); 
                        } else {
                            details.missed.push(exp.name); 
                        }
                    }
                });
            });

            // 4. Update 7-Day Percentage Header
            let expected7DayDoses = 0;
            for (let i = 0; i < 7; i++) {
                const simDate = new Date(today);
                simDate.setDate(today.getDate() - i);
                const dateStr = simDate.toLocaleDateString();
                if (dailyMedDetails[dateStr]) {
                    expected7DayDoses += dailyMedDetails[dateStr].expectedCount;
                }
            }

            const adherenceScore = document.getElementById('adherence-score');
            const adherenceSubtext = document.getElementById('adherence-subtext');
            
            if (expected7DayDoses === 0) {
                if (adherenceScore) { adherenceScore.textContent = "--%"; adherenceScore.style.color = "var(--text-primary)"; }
                if (adherenceSubtext) adherenceSubtext.textContent = "No scheduled medications";
            } else {
                if (adherenceScore && adherenceSubtext) {
                    let percent = Math.min(100, Math.round((actualTaken7Day / expected7DayDoses) * 100));
                    adherenceScore.textContent = `${percent}%`;
                    adherenceSubtext.textContent = `${actualTaken7Day} of ${expected7DayDoses} expected doses (Past 7 Days)`;

                    if (percent >= 90) adherenceScore.style.color = "var(--success-color)";
                    else if (percent >= 75) adherenceScore.style.color = "#f59e0b"; 
                    else adherenceScore.style.color = "var(--danger-color)"; 
                }
            }

            // 5. Streak Engine
            let currentStreak = 0;
            let longestStreak = 0;
            let tempStreak = 0;
            
            for (let i = range - 1; i >= 0; i--) {
                const simDate = new Date(today);
                simDate.setDate(today.getDate() - i);
                if (simDate < globalStartDate) continue;

                const dateStr = simDate.toLocaleDateString();
                const details = dailyMedDetails[dateStr];
                
                if (details && details.expectedCount > 0) {
                    if (details.missed.length === 0) {
                        tempStreak++; 
                        if (tempStreak > longestStreak) longestStreak = tempStreak;
                    } else {
                        if (i !== 0) tempStreak = 0; 
                    }
                }
                if (i === 0) currentStreak = tempStreak;
            }

            const streakEl = document.getElementById('current-streak');
            const maxStreakEl = document.getElementById('longest-streak');
            if (streakEl) streakEl.textContent = currentStreak;
            if (maxStreakEl) maxStreakEl.textContent = longestStreak;

            // 6. Render the Calendar Grid
            const grid = document.getElementById('heatmap-grid');
            const detailsPanel = document.getElementById('heatmap-details');
            if (!grid) return; 
            
            grid.innerHTML = ''; 
            if(detailsPanel) detailsPanel.style.display = 'none';

            const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            weekdays.forEach(day => {
                const header = document.createElement('div');
                header.className = 'heatmap-header';
                header.textContent = day;
                grid.appendChild(header);
            });

            const startSimDate = new Date(today);
            startSimDate.setDate(today.getDate() - (range - 1));
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
                
                if (details && details.expectedCount > 0) {
                    if (details.missed.length === 0) level = 2; 
                    else if (details.taken.length > 0) level = 1; 
                    else level = 0; 
                } else if (details && details.taken.length > 0) {
                    level = 1; 
                }

                const cell = document.createElement('div');
                cell.className = `heatmap-cell level-${level}`;
                cell.textContent = targetDate.getDate();

                if (details.expectedCount === 0 && details.taken.length === 0) {
                    cell.style.background = 'transparent';
                    cell.style.borderColor = 'var(--border-color)';
                }

                if (details && details.retroCount > 0 && level > 0) cell.style.opacity = '0.45'; 
                
                cell.addEventListener('click', () => {
                    document.querySelectorAll('.heatmap-cell').forEach(c => c.style.outline = 'none');
                    cell.style.outline = '2px solid var(--accent-color)';
                    
                    if (detailsPanel) {
                        let html = `<div style="font-weight: 600; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">${displayStr}</div>`;
                        if (details.expectedCount === 0 && details.taken.length === 0) {
                            html += `<div style="color: var(--text-secondary);">No medications scheduled.</div>`;
                        } else {
                            if (details.taken.length > 0) html += `<div style="margin-bottom: 0.25rem;"><span style="color: var(--success-color);">✔️ Taken:</span> ${[...new Set(details.taken)].join(', ')}</div>`;
                            if (details.pending.length > 0) html += `<div style="margin-bottom: 0.25rem;"><span style="color: var(--accent-color);">⏳ Pending:</span> ${[...new Set(details.pending)].join(', ')}</div>`;
                            if (details.missed.length > 0) html += `<div style="margin-bottom: 0.25rem;"><span style="color: var(--danger-color);">❌ Missed:</span> ${[...new Set(details.missed)].join(', ')}</div>`;
                            if (details.retroCount > 0) html += `<div style="color: #f59e0b; font-size: 0.85rem; margin-top: 0.5rem;">⚠️ ${details.retroCount} log(s) backdated</div>`;
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
