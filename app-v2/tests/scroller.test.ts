// Scroll motion contract: per-frame movement stays even whatever the input
// cadence, no distance is lost to pixel rounding, wheel notches glide, and
// momentum coasts and stops without leaving the content.

import { describe, it, expect, beforeEach } from 'vitest';
import { createScroller } from '../src/input/scroller';
import { viewport } from '../src/stores/viewport.svelte';
import { CONFIG } from '../src/config/constants';

const FRAME = 1000 / 60;
const engine = { invalidateAll() {}, requestFrame() {} };
let scroller: ReturnType<typeof createScroller>;
let now = 0;

/** Run frames, returning how far the view moved in each. */
function frames(n: number, feed?: (i: number) => void): number[] {
  const steps: number[] = [];
  for (let i = 0; i < n; i++) {
    feed?.(i);
    const before = viewport.offset.y;
    now += FRAME;
    scroller.step(now);
    steps.push(viewport.offset.y - before);
  }
  return steps;
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

beforeEach(() => {
  viewport.setContentBounds(0, 0, 100000, 100000);
  viewport.setOffset({ x: 0, y: 0 });
  scroller = createScroller(engine);
  now = 1000;
});

describe('scroller', () => {
  it('evens out input that arrives out of step with the display', () => {
    // 150px/s-per-frame finger, delivered as 2 then 3 events per frame
    const steps = frames(60, (i) => {
      const events = i % 2 ? 3 : 2;
      for (let e = 0; e < events; e++) scroller.drag(0, 12, now + e);
    }).slice(20, 50);
    const mean = sum(steps) / steps.length;
    const raw = 6; // what per-event application swings by: 24 ↔ 36
    expect(Math.max(...steps) - mean).toBeLessThan(raw);
    expect(mean - Math.min(...steps)).toBeLessThan(raw);
  });

  it('loses no distance to rounding on a slow scroll', () => {
    frames(600, () => scroller.drag(0, 0.2, now));
    frames(30);
    expect(viewport.offset.y).toBeCloseTo(120, 0);
  });

  it('glides a mouse wheel notch and lands exactly', () => {
    scroller.wheel(0, 100, true);
    const steps = frames(40);
    expect(Math.max(...steps)).toBeLessThan(40);
    expect(viewport.offset.y).toBeCloseTo(100, 0);
  });

  it('keeps up with a trackpad', () => {
    scroller.wheel(0, 100, false);
    frames(3);
    expect(viewport.offset.y).toBeGreaterThan(85);
  });

  it('coasts after a flick, then stops', () => {
    for (let i = 0; i < 10; i++) scroller.drag(0, 16, now + i * 8);
    now += 80;
    scroller.release(now);
    const at = viewport.offset.y;
    const steps = frames(300).filter((s) => s !== 0);
    const coast = (steps.length * FRAME) / CONFIG.SCROLL_FLICK_MS;
    expect(viewport.offset.y).toBeGreaterThan(at + 500);
    expect(coast).toBeGreaterThan(1.5); // a good while, not a dead stop
    expect(scroller.step(now + FRAME)).toBe(false);
    const after = viewport.offset.y;
    frames(10);
    expect(viewport.offset.y).toBe(after);
  });

  it('does not flick when the finger stopped before lifting', () => {
    for (let i = 0; i < 10; i++) scroller.drag(0, 16, now + i * 8);
    frames(30);
    const y = viewport.offset.y;
    scroller.release(now + 500);
    frames(30);
    expect(viewport.offset.y).toBeCloseTo(y, 1);
  });

  it('stops at the content edge instead of pushing against it', () => {
    viewport.setContentBounds(0, 0, 100000, 300);
    for (let i = 0; i < 10; i++) scroller.drag(0, 30, now + i * 8);
    now += 80;
    scroller.release(now);
    frames(60);
    expect(viewport.offset.y).toBeLessThanOrEqual(300);
    expect(scroller.step(now + FRAME)).toBe(false);
  });

  it('stop() ends momentum at once', () => {
    for (let i = 0; i < 10; i++) scroller.drag(0, 16, now + i * 8);
    now += 80;
    scroller.release(now);
    frames(3);
    scroller.stop();
    frames(1);
    const y = viewport.offset.y;
    frames(10);
    expect(viewport.offset.y).toBe(y);
  });

  it('respects a jump made elsewhere during a scroll', () => {
    scroller.wheel(0, 1000, true);
    frames(2);
    viewport.setOffset({ x: 0, y: 5000 });
    frames(1);
    expect(viewport.offset.y).toBeGreaterThan(5000);
  });
});
