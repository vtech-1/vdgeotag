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

    // serverNow(), not new Date() — a supervisor who changes their phone
    // clock should still see the real IST time on screen.
    el.textContent = serverNow().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', // always IST regardless of device timezone
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true,
    });

    // Say so plainly when the device clock is wrong. Without this the
    // corrected clock silently disagrees with the phone's own status bar,
    // which looks like a bug rather than the intended behaviour.
    const warn = document.getElementById('clockSkewWarning');
    if (warn) {
        const skew = deviceClockSkewMin();
        if (isServerTimeKnown() && Math.abs(skew) > 5) {
            warn.textContent = `⚠️ Your phone clock is ${Math.abs(skew)} min ` +
                               `${skew > 0 ? 'ahead' : 'behind'} — official time shown above.`;
            warn.style.display = 'block';
        } else {
            warn.style.display = 'none';
        }
    }
}

// Sets the date/shift read-only field on the report form
function initDateShiftField() {
    const el = document.getElementById('fieldDateShift');
    if (!el) return;
    const date  = formatDateDisplay(serverNow()); // DD/MM/YY
    const shift = detectShiftLabel();
    el.value = `${date}, ${shift}`;
}
