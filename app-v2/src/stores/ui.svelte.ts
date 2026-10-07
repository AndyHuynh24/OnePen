// ─────────────────────────────────────────────────────────────────────────────
// UI store — single source of truth for the current interaction mode + which
// panels / popups are visible. Replaces the parallel-boolean morass in main.js.
// ─────────────────────────────────────────────────────────────────────────────

import { APP_MODE, type AppMode } from '$config/strokeTypes';

let _mode = $state<AppMode>(APP_MODE.IDLE);
let _settingsOpen = $state<boolean>(false);
let _tocOpen = $state<boolean>(false);
let _reminderPanelOpen = $state<boolean>(false);
let _flashcardOpen = $state<boolean>(false);
let _navOpen = $state<boolean>(true);
let _selectedFolder = $state<string | null>(null);

export const ui = {
  get mode() {
    return _mode;
  },
  get settingsOpen() {
    return _settingsOpen;
  },
  get tocOpen() {
    return _tocOpen;
  },
  get reminderPanelOpen() {
    return _reminderPanelOpen;
  },
  get flashcardOpen() {
    return _flashcardOpen;
  },
  get navOpen() {
    return _navOpen;
  },
  get selectedFolder() {
    return _selectedFolder;
  },

  setMode(m: AppMode) {
    _mode = m;
  },
  toggleSettings(force?: boolean) {
    _settingsOpen = force ?? !_settingsOpen;
  },
  toggleToc(force?: boolean) {
    _tocOpen = force ?? !_tocOpen;
  },
  toggleReminderPanel(force?: boolean) {
    _reminderPanelOpen = force ?? !_reminderPanelOpen;
  },
  toggleFlashcard(force?: boolean) {
    _flashcardOpen = force ?? !_flashcardOpen;
  },
  toggleNav(force?: boolean) {
    _navOpen = force ?? !_navOpen;
  },

  selectFolder(folder: string | null) {
    _selectedFolder = folder;
  },
};
