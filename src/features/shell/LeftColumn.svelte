<!--
  The 168 px left column (design-system §8.3): the search box, the Canvases list, and the
  Tools, Add and History groups, with Settings pinned to the bottom.

  Rows this phase does not implement — Connect, Image, Settings, and the search box itself —
  are drawn but unavailable, so the shell is not built twice. All labels are Title Case.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { canvasStore, type Tool } from '../../stores/canvasStore.svelte';

  interface Props {
    undoDepth?: number;
    redoDepth?: number;
    onNewNote?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onSelectCanvas?: (canvasId: number) => void;
  }

  const {
    undoDepth = 0,
    redoDepth = 0,
    onNewNote,
    onUndo,
    onRedo,
    onSelectCanvas,
  }: Props = $props();

  function chooseTool(tool: Tool) {
    canvasStore.activeTool = tool;
  }
</script>

<nav class="left-column scroll-thin" data-testid="left-column" aria-label="Canvases And Tools">
  <div class="search-wrapper">
    <!-- Inert in this phase: search lands in Phase 4. -->
    <div class="search-box is-unavailable" aria-disabled="true">
      <Icon glyph="magnifying-glass" size={13} />
      <span>Search</span>
    </div>
  </div>

  <p class="section-label with-action">
    Canvases
    <span class="add-canvas is-unavailable" aria-hidden="true">
      <Icon glyph="plus" size={13} />
    </span>
  </p>

  <ul class="rows">
    {#each canvasStore.canvases as canvas (canvas.id)}
      <li>
        <button
          type="button"
          class="canvas-row"
          class:active={canvas.id === canvasStore.activeCanvasId}
          aria-current={canvas.id === canvasStore.activeCanvasId ? 'true' : undefined}
          onclick={() => onSelectCanvas?.(canvas.id)}
        >
          <Icon glyph="square-half" size={13} />
          <span class="name">{canvas.name}</span>
        </button>
      </li>
    {/each}
  </ul>

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
      <!-- Connections are Phase 2. -->
      <button type="button" class="action-row is-unavailable" disabled>
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
      <!-- Image cards are Phase 3. -->
      <button type="button" class="action-row is-unavailable" disabled>
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
    <!-- The Settings screen is Phase 5. -->
    <button type="button" class="action-row is-unavailable" disabled>
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

  .search-wrapper {
    padding: 0 var(--space-12) var(--space-9);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    padding: 3px 8px;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-card);
    font-size: var(--text-11-5);
  }

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
    opacity: 0.5;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .canvas-row,
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

  .canvas-row {
    gap: 8px;
    padding: var(--space-5) var(--space-12);
    font-size: var(--text-12);
    opacity: 0.72;
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
    background: var(--color-accent-200);
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
    background: var(--color-accent-600);
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
