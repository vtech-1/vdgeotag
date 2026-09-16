// ============================================================
// CONFIG.JS — All constants & configuration
// ============================================================

const CONFIG = {
    // ⚠️ TEST BACKEND — points at the test sheet/deployment, not live production.
    // Live values (production, do NOT use until testing is verified):
    //   SHEET_ID:   14R7oeRkUvzQFw9X2L1GLXFLXMkjKSmUyubY0PRWd5hQ
    //   SCRIPT_URL: https://script.google.com/macros/s/AKfycbxXu1Ehl00SrXKSLarB2VsGwEgJmof8iYWMOxeiI5_6rJiddC2G-3A9Az1nXSVyueHQ/exec
    SHEET_ID: '16bzGRT8DaexmceexHC-y7ojRyuxwsyP-zXe63Ov3OAs',
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbx-L2FvELvOzAI_M_Otdj3Yeqroo3YR6sog8U9mPIWMWqJRWng2Sed5h79UgzRlagDp/exec',

    // Reverse geocoding
    GEOAPIFY_KEY: 'a04f244893444e239475e5df2fbd3e23',

    // GPS settings
    GPS_TIMEOUT: 30000,
    GPS_MAX_AGE: 0,

    // Attendance windows (24-hour values)
    MORNING_START:  { h: 5,  m: 0  }, // Punch window opens
    MORNING_END:    { h: 12, m: 0  }, // Punch window closes
    MORNING_ONTIME: { h: 7,  m: 30 }, // On-time deadline  7:30 AM

    EVENING_START:  { h: 16, m: 0  }, // 4:00 PM
    EVENING_END:    { h: 22, m: 30 }, // 10:30 PM
    EVENING_ONTIME: { h: 17, m: 0  }, // 5:00 PM on-time deadline

    // Session
    SESSION_HOURS: 24,

    // Offline fallback seed only — used before the app has ever fetched the
    // live list from the backend (see EMPLOYEES_LS_KEY / getEmployeeList()
    // in this file). The Google Sheet "supervisors" tab is the real source
    // of truth once online; admins add/remove supervisors there via the
    // admin dashboard, no redeploy needed.
    EMPLOYEES: [
        { id: '1047', name: 'City Babu R',     role: 'supervisor' },
        { id: '1947', name: 'Jayaganthan D',    role: 'supervisor' },
        { id: '2227', name: 'KA- Surendar K',   role: 'supervisor' },
        { id: '2336', name: 'Thirumaran M',     role: 'supervisor' },
        { id: '2187', name: 'Ragul V',          role: 'supervisor' },
        { id: '2157', name: 'Saravanan S',      role: 'supervisor' },
        { id: '2234', name: 'Sathyaraj R',      role: 'supervisor' },
        { id: '2343', name: 'Selvakumar U',     role: 'supervisor' },
        { id: '1953', name: 'Tamil Vanan S',    role: 'supervisor' },
        { id: '1054', name: 'Vijayakumar V',    role: 'supervisor' },
        { id: '2308', name: 'Rajeshkumar K',    role: 'supervisor' },
        { id: '2411', name: 'Arjyamuthu K',     role: 'supervisor' },
        { id: '2476', name: 'Arunagiri R',      role: 'supervisor' },
        { id: '2102', name: 'Kannan',           role: 'supervisor' },
        { id: '1346', name: 'Surendran K',      role: 'supervisor' },
        { id: '1003', name: 'Anbazhakan S',     role: 'supervisor' },
        // ADD NEW SUPERVISORS HERE → { id: 'XXXX', name: 'Full Name', role: 'supervisor' },
        { id: '1461', name: 'Admin User 1',     role: 'admin' },
        { id: '1591', name: 'Admin User 2',     role: 'admin' },
        { id: '1857', name: 'Admin User 3',     role: 'admin' },
        { id: '2491', name: 'Admin User 4',     role: 'admin' },
        { id: '1009', name: 'Admin User 5',     role: 'admin' },
        { id: '2524', name: 'Admin User 6',     role: 'admin' },
        { id: '1758', name: 'Admin User 7',     role: 'admin' },
    ],
};

// ============================================================
// Live employee directory — overlays CONFIG.EMPLOYEES with whatever
// was last fetched from the backend "supervisors" sheet, cached in
// localStorage. New supervisors added by the admin become loginable
// as soon as this device fetches the list once (needs internet for
// that first fetch — same requirement as reaching the server at all).
// ============================================================

const EMPLOYEES_LS_KEY = 'vd_employees';

function getEmployeeList() {
    try {
        const cached = JSON.parse(localStorage.getItem(EMPLOYEES_LS_KEY) || 'null');
        if (Array.isArray(cached) && cached.length) return cached;
    } catch (e) { /* fall through to static seed */ }
    return CONFIG.EMPLOYEES;
}

function findEmployee(id) {
    return getEmployeeList().find(e => e.id === String(id));
}

// Refresh the cached list from the backend. Safe to call often — it's a
// cheap GET and just overwrites the local cache on success.
async function refreshEmployeeList() {
    const res = await apiGetEmployees();
    if (res.ok && Array.isArray(res.data?.rows) && res.data.rows.length) {
        localStorage.setItem(EMPLOYEES_LS_KEY, JSON.stringify(res.data.rows));
    }
    return res;
}
