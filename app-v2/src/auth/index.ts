// ─────────────────────────────────────────────────────────────────────────────
// Auth controller — sign in/out with Google, persist the Drive OAuth token, and
// run manual backup / restore. Bridges Firebase + Drive into the reactive `auth`
// store. Ported from signin.js (session mgmt, sign-in, manual sync/restore).
// ─────────────────────────────────────────────────────────────────────────────

import {
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  reauthenticateWithPopup,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth';
import { firebaseAuth, googleProvider, ADMIN_EMAILS } from './firebase';
import { backupToDrive, restoreFromDrive } from './drive';
import { auth as store } from '$stores/auth.svelte';
import { toast } from '$stores/toast.svelte';

const TOKEN_KEY = 'driveAccessToken';
const EXPIRY_KEY = 'driveTokenExpiry';
const BUFFER_MS = 5 * 60 * 1000; // treat a token as dead 5 min before expiry

function saveDriveToken(token: string, expiresInS = 3600): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresInS * 1000));
  store.setDriveToken(token);
}
function clearDriveToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  store.setDriveToken(null);
}

/** Currently-valid Drive token, or null if missing/expired. */
function validDriveToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
  if (!token || !expiry) return null;
  if (Date.now() >= expiry - BUFFER_MS) {
    clearDriveToken();
    return null;
  }
  return token;
}

function toAuthUser(u: User) {
  return {
    uid: u.uid,
    email: u.email ?? '',
    displayName: u.displayName,
    photoURL: u.photoURL,
  };
}

/** Wire Firebase auth-state → store. Call once on app start. */
export function initAuth(): void {
  store.setDriveToken(validDriveToken());
  onAuthStateChanged(firebaseAuth(), (u) => {
    if (u) {
      store.setUser(toAuthUser(u));
      store.setAdmin(ADMIN_EMAILS.includes((u.email ?? '').toLowerCase()));
      store.setSyncStatus('idle');
    } else {
      store.setUser(null);
      store.setAdmin(false);
      store.setSyncStatus('signed-out');
    }
  });
}

export async function signIn(): Promise<void> {
  try {
    const result = await signInWithPopup(firebaseAuth(), googleProvider());
    const cred = GoogleAuthProvider.credentialFromResult(result);
    if (cred?.accessToken) saveDriveToken(cred.accessToken, 3600);
    store.setSyncStatus('idle');
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      toast.show(`Sign in failed: ${e.message ?? 'unknown error'}`, 'bx-error');
    }
  }
}

export async function signOut(): Promise<void> {
  try {
    await fbSignOut(firebaseAuth());
    clearDriveToken();
    localStorage.removeItem('lastSyncTime');
  } catch (err) {
    console.error('[auth] sign out failed:', err);
  }
}

/** Re-prompt Google to mint a fresh Drive token (the old one expired). */
async function refreshDriveToken(): Promise<string | null> {
  const u = firebaseAuth().currentUser;
  if (!u) return null;
  try {
    const result = await reauthenticateWithPopup(u, googleProvider());
    const cred = GoogleAuthProvider.credentialFromResult(result);
    if (cred?.accessToken) {
      saveDriveToken(cred.accessToken, 3600);
      return cred.accessToken;
    }
  } catch (err) {
    console.error('[auth] token refresh failed:', err);
  }
  return null;
}

/** Get a usable Drive token, refreshing via popup if needed. */
async function ensureToken(): Promise<string | null> {
  return validDriveToken() ?? (await refreshDriveToken());
}

/** Run an operation with a Drive token, retrying once on 401/403 with a fresh token. */
async function withToken(op: (token: string) => Promise<void>): Promise<boolean> {
  let token = await ensureToken();
  if (!token) {
    toast.show('Please sign in again to sync', 'bx-info-circle');
    return false;
  }
  try {
    await op(token);
    return true;
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('401') || msg.includes('403')) {
      token = await refreshDriveToken();
      if (token) {
        await op(token);
        return true;
      }
    }
    throw err;
  }
}

export async function syncToDrive(): Promise<void> {
  if (!store.user) {
    toast.show('Sign in to back up', 'bx-info-circle');
    return;
  }
  if (!navigator.onLine) {
    store.setSyncStatus('offline');
    return;
  }
  store.setSyncStatus('syncing');
  try {
    const ok = await withToken(backupToDrive);
    if (ok) {
      localStorage.setItem('lastSyncTime', String(Date.now()));
      store.setSyncStatus('synced', 'Backed up');
    } else {
      store.setSyncStatus('idle');
    }
  } catch (err) {
    store.setSyncStatus('error', (err as Error).message);
  }
}

export async function restoreFromDriveFlow(): Promise<boolean> {
  if (!store.user) {
    toast.show('Sign in to restore', 'bx-info-circle');
    return false;
  }
  store.setSyncStatus('syncing');
  try {
    const ok = await withToken(restoreFromDrive);
    if (ok) {
      store.setSyncStatus('synced', 'Restored');
      return true;
    }
    store.setSyncStatus('idle');
    return false;
  } catch (err) {
    store.setSyncStatus('error', (err as Error).message);
    return false;
  }
}
