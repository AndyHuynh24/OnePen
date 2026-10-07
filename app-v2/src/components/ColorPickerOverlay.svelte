<script lang="ts">
  // Renders the universal color panel as a floating popover, opened imperatively
  // via the colorPicker store (used by the toolbox's custom-color tool). Mounted
  // once in App.svelte.
  import { colorPicker } from '$stores/colorPicker.svelte';
  import ColorPanel from './ColorPanel.svelte';

  const session = $derived(colorPicker.session);

  // keep the popover fully on-screen: clamp horizontally to the panel half-width
  // and shift up if the anchor sits too close to the bottom edge.
  const PANEL_W = 184;
  const EST_H = 260; // picker row + Recent + "used in other tools" sections
  const left = $derived(
    session ? Math.max(PANEL_W / 2 + 8, Math.min(window.innerWidth - PANEL_W / 2 - 8, session.x)) : 0,
  );
  // show/hide toggle for the gesture stroke (only when styling a selection)
  let modVisible = $state(true);
  $effect(() => {
    modVisible = session?.modifier?.visible ?? true;
  });
  function toggleModifier() {
    modVisible = !modVisible;
    session?.modifier?.onToggle(modVisible);
  }

  const top = $derived(
    session ? Math.max(8, Math.min(session.y, window.innerHeight - EST_H - 8)) : 0,
  );
</script>

{#if session}
  <div class="cpo-back" onclick={() => colorPicker.close()} role="presentation"></div>
  <div class="cpo" style="left: {left}px; top: {top}px;">
    <ColorPanel
      value={session.value}
      onpreview={(c) => session.onPick(c)}
      oncommit={(c) => {
        session.onPick(c);
        colorPicker.close();
      }}
      onrecent={(c) => {
        session.onPick(c);
        colorPicker.close();
      }}
    />
    {#if session.modifier}
      <button
        class="mod-toggle"
        class:off={!modVisible}
        onclick={toggleModifier}
        title={modVisible ? 'Hide the selection stroke' : 'Show the selection stroke'}
      >
        <i class="bx {modVisible ? 'bx-show' : 'bx-hide'}"></i>
        <span>{modVisible ? 'Stroke shown' : 'Stroke hidden'}</span>
      </button>
    {/if}
  </div>
{/if}

<style>
  /* above every panel (settings = 120, shelf, editors) so it's never blocked */
  .cpo-back {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }
  .cpo {
    position: fixed;
    z-index: 1001;
    width: 184px;
    transform: translate(-50%, 10px);
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: 8px;
    animation: cpoIn var(--dur-fast) var(--ease-out);
  }
  .mod-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin-top: 8px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--surface-fg);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .mod-toggle i {
    font-size: 16px;
  }
  .mod-toggle.off {
    color: var(--surface-fg-muted);
    opacity: 0.75;
  }
  @keyframes cpoIn {
    from {
      opacity: 0;
      transform: translate(-50%, 4px);
    }
  }
</style>
