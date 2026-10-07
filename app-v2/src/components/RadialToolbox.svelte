<script lang="ts">
  // Radial tool menu. Opened by a hold gesture and driven by the SAME held
  // pointer (see input/pointer.ts): slide onto a tool and release to activate;
  // release on empty space to dismiss. This component is purely visual — the
  // pointer dispatcher does hit-testing via data-tool-index + elementFromPoint.
  import { toolbox } from '$stores/toolbox.svelte';
  import { tools } from '$stores/tools.svelte';
  import { TOOL_REGISTRY, TOOL_LABELS, type ToolboxToolConfig } from '$config/tools';

  const RADIUS = 92;

  const layout = $derived.by<ToolboxToolConfig[]>(() => {
    const s = toolbox.session;
    if (!s) return [];
    return tools.toolboxLayout[s.kind] ?? [];
  });

  const pos = $derived.by(() => {
    const s = toolbox.session;
    if (!s) return { x: 0, y: 0 };
    const pad = RADIUS + 44;
    const x = Math.max(pad, Math.min(window.innerWidth - pad, s.x));
    const y = Math.max(pad, Math.min(window.innerHeight - pad, s.y));
    return { x, y };
  });

  function slotStyle(i: number, n: number): string {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * RADIUS;
    const y = Math.sin(angle) * RADIUS;
    return `--tx: ${x}px; --ty: ${y}px; --delay: ${i * 28}ms;`;
  }

  function isTape(cfg: ToolboxToolConfig): boolean {
    return cfg.id === 'tape';
  }
</script>

{#if toolbox.session}
  {@const n = layout.length}
  <div class="tb-backdrop">
    <div class="tb-ring" style="left: {pos.x}px; top: {pos.y}px;">
      <div class="tb-center"></div>
      {#each layout as cfg, i (i)}
        {@const reg = TOOL_REGISTRY[cfg.id]}
        <div
          class="tb-tool"
          class:hovered={toolbox.hovered === i}
          data-tool-index={i}
          style={slotStyle(i, n)}
        >
          <span
            class="swatch"
            class:tape={isTape(cfg)}
            style="--c: {cfg.color ?? 'var(--surface-fg)'}"
          >
            <i class="bx {reg?.icon ?? 'bx-circle'}"></i>
          </span>
          <span class="label">{TOOL_LABELS[cfg.id] ?? cfg.id}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .tb-backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    /* visual only — the held pointer (captured by the canvas) drives selection */
    pointer-events: none;
    touch-action: none;
  }

  .tb-ring {
    position: absolute;
    width: 0;
    height: 0;
  }

  .tb-center {
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    left: -9px;
    top: -9px;
    background: var(--surface-fg);
    opacity: 0.2;
    animation: centerIn 240ms var(--ease-out) backwards;
  }
  @keyframes centerIn {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
  }

  .tb-tool {
    position: absolute;
    left: -26px;
    top: -26px;
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    /* the tool dots must be hit-testable by elementFromPoint */
    pointer-events: auto;
    transform: translate(var(--tx), var(--ty));
    animation: toolIn 420ms cubic-bezier(0.34, 1.4, 0.5, 1) backwards;
    animation-delay: var(--delay);
  }

  @keyframes toolIn {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0.3);
    }
    60% {
      opacity: 1;
    }
    100% {
      opacity: 1;
      transform: translate(var(--tx), var(--ty)) scale(1);
    }
  }

  .swatch {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--surface-panel);
    border: 2px solid var(--c);
    box-shadow: var(--shadow-md);
    color: var(--surface-fg);
    transition:
      transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 160ms var(--ease-out);
  }
  /* highlight the tool the held pointer is currently over */
  .tb-tool.hovered .swatch {
    transform: scale(1.22);
    box-shadow: var(--shadow-lg), 0 0 0 3px var(--accent-soft);
    border-color: var(--accent);
  }
  .swatch i {
    font-size: 1.4rem;
    color: var(--c);
  }

  .label {
    position: absolute;
    top: calc(100% - 2px);
    left: 50%;
    transform: translateX(-50%);
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    background: color-mix(in oklab, var(--surface-panel) 92%, transparent);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    color: var(--surface-fg-muted);
    font-family: var(--font-ui);
    font-size: 0.64rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
    pointer-events: none;
    transition: color var(--dur-fast) var(--ease-out);
  }
  .tb-tool.hovered .label {
    color: var(--accent);
  }
  .swatch.tape {
    background: linear-gradient(135deg, var(--c), color-mix(in oklab, var(--c) 50%, white));
    border-color: transparent;
  }
  .swatch.tape i {
    color: var(--surface-panel);
  }
</style>
