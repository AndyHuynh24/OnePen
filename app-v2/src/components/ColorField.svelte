<script lang="ts">
  // Reusable color control: a swatch button that opens the GLOBAL color-picker
  // overlay (universal panel + recent colors). It delegates to the overlay rather
  // than rendering its own popover so it's never clipped by a scrolling/blurred
  // container (e.g. the settings panel, whose backdrop-filter + overflow would
  // otherwise trap an in-panel popover).
  import { colorPicker } from '$stores/colorPicker.svelte';

  interface Props {
    value: string;
    onchange: (color: string) => void;
    label?: string;
  }
  let { value, onchange, label = 'Color' }: Props = $props();

  let swatchEl: HTMLButtonElement | undefined;

  function open() {
    if (!swatchEl) return;
    const r = swatchEl.getBoundingClientRect();
    colorPicker.open({
      value,
      x: r.left + r.width / 2,
      y: r.bottom,
      onPick: (c) => onchange(c),
    });
  }
</script>

<button
  bind:this={swatchEl}
  class="cf-swatch"
  style="--c: {value}"
  aria-label={label}
  title={label}
  onclick={open}
></button>

<style>
  .cf-swatch {
    width: 34px;
    height: 30px;
    border-radius: var(--radius-sm);
    background: var(--c);
    border: 1px solid var(--border-strong);
    cursor: pointer;
    display: inline-block;
    vertical-align: middle;
  }
</style>
