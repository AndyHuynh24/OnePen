// ─────────────────────────────────────────────────────────────────────────────
// Firebase init (modular SDK v11). Reuses the original `onepen-notes` project so
// app-v2 shares the same auth + Drive backups as the live app.
//
// NOTE: for Google sign-in to work, the host serving app-v2 must be listed under
// Firebase console → Authentication → Settings → Authorized domains (localhost is
// allowed by default; a LAN IP like 192.168.x.x must be added explicitly).
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAd9WCl0U7xlLOf3Zn6L2CeKK8Ypr-Qy-Y',
  authDomain: 'onepen-notes.firebaseapp.com',
  projectId: 'onepen-notes',
  storageBucket: 'onepen-notes.firebasestorage.app',
  messagingSenderId: '678640490757',
  appId: '1:678640490757:web:86d0169fa8302d33243f6c',
  measurementId: 'G-43E4X8GN2P',
};

/** Google Drive scope so the OAuth token can read/write the backup file. */
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Admin emails (gated features). Mirrors ADMIN_EMAILS in signin.js. */
export const ADMIN_EMAILS = ['huy.b.huynh06@gmail.com'];

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;

export function firebaseApp(): FirebaseApp {
  if (!_app) _app = initializeApp(firebaseConfig);
  return _app;
}

export function firebaseAuth(): Auth {
  if (!_auth) _auth = getAuth(firebaseApp());
  return _auth;
}

/** A Google provider configured with the Drive scope + account chooser. */
export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.addScope(GOOGLE_DRIVE_SCOPE);
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}
