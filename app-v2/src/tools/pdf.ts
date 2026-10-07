// ─────────────────────────────────────────────────────────────────────────────
// PDF insertion — renders each page to a crisp image and drops them as a
// vertical stack of media groups. Ported from processPdfFile /
// renderPdfPageHiDPI / createMediaGroupsVertical in app/main.js.
// ─────────────────────────────────────────────────────────────────────────────

import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Group } from '$types/group';
import type { BBox, Stroke } from '$types/geometry';
import { CONFIG } from '$config/constants';
import { note } from '$stores/note.svelte';
import { viewport } from '$stores/viewport.svelte';
import { history } from '$stores/history.svelte';
import { selection } from '$stores/selection.svelte';
import { markDirty } from '$persistence/autosave';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const PAGE_GAP = 30;
const QUALITY = 2; // supersampling factor for crispness

function cornerStroke(b: BBox): Stroke {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

async function renderPage(
  page: pdfjs.PDFPageProxy,
  targetWidth: number,
): Promise<{ dataUrl: string; pdfW: number; pdfH: number }> {
  const base = page.getViewport({ scale: 1 });
  const pdfW = base.width;
  const pdfH = base.height;
  const dpr = window.devicePixelRatio || 1;
  const renderScale = (targetWidth * dpr * QUALITY) / pdfW;
  const vp = page.getViewport({ scale: renderScale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;

  return { dataUrl: canvas.toDataURL('image/png'), pdfW, pdfH };
}

/** Load a PDF file and insert every page as a stacked media group. */
export async function insertPdf(file: File): Promise<void> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const total = pdf.numPages;

  const displayW = Math.min(
    CONFIG.MEDIA.DEFAULT_INSERT_WIDTH,
    viewport.screenW / viewport.scale - 80,
  );
  // place at the top-left of the current viewport, flowing downward
  const leftX = viewport.offset.x + 20;
  let y = viewport.offset.y + 20;
  const pdfGroupId = `pdf_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  history.capture();
  const created: Group[] = [];
  for (let p = 1; p <= total; p++) {
    const page = await pdf.getPage(p);
    const { dataUrl, pdfW, pdfH } = await renderPage(page, displayW);
    const h = displayW * (pdfH / pdfW);
    const bbox: BBox = { x: leftX, y, w: displayW, h };
    const g: Group = {
      id: note.nextId(),
      type: 'media',
      mediaType: 'pdf',
      dataUrl,
      originalWidth: pdfW,
      originalHeight: pdfH,
      pdfPage: p,
      pdfTotalPages: total,
      pdfGroupId,
      bbox,
      rotation: 0,
      opacity: 1,
      aspectLocked: true,
      zIndex: 0,
      visibility: true,
      stroke: cornerStroke(bbox),
      size: 1,
      color: '',
    };
    note.addGroup(g);
    created.push(g);
    y += h + PAGE_GAP;
  }
  markDirty();
  if (created.length > 0) selection.select(created[0].id);
}
