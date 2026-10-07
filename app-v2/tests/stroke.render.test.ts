// Ink must come out smooth and never change shape afterwards:
//  • smoothing is causal + incremental — a point is final the moment it's pushed
//  • starts exactly at the pen
//  • stays close to the real pen path at any speed / sample rate (no over-smoothing)
//  • takes a good part of the slow-hand wobble out
//  • the drawn curve is append-only: a longer stroke only extends the shorter one

import { describe, it, expect } from 'vitest';
import { drawStroke, smoothInk, InkSmoother } from '../src/canvas/render/stroke';
import type { Point } from '../src/types/geometry';

/** Handwriting-sized loop (r = 5px) drawn at `speed` px/s, sampled at `hz`. */
function loop(speed: number, hz: number): Point[] {
  const r = 5;
  const pts: Point[] = [];
  const dur = (2 * Math.PI * r * 1.5) / speed;
  for (let t = 0; t < dur; t += 1 / hz) {
    const a = (speed * t) / r;
    pts.push({ x: r * Math.cos(a) + speed * t * 0.25, y: r * Math.sin(a), t: t * 1000 });
  }
  return pts;
}

/** Slow straight line with gaussian-ish digitizer wobble on y. */
function wobblyLine(speed: number, hz: number): Point[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const pts: Point[] = [];
  for (let t = 0; t < 0.6; t += 1 / hz) pts.push({ x: speed * t, y: (rnd() + rnd() + rnd()) * 0.5, t: t * 1000 });
  return pts;
}

describe('InkSmoother', () => {
  it('incremental pushes match the batch result, so live ink == committed ink', () => {
    const all = wobblyLine(60, 240);
    const batch = smoothInk(all);
    const s = new InkSmoother();
    all.forEach((p, i) => expect(s.push(p)).toEqual(batch[i]));
  });

  it('starts exactly at the pen and keeps pressure/time', () => {
    const all = loop(300, 120);
    const s = smoothInk(all);
    expect(s[0]).toEqual(all[0]);
    expect(s[5].t).toBe(all[5].t);
  });

  it('stays within ~1px of the pen at any speed / rate', () => {
    for (const hz of [60, 120, 240]) {
      for (const speed of [40, 150, 400, 1000]) {
        const p = loop(speed, hz);
        const s = smoothInk(p);
        for (let i = 0; i < p.length; i++) {
          expect(Math.hypot(s[i].x - p[i].x, s[i].y - p[i].y)).toBeLessThan(1.2);
        }
      }
    }
  });

  it('takes the wobble out of slow writing', () => {
    const p = wobblyLine(40, 240);
    const s = smoothInk(p);
    let raw = 0;
    let smoothed = 0;
    for (let i = 5; i < p.length; i++) {
      raw += Math.abs(p[i].y);
      smoothed += Math.abs(s[i].y);
    }
    expect(smoothed / raw).toBeLessThan(0.6);
  });

  it('smooths by on-screen distance: zoomed in, world wobble is still damped', () => {
    const p = wobblyLine(40, 240).map((q) => ({ ...q, x: q.x / 4, y: q.y / 4 }));
    const s = smoothInk(p, 4);
    let raw = 0;
    let smoothed = 0;
    for (let i = 5; i < p.length; i++) {
      raw += Math.abs(p[i].y);
      smoothed += Math.abs(s[i].y);
    }
    expect(smoothed / raw).toBeLessThan(0.6);
  });
});

describe('drawStroke', () => {
  function record(pts: Point[]) {
    const ops: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'moveTo' || prop === 'lineTo' || prop === 'quadraticCurveTo')
            return (...a: number[]) => ops.push(`${String(prop)}(${a.join(',')})`);
          return () => {};
        },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    drawStroke(ctx, pts, { color: '#000', size: 2 });
    return ops;
  }

  it('is append-only: a longer stroke redraws the shorter one unchanged, plus a new tail', () => {
    const pts = smoothInk(loop(300, 120));
    const full = record(pts);
    for (let n = 3; n < pts.length; n += 5) {
      const part = record(pts.slice(0, n));
      // everything but the provisional tail line is identical
      expect(full.slice(0, part.length - 1)).toEqual(part.slice(0, -1));
      expect(part[part.length - 1]).toBe(`lineTo(${pts[n - 1].x},${pts[n - 1].y})`);
    }
  });

  it('starts at the first point and ends at the last', () => {
    const pts = smoothInk(loop(150, 60));
    const ops = record(pts);
    expect(ops[0]).toBe(`moveTo(${pts[0].x},${pts[0].y})`);
    const last = pts[pts.length - 1];
    expect(ops[ops.length - 1]).toBe(`lineTo(${last.x},${last.y})`);
  });
});
