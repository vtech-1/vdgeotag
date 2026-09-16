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
