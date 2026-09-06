<!--
  Both context menus share one grammar (design-system §11.3, handoff frames 17a and 17b).
  Opening rises 3 px over 110 ms; closing is 0 ms, because a closing animation delays the
  next action.

  The shortcut labels are read from `SHORTCUT_LABELS`, never retyped — PRD §6.8 makes every
  key a menu prints a contract the application must honour, so the menu and the dispatcher
  cannot drift apart.

  Neither menu is the only route to any action: the rail and the panel cover the same ground.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { SHORTCUT_LABELS } from '../../lib/shortcuts';
  import type { MenuEntry, MenuItem } from '../../lib/menu';

  interface Props {
    /** The click point in viewport pixels. The menu corner sits 12 px down and right of it. */
    x: number;
    y: number;
    width: number;
    entries: MenuEntry[];
    onClose: () => void;
  }

  const { x, y, width, entries, onClose }: Props = $props();

  let menu: HTMLDivElement | null = $state(null);
  let flipX = $state(false);
  let flipY = $state(false);

  // Edge flipping: a menu opened near a window edge stays on screen rather than clipping.
  $effect(() => {
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    flipX = x + rect.width + 12 > window.innerWidth;
    flipY = y + rect.height + 12 > window.innerHeight;
  });

  function activate(item: MenuItem) {
    if (item.available === false) return;
    item.run?.();
    onClose();
  }
</script>

<div class="click-point" style="left: {x - 12}px; top: {y - 12}px;" aria-hidden="true">
  <Icon glyph="cursor" size={13} />
</div>

<div
  bind:this={menu}
  class="menu"
  data-testid="context-menu"
  role="menu"
  tabindex="-1"
  style="
    left: {flipX ? 'auto' : `${x}px`};
    right: {flipX ? `${window.innerWidth - x}px` : 'auto'};
    top: {flipY ? 'auto' : `${y}px`};
    bottom: {flipY ? `${window.innerHeight - y}px` : 'auto'};
    width: {width}px;
  "
>
  {#each entries as entry, index (index)}
    {#if entry.kind === 'separator'}
      <div class="separator" role="separator"></div>
    {:else}
      <button
        type="button"
        class="row"
        class:destructive={entry.destructive}
        class:is-unavailable={entry.available === false}
        role="menuitem"
        disabled={entry.available === false}
        onclick={() => activate(entry)}
      >
        <Icon glyph={entry.glyph} size={15} />
        <span class="label">{entry.label}</span>
        <span class="shortcut">{entry.shortcutLabel ?? SHORTCUT_LABELS[entry.action]}</span>
      </button>
    {/if}
  {/each}
</div>

<style>
  .click-point {
    position: fixed;
    z-index: var(--z-context-menu);
    pointer-events: none;
    opacity: 0.7;
  }

  .menu {
    position: fixed;
    z-index: var(--z-context-menu);
    padding: var(--space-5) 0;
    background: var(--color-surface);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-context-menu);
    font-size: var(--text-12-5);
    animation: rise var(--duration-110) var(--ease);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-10);
    width: 100%;
    padding: var(--space-6) var(--space-14);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .row :global(i) {
    opacity: 0.7;
  }

  .label {
    flex: 1;
  }

  .shortcut {
    font-size: var(--text-11);
    opacity: 0.45;
  }

  .row:hover:not(:disabled) {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }

  .row:hover:not(:disabled) .shortcut,
  .row:hover:not(:disabled) :global(i) {
    opacity: 0.8;
  }

  .row:active:not(:disabled) {
    background: var(--color-accent-600);
  }

  .row.destructive {
    color: var(--color-accent-2);
  }

  .row.destructive:hover:not(:disabled) {
    background: var(--color-accent-2);
    color: var(--color-on-accent);
  }

  .row.destructive:active:not(:disabled) {
    background: var(--color-accent-2-700);
  }

  .separator {
    height: 1px;
    margin: var(--space-5) 0;
    background: var(--color-divider);
  }
</style>
