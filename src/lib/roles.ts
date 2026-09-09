/**
 * What a line between two cards means (design-system §9.13, `feature-writing-pack.html` §5).
 *
 * **A ROLE MUST NEVER BECOME A RULE.** There is no pair table that refuses, no validation
 * error and no disabled state anywhere in this feature. A Beat joined straight to a Chapter
 * is a real way to write. `suggestRole` offers a default the user can always change —
 * including to a role they type, and including back to *Relates To*.
 *
 * `relates-to` is what `role = NULL` reads as, and it is the only role that draws no rest
 * glyph at all. The two are indistinguishable on screen and NULL is never normalised into
 * `'relates-to'` on write: "no back-fill is needed" is the compatibility promise migration
 * 0008 makes, and rewriting every old row for no visible gain would break it.
 */
import type { Glyph } from './glyphs';

export interface Role {
  key: string;
  label: string;
  glyph: Glyph;
  /** True for the role that draws nothing at rest. */
  silent?: boolean;
}

export const ROLES: readonly Role[] = [
  { key: 'feeds', label: 'Feeds', glyph: 'arrow-right' },
  { key: 'follows', label: 'Follows', glyph: 'arrow-down' },
  { key: 'part-of', label: 'Part Of', glyph: 'file-text' },
  { key: 'appears-in', label: 'Appears In', glyph: 'user' },
  { key: 'told-by', label: 'Told By', glyph: 'eye' },
  { key: 'set-in', label: 'Set In', glyph: 'map-pin' },
  { key: 'relates-to', label: 'Relates To', glyph: 'minus', silent: true },
];

const BY_KEY = new Map(ROLES.map((role) => [role.key, role]));

export function findRole(role: string | null | undefined): Role | null {
  if (!role) return null;
  return BY_KEY.get(role) ?? null;
}

/**
 * The pairs that carry a suggestion. Every unlisted pair — and every pair involving a note,
 * image, link or video card — suggests null, which reads as *Relates To* and leaves the line
 * looking exactly as it does today.
 *
 * Two of the feature doc's typical uses overlap: Scene→Chapter appears under both *Feeds* and
 * *Part Of*. A suggestion has to pick one, so it takes *Feeds*, which the table lists first,
 * and the user changes it in one click. Character→Chapter suggests *Appears In* rather than
 * *Told By*, because presence is the common case and point of view is the deliberate one.
 */
const SUGGESTIONS: Record<string, string> = {
  'beat>scene': 'feeds',
  'beat>chapter': 'feeds',
  'scene>chapter': 'feeds',
  'chapter>chapter': 'follows',
  'scene>scene': 'follows',
  'chapter>book': 'part-of',
  'character>scene': 'appears-in',
  'character>chapter': 'appears-in',
  'location>scene': 'set-in',
  'location>chapter': 'set-in',
};

/**
 * The role to offer for a new line between two cards, by their blueprint ids. `null` for
 * either end means a note, image, link or video card, and every such pair suggests nothing.
 */
export function suggestRole(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  return SUGGESTIONS[`${from}>${to}`] ?? null;
}

/**
 * What to print for a role, from one end of the line.
 *
 * *Contains* is NOT an eighth role. It is *Part Of* read from the other end, so it is a
 * display decision driven by `reversed` and never a stored value.
 *
 * A role the user typed is not in the table: it returns its own text and takes the neutral
 * glyph, because §7.1's glyph set is closed and there is none to give it.
 */
export function roleLabel(role: string | null | undefined, reversed = false): string {
  if (!role) return 'Relates To';
  if (role === 'part-of' && reversed) return 'Contains';
  return findRole(role)?.label ?? role;
}

/** The glyph for a role. A typed role takes the neutral `minus`. */
export function roleGlyph(role: string | null | undefined): Glyph {
  return findRole(role)?.glyph ?? 'minus';
}

/** Whether the line draws a rest glyph at all. `relates-to` and NULL draw nothing. */
export function roleIsDrawn(role: string | null | undefined): boolean {
  if (!role) return false;
  return !(findRole(role)?.silent ?? false);
}
