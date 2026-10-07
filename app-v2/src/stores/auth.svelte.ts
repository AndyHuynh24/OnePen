// ─────────────────────────────────────────────────────────────────────────────
// Auth store — Firebase user + Google Drive token. The actual Firebase init
// and sign-in flow lives in src/auth/; this store is just reactive state.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
}

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'error'
  | 'offline'
  | 'signed-out';

let _user = $state<AuthUser | null>(null);
let _driveToken = $state<string | null>(null);
let _syncStatus = $state<SyncStatus>('idle');
let _syncMessage = $state<string>('');
let _isAdmin = $state<boolean>(false);

export const auth = {
  get user() {
    return _user;
  },
  get driveToken() {
    return _driveToken;
  },
  get syncStatus() {
    return _syncStatus;
  },
  get syncMessage() {
    return _syncMessage;
  },
  get isAdmin() {
    return _isAdmin;
  },

  setUser(u: AuthUser | null) {
    _user = u;
  },
  setDriveToken(t: string | null) {
    _driveToken = t;
  },
  setSyncStatus(s: SyncStatus, message = '') {
    _syncStatus = s;
    _syncMessage = message;
  },
  setAdmin(v: boolean) {
    _isAdmin = v;
  },
};
