<script lang="ts">
  // Reminder date/time picker — opened from the toolbox bell. On confirm it tags
  // the pending groups with the chosen due date.
  import { reminder } from '$stores/reminder.svelte';
  import { applyReminder } from '$tools/execute';

  function tomorrow(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  let date = $state('');
  let time = $state('09:00');
  let wasOpen = $state(false);
  $effect(() => {
    if (reminder.pickerOpen && !wasOpen) {
      date = tomorrow();
      time = '09:00';
    }
    wasOpen = reminder.pickerOpen;
  });

  function confirm() {
    if (!date) return;
    const due = new Date(`${date}T${time || '09:00'}`).toISOString();
    applyReminder(reminder.pendingIds, due);
    reminder.close();
  }
  function cancel() {
    reminder.cancel();
  }
</script>

{#if reminder.pickerOpen}
  <div class="backdrop" onclick={cancel} role="presentation"></div>
  <div class="picker" role="dialog" aria-label="Set reminder">
    <h3><i class="bx bx-bell"></i> Set reminder</h3>
    <label>
      <span>Date</span>
      <input type="date" bind:value={date} />
    </label>
    <label>
      <span>Time</span>
      <input type="time" bind:value={time} />
    </label>
    <div class="row">
      <button class="ghost" onclick={cancel}>Cancel</button>
      <button class="primary" onclick={confirm} disabled={!date}>Set reminder</button>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 180; background: var(--scrim-strong);
    animation: fade var(--dur-fast) var(--ease-out);
  }
  @keyframes fade { from { opacity: 0; } }
  .picker {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 181; width: 300px;
    background: var(--surface-panel); border: 1px solid var(--border);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 18px;
    font-family: var(--font-ui);
    animation: pop var(--dur-fast) var(--ease-out);
  }
  @keyframes pop { from { opacity: 0; transform: translate(-50%, -48%); } }
  h3 {
    display: flex; align-items: center; gap: 8px; margin: 0 0 14px;
    font-size: 1rem; font-weight: 600; color: var(--surface-fg);
  }
  h3 i { color: var(--surface-fg); }
  label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  label span { font-size: 0.85rem; color: var(--surface-fg-muted); }
  input {
    padding: 7px 10px; border: 1px solid var(--border); border-radius: var(--radius-md);
    background: var(--surface-bg); color: var(--surface-fg); font-family: var(--font-ui); font-size: 0.88rem;
  }
  input:focus { outline: none; border-color: var(--accent); }
  .row { display: flex; gap: 8px; margin-top: 16px; }
  .ghost { flex: 1; padding: 9px; border-radius: var(--radius-md); color: var(--surface-fg-muted); }
  .ghost:hover { background: var(--surface-raised); color: var(--surface-fg); }
  .primary {
    flex: 2; padding: 9px; border-radius: var(--radius-md);
    background: var(--accent); color: var(--accent-fg); font-weight: 500; font-size: 0.88rem;
  }
  .primary:disabled { opacity: 0.45; }
</style>
