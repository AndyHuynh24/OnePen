// ─────────────────────────────────────────────────────────────────────────────
// Hit-testing primitives: bbox math, ray-cast point-in-polygon, distance.
// ─────────────────────────────────────────────────────────────────────────────

import type { BBox, Point, Stroke } from '$types/geometry';

/** Axis-aligned bounding box of a stroke. */
export function getBoundingBox(stroke: Stroke): BBox {
  if (stroke.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let xMin = stroke[0].x;
  let xMax = stroke[0].x;
  let yMin = stroke[0].y;
  let yMax = stroke[0].y;
  for (let i = 1; i < stroke.length; i++) {
    const p = stroke[i];
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  return { x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin };
}

/** Standard AABB-intersection test. */
export function intersectBBox(a: BBox, b: BBox): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/** Squared Euclidean distance — avoids the sqrt for hot-path comparisons. */
export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(distSq(ax, ay, bx, by));
}

/**
 * Ray-cast point-in-polygon. Treats `polygon` as a closed loop. Used to test
 * whether a stroke's centroid is inside a hand-drawn box / curly / bracket.
 */
export function pointInPolygon(px: number, py: number, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** True if the point (x,y) is inside or on the bbox. */
export function pointInBBox(x: number, y: number, b: BBox): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/** True if point p is within box b (object form, matches isPointInBox). */
export function isPointInBox(p: Point, b: BBox): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

/** True if the small box is fully contained in the large box. */
export function isSBoxInLBox(s: BBox, l: BBox): boolean {
  return (
    s.x >= l.x &&
    s.x + s.w <= l.x + l.w &&
    s.y >= l.y &&
    s.y + s.h <= l.y + l.h
  );
}

/** Segment-segment intersection test (ported from doLinesIntersect). */
export function segmentsIntersect(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): boolean {
  const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
  if (det === 0) return false; // parallel
  const lambda =
    ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
  const gamma =
    ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;
  return lambda > 0 && lambda < 1 && gamma > 0 && gamma < 1;
}

/** Count how many segment pairs between two strokes intersect. */
export function strokesIntersect(a: Point[], b: Point[]): number {
  let count = 0;
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) count++;
    }
  }
  return count;
}

/**
 * True if every point of `stroke` lies inside the closed `modifier` polygon.
 * Includes a quick bbox-rejection (ported from isInside).
 */
export function isInside(stroke: Point[], modifier: Point[]): boolean {
  if (!stroke || stroke.length === 0 || !modifier || modifier.length < 3) {
    return false;
  }
  const m = getBoundingBox(modifier);
  const s = getBoundingBox(stroke);
  if (
    s.x + s.w < m.x ||
    s.x > m.x + m.w ||
    s.y + s.h < m.y ||
    s.y > m.y + m.h
  ) {
    return false;
  }
  return stroke.every((p) => pointInPolygon(p.x, p.y, modifier));
}
