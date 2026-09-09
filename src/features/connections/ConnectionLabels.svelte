<!--
  Label chips (design-system §9.13). HTML spans rather than SVG text, so a label sits on a
  solid ground and stays readable over a card, a line or the grid. The chip is drawn at full
  strength with a hairline border in its own connection's colour, so a chip reads as part of
  the line it names; selecting the connection turns that border to the accent.

  Below 50 px of *on-screen* line length the chip is not drawn — not truncated, not shrunk,
  not offset. The label itself is kept: it still shows in the properties panel and returns
  unchanged when the cards move apart or the canvas zooms in. On an elbow route both the
  measurement and the chip's position use the route's LONGEST segment: it is the only one
  with room, and a chip on the midpoint of the whole path would sit on a bend.

  The layer sits above the connection layer and below the card layer.

  IT ALSO DRAWS THE ROLE (§9.13), because the role and the label collide and the collision
  rule has to live in one place. At rest a role is a 15px disc holding its glyph, centred on
  the line's midpoint; on hover, OR WHEN EITHER END CARD IS SELECTED, it opens into a named
  chip. A `relates-to` or NULL role draws nothing at all, so a line made before Phase 6 looks
  byte-for-byte as it did — which is why no back-fill was needed.

  THE COLLISION RULE: the role owns the line's midpoint; a free label chip moves to the
  midpoint of the longer half; they are never stacked; and when the line is too short for
  both, THE ROLE WINS AND THE LABEL IS NOT DRAWN — kept, not lost, exactly as the existing
  50px rule already keeps it.

  The role disc is the one thing here that takes a pointer, so `pointer-events` is off on the
  layer and back on for that element alone: a label is a label, never a target.
-->
<script lang="ts">
  import { canvasStore } from '../../stores/canvasStore.svelte';
  import {
    labelVisible,
    longestSegment,
    parseBend,
    pointAtFraction,
    routeInView,
    routePoints,
    segmentMidpoint,
  } from '../../lib/connectionGeometry';
  import { connectionStroke } from '../../lib/connectionStyle';
  import { roleGlyph, roleIsDrawn, roleLabel } from '../../lib/roles';
  import Icon from '../../lib/Icon.svelte';
  import type { Point, Rect } from '../../lib/geometry';
  import type { Connection, Placement } from '../../lib/types';
  import type { Glyph } from '../../lib/glyphs';

  function rectOf(p: Placement): Rect {
    return { x: p.x, y: p.y, width: p.width, height: p.height };
  }

  interface Chip {
    id: number;
    label: string;
    at: Point;
    selected: boolean;
    /** The line's own ink, as a CSS value — the chip's border matches its connection. */
    stroke: string;
  }

  interface RoleMark {
    id: number;
    label: string;
    glyph: Glyph;
    at: Point;
    /** Open — a named chip — rather than the 15px rest disc. */
    open: boolean;
    selected: boolean;
  }

  /** Which role mark the pointer is over. Hover opens it into a named chip. */
  let hovered = $state<number | null>(null);

  /** Every connection with both endpoints on the canvas, routed once for both marks. */
  const routed = $derived.by(() => {
    const result: { connection: Connection; points: Point[] }[] = [];
    for (const connection of canvasStore.connections.values()) {
      const from = canvasStore.placements.get(connection.from_placement_id);
      const to = canvasStore.placements.get(connection.to_placement_id);
      if (!from || !to) continue;
      const points = routePoints(
        rectOf(from),
        rectOf(to),
        connection.route,
        connection.from_anchor,
        connection.to_anchor,
        parseBend(connection.bend),
      );
      if (!points) continue;
      // The role mark is one small element per VISIBLE connection, so it is culled with its
      // line exactly as the line is — or the gate regresses on a canvas with many lines.
      if (!routeInView(points, canvasStore.view, canvasStore.viewportSize, 40)) continue;
      result.push({ connection, points });
    }
    return result;
  });

  /** True when either END CARD is selected — not the connection itself (§9.13). */
  function endCardSelected(connection: Connection): boolean {
    return (
      canvasStore.isSelected(connection.from_placement_id) ||
      canvasStore.isSelected(connection.to_placement_id)
    );
  }

  const roles = $derived.by(() => {
    const result: RoleMark[] = [];
    for (const { connection, points } of routed) {
      // `relates-to` and NULL draw NOTHING AT ALL. A bare Relates To line must look
      // byte-for-byte as it does today.
      if (!roleIsDrawn(connection.role)) continue;
      const at = pointAtFraction(points, 0.5);
      if (!at) continue;
      result.push({
        id: connection.id,
        label: roleLabel(connection.role),
        glyph: roleGlyph(connection.role),
        at,
        open: hovered === connection.id || endCardSelected(connection),
        selected: canvasStore.selectedConnectionId === connection.id,
      });
    }
    return result;
  });

  /** The connection ids whose role mark is drawn, so the label knows to step aside. */
  const rolesDrawn = $derived(new Set(roles.map((role) => role.id)));

  const chips = $derived.by(() => {
    const result: Chip[] = [];
    for (const { connection, points } of routed) {
      const label = connection.label;
      if (label === null || label.trim() === '') continue;
      // Turned off in the properties panel. The text itself is kept on the row.
      if (!connection.label_visible) continue;
      const segment = longestSegment(points);
      if (!segment) continue;
      if (!labelVisible(segment.a, segment.b, canvasStore.view.zoom)) continue;

      let at = segmentMidpoint(segment.a, segment.b);
      if (rolesDrawn.has(connection.id)) {
        // The role owns the midpoint. The label moves to the midpoint of the longer half —
        // the two halves are equal by length, so the first is taken, which is a stable
        // tie-break rather than a coin toss that would move the chip between renders. The
        // two are never stacked.
        const displaced = pointAtFraction(points, 0.25);
        if (!displaced) continue;
        // Too short for both: the role wins and the label is not drawn. The displaced chip
        // has only HALF the line to sit in, so the same 50px rule is applied to that half —
        // a halved zoom is exactly a halved length. The label is KEPT, not lost: it still
        // shows in the panel and returns when the cards move apart.
        if (!labelVisible(segment.a, segment.b, canvasStore.view.zoom / 2)) continue;
        at = displaced;
      }

      result.push({
        id: connection.id,
        label,
        at,
        selected: canvasStore.selectedConnectionId === connection.id,
        stroke: connectionStroke(connection.color),
      });
    }
    return result;
  });
</script>

<div
  class="label-layer"
  data-testid="connection-labels"
  data-drawn={chips.length}
  data-roles-drawn={roles.length}
>
  {#each roles as role (role.id)}
    <!-- A role name is either one of the seven or text the user typed; it goes in as a text
         node, never as {@html}. -->
    <span
      class="role"
      class:open={role.open}
      class:selected={role.selected}
      data-connection-id={role.id}
      data-testid="role-mark"
      role="img"
      aria-label={role.label}
      style="left: {role.at.x}px; top: {role.at.y}px;"
      onmouseenter={() => (hovered = role.id)}
      onmouseleave={() => (hovered = hovered === role.id ? null : hovered)}
    >
      <span class="role-disc"><Icon glyph={role.glyph} size={role.open ? 13 : 9} /></span>
      {#if role.open}<span class="role-name">{role.label}</span>{/if}
    </span>
  {/each}

  {#each chips as chip (chip.id)}
    <!-- A label is user text: it goes in as a text node, never as {@html}. -->
    <span
      class="chip"
      class:selected={chip.selected}
      data-connection-id={chip.id}
      style="left: {chip.at.x}px; top: {chip.at.y}px; --chip-border: {chip.stroke};"
      >{chip.label}</span
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

  /* At rest: a 15px circle on the surface, holding the role's 9px icon. */
  .role {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: var(--space-5);
    transform: translate(-50%, -50%);
    /* The one element in this layer that takes a pointer, so hover can open it. */
    pointer-events: auto;
    white-space: nowrap;
  }

  .role-disc {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    height: 15px;
    flex: none;
    border: 1px solid var(--color-divider);
    border-radius: 50%;
    background: var(--color-surface);
    opacity: 0.75;
  }

  /* Open: a named chip. Neutral on the surface, or the accent when the line is selected. */
  .role.open {
    gap: 0;
    padding: 2px 8px 2px 3px;
    border: 1px solid var(--color-ink-32);
    border-radius: 9px;
    background: var(--color-surface);
    box-shadow: var(--shadow-role-chip);
    font-size: var(--text-10);
    color: var(--color-text);
  }

  .role.open .role-disc {
    width: 13px;
    height: 13px;
    border: none;
    background: transparent;
    opacity: 1;
    margin-right: var(--space-5);
  }

  .role.open.selected {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-on-accent);
  }

  .role.open.selected .role-disc {
    background: rgba(255, 255, 255, 0.22);
    border-radius: 50%;
  }

  .chip {
    position: absolute;
    transform: translate(-50%, -50%);
    background: var(--color-surface);
    border-radius: var(--radius-md);
    padding: 1px 5px;
    font-size: var(--text-10);
    /* Solid, not faded: the chip has to hide the line it sits on, and a see-through ground
       let the stroke read straight through the text. */
    white-space: nowrap;
    color: var(--color-text);
    /* The line's ink, passed in per chip. The fallback keeps the hairline divider for a
       chip drawn before its colour resolves. */
    border: 1px solid var(--chip-border, var(--color-divider));
    box-sizing: border-box;
  }

  .chip.selected {
    border-color: var(--color-accent);
  }
</style>
