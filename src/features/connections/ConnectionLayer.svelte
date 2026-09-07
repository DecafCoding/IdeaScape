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
    polylinePath,
    rectEdgePoint,
    routeInView,
    routePoints,
    trimRoute,
  } from '../../lib/connectionGeometry';
  import {
    arrowHeadSize,
    arrowInset,
    arrowMarkerId,
    connectionStroke,
    connectionWidthPx,
    CONNECTION_COLORS,
    CONNECTION_WIDTHS,
    ELBOW_RADIUS,
  } from '../../lib/connectionStyle';
  import { CULL_MARGIN_PX, recordConnectionCullCounts } from '../../lib/culling';
  import { viewportWorldRect, type Point, type Rect } from '../../lib/geometry';
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
    /** The whole route, first point to last: two points straight, four for an elbow. */
    points: Point[];
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
      const points = routePoints(rectOf(from), rectOf(to), connection.route);
      if (!points) continue;
      if (!routeInView(points, canvasStore.view, canvasStore.viewportSize, CULL_MARGIN_PX)) {
        continue;
      }
      result.push({
        connection,
        points,
        fromLabel: nameOf(from),
        toLabel: nameOf(to),
      });
    }
    return result;
  });

  const total = $derived(canvasStore.connections.size);

  /**
   * The svg's own box, in world units: the slice of the world the viewport shows, with the
   * same margin the cull uses.
   *
   * It cannot be sized in percentages. `.world` holds nothing but absolutely positioned
   * children, so its box is 0 x 0, and `width: 100%` of that is a 0 x 0 svg viewport — which
   * a browser does not render AT ALL. That is why no line was ever drawn while the cards and
   * the label chips, which are ordinary HTML and paint outside a zero-size box quite happily,
   * were fine.
   *
   * `viewBox` is set to the same rectangle, so one user unit stays one world unit and every
   * path below is still written in plain world coordinates.
   */
  const frame = $derived(
    viewportWorldRect(canvasStore.view, canvasStore.viewportSize, CULL_MARGIN_PX),
  );

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
      // The preview is straight because a new connection starts straight (§9.13 rule 7).
      const points = routePoints(rectOf(from), rectOf(target), PENDING_STYLE.route);
      if (points) return { points, snapped: true };
    }
    return {
      points: [rectEdgePoint(rectOf(from), link.pointer), link.pointer],
      snapped: false,
    };
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

  /**
   * The mid-drag line has no row of its own, so it borrows the defaults every new connection
   * starts on: default ink, thin, one head at the far end.
   */
  const PENDING_STYLE: Connection = {
    id: -1,
    canvas_id: -1,
    from_placement_id: -1,
    to_placement_id: -1,
    label: null,
    directed: DIRECTED_FORWARD,
    color: 'default',
    width: 1,
    label_visible: true,
    route: 'straight',
  };

  /** The untrimmed path — what the hit target and the pending line are drawn from. */
  function pathFor(points: Point[]): string {
    return polylinePath(points, ELBOW_RADIUS);
  }

  /**
   * The path for the DRAWN stroke: the route with each arrowed END pulled back to the
   * arrowhead's back edge. Only the first and last segment move; the hit path is never
   * trimmed at all, because the head is part of the line as far as pointing at it goes.
   */
  function strokePathFor(connection: Connection, points: Point[]): string {
    const inset = arrowInset(connection.width);
    return pathFor(
      trimRoute(
        points,
        markerStartFor(connection) ? inset : 0,
        markerEndFor(connection) ? inset : 0,
      ),
    );
  }

  /**
   * Arrowheads follow the line's own colour, so there is one marker per palette entry rather
   * than one shared pair. A selected line keeps its colour — the selection signal is the
   * square handles and the extra width, exactly as §10 contract 7 requires.
   */
  function markerEndFor(connection: Connection): string | undefined {
    const wants = connection.directed === DIRECTED_FORWARD || connection.directed === DIRECTED_BOTH;
    if (!wants) return undefined;
    return `url(#${arrowMarkerId(connection.color, connection.width)})`;
  }

  function markerStartFor(connection: Connection): string | undefined {
    const wants = connection.directed === DIRECTED_BACK || connection.directed === DIRECTED_BOTH;
    if (!wants) return undefined;
    return `url(#${arrowMarkerId(connection.color, connection.width)})`;
  }

  /**
   * Picking a line happens on the PRESS, not on the click.
   *
   * A press that reaches the canvas surface makes the surface take the pointer capture and
   * open a marquee, and the release then runs its background handler, which clears the
   * selection. Worse, that capture re-targets the click away from this path, so a handler
   * waiting for a click never ran at all — a line could be selected only by drawing it, never
   * by pointing at it. Stopping the press here prevents both.
   *
   * `onclick` stays alongside `onpointerdown` because assistive technology dispatches a click
   * with no press behind it. Choosing the same line twice is harmless.
   */
  function choose(event: Event, id: number) {
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
  viewBox="{frame.x} {frame.y} {frame.width} {frame.height}"
  style="left: {frame.x}px; top: {frame.y}px; width: {frame.width}px; height: {frame.height}px;
         pointer-events: none;"
>
  <defs>
    <!-- The marker geometry is copied verbatim from design-system §9.13.
         auto-start-reverse is what lets one marker serve both marker-start and marker-end.
         A marker carries both its fill and its size, so one is emitted per colour x width
         pair: the arrowhead matches its line's colour and grows 25% per width step.

         markerUnits is userSpaceOnUse rather than the default strokeWidth, which is what
         puts the head's size under this file's control instead of the stroke's. It is still
         world space, so the head zooms with the canvas like everything else.

         refX is the head's BACK edge (0.5) rather than §9.13's 8, because the drawn stroke
         is trimmed to end there — see `strokePathFor`. The two changes cancel: the tip lands
         in exactly the place the untrimmed line and an refX of 8 put it. -->
    {#each CONNECTION_COLORS as swatch (swatch.key)}
      {#each CONNECTION_WIDTHS as step (step.step)}
        {@const size = arrowHeadSize(step.step)}
        <marker
          id={`ideascape-arrow-${swatch.key}-${step.step}`}
          viewBox="0 0 9 9"
          refX="0.5"
          refY="4.5"
          markerWidth={size}
          markerHeight={size}
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path
            d="M0.5,0.5 L8.5,4.5 L0.5,8.5 z"
            fill={swatch.key === 'default' ? 'var(--color-arrowhead)' : swatch.token}
          />
        </marker>
      {/each}
    {/each}
  </defs>

  {#each drawn as row (row.connection.id)}
    {@const selected = canvasStore.selectedConnectionId === row.connection.id}
    {@const d = pathFor(row.points)}
    {@const first = row.points[0]}
    {@const last = row.points[row.points.length - 1]}
    <g class="connection" class:selected data-connection-id={row.connection.id}>
      <path
        class="stroke"
        d={strokePathFor(row.connection, row.points)}
        fill="none"
        stroke={connectionStroke(row.connection.color)}
        stroke-width={connectionWidthPx(row.connection.width, selected)}
        marker-end={markerEndFor(row.connection)}
        marker-start={markerStartFor(row.connection)}
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
        onpointerdown={(event) => choose(event, row.connection.id)}
        onclick={(event) => choose(event, row.connection.id)}
        onkeydown={(event) => onKeyDown(event, row.connection.id)}
      />
      {#if selected}
        <!-- The selection signal is the square handles plus the extra width, exactly as it
             is on a card. The stroke keeps its own colour: §10 contract 7 says a line never
             takes the accent. -->
        <!-- A bend carries no handle: the route is computed, never dragged (§9.13 rule 8). -->
        <rect class="handle" x={first.x - 3.5} y={first.y - 3.5} width="7" height="7" />
        <rect class="handle" x={last.x - 3.5} y={last.y - 3.5} width="7" height="7" />
      {/if}
    </g>
  {/each}

  {#if pending}
    <path
      class="pending"
      class:snapped={pending.snapped}
      data-testid="pending-link"
      d={pending.snapped ? strokePathFor(PENDING_STYLE, pending.points) : pathFor(pending.points)}
      fill="none"
      stroke-width="1.5"
      marker-end={pending.snapped ? 'url(#ideascape-arrow-default-1)' : undefined}
    />
  {/if}
</svg>

<style>
  .connection-layer {
    position: absolute;
    /* The box and the viewBox are both set inline, in world units — see `frame`. A
       percentage size here would be a percentage of a zero-size parent, and a zero-size svg
       viewport is not rendered. */
    /* Without this the overlay swallows every pan, marquee and card drag. It is also set
       inline on the element, so the rule cannot be lost to stylesheet ordering. */
    pointer-events: none;
    /* A line whose box only clips the frame may run past its edge. The frame already sits a
       cull margin outside the viewport, so this is only ever belt and braces. */
    overflow: visible;
    z-index: var(--z-connections);
  }

  /* The stroke's colour and width are set inline from the row — see `connectionStyle.ts`.
     A selected line keeps its colour and grows instead. */

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
