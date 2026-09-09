/**
 * The shape of a context-menu entry. It lives in `lib/` because the shell renders the menu
 * and the canvas raises it: a type shared by two features may not live in either.
 */
import type { Glyph } from './glyphs';
import type { Action } from './shortcuts';

export interface MenuItem {
  kind: 'item';
  label: string;
  glyph: Glyph;
  /** The action whose printed label appears on the right. */
  action: Action;
  /** An override, for a row that prints a value rather than a key (Reset Zoom's "100%"). */
  shortcutLabel?: string;
  destructive?: boolean;
  /** False draws the row at the unavailable opacity and makes it inert. */
  available?: boolean;
  run?: () => void;
}

export interface MenuSeparator {
  kind: 'separator';
}

export type MenuEntry = MenuItem | MenuSeparator;

/**
 * Which menu is open, and where the pointer was when it opened. The canvas-row menu is a third
 * `kind` rather than a new component: the left column raises it to the root, which builds the
 * entries and renders the one `ContextMenu` — the import-direction rule forbids the canvases
 * feature importing the shell feature's menu component.
 */
export interface OpenMenu {
  kind: 'element' | 'background' | 'canvas' | 'unplaced';
  x: number;
  y: number;
  /** Set only for the `canvas` kind: which row was right-clicked. */
  canvasId?: number;
  /** Set only for the `unplaced` kind: which record's row was right-clicked. */
  itemId?: number;
}

/** The drawn widths: 256 px for the element menu, 236 px for the background menu. */
export const ELEMENT_MENU_WIDTH = 256;
export const BACKGROUND_MENU_WIDTH = 236;
/** The canvas-row menu holds two short rows, so it is narrower than either of the others. */
export const CANVAS_MENU_WIDTH = 196;
/** The Unplaced row menu. Its longest row is "Place On This Canvas", so it needs the width
 *  the background menu already carries rather than the canvas menu's 196 px. */
export const UNPLACED_MENU_WIDTH = 236;
