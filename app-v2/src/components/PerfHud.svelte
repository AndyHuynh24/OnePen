<script lang="ts">
  // TEMPORARY diagnostic overlay + remote logger. Shows live FPS, pointer-draw
  // events/sec, samples/sec, and time spent in the draw handler — and POSTs each
  // window to /__perf so the metrics land in perf.log on the dev machine (so the
  // tablet's numbers can be inspected on the computer).
  import { perf } from '$lib/perf';
  import { dpr } from '$canvas/transform';
  import { note } from '$stores/note.svelte';

  let fps = $state(0);
  let eps = $state(0);
  let drawMs = $state(0);
  let maxMs = $state(0);

  // Actual runtime status: the input layer sets window._rawPointer the first time
  // a pointerrawupdate event fires (more reliable than the 'in window' check).
  const rawStatus = () =>
    typeof window !== 'undefined' &&
    (window as unknown as { _rawPointer?: boolean })._rawPointer === true;
  // What kind of pointer fired the last stroke (set by the input layer). 'mouse'/
  // 'touch' explain a silent pointerrawupdate; 'pen' on a supporting device fires it.
  const ptrType = () =>
    (typeof window !== 'undefined' &&
      (window as unknown as { _ptrType?: string })._ptrType) ||
    '?';

  $effect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();

    const loop = (now: number) => {
      frames++;
      const dt = now - last;
      if (dt >= 1000) {
        fps = Math.round((frames * 1000) / dt);
        eps = Math.round((perf.events * 1000) / dt);
        const sps = Math.round((perf.samples * 1000) / dt);
        drawMs = perf.events ? Math.round((perf.totalMs / perf.events) * 1000) / 1000 : 0;
        maxMs = Math.round(perf.maxMs * 1000) / 1000;

        // only log windows where drawing actually happened (keeps the log focused)
        if (perf.events > 0) {
          const payload = {
            fps,
            eps,
            sps,
            avgDrawMs: drawMs,
            maxDrawMs: maxMs,
            // per-stroke pen-up cost split + draw-layer render cost this window
            strokes: perf.commitN,
            groups: note.groups.length,
            captureAvg: perf.commitN ? Math.round((perf.captureMs / perf.commitN) * 100) / 100 : 0,
            captureMax: Math.round(perf.captureMax * 100) / 100,
            classifyAvg: perf.commitN ? Math.round((perf.classifyMs / perf.commitN) * 100) / 100 : 0,
            classifyMax: Math.round(perf.classifyMax * 100) / 100,
            renderN: perf.renderN,
            renderAvg: perf.renderN ? Math.round((perf.renderMs / perf.renderN) * 100) / 100 : 0,
            renderMax: Math.round(perf.renderMax * 100) / 100,
            raw: rawStatus(),
            ptr: ptrType(),
            dprCap: dpr,
            dpr: window.devicePixelRatio,
            w: window.innerWidth,
            h: window.innerHeight,
            ua: navigator.userAgent,
          };
          // fire-and-forget; never block drawing
          void fetch('/__perf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch(() => {});
        }

        frames = 0;
        perf.reset();
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="perf-hud">
  fps {fps} · ev/s {eps} · draw {drawMs}ms · {ptrType()}/{rawStatus() ? 'raw' : 'move'} · dpr {dpr}
</div>

<style>
  .perf-hud {
    position: fixed;
    bottom: 6px;
    left: 6px;
    z-index: 9999;
    font: 11px/1.3 ui-monospace, monospace;
    color: #1bff1b;
    background: rgba(0, 0, 0, 0.62);
    padding: 3px 7px;
    border-radius: 4px;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
