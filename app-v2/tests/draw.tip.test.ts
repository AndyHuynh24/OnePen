// The wet ink always reaches the raw pen tip (no smoothing lag), and pen-up
// commits exactly what was last on screen.

import { describe, it, expect } from 'vitest';
import { draw } from '../src/stores/draw.svelte';

describe('draw store pen tip', () => {
  it('draws to the raw pen position and commits the last wet frame unchanged', () => {
    draw.begin({ x: 0, y: 0, t: 0 }, 1);
    for (let i = 1; i <= 20; i++) draw.append({ x: i * 3, y: Math.sin(i) * 2, t: i * 8 });
    const wet = draw.live;
    const tip = wet[wet.length - 1];
    expect(tip).toEqual({ x: 60, y: Math.sin(20) * 2, t: 160 }); // exactly the pen
    expect(draw.end()).toEqual(wet);
  });

  it('a tiny jiggle below the sample spacing still moves the tip', () => {
    draw.begin({ x: 0, y: 0, t: 0 }, 1);
    draw.append({ x: 5, y: 0, t: 8 });
    draw.append({ x: 5.2, y: 0, t: 16 }); // dropped from the body (< 0.5px)…
    const wet = draw.live;
    expect(wet[wet.length - 1].x).toBe(5.2); // …but the ink still reaches it
    draw.cancel();
  });
});
