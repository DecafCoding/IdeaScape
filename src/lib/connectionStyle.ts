/**
 * The line palette and the three width steps a connection can take.
 *
 * A connection row stores a palette KEY, never a hex value: each theme resolves the key to
 * its own ink through the `--color-line-*` tokens, so a red line stays legible on both
 * grounds. `default` is the neutral connection ink the canvas has always used.
 *
 * Pixel widths live here rather than in the database, so a stroke can be retuned without a
 * migration. Widths are world units — the canvas transform scales them like everything else.
 */

/**
 * The two shapes a line can take. Like a colour, the row stores the KEY and this file owns
 * what it means, so the bend radius and the side-choice rules can be retuned without a
 * migration. Design-system §9.13, "Route".
 */
export const CONNECTION_ROUTES = [
  { key: 'straight', label: 'Straight' },
  { key: 'elbow', label: 'Elbow' },
] as const;

export type ConnectionRouteKey = (typeof CONNECTION_ROUTES)[number]['key'];

/** A new connection is straight, so adding the feature changes no existing canvas. */
export const DEFAULT_CONNECTION_ROUTE: ConnectionRouteKey = 'straight';

/**
 * The bend radius on an elbow, in world units — §5.2's smallest radius, so a corner matches
 * the input and chip corners. `polylinePath` clamps it per corner.
 */
export const ELBOW_RADIUS = 2;

/**
 * Which side of a card an end of a line is pinned to. `auto` is what every line has always
 * done: the geometry picks the side from where the two cards sit. Design-system §9.13,
 * "Anchor".
 *
 * The row stores the KEY and this file owns what it means, exactly as `route` does, so the
 * stub length and the side rules can be retuned without a migration.
 */
export const CONNECTION_ANCHORS = [
  { key: 'auto', label: 'Auto' },
  { key: 'top', label: 'Top' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
] as const;

export type ConnectionAnchorKey = (typeof CONNECTION_ANCHORS)[number]['key'];

/** A side an end can be pinned to — every anchor key except `auto`. */
export type AnchorSide = Exclude<ConnectionAnchorKey, 'auto'>;

/** Both ends start automatic, so adding the feature changes no existing canvas. */
export const DEFAULT_CONNECTION_ANCHOR: ConnectionAnchorKey = 'auto';

/**
 * How far an elbow runs straight out of a pinned side before it is allowed to turn, in world
 * units. Without it two ends pinned to the same side would bend the moment they left the
 * card and the corner would sit on the border.
 */
export const ANCHOR_STUB = 12;

/** The stored key as a side, or null for `auto` and for anything unrecognised. */
export function anchorSide(anchor: string): AnchorSide | null {
  const found = CONNECTION_ANCHORS.find((a) => a.key === anchor);
  if (!found || found.key === 'auto') return null;
  return found.key;
}

/** The label shown for a stored key, falling back to `Auto` for an unknown one. */
export function anchorLabel(anchor: string): string {
  return CONNECTION_ANCHORS.find((a) => a.key === anchor)?.label ?? 'Auto';
}

export const CONNECTION_COLORS = [
  { key: 'default', label: 'Default', token: 'var(--color-connection)' },
  { key: 'red', label: 'Red', token: 'var(--color-line-red)' },
  { key: 'orange', label: 'Orange', token: 'var(--color-line-orange)' },
  { key: 'yellow', label: 'Yellow', token: 'var(--color-line-yellow)' },
  { key: 'green', label: 'Green', token: 'var(--color-line-green)' },
  { key: 'blue', label: 'Blue', token: 'var(--color-line-blue)' },
  { key: 'purple', label: 'Purple', token: 'var(--color-line-purple)' },
  { key: 'pink', label: 'Pink', token: 'var(--color-line-pink)' },
] as const;

export type ConnectionColorKey = (typeof CONNECTION_COLORS)[number]['key'];

export const DEFAULT_CONNECTION_COLOR: ConnectionColorKey = 'default';

/**
 * The three width steps, stored on the row as 1, 2 or 3.
 *
 * `head` is how much bigger the arrowhead is drawn at that step — 25% per step, compounding.
 * The head deliberately grows far more slowly than the line: the marker is sized in user
 * space (see `ARROW_HEAD_BASE`), so without this it would scale with the stroke and a thick
 * line would carry a head over three times the drawn size.
 */
export const CONNECTION_WIDTHS = [
  { step: 1, label: 'Thin', px: 1.5, head: 1 },
  { step: 2, label: 'Medium', px: 3, head: 1.25 },
  { step: 3, label: 'Thick', px: 5, head: 1.5625 },
] as const;

/**
 * The arrowhead's size in world units at the thin step — the same head §9.13's 6 x a 1.5 px
 * stroke has always drawn. Every step multiplies it by that step's `head`.
 */
export const ARROW_HEAD_BASE = 9;

export const DEFAULT_CONNECTION_WIDTH = 1;

/** How much wider a selected line is drawn, in world units. */
export const SELECTED_WIDTH_BONUS = 1;

/** The CSS colour for a stored key, falling back to the default ink for an unknown one. */
export function connectionStroke(color: string): string {
  return CONNECTION_COLORS.find((c) => c.key === color)?.token ?? CONNECTION_COLORS[0].token;
}

/** The stroke width in world units for a stored step, clamped to the three that exist. */
export function connectionWidthPx(step: number, selected = false): number {
  const found = CONNECTION_WIDTHS.find((w) => w.step === step) ?? CONNECTION_WIDTHS[0];
  return found.px + (selected ? SELECTED_WIDTH_BONUS : 0);
}

/** The arrowhead's size in world units for a stored width step. */
export function arrowHeadSize(step: number): number {
  const found = CONNECTION_WIDTHS.find((w) => w.step === step) ?? CONNECTION_WIDTHS[0];
  return ARROW_HEAD_BASE * found.head;
}

/**
 * How far behind the line's endpoint the arrowhead's BACK edge sits, in world units.
 *
 * The marker's viewBox is 9 wide and its path spans x 0.5 to 8.5, so the head is 8 of those
 * 9 units long and its back edge sits 7.5 of them behind where §9.13's refX of 8 would end
 * the line. The stroke is trimmed by this much at any end that carries a head, and the
 * marker's refX is moved to that same back edge, so the head does not move — only the line
 * gets shorter, which is what stops a thick line showing its width through the point.
 */
export function arrowInset(step: number): number {
  return (arrowHeadSize(step) * 7.5) / 9;
}

/**
 * The arrowhead marker id for a stored colour key and width step. A marker carries both its
 * fill and its size, so there is one per colour x step pair.
 */
export function arrowMarkerId(color: string, width: number): string {
  const key = CONNECTION_COLORS.find((c) => c.key === color)?.key ?? 'default';
  const step = CONNECTION_WIDTHS.find((w) => w.step === width)?.step ?? 1;
  return `ideascape-arrow-${key}-${step}`;
}
