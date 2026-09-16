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
    inspectionPhoto: null,    // site-inspection photo, shared not stored

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
    adminTab: 'attendance',  // 'attendance' | 'reports' | 'complaints' | 'inspections' | 'supervisors'
    adminAttendance: [],     // loaded from Google Sheets
    adminReports: [],        // loaded from Google Sheets
    adminComplaints: [],     // loaded from Google Sheets

    // Service admin dashboard
    svcAdminComplaints: [],
    assignableSupervisors: [],

    // Site inspections — left undefined on purpose: the service admin tab
    // uses "not yet loaded" to decide whether to fetch on first open.
    inspections: undefined,

    // PWA install prompt
    installPrompt: null,
};
