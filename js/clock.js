// ============================================================
// CLOCK.JS — Live clock display + shift auto-detect
// ============================================================

function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
    startAttendanceAutoCloseTimer();
}

// Checks every minute whether an open attendance session has crossed its
// auto-close cutoff (2 PM for Session 1, 11 PM for Session 2), so a
// forgotten manual step is never needed and a session isn't left open
// just because the app was sitting idle.
function startAttendanceAutoCloseTimer() {
    if (typeof checkAutoCloseSessions !== 'function') return;
    checkAutoCloseSessions();
    setInterval(() => {
        if (STATE.currentUser) checkAutoCloseSessions();
    }, 60 * 1000);
}

function updateClock() {
    const el = document.getElementById('clockDisplay');
    if (!el) return;
    el.textContent = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', // always IST regardless of device timezone
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true,
    });
}

// Sets the date/shift read-only field on the report form
function initDateShiftField() {
    const el = document.getElementById('fieldDateShift');
    if (!el) return;
    const now   = new Date();
    const date  = formatDateDisplay(now); // DD/MM/YY
    const shift = detectShiftLabel();
    el.value = `${date}, ${shift}`;
}
