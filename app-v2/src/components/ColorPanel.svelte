<script lang="ts">
  // The ONE color panel used everywhere a color is chosen: a native custom-color
  // input + the shared recent-colors list. Consumers (ColorField, the toolbar,
  // the global color-picker overlay) embed this so recents + behavior are
  // identical app-wide. Recording to recents happens here so it's never missed.
  import { tools } from '$stores/tools.svelte';

  interface Props {
    value: string;
    /** live update while dragging the OS picker — NOT recorded to recents */
    onpreview?: (color: string) => void;
    /** final custom-color choice — recorded to recents */
    oncommit?: (color: string) => void;
    /** a recent swatch was chosen — recorded to recents */
    onrecent?: (color: string) => void;
  }
  let { value, onpreview, oncommit, onrecent }: Props = $props();

  function preview(e: Event) {
    onpreview?.((e.target as HTMLInputElement).value);
  }
  function commit(e: Event) {
    const c = (e.target as HTMLInputElement).value;
    tools.pushRecentColor(c);
    oncommit?.(c);
  }
  function recent(c: string) {
    tools.pushRecentColor(c);
    onrecent?.(c);
  }
</script>

<div class="cp">
  <label class="cp-picker">
    <span>Custom</span>
    <input type="color" {value} oninput={preview} onchange={commit} />
  </label>
  {#if tools.recentColors.length > 0}
    <div class="cp-lbl">Recent</div>
    <div class="cp-recents">
      {#each tools.recentColors as c (c)}
        <button
          class="cp-sm"
          class:active={value === c}
          style="--c: {c}"
          aria-label="Recent {c}"
          onclick={() => recent(c)}
        ></button>
      {/each}
    </div>
  {/if}
  {#if tools.toolColors.length > 0}
    <div class="cp-lbl">Used in other tools</div>
    <div class="cp-recents">
      {#each tools.toolColors as c (c)}
        <button
          class="cp-sm"
          class:active={value === c}
          style="--c: {c}"
          aria-label="Tool color {c}"
          onclick={() => recent(c)}
        ></button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cp {
    display: block;
  }
  .cp-picker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 6px;
    font-size: 0.82rem;
    color: var(--surface-fg-muted);
  }
  .cp-picker input {
    width: 34px;
    height: 28px;
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
  }
  .cp-lbl {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--surface-fg-subtle);
    padding: 5px 6px 2px;
  }
  .cp-recents {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px 6px 4px;
  }
  .cp-sm {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--c);
    border: 2px solid var(--border-strong);
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .cp-sm:hover {
    transform: scale(1.12);
  }
  .cp-sm.active {
    box-shadow: 0 0 0 2px var(--surface-panel), 0 0 0 4px var(--accent);
  }
</style>
