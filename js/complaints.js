// ============================================================
// COMPLAINTS.JS — Supervisor "Raise a Complaint" section +
//                 shared ticket-card rendering used by the
//                 Service dashboard and the Admin Complaints tab.
//
// Lifecycle (enforced server-side in complaints.gs, mirrored here
// only for what buttons to show — never trust the client alone):
//   OPEN → IN_PROGRESS → COMPLETED → CLOSED
//   raised by            service        admin
//   supervisor            marks it       verifies +
//                          done           closes
// ============================================================

const CMP_STATUS_LABEL = {
    OPEN:        '🟠 Open',
    IN_PROGRESS: '🔵 In Progress',
    COMPLETED:   '🟢 Completed — awaiting close',
    CLOSED:      '⚪ Closed',
};

const CMP_STATUS_BADGE = {
    OPEN:        'badge-red',
    IN_PROGRESS: 'badge-blue',
    COMPLETED:   'badge-green',
    CLOSED:      'badge-gray',
};

// ── Supervisor: complaint page (its own page now, not a collapsible
//    card — reached via the "🎫 Complaint" button next to Logout) ──

function initComplaintPage() {
    const hdr = document.getElementById('complaintHeaderUser');
    if (hdr && STATE.currentUser) {
        hdr.textContent = STATE.currentUser.name + ' · ID ' + STATE.currentUser.id;
    }
    prefillComplaintLocation();
    loadMyComplaints();
}

function prefillComplaintLocation() {
    const el = document.getElementById('cmpLocation');
    if (el && !el.value && STATE.currentLocationName) {
        el.value = STATE.currentLocationName;
    }
}

// ── Supervisor: submit a new ticket ─────────────────────────────

async function handleRaiseComplaint() {
    const vlccEl  = document.getElementById('cmpVlcc');
    const locEl   = document.getElementById('cmpLocation');
    const issueEl = document.getElementById('cmpIssue');
    const errEl   = document.getElementById('complaintError');
    const btn     = document.getElementById('raiseComplaintBtn');

    const vlcc  = vlccEl.value.trim();
    const loc   = locEl.value.trim();
    const issue = issueEl.value.trim();

    errEl.classList.remove('active');

    if (!vlcc)  { errEl.textContent = '❌ VLCC code is required.';       errEl.classList.add('active'); return; }
    if (!loc)   { errEl.textContent = '❌ Location is required.';        errEl.classList.add('active'); return; }
    if (!issue) { errEl.textContent = '❌ Please describe the issue.';   errEl.classList.add('active'); return; }

    btn.disabled = true;
    btn.textContent = '⏳ Submitting...';

    const pos = STATE.currentPosition || {};
    const res = await apiRaiseComplaint({
        vlccCode: vlcc,
        location: loc,
        issue,
        lat: pos.latitude  ?? '',
        lon: pos.longitude ?? '',
    });

    btn.disabled = false;
    btn.textContent = '🎫 Submit Complaint';

    if (res.ok && res.data?.success) {
        showMessage(`✅ Complaint ${res.data.ticketId} raised`, 'success');
        vlccEl.value = '';
        issueEl.value = '';
        loadMyComplaints();
    } else {
        errEl.textContent = '❌ ' + (res.data?.error || 'Failed to submit complaint');
        errEl.classList.add('active');
    }
}

// ── Supervisor: their own ticket history ────────────────────────

async function loadMyComplaints() {
    const list = document.getElementById('myComplaintsList');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;color:#888;font-size:12px;padding:10px;">⏳ Loading...</div>';

    const res = await apiFetchComplaints();
    if (!res.ok || !Array.isArray(res.data?.rows)) {
        list.innerHTML = '<div style="text-align:center;color:#d32f2f;font-size:12px;padding:10px;">⚠️ Failed to load</div>';
        return;
    }

    const rows = res.data.rows;
    if (rows.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:#888;font-size:12px;padding:10px;">No complaints raised yet</div>';
        return;
    }

    list.innerHTML = rows.map(cmpCardHtml).join('');
}

// Shared ticket card — used by the supervisor list (read-only), the
// service dashboard (Start/Complete actions), and the admin tab (Close).
// `actions` is a raw HTML string of buttons; omit for read-only display.
function cmpCardHtml(t, actions) {
    const badge = CMP_STATUS_BADGE[t.status] || 'badge-gray';
    const label = CMP_STATUS_LABEL[t.status] || t.status;
    const age   = (t.status !== 'CLOSED' && t.ageDays !== '' && t.ageDays !== undefined)
        ? `<span class="badge ${t.ageDays >= 3 ? 'badge-red' : 'badge-gray'}" style="margin-left:6px;">${t.ageDays}d open</span>`
        : '';
    const daysToClose = (t.status === 'CLOSED' && t.daysToClose !== '')
        ? `<span class="badge badge-gray" style="margin-left:6px;">Closed in ${t.daysToClose}d</span>`
        : '';

    const mapLink = (t.lat && t.lon)
        ? ` · <a href="${mapsLink(t.lat, t.lon)}" target="_blank" class="map-link">📍 Map</a>`
        : '';

    const resolutionLine = t.resolution
        ? `<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);"><strong>Resolution:</strong> ${escapeHtml(t.resolution)}</div>`
        : '';

    return `<div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div>
                <strong style="font-size:13px;">${escapeHtml(t.ticketId)}</strong>
                <span class="badge ${badge}" style="margin-left:6px;">${label}</span>
                ${age}${daysToClose}
            </div>
        </div>
        <div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">
            📍 ${escapeHtml(t.location)} (VLCC: ${escapeHtml(t.vlccCode)})${mapLink}
        </div>
        <div style="margin-top:4px;font-size:12px;color:var(--text-secondary);">
            🗓️ Raised ${escapeHtml(t.dateRaised)} ${escapeHtml(t.timeRaised)}
            ${t.supervisorName ? ' by ' + escapeHtml(t.supervisorName) : ''}
        </div>
        <div style="margin-top:6px;font-size:13px;">${escapeHtml(t.issue)}</div>
        ${resolutionLine}
        ${actions ? `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">${actions}</div>` : ''}
    </div>`;
}
