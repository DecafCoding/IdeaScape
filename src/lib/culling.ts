/**
 * Culling — the product's whole performance promise. A card outside the view window is
 * removed from the page, so panning 250 cards draws only the handful actually visible.
 *
 * docs/architecture.html §11 settles the method here: the simple per-card axis-aligned box
 * check first, measured against 250 cards, moving to fixed grid buckets only if the frame
 * rate misses. `visiblePlacements` is the seam that swap would happen behind — its
 * signature is what callers depend on, never its internals.
 */
import type { Placement } from './types';
import { rectsIntersect, viewportWorldRect, type Rect, type Size, type View } from './geometry';

/** Screen-space margin, so a card enters the page slightly before it enters view. */
export const CULL_MARGIN_PX = 200;

export interface CullResult {
  visible: Placement[];
  total: number;
  drawn: number;
}

function placementRect(p: Placement): Rect {
  return { x: p.x, y: p.y, width: p.width, height: p.height };
}

/**
 * The placements that belong in the page for this view. Pure: same inputs, same result,
 * and nothing passed in is mutated.
 *
 * `alwaysVisible` holds ids that must survive culling regardless — the card being edited,
 * whose unsaved text must not be destroyed by a pan.
 */
export function visiblePlacements(
  placements: Iterable<Placement>,
  view: View,
  viewportSize: Size,
  marginPx: number = CULL_MARGIN_PX,
  alwaysVisible: ReadonlySet<number> = new Set(),
): Placement[] {
  // Cull on the world rectangle, not on screen coordinates, or the margin behaves
  // differently at every zoom level.
  const window = viewportWorldRect(view, viewportSize, marginPx);
  const result: Placement[] = [];
  for (const p of placements) {
    if (alwaysVisible.has(p.id) || rectsIntersect(window, placementRect(p))) {
      result.push(p);
    }
  }
  return result;
}

/** The same check, with the counts the development performance overlay reads. */
export function cullWithCounts(
  placements: readonly Placement[],
  view: View,
  viewportSize: Size,
  marginPx: number = CULL_MARGIN_PX,
  alwaysVisible: ReadonlySet<number> = new Set(),
): CullResult {
  const visible = visiblePlacements(placements, view, viewportSize, marginPx, alwaysVisible);
  return { visible, total: placements.length, drawn: visible.length };
}

/**
 * Development-only instrumentation. If `drawn` is close to `total` the cull is broken and
 * any frame-rate number measured beside it is meaningless — this is the first thing the
 * performance overlay shows, and the first thing to check if the gate misses.
 */
export const cullCounts = { total: 0, drawn: 0 };

export function recordCullCounts(total: number, drawn: number): void {
  cullCounts.total = total;
  cullCounts.drawn = drawn;
}

/**
 * The same instrumentation for the connection overlay. Connections are culled on the
 * line's own bounding box rather than on the visible card set, so they need their own
 * counter: a line between two culled cards can still be drawn.
 */
export const connectionCullCounts = { total: 0, drawn: 0 };

export function recordConnectionCullCounts(total: number, drawn: number): void {
  connectionCullCounts.total = total;
  connectionCullCounts.drawn = drawn;
}
