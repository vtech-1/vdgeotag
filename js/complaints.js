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

// Plain wording for the supervisor's screen. They aren't service staff and
// shouldn't have to learn the lifecycle vocabulary to understand what a
// ticket assigned to them is waiting on.
const CMP_STATUS_LABEL_SUP = {
    OPEN:        '🔴 To do',
    IN_PROGRESS: '🔵 Started',
    COMPLETED:   '🟢 Done — waiting for approval',
    CLOSED:      '⚪ Approved & closed',
};

const CMP_DIR = {
    TO_SERVICE:    'TO_SERVICE',
    TO_SUPERVISOR: 'TO_SUPERVISOR',
};

// ── Shared complaints TABLE ────────────────────────────────────
// Used by BOTH the admin Complaints tab and the service admin dashboard.
// One renderer on purpose: two copies of this markup drifted apart last
// time and the columns stopped matching between the two screens.
//
// `opts.actionsFor(t)` returns the HTML for that row's Action cell, so each
// screen supplies only what its own role may do.

const CMP_TABLE_COLS = 10;

function cmpTableRowsHtml(rows, opts = {}) {
    const actionsFor = opts.actionsFor || (() => '--');

    return rows.map(t => {
        const badge = CMP_STATUS_BADGE[t.status] || 'badge-gray';
        const label = CMP_STATUS_LABEL[t.status] || t.status;

        const age = (t.status !== 'CLOSED' && t.ageDays !== '' && t.ageDays !== undefined)
            ? `<br><span class="badge ${t.ageDays >= 3 ? 'badge-red' : 'badge-gray'}">${t.ageDays}d open</span>`
            : '';

        // Who actually did the work — the service team on a normal ticket,
        // the assigned supervisor on a reverse one.
        const solvedBy = t.completedBy || t.startedBy || '--';

        // The service team's own finish, distinct from the admin's final
        // sign-off in the next column.
        const completedCell = t.completedDate
            ? formatDateDMY(t.completedDate) +
              (t.completedBy ? `<br><small style="color:#888;">${escapeHtml(t.completedBy)}</small>` : '')
            : '--';

        const closedCell = t.status === 'CLOSED'
            ? formatDateDMY(t.closedDate) +
              (t.daysToClose !== '' && t.daysToClose !== undefined
                  ? `<br><small style="color:#888;">in ${t.daysToClose}d</small>` : '')
            : '--';

        const loc = (t.lat && t.lon)
            ? `<a href="${mapsLink(t.lat, t.lon)}" target="_blank" class="map-link">${escapeHtml(t.location)}</a>`
            : escapeHtml(t.location || '--');

        // Which way this ticket flows, so the admin can tell a supervisor's
        // complaint from an issue raised against a supervisor at a glance.
        const dirBadge = t.direction === CMP_DIR.TO_SUPERVISOR
            ? `<br><span class="badge badge-yellow">→ ${escapeHtml(t.assignedToName || 'supervisor')}</span>`
            : '';

        const mobile = t.inchargeMobile
            ? `<br><small style="color:#888;">📞 ${escapeHtml(t.inchargeMobile)}</small>`
            : '';

        return `<tr>
            <td><strong>${escapeHtml(t.ticketId)}</strong>${dirBadge}</td>
            <td>${escapeHtml(t.supervisorName || '--')}<br><small style="color:#888;">${escapeHtml(t.supervisorId || '')}</small></td>
            <td>${loc}<br><small style="color:#888;">VLCC: ${escapeHtml(t.vlccCode || '--')}</small>${mobile}</td>
            <td>${escapeHtml(t.issue || '--')}${t.resolution
                ? `<br><small style="color:#888;">✔ ${escapeHtml(t.resolution)}</small>` : ''}</td>
            <td>${escapeHtml(solvedBy)}</td>
            <td>${formatDateDMY(t.dateRaised)}</td>
            <td>${completedCell}</td>
            <td>${closedCell}</td>
            <td><span class="badge ${badge}">${label}</span>${age}</td>
            <td style="text-align:center;">${actionsFor(t)}</td>
        </tr>`;
    }).join('');
}

// Populate a "filter by supervisor" dropdown from whoever actually appears
// in the loaded rows — no extra request, and it never offers a name that
// would return nothing.
function fillCmpSupervisorFilter(selectId, rows) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    const prev = sel.value;
    const seen = {};
    rows.forEach(t => {
        if (t.supervisorId) seen[t.supervisorId] = t.supervisorName || t.supervisorId;
        // A reverse ticket's assignee is a supervisor too — filtering by
        // them should find the work they were given.
        if (t.assignedTo) seen[t.assignedTo] = t.assignedToName || t.assignedTo;
    });

    const opts = Object.keys(seen)
        .sort((a, b) => seen[a].localeCompare(seen[b]))
        .map(id => `<option value="${escapeAttr(id)}">${escapeHtml(seen[id])}</option>`)
        .join('');

    sel.innerHTML = '<option value="">All supervisors</option>' + opts;
    if (prev) sel.value = prev;   // keep the admin's selection across reloads
}

// A row matches the supervisor filter if they raised it OR own it.
function cmpMatchesSupervisor(t, supId) {
    if (!supId) return true;
    return String(t.supervisorId) === supId || String(t.assignedTo) === supId;
}

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
    const vlccEl   = document.getElementById('cmpVlcc');
    const locEl    = document.getElementById('cmpLocation');
    const issueEl  = document.getElementById('cmpIssue');
    const mobileEl = document.getElementById('cmpIncharge');
    const errEl    = document.getElementById('complaintError');
    const btn      = document.getElementById('raiseComplaintBtn');

    const vlcc  = vlccEl.value.trim();
    const loc   = locEl.value.trim();
    const issue = issueEl.value.trim();
    // Strip spaces, dashes and a +91 prefix so a number typed in any of the
    // usual ways still passes the 10-digit check.
    const mobile = (mobileEl?.value || '').replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '');

    errEl.classList.remove('active');

    const fail = msg => {
        errEl.textContent = '❌ ' + msg;
        errEl.classList.add('active');
    };

    if (!vlcc)  return fail('VLCC code is required.');
    if (!loc)   return fail('Location is required.');
    if (!mobile) return fail('Incharge mobile number is required.');
    if (mobile.length !== 10) return fail('Incharge mobile number must be 10 digits.');
    if (!issue) return fail('Please describe the issue.');

    btn.disabled = true;
    btn.textContent = '⏳ Submitting...';

    const pos = STATE.currentPosition || {};
    const res = await apiRaiseComplaint({
        vlccCode: vlcc,
        location: loc,
        issue,
        inchargeMobile: mobile,
        lat: pos.latitude  ?? '',
        lon: pos.longitude ?? '',
    });

    btn.disabled = false;
    btn.textContent = '🎫 Submit Complaint';

    if (res.ok && res.data?.success) {
        showMessage(`✅ Complaint ${res.data.ticketId} raised`, 'success');
        vlccEl.value = '';
        issueEl.value = '';
        if (mobileEl) mobileEl.value = '';
        loadMyComplaints();
    } else {
        fail(res.data?.error || 'Failed to submit complaint');
    }
}

// ── Supervisor: their own ticket history ────────────────────────

// The supervisor's page holds TWO piles that mean opposite things:
//   • work assigned TO them  — they must go and fix it
//   • complaints raised BY them — they're only tracking progress
// Rendering them in one undifferentiated list is how a non-technical user
// ends up ignoring both, so they're split into separate labelled sections
// with different colours, and only the assigned one carries buttons.
async function loadMyComplaints() {
    const list     = document.getElementById('myComplaintsList');
    const assigned = document.getElementById('assignedComplaintsSection');
    if (!list) return;

    list.innerHTML = '<div style="text-align:center;color:#888;font-size:12px;padding:10px;">⏳ Loading...</div>';

    const res = await apiFetchComplaints();
    if (!res.ok || !Array.isArray(res.data?.rows)) {
        list.innerHTML = '<div style="text-align:center;color:#d32f2f;font-size:12px;padding:10px;">⚠️ Failed to load</div>';
        return;
    }

    const me   = String(STATE.currentUser?.id || '');
    const rows = res.data.rows;

    // Assigned to me = someone else raised it and put my name on it. The
    // server already refuses to send me service-raised rows, so anything
    // arriving here assigned to me came from an admin.
    const forMe = rows.filter(t => String(t.assignedTo) === me && String(t.supervisorId) !== me);
    const mine  = rows.filter(t => String(t.supervisorId) === me);

    renderAssignedComplaints(assigned, forMe);

    list.innerHTML = mine.length === 0
        ? '<div style="text-align:center;color:#888;font-size:12px;padding:10px;">No complaints raised yet</div>'
        : mine.map(t => cmpCardHtml(t)).join('');
}

// The whole section disappears when there's nothing to do, so on a normal
// day the page looks exactly as it did before this feature existed.
function renderAssignedComplaints(section, rows) {
    if (!section) return;

    const open = rows.filter(t => t.status !== 'CLOSED');
    if (open.length === 0) {
        section.style.display = 'none';
        section.innerHTML = '';
        return;
    }

    section.style.display = 'block';
    section.innerHTML = `
        <div class="cmp-section-head cmp-section-head-todo">
            🔴 WORK FOR YOU
            <span class="cmp-count">${open.length}</span>
        </div>
        <div class="cmp-section-note">Go to the site and fix these, then press the button.</div>
        <div class="cmp-assigned-list">
            ${open.map(t => cmpCardHtml(t, supervisorActionsHtml(t), {
                assigned: true,
                labels:   CMP_STATUS_LABEL_SUP,
            })).join('')}
        </div>`;
}

// Plain-language buttons — "I have fixed this", not "Mark Completed".
function supervisorActionsHtml(t) {
    if (t.status === 'OPEN') {
        return `
            <button class="btn btn-secondary btn-small" onclick="startTicket('${escapeAttr(t.ticketId)}')">▶️ I am working on it</button>
            <button class="btn btn-primary btn-small" onclick="supervisorCompletePrompt('${escapeAttr(t.ticketId)}')">✅ I have fixed this</button>`;
    }
    if (t.status === 'IN_PROGRESS') {
        return `<button class="btn btn-primary btn-small" onclick="supervisorCompletePrompt('${escapeAttr(t.ticketId)}')">✅ I have fixed this</button>`;
    }
    // COMPLETED — waiting on the raiser to verify. Nothing left to press.
    return '';
}

// A real textarea, not prompt(). A browser prompt is a single cramped line
// on a phone, won't take newlines, and Chrome on Android hides it outright
// if the user has ever ticked "block dialogs" — which would leave the
// supervisor unable to finish a ticket at all. This is free text: they
// describe whatever they actually found and did, in their own words.
function supervisorCompletePrompt(ticketId) {
    openResolutionModal({
        ticketId,
        title:       '✅ I have fixed this',
        intro:       'Write what you found and what you did. The admin reads this before approving.',
        placeholder: 'e.g. Visited the site, cleaned the chilling unit and checked the readings. Told the incharge to clean it every week.',
        okLabel:     '✅ Send for approval',
        onDone:      () => { showMessage('✅ Sent for approval', 'success'); loadMyComplaints(); },
    });
}

// Shared free-text resolution modal — also used by the service team, so
// both sides get the same roomy field instead of a browser prompt.
function openResolutionModal({ ticketId, title, intro, placeholder, okLabel, onDone }) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" type="button">✕</button>
            <div class="modal-title">${escapeHtml(title)}</div>
            <p style="margin:0 0 6px;font-size:12px;color:var(--text-secondary);">
                Ticket <strong>${escapeHtml(ticketId)}</strong>
            </p>
            <p style="margin:0 0 12px;font-size:12px;color:var(--text-secondary);">
                ${escapeHtml(intro)}
            </p>
            <div class="form-group">
                <textarea id="resolutionText" rows="5"
                          placeholder="${escapeAttr(placeholder)}"
                          style="width:100%;"></textarea>
            </div>
            <div id="resolutionError" class="login-error"></div>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-secondary" type="button" id="resolutionCancel" style="flex:1;">Cancel</button>
                <button class="btn btn-primary" type="button" id="resolutionOk" style="flex:2;">${escapeHtml(okLabel)}</button>
            </div>
        </div>`;

    document.body.appendChild(modal);

    const ta      = modal.querySelector('#resolutionText');
    const errEl   = modal.querySelector('#resolutionError');
    const okBtn   = modal.querySelector('#resolutionOk');
    const close   = () => modal.remove();

    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#resolutionCancel').addEventListener('click', close);
    // Tapping the backdrop closes it, but a tap inside must not.
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    okBtn.addEventListener('click', async () => {
        const note = ta.value.trim();
        if (!note) {
            errEl.textContent = '❌ Please write what you did.';
            errEl.classList.add('active');
            ta.focus();
            return;
        }

        okBtn.disabled = true;
        okBtn.textContent = '⏳ Sending...';

        const res = await apiUpdateComplaint(ticketId, 'complete', note);

        if (res.ok && res.data?.success) {
            close();
            onDone();
        } else {
            okBtn.disabled = false;
            okBtn.textContent = okLabel;
            errEl.textContent = '❌ ' + (res.data?.error || 'Failed to update');
            errEl.classList.add('active');
        }
    });

    ta.focus();
}

// Shared ticket card — used by the supervisor list (read-only), the
// service dashboard (Start/Complete actions), and the admin tab (Close).
// `actions` is a raw HTML string of buttons; omit for read-only display.
function cmpCardHtml(t, actions, opts = {}) {
    const badge  = CMP_STATUS_BADGE[t.status] || 'badge-gray';
    const labels = opts.labels || CMP_STATUS_LABEL;
    const label  = labels[t.status] || t.status;
    // A red left edge on work assigned to you, blue on your own reports —
    // so the two piles stay distinguishable even at a glance.
    const cardClass = opts.assigned ? 'cmp-card cmp-card-todo' : 'cmp-card';
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

    // A phone number is only useful if it dials — tel: makes it one tap.
    const mobileLine = t.inchargeMobile
        ? `<div style="margin-top:4px;font-size:12px;">
               📞 <a href="tel:${escapeAttr(t.inchargeMobile)}" class="map-link">${escapeHtml(t.inchargeMobile)}</a>
           </div>`
        : '';

    return `<div class="${cardClass}">
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
        ${mobileLine}
        <div style="margin-top:4px;font-size:12px;color:var(--text-secondary);">
            🗓️ Raised ${formatDateDMY(t.dateRaised)} ${escapeHtml(t.timeRaised)}
            ${t.supervisorName ? ' by ' + escapeHtml(t.supervisorName) : ''}
        </div>
        <div style="margin-top:6px;font-size:13px;">${escapeHtml(t.issue)}</div>
        ${resolutionLine}
        ${actions ? `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">${actions}</div>` : ''}
    </div>`;
}
