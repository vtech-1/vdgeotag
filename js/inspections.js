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

function initInspectionPage() {
    const hdr = document.getElementById('inspectionHeaderUser');
    if (hdr && STATE.currentUser) {
        hdr.textContent = STATE.currentUser.name + ' · ID ' + STATE.currentUser.id;
    }

    // Prefill from GPS, same convenience the complaint page gives.
    const loc = document.getElementById('insLocation');
    if (loc && !loc.value && STATE.currentLocationName) {
        loc.value = STATE.currentLocationName;
    }

    resetInspectionForm();
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

// Called by camera.js once a photo is confirmed in 'inspection' mode.
function onInspectionPhotoReady(dataUrl) {
    STATE.inspectionPhoto = dataUrl;

    const img = document.getElementById('insPreviewImg');
    if (img) img.src = dataUrl;
    document.getElementById('insPhotoPreview')?.classList.add('active');
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

    const pos     = STATE.currentPosition;
    const mapsUrl = pos ? mapsLink(pos.latitude, pos.longitude) : '';
    const by      = STATE.currentUser
        ? `${STATE.currentUser.name} (ID: ${STATE.currentUser.id})`
        : '';

    const msg = `Site Inspection Report
════════════════════════
Service Team: ${by}
📅 Date: ${formatDate(new Date())}
⏰ Time: ${formatTimeHM(new Date())}

VLCC Code: ${document.getElementById('insVlcc')?.value.trim() || '-'}
📍 Location: ${document.getElementById('insLocation')?.value.trim() || '-'}
${mapsUrl}

OBSERVATION / REMARKS:
${document.getElementById('insRemarks')?.value.trim() || '-'}${
    pos ? `\n\nGPS: ${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)}` : ''}`;

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
