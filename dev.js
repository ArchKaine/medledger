// ==========================================
// dev.js - MedLedger Development & Testing Environment
// Contains robust mock data, complex schedules, and procedural analytics generation.
// ==========================================

(function() {
    // 1. HARDENED STATE PERSISTENCE
    window.AppSettings = window.AppSettings || {};
    if (localStorage.getItem('cfg_devMode') === 'true') {
        window.AppSettings.devMode = true;
    }

    const generateMockData = () => {
        const meds = [
            {
                id: 'mock-1',
                name: 'Lisinopril',
                dose: '10mg',
                frequency: 'Morning',
                times: ['08:00'],
                profile: 'Primary',
                instructions: 'Take with food for blood pressure.',
                sideEffects: 'Dizziness, dry cough',
                inventory: '25',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null,
                rxNumber: 'RX-77492', doctor: 'Dr. Kael Rostova', pharmacyPhone: '555-0199'
            },
            {
                id: 'mock-2',
                name: 'Ibuprofen',
                dose: '400mg',
                frequency: 'As Needed',
                times: [],
                profile: 'Primary',
                instructions: 'Take for pain. Do not exceed 3 doses in 24 hours.',
                sideEffects: 'Stomach upset',
                inventory: '100',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null,
                rxNumber: '', doctor: '', pharmacyPhone: ''
            },
            {
                id: 'mock-3',
                name: 'Warfarin',
                dose: '5mg',
                frequency: 'Night',
                times: ['20:00'],
                profile: 'Primary',
                instructions: 'Take exactly as directed. Monitor vitamin K intake.',
                sideEffects: 'Bleeding risk',
                inventory: '14',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null,
                rxNumber: 'RX-33291', doctor: 'Dr. Kuojin Thorne', pharmacyPhone: '555-0144'
            },
            {
                id: 'mock-4',
                name: 'TAM-Infused Nanobiotics',
                dose: '1 Injection',
                frequency: 'Cyclic',
                times: ['09:00'],
                profile: 'Primary',
                instructions: 'Tunable Adaptive Matter lattice for cellular repair.',
                sideEffects: 'Temporary metallic taste, localized heat',
                inventory: '3',
                specificDays: [],
                cycleOn: 21, cycleOff: 7, 
                cycleStartDate: new Date(Date.now() - (15 * 86400000)).toISOString().split('T')[0],
                rxNumber: 'HFW-SEC-01', doctor: 'Hephaestus Medical Ops', pharmacyPhone: ''
            },
            {
                id: 'mock-5',
                name: 'Amoxicillin',
                dose: '500mg',
                frequency: 'Specific Days',
                times: ['12:00'],
                profile: 'Michele',
                instructions: 'Finish entire course. Take with water.',
                sideEffects: 'Nausea, rash',
                inventory: '6',
                specificDays: [1, 3, 5], 
                cycleOn: null, cycleOff: null, cycleStartDate: null,
                rxNumber: 'RX-55112', doctor: 'Dr. Kael Rostova', pharmacyPhone: '555-0199'
            },
            {
                id: 'mock-6',
                name: 'Forge-Grade Adrenaline',
                dose: '50cc',
                frequency: 'Morning',
                times: ['07:00'],
                profile: 'Primary',
                instructions: 'High-yield combat stimulant. Monitor heart rate.',
                sideEffects: 'Hyper-vigilance, tremors',
                inventory: '50',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null,
                rxNumber: '', doctor: '', pharmacyPhone: ''
            },
            {
                id: 'mock-7',
                name: 'Melatonin',
                dose: '3mg',
                frequency: 'Night',
                times: ['22:00'],
                profile: 'Primary',
                instructions: 'Take 30 minutes before sleep cycle.',
                sideEffects: 'Grogginess',
                inventory: '60',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null,
                rxNumber: '', doctor: '', pharmacyPhone: ''
            },
            {
                id: 'mock-8',
                name: 'Albuterol Sulfate',
                dose: '2 Puffs',
                frequency: 'As Needed',
                times: [],
                profile: 'Primary',
                instructions: 'Inhale strictly during respiratory distress.',
                sideEffects: 'Increased heart rate',
                inventory: '200',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null,
                rxNumber: 'RX-11002', doctor: 'Dr. Kuojin Thorne', pharmacyPhone: '555-0144'
            },
            {
                id: 'mock-9',
                name: 'Spectre Revenant Rations',
                dose: '1 Pack',
                frequency: 'Weekly',
                times: ['10:00'],
                profile: 'Mischief',
                instructions: 'Nutrient-dense combat rations for deep space ops.',
                sideEffects: 'Digestive adaptation',
                inventory: '12',
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null,
                rxNumber: '', doctor: '', pharmacyPhone: ''
            },
            {
                id: 'mock-10',
                name: 'Atorvastatin',
                dose: '20mg',
                frequency: 'Daily',
                times: ['21:00'],
                profile: 'Primary',
                instructions: 'Cholesterol management.',
                sideEffects: 'Muscle ache',
                inventory: '8', 
                specificDays: [],
                cycleOn: null, cycleOff: null, cycleStartDate: null,
                rxNumber: 'RX-99210', doctor: 'Dr. Kael Rostova', pharmacyPhone: '555-0199' // Triggers UI warning banner
            }
        ];

        const logs = [];
        const now = new Date();
        
        const simulateLog = (dateStr, med, time, isBackdated = false, prnReason = "", driftMinutes = 0, efficacy = "") => {
            const logTime = new Date(`${dateStr}T${time}:00`);
            const systemTime = new Date(logTime.getTime() + (driftMinutes * 60000));
            if (systemTime > now) return;

            logs.push({
                timestamp: `mock-ts-${med.id}-${dateStr}-${time}-${crypto.randomUUID()}`,
                dateTaken: logTime.toISOString(),
                logicalDate: dateStr,
                profile: med.profile,
                systemLoggedTime: systemTime.getTime(),
                medId: med.id,
                targetTime: time,
                compositeId: `${med.id}|${time}`,
                medName: med.name,
                status: 'taken',
                prnReason: prnReason,
                efficacy: efficacy,
                isBackdated: isBackdated
            });
        };

        for (let i = 0; i < 30; i++) {
            const targetDate = new Date(now);
            targetDate.setDate(now.getDate() - i);
            const dateStr = targetDate.toISOString().split('T')[0];
            const dayOfWeek = targetDate.getDay();

            if (i === 4 || i === 12 || i === 25) continue;

            const isPartialDay = (i === 2 || i === 8 || i === 18);

            if (!isPartialDay || i % 2 === 0) { 
                simulateLog(dateStr, meds[0], '08:00', false, "", 15); 
            }

            simulateLog(dateStr, meds[2], '20:00', false, "", -5);

            if (!isPartialDay) {
                simulateLog(dateStr, meds[9], '21:00', false, "", 45); 
            }

            if (meds[4].specificDays.includes(dayOfWeek)) {
                simulateLog(dateStr, meds[4], '12:00', false, "", 0);
            }

            if (i === 5 || i === 14) {
                simulateLog(dateStr, meds[6], '22:00', true); 
            } else {
                simulateLog(dateStr, meds[6], '22:00', false, "", 10);
            }

            if (i === 1 || i === 9) {
                simulateLog(dateStr, meds[1], '14:30', false, "Post-workout ache", 0, "Pain subsided after 45m");
            }
            if (i === 6) {
                simulateLog(dateStr, meds[7], '09:15', false, "Shortness of breath", 0, "Airway cleared immediately");
            }

            if (i === 3) {
                simulateLog(dateStr, meds[0], '08:00', false, "", 0); 
                
                const dupTime = new Date(`${dateStr}T08:05:00`);
                logs.push({
                    timestamp: `mock-ts-dup-${meds[0].id}`,
                    dateTaken: dupTime.toISOString(),
                    logicalDate: dateStr,
                    profile: meds[0].profile,
                    systemLoggedTime: dupTime.getTime(),
                    medId: meds[0].id,
                    targetTime: '08:00',
                    compositeId: `${meds[0].id}|08:00`,
                    medName: meds[0].name,
                    status: 'taken',
                    prnReason: "",
                    efficacy: "",
                    isBackdated: false
                });
            }
        }

        return { meds, logs };
    };

    // 2. State Synchronization Functions
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
        if (typeof populateProfileDropdowns === 'function') populateProfileDropdowns();
        if (typeof loadChecklist === 'function') loadChecklist();
        if (typeof refreshHistory === 'function') refreshHistory();
        if (typeof calculateAdherence === 'function') calculateAdherence();
    };

    const savedMeds = localStorage.getItem('medledger_dev_meds');
    const savedLogs = localStorage.getItem('medledger_dev_logs');
    
    if (savedMeds && savedLogs) {
        window.MOCK_DATA = { meds: JSON.parse(savedMeds), logs: JSON.parse(savedLogs) };
    } else {
        window.MOCK_DATA = generateMockData();
    }

    // 3. SECURE DEV MODE TOGGLE
    window.toggleDevMode = function() {
        window.AppSettings.devMode = !window.AppSettings.devMode;
        
        localStorage.setItem('cfg_devMode', window.AppSettings.devMode);
        
        const status = window.AppSettings.devMode ? "ENABLED (Interactive Sandbox)" : "DISABLED (User Data)";
        if(typeof showVaultStatus === 'function') showVaultStatus(`Dev Mode ${status}`, "var(--accent-color)");
        
        if (window.AppSettings.devMode) {
            const checkMeds = localStorage.getItem('medledger_dev_meds');
            if (!checkMeds) { window.MOCK_DATA = generateMockData(); window.syncDevData(); }
        }
        
        if (typeof populateProfileDropdowns === 'function') populateProfileDropdowns();
        if (typeof loadChecklist === 'function') loadChecklist();
        if (typeof refreshHistory === 'function') refreshHistory();
        if (typeof calculateAdherence === 'function') calculateAdherence(); 
    };

})();
