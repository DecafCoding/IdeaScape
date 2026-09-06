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

/** Which menu is open, and where the pointer was when it opened. */
export interface OpenMenu {
  kind: 'element' | 'background';
  x: number;
  y: number;
}

/** The drawn widths: 256 px for the element menu, 236 px for the background menu. */
export const ELEMENT_MENU_WIDTH = 256;
export const BACKGROUND_MENU_WIDTH = 236;
