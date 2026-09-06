/**
 * Pure connection maths — endpoints, midpoints, label visibility and line culling.
 * Everything here is a pure function of its arguments and everything is in *world* space:
 * the overlay lives inside the `.world` div and inherits the one CSS transform, so nothing
 * here converts to screen coordinates.
 *
 * It is a separate module from `geometry.ts` deliberately. That file is already shared by
 * culling, marquee and resize; keeping the connection maths behind its own signatures keeps
 * it swappable and its tests readable — the same reasoning `culling.ts` applies.
 */
import {
  rectFromCorners,
  rectsIntersect,
  viewportWorldRect,
  type Point,
  type Rect,
  type Size,
  type View,
} from './geometry';

/**
 * Below this much *on-screen* line length the label chip is not drawn. The threshold is in
 * screen pixels because the chip's own reason ("no room for a 10 px chip with 1px 5px
 * padding") is a physical-space argument, and because design-system §9.13 says the chip
 * reappears when the canvas zooms in — which is only true if zoom is part of the measure.
 */
export const LABEL_MIN_LENGTH_PX = 50;

export function rectCentre(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * Where the ray from `rect`'s centre toward `toward` crosses the rectangle's border — the
 * standard centre-ray clip. Returns the centre when the two points coincide.
 */
export function rectEdgePoint(rect: Rect, toward: Point): Point {
  const centre = rectCentre(rect);
  const dx = toward.x - centre.x;
  const dy = toward.y - centre.y;
  if (dx === 0 && dy === 0) return centre;

  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  // A zero component would divide by zero; Infinity lets the other axis win outright.
  const scaleX = dx === 0 ? Infinity : halfWidth / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : halfHeight / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return { x: centre.x + dx * scale, y: centre.y + dy * scale };
}

/**
 * The two points a line between these cards actually runs between — each on its own card's
 * real border. Null when the rectangles overlap or share a centre: there is no sensible
 * line, and the overlay skips it rather than drawing a zero-length stroke with an
 * arrowhead spike on it.
 */
export function connectionEndpoints(from: Rect, to: Rect): { start: Point; end: Point } | null {
  if (rectsIntersect(from, to)) return null;
  const fromCentre = rectCentre(from);
  const toCentre = rectCentre(to);
  if (fromCentre.x === toCentre.x && fromCentre.y === toCentre.y) return null;
  return {
    start: rectEdgePoint(from, toCentre),
    end: rectEdgePoint(to, fromCentre),
  };
}

export function segmentMidpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function segmentLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** True when the line is long enough on screen to carry its chip. */
export function labelVisible(a: Point, b: Point, zoom: number): boolean {
  return segmentLength(a, b) * zoom >= LABEL_MIN_LENGTH_PX;
}

/**
 * Cull on the *line's* own bounding box, never on the visible card set: two off-screen
 * cards can have a line crossing the middle of the viewport, and culling on their
 * visibility would wrongly drop it.
 */
export function connectionInView(
  a: Point,
  b: Point,
  view: View,
  viewportSize: Size,
  marginPx = 0,
): boolean {
  const window = viewportWorldRect(view, viewportSize, marginPx);
  const box = rectFromCorners(a, b);
  // A perfectly horizontal or vertical line has a zero-area box, which `rectsIntersect`
  // would reject. Give it a hair of thickness so it is still tested honestly.
  const line: Rect = {
    x: box.x,
    y: box.y,
    width: Math.max(box.width, 0.001),
    height: Math.max(box.height, 0.001),
  };
  return rectsIntersect(window, line);
}
