<!--
  The four corner handles a selected card shows (design-system §9.3): 7 × 7 px, surface
  fill, 2 px accent border, inset 4 px past each corner, each with its directional cursor.
  The 50 px minimum is enforced by `resizeRect`, not here.
-->
<script lang="ts">
  import type { ResizeHandle } from '../../lib/geometry';

  interface Props {
    onResizeStart: (handle: ResizeHandle, event: PointerEvent) => void;
  }

  const { onResizeStart }: Props = $props();

  const HANDLES: Array<{ handle: ResizeHandle; label: string }> = [
    { handle: 'nw', label: 'Resize From The Top Left' },
    { handle: 'ne', label: 'Resize From The Top Right' },
    { handle: 'sw', label: 'Resize From The Bottom Left' },
    { handle: 'se', label: 'Resize From The Bottom Right' },
  ];
</script>

{#each HANDLES as { handle, label } (handle)}
  <button
    type="button"
    class="handle {handle}"
    aria-label={label}
    data-handle={handle}
    onpointerdown={(event) => onResizeStart(handle, event)}
  ></button>
{/each}

<style>
  .handle {
    position: absolute;
    width: 7px;
    height: 7px;
    padding: 0;
    background: var(--color-surface);
    border: 2px solid var(--color-accent);
    border-radius: var(--radius-sm);
    box-sizing: content-box;
  }

  .nw {
    top: -4px;
    left: -4px;
    cursor: nwse-resize;
  }

  .ne {
    top: -4px;
    right: -4px;
    cursor: nesw-resize;
  }

  .sw {
    bottom: -4px;
    left: -4px;
    cursor: nesw-resize;
  }

  .se {
    bottom: -4px;
    right: -4px;
    cursor: nwse-resize;
  }
</style>
