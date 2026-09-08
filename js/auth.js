// ============================================================
// AUTH.JS — Login, logout, session management, password change
//           Credentials are validated locally first.
//           When CONFIG.SCRIPT_URL is set, server validates too.
// ============================================================

const AUTH_LS_KEY  = 'vd_session';
const CREDS_LS_KEY = 'vd_creds'; // { [id]: { hash, forceChange } }

// ── Session ──────────────────────────────────────────────────

function saveSession(user, forceChange = false) {
    const session = {
        id: user.id,
        name: user.name,
        role: user.role,
        token: generateToken(),
        expiry: Date.now() + CONFIG.SESSION_HOURS * 3600 * 1000,
        forceChange: forceChange,
    };
    localStorage.setItem(AUTH_LS_KEY, JSON.stringify(session));
    STATE.currentUser = { id: user.id, name: user.name, role: user.role };
    STATE.sessionToken = session.token;
    STATE.forceChangePassword = forceChange;
}

function loadSession() {
    try {
        const raw = localStorage.getItem(AUTH_LS_KEY);
        if (!raw) return false;
        const session = JSON.parse(raw);
        if (Date.now() > session.expiry) {
            localStorage.removeItem(AUTH_LS_KEY);
            return false;
        }
        STATE.currentUser = { id: session.id, name: session.name, role: session.role };
        STATE.sessionToken = session.token;
        STATE.forceChangePassword = session.forceChange || false;
        return true;
    } catch (e) {
        return false;
    }
}

function clearSession() {
    localStorage.removeItem(AUTH_LS_KEY);
    STATE.currentUser = null;
    STATE.sessionToken = null;
}

// ── Password storage ─────────────────────────────────────────

function getStoredCreds() {
    try {
        return JSON.parse(localStorage.getItem(CREDS_LS_KEY) || '{}');
    } catch (e) { return {}; }
}

function setStoredCred(id, password, forceChange = false) {
    const creds = getStoredCreds();
    creds[id] = { hash: simpleHash(password), forceChange };
    localStorage.setItem(CREDS_LS_KEY, JSON.stringify(creds));
}

function isFirstLogin(id) {
    const creds = getStoredCreds();
    return !creds[id]; // never set a password locally = first login
}

function verifyPassword(id, password) {
    const creds = getStoredCreds();
    if (creds[id]) {
        return creds[id].hash === simpleHash(password);
    }
    // Default password = their ID (first login)
    return password === id;
}

function needsForceChange(id) {
    if (isFirstLogin(id)) return true;
    const creds = getStoredCreds();
    return creds[id]?.forceChange === true;
}

// ── Login flow ────────────────────────────────────────────────

async function doLogin() {
    const idInput = document.getElementById('loginId');
    const pwInput = document.getElementById('loginPw');
    const errEl   = document.getElementById('loginError');

    const id = idInput.value.trim();
    const pw = pwInput.value;

    errEl.classList.remove('active');

    if (!id || !pw) {
        errEl.textContent = '❌ Please enter your ID and password.';
        errEl.classList.add('active');
        return;
    }

    let employee = findEmployee(id);
    if (!employee) {
        // Not in the local cache yet — try a live refresh (e.g. a
        // just-added supervisor logging in for the first time on this device).
        await refreshEmployeeList();
        employee = findEmployee(id);
    }
    if (!employee) {
        errEl.textContent = '❌ Employee ID not found.';
        errEl.classList.add('active');
        return;
    }

    // Try server-side validation first (secure)
    const res = await apiValidateLogin(id, pw);
    if (res.ok && res.data?.success && res.data?.user) {
        // Server validated successfully
        const forceChange = res.data?.forceChange || false;
        saveSession(res.data.user, forceChange);
        idInput.value = '';
        pwInput.value = '';

        // If temporary password, force password change
        if (forceChange) {
            showPage('page-change-pw');
            return;
        }

        goToRolePage();
        return;
    }

    // If server validation failed, check if it's an API error or auth error
    if (!res.ok) {
        // No server connection - fallback to local validation (offline mode)
        if (!verifyPassword(id, pw)) {
            errEl.textContent = '❌ Incorrect password. (Offline mode)';
            errEl.classList.add('active');
            return;
        }
        // Local auth passed - check if force change needed
        const forceChange = needsForceChange(id);
        saveSession(employee, forceChange);
        idInput.value = '';
        pwInput.value = '';

        // If temporary password, force password change
        if (forceChange) {
            showPage('page-change-pw');
            return;
        }

        goToRolePage();
        return;
    }

    // Server returned auth error
    errEl.textContent = res.data?.error || '❌ Incorrect password.';
    errEl.classList.add('active');
}

async function doChangePassword() {
    const newPw     = document.getElementById('newPassword').value;
    const confirmPw = document.getElementById('confirmPassword').value;
    const errEl     = document.getElementById('changePwError');

    errEl.classList.remove('active');

    if (newPw.length < 4) {
        errEl.textContent = '❌ Password must be at least 4 characters.';
        errEl.classList.add('active');
        return;
    }

    if (newPw !== confirmPw) {
        errEl.textContent = '❌ Passwords do not match.';
        errEl.classList.add('active');
        return;
    }

    if (newPw === STATE.currentUser.id) {
        errEl.textContent = '❌ New password cannot be same as your ID.';
        errEl.classList.add('active');
        return;
    }

    // Update locally
    setStoredCred(STATE.currentUser.id, newPw, false);

    // Update on backend (clears forceChange flag)
    const res = await apiUpdatePassword(STATE.currentUser.id, newPw);
    if (res.ok) {
        console.log('Password updated on backend');
        STATE.forceChangePassword = false;
    } else {
        console.warn('Failed to update password on backend:', res);
    }

    showMessage('✓ Password changed successfully!', 'success');

    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';

    goToRolePage();
}

function doLogout() {
    clearSession();
    showPage('page-login');
}

function goToRolePage() {
    if (!STATE.currentUser) return;

    // If temporary password, force password change first
    if (STATE.forceChangePassword) {
        showPage('page-change-pw');
        return;
    }

    // Update header name displays
    const supHeader = document.getElementById('headerUser');
    if (supHeader) supHeader.textContent = STATE.currentUser.name + ' · ID ' + STATE.currentUser.id;
    const admHeader = document.getElementById('adminHeaderUser');
    if (admHeader) admHeader.textContent = STATE.currentUser.name;

    if (STATE.currentUser.role === 'admin') {
        showPage('page-admin');
        initAdminDashboard();
    } else if (STATE.currentUser.role === 'service') {
        showPage('page-service');
        initServiceDashboard();
    } else {
        showPage('page-supervisor');
        stopCamera();          // always show the "Open Camera" button first
        updateAttendanceUI();
    }
}
