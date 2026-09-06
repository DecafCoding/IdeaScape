<!--
  Label chips (design-system §9.13). HTML spans rather than SVG text, so a label sits on an
  opaque ground and stays readable over a card or the grid.

  Below 50 px of *on-screen* line length the chip is not drawn — not truncated, not shrunk,
  not offset. The label itself is kept: it still shows in the properties panel and returns
  unchanged when the cards move apart or the canvas zooms in.

  The layer sits above the connection layer and below the card layer, and is
  pointer-events: none throughout — a chip is a label, never a target.
-->
<script lang="ts">
  import { canvasStore } from '../../stores/canvasStore.svelte';
  import { connectionEndpoints, labelVisible, segmentMidpoint } from '../../lib/connectionGeometry';
  import type { Point, Rect } from '../../lib/geometry';
  import type { Placement } from '../../lib/types';

  function rectOf(p: Placement): Rect {
    return { x: p.x, y: p.y, width: p.width, height: p.height };
  }

  interface Chip {
    id: number;
    label: string;
    at: Point;
    selected: boolean;
  }

  const chips = $derived.by(() => {
    const result: Chip[] = [];
    for (const connection of canvasStore.connections.values()) {
      const label = connection.label;
      if (label === null || label.trim() === '') continue;
      const from = canvasStore.placements.get(connection.from_placement_id);
      const to = canvasStore.placements.get(connection.to_placement_id);
      if (!from || !to) continue;
      const points = connectionEndpoints(rectOf(from), rectOf(to));
      if (!points) continue;
      if (!labelVisible(points.start, points.end, canvasStore.view.zoom)) continue;
      result.push({
        id: connection.id,
        label,
        at: segmentMidpoint(points.start, points.end),
        selected: canvasStore.selectedConnectionId === connection.id,
      });
    }
    return result;
  });
</script>

<div class="label-layer" data-testid="connection-labels" data-drawn={chips.length}>
  {#each chips as chip (chip.id)}
    <!-- A label is user text: it goes in as a text node, never as {@html}. -->
    <span
      class="chip"
      class:selected={chip.selected}
      data-connection-id={chip.id}
      style="left: {chip.at.x}px; top: {chip.at.y}px;">{chip.label}</span
    >
  {/each}
</div>

<style>
  .label-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: var(--z-connections);
  }

  .chip {
    position: absolute;
    transform: translate(-50%, -50%);
    background: var(--color-surface);
    border-radius: var(--radius-md);
    padding: 1px 5px;
    font-size: var(--text-10);
    opacity: 0.62;
    white-space: nowrap;
    color: var(--color-text);
    border: 1px solid transparent;
    box-sizing: border-box;
  }

  .chip.selected {
    border-color: var(--color-accent);
    opacity: 1;
  }
</style>
