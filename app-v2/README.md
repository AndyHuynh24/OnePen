# OnePen (app-v2)

The current OnePen app: Vite, TypeScript, Svelte 5. It replaced the original
`/app` on onepen-notes.web.app on 2026-10-04.

## Commands

```bash
npm install
npm run dev -- --port 5199   # exposed on the LAN, open http://<your-ip>:5199 on a tablet
npm test                     # vitest
npm run check                # svelte-check
npm run build                # svelte-check + build into dist/
npm run preview              # serve dist/
```

Deploy by hand:

```bash
npm run build
firebase deploy --only hosting --project onepen-notes --config firebase.json
```

The math tool talks to `math-server/` on port 8000 of the same host, or to
`VITE_MATH_API_URL` if set (see `.env.example`). Add `?perf` to the URL to show
the perf overlay.

## Where things are

```
src/config/       constants, tool registry, default toolbox layouts, stroke labels
src/types/        Group / Stroke / Note types
src/stores/       app state (*.svelte.ts): note, undo history, viewport, tools, ui …
src/canvas/       drawing engine (background / ink / live layers) and renderers
src/input/        pointer, touch, wheel, palm rejection
src/modifiers/    gesture classification; the TF.js model runs in predict.worker.ts
src/tools/        what each toolbox tool does, text, image/PDF insert, math client
src/lib/          TOC, flashcards, reminders, export, navigation, small helpers
src/ml/           local log of gesture predictions and what happened after them
src/persistence/  IndexedDB (Dexie), autosave, settings, import from v1
src/auth/         Google sign-in, Drive backup/restore
src/components/   UI
```

`collectData.html` / `src/feedback/` is a placeholder for a data collection page.

## Data from v1

On first launch the app copies notes and settings from v1's IndexedDB
(`dsh-note-db`) into `onepen-db`. It only reads the old database, and it only
runs once (`legacy_migration_done` in settings).
