// ============================================================
// STATE.JS — All global mutable state in one place
// ============================================================

const STATE = {
    // Auth
    currentUser: null,       // { id, name, role }
    sessionToken: null,
    forceChangePassword: false,  // temporary password requires change on next login

    // GPS
    currentPosition: null,
    currentLocationName: null,
    gpsWatchId: null,
    gpsErrorCount: 0,
    lastGeocodeTime: 0,
    lastGeocodeLat: null,
    lastGeocodeLon: null,

    // Camera
    videoStream: null,
    cameraFacingMode: 'user', // front camera default
    capturedPhoto: null,

    // Storage
    db: null,
    allRecords: [],
    filteredRecords: [],

    // Attendance (today's status per device) — two IN/OUT sessions
    attendanceToday: {
        in1: null,   // { time, lat, lon } once punched
        out1: null,
        in2: null,
        out2: null,
    },

    // Admin dashboard
    adminTab: 'attendance',  // 'attendance' | 'reports' | 'complaints' | 'supervisors'
    adminAttendance: [],     // loaded from Google Sheets
    adminReports: [],        // loaded from Google Sheets
    adminComplaints: [],     // loaded from Google Sheets

    // PWA install prompt
    installPrompt: null,
};
