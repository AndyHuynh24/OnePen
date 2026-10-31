// ─────────────────────────────────────────────────────────────────────────────
// Scroller — the one place the canvas moves. Input never touches the viewport
// directly: fingers, trackpads and wheels add to a pending distance, and once per
// frame the engine calls step(), which moves the view and paints in the same frame.
// That's what native scrolling does, and what makes it read as smooth:
//   • input arrives out of step with the display, so applying it per event gave
//     every frame a different amount of movement. Following it per frame evens
//     that out for a few ms of lag;
//   • a mouse wheel notch glides instead of jumping;
//   • the exact position is kept here as a float. The viewport rounds to device
//     pixels, and rounding each small step on its own distorted slow scrolling;
//   • flick speed comes from the last ~100ms of movement, not the last event, and
//     momentum decays exponentially from there with time taken from the display.
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG } from '$config/constants';
import { viewport } from '$stores/viewport.svelte';
import { scrollSignal } from '$stores/scroll.svelte';

/** Below this much pending distance (screen px) the view just lands. */
const LAND_PX = 0.05;
const FRAME_MS = 1000 / 60;
/** Longest frame step(): after a stall, don't lurch to catch up. */
const MAX_DT_MS = 50;
/** A finger still for this long at lift-off stopped on purpose: no flick. */
const FLICK_STALE_MS = 50;

export interface ScrollTarget {
  invalidateAll(): void;
  requestFrame(): void;
}

interface Sample {
  t: number;
  dx: number;
  dy: number;
}

export function createScroller(engine: ScrollTarget) {
  let pendX = 0; // screen px still to show
  let pendY = 0;
  let velX = 0; // flick, screen px / ms
  let velY = 0;
  let tau: number = CONFIG.SCROLL_FOLLOW_MS;
  // exact position (world), and what the viewport rounded it to last frame
  let posX = 0;
  let posY = 0;
  let shownX = NaN;
  let shownY = NaN;
  let lastFrame = -1;
  let active = false;
  let samples: Sample[] = [];

  function wake() {
    if (active) return;
    active = true;
    lastFrame = -1;
    engine.requestFrame();
  }

  return {
    /** Finger / pen drag or trackpad: the view follows closely. */
    drag(dx: number, dy: number, t: number) {
      pendX += dx;
      pendY += dy;
      velX = velY = 0;
      tau = CONFIG.SCROLL_FOLLOW_MS;
      samples.push({ t, dx, dy });
      const cutoff = t - CONFIG.SCROLL_FLICK_WINDOW_MS;
      while (samples.length > 0 && samples[0].t < cutoff) samples.shift();
      wake();
    },

    /** Wheel input. `notch` = a mouse wheel click, which glides there. */
    wheel(dx: number, dy: number, notch: boolean) {
      pendX += dx;
      pendY += dy;
      velX = velY = 0;
      tau = notch ? CONFIG.SCROLL_WHEEL_MS : CONFIG.SCROLL_FOLLOW_MS;
      wake();
    },

    /** The finger lifted at time `now`: carry on with momentum if it was moving. */
    release(now: number) {
      const s = samples;
      samples = [];
      if (s.length < 2 || now - s[s.length - 1].t > FLICK_STALE_MS) return;
      const span = s[s.length - 1].t - s[0].t;
      if (span <= 0) return;
      let dx = 0;
      let dy = 0;
      // the first sample's distance was covered before the window opened
      for (let i = 1; i < s.length; i++) {
        dx += s[i].dx;
        dy += s[i].dy;
      }
      velX = dx / span;
      velY = dy / span;
      if (Math.hypot(velX, velY) < CONFIG.SCROLL_FLICK_MIN) velX = velY = 0;
      else wake();
    },

    /** Stop dead: a new touch caught the page, or a zoom started. */
    stop() {
      pendX = pendY = velX = velY = 0;
      samples = [];
    },

    /** Move the view for one display frame. Returns true while still moving. */
    step(t: number): boolean {
      if (!active) return false;
      const dt = lastFrame < 0 ? FRAME_MS : Math.min(t - lastFrame, MAX_DT_MS);
      lastFrame = t;

      const follow = 1 - Math.exp(-dt / tau);
      let sx = pendX * follow;
      let sy = pendY * follow;
      pendX -= sx;
      pendY -= sy;
      if (Math.abs(pendX) < LAND_PX) {
        sx += pendX;
        pendX = 0;
      }
      if (Math.abs(pendY) < LAND_PX) {
        sy += pendY;
        pendY = 0;
      }

      const decay = Math.exp(-dt / CONFIG.SCROLL_FLICK_MS);
      sx += velX * CONFIG.SCROLL_FLICK_MS * (1 - decay);
      sy += velY * CONFIG.SCROLL_FLICK_MS * (1 - decay);
      velX *= decay;
      velY *= decay;
      if (Math.hypot(velX, velY) < CONFIG.SCROLL_FLICK_MIN) velX = velY = 0;

      // anything else that moved the view (zoom, jump to a heading) wins
      const scale = viewport.scale;
      if (viewport.offset.x !== shownX) posX = viewport.offset.x;
      if (viewport.offset.y !== shownY) posY = viewport.offset.y;
      posX += sx / scale;
      posY += sy / scale;
      viewport.setOffset({ x: posX, y: posY });
      shownX = viewport.offset.x;
      shownY = viewport.offset.y;

      // further off than rounding explains = clamped at the edge of the content
      if (Math.abs(posX - shownX) > 1 / scale) {
        posX = shownX;
        pendX = velX = 0;
      }
      if (Math.abs(posY - shownY) > 1 / scale) {
        posY = shownY;
        pendY = velY = 0;
      }

      scrollSignal.pingScroll();
      engine.invalidateAll();
      active = pendX !== 0 || pendY !== 0 || velX !== 0 || velY !== 0;
      return active;
    },
  };
}

export type Scroller = ReturnType<typeof createScroller>;
