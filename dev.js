// ==========================================
// dev.js - MedLedger Development & Testing Environment
// Contains robust mock data, complex schedules, and procedural analytics generation.
// ==========================================

(function() {
    const generateMockData = () => {
        const meds = [
            {
                id: 'mock-1',
                name: 'Lisinopril',
                dose: '10mg',
                frequency: 'Daily',
                times: ['08:00'],
                instructions: 'Take with food for blood pressure.',
                sideEffects: 'Dizziness, dry cough',
                inventory: '25',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null
            },
            {
                id: 'mock-2',
                name: 'Ibuprofen',
                dose: '400mg',
                frequency: 'As Needed',
                times: [],
                instructions: 'Take for pain. Do not exceed 3 doses in 24 hours.',
                sideEffects: 'Stomach upset',
                inventory: '100',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null
            },
            {
                id: 'mock-3',
                name: 'Warfarin',
                dose: '5mg',
                frequency: 'Night',
                times: ['20:00'],
                instructions: 'Take exactly as directed. Monitor vitamin K intake.',
                sideEffects: 'Bleeding risk',
                inventory: '14',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null
            },
            {
                id: 'mock-4',
                name: 'TAM-Infused Nanobiotics',
                dose: '1 Injection',
                frequency: 'Cyclic',
                times: ['09:00'],
                instructions: 'Tunable Adaptive Matter lattice for cellular repair.',
                sideEffects: 'Temporary metallic taste, localized heat',
                inventory: '3',
                specificDays: [],
                cycleOn: 21, cycleOff: 7, 
                cycleStartDate: new Date(Date.now() - (5 * 86400000)).toISOString().split('T')[0] // Started 5 days ago
            },
            {
                id: 'mock-5',
                name: 'Amoxicillin',
                dose: '500mg',
                frequency: 'Specific Days',
                times: ['12:00'],
                instructions: 'Finish entire course. Take with water.',
                sideEffects: 'Nausea, rash',
                inventory: '6',
                specificDays: [1, 3, 5], // Monday, Wednesday, Friday
                cycleOn: null, cycleOff: null, cycleStartDate: null
            },
            {
                id: 'mock-6',
                name: 'Forge-Grade Adrenaline',
                dose: '50cc',
                frequency: 'Morning',
                times: ['07:00'],
                instructions: 'High-yield combat stimulant. Monitor heart rate.',
                sideEffects: 'Hyper-vigilance, tremors',
                inventory: '50',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null
            },
            {
                id: 'mock-7',
                name: 'Melatonin',
                dose: '3mg',
                frequency: 'Night',
                times: ['22:00'],
                instructions: 'Take 30 minutes before sleep cycle.',
                sideEffects: 'Grogginess',
                inventory: '60',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null
            },
            {
                id: 'mock-8',
                name: 'Albuterol Sulfate',
                dose: '2 Puffs',
                frequency: 'As Needed',
                times: [],
                instructions: 'Inhale strictly during respiratory distress.',
                sideEffects: 'Increased heart rate',
                inventory: '200',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null
            },
            {
                id: 'mock-9',
                name: 'Spectre Revenant Rations',
                dose: '1 Pack',
                frequency: 'Weekly',
                times: ['10:00'],
                instructions: 'Nutrient-dense combat rations for deep space ops.',
                sideEffects: 'Digestive adaptation',
                inventory: '12',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null
            },
            {
                id: 'mock-10',
                name: 'Atorvastatin',
                dose: '20mg',
                frequency: 'Daily',
                times: ['21:00'],
                instructions: 'Cholesterol management.',
                sideEffects: 'Muscle ache',
                inventory: '8', // Low inventory trigger
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null
            }
        ];

        const logs = [];
        const now = new Date();
        
        // Procedurally generate the last 7 days of history to populate the heatmap
        for (let i = 0; i < 8; i++) {
            const targetDate = new Date(now);
            targetDate.setDate(now.getDate() - i);
            const dateStr = targetDate.toISOString().split('T')[0];
            const isToday = i === 0;

            // Day - 0 (Today): Partial completion to show pending items
            // Day - 1: Perfect Day
            // Day - 2: Perfect Day
            // Day - 3: Missed a dose (Partial Day)
            // Day - 4: Empty Day (Missed all)
            // Day - 5: Perfect Day + PRN usage + Backdated ghost log
            // Day - 6: Perfect Day + Duplicate Entry

            const simulateLog = (med, time, isBackdated = false, prnReason = "") => {
                const logTime = new Date(`${dateStr}T${time}:00`);
                if (logTime > now && isToday) return; // Don't log future times for today

                logs.push({
                    timestamp: `mock-ts-${i}-${med.id}-${time}-${crypto.randomUUID()}`,
                    dateTaken: logTime.toISOString(),
                    systemLoggedTime: logTime.getTime(),
                    medId: med.id,
                    targetTime: time,
                    compositeId: `${med.id}|${time}`,
                    medName: med.name,
                    status: 'taken',
                    prnReason: prnReason,
                    isBackdated: isBackdated
                });
            };

            // Skip Day 4 completely to simulate a missed day
            if (i === 4) continue;

            // Generate daily standard logs
            if (i !== 3 || isToday) { simulateLog(meds[0], '08:00'); } // Skip Lisinopril on Day 3
            simulateLog(meds[2], '20:00');
            simulateLog(meds[9], '21:00');
            simulateLog(meds[6], '22:00', i === 5); // Make day 5 melatonin backdated (Ghost Log)

            // Generate specific day logs based on the historical date
            if (meds[4].specificDays.includes(targetDate.getDay())) {
                simulateLog(meds[4], '12:00');
            }

            // Generate PRN usage on specific days
            if (i === 5) {
                simulateLog(meds[1], '14:30', false, "Post-workout muscle ache");
                simulateLog(meds[7], '09:15', false, "Shortness of breath");
            }

            // Create a duplicate warning on Day 6
            if (i === 6) {
                simulateLog(meds[0], '08:00');
                // Duplicate entry
                logs.push({
                    timestamp: `mock-ts-dup-${meds[0].id}`,
                    dateTaken: new Date(`${dateStr}T08:05:00`).toISOString(),
                    systemLoggedTime: new Date(`${dateStr}T08:05:00`).getTime(),
                    medId: meds[0].id,
                    targetTime: '08:00',
                    compositeId: `${meds[0].id}|08:00`,
                    medName: meds[0].name,
                    status: 'taken',
                    prnReason: "",
                    isBackdated: false
                });
            }
        }

        return { meds, logs };
    };

    window.MOCK_DATA = generateMockData();

    window.toggleDevMode = function() {
        AppSettings.devMode = !AppSettings.devMode;
        const status = AppSettings.devMode ? "ENABLED (Mock Data Environment)" : "DISABLED (User Data Environment)";
        if(typeof showVaultStatus === 'function') showVaultStatus(`Dev Mode ${status}`, "var(--accent-color)");
        
        // Regenerate fresh logs relative to current time if turned back on
        if (AppSettings.devMode) {
            window.MOCK_DATA = generateMockData();
        }
        
        if (typeof loadChecklist === 'function') loadChecklist();
        if (typeof refreshHistory === 'function') refreshHistory();
    };

})();
