// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE DRIVE AUTHENTICATION & AUTO-SYNC
// ═══════════════════════════════════════════════════════════════════════════

const GOOGLE_CLIENT_ID = '144566328850-70jc9qcm2vloij6rvft61g8adhla67kj.apps.googleusercontent.com';
const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/drive.file'
].join(' ');

const BACKUP_FILENAME = 'onepen_backup.json';

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT - Persistent login
// ═══════════════════════════════════════════════════════════════════════════

function getStoredSession() {
    const accessToken = localStorage.getItem('accessToken');
    const tokenExpiry = localStorage.getItem('tokenExpiry');
    const userName = localStorage.getItem('userName');
    const userEmail = localStorage.getItem('userEmail');
    const userPicture = localStorage.getItem('userPicture');

    if (!accessToken || !tokenExpiry) return null;

    // Check if token is still valid (with 5 min buffer)
    const expiryTime = parseInt(tokenExpiry, 10);
    const now = Date.now();
    const bufferMs = 5 * 60 * 1000; // 5 minutes

    if (now >= expiryTime - bufferMs) {
        // Token expired or about to expire
        clearSession();
        return null;
    }

    return { accessToken, userName, userEmail, userPicture, expiryTime };
}

function saveSession(accessToken, expiresIn, userInfo) {
    const expiryTime = Date.now() + (expiresIn * 1000);
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('tokenExpiry', expiryTime.toString());
    localStorage.setItem('userName', userInfo.name || '');
    localStorage.setItem('userEmail', userInfo.email || '');
    localStorage.setItem('userPicture', userInfo.picture || '');
}

function clearSession() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('tokenExpiry');
    localStorage.removeItem('idToken');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userPicture');
}

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c =>
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
        );
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGN IN / SIGN OUT
// ═══════════════════════════════════════════════════════════════════════════

function initiateGoogleSignIn() {
    const redirectUri = window.location.origin + window.location.pathname;
    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=token id_token` +
        `&scope=${encodeURIComponent(GOOGLE_SCOPES)}` +
        `&nonce=${Date.now()}` +
        `&prompt=select_account`;

    window.location.href = oauthUrl;
}

function extractTokensFromUrl() {
    const hash = window.location.hash;
    if (!hash.includes('access_token')) return false;

    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get('access_token');
    const idToken = params.get('id_token');
    const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

    if (accessToken && idToken) {
        const userInfo = parseJwt(idToken) || {};
        saveSession(accessToken, expiresIn, userInfo);

        // Clear URL hash and reload cleanly
        history.replaceState(null, '', window.location.pathname);
        return true;
    }
    return false;
}

function signOut() {
    clearSession();
    updateAuthUI();
    showSyncStatus('signed-out');
}

// ═══════════════════════════════════════════════════════════════════════════
// UI STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function updateAuthUI() {
    const session = getStoredSession();
    const signinCard = document.getElementById('signin-card');
    const userCard = document.getElementById('user-card');
    const userNameEl = document.getElementById('user-name');
    const userEmail = document.getElementById('user-email-display');
    const userAvatar = document.getElementById('user-avatar');
    const driveGroup = document.getElementById('driveGroup');

    if (!signinCard || !userCard) return; // Elements not ready

    if (session) {
        // Logged in
        signinCard.style.display = 'none';
        userCard.style.display = 'block';
        if (driveGroup) driveGroup.style.display = 'flex';

        if (userNameEl) userNameEl.textContent = session.userName || 'User';
        if (userEmail) userEmail.textContent = session.userEmail || '';

        if (userAvatar) {
            if (session.userPicture) {
                userAvatar.src = session.userPicture;
                userAvatar.style.display = 'block';
            } else {
                userAvatar.style.display = 'none';
            }
        }
    } else {
        // Not logged in
        signinCard.style.display = 'block';
        userCard.style.display = 'none';
        if (driveGroup) driveGroup.style.display = 'none';
    }
}

function showSyncStatus(status, message = '') {
    const statusEl = document.getElementById('sync-status');
    if (!statusEl) return;

    const statusConfig = {
        'syncing': { icon: 'bx-sync bx-spin', text: 'Syncing...', class: 'syncing' },
        'synced': { icon: 'bx-check-circle', text: message || 'Synced', class: 'synced' },
        'error': { icon: 'bx-error-circle', text: message || 'Failed', class: 'error' },
        'offline': { icon: 'bx-cloud-off', text: 'Offline', class: 'offline' },
        'signed-out': { icon: 'bx-log-out', text: 'Signed out', class: 'signed-out' },
        'idle': { icon: 'bx-cloud', text: '', class: 'idle' }
    };

    const config = statusConfig[status] || statusConfig['idle'];
    statusEl.className = `cloud-status ${config.class}`;
    statusEl.innerHTML = `<i class="bx ${config.icon}"></i><span>${config.text}</span>`;

    // Auto-hide success/error messages after 3s
    if (status === 'synced' || status === 'error' || status === 'signed-out') {
        setTimeout(() => {
            if (statusEl.classList.contains(config.class)) {
                showSyncStatus('idle');
            }
        }, 3000);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-SYNC FUNCTIONALITY
// ═══════════════════════════════════════════════════════════════════════════

let autoSyncTimer = null;
let lastSyncTime = 0;
const AUTO_SYNC_DELAY = 30000; // 30 seconds after last change
const MIN_SYNC_INTERVAL = 60000; // Minimum 1 minute between syncs

function scheduleAutoSync() {
    console.log('[AutoSync] scheduleAutoSync() called');

    const session = getStoredSession();
    if (!session) {
        console.log('[AutoSync] No session found - user not logged in');
        return;
    }
    console.log('[AutoSync] Session found for:', session.userEmail);

    // Clear existing timer
    if (autoSyncTimer) {
        console.log('[AutoSync] Clearing existing timer');
        clearTimeout(autoSyncTimer);
    }

    // Schedule sync after delay
    console.log(`[AutoSync] Scheduling sync in ${AUTO_SYNC_DELAY / 1000}s`);
    autoSyncTimer = setTimeout(() => {
        const now = Date.now();
        const timeSinceLastSync = now - lastSyncTime;
        console.log(`[AutoSync] Timer fired. Time since last sync: ${timeSinceLastSync / 1000}s`);

        if (timeSinceLastSync >= MIN_SYNC_INTERVAL) {
            console.log('[AutoSync] Min interval passed, performing sync...');
            performAutoSync();
        } else {
            console.log(`[AutoSync] Skipping - need to wait ${(MIN_SYNC_INTERVAL - timeSinceLastSync) / 1000}s more`);
        }
    }, AUTO_SYNC_DELAY);
}

async function performAutoSync() {
    console.log('[AutoSync] performAutoSync() started');

    const session = getStoredSession();
    if (!session) {
        console.log('[AutoSync] No session - aborting');
        return;
    }

    // Check if online
    if (!navigator.onLine) {
        console.log('[AutoSync] Offline - aborting');
        showSyncStatus('offline');
        return;
    }

    console.log('[AutoSync] Starting upload to Google Drive...');
    showSyncStatus('syncing');
    lastSyncTime = Date.now();

    try {
        await silentBackupToDrive(session.accessToken);
        console.log('[AutoSync] ✅ Upload successful!');
        showSyncStatus('synced', 'Auto-saved');
    } catch (err) {
        console.error('[AutoSync] ❌ Upload failed:', err);
        if (err.message.includes('401') || err.message.includes('403')) {
            // Token expired
            console.log('[AutoSync] Token expired - clearing session');
            clearSession();
            updateAuthUI();
            showSyncStatus('error', 'Session expired');
        } else {
            showSyncStatus('error', 'Sync failed');
        }
    }
}

async function silentBackupToDrive(accessToken) {
    console.log('[AutoSync] silentBackupToDrive() started');

    // Build backup payload
    const payload = await buildBackupPayload();
    const jsonContent = JSON.stringify(payload);
    console.log(`[AutoSync] Payload built: ${Object.keys(payload.notes).length} notes, ${(jsonContent.length / 1024).toFixed(1)}KB`);

    // Search for existing file
    console.log('[AutoSync] Searching for existing backup file...');
    const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILENAME}' and trashed=false`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!searchRes.ok) {
        console.error('[AutoSync] Search failed:', searchRes.status);
        throw new Error(`Search failed: ${searchRes.status}`);
    }

    const searchData = await searchRes.json();
    const existingFile = searchData.files?.[0];
    console.log('[AutoSync] Existing file:', existingFile ? existingFile.id : 'none (will create new)');

    // Multipart upload
    const metadata = { name: BACKUP_FILENAME, mimeType: 'application/json' };
    const boundary = '-------314159265358979323846';
    const body = `\r\n--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) +
        `\r\n--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        jsonContent +
        `\r\n--${boundary}--`;

    const url = existingFile
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    console.log(`[AutoSync] Uploading via ${existingFile ? 'PATCH' : 'POST'}...`);
    const uploadRes = await fetch(url, {
        method: existingFile ? 'PATCH' : 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body
    });

    if (!uploadRes.ok) {
        const err = await uploadRes.json();
        console.error('[AutoSync] Upload failed:', err);
        throw new Error(err.error?.message || `Upload failed: ${uploadRes.status}`);
    }

    const result = await uploadRes.json();
    console.log('[AutoSync] Upload complete, file ID:', result.id);
    return result;
}

function buildBackupPayload() {
    return new Promise((resolve) => {
        openNoteDB(db => {
            const payload = {
                type: 'onepen-data',
                version: 1,
                scope: 'backup',
                generated_at: new Date().toISOString(),
                notes: {},
                settings: {}
            };

            const noteTx = db.transaction('notes', 'readonly');
            const noteStore = noteTx.objectStore('notes');

            const settingTx = db.transaction('setting', 'readonly');
            const settingStore = settingTx.objectStore('setting');

            const loadNotes = new Promise(res => {
                noteStore.openCursor().onsuccess = e => {
                    const c = e.target.result;
                    if (!c) return res();
                    payload.notes[c.key] = c.value;
                    c.continue();
                };
            });

            const loadSettings = new Promise(res => {
                settingStore.openCursor().onsuccess = e => {
                    const c = e.target.result;
                    if (!c) return res();
                    payload.settings[c.key] = c.value;
                    c.continue();
                };
            });

            Promise.all([loadNotes, loadSettings]).then(() => resolve(payload));
        });
    });
}

// Manual sync buttons (keep existing functionality)
function manualSyncToDrive() {
    const session = getStoredSession();
    if (!session) {
        alert('Please sign in first');
        return;
    }

    showSyncStatus('syncing');
    silentBackupToDrive(session.accessToken)
        .then(() => {
            lastSyncTime = Date.now();
            showSyncStatus('synced', 'Backup complete');
        })
        .catch(err => {
            console.error('Manual sync failed:', err);
            showSyncStatus('error', err.message);
        });
}

function manualRestoreFromDrive() {
    const session = getStoredSession();
    if (!session) {
        alert('Please sign in first');
        return;
    }

    if (!confirm('This will replace all local notes with the cloud backup. Continue?')) {
        return;
    }

    showSyncStatus('syncing');
    restoreFromDrive(session.accessToken)
        .then(() => {
            showSyncStatus('synced', 'Restored');
            // Reload notes
            renderAllNotes();
            reloadSetting();
        })
        .catch(err => {
            console.error('Restore failed:', err);
            showSyncStatus('error', err.message);
        });
}

async function restoreFromDrive(accessToken) {
    const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILENAME}' and trashed=false`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const searchData = await searchRes.json();
    const file = searchData.files?.[0];
    if (!file) throw new Error('No backup found');

    const dataRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const data = await dataRes.json();
    if (data.type !== 'onepen-data' || data.scope !== 'backup') {
        throw new Error('Invalid backup file');
    }

    return new Promise((resolve, reject) => {
        openNoteDB(db => {
            try {
                const txN = db.transaction('notes', 'readwrite');
                const ns = txN.objectStore('notes');
                Object.values(data.notes).forEach(v => ns.put(v));

                const txS = db.transaction('setting', 'readwrite');
                const ss = txS.objectStore('setting');
                Object.entries(data.settings || {}).forEach(([k, v]) => ss.put(v, k));

                txN.oncomplete = () => resolve();
                txN.onerror = () => reject(new Error('Database error'));
            } catch (e) {
                reject(e);
            }
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

function initGoogleAuth() {
    // Check for OAuth redirect
    if (extractTokensFromUrl()) {
        // Just logged in, reload to clean state
        window.location.reload();
        return;
    }

    // Update UI based on session
    updateAuthUI();

    // Set up event listeners
    const signinBtn = document.getElementById('signin-btn');
    const signoutBtn = document.getElementById('signout-btn');
    const syncBtn = document.getElementById('sync-to-drive-btn');
    const restoreBtn = document.getElementById('restore-from-drive-btn');

    if (signinBtn) signinBtn.onclick = initiateGoogleSignIn;
    if (signoutBtn) signoutBtn.onclick = signOut;
    if (syncBtn) syncBtn.onclick = manualSyncToDrive;
    if (restoreBtn) restoreBtn.onclick = manualRestoreFromDrive;

    // Check session status
    const session = getStoredSession();
    if (session) {
        showSyncStatus('idle');
    }
}

// Hook into note saving for auto-sync
function triggerAutoSync() {
    console.log('[AutoSync] triggerAutoSync() called from markDirty()');
    scheduleAutoSync();
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGoogleAuth);
} else {
    initGoogleAuth();
}

// Legacy function aliases for compatibility
function backupToDrive() { manualSyncToDrive(); }
function restoreBackupFromDrive() { manualRestoreFromDrive(); }
