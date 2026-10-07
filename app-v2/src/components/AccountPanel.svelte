<script lang="ts">
  // Account + cloud sync — an avatar/sign-in button (top-right) that opens a
  // panel for Google sign-in, manual backup, and restore to/from Google Drive.
  import { auth } from '$stores/auth.svelte';
  import { modal } from '$stores/prompt.svelte';
  import { signIn, signOut, syncToDrive, restoreFromDriveFlow } from '$auth/index';

  let open = $state(false);

  const status = $derived.by(() => {
    switch (auth.syncStatus) {
      case 'syncing':
        return { icon: 'bx-sync bx-spin', text: 'Syncing…', cls: 'busy' };
      case 'synced':
        return { icon: 'bx-check-circle', text: auth.syncMessage || 'Synced', cls: 'ok' };
      case 'error':
        return { icon: 'bx-error-circle', text: auth.syncMessage || 'Sync failed', cls: 'err' };
      case 'offline':
        return { icon: 'bx-wifi-off', text: 'Offline', cls: 'warn' };
      default:
        return null;
    }
  });

  async function restore() {
    const ok = await modal.confirm({
      title: 'Restore from cloud?',
      body: 'This replaces all local notebooks with your Google Drive backup.',
      confirmText: 'Restore',
      danger: true,
    });
    if (!ok) return;
    const done = await restoreFromDriveFlow();
    if (done) window.location.reload();
  }

  async function doSignOut() {
    await signOut();
    open = false;
  }
</script>

<button class="avatar-btn" onclick={() => (open = !open)} aria-label="Account" title="Account & sync">
  {#if auth.user?.photoURL}
    <img src={auth.user.photoURL} alt="" referrerpolicy="no-referrer" />
  {:else}
    <i class="bx {auth.user ? 'bx-user' : 'bx-cloud'}"></i>
  {/if}
  {#if status}<span class="dot {status.cls}"></span>{/if}
</button>

{#if open}
  <div class="backdrop" onclick={() => (open = false)} role="presentation"></div>
  <div class="panel" role="dialog" aria-label="Account">
    {#if auth.user}
      <div class="me">
        {#if auth.user.photoURL}
          <img src={auth.user.photoURL} alt="" referrerpolicy="no-referrer" />
        {:else}
          <div class="ph"><i class="bx bx-user"></i></div>
        {/if}
        <div class="who">
          <strong>{auth.user.displayName || 'User'}</strong>
          <span>{auth.user.email}</span>
        </div>
      </div>

      {#if status}
        <div class="status {status.cls}"><i class="bx {status.icon}"></i> {status.text}</div>
      {/if}

      <div class="actions">
        <button class="act" onclick={syncToDrive} disabled={auth.syncStatus === 'syncing'}>
          <i class="bx bx-cloud-upload"></i> Back up to Drive
        </button>
        <button class="act" onclick={restore} disabled={auth.syncStatus === 'syncing'}>
          <i class="bx bx-cloud-download"></i> Restore from Drive
        </button>
      </div>

      <button class="out" onclick={doSignOut}><i class="bx bx-log-out"></i> Sign out</button>
    {:else}
      <div class="signin">
        <i class="bx bxl-google"></i>
        <p>Sign in to back up your notebooks to Google Drive.</p>
        <button class="google" onclick={signIn}><i class="bx bxl-google"></i> Sign in with Google</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .avatar-btn {
    position: fixed; top: 16px; right: 16px; z-index: 60;
    width: 40px; height: 40px; border-radius: 50%;
    display: grid; place-items: center;
    background: var(--surface-panel); border: 1px solid var(--border);
    box-shadow: var(--shadow-md); color: var(--surface-fg);
    font-size: 1.2rem; overflow: visible;
  }
  .avatar-btn:hover { color: var(--surface-fg); }
  .avatar-btn img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .dot {
    position: absolute; bottom: -1px; right: -1px;
    width: 11px; height: 11px; border-radius: 50%;
    border: 2px solid var(--surface-bg);
  }
  .dot.busy { background: var(--accent); }
  .dot.ok { background: #2f9e6a; }
  .dot.err { background: #e5484d; }
  .dot.warn { background: #f5a623; }

  .backdrop { position: fixed; inset: 0; z-index: 119; }
  .panel {
    position: fixed; top: 64px; right: 16px; z-index: 120;
    width: 280px;
    background: var(--surface-panel); border: 1px solid var(--border);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
    padding: 14px; font-family: var(--font-ui);
    animation: pop var(--dur-fast) var(--ease-out);
  }
  @keyframes pop { from { opacity: 0; transform: translateY(-6px); } }

  .me { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .me img, .ph { width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0; }
  .ph { display: grid; place-items: center; background: var(--surface-raised); color: var(--surface-fg-muted); }
  .who { display: flex; flex-direction: column; min-width: 0; }
  .who strong { font-size: 0.92rem; color: var(--surface-fg); }
  .who span { font-size: 0.76rem; color: var(--surface-fg-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .status {
    display: flex; align-items: center; gap: 7px;
    padding: 7px 10px; margin-bottom: 10px; border-radius: var(--radius-md);
    font-size: 0.8rem; background: var(--surface-raised);
  }
  .status.ok { color: #2f9e6a; }
  .status.err { color: #e5484d; }
  .status.warn { color: #f5a623; }
  .status.busy { color: var(--accent); }

  .actions { display: flex; flex-direction: column; gap: 6px; }
  .act {
    display: flex; align-items: center; gap: 9px;
    padding: 10px; border-radius: var(--radius-md);
    color: var(--surface-fg); text-align: left; font-size: 0.86rem;
  }
  .act:hover:not(:disabled) { background: var(--surface-raised); }
  .act:disabled { opacity: 0.5; }
  .act i { font-size: 1.1rem; color: var(--surface-fg-muted); }

  .out {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; margin-top: 10px; padding: 9px; border-radius: var(--radius-md);
    color: var(--danger); border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent);
    font-size: 0.85rem;
  }
  .out:hover { background: color-mix(in oklab, var(--danger) 14%, transparent); }

  .signin { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 10px 6px; text-align: center; }
  .signin > i { font-size: 2.2rem; color: var(--surface-fg-subtle); }
  .signin p { margin: 0; font-size: 0.85rem; color: var(--surface-fg-muted); line-height: 1.5; }
  .google {
    display: flex; align-items: center; justify-content: center; gap: 9px;
    width: 100%; padding: 11px; border-radius: var(--radius-md);
    background: var(--accent); color: var(--accent-fg); font-weight: 500; font-size: 0.88rem;
  }
  .google:hover { background: color-mix(in oklab, var(--accent) 92%, white); }
</style>
