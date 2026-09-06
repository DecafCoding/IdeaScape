<!--
  The left column's Canvases section (design-system §8.3, "Canvas rows"): the section label
  with its live `+`, and one row per canvas — switch on click, rename in place on double-click
  or through the row menu, delete behind a confirm.

  Every measurement here was already at its locked value in `LeftColumn.svelte` and was moved,
  not re-derived. Inline rename is listed as undrawn in design-system §15.1 and is designed
  here in the document's own language, flagged in the PR body for a later `dev-ui-update`.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { canvasStore } from '../../stores/canvasStore.svelte';

  interface Props {
    /** The canvas whose row is a text box, or null. The root owns it so Esc can clear it. */
    renamingId?: number | null;
    onSelectCanvas?: (canvasId: number) => void;
    onCreateCanvas?: () => void;
    onBeginRename?: (canvasId: number) => void;
    onCommitRename?: (canvasId: number, name: string) => void;
    onCancelRename?: () => void;
    onOpenMenu?: (event: MouseEvent, canvasId: number) => void;
  }

  const {
    renamingId = null,
    onSelectCanvas,
    onCreateCanvas,
    onBeginRename,
    onCommitRename,
    onCancelRename,
    onOpenMenu,
  }: Props = $props();

  /** The text being typed. Seeded from the row's name when the edit opens. */
  let draft = $state('');
  let input = $state<HTMLInputElement | null>(null);
  /** Guards the blur commit, so Esc and Enter do not each write once. */
  let settled = $state(false);

  $effect(() => {
    if (renamingId === null) return;
    draft = canvasStore.canvases.find((c) => c.id === renamingId)?.name ?? '';
    settled = false;
  });

  // The text is pre-selected, so typing replaces the name and an arrow key keeps it.
  $effect(() => {
    if (renamingId !== null && input) {
      input.focus();
      input.select();
    }
  });

  function commit(canvasId: number) {
    if (settled) return;
    settled = true;
    onCommitRename?.(canvasId, draft);
  }

  /**
   * The rename input is a text box inside the chrome, so `matchAction` suppresses every key
   * but Esc and the non-editing Ctrl combinations. Enter is therefore handled here, and Esc
   * must stop propagating or the global `cancel` chain also clears the selection.
   */
  function onKeyDown(event: KeyboardEvent, canvasId: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      commit(canvasId);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      settled = true;
      onCancelRename?.();
    }
  }
</script>

<p class="section-label with-action">
  Canvases
  <button
    type="button"
    class="add-canvas"
    onclick={() => onCreateCanvas?.()}
    aria-label="New Canvas"
  >
    <Icon glyph="plus" size={13} />
  </button>
</p>

<ul class="rows" data-testid="canvas-list">
  {#each canvasStore.canvases as canvas (canvas.id)}
    <li>
      {#if canvas.id === renamingId}
        <span class="canvas-row renaming">
          <Icon glyph="square-half" size={13} />
          <input
            bind:this={input}
            bind:value={draft}
            type="text"
            aria-label="Canvas Name"
            spellcheck="false"
            autocomplete="off"
            onkeydown={(event) => onKeyDown(event, canvas.id)}
            onblur={() => commit(canvas.id)}
          />
        </span>
      {:else}
        <button
          type="button"
          class="canvas-row"
          class:active={canvas.id === canvasStore.activeCanvasId}
          aria-current={canvas.id === canvasStore.activeCanvasId ? 'true' : undefined}
          onclick={() => onSelectCanvas?.(canvas.id)}
          ondblclick={() => onBeginRename?.(canvas.id)}
          oncontextmenu={(event) => onOpenMenu?.(event, canvas.id)}
        >
          <Icon glyph="square-half" size={13} />
          <span class="name">{canvas.name}</span>
        </button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .section-label {
    margin: 0;
    padding: var(--space-14) var(--space-14) 8px;
    font-size: var(--text-10);
    letter-spacing: var(--tracking-10);
    text-transform: uppercase;
    opacity: 0.45;
  }

  .section-label.with-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-12) var(--space-5);
  }

  .add-canvas {
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.5;
    cursor: pointer;
    transition: opacity var(--duration-90) var(--ease);
  }

  .add-canvas:hover {
    opacity: 1;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .canvas-row {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 8px;
    padding: var(--space-5) var(--space-12);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-12);
    text-align: left;
    opacity: 0.72;
    cursor: pointer;
    box-sizing: border-box;
    transition: background-color var(--duration-90) var(--ease);
  }

  .canvas-row .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .canvas-row:hover {
    background: var(--tint-accent-hover);
    opacity: 0.9;
  }

  .canvas-row:active {
    background: var(--tint-accent-press);
  }

  /* The active row is the pressed appearance made permanent, plus weight — so a hovered
     row can never look more selected than the selected one, and colour is not the only
     signal. */
  .canvas-row.active {
    background: var(--color-accent-tint-fill);
    color: var(--color-accent-tint-text);
    font-weight: 600;
    opacity: 1;
  }

  .canvas-row.active:hover {
    background: var(--color-accent-tint-hover);
  }

  /* Inline rename (undrawn — §15.1): the row's text becomes a box in place, at the same font
     size and padding, so nothing else on the row moves. */
  .canvas-row.renaming {
    opacity: 1;
    cursor: default;
    background: transparent;
  }

  .canvas-row.renaming input {
    flex: 1;
    min-width: 0;
    padding: 0 3px;
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-card);
    outline: 1px solid var(--color-accent);
    background: var(--color-bg);
    color: inherit;
    font: inherit;
    font-size: var(--text-12);
  }
</style>
