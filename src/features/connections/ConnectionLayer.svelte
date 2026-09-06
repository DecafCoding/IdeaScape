<!--
  The connection overlay (design-system §9.13). One SVG sibling of the card layer, placed
  before it in DOM order and on the --z-connections rung, so cards always paint over lines.

  The svg as a whole is pointer-events: none — without that it swallows every background
  pan, marquee and card drag, which is the single most likely way this layer breaks the
  canvas. Each connection then carries one wide transparent hit path with
  pointer-events: stroke, which is what makes a 1.5 px line clickable.

  Everything here is world space. The overlay sits inside `.world`, so it inherits the one
  CSS transform and the stroke scales with the canvas like every other element does.
-->
<script lang="ts">
  import { canvasStore } from '../../stores/canvasStore.svelte';
  import {
    connectionEndpoints,
    connectionInView,
    rectEdgePoint,
  } from '../../lib/connectionGeometry';
  import { CULL_MARGIN_PX, recordConnectionCullCounts } from '../../lib/culling';
  import type { Point, Rect } from '../../lib/geometry';
  import {
    DIRECTED_BACK,
    DIRECTED_BOTH,
    DIRECTED_FORWARD,
    type Connection,
    type Placement,
  } from '../../lib/types';

  interface Props {
    /** Raised when a line is chosen by pointer or keyboard. */
    onSelect: (connectionId: number) => void;
  }

  const { onSelect }: Props = $props();

  interface DrawnConnection {
    connection: Connection;
    start: Point;
    end: Point;
    fromLabel: string;
    toLabel: string;
  }

  function rectOf(p: Placement): Rect {
    return { x: p.x, y: p.y, width: p.width, height: p.height };
  }

  function nameOf(p: Placement): string {
    const item = canvasStore.itemFor(p);
    if (!item) return `card ${p.id}`;
    try {
      const parsed = JSON.parse(item.payload) as { title?: unknown };
      if (typeof parsed.title === 'string' && parsed.title.trim() !== '') return parsed.title;
    } catch {
      // A malformed payload just falls back to the id.
    }
    return `card ${p.id}`;
  }

  const drawn = $derived.by(() => {
    const result: DrawnConnection[] = [];
    for (const connection of canvasStore.connections.values()) {
      const from = canvasStore.placements.get(connection.from_placement_id);
      const to = canvasStore.placements.get(connection.to_placement_id);
      if (!from || !to) continue;
      const points = connectionEndpoints(rectOf(from), rectOf(to));
      if (!points) continue;
      if (
        !connectionInView(
          points.start,
          points.end,
          canvasStore.view,
          canvasStore.viewportSize,
          CULL_MARGIN_PX,
        )
      ) {
        continue;
      }
      result.push({
        connection,
        start: points.start,
        end: points.end,
        fromLabel: nameOf(from),
        toLabel: nameOf(to),
      });
    }
    return result;
  });

  const total = $derived(canvasStore.connections.size);

  // The drawn count is the first number to read: if it is close to the total, the line cull
  // is broken and the frame rate beside it means nothing.
  $effect(() => recordConnectionCullCounts(total, drawn.length));

  // --- the mid-drag line ------------------------------------------------
  // Never culled: its far end is the pointer, which is by definition on screen.

  const pending = $derived.by(() => {
    const link = canvasStore.pendingLink;
    if (!link) return null;
    const from = canvasStore.placements.get(link.fromPlacementId);
    if (!from) return null;

    const target = hoveredTarget(link.fromPlacementId, link.pointer);
    if (target) {
      const points = connectionEndpoints(rectOf(from), rectOf(target));
      if (points) return { ...points, snapped: true };
    }
    return { start: rectEdgePoint(rectOf(from), link.pointer), end: link.pointer, snapped: false };
  });

  /** The card under the pointer that is a legal drop target for this link. */
  function hoveredTarget(sourceId: number, pointer: Point): Placement | null {
    let best: Placement | null = null;
    for (const p of canvasStore.placements.values()) {
      if (p.id === sourceId) continue;
      if (pointer.x < p.x || pointer.x > p.x + p.width) continue;
      if (pointer.y < p.y || pointer.y > p.y + p.height) continue;
      if (!best || p.z_order > best.z_order || (p.z_order === best.z_order && p.id > best.id)) {
        best = p;
      }
    }
    return best;
  }

  function pathFor(start: Point, end: Point): string {
    return `M${start.x},${start.y} L${end.x},${end.y}`;
  }

  function markerEndFor(connection: Connection, selected: boolean): string | undefined {
    const wants = connection.directed === DIRECTED_FORWARD || connection.directed === DIRECTED_BOTH;
    if (!wants) return undefined;
    return selected ? 'url(#ideascape-arrow-selected)' : 'url(#ideascape-arrow)';
  }

  function markerStartFor(connection: Connection, selected: boolean): string | undefined {
    const wants = connection.directed === DIRECTED_BACK || connection.directed === DIRECTED_BOTH;
    if (!wants) return undefined;
    return selected ? 'url(#ideascape-arrow-selected)' : 'url(#ideascape-arrow)';
  }

  function choose(event: Event, id: number) {
    // Without this the press also reaches the surface's background handler, which would
    // clear the very selection this click just made.
    event.stopPropagation();
    onSelect(id);
  }

  function onKeyDown(event: KeyboardEvent, id: number) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    choose(event, id);
  }
</script>

<svg
  class="connection-layer"
  data-testid="connection-layer"
  data-drawn={drawn.length}
  data-total={total}
  aria-hidden={drawn.length === 0}
  overflow="visible"
  style="pointer-events: none;"
>
  <defs>
    <!-- Copied verbatim from design-system §9.13. auto-start-reverse is what lets this one
         marker serve both marker-start and marker-end. -->
    <marker
      id="ideascape-arrow"
      viewBox="0 0 9 9"
      refX="8"
      refY="4.5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M0.5,0.5 L8.5,4.5 L0.5,8.5 z" fill="var(--color-arrowhead)" />
    </marker>
    <marker
      id="ideascape-arrow-selected"
      viewBox="0 0 9 9"
      refX="8"
      refY="4.5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M0.5,0.5 L8.5,4.5 L0.5,8.5 z" fill="var(--color-accent)" />
    </marker>
  </defs>

  {#each drawn as row (row.connection.id)}
    {@const selected = canvasStore.selectedConnectionId === row.connection.id}
    {@const d = pathFor(row.start, row.end)}
    <g class="connection" class:selected data-connection-id={row.connection.id}>
      <path
        class="stroke"
        {d}
        fill="none"
        stroke-width={selected ? 2.5 : 1.5}
        marker-end={markerEndFor(row.connection, selected)}
        marker-start={markerStartFor(row.connection, selected)}
      />
      <path
        class="hit"
        {d}
        fill="none"
        stroke="transparent"
        stroke-width="12"
        role="button"
        tabindex="0"
        aria-label="Connection from {row.fromLabel} to {row.toLabel}"
        aria-pressed={selected}
        onclick={(event) => choose(event, row.connection.id)}
        onkeydown={(event) => onKeyDown(event, row.connection.id)}
      />
      {#if selected}
        <!-- The selection signal is the square handles, exactly as it is on a card. The
             stroke itself stays neutral ink: §10 contract 7 says a line never takes the
             accent. -->
        <rect class="handle" x={row.start.x - 3.5} y={row.start.y - 3.5} width="7" height="7" />
        <rect class="handle" x={row.end.x - 3.5} y={row.end.y - 3.5} width="7" height="7" />
      {/if}
    </g>
  {/each}

  {#if pending}
    <path
      class="pending"
      class:snapped={pending.snapped}
      data-testid="pending-link"
      d={pathFor(pending.start, pending.end)}
      fill="none"
      stroke-width="1.5"
      marker-end={pending.snapped ? 'url(#ideascape-arrow)' : undefined}
    />
  {/if}
</svg>

<style>
  .connection-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    /* Without this the overlay swallows every pan, marquee and card drag. It is also set
       inline on the element, so the rule cannot be lost to stylesheet ordering. */
    pointer-events: none;
    /* Lines run to negative world coordinates; without this they are clipped away. */
    overflow: visible;
    z-index: var(--z-connections);
  }

  .stroke {
    stroke: var(--color-connection);
  }

  .connection.selected .stroke {
    stroke: var(--color-text);
  }

  .hit {
    pointer-events: stroke;
    cursor: pointer;
    outline: none;
  }

  .hit:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .handle {
    fill: var(--color-accent);
  }

  .pending {
    stroke: var(--color-connection);
    /* Dashed reads as provisional, the same language the missing-asset marker uses. */
    stroke-dasharray: 4 3;
    /* It follows the pointer: no transition, ever. */
    transition: none;
  }

  .pending.snapped {
    stroke-dasharray: none;
  }
</style>
