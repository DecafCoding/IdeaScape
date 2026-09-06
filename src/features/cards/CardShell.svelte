<!--
  The shell every card kind sits in (design-system §9.3, §11.2). It is absolutely
  positioned from the placement rectangle in *world* units — the surrounding layer carries
  the one CSS transform, so a card never scales, lifts or tilts on its own.

  Hover is shadow only: no outline and no handles. That is exactly what separates hover
  from selected. A card that is both selected and keyboard-focused shows the tight outline
  with handles *and* the offset focus ring; the two are distinguished by shape, not colour.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Placement } from '../../lib/types';
  import type { ResizeHandle } from '../../lib/geometry';
  import ResizeHandles from './ResizeHandles.svelte';

  interface Props {
    placement: Placement;
    selected: boolean;
    dragging: boolean;
    editing: boolean;
    onPointerDown: (event: PointerEvent) => void;
    onContextMenu: (event: MouseEvent) => void;
    onResizeStart: (handle: ResizeHandle, event: PointerEvent) => void;
    /**
     * Opens the card's own editor, where it has one. It must live on this element rather
     * than on the card's content: `onPointerDown` takes pointer capture to drag, and a
     * captured pointer retargets the click and dblclick that follow to the capture
     * element. A handler on a descendant is therefore never reached.
     */
    onDoubleClick?: (event: MouseEvent) => void;
    children: Snippet;
  }

  const {
    placement,
    selected,
    dragging,
    editing,
    onPointerDown,
    onContextMenu,
    onResizeStart,
    onDoubleClick,
    children,
  }: Props = $props();
</script>

<div
  class="card"
  class:selected
  class:dragging
  class:editing
  data-testid="card"
  data-placement-id={placement.id}
  role="button"
  tabindex="0"
  aria-pressed={selected}
  style="
    left: {placement.x}px;
    top: {placement.y}px;
    width: {placement.width}px;
    height: {editing ? 'auto' : `${placement.height}px`};
    min-height: {placement.height}px;
    z-index: {placement.z_order};
  "
  onpointerdown={onPointerDown}
  oncontextmenu={onContextMenu}
  ondblclick={onDoubleClick}
>
  {@render children()}

  {#if selected && !editing}
    <ResizeHandles {onResizeStart} />
  {/if}
</div>

<style>
  .card {
    position: absolute;
    background: var(--color-surface);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    /* Deliberately NOT `will-change: transform`: 250 promoted layers exhaust the
       compositor, which is the opposite of what the frame gate needs. */
    transition: box-shadow var(--duration-90) var(--ease);
    outline-offset: 2px;
    cursor: move;
    box-sizing: border-box;
  }

  .card:hover {
    box-shadow: var(--shadow-card-selected);
  }

  .card.selected {
    outline: 2px solid var(--color-accent);
    outline-offset: 0;
    box-shadow: var(--shadow-card-selected);
    /* Selection is instant. Only the hover lift eases. */
    transition: none;
  }

  .card.selected:focus-visible {
    /* Both rings, distinguished by offset: the tight outline plus the focus ring. */
    box-shadow:
      var(--shadow-card-selected),
      0 0 0 2px var(--color-bg),
      0 0 0 4px var(--color-accent);
  }

  .card.dragging {
    box-shadow: var(--shadow-card-drag);
    cursor: grabbing;
    transition: none;
  }

  .card.editing {
    cursor: text;
  }
</style>
