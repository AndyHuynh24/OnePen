// ─────────────────────────────────────────────────────────────────────────────
// Media insertion — images now, PDF in the next slice. Ported from
// handleMediaInsert / createMediaGroup in app/main.js.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import type { BBox, Stroke } from '$types/geometry';
import { CONFIG } from '$config/constants';
import { note } from '$stores/note.svelte';
import { viewport } from '$stores/viewport.svelte';
import { history } from '$stores/history.svelte';
import { selection } from '$stores/selection.svelte';
import { markDirty } from '$persistence/autosave';

function cornerStroke(b: BBox): Stroke {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

/** Open a file picker and insert the chosen image / PDF.
 *  `kind` narrows the accepted types: 'image' (pictures only), 'file' (PDF), or
 *  'any' (both — the default, used by the generic media button). */
export function handleMediaInsert(kind: 'image' | 'file' | 'any' = 'any'): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept =
    kind === 'image' ? 'image/*' : kind === 'file' ? 'application/pdf' : 'image/*,application/pdf';
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) {
      if (file.type === 'application/pdf') {
        // PDF support lands in the next slice
        void import('./pdf').then((m) => m.insertPdf(file)).catch((err) => {
          console.error('[media] pdf insert failed:', err);
        });
      } else {
        const reader = new FileReader();
        reader.onload = () => createImageGroup(reader.result as string);
        reader.readAsDataURL(file);
      }
    }
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

/** Create an image media group centered in the viewport and select it. */
export function createImageGroup(dataUrl: string): void {
  const probe = new Image();
  probe.onload = () => {
    const ow = probe.naturalWidth || 1;
    const oh = probe.naturalHeight || 1;
    const ar = ow / oh;

    const maxW = Math.min(
      CONFIG.MEDIA.DEFAULT_INSERT_WIDTH,
      viewport.screenW / viewport.scale - 80,
    );
    const w = Math.max(CONFIG.MEDIA.MIN_SIZE, Math.min(ow, maxW));
    const h = w / ar;

    // top-left of the current viewport (left/top aligned)
    const bbox: BBox = { x: viewport.offset.x + 20, y: viewport.offset.y + 20, w, h };

    const g: Group = {
      id: note.nextId(),
      type: 'media',
      mediaType: 'image',
      dataUrl,
      originalWidth: ow,
      originalHeight: oh,
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
    history.capture();
    note.addGroup(g);
    selection.select(g.id);
    markDirty();
  };
  probe.src = dataUrl;
}
