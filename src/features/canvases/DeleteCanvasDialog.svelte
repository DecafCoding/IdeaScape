<!--
  The canvas delete confirm. Design-system §15.1 lists this state as undrawn, so it is designed
  here in the same shell as the New project dialog, at 340 px, and flagged in the PR body for a
  later `dev-ui-update` run to fold into §9 and §15.

  The confirm is a warning, not the remedy: `undo-model` says every user action records how to
  undo itself, so the body says Ctrl+Z brings the canvas back and the delete really is undoable.
-->
<script lang="ts">
  import { SHORTCUT_LABELS } from '../../lib/shortcuts';

  interface Props {
    name: string;
    cardCount: number;
    onConfirm?: () => void;
    onCancel?: () => void;
  }

  const { name, cardCount, onConfirm, onCancel }: Props = $props();

  let confirmButton = $state<HTMLButtonElement | null>(null);

  // The destructive button takes focus on mount, so Enter confirms and Esc cancels.
  $effect(() => {
    confirmButton?.focus();
  });

  const cards = $derived(`${cardCount} ${cardCount === 1 ? 'card' : 'cards'}`);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onCancel?.();
  }
</script>

<div
  class="scrim"
  role="presentation"
  onclick={() => onCancel?.()}
  onkeydown={onKeyDown}
  data-testid="delete-canvas-scrim"
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-label="Delete Canvas?"
    tabindex="-1"
    data-testid="delete-canvas-dialog"
    onclick={(event) => event.stopPropagation()}
  >
    <h3>Delete Canvas?</h3>
    <p class="body">
      {name} and the {cards} on it will be removed. {SHORTCUT_LABELS.undo} brings it back.
    </p>
    <div class="buttons">
      <button type="button" class="ghost" onclick={() => onCancel?.()}>Cancel</button>
      <button
        bind:this={confirmButton}
        type="button"
        class="destructive"
        onclick={() => onConfirm?.()}
      >
        Delete Canvas
      </button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    display: grid;
    place-items: center;
    background: var(--scrim);
  }

  .panel {
    width: 340px;
    box-sizing: border-box;
    padding: 18px 20px var(--space-16);
    background: var(--color-surface);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-dialog);
    color: var(--color-text);
  }

  h3 {
    margin: 0 0 var(--space-10);
    font-size: var(--text-22);
    font-weight: 600;
    letter-spacing: var(--tracking-tight-2);
  }

  .body {
    margin: 0 0 var(--space-16);
    font-size: var(--text-12-5);
    line-height: 1.6;
    opacity: 0.8;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-10);
  }

  .buttons button {
    padding: 5px var(--space-12);
    border-radius: var(--radius-lg);
    font: inherit;
    font-size: var(--text-12);
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--color-divider);
    color: var(--color-text);
  }

  .ghost:hover {
    background: var(--tint-neutral-hover);
  }

  /* The second accent is destructive-only (§4.3). */
  .destructive {
    background: var(--color-accent-2);
    border: 1px solid var(--color-accent-2);
    color: var(--color-bg);
  }

  .destructive:hover {
    background: var(--color-accent-2-700);
    border-color: var(--color-accent-2-700);
  }
</style>
