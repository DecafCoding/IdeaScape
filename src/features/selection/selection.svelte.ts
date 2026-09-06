/**
 * Selection operations over the shared store. Click selects one, Ctrl or Shift click
 * toggles, a click on the background clears, and a marquee selects exactly what the band
 * encloses — a card merely touched by the band is not selected.
 */
import { canvasStore } from '../../stores/canvasStore.svelte';
import { rectContains, type Rect } from '../../lib/geometry';
import type { Placement } from '../../lib/types';

/** True when the pointer event asks to add to the selection rather than replace it. */
export function isToggleModifier(event: {
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey?: boolean;
}): boolean {
  return event.ctrlKey || event.shiftKey || event.metaKey === true;
}

export function selectCard(placementId: number, toggle: boolean): void {
  if (toggle) {
    canvasStore.toggleSelected(placementId);
    return;
  }
  if (!canvasStore.isSelected(placementId)) {
    canvasStore.setSelection([placementId]);
  }
}

/** The placements a marquee band encloses, in world units. Pure. */
export function placementsWithin(placements: Iterable<Placement>, band: Rect): Placement[] {
  const enclosed: Placement[] = [];
  for (const p of placements) {
    if (rectContains(band, { x: p.x, y: p.y, width: p.width, height: p.height })) {
      enclosed.push(p);
    }
  }
  return enclosed;
}

/** Apply a finished marquee. `additive` keeps whatever was already selected. */
export function applyMarquee(band: Rect, additive: boolean): void {
  const enclosed = placementsWithin(canvasStore.placements.values(), band).map((p) => p.id);
  if (additive) {
    for (const id of enclosed) canvasStore.selection.add(id);
  } else {
    canvasStore.setSelection(enclosed);
  }
}
