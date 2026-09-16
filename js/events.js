// ============================================================
// EVENTS.JS — All addEventListener calls in one place.
//             Called once from app.js after DOM is ready.
// ============================================================

function setupEventListeners() {

    // ── Login page ───────────────────────────────────────────
    on('loginBtn',        'click', () => doLogin());
    on('loginId',         'keypress', e => { if (e.key === 'Enter') doLogin(); });
    on('loginPw',         'keypress', e => { if (e.key === 'Enter') doLogin(); });

    // ── Change-password page ─────────────────────────────────
    on('changePwBtn',     'click', () => doChangePassword());

    // ── Supervisor page — header ─────────────────────────────
    on('logoutBtnSup',    'click', doLogout);
    on('installBtn',      'click', null); // handled in ui.js setupInstallButton()

    // ── Supervisor page — camera & form ─────────────────────
    on('openCameraBtn',   'click', () => openCamera('report'));
    on('flipCameraBtn',   'click', flipCamera);
    on('captureBtn',      'click', capturePhoto);
    on('confirmPhotoBtn', 'click', confirmPhoto);
    on('retakeBtn',       'click', retakePhoto);

    // ── Supervisor page — attendance toggle ──────────────────
    // The checkbox's visual position is fully controlled by
    // updateAttendanceStatusUI() (called after every real punch) — a
    // slide here only OPENS the camera in the matching mode and then
    // immediately reverts the visual toggle, so it can't silently show
    // "punched" before a photo is actually confirmed. See camera.js
    // confirmPhoto()/retakePhoto() for what finalizes or cancels it.
    on('punchToggleInput', 'change', handlePunchToggleChange);

    on('submitBtn',       'click', handleSubmitClick);
    on('shareBtn',        'click', handleShareClick);
    on('skipShareBtn',    'click', handleSkipShare);

    // ── Supervisor page — raise a complaint (own page now) ───
    on('raiseComplaintNavBtn', 'click', () => showPage('page-complaint'));
    on('backFromComplaintBtn', 'click', () => showPage('page-supervisor'));
    on('raiseComplaintBtn',    'click', handleRaiseComplaint);

    // ── Service Team page ─────────────────────────────────────
    on('logoutBtnService',  'click', doLogout);
    on('refreshServiceBtn', 'click', loadServiceComplaints);
    on('svcFilterStatus',   'change', loadServiceComplaints);
    on('inspectionNavBtn',  'click', () => showPage('page-inspection'));

    // ── Site inspection page ──────────────────────────────────
    // Back goes to whichever dashboard the user came from — the service
    // queue for a tech, the service admin board for an admin.
    on('backFromInspectionBtn', 'click', () => {
        showPage(STATE.currentUser?.role === 'serviceadmin'
            ? 'page-serviceadmin' : 'page-service');
    });
    on('insOpenCameraBtn', 'click', () => openCamera('inspection'));
    on('insSubmitBtn',     'click', handleSubmitInspection);
    on('insShareBtn',      'click', handleInspectionShareClick);
    on('insSkipShareBtn',  'click', handleInspectionSkipShare);

    // ── Service Admin dashboard ───────────────────────────────
    on('logoutBtnSvcAdmin',   'click', doLogout);
    on('refreshSvcAdminBtn',  'click', loadSvcAdminComplaints);
    on('svcAdminInspectBtn',  'click', () => showPage('page-inspection'));
    on('svcCmpFilterStatus',     'change', renderSvcAdminComplaints);
    on('svcCmpFilterSupervisor', 'change', renderSvcAdminComplaints);
    on('svcNewCmpBtn',        'click', handleSvcAdminRaise);

    document.querySelectorAll('#page-serviceadmin .admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchSvcAdminTab(btn.dataset.svcTab));
    });

    // ── Admin page — complaints tab ───────────────────────────
    on('cmpFilterStatus',     'change', renderAdminComplaints);
    on('cmpFilterSupervisor', 'change', renderAdminComplaints);

    // ── Admin page — header ──────────────────────────────────
    on('logoutBtnAdmin',  'click', doLogout);
    on('refreshBtn',      'click', () => {
        loadAdminAttendance();
        loadAdminReports();
    });

    // ── Admin page — tabs ────────────────────────────────────
    // Scoped to #page-admin: the service admin dashboard reuses the same
    // class and is wired separately above.
    document.querySelectorAll('#page-admin .admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab));
    });

    // ── Admin page — attendance tab ──────────────────────────
    on('attFilterFrom',   'change', loadAdminAttendance);
    on('attFilterTo',     'change', loadAdminAttendance);
    on('attFilterSup',    'change', loadAdminAttendance);
    on('exportAttBtn',    'click', exportAttendanceCSV);

    // ── Admin page — reports tab ─────────────────────────────
    on('repFilterFrom',   'change', loadAdminReports);
    on('repFilterTo',     'change', loadAdminReports);
    on('reportSearch',    'input', renderReports);
    on('exportRepBtn',    'click', exportReportsCSV);
    on('clearDataBtn',    'click', clearAllDataConfirm);

    // ── Admin page — supervisors tab ─────────────────────────
    on('addSupervisorBtn', 'click', addSupervisor);

    // ── Modal ────────────────────────────────────────────────
    on('recordModal', 'click', e => {
        if (e.target.id === 'recordModal') closeModal();
    });
}

// Helper: attach event if element exists (no crash if element absent)
function on(id, event, handler) {
    if (!handler) return;
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
}
