/**
 * The authored default size of each card kind, and the fit-box maths a new picture is sized
 * with.
 *
 * No document states a default card size as a rule: design-system §9.5 and §9.6 give the
 * drawn widths and band heights, and Phase 1 recorded 236×150 for notes on the same
 * reasoning. Contract 1 forbids the application choosing a *position*, not a default size.
 */
import { MIN_CARD_SIZE } from './geometry';
import { getBlueprint, parseBlueprintPayload } from './blueprints.svelte';
import type { Item, ItemKind } from './types';

export interface CardSize {
  width: number;
  height: number;
}

/** The note default, moved here from `app.svelte`'s constants. */
export const NOTE_SIZE: CardSize = { width: 236, height: 150 };
/** §9.5: a 236 px wide card, its 126 px preview band plus the body below it. */
export const LINK_SIZE: CardSize = { width: 236, height: 236 };
/** §9.6: 272 px so the 153 px thumbnail band is 16:9, plus the body below it. */
export const VIDEO_SIZE: CardSize = { width: 272, height: 246 };
/** The largest a new picture is authored at, in world units, before the user resizes it. */
export const IMAGE_FIT_BOX = 320;

export function defaultSizeFor(kind: ItemKind): CardSize {
  switch (kind) {
    case 'link':
      return { ...LINK_SIZE };
    case 'video':
      return { ...VIDEO_SIZE };
    case 'image':
      return { width: IMAGE_FIT_BOX, height: IMAGE_FIT_BOX };
    default:
      return { ...NOTE_SIZE };
  }
}

/**
 * The default size for one item. A blueprint card reads its own type's authored size — no
 * document draws a card face height (§9.27 gives every width and `auto`), and
 * `placement.height` is NOT NULL, so a number has to be authored somewhere; the blueprint is
 * where it belongs. Every other kind falls through to `defaultSizeFor`, which stays in place
 * for the callers that only have a kind to hand.
 */
export function defaultSizeForItem(item: Item): CardSize {
  if (item.kind === 'blueprint') {
    const blueprint = getBlueprint(parseBlueprintPayload(item.payload).blueprint);
    if (blueprint) {
      return { width: blueprint.default_size.width, height: blueprint.default_size.height };
    }
  }
  return defaultSizeFor(item.kind);
}

/**
 * Scale a picture into a `box`-square world box, preserving its aspect ratio and never
 * going below `MIN_CARD_SIZE`. A picture smaller than the box keeps its own size — blowing
 * a 60×40 icon up to 320 px wide would be the application making a decision for the user.
 */
export function imageFitBox(
  naturalWidth: number,
  naturalHeight: number,
  box: number = IMAGE_FIT_BOX,
): CardSize {
  const usable =
    Number.isFinite(naturalWidth) &&
    Number.isFinite(naturalHeight) &&
    naturalWidth > 0 &&
    naturalHeight > 0;
  if (!usable) return { width: box, height: box };

  const scale = Math.min(1, box / naturalWidth, box / naturalHeight);
  return {
    width: Math.max(MIN_CARD_SIZE, Math.round(naturalWidth * scale)),
    height: Math.max(MIN_CARD_SIZE, Math.round(naturalHeight * scale)),
  };
}
