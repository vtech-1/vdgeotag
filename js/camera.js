// ============================================================
// CAMERA.JS — Camera start, flip, capture, photo overlay
//
// CAPTURE MODE — set by whatever triggered the camera, read by
// capturePhoto()/confirmPhoto() to decide what happens after a photo
// is confirmed:
//   'report'    (default) — normal vendor-visit report flow, unchanged
//   'punch-in'  — triggered by sliding the attendance toggle ON
//   'punch-out' — triggered by sliding the attendance toggle OFF
// ============================================================

let _cameraCaptureMode = 'report';

async function startCamera() {
    try {
        const constraints = {
            audio: false,
            video: {
                facingMode: STATE.cameraFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        STATE.videoStream = await navigator.mediaDevices.getUserMedia(constraints);

        const video = document.getElementById('videoFeed');
        video.srcObject = STATE.videoStream;

        // Mirror the on-screen preview for the front camera only (feels like a
        // mirror). Capture un-mirrors it so the saved photo looks normal.
        // Use the live track settings so the preview matches the real hardware.
        let isFront = STATE.cameraFacingMode === 'user';
        try {
            const facing = STATE.videoStream.getVideoTracks()[0].getSettings().facingMode;
            if (facing) isFront = (facing === 'user');
        } catch (e) { /* fall back to requested mode */ }
        video.classList.toggle('mirrored', isFront);

        await video.play();

    } catch (e) {
        console.error(e);
        showMessage('📷 Camera not available', 'error');
    }
}

// On page load: if camera permission was already granted (user allowed
// it on a previous visit), start the camera automatically. Otherwise
// leave the "Open Camera" button so the first tap triggers the prompt.
async function autoStartCameraIfAllowed() {
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const status = await navigator.permissions.query({ name: 'camera' });
            if (status.state === 'granted') {
                await openCamera();
                return;
            }
        }
    } catch (e) {
        // Permissions API unsupported for 'camera' (e.g. Firefox/iOS) — fall through
    }
    // Not yet granted (or unknown) → show the Open Camera button
    stopCamera();
}

// Camera-on-demand: opens only when the supervisor taps "Open Camera",
// or when the attendance toggle is slid (see attendance.js / events.js).
// `mode` — see the CAPTURE MODE note at the top of this file.
async function openCamera(mode = 'report') {
    _cameraCaptureMode = mode;

    const openBtn = document.getElementById('openCameraBtn');
    const video   = document.getElementById('videoFeed');
    const camBtns = document.getElementById('cameraButtons');
    const title   = document.getElementById('cameraSectionTitle');

    if (title) {
        title.textContent = mode === 'punch-in'  ? '📷 Punch In — Take a Photo'
                           : mode === 'punch-out' ? '📷 Punch Out — Take a Photo'
                           : '📷 Photo Capture';
    }

    if (openBtn) { openBtn.disabled = true; openBtn.textContent = '⏳ Starting camera...'; }

    await startCamera();

    if (STATE.videoStream) {
        if (video)   video.style.display   = 'block';
        if (camBtns) camBtns.style.display = 'flex';
        if (openBtn) openBtn.style.display = 'none';
    } else if (openBtn) {
        openBtn.disabled = false;
        openBtn.textContent = '📷 Open Camera';
        // Camera failed to start — bail out of whatever punch mode was
        // requested so the toggle doesn't get stuck mid-flight.
        if (mode !== 'report') cancelPunchCapture();
    }
}

// Stop the stream + reset camera UI back to the "Open Camera" button.
function stopCamera() {
    if (STATE.videoStream) {
        STATE.videoStream.getTracks().forEach(t => t.stop());
        STATE.videoStream = null;
    }
    const openBtn = document.getElementById('openCameraBtn');
    const video   = document.getElementById('videoFeed');
    const camBtns = document.getElementById('cameraButtons');
    const title   = document.getElementById('cameraSectionTitle');
    if (video)   { video.style.display = 'none'; video.srcObject = null; }
    if (camBtns) camBtns.style.display = 'none';
    if (openBtn) { openBtn.style.display = 'block'; openBtn.disabled = false; openBtn.textContent = '📷 Open Camera'; }
    if (title)   { title.textContent = '📷 Photo Capture'; }
}

async function flipCamera() {
    if (STATE.videoStream) {
        STATE.videoStream.getTracks().forEach(t => t.stop());
    }
    const original = STATE.cameraFacingMode;
    STATE.cameraFacingMode = (STATE.cameraFacingMode === 'environment') ? 'user' : 'environment';
    try {
        await startCamera();
    } catch (e) {
        // Revert if new mode fails
        STATE.cameraFacingMode = original;
        await startCamera();
        showMessage('⚠️ Front camera not available. Using back camera.', 'error');
    }
}

function capturePhoto() {
    const video = document.getElementById('videoFeed');

    if (!video.videoWidth || !video.videoHeight) {
        showMessage('Camera is not ready.', 'error');
        return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = video.videoWidth;
    const height = video.videoHeight;

    // ── Detect front vs back camera (for mirror) ──
    // Read the LIVE track settings (what the hardware is actually doing) rather
    // than the requested mode — more reliable across devices.
    let isFrontCamera = STATE.cameraFacingMode === 'user';
    try {
        const track = STATE.videoStream && STATE.videoStream.getVideoTracks()[0];
        const facing = track && track.getSettings().facingMode;
        if (facing) isFrontCamera = (facing === 'user');
    } catch (e) { /* getSettings unsupported — fall back to requested mode */ }

    // ── Detect device orientation (for rotation) ──
    // The camera sensor has a fixed orientation. When the phone is held
    // landscape/upside-down, the raw frame comes out rotated — so the saved
    // head points sideways/down. Rotate the canvas to counteract it so the
    // photo matches how the phone was actually held (head up).
    let angle = 0;
    if (window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
        angle = window.screen.orientation.angle;         // 0, 90, 180, 270
    } else if (typeof window.orientation === 'number') {
        angle = (window.orientation + 360) % 360;         // older iOS/Safari
    }

    // For 90°/270° the image swaps width/height (landscape frame → the output
    // dimensions rotate too).
    const swap = (angle === 90 || angle === 270);
    canvas.width  = swap ? height : width;
    canvas.height = swap ? width  : height;

    ctx.save();
    // Move origin to canvas centre, rotate, then draw the frame centred.
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    if (isFrontCamera) ctx.scale(-1, 1);   // un-mirror the selfie
    ctx.drawImage(video, -width / 2, -height / 2, width, height);
    ctx.restore();

    // Add GPS / Location overlay (drawn after restore, so it's always upright
    // at the bottom of the final image, never rotated or mirrored)
    addPhotoOverlay(ctx, canvas.width, canvas.height);

    STATE.capturedPhoto = canvas.toDataURL('image/jpeg', 0.90);

    document.getElementById('previewImg').src = STATE.capturedPhoto;
    document.getElementById('photoPreview').classList.add('active');
    document.getElementById('photoActions').classList.add('active');

    // Punching is now driven entirely by the attendance toggle (see
    // attendance.js) — capture no longer auto-records a punch by itself.
    // What happens next (open the report form vs. just record a punch)
    // is decided in confirmPhoto() based on _cameraCaptureMode.
}

function addPhotoOverlay(ctx, w, h) {
    const overlayHeight = Math.min(140, h * 0.15);
    const padding = 14;
    const lineGap = overlayHeight * 0.25;

    const user = STATE.currentUser ? `ID: ${STATE.currentUser.id} — ${STATE.currentUser.name}` : '';
    const gps  = STATE.currentPosition
        ? `GPS: ${STATE.currentPosition.latitude.toFixed(4)}, ${STATE.currentPosition.longitude.toFixed(4)}`
        : 'GPS unavailable';
    const loc  = STATE.currentLocationName || 'Location detecting...';
    const ts   = formatTimestampIST(new Date());

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, h - overlayHeight, w, overlayHeight);

    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(user, padding, h - overlayHeight + lineGap + 8);

    ctx.fillStyle = '#ffeb3b';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(loc, padding, h - overlayHeight + lineGap * 2 + 8);

    ctx.fillStyle = 'white';
    ctx.font = '14px sans-serif';
    ctx.fillText(gps, padding, h - overlayHeight + lineGap * 3 + 8);

    ctx.textAlign = 'right';
    ctx.fillText(ts, w - padding, h - overlayHeight + lineGap * 3 + 8);

    ctx.restore();
}

function confirmPhoto() {
    document.getElementById('photoPreview').classList.remove('active');
    document.getElementById('photoActions').classList.remove('active');

    if (_cameraCaptureMode === 'punch-in') {
        recordPunchIn();
        finishPunchCapture();
        // Punch-in ALSO starts a report — this same photo becomes the
        // vendor-visit report photo, so the form opens same as before.
        document.getElementById('formSection').classList.add('active');
        return;
    }

    if (_cameraCaptureMode === 'punch-out') {
        recordPunchOut();
        finishPunchCapture();
        // Punch-out is attendance-only — no report form, photo is discarded
        // (it was never meant to be a visit-report photo).
        STATE.capturedPhoto = null;
        return;
    }

    // Normal report-photo flow — unchanged.
    document.getElementById('formSection').classList.add('active');
}

function retakePhoto() {
    STATE.capturedPhoto = null;
    document.getElementById('previewImg').src = '';
    document.getElementById('photoPreview').classList.remove('active');
    document.getElementById('photoActions').classList.remove('active');
    document.getElementById('formSection').classList.remove('active');

    // A retake during a punch capture cancels the punch attempt (the toggle
    // must not silently flip without an actual confirmed photo) — the
    // supervisor can slide the toggle again to retry.
    if (_cameraCaptureMode !== 'report') cancelPunchCapture();
}

// ── Shared cleanup after a punch-mode capture (confirmed or cancelled) ──
// Resets the camera section back to its normal "Open Camera" / report-photo
// state so the toggle-triggered flow doesn't leave the section stuck in
// punch mode for the next ordinary report photo.

function finishPunchCapture() {
    _cameraCaptureMode = 'report';
    stopCamera();
    updateAttendanceStatusUI();
}

// A punch capture was abandoned (retake, or camera failed to open) — put
// the toggle back to whichever state it actually was in before the slide,
// since no punch was recorded.
function cancelPunchCapture() {
    _cameraCaptureMode = 'report';
    updateAttendanceStatusUI();
}
