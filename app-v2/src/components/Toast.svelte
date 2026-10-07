<script lang="ts">
  import { toast } from '$stores/toast.svelte';
</script>

<div class="toast-stack">
  {#each toast.list as t (t.id)}
    <div class="toast">
      <i class="bx {t.icon}"></i>
      <span>{t.text}</span>
    </div>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    bottom: 56px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    z-index: 220;
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border-radius: var(--radius-pill);
    background: color-mix(in oklab, var(--surface-panel) 94%, transparent);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-md);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--surface-fg);
    font-family: var(--font-ui);
    font-size: 0.84rem;
    font-weight: 500;
    animation: toastIn var(--dur-base) var(--ease-out);
  }
  .toast i {
    font-size: 1rem;
    color: var(--accent);
  }
  @keyframes toastIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
