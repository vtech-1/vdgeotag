// ============================================================
// NAVIGATION.JS — Page switching with auth guard
// ============================================================

function showPage(pageId) {
    // Leaving the inspection page: release the camera and stop its GPS
    // refresh timer. Otherwise the phone's camera light stays on and a
    // timer keeps firing against a hidden page.
    if (pageId !== 'page-inspection' &&
        document.getElementById('page-inspection')?.classList.contains('active')) {
        if (typeof stopInspectionCamera   === 'function') stopInspectionCamera();
        if (typeof stopInspectionGpsWatch === 'function') stopInspectionGpsWatch();
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');

    // Mirror the active page onto <body> as a class so CSS can key desktop
    // layout rules off "which page is showing" without a :has() selector
    // (older WebViews on field-supervisor phones may not support :has()).
    // Only login/admin get a wider desktop treatment — see admin.css — the
    // supervisor camera/report flow and the service queue stay phone-width
    // everywhere, since those roles are always used in the field.
    // The service admin dashboard is a management screen like the admin one,
    // so it gets the same desktop widening.
    document.body.classList.toggle('page-is-login', pageId === 'page-login');
    document.body.classList.toggle('page-is-admin',
        pageId === 'page-admin' || pageId === 'page-serviceadmin');

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
    if (pageId === 'page-serviceadmin') {
        initServiceAdminDashboard();
    }
    if (pageId === 'page-complaint') {
        initComplaintPage();
    }
    if (pageId === 'page-inspection') {
        initInspectionPage();
    }
}

// Called on every app start
function routeOnLoad() {
    if (loadSession()) {
        goToRolePage();
        // Then confirm the cached role against the live directory. A device
        // logged in before a role change (or before 'serviceadmin' existed)
        // would otherwise sit on the wrong screen until the session expired.
        refreshSessionRole().then(changed => {
            if (changed) goToRolePage();
        });
    } else {
        showPage('page-login');
    }
}
