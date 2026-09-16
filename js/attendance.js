// ============================================================
// ATTENDANCE.JS — Manual slide-toggle punch In/Out (photo-gated),
//   with a fixed-cutoff auto-close as a forgotten-punch-out safety
//   net only. Photo capture no longer auto-punches — a deliberate
//   toggle slide is the only way to punch in or out. This replaced
//   the earlier fully-automatic design specifically because a plain
//   tap-button (or auto-trigger on any photo) was too easy to fire
//   by accident (e.g. a stray tap in bright sunlight/glare).
//
//   Punch IN  (toggle OFF→ON): opens the camera in "punch-in" mode —
//              capture + confirm records the IN, then the normal
//              vendor report form opens using that same photo.
//   Punch OUT (toggle ON→OFF): opens the camera in "punch-out" mode —
//              capture + confirm records the OUT only, no report form.
//
//   Session 1 (morning):  window before 3:00 PM · auto-closed 2:00 PM
//   Session 2 (evening):  window at/after 3:00 PM · auto-closed 11:00 PM
//   Auto-close only fires if the supervisor never slid the toggle
//   off themselves — it's a safety net, not the primary path.
// ============================================================

const ATT_LS_KEY = 'vd_attendance';

// Session 2 begins at 3:00 PM — first capture at/after this time is 2nd IN.
const SESSION2_START_MIN   = 15 * 60;       // 3:00 PM
// Auto-close cutoffs (if session was opened but never closed by then).
const SESSION1_AUTOOUT_MIN = 14 * 60;       // 2:00 PM
const SESSION2_AUTOOUT_MIN = 23 * 60;       // 11:00 PM

// ── Persistence (per device, ISO date key) ────────────────────

function _attKey() {
    return `${STATE.currentUser?.id}_${formatDateISO(new Date())}`;
}

function loadAttendanceToday() {
    try {
        const all = JSON.parse(localStorage.getItem(ATT_LS_KEY) || '{}');
        STATE.attendanceToday = all[_attKey()] || {
            in1: null, out1: null, in2: null, out2: null
        };
    } catch (e) {
        STATE.attendanceToday = { in1: null, out1: null, in2: null, out2: null };
    }
}

function saveAttendanceToday() {
    try {
        const all = JSON.parse(localStorage.getItem(ATT_LS_KEY) || '{}');
        all[_attKey()] = STATE.attendanceToday;
        localStorage.setItem(ATT_LS_KEY, JSON.stringify(all));
    } catch (e) { console.warn('Attendance save error', e); }
}

// ── Send a punch to the backend + persist locally ─────────────

async function _recordPunch(punchType, when, auto) {
    const sessionKey = { '1st_in': 'in1', '1st_out': 'out1', '2nd_in': 'in2', '2nd_out': 'out2' }[punchType];

    const pos = STATE.currentPosition || {};
    const time = formatTime(when);

    const punchData = {
        punchType,
        supervisorId:   STATE.currentUser?.id   || 'unknown',
        supervisorName: STATE.currentUser?.name || 'unknown',
        time,
        lat: pos.latitude  ?? null,
        lon: pos.longitude ?? null,
        village: STATE.currentLocationName || 'Unknown',
        date: formatDateISO(when),
        auto: !!auto,
    };

    STATE.attendanceToday[sessionKey] = { time, lat: punchData.lat, lon: punchData.lon, auto: !!auto };
    saveAttendanceToday();

    let statusLabel = '';
    const mins = nowMinutes();
    if (punchType === '1st_in') statusLabel = mins > (7 * 60 + 30) ? ' (Late)' : ' (On-Time)';
    if (punchType === '2nd_in') statusLabel = mins > (17 * 60)     ? ' (Late)' : ' (On-Time)';

    const res = await apiPost('punch', punchData);
    const tag = auto ? ' [auto]' : '';
    if (res.ok && res.data?.success) {
        showMessage(`✅ Attendance recorded at ${time}${statusLabel}${tag}`, 'success');
    } else {
        console.warn('Punch sync issue:', res.data?.error || res.reason);
    }

    updateAttendanceStatusUI();
}

// ── Which session is "current" right now, and whether it's open ───
// Drives both what the toggle shows and what a slide actually records.
// Mirrors the old auto-punch window logic (session 2 starts 3 PM) but
// no longer fires on its own — only a deliberate toggle slide calls
// into _recordPunch now.

function _currentSessionInfo() {
    loadAttendanceToday();
    const a = STATE.attendanceToday;
    const inSession2Window = nowMinutes() >= SESSION2_START_MIN;

    if (!inSession2Window) {
        return { inKey: 'in1', outKey: 'out1', inType: '1st_in', outType: '1st_out', isOpen: !!(a.in1 && !a.out1) };
    }
    return { inKey: 'in2', outKey: 'out2', inType: '2nd_in', outType: '2nd_out', isOpen: !!(a.in2 && !a.out2) };
}

// ── Toggle slide handler — the checkbox's own 'change' event ──────
// The switch STAYS where the user slid it, immediately. Supervisors here
// are mostly non-technical: a switch that springs back while a camera
// opens reads as "it didn't work" and gets slid again and again. So the
// visual flip is instant and the caption explains the pending step
// ("Taking photo..."), while the punch itself is only written to the
// backend once the photo is confirmed in camera.js confirmPhoto().
//
// If the capture is abandoned (retake, or the camera fails to open),
// cancelPunchCapture() calls updateAttendanceStatusUI(), which snaps the
// switch back to the real stored state — so an accidental slide still
// can't create a punch, it just doesn't pretend nothing happened.

function handlePunchToggleChange(e) {
    const toggle  = e.target;
    const wantsIn = toggle.checked;   // where the user just slid it to
    const isIn    = isPunchedIn();     // what's actually recorded

    // A stray event that doesn't represent a real state change — nothing to do.
    if (wantsIn === isIn) return;

    // Leave the switch visually flipped and say what's happening next.
    setPunchTogglePending(wantsIn);

    openCamera(wantsIn ? 'punch-in' : 'punch-out');
}

// Shows the switch in its new position while the photo step is still
// pending. Deliberately does NOT touch stored attendance state.
function setPunchTogglePending(punchingIn) {
    const label = document.getElementById('punchToggleLabel');
    if (label) {
        label.textContent = punchingIn
            ? '📷 Taking photo to Punch In...'
            : '📷 Taking photo to Punch Out...';
    }
}

// ── Toggle slide handlers — called from events.js on the checkbox's
//    'change' event, AFTER the camera/confirm step (see camera.js) ───

// Slid OFF → ON: punch IN. Only records if the current session isn't
// already open (guards against a double-fire, e.g. a fast double-tap).
function recordPunchIn() {
    const info = _currentSessionInfo();
    if (info.isOpen) return;
    _recordPunch(info.inType, new Date(), false);
}

// Slid ON → OFF: punch OUT for whichever session is currently open.
function recordPunchOut() {
    loadAttendanceToday();
    const a = STATE.attendanceToday;
    // Close whichever session is actually open — usually matches
    // _currentSessionInfo(), but if the supervisor is punching out late
    // (session 2 window already started) this still closes session 1.
    if (a.in1 && !a.out1) { _recordPunch('1st_out', new Date(), false); return; }
    if (a.in2 && !a.out2) { _recordPunch('2nd_out', new Date(), false); return; }
}

// Is a session currently open? Used by the toggle UI + the camera to
// decide which mode a toggle slide should open the camera in.
function isPunchedIn() {
    const a = STATE.attendanceToday || {};
    return !!((a.in1 && !a.out1) || (a.in2 && !a.out2));
}

// ── Auto-close check — run on load and on a periodic timer ────
// Closes any session that's still open once its cutoff has passed.

function checkAutoCloseSessions() {
    loadAttendanceToday();
    const a = STATE.attendanceToday;
    const now  = new Date();
    const mins = nowMinutes();

    if (a.in1 && !a.out1 && mins >= SESSION1_AUTOOUT_MIN) {
        _recordPunch('1st_out', now, true);
    }
    if (a.in2 && !a.out2 && mins >= SESSION2_AUTOOUT_MIN) {
        _recordPunch('2nd_out', now, true);
    }

    checkPunchOutReminder();
}

// ── Punch-out reminder — sound + visual nudge ──────────────────
// Fires once a still-open session enters its last 30 minutes before
// auto-close, so a supervisor gets a chance to punch out themselves
// instead of the system silently closing it for them. In-app only:
// this can only fire while the page is open (foreground or background
// tab), since there's no push-notification server behind this app.

const PUNCH_REMINDER_LEAD_MIN = 30;
let _lastReminderChime = 0; // timestamp (ms) — throttles the beep, not the visual

function checkPunchOutReminder() {
    const a = STATE.attendanceToday || {};
    const mins = nowMinutes();

    const s1Due = a.in1 && !a.out1 && mins >= (SESSION1_AUTOOUT_MIN - PUNCH_REMINDER_LEAD_MIN) && mins < SESSION1_AUTOOUT_MIN;
    const s2Due = a.in2 && !a.out2 && mins >= (SESSION2_AUTOOUT_MIN - PUNCH_REMINDER_LEAD_MIN) && mins < SESSION2_AUTOOUT_MIN;
    const due = s1Due || s2Due;

    const status = document.getElementById('punchStatus');
    if (status) status.classList.toggle('reminder-due', due);

    if (due) {
        // Re-chime at most once every 5 minutes while still open — noticeable
        // without being annoying on every 60s poll.
        const now = Date.now();
        if (now - _lastReminderChime > 5 * 60 * 1000) {
            _lastReminderChime = now;
            playReminderChime();
            showMessage('⏰ Reminder: please punch out soon — the session auto-closes shortly.', 'error');
        }
    }
}

// Short two-tone beep via WebAudio — no audio file to fetch/cache, works
// offline, and is loud enough to notice without needing device media
// permissions. Silently no-ops if the browser blocks audio without a
// prior user gesture (some mobile browsers) — the visual pulse still shows.
function playReminderChime() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        [880, 660].forEach((freq, i) => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.001, ctx.currentTime);
            const start = ctx.currentTime + i * 0.3;
            gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
            osc.connect(gain).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.3);
        });
        setTimeout(() => ctx.close(), 800);
    } catch (e) { /* audio unavailable — visual reminder still applies */ }
}

// ── Toggle switch UI ────────────────────────────────────────────

// Keeps the checkbox's ON/OFF position, label, and status line in sync
// with actual attendance state. Called after every punch, on page
// load, and after a report cycle finishes — never assume the toggle's
// current DOM state is correct without calling this first.
function updateAttendanceStatusUI() {
    const toggle = document.getElementById('punchToggleInput');
    const label  = document.getElementById('punchToggleLabel');
    const status = document.getElementById('punchStatus');
    if (!toggle) return;

    const punchedIn = isPunchedIn();
    toggle.checked = punchedIn;
    if (label) {
        label.textContent = punchedIn
            ? '👈 Slide left to Punch Out'
            : '👉 Slide right to Punch In';
    }

    if (!status) return;
    const a = STATE.attendanceToday || {};
    const parts = [];
    if (a.in1)  parts.push(`1st IN ${a.in1.time}`);
    if (a.out1) parts.push(`1st OUT ${a.out1.time}${a.out1.auto ? ' (auto)' : ''}`);
    if (a.in2)  parts.push(`2nd IN ${a.in2.time}`);
    if (a.out2) parts.push(`2nd OUT ${a.out2.time}${a.out2.auto ? ' (auto)' : ''}`);
    status.textContent = parts.join('  •  ');
}

// Backwards-compatible alias — report.js calls this after a report cycle.
function updatePunchButton() {
    updateAttendanceStatusUI();
}

// Called when arriving at supervisor page.
function updateAttendanceUI() {
    loadAttendanceToday();
    checkAutoCloseSessions();
    const wrap = document.getElementById('punchActionWrap');
    if (wrap) wrap.style.display = 'block';
    updateAttendanceStatusUI();
}
