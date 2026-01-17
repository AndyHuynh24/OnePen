// ═══════════════════════════════════════════════════════════════════════════
// FIREBASE AUTHENTICATION & GOOGLE DRIVE AUTO-SYNC
// ═══════════════════════════════════════════════════════════════════════════

const BACKUP_FILENAME = 'onepen_backup.json';

// Google Drive scope for file access
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT - Using Firebase + localStorage for Drive token
// ═══════════════════════════════════════════════════════════════════════════

function getStoredSession() {
    const user = firebase.auth().currentUser;
    const accessToken = localStorage.getItem('driveAccessToken');
    const tokenExpiry = localStorage.getItem('driveTokenExpiry');

    if (!user || !accessToken || !tokenExpiry) return null;

    // Check if Drive token is still valid (with 5 min buffer)
    const expiryTime = parseInt(tokenExpiry, 10);
    const now = Date.now();
    const bufferMs = 5 * 60 * 1000; // 5 minutes

    if (now >= expiryTime - bufferMs) {
        // Token expired - clear Drive token (Firebase auth may still be valid)
        clearDriveToken();
        return null;
    }

    return {
        accessToken,
        userName: user.displayName || '',
        userEmail: user.email || '',
        userPicture: user.photoURL || '',
        expiryTime
    };
}

function saveDriveToken(accessToken, expiresIn) {
    const expiryTime = Date.now() + (expiresIn * 1000);
    localStorage.setItem('driveAccessToken', accessToken);
    localStorage.setItem('driveTokenExpiry', expiryTime.toString());
}

function clearDriveToken() {
    localStorage.removeItem('driveAccessToken');
    localStorage.removeItem('driveTokenExpiry');
}

function clearSession() {
    clearDriveToken();
    localStorage.removeItem('lastSyncTime');
}

// ═══════════════════════════════════════════════════════════════════════════
// FIREBASE GOOGLE SIGN IN
// ═══════════════════════════════════════════════════════════════════════════

async function initiateGoogleSignIn() {
    const provider = new firebase.auth.GoogleAuthProvider();

    // Add Google Drive scope for backup functionality
    provider.addScope(GOOGLE_DRIVE_SCOPE);

    // Force account selection
    provider.setCustomParameters({
        prompt: 'select_account'
    });

    try {
        const result = await firebase.auth().signInWithPopup(provider);

        // Get the OAuth access token for Google Drive API
        const credential = result.credential;
        if (credential && credential.accessToken) {
            // Google OAuth tokens expire in 1 hour (3600 seconds)
            saveDriveToken(credential.accessToken, 3600);
        }

        console.log('[Auth] Signed in as:', result.user.email);
        updateAuthUI();
        showSyncStatus('idle');

        // Check for cloud updates after sign in
        setTimeout(() => checkAndSyncOnLoad(), 1000);

    } catch (error) {
        console.error('[Auth] Sign in error:', error);
        if (error.code !== 'auth/popup-closed-by-user') {
            alert('Sign in failed: ' + error.message);
        }
    }
}

async function signOut() {
    try {
        await firebase.auth().signOut();
        clearSession();
        updateAuthUI();
        showSyncStatus('signed-out');
        console.log('[Auth] Signed out');
    } catch (error) {
        console.error('[Auth] Sign out error:', error);
    }
}

// Re-authenticate to get fresh Drive token (when token expires)
async function refreshDriveToken() {
    const user = firebase.auth().currentUser;
    if (!user) return null;

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope(GOOGLE_DRIVE_SCOPE);

    try {
        const result = await user.reauthenticateWithPopup(provider);
        if (result.credential && result.credential.accessToken) {
            saveDriveToken(result.credential.accessToken, 3600);
            return result.credential.accessToken;
        }
    } catch (error) {
        console.error('[Auth] Token refresh error:', error);
        // If re-auth fails, sign out completely
        await signOut();
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// UI STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function updateAuthUI() {
    const user = firebase.auth().currentUser;
    const signinCard = document.getElementById('signin-card');
    const userCard = document.getElementById('user-card');
    const userNameEl = document.getElementById('user-name');
    const userEmail = document.getElementById('user-email-display');
    const userAvatar = document.getElementById('user-avatar');
    const driveGroup = document.getElementById('driveGroup');

    if (!signinCard || !userCard) return;

    if (user) {
        // Logged in
        signinCard.style.display = 'none';
        userCard.style.display = 'block';
        if (driveGroup) driveGroup.style.display = 'flex';

        if (userNameEl) userNameEl.textContent = user.displayName || 'User';
        if (userEmail) userEmail.textContent = user.email || '';

        if (userAvatar) {
            if (user.photoURL) {
                userAvatar.src = user.photoURL;
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
const AUTO_SYNC_DELAY = 15000; // 15 seconds after last change
const MIN_SYNC_INTERVAL = 60000; // Minimum 1 minute between syncs

function scheduleAutoSync() {
    console.log('[AutoSync] scheduleAutoSync() called');

    const session = getStoredSession();
    if (!session) {
        console.log('[AutoSync] No session found - user not logged in or token expired');
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

    let session = getStoredSession();
    if (!session) {
        // Try to refresh the Drive token
        console.log('[AutoSync] No valid session, attempting token refresh...');
        const newToken = await refreshDriveToken();
        if (!newToken) {
            console.log('[AutoSync] Token refresh failed - aborting');
            return;
        }
        session = getStoredSession();
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
    localStorage.setItem('lastSyncTime', lastSyncTime.toString());

    try {
        await silentBackupToDrive(session.accessToken);
        console.log('[AutoSync] Upload successful!');
        showSyncStatus('synced', 'Synced');
    } catch (err) {
        console.error('[AutoSync] Upload failed:', err);
        if (err.message.includes('401') || err.message.includes('403')) {
            // Token expired - try to refresh
            console.log('[AutoSync] Token expired - attempting refresh');
            const newToken = await refreshDriveToken();
            if (newToken) {
                // Retry with new token
                try {
                    await silentBackupToDrive(newToken);
                    console.log('[AutoSync] Retry successful!');
                    showSyncStatus('synced', 'Synced');
                } catch (retryErr) {
                    console.error('[AutoSync] Retry failed:', retryErr);
                    showSyncStatus('error', 'Sync failed');
                }
            } else {
                showSyncStatus('error', 'Please sign in again');
            }
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
async function manualSyncToDrive() {
    console.log('[Sync] Manual sync button clicked');
    let session = getStoredSession();

    if (!session) {
        // Try to refresh token
        const newToken = await refreshDriveToken();
        if (!newToken) {
            alert('Please sign in again to sync');
            return;
        }
        session = getStoredSession();
    }

    console.log('[Sync] Starting manual sync...');
    showSyncStatus('syncing');

    try {
        await silentBackupToDrive(session.accessToken);
        lastSyncTime = Date.now();
        localStorage.setItem('lastSyncTime', lastSyncTime.toString());
        console.log('[Sync] Manual sync complete');
        showSyncStatus('synced', 'Synced');
    } catch (err) {
        console.error('[Sync] Manual sync failed:', err);
        if (err.message.includes('401') || err.message.includes('403')) {
            const newToken = await refreshDriveToken();
            if (newToken) {
                try {
                    await silentBackupToDrive(newToken);
                    lastSyncTime = Date.now();
                    localStorage.setItem('lastSyncTime', lastSyncTime.toString());
                    showSyncStatus('synced', 'Synced');
                } catch (retryErr) {
                    showSyncStatus('error', retryErr.message);
                }
            } else {
                showSyncStatus('error', 'Please sign in again');
            }
        } else {
            showSyncStatus('error', err.message);
        }
    }
}

async function manualRestoreFromDrive() {
    console.log('[Sync] Manual restore button clicked');
    let session = getStoredSession();

    if (!session) {
        const newToken = await refreshDriveToken();
        if (!newToken) {
            alert('Please sign in again to restore');
            return;
        }
        session = getStoredSession();
    }

    if (!confirm('This will replace all local notes with the cloud backup. Continue?')) {
        return;
    }

    console.log('[Sync] Starting restore from Drive...');
    showSyncStatus('syncing');

    try {
        await restoreFromDrive(session.accessToken);
        console.log('[Sync] Restore complete, reloading UI...');
        showSyncStatus('synced', 'Restored');
        window.location.reload();
    } catch (err) {
        console.error('[Sync] Restore failed:', err);
        if (err.message.includes('401') || err.message.includes('403')) {
            const newToken = await refreshDriveToken();
            if (newToken) {
                try {
                    await restoreFromDrive(newToken);
                    showSyncStatus('synced', 'Restored');
                    window.location.reload();
                } catch (retryErr) {
                    showSyncStatus('error', retryErr.message);
                }
            } else {
                showSyncStatus('error', 'Please sign in again');
            }
        } else {
            showSyncStatus('error', err.message);
        }
    }
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
// INITIALIZATION & AUTO-LOAD ON STARTUP
// ═══════════════════════════════════════════════════════════════════════════

async function checkAndSyncOnLoad() {
    console.log('[Sync] Checking for cloud updates on load...');

    const session = getStoredSession();
    if (!session) {
        console.log('[Sync] No session - skipping auto-load');
        return;
    }

    if (!navigator.onLine) {
        console.log('[Sync] Offline - skipping auto-load');
        return;
    }

    try {
        showSyncStatus('syncing');

        // Get cloud file metadata to check modified time
        const searchRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILENAME}' and trashed=false&fields=files(id,modifiedTime)`,
            { headers: { Authorization: `Bearer ${session.accessToken}` } }
        );

        if (!searchRes.ok) {
            console.log('[Sync] Failed to check cloud file:', searchRes.status);
            showSyncStatus('idle');
            return;
        }

        const searchData = await searchRes.json();
        const cloudFile = searchData.files?.[0];

        if (!cloudFile) {
            console.log('[Sync] No cloud backup found - will create on first save');
            showSyncStatus('idle');
            return;
        }

        const cloudModified = new Date(cloudFile.modifiedTime).getTime();
        const lastLocalSync = parseInt(localStorage.getItem('lastSyncTime') || '0', 10);

        console.log('[Sync] Cloud modified:', new Date(cloudModified).toLocaleString());
        console.log('[Sync] Last local sync:', lastLocalSync ? new Date(lastLocalSync).toLocaleString() : 'never');

        // If cloud is newer than last sync, restore from cloud
        if (cloudModified > lastLocalSync) {
            console.log('[Sync] Cloud is newer - auto-restoring...');
            await restoreFromDrive(session.accessToken);
            localStorage.setItem('lastSyncTime', Date.now().toString());
            console.log('[Sync] Auto-restored from cloud');
            showSyncStatus('synced', 'Synced');

            // Reload to show updated data
            setTimeout(() => window.location.reload(), 500);
        } else {
            console.log('[Sync] Local is up to date');
            showSyncStatus('idle');
        }
    } catch (err) {
        console.error('[Sync] Auto-load error:', err);
        showSyncStatus('idle');
    }
}

function initGoogleAuth() {
    // Listen for Firebase auth state changes
    firebase.auth().onAuthStateChanged((user) => {
        console.log('[Auth] Auth state changed:', user ? user.email : 'signed out');
        updateAuthUI();

        if (user) {
            showSyncStatus('idle');
            // Load last sync time
            lastSyncTime = parseInt(localStorage.getItem('lastSyncTime') || '0', 10);

            // Check for cloud updates after a short delay
            const session = getStoredSession();
            if (session) {
                setTimeout(() => checkAndSyncOnLoad(), 1500);
            }
        }
    });

    // Set up event listeners
    const signinBtn = document.getElementById('signin-btn');
    const signoutBtn = document.getElementById('signout-btn');
    const syncBtn = document.getElementById('sync-to-drive-btn');
    const restoreBtn = document.getElementById('restore-from-drive-btn');

    if (signinBtn) signinBtn.onclick = initiateGoogleSignIn;
    if (signoutBtn) signoutBtn.onclick = signOut;
    if (syncBtn) syncBtn.onclick = manualSyncToDrive;
    if (restoreBtn) restoreBtn.onclick = manualRestoreFromDrive;
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
