/**
 * The inverse commands. Undo is a stack of these, not a stack of snapshots — copying 250
 * cards of state per action is too much memory (architecture §7, undo-model).
 *
 * One command may carry several effects: undoing a delete restores the placements, the
 * items they orphaned and (from Phase 3) their asset files, together, as one step. The
 * command shape already allows the asset half even though this phase has none.
 *
 * Every command writes through the same commands the forward action used, so an undone
 * delete is genuinely back on disk and not only back in memory.
 */
import { invokeSafe } from '../../lib/ipc';
import { canvasStore } from '../../stores/canvasStore.svelte';
import type {
  DeleteEffect,
  Item,
  Placement,
  PlacementUpdate,
  PlacementWithItem,
} from '../../lib/types';

export interface UndoableCommand {
  /** Shown beside the History rows. Title Case. */
  label: string;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

function toUpdate(p: Placement): PlacementUpdate {
  return { id: p.id, x: p.x, y: p.y, width: p.width, height: p.height, z_order: p.z_order };
}

async function writePlacements(updates: PlacementUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  await invokeSafe('update_placements', { updates });
  for (const u of updates) canvasStore.patchPlacement(u.id, u);
}

/** Re-create a set of cards from the rows a delete removed, and adopt the new ids. */
async function restoreCards(placements: Placement[], items: Item[]): Promise<void> {
  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const placement of placements) {
    const item = itemById.get(placement.item_id) ?? canvasStore.items.get(placement.item_id);
    if (!item) continue;
    const restored = await invokeSafe<PlacementWithItem>('restore_card', {
      canvasId: placement.canvas_id,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      zOrder: placement.z_order,
      kind: item.kind,
      payload: item.payload,
    });
    canvasStore.upsertCard(restored);
  }
}

/** Creating one card. Undo deletes it; redo puts it back. */
export function createCardCommand(card: PlacementWithItem): UndoableCommand {
  let current = card;
  return {
    label: 'New Note',
    async undo() {
      await invokeSafe<DeleteEffect>('delete_placements', { ids: [current.placement.id] });
      canvasStore.removePlacement(current.placement.id);
      canvasStore.removeItem(current.item.id);
    },
    async redo() {
      const restored = await invokeSafe<PlacementWithItem>('restore_card', {
        canvasId: current.placement.canvas_id,
        x: current.placement.x,
        y: current.placement.y,
        width: current.placement.width,
        height: current.placement.height,
        zOrder: current.placement.z_order,
        kind: current.item.kind,
        payload: current.item.payload,
      });
      current = restored;
      canvasStore.upsertCard(restored);
    },
  };
}

/**
 * Deleting a selection. `effect` names every row the backend actually removed, so the
 * item and the placement come back together as one step.
 */
export function deleteCardsCommand(effect: DeleteEffect): UndoableCommand {
  let current = effect;
  return {
    label: current.placements.length > 1 ? 'Delete Cards' : 'Delete Card',
    async undo() {
      await restoreCards(current.placements, current.items);
    },
    async redo() {
      const ids = current.placements.map((p) => p.id);
      current = await invokeSafe<DeleteEffect>('delete_placements', { ids });
      for (const p of current.placements) canvasStore.removePlacement(p.id);
      for (const i of current.items) canvasStore.removeItem(i.id);
    },
  };
}

/**
 * A move, a resize or a reorder. A whole multi-card drag is ONE command, pushed on
 * release — the same grouping the save scheduler uses — so undoing it is one step, not one
 * step per card.
 */
export function updatePlacementsCommand(
  label: string,
  before: Placement[],
  after: Placement[],
): UndoableCommand {
  const beforeUpdates = before.map(toUpdate);
  const afterUpdates = after.map(toUpdate);
  return {
    label,
    async undo() {
      await writePlacements(beforeUpdates);
    },
    async redo() {
      await writePlacements(afterUpdates);
    },
  };
}

/** Editing a note's title or body. */
export function editItemCommand(
  itemId: number,
  beforePayload: string,
  afterPayload: string,
): UndoableCommand {
  async function write(payload: string) {
    const item = await invokeSafe<Item>('update_item_payload', { itemId, payload });
    canvasStore.upsertItem(item);
  }
  return {
    label: 'Edit Note',
    undo: () => write(beforePayload),
    redo: () => write(afterPayload),
  };
}

/** Duplicating a selection. Undo removes the copies; redo re-creates them. */
export function duplicateCommand(copies: PlacementWithItem[]): UndoableCommand {
  let current = copies;
  return {
    label: copies.length > 1 ? 'Duplicate Cards' : 'Duplicate Card',
    async undo() {
      const ids = current.map((c) => c.placement.id);
      await invokeSafe<DeleteEffect>('delete_placements', { ids });
      for (const c of current) {
        canvasStore.removePlacement(c.placement.id);
        canvasStore.removeItem(c.item.id);
      }
    },
    async redo() {
      const restored: PlacementWithItem[] = [];
      for (const c of current) {
        const card = await invokeSafe<PlacementWithItem>('restore_card', {
          canvasId: c.placement.canvas_id,
          x: c.placement.x,
          y: c.placement.y,
          width: c.placement.width,
          height: c.placement.height,
          zOrder: c.placement.z_order,
          kind: c.item.kind,
          payload: c.item.payload,
        });
        canvasStore.upsertCard(card);
        restored.push(card);
      }
      current = restored;
    },
  };
}
