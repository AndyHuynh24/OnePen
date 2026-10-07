import { describe, expect, it } from 'vitest';
import { computeStrokeFeatures, normalizeStroke } from '$modifiers/features';

describe('computeStrokeFeatures', () => {
  it('returns 12 zeros for an empty stroke', () => {
    expect(computeStrokeFeatures([])).toEqual(new Array(12).fill(0));
  });

  it('returns 12 zeros for a single point', () => {
    expect(computeStrokeFeatures([{ x: 0, y: 0 }])).toEqual(new Array(12).fill(0));
  });

  it('filters out non-finite points', () => {
    const stroke = [
      { x: 0, y: 0 },
      { x: Number.NaN, y: 5 },
      { x: 10, y: 0 },
    ];
    const feats = computeStrokeFeatures(stroke);
    expect(feats).toHaveLength(12);
    // After filtering, numPoints (index 5) should be 2, not 3.
    expect(feats[5]).toBe(2);
  });

  it('returns 12 numeric features for a valid horizontal line', () => {
    // Underline-shaped: horizontal line of 20 points.
    const stroke = Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0 }));
    const feats = computeStrokeFeatures(stroke);
    expect(feats).toHaveLength(12);
    expect(feats.every(Number.isFinite)).toBe(true);
    expect(feats[5]).toBe(20); // numPoints
  });

  it('closure ratio is high for a closed shape', () => {
    // Approximate square (closed).
    const stroke = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 50 },
      { x: 0, y: 0.5 }, // close back near start
    ];
    const feats = computeStrokeFeatures(stroke);
    // closureRatio (index 0) should be near 1.
    expect(feats[0]).toBeGreaterThan(0.9);
  });

  it('closure ratio is low for an open path', () => {
    const stroke = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ];
    const feats = computeStrokeFeatures(stroke);
    expect(feats[0]).toBeLessThan(0.1);
  });

  it('spine verticality is high for a vertical line', () => {
    const stroke = [
      { x: 5, y: 0 },
      { x: 5, y: 100 },
    ];
    const feats = computeStrokeFeatures(stroke);
    expect(feats[10]).toBeGreaterThan(0.99);
  });

  it('spine verticality is low for a horizontal line', () => {
    const stroke = [
      { x: 0, y: 5 },
      { x: 100, y: 5 },
    ];
    const feats = computeStrokeFeatures(stroke);
    expect(feats[10]).toBeLessThan(0.01);
  });
});

describe('normalizeStroke', () => {
  it('returns [] for an empty input', () => {
    expect(normalizeStroke([])).toEqual([]);
  });

  it('maps to a [0,1] x [0,1] box', () => {
    const stroke = [
      { x: 10, y: 20 },
      { x: 30, y: 60 },
    ];
    const norm = normalizeStroke(stroke);
    expect(norm[0]).toEqual({ x: 0, y: 0, p: 0 });
    expect(norm[1]).toEqual({ x: 1, y: 1, p: 0 });
  });

  it('preserves pressure', () => {
    const stroke = [
      { x: 0, y: 0, p: 0.5 },
      { x: 10, y: 10, p: 0.9 },
    ];
    const norm = normalizeStroke(stroke);
    expect(norm[0].p).toBe(0.5);
    expect(norm[1].p).toBe(0.9);
  });
});
