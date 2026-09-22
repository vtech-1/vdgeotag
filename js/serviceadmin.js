// ============================================================
// SERVICEADMIN.JS — Service Admin dashboard (IDs 2084, 1102).
//
// The service team's own management view. Three tabs:
//   🎫 Complaints  — the full complaints log as a TABLE, the same
//                    renderer the admin tab uses (see complaints.js),
//                    so the two screens can never drift apart.
//   ➕ Raise Issue  — log a problem found at a site and assign it to a
//                    named supervisor to go and deal with.
//   🔍 Inspections — site observations filed by the service team.
//
// WHAT THEY MAY CLOSE: only TO_SUPERVISOR tickets — the ones they
// raised themselves. A service admin can never close a supervisor's
// complaint about the service team, because that would let the service
// side sign off on its own work. Enforced server-side in Complaints.gs;
// the UI here just doesn't offer the button.
// ============================================================

function initServiceAdminDashboard() {
    const hdr = document.getElementById('svcAdminHeaderUser');
    if (hdr && STATE.currentUser) {
        hdr.textContent = STATE.currentUser.name + ' · ID ' + STATE.currentUser.id;
    }

    loadSvcAdminComplaints();
    loadSvcAdminSupervisors();
}

// ── Tabs ───────────────────────────────────────────────────────

function switchSvcAdminTab(tabName) {
    document.querySelectorAll('#page-serviceadmin .admin-tab-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.svcTab === tabName));
    document.querySelectorAll('#page-serviceadmin .admin-tab-panel')
        .forEach(p => p.classList.toggle('active', p.id === 'svcTab-' + tabName));

    // Load on first open rather than all at once at login — three sheet
    // reads on a 4G connection is exactly the sluggishness we just fixed.
    if (tabName === 'inspections' && !STATE.inspections) {
        loadInspections('svcAdminInspectionsBody');
    }
}

// ── Complaints log ─────────────────────────────────────────────

async function loadSvcAdminComplaints() {
    tableLoading('svcAdminComplaintsBody', CMP_TABLE_COLS, '⏳ Loading complaints...');

    const res = await apiFetchComplaints(svcAdminDateParams());
    if (!res.ok || !Array.isArray(res.data?.rows)) {
        tableLoading('svcAdminComplaintsBody', CMP_TABLE_COLS, '⚠️ Failed to load complaints');
        return;
    }

    STATE.svcAdminComplaints = res.data.rows;
    fillCmpSupervisorFilter('svcCmpFilterSupervisor', res.data.rows);
    renderSvcAdminComplaints();
}

// Only sends dates when the user actually picked them — otherwise the
// backend applies its fast 2-day default.
function svcAdminDateParams() {
    const from = document.getElementById('svcCmpFilterFrom')?.value || '';
    const to   = document.getElementById('svcCmpFilterTo')?.value   || '';
    const params = {};
    if (from) params.fromDate = from;
    if (to)   params.toDate   = to;
    return params;
}

function renderSvcAdminComplaints() {
    const tbody = document.getElementById('svcAdminComplaintsBody');
    if (!tbody) return;

    const status = document.getElementById('svcCmpFilterStatus')?.value || '';
    const supId  = document.getElementById('svcCmpFilterSupervisor')?.value || '';

    const rows = (STATE.svcAdminComplaints || [])
        .filter(t => !status || t.status === status)
        .filter(t => cmpMatchesSupervisor(t, supId));

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${CMP_TABLE_COLS}" class="no-records">No complaints found</td></tr>`;
        return;
    }

    tbody.innerHTML = cmpTableRowsHtml(rows, { actionsFor: svcAdminActionsHtml });
}

function svcAdminActionsHtml(t) {
    // Only a ticket the service side raised, and only once the supervisor
    // says it's done. Everything else is somebody else's call.
    if (t.status !== 'COMPLETED' || t.direction !== CMP_DIR.TO_SUPERVISOR) return '--';
    return `<button class="btn btn-primary btn-small" onclick="closeTicketPrompt('${escapeAttr(t.ticketId)}')">✅ Verify &amp; Close</button>`;
}

// ── Raise an issue for a supervisor ────────────────────────────

async function loadSvcAdminSupervisors() {
    const sel = document.getElementById('svcNewCmpSupervisor');
    if (!sel) return;

    const res = await apiListSupervisorsForAssign();
    if (!res.ok || !Array.isArray(res.data?.rows)) {
        sel.innerHTML = '<option value="">⚠️ Could not load supervisors</option>';
        return;
    }

    STATE.assignableSupervisors = res.data.rows;
    sel.innerHTML = '<option value="">-- Choose supervisor --</option>' +
        res.data.rows
            .map(s => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.id)})</option>`)
            .join('');
}

async function handleSvcAdminRaise() {
    const supEl     = document.getElementById('svcNewCmpSupervisor');
    const vlccEl    = document.getElementById('svcNewCmpVlcc');
    const locEl     = document.getElementById('svcNewCmpLocation');
    const issueEl   = document.getElementById('svcNewCmpIssue');
    const errEl     = document.getElementById('svcNewCmpError');
    const btn       = document.getElementById('svcNewCmpBtn');

    const fail = msg => {
        errEl.textContent = '❌ ' + msg;
        errEl.classList.add('active');
    };
    errEl.classList.remove('active');

    const assignedTo = supEl.value;
    const vlcc       = vlccEl.value.trim();
    const loc        = locEl.value.trim();
    const issue      = issueEl.value.trim();

    if (!assignedTo) return fail('Please choose which supervisor this is for.');
    if (!vlcc)       return fail('VLCC code is required.');
    if (!loc)        return fail('Location is required.');
    if (!issue)      return fail('Please describe the issue.');

    btn.disabled = true;
    btn.textContent = '⏳ Submitting...';

    const res = await apiRaiseComplaint({
        direction: 'TO_SUPERVISOR',
        assignedTo,
        vlccCode: vlcc,
        location: loc,
        issue,
    });

    btn.disabled = false;
    btn.textContent = '🎫 Raise Issue';

    if (res.ok && res.data?.success) {
        showMessage(`✅ Issue ${res.data.ticketId} raised`, 'success');
        vlccEl.value = '';
        locEl.value = '';
        issueEl.value = '';
        supEl.value = '';
        loadSvcAdminComplaints();
    } else {
        fail(res.data?.error || 'Failed to raise issue');
    }
}

// ── Export ─────────────────────────────────────────────────────

function exportSvcAdminComplaintsCSV() {
    exportComplaintRowsCSV(STATE.svcAdminComplaints || []);
}
