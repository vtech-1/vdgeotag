// ============================================================
// UTILS.JS — Pure helper functions, no side effects
// ============================================================

function padTwo(n) {
    return String(n).padStart(2, '0');
}

function formatDate(date) {
    return padTwo(date.getDate()) + '-' +
           padTwo(date.getMonth() + 1) + '-' +
           date.getFullYear();
}

// ISO date (YYYY-MM-DD) in IST — required by <input type="date"> and
// used as the canonical key for attendance matching (frontend + backend).
// Forced to IST so the "day" is correct near midnight regardless of the
// device timezone.
function formatDateISO(date) {
    const t = _istParts(date);
    return t.year + '-' + padTwo(t.month) + '-' + padTwo(t.day);
}

// Convert an ISO date (YYYY-MM-DD) to the DD-MM-YYYY form used by
// local-storage attendance keys.
function isoToDMY(iso) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

// Normalize a stored date string (ISO YYYY-MM-DD or DD-MM-YYYY) to ISO.
function isoOrDmyToIso(s) {
    const str = String(s);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    const m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : str;
}

// Display date as DD/MM/YY (short year). Accepts an ISO string
// (YYYY-MM-DD) or a Date object.
function formatDateDisplay(input) {
    let y, mo, d;
    if (input instanceof Date) {
        y = input.getFullYear(); mo = input.getMonth() + 1; d = input.getDate();
    } else {
        const m = String(input).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return String(input);
        y = +m[1]; mo = +m[2]; d = +m[3];
    }
    return padTwo(d) + '/' + padTwo(mo) + '/' + padTwo(y % 100);
}

// ── IST (Asia/Kolkata) helpers ────────────────────────────────
// The app is always used in India. Reading the device clock directly
// (getHours) breaks when the phone's timezone is wrong. These convert
// any Date to the equivalent wall-clock parts in IST, so timestamps
// are correct regardless of device timezone settings.
function _istParts(date) {
    // en-GB gives 24h fields we can parse reliably; timeZone forces IST.
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const p = {};
    fmt.formatToParts(date).forEach(x => { if (x.type !== 'literal') p[x.type] = x.value; });
    // Intl may emit hour "24" at midnight — normalize to 00
    if (p.hour === '24') p.hour = '00';
    return {
        year: +p.year, month: +p.month, day: +p.day,
        hour: +p.hour, minute: +p.minute, second: +p.second,
    };
}

// Time as HH:MM:SS AM/PM (12-hour, IST). Never railway/24-hour.
function formatTime(date) {
    const t = _istParts(date);
    let h = t.hour;
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return padTwo(h) + ':' + padTwo(t.minute) + ':' + padTwo(t.second) + ' ' + ap;
}

// Time as HH:MM AM/PM (12-hour, IST, no seconds).
function formatTimeHM(date) {
    const t = _istParts(date);
    let h = t.hour;
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return padTwo(h) + ':' + padTwo(t.minute) + ' ' + ap;
}

// Full IST timestamp for photo overlay: DD/MM/YY HH:MM:SS AM/PM
function formatTimestampIST(date) {
    const t = _istParts(date);
    return padTwo(t.day) + '/' + padTwo(t.month) + '/' + padTwo(t.year % 100) +
           ' ' + formatTime(date);
}

// Long IST timestamp: "Fri Jul 03 2026 10:42:20 AM"
// Used as the canonical timestamp saved in the sheet + shown in admin.
const _WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const _MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatTimestampLongIST(date) {
    const t = _istParts(date);
    // Weekday needs a real Date in IST — derive from the y/m/d parts (UTC-safe)
    const wd = _WEEKDAYS[new Date(Date.UTC(t.year, t.month - 1, t.day)).getUTCDay()];
    return `${wd} ${_MONTHS[t.month - 1]} ${padTwo(t.day)} ${t.year} ${formatTime(date)}`;
}

function toMinutes(h, m) {
    return h * 60 + m;
}

// Returns current IST time as total minutes since midnight
function nowMinutes() {
    const t = _istParts(new Date());
    return toMinutes(t.hour, t.minute);
}

// Simple non-cryptographic hash for local password storage
// (Real hashing is done server-side in Google Apps Script)
function simpleHash(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return 'vd_' + hash.toString(16);
}

// Generate a random session token
function generateToken() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Download a blob as a file
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Build a Google Maps link from coordinates
function mapsLink(lat, lon) {
    return `https://maps.google.com/maps?q=${lat},${lon}`;
}

// Detect current shift label (for form auto-fill), in IST
function detectShiftLabel() {
    const h = _istParts(new Date()).hour;
    if (h >= 5  && h < 12) return 'Morning';
    if (h >= 12 && h < 16) return 'Afternoon';
    if (h >= 16 && h < 22) return 'Evening';
    return 'Other';
}

// ── HTML escaping ──────────────────────────────────────────────
// Names, VLCC codes and complaint text are free-typed by users and get
// interpolated into innerHTML / onclick attributes when rendering admin
// tables. Without escaping, a name containing a quote or angle bracket
// could break the markup or run as script (stored XSS) — so anything
// user-supplied MUST go through one of these before interpolation.

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// For text placed inside a single-quoted HTML attribute (e.g. an inline
// onclick="fn('...')" argument) — escapes quotes/backslashes so the
// attribute can't be broken out of, on top of the usual HTML escaping.
function escapeAttr(str) {
    return escapeHtml(str).replace(/\\/g, '\\\\');
}

// Escape CSV cell content
function csvCell(val) {
    return '"' + String(val || '').replace(/"/g, '""') + '"';
}

// Build and download a CSV from headers + rows
function exportToCSV(headers, rows, filename) {
    const content = [
        headers.map(csvCell).join(','),
        ...rows.map(row => row.map(csvCell).join(','))
    ].join('\n');
    downloadBlob(new Blob([content], { type: 'text/csv;charset=utf-8;' }), filename);
}
