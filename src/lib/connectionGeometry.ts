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
import { ANCHOR_STUB, anchorSide, type AnchorSide } from './connectionStyle';
import {
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

/**
 * The points a connection's line runs through, first to last — two for a straight route,
 * four for an elbow, up to six for an elbow with a pinned end. Null in the same two cases
 * `connectionEndpoints` returns null for.
 *
 * This is the one seam the whole overlay is written against: the stroke, the hit path, the
 * arrow trim, the label chip and the cull all take a point LIST, so a future route can add
 * points without touching any of them. Design-system §9.13, "Route".
 *
 * `fromAnchor` and `toAnchor` are stored keys — `auto`, or a side. With both on `auto` and no
 * bend this is exactly the geometry that shipped before anchors existed, which is what keeps
 * every existing canvas the shape it was drawn in. An unknown key reads as `auto`, the same
 * way an unknown colour key falls back to the default ink, and an unknown route falls back to
 * `straight`.
 *
 * A pinned end leaves the MIDPOINT of its side. An `auto` end aims at whatever the line is
 * actually heading for — the bend when there is one, otherwise the pinned point opposite,
 * otherwise the other card's centre. A line has to agree with itself about where it is going.
 * Design-system §9.13, "Anchor" and "Bend".
 */
export function routePoints(
  from: Rect,
  to: Rect,
  route: string,
  fromAnchor = 'auto',
  toAnchor = 'auto',
  bend: Bend | null = null,
): Point[] | null {
  return buildRoute(from, to, route, fromAnchor, toAnchor, bend)?.points ?? null;
}

/** Two points that draw one run of a route. */
export interface Segment {
  a: Point;
  b: Point;
}

/**
 * A route, and the one run of it a hand is allowed to move.
 *
 * An elbow's middle run — the crossing — has a free position: nothing but taste decides
 * where between the two cards it sits. That is the run the bend moves, and moving it keeps
 * the elbow an elbow. Every other run is pinned by a card or by a corner, so `crossing` is
 * null on a route with nothing to slide.
 */
interface BuiltRoute {
  points: Point[];
  crossing: Segment | null;
}

function buildRoute(
  from: Rect,
  to: Rect,
  route: string,
  fromAnchor: string,
  toAnchor: string,
  bend: Bend | null,
): BuiltRoute | null {
  const pinnedFrom = anchorSide(fromAnchor);
  const pinnedTo = anchorSide(toAnchor);
  const isElbow = route === 'elbow';

  if (!pinnedFrom && !pinnedTo && !bend) {
    const straight = connectionEndpoints(from, to);
    if (!straight) return null;
    if (!isElbow) return { points: [straight.start, straight.end], crossing: null };
    return elbowPoints(from, to, null);
  }

  if (rectsIntersect(from, to)) return null;
  const through = bend ? bendPoint(from, to, bend) : null;

  if (isElbow) {
    // A bend moves an elbow's crossing; it never chooses its sides. Those come from the gap
    // between the cards, or from an anchor, exactly as they do on a line with no bend.
    if (!pinnedFrom && !pinnedTo) return elbowPoints(from, to, through);
    const fromTarget = pinnedTo ? sideMidpoint(to, pinnedTo) : rectCentre(to);
    const toTarget = pinnedFrom ? sideMidpoint(from, pinnedFrom) : rectCentre(from);
    return anchoredElbow(
      from,
      to,
      pinnedFrom ?? nearestSide(from, fromTarget),
      pinnedTo ?? nearestSide(to, toTarget),
      through,
    );
  }

  // Straight. Here a bend really is a point the line runs through, and both ends aim at it.
  const fromTarget = through ?? (pinnedTo ? sideMidpoint(to, pinnedTo) : rectCentre(to));
  const toTarget = through ?? (pinnedFrom ? sideMidpoint(from, pinnedFrom) : rectCentre(from));
  const start = pinnedFrom ? sideMidpoint(from, pinnedFrom) : rectEdgePoint(from, fromTarget);
  const end = pinnedTo ? sideMidpoint(to, pinnedTo) : rectEdgePoint(to, toTarget);
  if (through) return { points: simplify([start, through, end]), crossing: null };
  if (start.x === end.x && start.y === end.y) return null;
  return { points: [start, end], crossing: null };
}

/** Where the middle handle sits, and the only way it may be dragged. */
export interface BendGrip {
  at: Point;
  /**
   * `x` or `y` — an elbow's crossing, which slides on that one axis and follows the pointer
   * along it. The run itself moves; no corner is added to it.
   *
   * `across` — the straight route's bend, which moves at a right angle to the line and no
   * other way. Sliding that one along its own line changes no shape worth having, and it
   * walks the handle off the drawn line.
   */
  slide: 'x' | 'y' | 'across';
}

/**
 * Where the middle handle goes and which way it may move — or null when this route has
 * nothing a hand can usefully move.
 *
 * Null happens on an elbow whose crossing has no length (two cards level with each other
 * draw a straight run, and there is no middle section to slide) and on an elbow that meets
 * at a single corner, where both runs are pinned by a card. Better no handle than a handle
 * that does nothing.
 */
export function bendGrip(
  from: Rect,
  to: Rect,
  route: string,
  fromAnchor = 'auto',
  toAnchor = 'auto',
  bend: Bend | null = null,
): BendGrip | null {
  const built = buildRoute(from, to, route, fromAnchor, toAnchor, bend);
  if (!built) return null;

  const { crossing } = built;
  if (crossing) {
    if (segmentLength(crossing.a, crossing.b) === 0) return null;
    return {
      at: segmentMidpoint(crossing.a, crossing.b),
      slide: crossing.a.x === crossing.b.x ? 'x' : 'y',
    };
  }
  if (route === 'elbow') return null;

  const longest = longestSegment(built.points);
  if (!longest) return null;
  return {
    at: bend ? bendPoint(from, to, bend) : segmentMidpoint(longest.a, longest.b),
    slide: 'across',
  };
}

/**
 * A bend the user placed by hand, held in the frame of the two card CENTRES rather than as a
 * canvas coordinate. Design-system §9.13, "Bend".
 *
 * `a` runs along the line from the first centre to the second — 0 at one end, 1 at the other.
 * `b` runs at a right angle to it, in the same units as that distance. So a bend slides,
 * stretches and turns with its two cards, and the shape the user drew survives a card being
 * moved, which is the whole point of storing it this way.
 *
 * The frame is the two CENTRES and not the two endpoints on purpose: an endpoint depends on
 * where the line is going, and the bend is what decides that, so measuring against endpoints
 * would be circular. Centres depend on nothing but the cards.
 */
export interface Bend {
  a: number;
  b: number;
}

/** The stored text as a bend, or null for "no bend" and for anything unreadable. */
export function parseBend(raw: string): Bend | null {
  if (raw === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { a, b } = parsed as { a?: unknown; b?: unknown };
    if (typeof a !== 'number' || typeof b !== 'number') return null;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { a, b };
  } catch {
    // A row written by a future version, or a corrupted one, draws as a plain line rather
    // than failing the whole overlay.
    return null;
  }
}

/** A bend as the text stored on the row. Null becomes the empty string, never `"null"`. */
export function serializeBend(bend: Bend | null): string {
  return bend === null ? '' : JSON.stringify({ a: bend.a, b: bend.b });
}

/** The frame the two numbers are measured in: one centre, and the run to the other. */
function bendFrame(from: Rect, to: Rect) {
  const origin = rectCentre(from);
  const other = rectCentre(to);
  const dx = other.x - origin.x;
  const dy = other.y - origin.y;
  return { origin, dx, dy, length: Math.hypot(dx, dy) };
}

/** Where a stored bend sits on the canvas right now. */
export function bendToWorld(from: Rect, to: Rect, bend: Bend): Point {
  const { origin, dx, dy, length } = bendFrame(from, to);
  if (length === 0) return origin;
  const acrossX = -dy / length;
  const acrossY = dx / length;
  return {
    x: origin.x + bend.a * dx + bend.b * length * acrossX,
    y: origin.y + bend.a * dy + bend.b * length * acrossY,
  };
}

/**
 * How far outside a card a bend is held. A bend inside a card is a bend the line cannot show:
 * the route is clipped at the card's border, so the drawn line stops there while the bend —
 * and the handle on it — sit under the card with nothing reaching them.
 */
export const BEND_CLEARANCE = 8;

/**
 * Where a stored bend is actually drawn: its place on the canvas, pushed clear of either card
 * it has landed inside.
 *
 * This, not `bendToWorld`, is what both the route and the middle handle read, which is what
 * keeps the handle ON the line at all times — including after a card has been dragged over a
 * bend that was in clear space when it was made.
 */
export function bendPoint(from: Rect, to: Rect, bend: Bend): Point {
  return pushOutside(to, pushOutside(from, bendToWorld(from, to, bend), BEND_CLEARANCE));
}

/**
 * The same point, moved `BEND_CLEARANCE` past the nearest border if it is inside `rect`, and
 * returned untouched if it is not. The nearest border wins, so the push is the shortest one
 * that gets the point out.
 */
function pushOutside(rect: Rect, point: Point, margin = BEND_CLEARANCE): Point {
  const fromLeft = point.x - rect.x;
  const fromRight = rect.x + rect.width - point.x;
  const fromTop = point.y - rect.y;
  const fromBottom = rect.y + rect.height - point.y;
  if (fromLeft < 0 || fromRight < 0 || fromTop < 0 || fromBottom < 0) return point;

  const nearest = Math.min(fromLeft, fromRight, fromTop, fromBottom);
  if (nearest === fromLeft) return { x: rect.x - margin, y: point.y };
  if (nearest === fromRight) return { x: rect.x + rect.width + margin, y: point.y };
  if (nearest === fromTop) return { x: point.x, y: rect.y - margin };
  return { x: point.x, y: rect.y + rect.height + margin };
}

/** A canvas point as a bend. Null when the two centres coincide and there is no frame. */
export function worldToBend(from: Rect, to: Rect, point: Point): Bend | null {
  const { origin, dx, dy, length } = bendFrame(from, to);
  if (length === 0) return null;
  const alongX = dx / length;
  const alongY = dy / length;
  const offsetX = point.x - origin.x;
  const offsetY = point.y - origin.y;
  return {
    a: (offsetX * alongX + offsetY * alongY) / length,
    b: (offsetX * -alongY + offsetY * alongX) / length,
  };
}

/** The midpoint of one side of a rectangle — where a pinned end of a line sits. */
export function sideMidpoint(rect: Rect, side: AnchorSide): Point {
  const centre = rectCentre(rect);
  switch (side) {
    case 'top':
      return { x: centre.x, y: rect.y };
    case 'bottom':
      return { x: centre.x, y: rect.y + rect.height };
    case 'left':
      return { x: rect.x, y: centre.y };
    default:
      return { x: rect.x + rect.width, y: centre.y };
  }
}

/** The unit vector pointing out of a side, away from the card. */
export function sideNormal(side: AnchorSide): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    default:
      return { x: 1, y: 0 };
  }
}

/**
 * The side of `rect` that faces `point` — what an `auto` end resolves to, and what a dragged
 * endpoint handle lands on when it is let go.
 *
 * The two axes are compared against the card's own half-width and half-height rather than
 * against each other, so a wide card does not claim `left` or `right` for a point sitting
 * just above it. It is the same normalising `rectEdgePoint` does. A tie goes to horizontal.
 */
export function nearestSide(rect: Rect, point: Point): AnchorSide {
  const centre = rectCentre(rect);
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  const reachX = rect.width === 0 ? Infinity : Math.abs(dx) / (rect.width / 2);
  const reachY = rect.height === 0 ? Infinity : Math.abs(dy) / (rect.height / 2);
  if (reachX >= reachY) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/**
 * An elbow between two sides that are already chosen — the shape a pinned end forces.
 *
 * Each end runs `ANCHOR_STUB` straight out of its side before it is allowed to turn, so a
 * corner never lands on a card's border and two ends pinned to the same side still leave
 * their cards square-on. The two stub ends are then joined with orthogonal segments; where
 * they meet is `joinAxis`'s decision, or the bend's when the user has moved the crossing.
 * Redundant points are dropped, so an elbow that happens to line up still draws as one
 * straight run.
 */
function anchoredElbow(
  from: Rect,
  to: Rect,
  fromSide: AnchorSide,
  toSide: AnchorSide,
  through: Point | null,
): BuiltRoute {
  const start = sideMidpoint(from, fromSide);
  const end = sideMidpoint(to, toSide);
  const outStart = sideNormal(fromSide);
  const outEnd = sideNormal(toSide);
  const stubStart = {
    x: start.x + outStart.x * ANCHOR_STUB,
    y: start.y + outStart.y * ANCHOR_STUB,
  };
  const stubEnd = { x: end.x + outEnd.x * ANCHOR_STUB, y: end.y + outEnd.y * ANCHOR_STUB };
  const startIsHorizontal = outStart.x !== 0;
  const endIsHorizontal = outEnd.x !== 0;

  if (startIsHorizontal && endIsHorizontal) {
    const x = through ? through.x : joinAxis(stubStart.x, stubEnd.x, outStart.x, outEnd.x);
    const crossing = { a: { x, y: stubStart.y }, b: { x, y: stubEnd.y } };
    return {
      points: simplify([start, stubStart, crossing.a, crossing.b, stubEnd, end]),
      crossing,
    };
  }
  if (!startIsHorizontal && !endIsHorizontal) {
    const y = through ? through.y : joinAxis(stubStart.y, stubEnd.y, outStart.y, outEnd.y);
    const crossing = { a: { x: stubStart.x, y }, b: { x: stubEnd.x, y } };
    return {
      points: simplify([start, stubStart, crossing.a, crossing.b, stubEnd, end]),
      crossing,
    };
  }
  // One stub runs across and the other up or down: they meet at a single corner, and both
  // runs are pinned by a card. There is nothing free to slide, so no crossing is offered.
  const corner = startIsHorizontal
    ? { x: stubEnd.x, y: stubStart.y }
    : { x: stubStart.x, y: stubEnd.y };
  return { points: simplify([start, stubStart, corner, stubEnd, end]), crossing: null };
}

/**
 * Where two stubs on the same axis meet.
 *
 * When they point at each other there is room between them and the crossing sits halfway,
 * which is the shape the automatic elbow already draws. When either points away, halfway
 * would be BEHIND a stub and the line would double back through its own card, so the
 * crossing runs out past the further of the two instead.
 */
function joinAxis(a: number, b: number, outA: number, outB: number): number {
  const facing = outA * (b - a) > 0 && outB * (a - b) > 0;
  if (facing) return (a + b) / 2;
  return outA > 0 || outB > 0 ? Math.max(a, b) : Math.min(a, b);
}

/**
 * The four points of an elbow: out of one card's side, across the gap, and into the other
 * card's facing side. Design-system §9.13 sets the rules this follows.
 *
 * The axis is chosen from the *gap* between the rectangles, not from the distance between
 * their centres alone. Two rectangles that do not intersect are separated on at least one
 * axis, so this always puts the across segment inside real empty space — which is what stops
 * the line doubling back on itself when the cards overlap on the other axis. When both axes
 * have a gap, the larger centre distance wins, and a tie goes to horizontal.
 *
 * Callers get three segments, or one when the two side midpoints already line up: the middle
 * pair coincide there and are dropped rather than drawn as a zero-length bend.
 *
 * `through` is a hand-placed bend. It moves the crossing — the middle run — and nothing else:
 * the two sides are still chosen from the gap, and the shape is still out, across, in. That
 * is what makes dragging the middle of an elbow feel like moving the LINE rather than
 * dropping a new corner into it.
 */
function elbowPoints(from: Rect, to: Rect, through: Point | null): BuiltRoute {
  const a = rectCentre(from);
  const b = rectCentre(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  const gapX = dx >= 0 ? to.x - (from.x + from.width) : from.x - (to.x + to.width);
  const gapY = dy >= 0 ? to.y - (from.y + from.height) : from.y - (to.y + to.height);
  const horizontal = gapX >= 0 && gapY >= 0 ? Math.abs(dx) >= Math.abs(dy) : gapX >= 0;

  let start: Point;
  let end: Point;
  if (horizontal) {
    start = { x: dx >= 0 ? from.x + from.width : from.x, y: a.y };
    end = { x: dx >= 0 ? to.x : to.x + to.width, y: b.y };
    const x = through ? through.x : (start.x + end.x) / 2;
    const crossing = { a: { x, y: start.y }, b: { x, y: end.y } };
    return { points: simplify([start, crossing.a, crossing.b, end]), crossing };
  }
  start = { x: a.x, y: dy >= 0 ? from.y + from.height : from.y };
  end = { x: b.x, y: dy >= 0 ? to.y : to.y + to.height };
  const y = through ? through.y : (start.y + end.y) / 2;
  const crossing = { a: { x: start.x, y }, b: { x: end.x, y } };
  return { points: simplify([start, crossing.a, crossing.b, end]), crossing };
}

/**
 * The same list with the points that draw nothing removed: any point equal to the one
 * before it, and any interior point sitting on a straight run between its two neighbours.
 *
 * Both matter to the label chip, not just to the path. A chip sits on the LONGEST segment,
 * so leaving a straight run split in two would halve the segment it is measured against and
 * hide the chip on a line with plenty of room. The collinear test is an exact equality
 * because every elbow point shares an axis with its neighbours by construction.
 */
function simplify(points: Point[]): Point[] {
  const kept = points.filter(
    (p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
  );
  return kept.filter((p, i) => {
    if (i === 0 || i === kept.length - 1) return true;
    const prev = kept[i - 1];
    const next = kept[i + 1];
    const onARun = (prev.x === p.x && p.x === next.x) || (prev.y === p.y && p.y === next.y);
    return !onARun;
  });
}

/**
 * One SVG path through the points, with each interior corner rounded to `radius` world
 * units. A radius of 0, or a route with no corner, gives plain `M`/`L`.
 *
 * Every corner is clamped to half of the shorter of the two segments meeting at it, so two
 * corners on one short segment can never eat into each other and a tight elbow rounds off
 * instead of overshooting.
 */
export function polylinePath(points: Point[], radius = 0): string {
  if (points.length < 2) return '';
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const inLength = segmentLength(prev, corner);
    const outLength = segmentLength(corner, next);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    if (r <= 0) {
      d += ` L${corner.x},${corner.y}`;
      continue;
    }
    const enter = along(corner, prev, r);
    const leave = along(corner, next, r);
    d += ` L${enter.x},${enter.y} Q${corner.x},${corner.y} ${leave.x},${leave.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last.x},${last.y}`;
}

/** `distance` world units from `origin` along the direction of `toward`. */
function along(origin: Point, toward: Point, distance: number): Point {
  const length = segmentLength(origin, toward);
  if (length === 0) return origin;
  return {
    x: origin.x + ((toward.x - origin.x) / length) * distance,
    y: origin.y + ((toward.y - origin.y) / length) * distance,
  };
}

/**
 * The same segment with each end pulled inward along its own direction.
 *
 * The overlay uses it to stop the drawn stroke at the BACK of an arrowhead rather than at
 * the tip: a thick line running all the way to the tip shows its own width through the
 * head's point. Insets are clamped so the two ends can never cross — on a segment shorter
 * than the two insets together, both collapse to the midpoint and no stroke is drawn.
 */
export function trimSegment(
  a: Point,
  b: Point,
  fromInset: number,
  toInset: number,
): { start: Point; end: Point } {
  const length = segmentLength(a, b);
  if (length === 0) return { start: a, end: b };

  const from = Math.max(0, fromInset);
  const to = Math.max(0, toInset);
  const wanted = from + to;
  // Share the room that is actually there, keeping the two insets in proportion.
  const scale = wanted > length ? length / wanted : 1;
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;

  return {
    start: { x: a.x + ux * from * scale, y: a.y + uy * from * scale },
    end: { x: b.x - ux * to * scale, y: b.y - uy * to * scale },
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
 * The whole route with its first and last segment pulled in by the arrowhead insets. Only
 * those two segments move: an inset must never run backwards past a bend, so a first or last
 * segment shorter than its own inset collapses to a point instead.
 */
export function trimRoute(points: Point[], startInset: number, endInset: number): Point[] {
  if (points.length < 2) return points;
  if (points.length === 2) {
    const both = trimSegment(points[0], points[1], startInset, endInset);
    return [both.start, both.end];
  }
  const head = trimSegment(points[0], points[1], startInset, 0).start;
  const tail = trimSegment(points[points.length - 2], points[points.length - 1], 0, endInset).end;
  return [head, ...points.slice(1, -1), tail];
}

/**
 * The longest segment of a route — the only one with room for a label chip, and the one
 * rule 4's 50px threshold is measured on. Null for a route with no segment at all.
 */
export function longestSegment(points: Point[]): { a: Point; b: Point } | null {
  if (points.length < 2) return null;
  let best = { a: points[0], b: points[1] };
  let bestLength = segmentLength(points[0], points[1]);
  for (let i = 2; i < points.length; i += 1) {
    const length = segmentLength(points[i - 1], points[i]);
    if (length > bestLength) {
      best = { a: points[i - 1], b: points[i] };
      bestLength = length;
    }
  }
  return best;
}

/**
 * Cull on the box around EVERY point of the route, not around its two ends. An elbow reaches
 * outside the straight line's box, and culling on the ends alone would drop a line whose
 * bend crosses the viewport.
 */
export function routeInView(
  points: Point[],
  view: View,
  viewportSize: Size,
  marginPx = 0,
): boolean {
  if (points.length < 2) return false;
  const window = viewportWorldRect(view, viewportSize, marginPx);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  // A perfectly straight run has a zero-area box, which `rectsIntersect` would reject. Give
  // it a hair of thickness so it is still tested honestly.
  const box: Rect = {
    x: minX,
    y: minY,
    width: Math.max(Math.max(...xs) - minX, 0.001),
    height: Math.max(Math.max(...ys) - minY, 0.001),
  };
  return rectsIntersect(window, box);
}
