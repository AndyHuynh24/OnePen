// ─────────────────────────────────────────────────────────────────────────────
// Note export — render the note's content to an offscreen canvas (tight to the
// content bounds) and save it as a PNG image or a PDF (continuous single page,
// or paginated A4). Reuses the same renderers the live canvas uses.
// ─────────────────────────────────────────────────────────────────────────────

import { note } from '$stores/note.svelte';
import { grid } from '$stores/grid.svelte';
import { getBoundingBox } from '$canvas/hitTest';
import { drawStroke } from '$canvas/render/stroke';
import { drawHighlight } from '$canvas/render/highlight';
import { drawTextGroup } from '$canvas/render/text';
import { drawMediaGroup } from '$canvas/render/media';
import { drawTapeGroup } from '$canvas/render/tape';
import { drawLinkHint } from '$canvas/render/link';
import { drawStickyHint } from '$canvas/render/sticky';
import { drawGrid } from '$canvas/render/grid';
import { getMediaImage } from '$canvas/media/cache';
import type { Group } from '$types/group';
import type { BBox } from '$types/geometry';

export interface ExportOptions {
  includeGrid?: boolean;
  background?: string; // CSS color; default = current theme's canvas background
}

const PAD = 40;
// Content always renders at 1:1 (never zoomed up) — a few small strokes export
// at real size on a larger sheet, padded with background. A minimum sheet size
// keeps a sparse note from becoming a postage stamp.
const MIN_W = 800;
const MIN_H = 1000;

/** Content bounding box of all visible groups (null if empty). */
function contentBounds(groups: Group[]): BBox | null {
  const pts: { x: number; y: number }[] = [];
  for (const g of groups) {
    if (g.visibility === false || !g.bbox) continue;
    pts.push({ x: g.bbox.x, y: g.bbox.y }, { x: g.bbox.x + g.bbox.w, y: g.bbox.y + g.bbox.h });
  }
  if (pts.length === 0) return null;
  return getBoundingBox(pts);
}

/** Render every visible group onto `ctx` (already translated to content origin). */
async function renderGroups(ctx: CanvasRenderingContext2D, groups: Group[]): Promise<void> {
  const scale = 1;
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b7493';
  // pass 1 — text + media behind ink
  for (const g of groups) {
    if (g.visibility === false) continue;
    if (g.type === 'text' || g.type === 'math_result') drawTextGroup(ctx, g);
    else if (g.type === 'media') {
      const img = await loadMedia(g);
      if (img) drawMediaGroup(ctx, g, img);
    }
  }
  // pass 2 — highlights
  for (const g of groups) {
    if (g.visibility === false || g.type !== 'highlight') continue;
    drawHighlight(ctx, g.bbox, g.color);
  }
  // pass 3 — strokes + plain content
  for (const g of groups) {
    if (g.visibility === false) continue;
    if (
      g.type === 'highlight' || g.type === 'text' || g.type === 'math_result' ||
      g.type === 'media' || g.type === 'stickynote' || g.type === 'link' || g.type === 'tape'
    )
      continue;
    if (g.stroke) drawStroke(ctx, g.stroke, { color: g.color, size: g.size });
  }
  // pass 4 — tape covers + link/sticky hints
  for (const g of groups) {
    if (g.visibility === false) continue;
    if (g.type === 'tape') drawTapeGroup(ctx, g, scale);
    else if (g.type === 'link') drawLinkHint(ctx, g, scale, accent);
    else if (g.type === 'stickynote') drawStickyHint(ctx, g, scale);
  }
}

/** Ensure a media image is loaded before drawing (export can't wait for rAF). */
function loadMedia(g: Group): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = getMediaImage(g, () => resolve(getMediaImage(g, () => {})));
    if (img && img.complete) resolve(img);
    else if (!img) resolve(null);
  });
}

/** Fill an already-transformed ctx region with the (themed/custom) background +
 *  optional grid. `region` is in world coords. */
function paintBackground(
  ctx: CanvasRenderingContext2D,
  region: BBox,
  withGrid: boolean,
  bgOverride?: string,
): void {
  ctx.save();
  ctx.fillStyle = bgOverride ?? grid.resolvedBg;
  ctx.fillRect(region.x, region.y, region.w, region.h);
  if (withGrid) drawGrid(ctx, region, grid.size, grid.resolvedLine, grid.style);
  ctx.restore();
}

/** Render the whole note to an offscreen canvas (HiDPI), tight to content + pad,
 *  with a minimum sheet size so a sparse note doesn't render huge. */
async function renderToCanvas(opts: ExportOptions): Promise<HTMLCanvasElement | null> {
  const groups = note.groups;
  const b = contentBounds(groups);
  if (!b) return null;

  // sheet = content + padding, but never below a sensible minimum (sparse pages
  // get centered on a larger sheet rather than being zoomed up)
  const contentW = b.w + PAD * 2;
  const contentH = b.h + PAD * 2;
  const w = Math.max(contentW, MIN_W);
  const h = Math.max(contentH, MIN_H);
  // extra room added by the minimum, split evenly so content is centered
  const ox = (w - contentW) / 2;
  const oy = (h - contentH) / 2;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // world-space region the sheet covers (so the grid tiles across the whole page)
  const region: BBox = { x: b.x - PAD - ox, y: b.y - PAD - oy, w, h };

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(-region.x, -region.y); // world → sheet pixels (always 1:1)
  paintBackground(ctx, region, !!opts.includeGrid, opts.background);

  await renderGroups(ctx, groups);
  return canvas;
}

function noteName(): string {
  const p = note.path ?? 'note';
  return (p.split('/').pop() ?? 'note').replace(/\.json$/, '');
}

function triggerDownload(blobUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Export the current note as a PNG image. */
export async function exportPng(opts: ExportOptions = {}): Promise<boolean> {
  const canvas = await renderToCanvas(opts);
  if (!canvas) return false;
  const url = canvas.toDataURL('image/png');
  triggerDownload(url, `${noteName()}.png`);
  return true;
}

/** Export the current note as a PDF. mode 'continuous' = one tall page sized to
 *  the content; 'a4' = paginated A4 portrait. */
export async function exportPdf(
  mode: 'continuous' | 'a4' = 'continuous',
  opts: ExportOptions = {},
): Promise<boolean> {
  const { jsPDF } = await import('jspdf');
  const name = noteName();

  if (mode === 'continuous') {
    const canvas = await renderToCanvas(opts);
    if (!canvas) return false;
    const img = canvas.toDataURL('image/jpeg', 0.92);
    const doc = new jsPDF({
      orientation: canvas.width >= canvas.height ? 'l' : 'p',
      unit: 'px',
      format: [canvas.width, canvas.height],
    });
    doc.addImage(img, 'JPEG', 0, 0, canvas.width, canvas.height);
    doc.save(`${name}.pdf`);
    return true;
  }

  return exportA4(name, opts);
}

/** A4 paginated: each page is rendered as its own A4-proportioned canvas so the
 *  background + grid fill the WHOLE sheet (including empty space on the last
 *  page), and content flows top-to-bottom across pages. */
async function exportA4(name: string, opts: ExportOptions): Promise<boolean> {
  const groups = note.groups;
  const b = contentBounds(groups);
  if (!b) return false;

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageWmm = doc.internal.pageSize.getWidth();
  const pageHmm = doc.internal.pageSize.getHeight();
  const a4Ratio = pageHmm / pageWmm;

  // content fits to the page width; height per page in world units
  const contentW = b.w + PAD * 2;
  // never upscale: a narrow note keeps its size, the sheet is just wider
  const sheetW = Math.max(contentW, MIN_W);
  const sheetHPerPage = sheetW * a4Ratio; // world height that maps to one A4 page
  const ox = (sheetW - contentW) / 2;

  const totalH = b.h + PAD * 2;
  const pages = Math.max(1, Math.ceil(totalH / sheetHPerPage));

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pxW = Math.ceil(sheetW * dpr);
  const pxH = Math.ceil(sheetHPerPage * dpr);

  for (let p = 0; p < pages; p++) {
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    // world region this page covers (full-width, one page tall)
    const region: BBox = {
      x: b.x - PAD - ox,
      y: b.y - PAD + p * sheetHPerPage,
      w: sheetW,
      h: sheetHPerPage,
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(-region.x, -region.y);
    // background + grid fill the entire page (so blank areas aren't white voids)
    paintBackground(ctx, region, !!opts.includeGrid, opts.background);
    // clip to this page's region so neighbouring-page content doesn't bleed in
    ctx.save();
    ctx.beginPath();
    ctx.rect(region.x, region.y, region.w, region.h);
    ctx.clip();
    await renderGroups(ctx, groups);
    ctx.restore();

    if (p > 0) doc.addPage();
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWmm, pageHmm);
  }

  doc.save(`${name}.pdf`);
  return true;
}
