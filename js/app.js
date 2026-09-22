// ============================================================
// APP.JS — Bootstrap: called once when DOM is ready.
//          Initializes all modules in the correct order.
// ============================================================

async function initializeApp() {
    // Register service worker (offline support). If registration fails
    // (e.g. sw.js missing on server), unregister any stale worker so an
    // OLD cached build can't keep serving outdated files.
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => reg.update())
            .catch(async (e) => {
                console.warn('SW registration failed — clearing stale workers:', e);
                const regs = await navigator.serviceWorker.getRegistrations();
                regs.forEach(r => r.unregister());
                if (window.caches) {
                    const keys = await caches.keys();
                    keys.forEach(k => caches.delete(k));
                }
            });
    }

    // Local storage setup
    await initDB();

    // Correct for a wrong device clock BEFORE the clock starts ticking or
    // any page renders a time. Awaited (unlike the other background calls)
    // so the very first painted time is already the real one. Offline, it
    // simply falls back to device time — the punch itself is stamped
    // server-side regardless, so nothing can be falsified either way.
    await apiSyncServerTime();

    // A failed first sync used to leave the app trusting the phone clock for
    // the rest of the session, silently. Keep retrying on a short cycle until
    // one succeeds, then settle into the 15-minute drift re-sync.
    if (!isServerTimeKnown()) retryServerTimeUntilKnown();

    // Re-sync every 15 minutes: catches a clock changed mid-session, and
    // keeps long-running sessions from drifting.
    setInterval(apiSyncServerTime, 15 * 60 * 1000);

    // Connectivity returning is the most likely moment for a pending sync to
    // succeed, so grab it immediately rather than waiting out the interval.
    window.addEventListener('online', apiSyncServerTime);

    // UI
    setupInstallButton();
    setupEventListeners();
    startClock();

    // Route based on saved session
    routeOnLoad();

    // GPS runs in background regardless of page (needed for attendance punch too)
    startGPS();

    // Refresh the employee directory in the background (non-blocking) so a
    // newly added/removed supervisor is picked up without waiting for login.
    refreshEmployeeList();
}

// Entry point
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
