// ==========================================
// dev.js - MedLedger Development & Testing Environment
// Contains robust mock data, complex schedules, and procedural analytics generation.
// ==========================================

(function() {
    const generateMockData = () => {
        // --- 1. Generate 10 Stress-Test Medications ---
        const meds = [
            {
                id: 'mock-1',
                name: 'Lisinopril',
                dose: '10mg',
                frequency: 'Morning',
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
                cycleStartDate: new Date(Date.now() - (15 * 86400000)).toISOString().split('T')[0] // Started 15 days ago
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
                inventory: '8', // Purposely low inventory to trigger UI warning
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null
            }
        ];

        // --- 2. Procedurally Generate 30 Days of Logs ---
        const logs = [];
        const now = new Date();
        
        const simulateLog = (dateStr, med, time, isBackdated = false, prnReason = "", driftMinutes = 0) => {
            const logTime = new Date(`${dateStr}T${time}:00`);
            
            // Add slight random drift (lateness/earliness) to test variance analytics
            const systemTime = new Date(logTime.getTime() + (driftMinutes * 60000));
            
            // Don't log future times if the procedural generator hits today's future hours
            if (systemTime > now) return;

            logs.push({
                timestamp: `mock-ts-${med.id}-${dateStr}-${time}-${crypto.randomUUID()}`,
                dateTaken: logTime.toISOString(),
                systemLoggedTime: systemTime.getTime(),
                medId: med.id,
                targetTime: time,
                compositeId: `${med.id}|${time}`,
                medName: med.name,
                status: 'taken',
                prnReason: prnReason,
                isBackdated: isBackdated
            });
        };

        for (let i = 0; i < 30; i++) {
            const targetDate = new Date(now);
            targetDate.setDate(now.getDate() - i);
            const dateStr = targetDate.toISOString().split('T')[0];
            const dayOfWeek = targetDate.getDay();

            // Scenario 1: A Complete Missed Day (Gray block on heatmap)
            if (i === 4 || i === 12 || i === 25) continue;

            // Scenario 2: Partial Days (Yellow block on heatmap)
            const isPartialDay = (i === 2 || i === 8 || i === 18);

            // Log Lisinopril
            if (!isPartialDay || i % 2 === 0) { 
                simulateLog(dateStr, meds[0], '08:00', false, "", 15); 
            }

            // Log Warfarin
            simulateLog(dateStr, meds[2], '20:00', false, "", -5);

            // Log Atorvastatin
            if (!isPartialDay) {
                simulateLog(dateStr, meds[9], '21:00', false, "", 45); 
            }

            // Log Specific Days (Amoxicillin: M, W, F)
            if (meds[4].specificDays.includes(dayOfWeek)) {
                simulateLog(dateStr, meds[4], '12:00', false, "", 0);
            }

            // Scenario 3: Ghost Log (Faded UI Block via Backdating)
            if (i === 5 || i === 14) {
                simulateLog(dateStr, meds[6], '22:00', true); // Melatonin was backdated
            } else {
                simulateLog(dateStr, meds[6], '22:00', false, "", 10);
            }

            // Scenario 4: PRN Emergency usage
            if (i === 1 || i === 9) {
                simulateLog(dateStr, meds[1], '14:30', false, "Post-workout ache", 0);
            }
            if (i === 6) {
                simulateLog(dateStr, meds[7], '09:15', false, "Shortness of breath", 0);
            }

            // Scenario 5: Duplicate Entry Warning
            if (i === 3) {
                simulateLog(dateStr, meds[0], '08:00', false, "", 0); // Original
                
                // The Duplicate
                const dupTime = new Date(`${dateStr}T08:05:00`);
                logs.push({
                    timestamp: `mock-ts-dup-${meds[0].id}`,
                    dateTaken: dupTime.toISOString(),
                    systemLoggedTime: dupTime.getTime(),
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

    // --- State Persistence Connectors ---
    window.syncDevData = function() {
        if (window.MOCK_DATA) {
            localStorage.setItem('medledger_dev_meds', JSON.stringify(window.MOCK_DATA.meds));
            localStorage.setItem('medledger_dev_logs', JSON.stringify(window.MOCK_DATA.logs));
        }
    };

    window.resetDevData = function() {
        window.MOCK_DATA = generateMockData();
        window.syncDevData();
        if(typeof showVaultStatus === 'function') showVaultStatus("Dev Sandbox Reset.", "var(--success-color)");
        if (typeof loadChecklist === 'function') loadChecklist();
        if (typeof refreshHistory === 'function') refreshHistory();
        if (typeof calculateAdherence === 'function') calculateAdherence();
    };

    // Initialize globally
    const savedMeds = localStorage.getItem('medledger_dev_meds');
    const savedLogs = localStorage.getItem('medledger_dev_logs');
    
    if (savedMeds && savedLogs) {
        window.MOCK_DATA = { meds: JSON.parse(savedMeds), logs: JSON.parse(savedLogs) };
    } else {
        window.MOCK_DATA = generateMockData();
    }

    // The Dev Mode Hook
    window.toggleDevMode = function() {
        AppSettings.devMode = !AppSettings.devMode;
        const status = AppSettings.devMode ? "ENABLED (Interactive Sandbox)" : "DISABLED (User Data)";
        if(typeof showVaultStatus === 'function') showVaultStatus(`Dev Mode ${status}`, "var(--accent-color)");
        
        // Ensure data is synced upon toggle
        if (AppSettings.devMode) {
            const checkMeds = localStorage.getItem('medledger_dev_meds');
            if (!checkMeds) { window.MOCK_DATA = generateMockData(); window.syncDevData(); }
        }
        
        if (typeof loadChecklist === 'function') loadChecklist();
        if (typeof refreshHistory === 'function') refreshHistory();
        if (typeof calculateAdherence === 'function') calculateAdherence();
    };

})();
