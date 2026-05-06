// ==========================================
// analytics.js - MedLedger Analytics Engine
// Handles Heatmaps, Streaks, and Profile-Aware Predictive Insights
// ==========================================

function calculateAdherence() {
    if (typeof db === 'undefined' || !db) { 
        console.warn("Analytics: DB not ready yet, retrying in 200ms");
        setTimeout(calculateAdherence, 200);
        return; 
    }
    
    const tx = db.transaction(["meds", "logs"], "readonly");
    const medReq = tx.objectStore("meds").getAll();
    const logReq = tx.objectStore("logs").getAll();

    tx.oncomplete = () => {
        try {
            // 1. DATA RETRIEVAL & PROFILE ISOLATION
            const rawMeds = (typeof AppSettings !== 'undefined' && AppSettings.devMode && window.MOCK_DATA) 
                ? window.MOCK_DATA.meds 
                : (medReq.result || []);
                
            const rawLogs = (typeof AppSettings !== 'undefined' && AppSettings.devMode && window.MOCK_DATA) 
                ? window.MOCK_DATA.logs 
                : (logReq.result || []);

            // V5 Filter: Only process data belonging to the currently active profile
            const activeProfile = (typeof AppSettings !== 'undefined') ? AppSettings.activeProfile : 'Primary';
            const meds = rawMeds.filter(m => (m.profile || 'Primary') === activeProfile);
            const logs = rawLogs.filter(l => (l.profile || 'Primary') === activeProfile);
            
            const today = new Date();
            today.setHours(0,0,0,0);
            
            const realNow = new Date();
            const currentHourStr = realNow.getHours().toString().padStart(2, '0') + ':' + realNow.getMinutes().toString().padStart(2, '0');
            
            const heatmapRangeSelect = document.getElementById('heatmap-range');
            const range = parseInt(heatmapRangeSelect && heatmapRangeSelect.value ? heatmapRangeSelect.value : 30);
            if (isNaN(range)) return; 
            
            // --- 2. EPOCH CALCULATION ---
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

            // --- 3. INSIGHTS PREP VARIABLES ---
            let driftSum = 0;
            let driftCount = 0;
            let timeBlocks = { morning: { t: 0, e: 0 }, afternoon: { t: 0, e: 0 }, evening: { t: 0, e: 0 } };

            // --- 4. TIMELINE INITIALIZATION ---
            for (let i = 0; i < range; i++) {
                const simDate = new Date(today);
                simDate.setDate(today.getDate() - i);
                const dateStr = simDate.toLocaleDateString();
                const dayOfWeek = simDate.getDay();
                
                let expectedToday = [];
                let expectedCount = 0;

                if (simDate >= globalStartDate) {
                    meds.forEach(med => {
                        if (med.frequency === "As Needed") return;

                        let isScheduledToday = true;
                        if (med.frequency === "Specific Days" && med.specificDays) {
                            if (!med.specificDays.includes(dayOfWeek)) isScheduledToday = false;
                        } 
                        else if (med.frequency === "Cyclic" && med.cycleStartDate && med.cycleOn && med.cycleOff) {
                            const cycleStart = new Date(med.cycleStartDate + 'T00:00:00');
                            cycleStart.setHours(0,0,0,0);
                            if (simDate < cycleStart) isScheduledToday = false;
                            else {
                                const diffDays = Math.floor(Math.abs(simDate - cycleStart) / (1000 * 60 * 60 * 24));
                                const cycleLength = parseInt(med.cycleOn) + parseInt(med.cycleOff);
                                if ((diffDays % cycleLength) >= parseInt(med.cycleOn)) isScheduledToday = false;
                            }
                        }

                        if (isScheduledToday) {
                            let times = med.times && med.times.length > 0 ? med.times : [null];
                            expectedCount += times.length;
                            times.forEach(t => {
                                expectedToday.push({ name: med.name, time: t, id: med.id });
                            });
                        }
                    });
                }
                dailyMedDetails[dateStr] = { expected: expectedToday, expectedCount: expectedCount, taken: [], pending: [], missed: [], retroCount: 0 };
            }

            // --- 5. TALLY LOGS & CALC DRIFT ---
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            let actualTaken7Day = 0;

            logs.forEach(log => {
                const logDate = new Date(log.dateTaken);
                const localDateStr = logDate.toLocaleDateString();
                
                const matchDate = log.logicalDate ? new Date(log.logicalDate + 'T12:00:00').toLocaleDateString() : localDateStr;

                if (nonPrnMedIds.has(log.medId) && log.status === "taken") {
                    if (logDate >= sevenDaysAgo) actualTaken7Day++;
                }

                if (dailyMedDetails[matchDate]) {
                    dailyMedDetails[matchDate].taken.push(log.medName);
                    const sysTime = log.systemLoggedTime || new Date(log.dateTaken).getTime();
                    const claimedTime = new Date(log.dateTaken).getTime();
                    const deltaHours = (sysTime - claimedTime) / (1000 * 60 * 60);
                    if (deltaHours > 4) dailyMedDetails[matchDate].retroCount++;
                }

                if (log.targetTime && log.systemLoggedTime) {
                    const [sH, sM] = log.targetTime.split(':').map(Number);
                    const scheduled = new Date(log.dateTaken);
                    scheduled.setHours(sH, sM, 0);
                    const actual = new Date(log.systemLoggedTime);
                    const diffMin = (actual - scheduled) / (1000 * 60);
                    if (Math.abs(diffMin) < 360) {
                        driftSum += diffMin;
                        driftCount++;
                    }
                }
            });

            // --- 6. PROCESS STATUS & TIME BLOCKS ---
            Object.keys(dailyMedDetails).forEach(dateStr => {
                let details = dailyMedDetails[dateStr];
                let takenCopy = [...details.taken];
                const isToday = (dateStr === realNow.toLocaleDateString());

                details.expected.forEach(exp => {
                    const idx = takenCopy.indexOf(exp.name);
                    
                    let block = "evening";
                    if (exp.time) {
                        const h = parseInt(exp.time.split(':')[0]);
                        if (h < 12) block = "morning";
                        else if (h < 17) block = "afternoon";
                    }
                    timeBlocks[block].e++;

                    if (idx > -1) {
                        takenCopy.splice(idx, 1);
                        timeBlocks[block].t++;
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

            // --- 7. RENDER ALL COMPONENTS ---
            updateAdherenceHeader(dailyMedDetails, today, globalStartDate, actualTaken7Day);
            updateStreakDisplay(dailyMedDetails, range, today, globalStartDate);
            renderInsights(meds, logs, driftSum, driftCount, timeBlocks);
            renderGrid(dailyMedDetails, range, today, realNow, currentHourStr);

        } catch (calcError) {
            console.error("Analytics Engine failed:", calcError);
        }
    };
}

// --- SUB-RENDERING FUNCTIONS ---

function updateAdherenceHeader(dailyMedDetails, today, globalStartDate, actualTaken7Day) {
    let expected7DayDoses = 0;
    for (let i = 0; i < 7; i++) {
        const simDate = new Date(today);
        simDate.setDate(today.getDate() - i);
        const dateStr = simDate.toLocaleDateString();
        if (dailyMedDetails[dateStr]) expected7DayDoses += dailyMedDetails[dateStr].expectedCount;
    }

    const adherenceScore = document.getElementById('adherence-score');
    const adherenceSubtext = document.getElementById('adherence-subtext');
    
    if (expected7DayDoses === 0) {
        if (adherenceScore) { adherenceScore.textContent = "--%"; adherenceScore.style.color = "var(--text-primary)"; }
        if (adherenceSubtext) adherenceSubtext.textContent = "No scheduled medications";
    } else if (adherenceScore && adherenceSubtext) {
        let percent = Math.min(100, Math.round((actualTaken7Day / expected7DayDoses) * 100));
        adherenceScore.textContent = `${percent}%`;
        adherenceSubtext.textContent = `${actualTaken7Day} of ${expected7DayDoses} expected doses (Past 7 Days)`;
        if (percent >= 90) adherenceScore.style.color = "var(--success-color)";
        else if (percent >= 75) adherenceScore.style.color = "#f59e0b"; 
        else adherenceScore.style.color = "var(--danger-color)"; 
    }
}

function updateStreakDisplay(dailyMedDetails, range, today, globalStartDate) {
    let currentStreak = 0, longestStreak = 0, tempStreak = 0;
    for (let i = range - 1; i >= 0; i--) {
        const simDate = new Date(today);
        simDate.setDate(today.getDate() - i);
        if (simDate < globalStartDate) continue;
        const details = dailyMedDetails[simDate.toLocaleDateString()];
        if (details && details.expectedCount > 0) {
            if (details.missed.length === 0) {
                tempStreak++; 
                if (tempStreak > longestStreak) longestStreak = tempStreak;
            } else { if (i !== 0) tempStreak = 0; }
        }
        if (i === 0) currentStreak = tempStreak;
    }
    const streakEl = document.getElementById('current-streak');
    const maxStreakEl = document.getElementById('longest-streak');
    if (streakEl) streakEl.textContent = currentStreak;
    if (maxStreakEl) maxStreakEl.textContent = longestStreak;
}

function renderInsights(meds, logs, driftSum, driftCount, timeBlocks) {
    const container = document.getElementById('analytics-insights');
    if (!container) return;
    container.innerHTML = '';

    // 1. PRN Efficacy Insight
    const efficacyLogs = logs.filter(l => l.efficacy);
    if (efficacyLogs.length > 0) {
        const lastEff = efficacyLogs[0];
        const effCard = document.createElement('div');
        effCard.className = 'insight-card';
        effCard.style.borderLeft = '4px solid var(--success-color)';
        effCard.innerHTML = `
            <div class="insight-title">Treatment Insight: ${lastEff.medName}</div>
            <div class="insight-value">✨ Latest Outcome</div>
            <div class="insight-detail">"${lastEff.efficacy}"</div>
        `;
        container.appendChild(effCard);
    }

    // 2. Supply Forecast - CORRECTED TIERED MATH
    const inventoryMeds = meds.filter(m => AppSettings.inventory && parseInt(m.inventory) > 0);
    inventoryMeds.forEach(med => {
        let dailyBurnRate = 0;
        const dosesPerDay = Math.max(1, med.times?.length || 1);

        if (med.frequency === "As Needed") {
            // Use historical 14-day average for variable PRN usage
            const last14Days = logs.filter(l => l.medId === med.id && (new Date() - new Date(l.dateTaken)) < (14 * 86400000));
            dailyBurnRate = Math.max(last14Days.length / 14, 0.1); 
        } else if (med.frequency === "Specific Days") {
            // Scheduled: (doses per day * active days per week) / 7
            dailyBurnRate = (dosesPerDay * (med.specificDays?.length || 0)) / 7;
        } else if (med.frequency === "Cyclic") {
            // Scheduled: (doses per day * days on) / total cycle duration
            const cycleLen = (parseInt(med.cycleOn) || 1) + (parseInt(med.cycleOff) || 0);
            dailyBurnRate = (dosesPerDay * (parseInt(med.cycleOn) || 1)) / cycleLen;
        } else if (med.frequency === "Weekly") {
            dailyBurnRate = dosesPerDay / 7;
        } else {
            // Daily / Morning / Night: Burn rate is simple doses per day
            dailyBurnRate = dosesPerDay;
        }

        const daysLeft = Math.round(parseInt(med.inventory) / dailyBurnRate);
        const estDate = new Date(); 
        estDate.setDate(estDate.getDate() + daysLeft);

        const card = document.createElement('div');
        card.className = 'insight-card';
        card.innerHTML = `
            <div class="insight-title">Supply Forecast: ${med.name}</div>
            <div class="insight-value">~${daysLeft} Days Left</div>
            <div class="insight-detail">Est. Depletion: ${estDate.toLocaleDateString(undefined, {month:'short', day:'numeric'})}</div>
        `;
        container.appendChild(card);
    });

    if (driftCount > 0) {
        const avgDrift = Math.round(driftSum / driftCount);
        const card = document.createElement('div');
        card.className = 'insight-card';
        const direction = avgDrift > 0 ? "late" : "early";
        card.innerHTML = `
            <div class="insight-title">Schedule Variance</div>
            <div class="insight-value">${Math.abs(avgDrift)}m ${direction}</div>
            <div class="insight-detail">Average drift from target time</div>
        `;
        container.appendChild(card);
    }

    const blocksCard = document.createElement('div');
    blocksCard.className = 'insight-card';
    blocksCard.style.gridColumn = "1 / -1";
    blocksCard.innerHTML = `<div class="insight-title">Consistency by Time of Day</div>`;
    ['morning', 'afternoon', 'evening'].forEach(b => {
        const stats = timeBlocks[b];
        const perc = stats.e > 0 ? Math.round((stats.t / stats.e) * 100) : 0;
        blocksCard.innerHTML += `
            <div style="margin-top:0.5rem;">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                    <span style="text-transform:capitalize;">${b}</span>
                    <span>${perc}%</span>
                </div>
                <div class="block-bar-container"><div class="block-bar-fill" style="width:${perc}%;"></div></div>
            </div>`;
    });
    container.appendChild(blocksCard);
}

function renderGrid(dailyMedDetails, range, today, realNow, currentHourStr) {
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
    for(let p = 0; p < startSimDate.getDay(); p++) {
        const spacer = document.createElement('div');
        spacer.className = 'heatmap-cell spacer';
        grid.appendChild(spacer);
    }

    for (let i = range - 1; i >= 0; i--) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() - i);
        const dateStr = targetDate.toLocaleDateString();
        const details = dailyMedDetails[dateStr];
        let level = 0; 
        
        if (details && details.expectedCount > 0) {
            if (details.missed.length === 0) level = 2; 
            else if (details.taken.length > 0) level = 1; 
        } else if (details && details.taken.length > 0) level = 1;

        const cell = document.createElement('div');
        cell.className = `heatmap-cell level-${level}`;
        cell.textContent = targetDate.getDate();

        if (!details || (details.expectedCount === 0 && details.taken.length === 0)) {
            cell.style.background = 'transparent';
            cell.style.borderColor = 'var(--border-color)';
        }
        if (details && details.retroCount > 0 && level > 0) cell.style.opacity = '0.45'; 
        
        cell.addEventListener('click', () => {
            document.querySelectorAll('.heatmap-cell').forEach(c => c.style.outline = 'none');
            cell.style.outline = '2px solid var(--accent-color)';
            if (detailsPanel) {
                let html = `<div style="font-weight: 600; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">${targetDate.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</div>`;
                if (!details || (details.expectedCount === 0 && details.taken.length === 0)) {
                    html += `<div style="color: var(--text-secondary);">No medications scheduled.</div>`;
                } else {
                    if (details.taken.length > 0) html += `<div style="margin-bottom: 0.25rem;"><span style="color: var(--success-color);">✔️ Taken:</span> ${[...new Set(details.taken)].join(', ')}</div>`;
                    if (details.pending.length > 0) html += `<div style="margin-bottom: 0.25rem;"><span style="color: var(--accent-color);">⏳ Pending:</span> ${[...new Set(details.pending)].join(', ')}</div>`;
                    if (details.missed.length > 0) html += `<div style="margin-bottom: 0.25rem;"><span style="color: var(--danger-color);">❌ Missed:</span> ${[...new Set(details.missed)].join(', ')}</div>`;
                }
                detailsPanel.innerHTML = html;
                detailsPanel.style.display = 'block';
            }
        });
        grid.appendChild(cell);
    }
}
