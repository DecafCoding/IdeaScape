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
    bendGrip,
    nearestSide,
    parseBend,
    polylinePath,
    rectEdgePoint,
    routeInView,
    routePoints,
    serializeBend,
    trimRoute,
    worldToBend,
    type Bend,
    type BendGrip,
  } from '../../lib/connectionGeometry';
  import {
    anchorLabel,
    arrowHeadSize,
    arrowInset,
    arrowMarkerId,
    connectionStroke,
    connectionWidthPx,
    CONNECTION_ANCHORS,
    CONNECTION_COLORS,
    CONNECTION_WIDTHS,
    ELBOW_RADIUS,
    type AnchorSide,
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
    /**
     * Raised when one end of a line is pinned to a card side, or cycled back to `auto`.
     * The layer never writes: the root owns the command and the undo entry.
     */
    onAnchorChange: (connectionId: number, end: ConnectionEnd, anchor: string) => void;
    /**
     * Raised when the middle of a line is dragged, or straightened. The value is the row's
     * stored text: `serializeBend`'s output, or the empty string for no bend.
     */
    onBendChange: (connectionId: number, bend: string) => void;
  }

  const { onSelect, onAnchorChange, onBendChange }: Props = $props();

  /** Which end of a line a handle belongs to. */
  type ConnectionEnd = 'from' | 'to';

  const ENDS = [
    { key: 'from', label: 'Start' },
    { key: 'to', label: 'End' },
  ] as const satisfies ReadonlyArray<{ key: ConnectionEnd; label: string }>;

  /**
   * A handle being dragged. `origin` is where it sat when the press landed, in world units,
   * so the pointer's world position is that plus the screen delta over the zoom — the same
   * arithmetic a card move does, and it does not need the canvas surface, which stops
   * reporting the pointer the moment the handle takes the capture.
   *
   * `side` is what the drop would pin to. It is null until the pointer has moved, and while
   * it is set the route is drawn through it, so the line follows the drag rather than
   * jumping when it is let go.
   */
  interface AnchorDrag {
    connectionId: number;
    end: ConnectionEnd;
    startX: number;
    startY: number;
    origin: Point;
    side: AnchorSide | null;
  }

  let anchorDrag = $state<AnchorDrag | null>(null);

  /**
   * The middle handle being dragged. It carries the same `origin` plus screen-delta
   * arithmetic as an anchor drag; `bend` is where the drop would put it, and while it is set
   * the line is drawn through it.
   */
  interface BendDrag {
    connectionId: number;
    startX: number;
    startY: number;
    origin: Point;
    /**
     * How far along the line the bend sits. Only used by an `across` slide, where it is
     * fixed for the whole gesture — see `moveBendDrag`.
     */
    along: number;
    /** Which way this handle may move. It is settled when the press lands. */
    slide: BendGrip['slide'];
    bend: Bend | null;
  }

  let bendDrag = $state<BendDrag | null>(null);

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
      const points = routePoints(
        rectOf(from),
        rectOf(to),
        connection.route,
        anchorFor(connection, 'from'),
        anchorFor(connection, 'to'),
        bendFor(connection),
      );
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
   * The selected line, if it is on screen. Null culls the handle layer with the line it
   * belongs to — a handle for a line scrolled out of view would float on empty canvas.
   */
  const selectedRow = $derived(
    drawn.find((row) => row.connection.id === canvasStore.selectedConnectionId) ?? null,
  );

  /** The bend a line is drawn with: the one under a live drag, or the stored one. */
  function bendFor(connection: Connection): Bend | null {
    const drag = bendDrag;
    if (drag && drag.connectionId === connection.id) return drag.bend;
    return parseBend(connection.bend);
  }

  /** The anchor a line is drawn with: the side under a live drag, or the stored key. */
  function anchorFor(connection: Connection, end: ConnectionEnd): string {
    const drag = anchorDrag;
    if (drag && drag.connectionId === connection.id && drag.end === end && drag.side) {
      return drag.side;
    }
    return end === 'from' ? connection.from_anchor : connection.to_anchor;
  }

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
    from_anchor: 'auto',
    to_anchor: 'auto',
    bend: '',
    role: null,
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

  // --- the endpoint handles ---------------------------------------------
  //
  // Dragging one pins that end of the line to a card side (design-system §9.13, "Anchor").
  // Handles and the hit path are the only parts of this svg that take a pointer at all, so
  // each opts back in against the layer's blanket `pointer-events: none`.

  /** The card rectangle the dragged end belongs to, or null if it has since gone. */
  function rectOfEnd(drag: AnchorDrag): Rect | null {
    const connection = canvasStore.connections.get(drag.connectionId);
    if (!connection) return null;
    const id = drag.end === 'from' ? connection.from_placement_id : connection.to_placement_id;
    const placement = canvasStore.placements.get(id);
    return placement ? rectOf(placement) : null;
  }

  function beginAnchorDrag(
    event: PointerEvent,
    connection: Connection,
    end: ConnectionEnd,
    origin: Point,
  ) {
    if (event.button !== 0) return;
    // Without this the press reaches the canvas surface, which takes the capture for a
    // marquee and the drag never happens — the same trap `choose` documents.
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    onSelect(connection.id);
    anchorDrag = {
      connectionId: connection.id,
      end,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      side: null,
    };
  }

  function moveAnchorDrag(event: PointerEvent) {
    const drag = anchorDrag;
    if (!drag) return;
    const rect = rectOfEnd(drag);
    if (!rect) return;
    const zoom = canvasStore.view.zoom || 1;
    const pointer = {
      x: drag.origin.x + (event.clientX - drag.startX) / zoom,
      y: drag.origin.y + (event.clientY - drag.startY) / zoom,
    };
    anchorDrag = { ...drag, side: nearestSide(rect, pointer) };
  }

  /**
   * Commit the side under the pointer. A press that never moved, and a drop back on the side
   * already stored, both write nothing — a click on a handle is only a selection.
   */
  function endAnchorDrag() {
    const drag = anchorDrag;
    anchorDrag = null;
    if (!drag || !drag.side) return;
    const connection = canvasStore.connections.get(drag.connectionId);
    if (!connection) return;
    const current = drag.end === 'from' ? connection.from_anchor : connection.to_anchor;
    if (current === drag.side) return;
    onAnchorChange(drag.connectionId, drag.end, drag.side);
  }

  function cancelAnchorDrag() {
    anchorDrag = null;
  }

  /**
   * The keyboard route to the same thing: Enter or Space steps this end through Auto, Top,
   * Right, Bottom and Left, and round again. A pointer drag can never reach `auto` — it
   * always lands on a side — so this cycle and the panel's Reset To Auto are how an end
   * goes back to being worked out for you.
   */
  function cycleAnchor(connection: Connection, end: ConnectionEnd) {
    const current = end === 'from' ? connection.from_anchor : connection.to_anchor;
    const keys = CONNECTION_ANCHORS.map((a) => a.key);
    const at = keys.findIndex((key) => key === current);
    onAnchorChange(connection.id, end, keys[(at + 1) % keys.length]);
  }

  // --- the middle handle --------------------------------------------------
  //
  // Dragging it bends the line by hand (design-system §9.13, "Bend"). The bend is stored in
  // the frame of the two card centres, so the shape survives a card being moved.

  /** The two card rectangles a line runs between, or null if either has gone. */
  function rectsOf(connectionId: number): { from: Rect; to: Rect } | null {
    const connection = canvasStore.connections.get(connectionId);
    if (!connection) return null;
    const from = canvasStore.placements.get(connection.from_placement_id);
    const to = canvasStore.placements.get(connection.to_placement_id);
    if (!from || !to) return null;
    return { from: rectOf(from), to: rectOf(to) };
  }

  /**
   * Where this line's middle handle goes and which way it may move — null when the route has
   * nothing a hand can usefully move, in which case no handle is drawn at all.
   *
   * The geometry decides both, from the same route it drew, so the handle is always ON the
   * line: on an elbow it sits in the middle of the crossing run and slides that whole run,
   * and on a straight line it sits on the bend and moves at a right angle to the line.
   */
  function gripFor(row: DrawnConnection): BendGrip | null {
    const rects = rectsOf(row.connection.id);
    if (!rects) return null;
    return bendGrip(
      rects.from,
      rects.to,
      row.connection.route,
      anchorFor(row.connection, 'from'),
      anchorFor(row.connection, 'to'),
      bendFor(row.connection),
    );
  }

  function beginBendDrag(event: PointerEvent, connection: Connection, grip: BendGrip) {
    if (event.button !== 0) return;
    const rects = rectsOf(connection.id);
    if (!rects) return;
    const origin = grip.at;
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    onSelect(connection.id);
    // Where along the line the handle already is — the stored bend's own place, or the
    // midpoint the ghost handle sits on. It does not move again for the rest of the drag,
    // so the handle cannot jump when the gesture starts.
    const start = worldToBend(rects.from, rects.to, origin);
    bendDrag = {
      connectionId: connection.id,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      along: start?.a ?? 0.5,
      slide: grip.slide,
      bend: parseBend(connection.bend),
    };
  }

  function moveBendDrag(event: PointerEvent) {
    const drag = bendDrag;
    if (!drag) return;
    const rects = rectsOf(drag.connectionId);
    if (!rects) return;
    const zoom = canvasStore.view.zoom || 1;
    const pointer = {
      x: drag.origin.x + (event.clientX - drag.startX) / zoom,
      y: drag.origin.y + (event.clientY - drag.startY) / zoom,
    };
    const at = worldToBend(rects.from, rects.to, pointer);
    if (!at) return;
    // An elbow's crossing slides on one axis and the geometry reads only that axis off the
    // bend, so the pointer can be stored as it is. A straight line's bend moves ACROSS the
    // line and no other way: sliding it along its own line changes no shape worth having,
    // and it walks the handle off the drawn line.
    bendDrag = { ...drag, bend: drag.slide === 'across' ? { a: drag.along, b: at.b } : at };
  }

  /** Commit the bend under the pointer. A press that never travelled writes nothing. */
  function endBendDrag() {
    const drag = bendDrag;
    bendDrag = null;
    if (!drag) return;
    const connection = canvasStore.connections.get(drag.connectionId);
    if (!connection) return;
    const next = serializeBend(drag.bend);
    if (next === connection.bend) return;
    onBendChange(drag.connectionId, next);
  }

  function cancelBendDrag() {
    bendDrag = null;
  }

  /** Enter or Space on the middle handle straightens the line. It is the keyboard's way to
      the panel's Straighten Line button, and it does nothing on a line with no bend. */
  function onBendKeyDown(event: KeyboardEvent, connection: Connection) {
    if (event.key === 'Escape') {
      cancelBendDrag();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    if (connection.bend === '') return;
    onBendChange(connection.id, '');
  }

  function onHandleKeyDown(event: KeyboardEvent, connection: Connection, end: ConnectionEnd) {
    if (event.key === 'Escape') {
      cancelAnchorDrag();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    cycleAnchor(connection, end);
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
    </g>
  {/each}

  <!-- The selection signal is the extra stroke width. The square handles are drawn on their
       own layer below, because they have to sit ABOVE the cards to be seen or pointed at.
       The stroke keeps its own colour either way: §10 contract 7 says a line never takes
       the accent. -->
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

<!--
  The endpoint handles (design-system §9.13, "Anchor"). A separate svg on its own rung above
  the cards: an endpoint sits on a card's BORDER, so on the connection rung half of every
  handle was painted over by the card and only a 3px sliver could be seen or grabbed.

  Only the selected line has handles, so this layer holds at most two. It shares the line
  layer's frame and viewBox, so both are written in the same world coordinates.
-->
{#if selectedRow}
  {@const grip = gripFor(selectedRow)}
  <svg
    class="handle-layer"
    data-testid="connection-handles"
    overflow="visible"
    viewBox="{frame.x} {frame.y} {frame.width} {frame.height}"
    style="left: {frame.x}px; top: {frame.y}px; width: {frame.width}px; height: {frame.height}px;
           pointer-events: none;"
  >
    {#each ENDS as end (end.key)}
      {@const at =
        end.key === 'from'
          ? selectedRow.points[0]
          : selectedRow.points[selectedRow.points.length - 1]}
      <!-- Drawn at §9.13's 7 x 7. The grab target around it is twice that: a 7px square is
           an unfair thing to ask anyone to hit, and it shares its edge with a card. -->
      <rect class="handle" x={at.x - 3.5} y={at.y - 3.5} width="7" height="7" />
      <rect
        class="grab"
        data-end={end.key}
        x={at.x - 7}
        y={at.y - 7}
        width="14"
        height="14"
        role="button"
        tabindex="0"
        aria-label={`${end.label} of connection from ${selectedRow.fromLabel} to ${selectedRow.toLabel}, anchored ${anchorLabel(anchorFor(selectedRow.connection, end.key))}`}
        onpointerdown={(event) => beginAnchorDrag(event, selectedRow.connection, end.key, at)}
        onpointermove={moveAnchorDrag}
        onpointerup={endAnchorDrag}
        onpointercancel={cancelAnchorDrag}
        onkeydown={(event) => onHandleKeyDown(event, selectedRow.connection, end.key)}
      />
    {/each}

    <!-- The middle handle. It is drawn hollow, so it never reads as an endpoint, and dimmed
         while the line has no bend yet — at that point it is an invitation, not a state. -->
    {#if grip}
      {@const bent = bendFor(selectedRow.connection) !== null}
      <rect
        class="bend-handle"
        class:bent
        x={grip.at.x - 3.5}
        y={grip.at.y - 3.5}
        width="7"
        height="7"
        rx="1"
      />
      <rect
        class="grab"
        data-end="bend"
        x={grip.at.x - 7}
        y={grip.at.y - 7}
        width="14"
        height="14"
        role="button"
        tabindex="0"
        aria-label={bent
          ? `Bend of connection from ${selectedRow.fromLabel} to ${selectedRow.toLabel}`
          : `Bend the connection from ${selectedRow.fromLabel} to ${selectedRow.toLabel}`}
        onpointerdown={(event) => beginBendDrag(event, selectedRow.connection, grip)}
        onpointermove={moveBendDrag}
        onpointerup={endBendDrag}
        onpointercancel={cancelBendDrag}
        onkeydown={(event) => onBendKeyDown(event, selectedRow.connection)}
      />
    {/if}
  </svg>
{/if}

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

  .handle-layer {
    position: absolute;
    overflow: visible;
    pointer-events: none;
    /* Above the cards, unlike the lines themselves — see the token's own note. */
    z-index: var(--z-connection-handles);
  }

  .handle {
    fill: var(--color-accent);
  }

  /* Hollow, so it never reads as an endpoint — the same language a card's resize handle
     uses. Dimmed until the line actually has a bend. */
  .bend-handle {
    fill: var(--color-surface);
    stroke: var(--color-accent);
    stroke-width: 1.5;
    opacity: 0.55;
  }

  .bend-handle.bent {
    opacity: 1;
  }

  .grab {
    fill: transparent;
    /* The layer as a whole is pointer-events: none, so the target has to opt back in. */
    pointer-events: all;
    cursor: grab;
    outline: none;
  }

  .grab:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
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
