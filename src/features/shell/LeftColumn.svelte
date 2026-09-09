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
  import { SHORTCUT_LABELS, WRITING_ACTIONS } from '../../lib/shortcuts';
  import { getBlueprint } from '../../lib/blueprints.svelte';
  import type { Glyph } from '../../lib/glyphs';
  import { canvasStore, type Tool } from '../../stores/canvasStore.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    /** The search box, filled by the root — this feature may not import `features/search/`. */
    search?: Snippet;
    /** The canvas list, filled the same way. */
    canvases?: Snippet;
    /** The Unplaced list, filled the same way. It draws nothing when there is nothing in it. */
    unplaced?: Snippet;
    undoDepth?: number;
    redoDepth?: number;
    onNewNote?: () => void;
    onNewImage?: () => void;
    /** Make one writing card at the pointer. The root owns the create command. */
    onNewWritingCard?: (blueprint: string) => void;
    /**
     * The *Show Writing Cards* setting. Off, the Writing Pack parent is NOT DRAWN AT ALL —
     * not dimmed — and the 2–7 keys are disabled with it, because a key printed on a menu row
     * that is not there has nothing to be printed on.
     */
    showWritingCards?: boolean;
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
    unplaced,
    undoDepth = 0,
    redoDepth = 0,
    onNewNote,
    onNewImage,
    onNewWritingCard,
    showWritingCards = true,
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

  // --- the Cards group (design-system §8.3) -------------------------------
  //
  // Eight card kinds do not fit as flat rows in a 168px rail, so `Add` becomes `Cards` with
  // two submenu parents. The rule underneath is unchanged: one flat pack, no pack picker, no
  // project types.

  /** Which submenu is open, or null. Only one at a time. */
  let openSubmenu = $state<'general' | 'writing' | null>(null);

  interface CardRow {
    label: string;
    glyph: Glyph;
    /** The printed key. DERIVED from SHORTCUT_LABELS — a menu never retypes a key. */
    shortcut: string;
    run: () => void;
  }

  const generalRows = $derived<CardRow[]>([
    {
      label: 'Note',
      glyph: 'note',
      shortcut: SHORTCUT_LABELS['new-note'],
      run: () => onNewNote?.(),
    },
    {
      label: 'Image',
      glyph: 'image',
      shortcut: SHORTCUT_LABELS['new-image'],
      run: () => onNewImage?.(),
    },
  ]);

  /** One row per shipped writing type, named and iconed by its own blueprint. */
  const writingRows = $derived<CardRow[]>(
    WRITING_ACTIONS.flatMap(({ action, blueprint }) => {
      const found = getBlueprint(blueprint);
      if (!found) return [];
      return [
        {
          label: found.label,
          glyph: found.glyph,
          shortcut: SHORTCUT_LABELS[action],
          run: () => onNewWritingCard?.(blueprint),
        },
      ];
    }),
  );

  function toggleSubmenu(which: 'general' | 'writing') {
    openSubmenu = openSubmenu === which ? null : which;
  }

  function choose(row: CardRow) {
    openSubmenu = null;
    row.run();
  }
</script>

<!-- §9.9's menu grammar, at §8.3's 206px. One snippet, both parents. -->
{#snippet flyout(rows: CardRow[], label: string)}
  <div class="flyout" role="menu" aria-label={label} data-testid="cards-flyout">
    {#each rows as row (row.label)}
      <button type="button" class="flyout-row" role="menuitem" onclick={() => choose(row)}>
        <Icon glyph={row.glyph} size={14} />
        <span class="flyout-label">{row.label}</span>
        <span class="flyout-shortcut">{row.shortcut}</span>
      </button>
    {/each}
  </div>
{/snippet}

<nav class="left-column scroll-thin" data-testid="left-column" aria-label="Canvases And Tools">
  {@render search?.()}

  {@render canvases?.()}

  {@render unplaced?.()}

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

  <p class="section-label">Cards</p>
  <ul class="rows" data-testid="cards-group">
    <li class="submenu-holder">
      <button
        type="button"
        class="action-row parent"
        class:active={openSubmenu === 'general'}
        aria-expanded={openSubmenu === 'general'}
        data-testid="cards-parent-general"
        onclick={() => toggleSubmenu('general')}
      >
        <Icon glyph="squares-four" size={13} />
        General
        <span class="caret"><Icon glyph="caret-right" size={12} /></span>
      </button>
      {#if openSubmenu === 'general'}
        {@render flyout(generalRows, 'General Cards')}
      {/if}
    </li>
    {#if showWritingCards}
      <li class="submenu-holder">
        <button
          type="button"
          class="action-row parent"
          class:active={openSubmenu === 'writing'}
          aria-expanded={openSubmenu === 'writing'}
          data-testid="cards-parent-writing"
          onclick={() => toggleSubmenu('writing')}
        >
          <Icon glyph="book-open" size={13} />
          Writing Pack
          <span class="caret"><Icon glyph="caret-right" size={12} /></span>
        </button>
        {#if openSubmenu === 'writing'}
          {@render flyout(writingRows, 'Writing Pack Cards')}
        {/if}
      </li>
    {/if}
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

  .submenu-holder {
    position: relative;
  }

  .action-row.parent .caret {
    display: inline-flex;
    margin-left: auto;
    opacity: 0.5;
  }

  /* An open parent takes the pressed appearance — the same appearance as the active tool,
     which is correct: it IS the thing currently acting. */
  .action-row.parent.active .caret {
    opacity: 0.8;
  }

  .flyout {
    position: absolute;
    left: 100%;
    top: 0;
    z-index: var(--z-context-menu);
    width: 206px;
    padding: var(--space-5) 0;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    box-shadow: var(--shadow-context-menu);
  }

  .flyout-row {
    display: flex;
    align-items: center;
    gap: var(--space-9);
    width: 100%;
    padding: var(--space-5) var(--space-12);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-12);
    text-align: left;
    cursor: pointer;
  }

  .flyout-row:hover {
    background: var(--tint-accent-hover);
  }

  .flyout-row :global(i) {
    opacity: 0.7;
  }

  .flyout-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .flyout-shortcut {
    font-size: var(--text-10);
    opacity: 0.45;
    font-variant-numeric: tabular-nums;
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
