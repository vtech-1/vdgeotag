// ============================================================
// INSPECTIONS.JS — Site inspection reports filed by the service team.
//
// A service visit often turns up things that aren't anyone's complaint
// yet: a machine that isn't being maintained, dust in a tank. This
// captures the evidence — photo + VLCC + location + remarks — and puts
// it in front of the admin and service admin teams.
//
// The photo is NOT uploaded. It goes to Telegram straight from the
// device via the share sheet, exactly like a supervisor's field report,
// so there's no Drive quota, no extra OAuth scope, and nothing slow to
// wait on over field 4G.
// ============================================================

// Repaints the GPS bar while the page is open. GPS is a global watch
// started in app.js, so a fix can land seconds AFTER this page opens —
// without a refresh the bar would sit on "Getting location..." even
// though coordinates had arrived.
let _insGpsTimer = null;

function initInspectionPage() {
    const hdr = document.getElementById('inspectionHeaderUser');
    if (hdr && STATE.currentUser) {
        hdr.textContent = STATE.currentUser.name + ' · ID ' + STATE.currentUser.id;
    }

    resetInspectionForm();

    updateInspectionGps();
    clearInterval(_insGpsTimer);
    _insGpsTimer = setInterval(updateInspectionGps, 3000);
}

// Called when leaving the page — a timer left running would keep firing
// against elements nobody is looking at.
function stopInspectionGpsWatch() {
    clearInterval(_insGpsTimer);
    _insGpsTimer = null;
}

function updateInspectionGps() {
    const bar  = document.getElementById('insGpsBar');
    const icon = document.getElementById('insGpsIcon');
    const text = document.getElementById('insGpsText');
    if (!bar || !text) return;

    const pos = STATE.currentPosition;

    if (!pos) {
        bar.classList.remove('ins-gps-ok');
        if (icon) icon.textContent = '🛰️';
        text.textContent = 'Getting location... you can still take the photo.';
        return;
    }

    bar.classList.add('ins-gps-ok');
    if (icon) icon.textContent = '📍';

    const place = STATE.currentLocationName;
    text.textContent = place
        ? `${place}  ·  ${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`
        : `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`;

    // Fill the Location field once a place name is known, without
    // overwriting anything the user has typed themselves.
    const loc = document.getElementById('insLocation');
    if (loc && !loc.value && place) loc.value = place;
}

function resetInspectionForm() {
    ['insVlcc', 'insLocation', 'insRemarks'].forEach(id => {
        const el = document.getElementById(id);
        // Keep the location — it's GPS-derived and still correct for the
        // next observation at the same site.
        if (el && id !== 'insLocation') el.value = '';
    });

    STATE.inspectionPhoto = null;

    const img = document.getElementById('insPreviewImg');
    if (img) img.src = '';
    document.getElementById('insPhotoPreview')?.classList.remove('active');
    document.getElementById('insPhotoActions')?.classList.remove('active');

    // Release the camera — leaving the stream open keeps the phone's
    // camera light on and drains the battery while they type.
    stopInspectionCamera();

    const err = document.getElementById('inspectionError');
    err?.classList.remove('active');

    setInspectionStep('capture');
}

// The page has two steps: capture+fill, then share. Sharing needs the
// photo still in memory, so the form is only cleared after that.
function setInspectionStep(step) {
    const submitBtn = document.getElementById('insSubmitBtn');
    const shareWrap = document.getElementById('insShareWrap');
    if (!submitBtn || !shareWrap) return;

    const sharing = step === 'share';
    submitBtn.style.display = sharing ? 'none'  : 'block';
    shareWrap.style.display = sharing ? 'flex'  : 'none';
}

// ── Camera (own elements) ─────────────────────────────────────
// This page cannot reuse the supervisor page's camera: those elements live
// inside #page-supervisor, which is hidden whenever this page is showing,
// so the stream would render into an invisible <video>. Same capture and
// overlay logic, pointed at this page's own IDs.

// Tracks whether this page has opened the camera yet, so the back-camera
// default is applied once rather than overriding a deliberate Flip.
let _insCameraUsed = false;

async function openInspectionCamera() {
    const openBtn = document.getElementById('insOpenCameraBtn');
    const video   = document.getElementById('insVideoFeed');
    const camBtns = document.getElementById('insCameraButtons');

    // Start on the BACK camera. The app-wide default is the front one
    // (right for an attendance selfie, wrong for photographing a dusty
    // machine). Only forced on the first open, so a later Flip sticks.
    if (!_insCameraUsed) {
        STATE.cameraFacingMode = 'environment';
        _insCameraUsed = true;
    }

    if (openBtn) { openBtn.disabled = true; openBtn.textContent = '⏳ Starting camera...'; }

    try {
        STATE.videoStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: STATE.cameraFacingMode,
                width:  { ideal: 1280 },
                height: { ideal: 720 },
            },
        });

        video.srcObject = STATE.videoStream;

        let isFront = STATE.cameraFacingMode === 'user';
        try {
            const facing = STATE.videoStream.getVideoTracks()[0].getSettings().facingMode;
            if (facing) isFront = (facing === 'user');
        } catch (e) { /* fall back to the requested mode */ }
        video.classList.toggle('mirrored', isFront);

        await video.play();

        video.style.display   = 'block';
        camBtns.style.display = 'flex';
        if (openBtn) openBtn.style.display = 'none';
    } catch (e) {
        console.error(e);
        showMessage('📷 Camera not available', 'error');
        if (openBtn) {
            openBtn.disabled = false;
            openBtn.textContent = '📷 Take Photo';
        }
    }
}

function stopInspectionCamera() {
    if (STATE.videoStream) {
        STATE.videoStream.getTracks().forEach(t => t.stop());
        STATE.videoStream = null;
    }
    const openBtn = document.getElementById('insOpenCameraBtn');
    const video   = document.getElementById('insVideoFeed');
    const camBtns = document.getElementById('insCameraButtons');

    if (video)   { video.style.display = 'none'; video.srcObject = null; }
    if (camBtns) camBtns.style.display = 'none';
    if (openBtn) {
        openBtn.style.display = 'block';
        openBtn.disabled = false;
        openBtn.textContent = '📷 Take Photo';
    }
}

async function flipInspectionCamera() {
    const original = STATE.cameraFacingMode;
    STATE.cameraFacingMode = (STATE.cameraFacingMode === 'environment') ? 'user' : 'environment';
    if (STATE.videoStream) STATE.videoStream.getTracks().forEach(t => t.stop());
    try {
        await openInspectionCamera();
    } catch (e) {
        STATE.cameraFacingMode = original;
        await openInspectionCamera();
    }
}

function captureInspectionPhoto() {
    const video = document.getElementById('insVideoFeed');
    if (!video || !video.videoWidth || !video.videoHeight) {
        showMessage('Camera is not ready.', 'error');
        return;
    }

    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const width  = video.videoWidth;
    const height = video.videoHeight;

    let isFront = STATE.cameraFacingMode === 'user';
    try {
        const track  = STATE.videoStream && STATE.videoStream.getVideoTracks()[0];
        const facing = track && track.getSettings().facingMode;
        if (facing) isFront = (facing === 'user');
    } catch (e) { /* fall back to the requested mode */ }

    // Counter-rotate for how the phone is being held, same as camera.js —
    // otherwise a landscape shot comes out sideways.
    let angle = 0;
    if (window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
        angle = window.screen.orientation.angle;
    } else if (typeof window.orientation === 'number') {
        angle = (window.orientation + 360) % 360;
    }

    const swap = (angle === 90 || angle === 270);
    canvas.width  = swap ? height : width;
    canvas.height = swap ? width  : height;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    if (isFront) ctx.scale(-1, 1);
    ctx.drawImage(video, -width / 2, -height / 2, width, height);
    ctx.restore();

    // Same GPS/time stamp the supervisor photos carry — it's the evidence
    // that this observation was made at that site at that time.
    addPhotoOverlay(ctx, canvas.width, canvas.height);

    onInspectionPhotoReady(canvas.toDataURL('image/jpeg', 0.90));
    stopInspectionCamera();
}

function onInspectionPhotoReady(dataUrl) {
    STATE.inspectionPhoto = dataUrl;

    const img = document.getElementById('insPreviewImg');
    if (img) img.src = dataUrl;
    document.getElementById('insPhotoPreview')?.classList.add('active');
    document.getElementById('insPhotoActions')?.classList.add('active');
}

function retakeInspectionPhoto() {
    STATE.inspectionPhoto = null;
    const img = document.getElementById('insPreviewImg');
    if (img) img.src = '';
    document.getElementById('insPhotoPreview')?.classList.remove('active');
    document.getElementById('insPhotoActions')?.classList.remove('active');
    openInspectionCamera();
}

// The photo is confirmed by just leaving it on screen — this only hides
// the retake/confirm pair so the form below is the obvious next step.
function confirmInspectionPhoto() {
    document.getElementById('insPhotoActions')?.classList.remove('active');
    document.getElementById('insVlcc')?.focus();
}

async function handleSubmitInspection() {
    const vlccEl    = document.getElementById('insVlcc');
    const locEl     = document.getElementById('insLocation');
    const remarksEl = document.getElementById('insRemarks');
    const errEl     = document.getElementById('inspectionError');
    const btn       = document.getElementById('insSubmitBtn');

    const fail = msg => {
        errEl.textContent = '❌ ' + msg;
        errEl.classList.add('active');
    };
    errEl.classList.remove('active');

    if (!STATE.inspectionPhoto) return fail('Please take a photo first.');

    const vlcc    = vlccEl.value.trim();
    const loc     = locEl.value.trim();
    const remarks = remarksEl.value.trim();

    if (!vlcc)    return fail('VLCC code is required.');
    if (!loc)     return fail('Location is required.');
    if (!remarks) return fail('Please write what you observed.');

    btn.disabled = true;
    btn.textContent = '⏳ Submitting...';

    const pos = STATE.currentPosition || {};
    const res = await apiSubmitInspection({
        vlccCode: vlcc,
        location: loc,
        remarks,
        lat: pos.latitude  ?? '',
        lon: pos.longitude ?? '',
    });

    btn.disabled = false;
    btn.textContent = '📤 Submit Inspection';

    if (res.ok && res.data?.success) {
        showMessage(`✅ Inspection ${res.data.inspectionId} saved`, 'success');
        setInspectionStep('share');
    } else {
        fail(res.data?.error || 'Failed to submit inspection');
    }
}

// ── Telegram share ────────────────────────────────────────────
// Mirrors shareReport() in report.js: same Web Share path, same
// fallback modal when the browser has no share sheet.

async function shareInspection() {
    if (!STATE.inspectionPhoto) {
        showMessage('📷 No photo to share', 'error');
        return;
    }

    // Mirrors shareReport() in report.js: same header rule, same field
    // order (who → when → where → map link → details → GPS footer), so a
    // group receiving both kinds of message reads them the same way.
    const now     = serverNow();
    const pos     = STATE.currentPosition;
    const mapsUrl = pos ? mapsLink(pos.latitude, pos.longitude) : '';

    const insVal = id => document.getElementById(id)?.value.trim() || '-';

    const raisedBy = STATE.currentUser
        ? `Service Team: ${STATE.currentUser.name} (ID: ${STATE.currentUser.id})`
        : '';

    const msg = `Site Inspection Report
════════════════════════
${raisedBy}
📅 Date: ${formatDate(now)}
⏰ Time: ${formatTimeHM(now)}
📍 Location: ${insVal('insLocation')}
${mapsUrl}

INSPECTION DETAILS:
VLCC Code: ${insVal('insVlcc')}
Remarks: ${insVal('insRemarks')}

GPS: ${pos ? `${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)}` : 'unavailable'}`;

    if (navigator.share) {
        try {
            const blob = await (await fetch(STATE.inspectionPhoto)).blob();
            await navigator.share({
                title: 'Site Inspection',
                text:  msg,
                files: [new File([blob], 'inspection.jpg', { type: 'image/jpeg' })],
            });
            showMessage('✅ Inspection shared to Telegram', 'success');
        } catch (e) {
            if (e.name !== 'AbortError') showInspectionShareFallback(msg);
        }
    } else {
        showInspectionShareFallback(msg);
    }
}

function showInspectionShareFallback(msg) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    const safe = msg.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
            <div class="modal-title">Share Options</div>
            <p style="margin-bottom:16px;font-size:13px;color:#666;">Web Share not supported. Use one of these:</p>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <button class="btn btn-primary" onclick="dlInspectionPhoto()">📷 Download Photo</button>
                <button class="btn btn-primary" onclick="cpText('${safe}')">📋 Copy Report Text</button>
                <button class="btn btn-primary" onclick="dlText('${safe}')">📄 Download Text File</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function dlInspectionPhoto() {
    const a = document.createElement('a');
    a.href = STATE.inspectionPhoto;
    a.download = `inspection_${formatDate(new Date())}.jpg`;
    a.click();
    showMessage('✅ Photo downloaded', 'success');
}

async function handleInspectionShareClick() {
    await shareInspection();
    resetInspectionForm();
}

function handleInspectionSkipShare() {
    resetInspectionForm();
}

// ── Inspections table (admin + service admin) ─────────────────

const INS_TABLE_COLS = 6;

async function loadInspections(tbodyId, opts = {}) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    tableLoading(tbodyId, INS_TABLE_COLS, '⏳ Loading inspections...');

    const res = await apiFetchInspections(opts.params || {});
    if (!res.ok || !Array.isArray(res.data?.rows)) {
        tableLoading(tbodyId, INS_TABLE_COLS, '⚠️ Failed to load inspections');
        return;
    }

    STATE.inspections = res.data.rows;
    renderInspections(tbodyId);
}

function renderInspections(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const rows = STATE.inspections || [];
    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${INS_TABLE_COLS}" class="no-records">No inspections found</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => {
        const loc = (r.lat && r.lon)
            ? `<a href="${mapsLink(r.lat, r.lon)}" target="_blank" class="map-link">${escapeHtml(r.location)}</a>`
            : escapeHtml(r.location || '--');

        return `<tr>
            <td><strong>${escapeHtml(r.inspectionId)}</strong></td>
            <td>${formatDateDMY(r.date)}<br><small style="color:#888;">${escapeHtml(r.time)}</small></td>
            <td>${escapeHtml(r.raisedByName || '--')}<br><small style="color:#888;">${escapeHtml(r.raisedById || '')}</small></td>
            <td>${escapeHtml(r.vlccCode || '--')}</td>
            <td>${loc}</td>
            <td>${escapeHtml(r.remarks || '--')}</td>
        </tr>`;
    }).join('');
}

function exportInspectionsCSV() {
    const rows = STATE.inspections || [];
    if (rows.length === 0) {
        showMessage('No inspections to export', 'error');
        return;
    }

    const header = ['Inspection ID', 'Date', 'Time', 'Raised By ID', 'Raised By',
                    'VLCC Code', 'Location', 'Lat', 'Lon', 'Remarks'];

    const body = rows.map(r => [
        r.inspectionId, formatDateDMY(r.date), r.time,
        r.raisedById, r.raisedByName, r.vlccCode, r.location,
        r.lat ?? '', r.lon ?? '', r.remarks,
    ]);

    const csv = [header, ...body]
        .map(cols => cols.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');

    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
                 `inspections_${formatDate(new Date())}.csv`);
    showMessage('✅ Inspections exported', 'success');
}
