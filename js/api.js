// ============================================================
// API.JS — All calls to the Google Apps Script backend.
//          Returns { ok: false, reason: 'no_url' } when
//          CONFIG.SCRIPT_URL is empty — app works offline only.
// ============================================================

// NOTE: No Content-Type header on POST — avoids CORS preflight
// with Google Apps Script. Body is still JSON, parsed server-side
// with JSON.parse(e.postData.contents).

async function apiPost(action, payload) {
    if (!CONFIG.SCRIPT_URL) return { ok: false, reason: 'no_url' };
    try {
        const res  = await fetch(CONFIG.SCRIPT_URL, {
            method: 'POST',
            body:   JSON.stringify({ action, ...payload }),
        });
        const data = await res.json();
        return { ok: true, data };
    } catch (e) {
        console.warn('API POST error:', e.message);
        return { ok: false, reason: e.message };
    }
}

async function apiGet(action, params = {}) {
    if (!CONFIG.SCRIPT_URL) return { ok: false, reason: 'no_url' };
    try {
        const qs   = new URLSearchParams({ action, ...params }).toString();
        const res  = await fetch(CONFIG.SCRIPT_URL + '?' + qs);
        const data = await res.json();
        return { ok: true, data };
    } catch (e) {
        console.warn('API GET error:', e.message);
        return { ok: false, reason: e.message };
    }
}

// ── Login validation (server-side, prevents device-hopping) ────

async function apiValidateLogin(supervisorId, password) {
    return apiPost('validateLogin', { supervisorId, password });
}

async function apiUpdatePassword(supervisorId, newPassword) {
    return apiPost('updatePassword', { supervisorId, newPassword });
}

// ── Supervisor actions ────────────────────────────────────────

async function apiPunchIn(shift, punchData) {
    return apiPost('punchIn', {
        supervisorId:   STATE.currentUser?.id,
        supervisorName: STATE.currentUser?.name,
        shift,
        ...punchData,
    });
}

async function apiSubmitReport(record) {
    return apiPost('submitReport', {
        supervisorId: STATE.currentUser?.id,
        ...record,
    });
}

// ── Admin actions — pass adminId for server-side role check ───

async function apiFetchAttendance(fromDate, toDate, supervisorId = '') {
    const params = { fromDate, toDate, adminId: STATE.currentUser?.id };
    if (supervisorId) params.supervisorId = supervisorId;
    return apiGet('getAttendance', params);
}

async function apiFetchReports(params = {}) {
    return apiGet('getReports', { adminId: STATE.currentUser?.id, ...params });
}
// ── Supervisor management ─────────────────────────────────

async function apiListSupervisors() {
    return apiGet('listSupervisors', { adminId: STATE.currentUser?.id });
}

async function apiResetPassword(supervisorId) {
    return apiPost('resetPassword', {
        supervisorId,
        adminId: STATE.currentUser?.id
    });
}

async function apiAddSupervisor(supervisorId, name, role = 'supervisor', password = '') {
    return apiPost('addSupervisor', {
        supervisorId,
        name,
        role,
        password,
        adminId: STATE.currentUser?.id
    });
}

async function apiEditSupervisor(supervisorId, name) {
    return apiPost('editSupervisor', {
        supervisorId,
        name,
        adminId: STATE.currentUser?.id
    });
}

async function apiSetPassword(supervisorId, newPassword) {
    return apiPost('setPassword', {
        supervisorId,
        newPassword,
        adminId: STATE.currentUser?.id
    });
}

async function apiDeleteSupervisor(supervisorId) {
    return apiPost('deleteSupervisor', {
        supervisorId,
        adminId: STATE.currentUser?.id
    });
}

// ── Complaints / service tickets ──────────────────────────────
// Scoped server-side by the caller's role: a supervisor only ever
// gets their own tickets back, service and admin get the full queue.

// `complaint` may carry direction: 'TO_SUPERVISOR' + assignedTo when the
// service team / an admin raises an issue FOR a supervisor. Omitted, the
// server defaults to TO_SERVICE — the original supervisor→service flow.
async function apiRaiseComplaint(complaint) {
    return apiPost('raiseComplaint', {
        supervisorId: STATE.currentUser?.id,
        ...complaint,
    });
}

// With no fromDate/toDate the server returns the last 2 days of CLOSED
// history plus every ticket still open — small and fast. Pass dates only
// when the user actually picks a range.
async function apiFetchComplaints(params = {}) {
    return apiGet('getComplaints', {
        requesterId: STATE.currentUser?.id,
        ...params,
    });
}

async function apiUpdateComplaint(ticketId, op, resolution = '') {
    return apiPost('updateComplaint', {
        actorId: STATE.currentUser?.id,
        ticketId,
        op,
        resolution,
    });
}

// Supervisor id+name list for the "assign to" dropdown and the admin's
// "filter by supervisor" control. Separate from apiListSupervisors(),
// which returns passwords and stays admin-only.
async function apiListSupervisorsForAssign() {
    return apiGet('listSupervisorsForAssign', { requesterId: STATE.currentUser?.id });
}

// ── Site inspections (service team observations) ──────────────
// Photo is NOT uploaded — it goes to Telegram from the device via the
// share sheet, same as a supervisor's field report.

async function apiSubmitInspection(inspection) {
    return apiPost('submitInspection', {
        actorId: STATE.currentUser?.id,
        ...inspection,
    });
}

async function apiFetchInspections(params = {}) {
    return apiGet('getInspections', {
        requesterId: STATE.currentUser?.id,
        ...params,
    });
}

// ── Employee directory (public — needed before login) ─────────

async function apiGetEmployees() {
    return apiGet('getEmployees', {});
}
