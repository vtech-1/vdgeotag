// ============================================================
// NAVIGATION.JS — Page switching with auth guard
// ============================================================

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');

    // Mirror the active page onto <body> as a class so CSS can key desktop
    // layout rules off "which page is showing" without a :has() selector
    // (older WebViews on field-supervisor phones may not support :has()).
    // Only login/admin get a wider desktop treatment — see admin.css — the
    // supervisor camera/report flow and the service queue stay phone-width
    // everywhere, since those roles are always used in the field.
    document.body.classList.toggle('page-is-login', pageId === 'page-login');
    document.body.classList.toggle('page-is-admin', pageId === 'page-admin');

    // Refresh dynamic content when arriving at a page
    if (pageId === 'page-supervisor') {
        initDateShiftField();
        updateAttendanceUI();
        updateGPSDisplay();
    }
    if (pageId === 'page-admin') {
        initAdminDashboard();
        loadAdminReports();
    }
    if (pageId === 'page-service') {
        initServiceDashboard();
    }
    if (pageId === 'page-complaint') {
        initComplaintPage();
    }
}

// Called on every app start
function routeOnLoad() {
    if (loadSession()) {
        goToRolePage();
    } else {
        showPage('page-login');
    }
}
