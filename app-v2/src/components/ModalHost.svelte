<script lang="ts">
  import { modal } from '$stores/prompt.svelte';

  let inputEl: HTMLInputElement | undefined = $state();
  let value = $state('');

  // When a new modal appears, seed the input and focus it.
  $effect(() => {
    const a = modal.active;
    if (a?.kind === 'text') {
      value = a.defaultValue ?? '';
      // Focus on next microtask so the element is mounted.
      queueMicrotask(() => inputEl?.focus());
      queueMicrotask(() => inputEl?.select());
    }
  });

  function submit(e?: Event) {
    e?.preventDefault();
    const a = modal.active;
    if (!a) return;
    if (a.kind === 'text') {
      const v = value.trim();
      modal.resolve(v.length === 0 ? null : v);
    } else {
      modal.resolve(true);
    }
  }

  function cancel() {
    const a = modal.active;
    if (!a) return;
    modal.resolve(a.kind === 'text' ? null : false);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') cancel();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if modal.active}
  {@const a = modal.active}
  <div
    class="backdrop"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) cancel();
    }}
  >
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <h2 id="modal-title">{a.title}</h2>

      {#if a.kind === 'text'}
        <form onsubmit={submit}>
          {#if a.label}<label for="modal-input">{a.label}</label>{/if}
          <input
            id="modal-input"
            bind:this={inputEl}
            bind:value
            placeholder={a.placeholder ?? ''}
            autocomplete="off"
            spellcheck="false"
          />
          <div class="actions">
            <button type="button" class="ghost" onclick={cancel}>
              {a.cancelText ?? 'Cancel'}
            </button>
            <button type="submit" class="primary">
              {a.confirmText ?? 'Create'}
            </button>
          </div>
        </form>
      {:else}
        {#if a.body}<p>{a.body}</p>{/if}
        <div class="actions">
          <button class="ghost" onclick={cancel}>
            {a.cancelText ?? 'Cancel'}
          </button>
          <button
            class={a.danger ? 'danger' : 'primary'}
            onclick={() => modal.resolve(true)}
          >
            {a.confirmText ?? 'Confirm'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in oklab, var(--surface-sunken) 50%, transparent);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: grid;
    place-items: center;
    z-index: 200;
    padding: 24px;
    animation: fade var(--dur-base) var(--ease-out);
    font-family: var(--font-ui);
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .dialog {
    width: 100%;
    max-width: 380px;
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: 20px;
    color: var(--surface-fg);
    transform: translateY(8px);
    animation: rise var(--dur-base) var(--ease-out) forwards;
  }

  @keyframes rise {
    to {
      transform: translateY(0);
    }
  }

  h2 {
    margin: 0 0 12px;
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  p {
    margin: 0 0 16px;
    color: var(--surface-fg-muted);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  label {
    display: block;
    margin-bottom: 6px;
    color: var(--surface-fg-muted);
    font-size: 0.78rem;
    font-weight: 500;
  }

  input {
    display: block;
    width: 100%;
    padding: 10px 12px;
    background: var(--surface-sunken);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    color: var(--surface-fg);
    font-size: 0.95rem;
    transition: border-color var(--dur-fast) var(--ease-out);
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
  }

  .actions button {
    padding: 8px 16px;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    transition:
      background var(--dur-fast) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
  }

  .actions button:hover {
    transform: translateY(-1px);
  }

  .ghost {
    color: var(--surface-fg-muted);
  }
  .ghost:hover {
    background: var(--surface-raised);
    color: var(--surface-fg);
  }

  .primary {
    background: var(--accent);
    color: var(--accent-fg);
  }
  .primary:hover {
    background: color-mix(in oklab, var(--accent) 92%, white);
  }

  .danger {
    background: var(--danger);
    color: var(--accent-fg);
  }
  .danger:hover {
    background: color-mix(in oklab, var(--danger) 92%, white);
  }
</style>
