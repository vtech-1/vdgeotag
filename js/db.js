// ============================================================
// DB.JS — IndexedDB (primary) + localStorage (fallback)
//         Stores field reports locally on the device.
//         Attendance is stored separately via attendance.js.
// ============================================================

function initDB() {
    return new Promise((resolve) => {
        if (!('indexedDB' in window)) {
            updateDBStatus();
            resolve();
            return;
        }

        const request = indexedDB.open('vd_geotag_db', 1);

        request.onerror = () => {
            updateDBStatus();
            resolve();
        };

        request.onsuccess = () => {
            STATE.db = request.result;
            updateDBStatus();
            resolve();
        };

        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains('records')) {
                database.createObjectStore('records', { keyPath: 'id' });
            }
        };
    });
}

function updateDBStatus() {
    const el = document.getElementById('dbStatus');
    if (el) el.textContent = STATE.db ? 'Storage: Ready' : '⚠️ Storage: Local only';
}

function dbSave(record) {
    if (STATE.db) {
        try {
            const tx = STATE.db.transaction(['records'], 'readwrite');
            tx.objectStore('records').add(record);
        } catch (e) { /* fall through to localStorage */ }
    }
    lsSave(record);
}

function lsSave(record) {
    try {
        const existing = JSON.parse(localStorage.getItem('vd_geotag_records') || '[]');
        existing.push(record);
        localStorage.setItem('vd_geotag_records', JSON.stringify(existing));
    } catch (e) { console.warn('localStorage full?', e); }
}

async function loadAllRecords() {
    STATE.allRecords = [];

    if (STATE.db) {
        return new Promise((resolve) => {
            try {
                const tx = STATE.db.transaction(['records'], 'readonly');
                const req = tx.objectStore('records').getAll();
                req.onsuccess = () => {
                    STATE.allRecords = req.result.sort(
                        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
                    );
                    resolve();
                };
                req.onerror = () => { loadFromLS(); resolve(); };
            } catch (e) { loadFromLS(); resolve(); }
        });
    } else {
        loadFromLS();
    }
}

function loadFromLS() {
    try {
        STATE.allRecords = JSON.parse(localStorage.getItem('vd_geotag_records') || '[]')
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (e) {
        STATE.allRecords = [];
    }
}

async function clearAllData() {
    if (STATE.db) {
        await new Promise((resolve) => {
            try {
                const tx = STATE.db.transaction(['records'], 'readwrite');
                tx.objectStore('records').clear();
                tx.oncomplete = resolve;
            } catch (e) { resolve(); }
        });
    }
    localStorage.removeItem('vd_geotag_records');
    STATE.allRecords = [];
}
