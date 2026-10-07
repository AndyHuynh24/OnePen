<script lang="ts">
  // Floating "Notes" button — visible when the notebook shelf is closed.
  // Slides out of view when the shelf opens so the shelf's own header takes over.
  import { ui } from '$stores/ui.svelte';
</script>

<button
  class="nav-toggle"
  class:hidden={ui.navOpen}
  onclick={() => ui.toggleNav(true)}
  title="Open notebooks"
  aria-label="Open notebooks"
>
  <i class="bx bx-menu"></i>
  <span>Notes</span>
</button>

<style>
  .nav-toggle {
    position: fixed;
    top: 16px;
    left: 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px 7px 11px;
    /* solid, not backdrop-blur: sits over the canvas while drawing, so a blur
       would re-blur the canvas every stroke frame → constant lag */
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-md);
    color: var(--surface-fg);
    font-family: var(--font-ui);
    font-size: 0.85rem;
    font-weight: 500;
    z-index: 70;
    transition:
      transform var(--dur-base) var(--ease-out),
      opacity var(--dur-base) var(--ease-out),
      background var(--dur-fast) var(--ease-out);
  }

  .nav-toggle i {
    font-size: 1.05rem;
  }

  .nav-toggle:hover {
    background: var(--surface-panel);
  }

  .nav-toggle.hidden {
    transform: translateX(-120%);
    opacity: 0;
    pointer-events: none;
  }
</style>
