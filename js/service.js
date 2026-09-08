// ============================================================
// SERVICE.JS — Service-team dashboard: see every complaint,
//              start work, mark completed. Can NEVER close a
//              ticket — that's an admin-only verification step
//              (enforced server-side too, see complaints.gs).
// ============================================================

function initServiceDashboard() {
    const hdr = document.getElementById('serviceHeaderUser');
    if (hdr && STATE.currentUser) {
        hdr.textContent = STATE.currentUser.name + ' · ID ' + STATE.currentUser.id;
    }
    loadServiceComplaints();
}

async function loadServiceComplaints() {
    const list = document.getElementById('serviceComplaintsList');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">⏳ Loading complaints...</div>';

    const res = await apiFetchComplaints();
    if (!res.ok || !Array.isArray(res.data?.rows)) {
        list.innerHTML = '<div style="text-align:center;color:#d32f2f;padding:20px;">⚠️ Failed to load complaints</div>';
        return;
    }

    const statusFilter = document.getElementById('svcFilterStatus')?.value || '';
    let rows = res.data.rows;
    rows = statusFilter
        ? rows.filter(t => t.status === statusFilter)
        : rows.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS'); // default view: the active queue

    if (rows.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">Nothing here — queue is clear 🎉</div>';
        return;
    }

    list.innerHTML = rows.map(t => cmpCardHtml(t, serviceActionsHtml(t))).join('');
}

function serviceActionsHtml(t) {
    if (t.status === 'OPEN') {
        return `
            <button class="btn btn-secondary btn-small" onclick="startTicket('${escapeAttr(t.ticketId)}')">▶️ Start Work</button>
            <button class="btn btn-primary btn-small" onclick="completeTicketPrompt('${escapeAttr(t.ticketId)}')">✅ Mark Completed</button>`;
    }
    if (t.status === 'IN_PROGRESS') {
        return `<button class="btn btn-primary btn-small" onclick="completeTicketPrompt('${escapeAttr(t.ticketId)}')">✅ Mark Completed</button>`;
    }
    // COMPLETED / CLOSED — nothing left for the service team to do.
    return '';
}

async function startTicket(ticketId) {
    const res = await apiUpdateComplaint(ticketId, 'start');
    if (res.ok && res.data?.success) {
        showMessage(`✅ ${ticketId} started`, 'success');
        loadServiceComplaints();
    } else {
        showMessage('❌ ' + (res.data?.error || 'Failed to start ticket'), 'error');
    }
}

async function completeTicketPrompt(ticketId) {
    const note = prompt(`What was done to resolve ${ticketId}?\n\n(Required — this is shown to the admin before they close it.)`, '');
    if (note === null) return;

    const trimmed = note.trim();
    if (!trimmed) {
        showMessage('❌ Please describe what was done', 'error');
        return;
    }

    const res = await apiUpdateComplaint(ticketId, 'complete', trimmed);
    if (res.ok && res.data?.success) {
        showMessage(`✅ ${ticketId} marked completed — awaiting admin verification`, 'success');
        loadServiceComplaints();
    } else {
        showMessage('❌ ' + (res.data?.error || 'Failed to complete ticket'), 'error');
    }
}
