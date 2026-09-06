/**
 * Pure rectangle maths, shared by culling, marquee selection and resize. Everything here
 * is a pure function of its arguments — this is the logic CLAUDE.md says to unit-test.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** The canvas transform: a world-space offset in screen pixels, plus a scale factor. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

/** The smallest a card may be on either axis (design-system §15.3 answer 8). */
export const MIN_CARD_SIZE = 50;

/** Zoom clamps. No document states a range; 24% is a drawn working zoom, so the floor sits below it. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

/** The zoom step the plus and minus buttons take. */
export const ZOOM_STEP = 0.1;

/**
 * Below this zoom, cards render as simplified boxes and the dot grid drops to a finer,
 * lighter pitch (frame 21h). Reading text at that size is impossible and drawing it is
 * wasted work, so this is drawn design and the cheapest lever if the frame gate is close.
 */
export const LOW_ZOOM = 0.4;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** True when the two rectangles share any area. Touching edges do not count. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** True when `inner` sits wholly within `outer`. A card merely touched by a band is not enclosed. */
export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** Turn a point in screen pixels into world coordinates under `view`. */
export function screenToWorld(point: Point, view: View): Point {
  return {
    x: (point.x - view.x) / view.zoom,
    y: (point.y - view.y) / view.zoom,
  };
}

/** Turn a point in world coordinates into screen pixels under `view`. */
export function worldToScreen(point: Point, view: View): Point {
  return {
    x: point.x * view.zoom + view.x,
    y: point.y * view.zoom + view.y,
  };
}

/**
 * The slice of the world the viewport currently shows, expanded by `marginPx` of *screen*
 * space converted into world units — so the margin behaves the same at every zoom.
 */
export function viewportWorldRect(view: View, viewportSize: Size, marginPx = 0): Rect {
  const zoom = view.zoom || 1;
  const margin = marginPx / zoom;
  const topLeft = screenToWorld({ x: 0, y: 0 }, view);
  return {
    x: topLeft.x - margin,
    y: topLeft.y - margin,
    width: viewportSize.width / zoom + margin * 2,
    height: viewportSize.height / zoom + margin * 2,
  };
}

/** The smallest rectangle holding every rectangle given, or null for an empty list. */
export function boundingRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The rectangle two dragged corners describe, normalised so width and height are positive. */
export function rectFromCorners(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

/**
 * Apply a world-space drag delta to one corner handle, clamping both axes at
 * MIN_CARD_SIZE. Dragging a top or left handle moves the card's origin as well as its size.
 */
export function resizeRect(rect: Rect, handle: ResizeHandle, dx: number, dy: number): Rect {
  let { x, y, width, height } = rect;

  if (handle === 'ne' || handle === 'se') {
    width = Math.max(MIN_CARD_SIZE, width + dx);
  } else {
    const right = x + width;
    const nextWidth = Math.max(MIN_CARD_SIZE, width - dx);
    x = right - nextWidth;
    width = nextWidth;
  }

  if (handle === 'sw' || handle === 'se') {
    height = Math.max(MIN_CARD_SIZE, height + dy);
  } else {
    const bottom = y + height;
    const nextHeight = Math.max(MIN_CARD_SIZE, height - dy);
    y = bottom - nextHeight;
    height = nextHeight;
  }

  return { x, y, width, height };
}

/** Round a world coordinate onto the 22 px grid, used only when snap to grid is on. */
export const GRID_SIZE = 22;

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}
