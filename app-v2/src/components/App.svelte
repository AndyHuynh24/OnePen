<script lang="ts">
  import { onMount } from 'svelte';
  import { theme } from '$stores/theme.svelte';
  import { initPersistence } from '$persistence/init';
  import { loadModel } from '$modifiers/predict';
  import CanvasView from './CanvasView.svelte';
  import MiniToolbar from './MiniToolbar.svelte';
  import NoteShelf from './NoteShelf.svelte';
  import NavToggle from './NavToggle.svelte';
  import ModalHost from './ModalHost.svelte';
  import SaveIndicator from './SaveIndicator.svelte';
  import RadialToolbox from './RadialToolbox.svelte';
  import Toast from './Toast.svelte';
  import ZoomIndicator from './ZoomIndicator.svelte';
  import Scrollbar from './Scrollbar.svelte';
  import TextEditor from './TextEditor.svelte';
  import MediaEditPopup from './MediaEditPopup.svelte';
  import StickyEditor from './StickyEditor.svelte';
  import LinkEditor from './LinkEditor.svelte';
  import EmbedFrame from './EmbedFrame.svelte';
  import ReminderPicker from './ReminderPicker.svelte';
  import ReminderPanel from './ReminderPanel.svelte';
  import TocPanel from './TocPanel.svelte';
  import FlashcardReview from './FlashcardReview.svelte';
  import AccountPanel from './AccountPanel.svelte';
  import MathVerifyPopup from './MathVerifyPopup.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import CropOverlay from './CropOverlay.svelte';
  import ColorPickerOverlay from './ColorPickerOverlay.svelte';
  import PerfHud from './PerfHud.svelte';
  import { initAuth } from '$auth/index';
  import { gestureFeedback } from '$ml/feedback';

  // Diagnostic HUD only on request (append ?perf to the URL). It runs a frame loop
  // forever and posts metrics every second while writing — never ship that by default.
  const showPerf =
    typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf');

  onMount(async () => {
    document.documentElement.dataset.theme = theme.current;
    // Firebase auth state → store (sign-in/out reflected in the account panel).
    try {
      initAuth();
      gestureFeedback.init();
    } catch (err) {
      console.warn('[init] auth init skipped:', err);
    }
    // Load the AI model in the background — drawing works before it's ready
    // (gestures simply fall back to plain strokes until it loads).
    void loadModel().catch(() => {});
    const report = await initPersistence();
    if (report.migrationRan) {
      console.log(
        `[init] imported ${report.migratedNotes} notes + ${report.migratedSettings} settings from legacy DB`,
      );
    }
    console.log(
      `[init] ${report.folderCount} notebooks` +
        (report.restoredPath ? ` · restored ${report.restoredPath}` : ''),
    );
  });
</script>

<main class="app">
  <CanvasView />
  <Scrollbar />
  <NoteShelf />
  <NavToggle />
  <MiniToolbar />
  <ZoomIndicator />
  <SaveIndicator />
  <RadialToolbox />
  <TextEditor />
  <MediaEditPopup />
  <StickyEditor />
  <LinkEditor />
  <EmbedFrame />
  <ReminderPicker />
  <ReminderPanel />
  <TocPanel />
  <FlashcardReview />
  <AccountPanel />
  <MathVerifyPopup />
  <SettingsPanel />
  <CropOverlay />
  <ColorPickerOverlay />
  {#if showPerf}<PerfHud />{/if}
  <Toast />
  <ModalHost />
</main>

<style>
  .app {
    position: fixed;
    inset: 0;
    background: var(--surface-bg);
    color: var(--surface-fg);
  }
</style>
