// ============================================================
// UI.JS — Toast messages, modal helpers, install button
// ============================================================

function showMessage(text, type = 'success') {
    const msg = document.createElement('div');
    msg.className = `toast-message ${type}`;
    msg.textContent = text;
    document.body.appendChild(msg);

    setTimeout(() => {
        msg.style.animation = 'slideUp 0.3s ease reverse';
        setTimeout(() => msg.remove(), 300);
    }, 3000);
}

// ── PWA install button ────────────────────────────────────────
// The native install prompt (beforeinstallprompt) only fires in
// Chrome/Edge on Android. On iOS Safari / Firefox it never fires, so
// we ALWAYS show the button and fall back to manual instructions.

const INSTALLED_FLAG = 'vd_app_installed';

function isRunningStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true; // iOS
}

// Best-effort check whether the PWA is already installed on this device.
async function isAppInstalled() {
    // 1. Running inside the installed app
    if (isRunningStandalone()) return true;

    // 2. We recorded a successful install earlier in this browser
    if (localStorage.getItem(INSTALLED_FLAG) === '1') return true;

    // 3. Chrome/Edge: ask the browser directly (most reliable when supported)
    try {
        if (navigator.getInstalledRelatedApps) {
            const apps = await navigator.getInstalledRelatedApps();
            if (apps && apps.length > 0) {
                localStorage.setItem(INSTALLED_FLAG, '1');
                return true;
            }
        }
    } catch (e) { /* not supported — ignore */ }

    return false;
}

async function setupInstallButton() {
    const btn = document.getElementById('installBtn');
    if (!btn) return;

    // Capture the native prompt when the browser offers it (Chrome/Edge).
    // If this fires, the app is NOT installed — so clear any stale flag.
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        STATE.installPrompt = e;
        localStorage.removeItem(INSTALLED_FLAG);
        btn.style.display = 'inline-block';
    });

    window.addEventListener('appinstalled', () => {
        showMessage('✅ App installed successfully!', 'success');
        localStorage.setItem(INSTALLED_FLAG, '1');
        btn.style.display = 'none';
        STATE.installPrompt = null;
    });

    btn.addEventListener('click', triggerInstall);

    // Already installed → hide the button; otherwise show it everywhere.
    const installed = await isAppInstalled();
    btn.style.display = installed ? 'none' : 'inline-block';
}

async function triggerInstall() {
    // Native prompt available (Chrome/Edge on Android/desktop)
    if (STATE.installPrompt) {
        STATE.installPrompt.prompt();
        const { outcome } = await STATE.installPrompt.userChoice;
        if (outcome === 'accepted') showMessage('✅ App installing...', 'success');
        STATE.installPrompt = null;
        return;
    }

    // No native prompt → show manual instructions per platform
    showInstallInstructions();
}

function showInstallInstructions() {
    const ua = navigator.userAgent;
    const isIOS     = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isAndroid = /Android/.test(ua);

    let steps;
    if (isIOS) {
        steps = `
            <li>Tap the <strong>Share</strong> button ⬆️ (bottom of Safari)</li>
            <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
            <li>Tap <strong>Add</strong> — the app icon appears on your home screen</li>`;
    } else if (isAndroid) {
        steps = `
            <li>Tap the <strong>⋮ menu</strong> (top-right of Chrome)</li>
            <li>Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></li>
            <li>Confirm — the app icon appears on your home screen</li>`;
    } else {
        steps = `
            <li>Click the <strong>install icon</strong> ⊕ in the address bar</li>
            <li>Or open the browser menu → <strong>"Install VD GeoTag"</strong></li>
            <li>Confirm to install</li>`;
    }

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:380px;">
            <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
            <div class="modal-title">📲 Install VD GeoTag</div>
            <p style="font-size:13px;color:var(--text-secondary);margin:10px 0;">
                Install the app on your device for quick access:
            </p>
            <ol style="font-size:14px;line-height:1.9;padding-left:20px;color:var(--text);">${steps}</ol>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
