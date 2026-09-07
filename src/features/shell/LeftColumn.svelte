<!--
  The 168 px left column (design-system §8.3): the search box, the Canvases list, and the
  Tools, Add and History groups, with Close Project and Settings pinned to the bottom.

  The search box and the canvas list arrive as snippet props filled by `app.svelte`. This
  component is in `features/shell/` and `import-direction` forbids it importing
  `features/search/` or `features/canvases/`, so a snippet from the composition root is the
  only legal shape — the same shape the root already uses for `CanvasSurface`'s children.

  All labels are Title Case.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { canvasStore, type Tool } from '../../stores/canvasStore.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    /** The search box, filled by the root — this feature may not import `features/search/`. */
    search?: Snippet;
    /** The canvas list, filled the same way. */
    canvases?: Snippet;
    undoDepth?: number;
    redoDepth?: number;
    onNewNote?: () => void;
    onNewImage?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onCloseProject?: () => void;
    onSettings?: () => void;
    /** True while the Settings page is showing: §9.11 draws its gear as the active row. */
    settingsActive?: boolean;
  }

  const {
    search,
    canvases,
    undoDepth = 0,
    redoDepth = 0,
    onNewNote,
    onNewImage,
    onUndo,
    onRedo,
    onCloseProject,
    onSettings,
    settingsActive = false,
  }: Props = $props();

  /** Two cards is the threshold: with one there is nothing to connect (frame 14b). */
  const canConnect = $derived(canvasStore.cardCount >= 2);

  // Deleting down to one card must not leave the canvas stuck in a tool that cannot act.
  $effect(() => {
    if (!canConnect && canvasStore.activeTool === 'connect') canvasStore.activeTool = 'select';
  });

  function chooseTool(tool: Tool) {
    canvasStore.activeTool = tool;
  }
</script>

<nav class="left-column scroll-thin" data-testid="left-column" aria-label="Canvases And Tools">
  {@render search?.()}

  {@render canvases?.()}

  <p class="section-label">Tools</p>
  <ul class="rows">
    <li>
      <button
        type="button"
        class="action-row"
        class:active={canvasStore.activeTool === 'select'}
        onclick={() => chooseTool('select')}
      >
        <Icon glyph="cursor" size={13} />
        Select
      </button>
    </li>
    <li>
      <button
        type="button"
        class="action-row"
        class:active={canvasStore.activeTool === 'pan'}
        onclick={() => chooseTool('pan')}
      >
        <Icon glyph="hand" size={13} />
        Pan
      </button>
    </li>
    <li>
      <!-- Unavailable below two cards: frame 14b, "there is nothing to connect". -->
      <button
        type="button"
        class="action-row"
        class:active={canvasStore.activeTool === 'connect'}
        class:is-unavailable={!canConnect}
        disabled={!canConnect}
        onclick={() => chooseTool('connect')}
      >
        <Icon glyph="flow-arrow" size={13} />
        Connect
      </button>
    </li>
  </ul>

  <p class="section-label">Add</p>
  <ul class="rows">
    <li>
      <button type="button" class="action-row" onclick={onNewNote}>
        <Icon glyph="note" size={13} />
        Note
      </button>
    </li>
    <li>
      <button type="button" class="action-row" onclick={onNewImage}>
        <Icon glyph="image" size={13} />
        Image
      </button>
    </li>
  </ul>

  <p class="section-label">History</p>
  <ul class="rows">
    <li>
      <button
        type="button"
        class="action-row"
        class:is-unavailable={undoDepth === 0}
        disabled={undoDepth === 0}
        onclick={onUndo}
      >
        <Icon glyph="arrow-counter-clockwise" size={13} />
        Undo
        <span class="depth">{undoDepth}</span>
      </button>
    </li>
    <li>
      <button
        type="button"
        class="action-row"
        class:is-unavailable={redoDepth === 0}
        disabled={redoDepth === 0}
        onclick={onRedo}
      >
        <Icon glyph="arrow-clockwise" size={13} />
        Redo
        <span class="depth">{redoDepth}</span>
      </button>
    </li>
  </ul>

  <div class="pinned">
    <button type="button" class="action-row" onclick={onCloseProject}>
      <Icon glyph="arrow-left" size={13} />
      Close Project
    </button>
    <button
      type="button"
      class="action-row"
      class:active={settingsActive}
      onclick={onSettings}
      data-testid="settings-row"
    >
      <Icon glyph="gear" size={13} />
      Settings
    </button>
  </div>
</nav>

<style>
  .left-column {
    width: var(--size-left-column);
    flex: none;
    display: flex;
    flex-direction: column;
    padding: var(--space-10) 0 var(--space-12);
    background: var(--color-surface);
    border-right: 1px solid var(--color-divider);
    font-size: var(--text-12-5);
    overflow-y: auto;
    box-sizing: border-box;
  }

  .section-label {
    margin: 0;
    padding: var(--space-14) var(--space-14) 8px;
    font-size: var(--text-10);
    letter-spacing: var(--tracking-10);
    text-transform: uppercase;
    opacity: 0.65;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .action-row {
    display: flex;
    align-items: center;
    width: 100%;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .action-row {
    gap: var(--space-10);
    padding: var(--space-7) var(--space-14);
    font-size: var(--text-12-5);
    opacity: 0.85;
  }

  .action-row:hover:not(:disabled) {
    background: var(--tint-accent-hover);
    opacity: 1;
  }

  .action-row:active:not(:disabled) {
    background: var(--tint-accent-press);
  }

  .action-row.active {
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-weight: 600;
    opacity: 1;
  }

  .action-row.active:hover {
    background: var(--color-accent-hover);
  }

  .depth {
    margin-left: auto;
    font-size: var(--text-10-5);
    opacity: 0.6;
  }

  .pinned {
    margin-top: auto;
  }
</style>
