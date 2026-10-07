// ─────────────────────────────────────────────────────────────────────────────
// Reminder store — UI state for the date/time picker. The reminder data itself
// lives on the tagged groups (reminderStatus / reminderDate / reminderGroupId).
// `onCancel` lets the opener undo a deferred history snapshot if the user backs
// out of the picker.
// ─────────────────────────────────────────────────────────────────────────────

let _pickerOpen = $state(false);
let _pendingIds = $state<number[]>([]);
let _onCancel: (() => void) | null = null;

export const reminder = {
  get pickerOpen() {
    return _pickerOpen;
  },
  get pendingIds() {
    return _pendingIds;
  },

  /** Open the picker for the given group ids. `onCancel` runs if dismissed. */
  openPicker(ids: number[], onCancel?: () => void) {
    _pendingIds = ids;
    _onCancel = onCancel ?? null;
    _pickerOpen = true;
  },
  close() {
    _pickerOpen = false;
    _pendingIds = [];
    _onCancel = null;
  },
  cancel() {
    _onCancel?.();
    this.close();
  },
};
