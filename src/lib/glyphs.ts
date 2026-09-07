/**
 * The closed Phosphor glyph set — 33 names, exactly as docs/design-system.html §7.1 lists
 * them. Typed as a union so `Icon.svelte` cannot be handed a glyph outside the set, which
 * is what keeps the set closed in practice and not only on paper.
 */

export const GLYPHS = [
  // Title bar
  'check-circle',
  'folder-open',
  'minus',
  'square',
  'x',
  // Left column
  'magnifying-glass',
  'plus',
  'square-half',
  'cursor',
  'hand',
  'flow-arrow',
  'note',
  'image',
  'arrow-counter-clockwise',
  'arrow-clockwise',
  'gear',
  // Zoom bar
  'corners-out',
  // Properties panel
  'arrow-line-up',
  'arrow-line-down',
  'copy',
  'trash',
  'caret-left',
  'text-b',
  'text-italic',
  'list-bullets',
  'list-numbers',
  // Cards
  'image-broken',
  'link-simple',
  'circle-dashed',
  'youtube-logo',
  // Menus and pages
  'folder-plus',
  'folder',
  'arrow-left',
] as const;

export type Glyph = (typeof GLYPHS)[number];
