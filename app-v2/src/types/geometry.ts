// ─────────────────────────────────────────────────────────────────────────────
// Geometry primitives — points, strokes, bounding boxes.
// World coordinates (the infinite canvas), not screen pixels.
// ─────────────────────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
  /** pressure, 0–1; optional because mouse input has none */
  p?: number;
  /** event timestamp, ms since page load; optional */
  t?: number;
}

export type Stroke = Point[];

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Viewport {
  /** world-coordinate top-left of the visible viewport */
  offset: Vec2;
  /** zoom level (1 = 100%) */
  scale: number;
  /** cached viewport bounds in world coords */
  screen: BBox;
}
