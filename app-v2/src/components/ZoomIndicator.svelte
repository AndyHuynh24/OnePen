<script lang="ts">
  import { viewport } from '$stores/viewport.svelte';
  import { scrollSignal } from '$stores/scroll.svelte';

  let visible = $state(false);
  let hideTimer: number | null = null;

  // Reveal on any zoom change, auto-hide after 2s. Cleanup clears the pending
  // timer on re-run and on unmount (no leak / no fire-after-destroy).
  $effect(() => {
    void scrollSignal.zoomTick;
    void viewport.scale;
    visible = true;
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => (visible = false), 2000);
    return () => {
      if (hideTimer !== null) clearTimeout(hideTimer);
    };
  });

  const percent = $derived(Math.round(viewport.scale * 100));

  function reset() {
    viewport.setScale(1);
  }
</script>

<button class="zoom" class:visible onclick={reset} title="Reset zoom to 100%">
  <i class="bx bx-search-alt"></i>
  <span>{percent}%</span>
</button>

<style>
  .zoom {
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translate(-50%, -120%);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: var(--radius-pill);
    /* solid, not backdrop-blur (re-blurs the canvas every stroke frame → lag) */
    background: var(--surface-panel);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-md);
    color: var(--surface-fg);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    z-index: 60;
    opacity: 0;
    transition:
      transform var(--dur-base) var(--ease-out),
      opacity var(--dur-base) var(--ease-out);
  }
  .zoom.visible {
    transform: translate(-50%, 0);
    opacity: 1;
  }
  .zoom:hover {
    background: var(--surface-panel);
  }
  .zoom i {
    font-size: 1rem;
    color: var(--accent);
  }
</style>
