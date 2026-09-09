/**
 * The writing cards that are in the project but on no canvas.
 *
 * The corrected last-placement rule keeps a `blueprint` item alive when its last placement
 * goes, so a Character survives being taken off the one canvas they appeared on. The old
 * rule's promise was that nothing it left behind became invisible junk, and this list is how
 * that promise is kept: the section is drawn whenever it is not empty, and it is the only
 * route back to a record with nowhere to be.
 *
 * Like `canvases.svelte.ts`, every write goes through `invokeSafe` and *returns* the undo
 * command rather than pushing it — `import-direction` forbids a feature importing another
 * feature, so `features/undo/` is reached by the root.
 */
import { invokeSafe } from '../../lib/ipc';
import { logWarn } from '../../lib/logger';
import { canvasStore } from '../../stores/canvasStore.svelte';
import type { DeleteEffect, Item, Placement, PlacementWithItem } from '../../lib/types';

const store = $state<{ items: Item[] }>({ items: [] });

/** Every writing card with no placement, newest first. Empty when no project is open. */
export function unplacedItems(): Item[] {
  return store.items;
}

/**
 * Re-read the list. Called after every delete, every restore, every undo and every canvas
 * load — a placement anywhere in the project can move an item on or off this list.
 */
export async function refreshUnplaced(): Promise<Item[]> {
  if (canvasStore.project === null) {
    store.items = [];
    return store.items;
  }
  try {
    const items = await invokeSafe<Item[]>('list_unplaced_items');
    store.items = Array.isArray(items) ? items : [];
  } catch (error) {
    logWarn('the unplaced cards could not be read', error);
    store.items = [];
  }
  return store.items;
}

export function clearUnplaced(): void {
  store.items = [];
}

/**
 * Put an unplaced record back on a canvas at `x`, `y`.
 *
 * This is a `create_placement`, NOT a `create_blueprint_card`: it is the same item, so
 * editing it on the new canvas edits every other placement of it. Creating a second item
 * here would break the feature's central claim.
 */
export async function placeUnplaced(
  item: Item,
  canvasId: number,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<PlacementWithItem | null> {
  try {
    const placement = await invokeSafe<Placement>('create_placement', {
      canvasId,
      itemId: item.id,
      x,
      y,
      width,
      height,
    });
    const card: PlacementWithItem = { placement, item };
    canvasStore.upsertCard(card);
    await refreshUnplaced();
    return card;
  } catch (error) {
    logWarn('the card could not be placed', error);
    return null;
  }
}

/**
 * Delete an unplaced record for good. Returns everything the delete removed — the row and
 * the asset files nothing else still names — so one undo step restores them together.
 */
export async function deleteUnplaced(item: Item): Promise<DeleteEffect | null> {
  try {
    const effect = await invokeSafe<DeleteEffect>('delete_item', { itemId: item.id });
    await refreshUnplaced();
    return effect;
  } catch (error) {
    logWarn('the card could not be deleted', error);
    return null;
  }
}
