/**
 * Which writing card has its full-screen sheet open.
 *
 * A SHEET IS A VIEW OF ONE CARD, NOT A MODE. Edits land in the same payload through the same
 * `set_item_field` command with the same undo entries, and nothing is committed on leaving.
 * It takes no stacking rung (§8.6): it replaces the canvas, exactly as the Settings page
 * does, rather than being layered over it.
 *
 * The open sheet is held as a PLACEMENT id rather than an item id, because leaving a sheet
 * has to return to exactly the canvas the user left, with the selection and the view intact.
 */
import { canvasStore } from '../../stores/canvasStore.svelte';
import { blueprintForPayload, type Blueprint } from '../../lib/blueprints.svelte';
import type { Item } from '../../lib/types';

const state = $state<{ placementId: number | null }>({ placementId: null });

export function openSheetFor(placementId: number): void {
  state.placementId = placementId;
}

export function closeSheet(): void {
  state.placementId = null;
}

export function openSheetPlacementId(): number | null {
  return state.placementId;
}

/** The item whose sheet is open, or null. */
export function sheetItem(): Item | null {
  if (state.placementId === null) return null;
  const placement = canvasStore.placements.get(state.placementId);
  if (!placement) return null;
  return canvasStore.itemFor(placement);
}

/** The blueprint of the open sheet, or null when nothing is open. */
export function sheetBlueprint(): Blueprint | null {
  const item = sheetItem();
  if (!item || item.kind !== 'blueprint') return null;
  const blueprint = blueprintForPayload(item.payload);
  return blueprint?.sheet ? blueprint : null;
}

/** Whether a sheet is on screen. The composition root swaps the canvas out on this. */
export function sheetOpen(): boolean {
  return sheetBlueprint() !== null;
}
