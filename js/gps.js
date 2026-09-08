// ============================================================
// GPS.JS — Continuous location tracking + reverse geocoding
//           Three-tier fallback: Geoapify → Nominatim → BigDataCloud
// ============================================================

function startGPS() {
    if (!('geolocation' in navigator)) {
        setLocationStatus('Geolocation not supported on this device.');
        return;
    }

    STATE.gpsErrorCount = 0;

    STATE.gpsWatchId = navigator.geolocation.watchPosition(
        onGPSSuccess,
        onGPSError,
        {
            enableHighAccuracy: true,
            maximumAge: CONFIG.GPS_MAX_AGE,
            timeout: CONFIG.GPS_TIMEOUT,
        }
    );
}

function onGPSSuccess(position) {
    STATE.currentPosition = position.coords;
    STATE.gpsErrorCount = 0;
    setLocationStatus('');
    updateGPSDisplay();

    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const now = Date.now();

    const latDiff = STATE.lastGeocodeLat === null ? 999 : Math.abs(lat - STATE.lastGeocodeLat);
    const lonDiff = STATE.lastGeocodeLon === null ? 999 : Math.abs(lon - STATE.lastGeocodeLon);

    // Only reverse-geocode if moved >~50 m or 30 s elapsed
    if (latDiff > 0.0005 || lonDiff > 0.0005 || (now - STATE.lastGeocodeTime) > 30000) {
        reverseGeocodeLocation();
    }
}

function onGPSError(error) {
    STATE.gpsErrorCount++;
    let msg = '';

    if (error.code === 1) {
        msg = '⚠️ Location permission denied. Enable in phone settings.';
    } else if (error.code === 3) {
        if (STATE.gpsErrorCount <= 1) msg = '🛰️ Getting GPS signal...';
        else if (STATE.gpsErrorCount <= 3) msg = '🔄 Still searching for signal...';
        else msg = '📍 Using network location...';
    } else {
        msg = STATE.gpsErrorCount <= 1 ? '📍 Getting your location...' : '🔄 Retrying location...';
    }

    setLocationStatus(msg);
}

function updateGPSDisplay() {
    const pos = STATE.currentPosition;
    if (!pos) return;

    setText('gpsLat', pos.latitude.toFixed(6));
    setText('gpsLon', pos.longitude.toFixed(6));
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function setLocationStatus(msg) {
    const el = document.getElementById('locationStatus');
    if (el) el.textContent = msg;
}

function applyLocation(village, taluk, district, state) {
    const talukDistrict = (taluk && district && taluk !== district)
        ? taluk + ' / ' + district
        : (district || taluk || '--');

    STATE.currentLocationName = [village, talukDistrict, state]
        .filter(v => v && v !== '--').join(', ');

    setText('locVillage', village || 'Not detected');
    setText('locCity',    talukDistrict);
    setText('locState',   state || '--');

    const locInput = document.getElementById('fieldLocation');
    if (locInput) {
        locInput.value = village
            ? village + (talukDistrict !== '--' ? ', ' + talukDistrict : '')
            : '';
    }
    setLocationStatus('');
}

async function reverseGeocodeLocation() {
    if (!STATE.currentPosition) return;

    const lat = STATE.currentPosition.latitude;
    const lon = STATE.currentPosition.longitude;

    STATE.lastGeocodeTime = Date.now();
    STATE.lastGeocodeLat  = lat;
    STATE.lastGeocodeLon  = lon;

    setLocationStatus('Detecting village...');

    // 1. Geoapify — best Tamil Nadu village accuracy
    try {
        const res = await fetch(
            `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=${CONFIG.GEOAPIFY_KEY}&lang=en`,
            { signal: AbortSignal.timeout(8000) }
        );
        if (res.ok) {
            const data = await res.json();
            const p = data.features?.[0]?.properties;
            if (p) {
                const village  = p.village || p.suburb || p.quarter || p.neighbourhood || '';
                const taluk    = p.city    || p.town   || '';
                const district = p.county  || '';
                const state    = p.state   || '';
                if (village || taluk) {
                    applyLocation(village || taluk, village ? taluk : '', district, state);
                    return;
                }
            }
        }
    } catch (e) { console.log('Geoapify failed:', e.message); }

    // 2. Nominatim OSM fallback
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1&accept-language=en`,
            {
                headers: { 'User-Agent': 'VD-GeoTag-FieldApp/1.0' },
                signal: AbortSignal.timeout(10000),
            }
        );
        if (res.ok) {
            const data = await res.json();
            const a    = data.address || {};
            const village  = a.hamlet || a.village || a.suburb || a.neighbourhood || a.town || '';
            const taluk    = a.county || '';
            const district = a.state_district || a.county || a.city || '';
            const state    = a.state || '';
            if (village) { applyLocation(village, taluk, district, state); return; }
        }
    } catch (e) { console.log('Nominatim failed:', e.message); }

    // 3. BigDataCloud last resort
    try {
        const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
            { signal: AbortSignal.timeout(8000) }
        );
        if (res.ok) {
            const data = await res.json();
            let village = '', taluk = '', district = '', state = '';
            if (data.localityInfo?.administrative) {
                const admins = data.localityInfo.administrative;
                state    = admins.find(a => a.adminLevel === 4)?.name || '';
                district = (admins.find(a => a.adminLevel === 5)?.name || '').replace(/ District$/i, '');
                taluk    = admins.find(a => a.adminLevel === 6)?.name || '';
                village  = [...admins].filter(a => a.adminLevel >= 7)
                                      .sort((a, b) => b.adminLevel - a.adminLevel)[0]?.name || '';
            }
            if (!village && data.locality && data.locality !== taluk) village = data.locality;
            if (!state) state = data.principalSubdivision || '';
            applyLocation(village, taluk, district, state);
            return;
        }
    } catch (e) { console.log('BigDataCloud failed:', e.message); }

    setText('locVillage', 'Not detected');
    setLocationStatus('No internet — enter location manually');
}
