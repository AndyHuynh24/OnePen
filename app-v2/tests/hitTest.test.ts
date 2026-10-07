import { describe, expect, it } from 'vitest';
import {
  getBoundingBox,
  intersectBBox,
  isInside,
  isSBoxInLBox,
  pointInPolygon,
  segmentsIntersect,
  strokesIntersect,
} from '$canvas/hitTest';

describe('getBoundingBox', () => {
  it('computes min/max bounds', () => {
    const bb = getBoundingBox([
      { x: 10, y: 20 },
      { x: 30, y: 5 },
      { x: 15, y: 40 },
    ]);
    expect(bb).toEqual({ x: 10, y: 5, w: 20, h: 35 });
  });
  it('returns zero box for empty stroke', () => {
    expect(getBoundingBox([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe('intersectBBox', () => {
  it('detects overlap', () => {
    expect(intersectBBox({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });
  it('detects separation', () => {
    expect(intersectBBox({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 5, h: 5 })).toBe(false);
  });
});

describe('isSBoxInLBox', () => {
  it('true when small box fully inside large', () => {
    expect(isSBoxInLBox({ x: 2, y: 2, w: 4, h: 4 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
  });
  it('false when small box pokes out', () => {
    expect(isSBoxInLBox({ x: 8, y: 8, w: 4, h: 4 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('segmentsIntersect', () => {
  it('detects crossing segments', () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }),
    ).toBe(true);
  });
  it('parallel segments do not intersect', () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }),
    ).toBe(false);
  });
});

describe('strokesIntersect', () => {
  it('counts crossings between two strokes', () => {
    const a = [
      { x: 0, y: 5 },
      { x: 10, y: 5 },
    ];
    const b = [
      { x: 5, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(strokesIntersect(a, b)).toBe(1);
  });
});

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  it('point inside', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });
  it('point outside', () => {
    expect(pointInPolygon(15, 5, square)).toBe(false);
  });
});

describe('isInside', () => {
  const box = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  it('true when every stroke point is within the polygon', () => {
    const inner = [
      { x: 20, y: 20 },
      { x: 40, y: 40 },
      { x: 60, y: 30 },
    ];
    expect(isInside(inner, box)).toBe(true);
  });
  it('false when a point escapes the polygon', () => {
    const partly = [
      { x: 20, y: 20 },
      { x: 200, y: 40 },
    ];
    expect(isInside(partly, box)).toBe(false);
  });
  it('false for a degenerate modifier polygon', () => {
    expect(isInside([{ x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });
});
