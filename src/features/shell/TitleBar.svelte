<!--
  The 34 px title bar (design-system §8.2): brand, project name, save state, counts and the
  three window controls. Every measurement here is a token, never a literal.

  In `pickerMode` — no project open — only the brand and the three window controls are
  shown (design-system §9.1). The bar keeps its height and its drag region either way.

  The native Windows title bar is off (`decorations: false`), so this bar is the window's
  only header: `data-tauri-drag-region` is what moves the window, and the three controls on
  the right are the real minimise, maximise and close.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { canvasStore } from '../../stores/canvasStore.svelte';

  interface Props {
    /** Where the project folder lives — shown instead of the breadcrumb on an empty project. */
    folderPath?: string | null;
    /** True while the project picker is the screen: brand and window controls only. */
    pickerMode?: boolean;
    onMinimize?: () => void;
    onMaximize?: () => void;
    onClose?: () => void;
  }

  const {
    folderPath = null,
    pickerMode = false,
    onMinimize,
    onMaximize,
    onClose,
  }: Props = $props();

  const cardCount = $derived(canvasStore.cardCount);
  const selectedCount = $derived(canvasStore.selection.size);
  const isEmptyProject = $derived(cardCount === 0);

  // The save state ticks so "Saved 4s ago" stays honest without a per-second store write.
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  const savedAgo = $derived.by(() => {
    if (canvasStore.savedAt === null) return null;
    const seconds = Math.max(0, Math.round((now - canvasStore.savedAt) / 1000));
    if (seconds < 60) return `Saved ${seconds}s ago`;
    return `Saved ${Math.round(seconds / 60)}m ago`;
  });

  const countsLabel = $derived(
    `${cardCount} ${cardCount === 1 ? 'card' : 'cards'} · ` +
      (selectedCount === 0 ? 'none selected' : `${selectedCount} selected`),
  );
</script>

<header class="title-bar" data-testid="title-bar" data-tauri-drag-region>
  <span class="brand">IdeaScape</span>

  {#if pickerMode}
    <!-- Nothing between the brand and the window controls: there is no project to name. -->
  {:else if isEmptyProject && folderPath}
    <span class="breadcrumb">
      <Icon glyph="folder-open" size={13} />
      {folderPath}
    </span>
  {:else}
    <!-- The project only. The canvas is named in the left column's canvas list, and saying
         it twice on one screen bought nothing. -->
    <span class="breadcrumb">{canvasStore.project?.name ?? ''}</span>
  {/if}

  {#if !pickerMode}
    <!-- Centred on the WINDOW, not on the room the breadcrumb leaves, so the save state and
         the counts do not shuffle sideways as a canvas name grows. It keeps the drag region
         attribute because it covers the middle of the bar. -->
    <div class="status" data-tauri-drag-region>
      <span class="save-state">
        {#if canvasStore.saveState === 'saving'}
          <Icon glyph="circle-dashed" size={14} />
          Saving…
        {:else if savedAgo}
          <Icon glyph="check-circle" size={14} />
          {savedAgo}
        {/if}
      </span>

      <span class="counts">{countsLabel}</span>
    </div>
  {/if}

  <!-- Not a drag region: a press here must reach the button. -->
  <div class="window-controls">
    <button type="button" class="control" onclick={onMinimize}>
      <Icon glyph="minus" size={12} label="Minimize" />
    </button>
    <button type="button" class="control" onclick={onMaximize}>
      <Icon glyph="square" size={12} label="Maximize" />
    </button>
    <button type="button" class="control close" onclick={onClose}>
      <Icon glyph="x" size={12} label="Close" />
    </button>
  </div>
</header>

<style>
  .title-bar {
    position: relative;
    height: var(--size-title-bar);
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-14);
    padding: 0 4px 0 var(--space-14);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-divider);
    white-space: nowrap;
    box-sizing: border-box;
  }

  .brand {
    font-size: var(--text-12-5);
    font-weight: 600;
    letter-spacing: var(--tracking-2);
  }

  .breadcrumb {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    font-size: var(--text-12);
    opacity: 0.5;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--space-14);
    /* It gives way to the breadcrumb and the window controls rather than overlapping them. */
    max-width: 46%;
    overflow: hidden;
  }

  .save-state {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    font-size: var(--text-11-5);
    opacity: 0.45;
  }

  .counts {
    font-size: var(--text-11-5);
    opacity: 0.45;
  }

  .window-controls {
    margin-left: auto;
    display: flex;
  }

  .control {
    width: 32px;
    height: 24px;
    display: grid;
    place-items: center;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.55;
    cursor: pointer;
    transition:
      background-color var(--duration-90) var(--ease),
      opacity var(--duration-90) var(--ease);
  }

  .control:hover {
    background: var(--tint-neutral-hover);
    opacity: 1;
  }

  .control:active {
    background: var(--tint-neutral-press);
  }

  .control.close:hover {
    background: var(--color-accent-2);
    color: var(--color-on-accent);
  }

  .control.close:active {
    background: var(--color-accent-2-hover);
  }
</style>
