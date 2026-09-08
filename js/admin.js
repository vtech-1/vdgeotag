// ============================================================
// ADMIN.JS — Admin dashboard: attendance tab, reports tab,
//            clickable map links, export CSV, clear data.
//            Fetches from Google Sheets when SCRIPT_URL is set;
//            falls back to local device data only.
// ============================================================

// ── Init ──────────────────────────────────────────────────────

function initAdminDashboard() {
    // Refresh the employee directory so admin always sees the latest
    // supervisor list (add/delete elsewhere may have changed it).
    refreshEmployeeList().then(() => populateSupervisorFilter());
    populateSupervisorFilter();

    // Default range = today only (ISO YYYY-MM-DD — required by <input type="date">)
    const today  = formatDateISO(new Date());
    const fromEl = document.getElementById('attFilterFrom');
    const toEl   = document.getElementById('attFilterTo');
    if (fromEl && !fromEl.value) fromEl.value = today;
    if (toEl   && !toEl.value)   toEl.value   = today;

    // Reports date range: default to no filter (blank = all dates), so the
    // existing "show everything, search client-side" behavior is unchanged
    // unless the admin explicitly narrows it.

    switchAdminTab('attendance');
    loadAdminAttendance();
}

// Rebuilds the attendance filter's supervisor dropdown from the current
// employee directory. Safe to call repeatedly (e.g. after add/delete) —
// preserves whatever was selected, if it still exists.
function populateSupervisorFilter() {
    const sel = document.getElementById('attFilterSup');
    if (!sel) return;

    const prev = sel.value;
    sel.innerHTML = '<option value="">All Supervisors</option>';
    getEmployeeList().filter(e => e.role === 'supervisor').forEach(emp => {
        const opt       = document.createElement('option');
        opt.value       = emp.id;
        opt.textContent = emp.name + ' (' + emp.id + ')';
        sel.appendChild(opt);
    });
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function switchAdminTab(tab) {
    STATE.adminTab = tab;
    document.querySelectorAll('.admin-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.admin-tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === 'tab-' + tab);
    });
    // Load reports on first switch to that tab
    if (tab === 'reports') loadAdminReports();
    if (tab === 'complaints') loadAdminComplaints();
    if (tab === 'supervisors') loadSupervisorsList();
}

// ── Loading state helper ──────────────────────────────────────

function tableLoading(tbodyId, colspan, msg) {
    const el = document.getElementById(tbodyId);
    if (el) el.innerHTML = `<tr><td colspan="${colspan}" class="no-records">${msg}</td></tr>`;
}

// ── Attendance tab ────────────────────────────────────────────

async function loadAdminAttendance() {
    const fromEl = document.getElementById('attFilterFrom');
    const toEl   = document.getElementById('attFilterTo');
    const supEl  = document.getElementById('attFilterSup');

    const today = formatDateISO(new Date());
    const fromDate = fromEl?.value || today;
    let   toDate   = toEl?.value   || today;
    const supId    = supEl?.value  || '';

    // Guard against an inverted range rather than sending it to the server —
    // clamp "to" up to "from" so the request is always valid.
    if (toDate < fromDate) {
        toDate = fromDate;
        if (toEl) toEl.value = fromDate;
    }

    tableLoading('attTableBody', 9, '⏳ Loading attendance...');

    // Try Google Sheets (all devices' data)
    const res = await apiFetchAttendance(fromDate, toDate, supId);
    if (res.ok && Array.isArray(res.data?.rows)) {
        STATE.adminAttendance = res.data.rows;
        renderAttendanceTable(res.data.rows);
        return;
    }

    // Fallback: local storage (only THIS device's punches, single day only —
    // the local cache has never stored a range, so a fallback range just
    // covers each day in the range from whatever this device happens to have).
    console.warn('Attendance API failed or returned invalid data:', res);
    renderAttendanceFallback(fromDate, toDate, supId);
}

function renderAttendanceFallback(fromDate, toDate, supId) {
    const all  = JSON.parse(localStorage.getItem('vd_attendance') || '{}');
    const emps = getEmployeeList().filter(e => e.role === 'supervisor').filter(emp => !supId || emp.id === supId);

    const rows = [];
    for (let d = fromDate; d <= toDate; d = _isoDatePlusOne(d)) {
        emps.forEach(emp => {
            const att = all[`${emp.id}_${d}`] || {}; // local keys use ISO now
            const g = (slot) => att[slot] || {};
            rows.push({
                name: emp.name, id: emp.id, date: d,
                in1: g('in1').time || '--', in1Status: '--', in1Lat: g('in1').lat || null, in1Lon: g('in1').lon || null,
                out1: g('out1').time || '--', out1Lat: g('out1').lat || null, out1Lon: g('out1').lon || null, total1: '--',
                in2: g('in2').time || '--', in2Status: '--', in2Lat: g('in2').lat || null, in2Lon: g('in2').lon || null,
                out2: g('out2').time || '--', out2Lat: g('out2').lat || null, out2Lon: g('out2').lon || null, total2: '--',
                finalTotal: '--'
            });
        });
        // Local-only fallback: cap the loop the same way the backend caps
        // its range, so a mistaken huge range can't hang the browser tab.
        if (rows.length > 92 * Math.max(emps.length, 1)) break;
    }

    renderAttendanceTable(rows);
}

// ISO YYYY-MM-DD → the next day's ISO string. Local (device timezone) is
// fine here — this only walks the fallback's day-by-day loop boundaries.
function _isoDatePlusOne(iso) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return formatDateISO(d);
}

function renderAttendanceTable(rows) {
    const tbody = document.getElementById('attTableBody');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-records">No attendance data for this range</td></tr>';
        return;
    }

    const cell = (time, lat, lon, status) => {
        const loc = (lat && lon)
            ? ` <a href="${mapsLink(lat, lon)}" target="_blank" class="map-link">📍</a>` : '';
        const badge = (status && status !== '--')
            ? `<br><span class="badge ${status === 'On-Time' ? 'badge-green' : 'badge-red'}">${status}</span>` : '';
        return `${time || '--'}${loc}${badge}`;
    };

    // OUT cell: show a red "Missing" flag when the session was started
    // (IN present) but never punched out.
    const outCell = (inTime, outTime, lat, lon) => {
        const started = inTime && inTime !== '--';
        const noOut   = !outTime || outTime === '--' || outTime === 'Missing';
        if (started && noOut) {
            return `<span class="badge badge-red">⚠️ Missing</span>`;
        }
        return cell(outTime, lat, lon);
    };

    tbody.innerHTML = rows.map(r => `<tr>
        <td>${formatDateDisplay(r.date)}</td>
        <td>${r.name}<br><small style="color:#888">${r.id}</small></td>
        <td>${cell(r.in1, r.in1Lat, r.in1Lon, r.in1Status)}</td>
        <td>${outCell(r.in1, r.out1, r.out1Lat, r.out1Lon)}</td>
        <td>${r.total1 || '--'}</td>
        <td>${cell(r.in2, r.in2Lat, r.in2Lon, r.in2Status)}</td>
        <td>${outCell(r.in2, r.out2, r.out2Lat, r.out2Lon)}</td>
        <td>${r.total2 || '--'}</td>
        <td><strong>${r.finalTotal || '--'}</strong></td>
    </tr>`).join('');
}

function exportAttendanceCSV() {
    const fromDate = document.getElementById('attFilterFrom')?.value || formatDateISO(new Date());
    const toDate   = document.getElementById('attFilterTo')?.value   || fromDate;

    const headers = ['Date', 'Supervisor', 'ID', '1st IN', '1st Status', '1st OUT', '1st Total',
                     '2nd IN', '2nd Status', '2nd OUT', '2nd Total', 'Final Total'];
    // Export whatever is currently rendered (from the last fetch)
    const rows = (STATE.adminAttendance || []).map(r => [
        formatDateDisplay(r.date), r.name, r.id, r.in1, r.in1Status, r.out1, r.total1,
        r.in2, r.in2Status, r.out2, r.total2, r.finalTotal
    ]);

    const rangeLabel = fromDate === toDate
        ? formatDateDisplay(fromDate)
        : `${formatDateDisplay(fromDate)}_to_${formatDateDisplay(toDate)}`;
    exportToCSV(headers, rows, `attendance_${rangeLabel.replace(/\//g, '-')}.csv`);
    showMessage('✅ Attendance CSV exported', 'success');
}

// ── Reports tab ───────────────────────────────────────────────

async function loadAdminReports() {
    tableLoading('reportTableBody', 5, '⏳ Loading reports...');

    const fromDate = document.getElementById('repFilterFrom')?.value || '';
    const toDate   = document.getElementById('repFilterTo')?.value   || '';

    // Try Google Sheets (ALL supervisors' reports from all devices).
    // fromDate/toDate are optional — the backend already supports them
    // (handleGetReports in Reports.gs); blank means "no date filter".
    const res = await apiFetchReports({ fromDate, toDate });
    if (res.ok && Array.isArray(res.data?.rows)) {
        STATE.allRecords = res.data.rows;
        renderReports();
        return;
    }

    // Fallback: local IndexedDB (only records entered on this device).
    // loadAllRecords() doesn't know about the date range, so renderReports()
    // below re-applies fromDate/toDate client-side on top of it.
    console.warn('Reports API failed or returned invalid data:', res);
    await loadAllRecords();
    renderReports();
}

function renderReports() {
    const tbody = document.getElementById('reportTableBody');
    if (!tbody) return;

    if (STATE.allRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-records">No reports found</td></tr>';
        updateAdminStats();
        return;
    }

    const fromDate = document.getElementById('repFilterFrom')?.value || '';
    const toDate   = document.getElementById('repFilterTo')?.value   || '';
    const query    = (document.getElementById('reportSearch')?.value || '').toLowerCase();

    let list = STATE.allRecords;

    // Re-applied here too (not just at fetch time) so the local-fallback
    // path and the search box both compose correctly with the date range.
    if (fromDate || toDate) {
        list = list.filter(r => {
            const d = isoOrDmyToIso(r.date || (r.isoStamp || '').slice(0, 10));
            if (fromDate && d < fromDate) return false;
            if (toDate   && d > toDate)   return false;
            return true;
        });
    }

    if (query) {
        list = list.filter(r =>
            r.vendorName?.toLowerCase().includes(query)       ||
            r.dairyName?.toLowerCase().includes(query)        ||
            r.routeName?.toLowerCase().includes(query)        ||
            r.location?.toLowerCase().includes(query)         ||
            r.supervisorName?.toLowerCase().includes(query));
    }

    tbody.innerHTML = list.map(r => {
        const loc = (r.lat && r.lon)
            ? `<a href="${mapsLink(r.lat, r.lon)}" target="_blank" class="map-link">${r.location || '📍 View'}</a>`
            : (r.location || '--');

        // Prefer formatted date/time; fall back to parsing the ISO timestamp
        // Full timestamp: "Fri Jul 03 2026 10:42:20 AM"
        const when = r.timestamp || (r.date && r.time
            ? `${formatDateDisplay(isoOrDmyToIso(r.date))} ${r.time}` : '--');

        return `<tr onclick="viewReport('${r.id}')">
            <td>${when}</td>
            <td>${r.supervisorName || '--'}<br><small>${r.supervisorId || ''}</small></td>
            <td>${loc}</td>
            <td>${r.vendorName || '--'}<br><small style="color:#888">${r.vendorType || ''}</small></td>
            <td>${r.shift || '--'}</td>
        </tr>`;
    }).join('');

    updateAdminStats();
}

function updateAdminStats() {
    const today     = formatDateISO(new Date());        // IST YYYY-MM-DD
    const thisMonth = today.slice(0, 7);                 // YYYY-MM

    // Prefer the ISO date field; fall back to isoStamp for old records.
    const dayOf = (r) => isoOrDmyToIso(r.date || (r.isoStamp || '').slice(0, 10));

    setVal('totalStats', STATE.allRecords.length);
    setVal('todayStats', STATE.allRecords.filter(r => dayOf(r) === today).length);
    setVal('monthStats', STATE.allRecords.filter(r => dayOf(r).startsWith(thisMonth)).length);
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ── Report detail modal ───────────────────────────────────────

function viewReport(id) {
    const r = STATE.allRecords.find(x => x.id === id);
    if (!r) return;

    const mLink = (r.lat && r.lon)
        ? `<a href="${mapsLink(r.lat, r.lon)}" target="_blank" class="map-link">📍 Open in Google Maps</a>`
        : '--';

    const when = r.timestamp || (r.date && r.time
        ? `${formatDateDisplay(isoOrDmyToIso(r.date))} ${r.time}` : '--');
    document.getElementById('modalTimestamp').textContent  = when;
    document.getElementById('modalShift').textContent      = r.shift        || '--';
    document.getElementById('modalLocation').innerHTML     = mLink;
    document.getElementById('modalGPS').textContent        = (r.lat && r.lon)
        ? `${Number(r.lat).toFixed(6)}, ${Number(r.lon).toFixed(6)}`
        : '--';
    const vt = document.getElementById('modalVendorType');
    if (vt) vt.textContent = r.vendorType || '--';
    document.getElementById('modalVendor').textContent     = r.vendorName      || '--';
    document.getElementById('modalRoute').textContent      = r.routeName       || '--';
    document.getElementById('modalDairy').textContent      = r.dairyName       || '--';
    document.getElementById('modalContact').textContent    = r.contactNo       || '--';
    document.getElementById('modalMilk').textContent       = r.milkLtrs        || '--';
    document.getElementById('modalFatSnf').textContent     = r.fatSnf          || '--';
    document.getElementById('modalRate').textContent       = r.avgRate         || '--';
    document.getElementById('modalAdditional').textContent = r.additionalRate  || '--';
    document.getElementById('modalSalary').textContent     = r.vlccSalary      || '--';
    document.getElementById('modalDiscussion').textContent = r.discussionPoint || '--';
    document.getElementById('modalRemarks').textContent    = r.noteField       || '--';

    const photoEl = document.getElementById('modalPhotoNote');
    if (photoEl) photoEl.textContent = 'Photos shared via Telegram only — not stored in this system.';

    document.getElementById('recordModal').classList.add('active');
}

function closeModal() {
    document.getElementById('recordModal').classList.remove('active');
}

// ── CSV export ────────────────────────────────────────────────

function exportReportsCSV() {
    if (STATE.allRecords.length === 0) {
        showMessage('No reports to export', 'error');
        return;
    }
    const headers = [
        'Date', 'Time', 'Shift', 'Supervisor', 'ID',
        'Location', 'Latitude', 'Longitude',
        'Vendor Type', 'Vendor/VLCC', 'Route', 'Dairy', 'Contact', 'Milk(L)', 'Fat&SNF',
        'Avg Rate', 'Additional Incentive', 'VLCC Salary', 'Discussion', 'Remarks'
    ];
    const rows = STATE.allRecords.map(r => [
        formatDateDisplay(isoOrDmyToIso(r.date)), r.time, r.shift,
        r.supervisorName, r.supervisorId,
        r.location, r.lat, r.lon,
        r.vendorType, r.vendorName, r.routeName, r.dairyName, r.contactNo,
        r.milkLtrs, r.fatSnf, r.avgRate, r.additionalRate, r.vlccSalary,
        r.discussionPoint, r.noteField
    ]);
    exportToCSV(headers, rows, `reports_${formatDateDisplay(new Date()).replace(/\//g, '-')}.csv`);
    showMessage('✅ Reports CSV exported', 'success');
}

// ── Clear local data ──────────────────────────────────────────

async function clearAllDataConfirm() {
    if (confirm('⚠️ This will delete all LOCAL records on this device.\n\nGoogle Sheets data is not affected.\n\nContinue?')) {
        await clearAllData();
        STATE.allRecords = [];
        renderReports();
        showMessage('✅ Local data cleared', 'success');
    }
}

// ── Complaints tab ────────────────────────────────────────────
// Admin sees every ticket regardless of status (unlike the service
// dashboard, which defaults to just the active queue) and is the only
// role allowed to CLOSE a COMPLETED ticket — enforced server-side too.

async function loadAdminComplaints() {
    const list = document.getElementById('adminComplaintsList');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">⏳ Loading complaints...</div>';

    const res = await apiFetchComplaints();
    if (!res.ok || !Array.isArray(res.data?.rows)) {
        list.innerHTML = '<div style="text-align:center;color:#d32f2f;padding:20px;">⚠️ Failed to load complaints</div>';
        return;
    }

    STATE.adminComplaints = res.data.rows;
    renderAdminComplaints();
}

function renderAdminComplaints() {
    const list = document.getElementById('adminComplaintsList');
    if (!list) return;

    const statusFilter = document.getElementById('cmpFilterStatus')?.value || '';
    const rows = statusFilter
        ? STATE.adminComplaints.filter(t => t.status === statusFilter)
        : STATE.adminComplaints;

    if (rows.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">No complaints found</div>';
        return;
    }

    list.innerHTML = rows.map(t => cmpCardHtml(t, adminComplaintActionsHtml(t))).join('');
}

function adminComplaintActionsHtml(t) {
    if (t.status !== 'COMPLETED') return '';
    return `<button class="btn btn-primary btn-small" onclick="closeTicketPrompt('${escapeAttr(t.ticketId)}')">✅ Verify &amp; Close</button>`;
}

async function closeTicketPrompt(ticketId) {
    if (!confirm(`Close ${ticketId}?\n\nOnly do this after verifying the reported issue is actually fixed.`)) return;

    const res = await apiUpdateComplaint(ticketId, 'close');
    if (res.ok && res.data?.success) {
        showMessage(`✅ ${ticketId} closed`, 'success');
        loadAdminComplaints();
    } else {
        showMessage('❌ ' + (res.data?.error || 'Failed to close ticket'), 'error');
    }
}

function exportComplaintsCSV() {
    if (!STATE.adminComplaints || STATE.adminComplaints.length === 0) {
        showMessage('No complaints to export', 'error');
        return;
    }
    const headers = [
        'Ticket ID', 'Date Raised', 'Time Raised', 'Supervisor', 'Supervisor ID',
        'VLCC Code', 'Location', 'Issue', 'Status',
        'Started By', 'Started Date', 'Completed By', 'Completed Date',
        'Resolution', 'Closed By', 'Closed Date', 'Days To Close', 'Days Open'
    ];
    const rows = STATE.adminComplaints.map(t => [
        t.ticketId, t.dateRaised, t.timeRaised, t.supervisorName, t.supervisorId,
        t.vlccCode, t.location, t.issue, t.status,
        t.startedBy, t.startedDate, t.completedBy, t.completedDate,
        t.resolution, t.closedBy, t.closedDate, t.daysToClose, t.ageDays
    ]);
    exportToCSV(headers, rows, `complaints_${formatDateDisplay(new Date()).replace(/\//g, '-')}.csv`);
    showMessage('✅ Complaints CSV exported', 'success');
}

// ── Supervisors tab ───────────────────────────────────────────

async function loadSupervisorsList() {
    const tbody = document.getElementById('supervisorTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">⏳ Loading accounts...</td></tr>';

    const res = await apiListSupervisors();
    if (res.ok && Array.isArray(res.data?.rows)) {
        renderSupervisorsList(res.data.rows);
    } else {
        console.warn('Failed to load supervisors:', res);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#d32f2f;">⚠️ Failed to load supervisors</td></tr>';
    }
}

function renderSupervisorsList(supervisors) {
    const tbody = document.getElementById('supervisorTableBody');
    if (!tbody) return;

    if (!supervisors || supervisors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">No accounts found</td></tr>';
        return;
    }

    // Passwords are stored in plain text, so they're masked until the admin
    // explicitly reveals one — a table full of readable passwords is trivially
    // screenshotted or shoulder-surfed.
    tbody.innerHTML = supervisors.map(s => {
        const roleBadge = s.role === 'service'
            ? '<span class="badge badge-blue">Service</span>'
            : '<span class="badge badge-green">Supervisor</span>';

        const pwCell = s.password
            ? `<span class="pw-mask" id="pw-${s.id}" data-pw="${escapeAttr(s.password)}" data-shown="0">••••••</span>
               <button class="btn-icon" title="Show / hide password"
                       onclick="togglePassword('${escapeAttr(s.id)}')">👁️</button>`
            : '<span style="color:#888;">--</span>';

        return `<tr>
            <td>${escapeHtml(s.id)}</td>
            <td>${escapeHtml(s.name)}</td>
            <td>${roleBadge}</td>
            <td style="white-space:nowrap;">${pwCell}</td>
            <td>${escapeHtml(s.lastReset) || '--'}</td>
            <td style="text-align:center;white-space:nowrap;">
                <button class="btn btn-secondary btn-small"
                        onclick="editSupervisorPrompt('${escapeAttr(s.id)}', '${escapeAttr(s.name)}')">✏️ Edit</button>
                <button class="btn btn-primary btn-small"
                        onclick="setPasswordPrompt('${escapeAttr(s.id)}', '${escapeAttr(s.name)}')">🔑 Password</button>
                <button class="btn btn-danger btn-small"
                        onclick="deleteSupervisor('${escapeAttr(s.id)}', '${escapeAttr(s.name)}')">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

// Reveal/hide a single password in the table.
function togglePassword(supId) {
    const el = document.getElementById('pw-' + supId);
    if (!el) return;
    const shown = el.dataset.shown === '1';
    el.textContent   = shown ? '••••••' : el.dataset.pw;
    el.dataset.shown = shown ? '0' : '1';
}

// ── Edit supervisor name ───────────────────────────────────────
// The ID is deliberately not editable: it's the login credential and the
// key every attendance and report row is filed under. Changing it would
// orphan that history.

function editSupervisorPrompt(supId, currentName) {
    const name = prompt(`Edit name for ID ${supId}:`, currentName);
    if (name === null) return;                 // cancelled

    const trimmed = name.trim();
    if (!trimmed) {
        showMessage('❌ Name cannot be empty', 'error');
        return;
    }
    if (trimmed === currentName) return;       // nothing changed

    apiEditSupervisor(supId, trimmed).then(async res => {
        if (res.ok && res.data?.success) {
            showMessage(`✅ Renamed to ${trimmed}`, 'success');
            await refreshEmployeeList();
            populateSupervisorFilter();
            loadSupervisorsList();
        } else {
            showMessage('❌ ' + (res.data?.error || 'Failed to rename'), 'error');
        }
    });
}

// ── Set an explicit password ───────────────────────────────────

function setPasswordPrompt(supId, supName) {
    const pw = prompt(`Set a new password for ${supName} (${supId}):\n\nMinimum 4 characters.`, '');
    if (pw === null) return;

    const trimmed = pw.trim();
    if (trimmed.length < 4) {
        showMessage('❌ Password must be at least 4 characters', 'error');
        return;
    }

    apiSetPassword(supId, trimmed).then(res => {
        if (res.ok && res.data?.success) {
            showMessage(`✅ Password updated for ${supName}`, 'success');
            loadSupervisorsList();
        } else {
            showMessage('❌ ' + (res.data?.error || 'Failed to set password'), 'error');
        }
    });
}

// ── Add supervisor ─────────────────────────────────────────────

async function addSupervisor() {
    const idInput   = document.getElementById('newSupId');
    const nameInput = document.getElementById('newSupName');
    const roleInput = document.getElementById('newSupRole');
    const pwInput   = document.getElementById('newSupPassword');
    const errEl     = document.getElementById('addSupervisorError');
    const btn       = document.getElementById('addSupervisorBtn');

    const id   = idInput.value.trim();
    const name = nameInput.value.trim();
    const role = roleInput?.value || 'supervisor';
    const pw   = pwInput?.value.trim() || '';

    errEl.classList.remove('active');

    if (!/^\d{4}$/.test(id)) {
        errEl.textContent = '❌ Employee ID must be exactly 4 digits.';
        errEl.classList.add('active');
        return;
    }
    if (!name) {
        errEl.textContent = '❌ Name is required.';
        errEl.classList.add('active');
        return;
    }
    if (pw && pw.length < 4) {
        errEl.textContent = '❌ Password must be at least 4 characters (or leave blank to default to the Employee ID).';
        errEl.classList.add('active');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Adding...';

    const res = await apiAddSupervisor(id, name, role, pw);

    btn.disabled = false;
    btn.textContent = '➕ Add Account';

    if (res.ok && res.data?.success) {
        idInput.value = '';
        nameInput.value = '';
        if (pwInput) pwInput.value = '';
        const roleLabel = role === 'service' ? 'Service team member' : 'Supervisor';
        showMessage(`✅ ${roleLabel} ${name} (${id}) added`, 'success');
        await refreshEmployeeList();
        populateSupervisorFilter();
        loadSupervisorsList();
    } else {
        errEl.textContent = '❌ ' + (res.data?.error || 'Failed to add account');
        errEl.classList.add('active');
    }
}

// ── Delete supervisor ───────────────────────────────────────────

async function deleteSupervisor(supId, supName) {
    if (!confirm(`Remove ${supName} (${supId})?\n\nThey will no longer be able to log in. Their past attendance and report history is kept.`)) return;

    const res = await apiDeleteSupervisor(supId);

    if (res.ok && res.data?.success) {
        showMessage(`✅ Supervisor ${supName} (${supId}) removed`, 'success');
        await refreshEmployeeList();
        populateSupervisorFilter();
        loadSupervisorsList();
    } else {
        showMessage('❌ ' + (res.data?.error || 'Failed to remove supervisor'), 'error');
    }
}

async function resetSupervisorPassword(supId, supName) {
    if (!confirm(`Reset password for ${supName} (${supId})?`)) return;

    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Resetting...';

    const res = await apiResetPassword(supId);

    btn.disabled = false;
    btn.textContent = '🔑 Reset';

    if (res.ok && res.data?.tempPassword) {
        showPasswordModal(supName, supId, res.data.tempPassword);
        loadSupervisorsList();
    } else {
        showMessage('❌ Failed to reset password', 'error');
    }
}

function showPasswordModal(supName, supId, tempPassword) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:400px;">
            <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
            <div class="modal-title">🔑 Temporary Password</div>
            <p style="font-size:13px;color:var(--text-secondary);margin:12px 0;">
                Password reset for <strong>${supName} (${supId})</strong>
            </p>
            <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:12px 0;">
                <div style="font-size:12px;color:#888;margin-bottom:4px;">Temporary Password:</div>
                <div style="font-size:16px;font-weight:bold;color:#1a7a3c;font-family:monospace;word-break:break-all;">
                    ${tempPassword}
                </div>
            </div>
            <div style="background:#fff3cd;border:1px solid #ffc107;padding:12px;border-radius:6px;margin:12px 0;font-size:12px;color:#333;">
                ⚠️ Share this with the supervisor. They will be prompted to change it on next login.
            </div>
            <button class="btn btn-primary" style="width:100%;" onclick="
                navigator.clipboard.writeText('${tempPassword}').then(() => {
                    showMessage('✅ Password copied to clipboard', 'success');
                });
            ">📋 Copy to Clipboard</button>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
