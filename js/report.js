// ============================================================
// REPORT.JS — Field report form submit + Telegram share
//             Photos are shared via Telegram ONLY (not stored).
// ============================================================

function submitRecord() {
    if (!STATE.capturedPhoto) {
        showMessage('📷 Please capture a photo first', 'error');
        return;
    }

    const now       = new Date();
    const isoStamp  = now.toISOString();               // machine id / dedupe key
    const shift     = detectShiftLabel();

    const record = {
        id:        isoStamp,
        isoStamp:  isoStamp,                            // kept for date filtering
        timestamp: formatTimestampLongIST(now),         // "Fri Jul 03 2026 10:42:20 AM"
        date:      formatDateISO(now),  // ISO YYYY-MM-DD (display converts to DD/MM/YY)
        time:      formatTime(now),     // HH:MM:SS AM/PM
        shift,

        // GPS
        lat:       STATE.currentPosition?.latitude  || null,
        lon:       STATE.currentPosition?.longitude || null,
        village:   document.getElementById('locVillage')?.textContent || '',
        taluk:     document.getElementById('locCity')?.textContent    || '',
        state:     document.getElementById('locState')?.textContent   || '',
        location:  STATE.currentLocationName || document.getElementById('fieldLocation').value,

        // Supervisor
        supervisorId:   STATE.currentUser?.id   || 'unknown',
        supervisorName: STATE.currentUser?.name || 'unknown',

        // Form fields
        vendorType:      val('fieldVendorType'),
        vendorName:      val('fieldVendor'),
        routeName:       val('fieldRoute'),
        dairyName:       val('fieldDairy'),
        contactNo:       val('fieldContact'),
        milkLtrs:        val('fieldMilk'),
        fatSnf:          val('fieldFatSnf'),
        avgRate:         val('fieldRate'),
        additionalRate:  val('fieldAdditional'),
        vlccSalary:      val('fieldSalary'),
        discussionPoint: val('fieldDiscussion'),
        noteField:       val('fieldRemarks'),

        // Photos NOT stored — shared to Telegram only
        photoUrl: '',
        shareAttempted: false,
    };

    dbSave(record);

    // Sync to Google Sheets (non-blocking) — only data, no photo
    apiSubmitReport(record).then(res => {
        if (res.ok) console.log('Report synced to Sheets');
    });

    showMessage('✅ Record submitted successfully', 'success');
}

function val(id) {
    return document.getElementById(id)?.value?.trim() || '-';
}

function resetForm() {
    ['fieldVendorType','fieldVendor','fieldRoute','fieldDairy','fieldContact',
     'fieldMilk','fieldFatSnf','fieldRate','fieldAdditional','fieldSalary',
     'fieldDiscussion','fieldRemarks'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    STATE.capturedPhoto = null;
    const img = document.getElementById('previewImg');
    if (img) img.src = '';
    document.getElementById('photoPreview')?.classList.remove('active');
    document.getElementById('photoActions')?.classList.remove('active');
    document.getElementById('formSection')?.classList.remove('active');

    // Keep punch button visible/updated (attendance persists across reports)
    if (typeof updatePunchButton === 'function') updatePunchButton();

    initDateShiftField();
}

// ── Telegram share ────────────────────────────────────────────
// Location link is INCLUDED (visible to admin in their copy)
// For supervisor groups: admin controls who sees the location.
// All report metadata + photo shared — photo NOT saved in system.

async function shareReport() {
    if (!STATE.capturedPhoto) {
        showMessage('📷 Please capture a photo first', 'error');
        return;
    }

    const shift    = detectShiftLabel();
    const now      = new Date();
    const time     = formatTimeHM(now);
    const date     = formatDate(now);
    const loc      = STATE.currentLocationName || val('fieldLocation') || 'Detecting...';
    const mapsUrl  = STATE.currentPosition
        ? mapsLink(STATE.currentPosition.latitude, STATE.currentPosition.longitude)
        : '';

    const supervisor = STATE.currentUser
        ? `Supervisor: ${STATE.currentUser.name} (ID: ${STATE.currentUser.id})`
        : '';

    const msg = `Procurement Supervisor Field Report
════════════════════════
${supervisor}
📅 Date: ${date}
⏰ Time: ${time}
🕐 Shift: ${shift}
📍 Location: ${loc}
${mapsUrl}

MEETING DETAILS:
Vendor Type: ${val('fieldVendorType')}
Vendor / VLCC: ${val('fieldVendor')}
Route: ${val('fieldRoute')}
Dairy: ${val('fieldDairy')}
Contact: ${val('fieldContact')}
Per Day Milk: ${val('fieldMilk')} Ltrs
Avg Fat & SNF: ${val('fieldFatSnf')}
Avg Rate: ${val('fieldRate')}
Additional Incentive: ${val('fieldAdditional')}
VLCC Salary (Rs/Ltr): ${val('fieldSalary')}
Discussion: ${val('fieldDiscussion')}
Remarks: ${val('fieldRemarks')}

GPS: ${STATE.currentPosition?.latitude.toFixed(6)}, ${STATE.currentPosition?.longitude.toFixed(6)}`;

    if (navigator.share) {
        try {
            const blob = await (await fetch(STATE.capturedPhoto)).blob();
            await navigator.share({
                title: 'VD Field Report',
                text: msg,
                files: [new File([blob], 'report.jpg', { type: 'image/jpeg' })],
            });
            showMessage('✅ Report shared to Telegram', 'success');
        } catch (e) {
            if (e.name !== 'AbortError') showShareFallback(msg);
        }
    } else {
        showShareFallback(msg);
    }
}

function showShareFallback(msg) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    const safe = msg.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
            <div class="modal-title">Share Options</div>
            <p style="margin-bottom:16px;font-size:13px;color:#666;">Web Share not supported. Use one of these:</p>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <button class="btn btn-primary" onclick="dlPhoto()">📷 Download Photo</button>
                <button class="btn btn-primary" onclick="cpText('${safe}')">📋 Copy Report Text</button>
                <button class="btn btn-primary" onclick="dlText('${safe}')">📄 Download Text File</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function dlPhoto() {
    const a = document.createElement('a');
    a.href = STATE.capturedPhoto;
    a.download = `report_${formatDate(new Date())}.jpg`;
    a.click();
    showMessage('✅ Photo downloaded', 'success');
}

function cpText(text) {
    navigator.clipboard?.writeText(text.replace(/\\n/g, '\n'))
        .then(() => showMessage('✅ Copied to clipboard', 'success'));
}

function dlText(text) {
    const blob = new Blob([text.replace(/\\n/g, '\n')], { type: 'text/plain' });
    downloadBlob(blob, `report_${formatDate(new Date())}.txt`);
    showMessage('✅ Text downloaded', 'success');
}

// ── Step 1: Submit ──────────────────────────────────────────
// Saves the record. Attendance punch is handled separately by the
// punch button. Does NOT clear the photo — Share step needs it.
function handleSubmitClick() {
    if (!STATE.capturedPhoto) {
        showMessage('📷 Please capture a photo first', 'error');
        return;
    }

    // Mandatory fields
    const vendorType = document.getElementById('fieldVendorType')?.value || '';
    const vendorName = document.getElementById('fieldVendor')?.value?.trim() || '';
    if (!vendorType) {
        showMessage('⚠️ Please select Vendor Type', 'error');
        return;
    }
    if (!vendorName) {
        showMessage('⚠️ Vendor / VLCC is required', 'error');
        return;
    }

    submitRecord();

    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('shareBtn').style.display = 'block';
    document.getElementById('skipShareWrap').style.display = 'block';
}

// ── Step 2: Share ───────────────────────────────────────────
// Photo is still in STATE.capturedPhoto at this point since
// resetForm() is deferred until after sharing completes.
async function handleShareClick() {
    await shareReport();
    finishReportCycle();
}

// ── Skip share, start a new report ───────────────────────────
function handleSkipShare() {
    finishReportCycle();
}

function finishReportCycle() {
    resetForm();
    loadAllRecords();
    document.getElementById('submitBtn').style.display = 'block';
    document.getElementById('shareBtn').style.display = 'none';
    document.getElementById('skipShareWrap').style.display = 'none';
}
