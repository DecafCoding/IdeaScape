/**
 * The closed Phosphor glyph set — 49 names, all of them from docs/design-system.html §7.1.
 * Typed as a union so `Icon.svelte` cannot be handed a glyph outside the set, which is what
 * keeps the set closed in practice and not only on paper.
 *
 * `notebook` is the panel's Open-The-Sheet mark (§9.30) and is drawn, so it is in.

 * §7.1 lists 61 names. The set stays closed at what the code actually draws, because that
 * is the property that makes it enforceable: the twelve not here — the six align icons,
 * `arrows-horizontal`, `crosshair`, `gauge`, `download-simple`, `warning` and
 * `warning-circle` — are drawn in mockups whose controls shipped as text and are still
 * unused. Add a name when something draws it, not before.
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
  // The writing pack (Phase 6) — card-type kickers …
  'book',
  'book-open',
  'file-text',
  'film-slate',
  'dot-outline',
  'user-circle',
  'user',
  'map-pin',
  'squares-four',
  'notebook',
  // … the rail's submenu carets and the panel's stepper …
  'caret-right',
  'caret-down',
  'caret-up',
  // … the connection roles …
  'arrow-right',
  'arrow-down',
  'eye',
  // … and Randomize.
  'dice-five',
] as const;

export type Glyph = (typeof GLYPHS)[number];
