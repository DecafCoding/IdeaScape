/**
 * The inverse commands. Undo is a stack of these, not a stack of snapshots — copying 250
 * cards of state per action is too much memory (architecture §7, undo-model).
 *
 * One command may carry several effects: undoing a delete restores the placements, the
 * items they orphaned and their asset files, together, as one step. The asset half is real
 * from Phase 3: `restore_card` untrashes every asset a payload names before the item row
 * goes back, so a restored card is never on the canvas pointing at a file still in the
 * trash, and `DeleteEffect.assets` names what the delete actually moved out.
 *
 * Every command writes through the same commands the forward action used, so an undone
 * delete is genuinely back on disk and not only back in memory.
 */
import { invokeSafe } from '../../lib/ipc';
import { assetStatus, refreshAssetStatuses } from '../../lib/assets.svelte';
import { logWarn } from '../../lib/logger';
import { payloadAssetNames } from '../../lib/types';
import { canvasStore } from '../../stores/canvasStore.svelte';
import type {
  Canvas,
  CanvasDeleteEffect,
  Connection,
  ConnectionEdit,
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

/**
 * Re-create a set of cards from the rows a delete removed.
 *
 * Every row goes back under the id it had. Ids are `AUTOINCREMENT` in SQLite and are never
 * handed out twice, so an id a delete freed is always still free — and keeping it is what
 * leaves the *other* commands on the stack valid. A move, an edit or a line recorded against
 * placement 5 still names placement 5 after the restore; minting a new id there is what used
 * to make the second redo fail and freeze the whole redo stack.
 *
 * A connection whose endpoint card is not on the canvas is skipped rather than restored
 * against a card that is not there.
 */
async function restoreCards(
  placements: Placement[],
  items: Item[],
  connections: Connection[] = [],
): Promise<DeleteEffect> {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const restoredEffect: DeleteEffect = { placements: [], items: [], connections: [], assets: [] };
  const restoredAssetNames: string[] = [];

  for (const placement of placements) {
    const item = itemById.get(placement.item_id) ?? canvasStore.items.get(placement.item_id);
    if (!item) continue;
    const restored = await invokeSafe<PlacementWithItem>('restore_card', {
      canvasId: placement.canvas_id,
      placementId: placement.id,
      itemId: item.id,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      zOrder: placement.z_order,
      kind: item.kind,
      payload: item.payload,
    });
    canvasStore.upsertCard(restored);
    restoredEffect.placements.push(restored.placement);
    restoredEffect.items.push(restored.item);
    restoredAssetNames.push(...payloadAssetNames(restored.item.kind, restored.item.payload));
  }

  // Re-check the restored assets and report an untrash that did not bring a file back. A
  // missing picture is a drawn card state, so it must never fail the undo.
  if (restoredAssetNames.length > 0) {
    await refreshAssetStatuses(restoredAssetNames);
    for (const name of restoredAssetNames) {
      if (!assetStatus(name).exists) {
        logWarn(`the restored card's picture ${name} did not come back into assets/`);
      }
    }
    restoredEffect.assets = restoredAssetNames;
  }

  for (const connection of connections) {
    // An endpoint whose card stayed deleted would fail the foreign key; skip that line.
    if (!canvasStore.placements.has(connection.from_placement_id)) continue;
    if (!canvasStore.placements.has(connection.to_placement_id)) continue;
    const restored = await invokeSafe<Connection>('restore_connection', { connection });
    canvasStore.upsertConnection(restored);
    restoredEffect.connections.push(restored);
  }

  return restoredEffect;
}

/** Creating one card. Undo deletes it; redo puts it back under the same ids. */
export function createCardCommand(card: PlacementWithItem): UndoableCommand {
  return {
    label: 'New Note',
    async undo() {
      await invokeSafe<DeleteEffect>('delete_placements', { ids: [card.placement.id] });
      canvasStore.removePlacement(card.placement.id);
      canvasStore.removeItem(card.item.id);
    },
    async redo() {
      const restored = await invokeSafe<PlacementWithItem>('restore_card', {
        canvasId: card.placement.canvas_id,
        placementId: card.placement.id,
        itemId: card.item.id,
        x: card.placement.x,
        y: card.placement.y,
        width: card.placement.width,
        height: card.placement.height,
        zOrder: card.placement.z_order,
        kind: card.item.kind,
        payload: card.item.payload,
      });
      canvasStore.upsertCard(restored);
    },
  };
}

/**
 * Deleting a selection. `effect` names every row the backend actually removed — the
 * placements, the items the delete orphaned, the connections the cascade took, and the
 * asset files no remaining payload still named — so all of it comes back as one step. The
 * files come back because `restore_card` untrashes them in Rust, not because anything here
 * carries bytes.
 */
export function deleteCardsCommand(effect: DeleteEffect): UndoableCommand {
  return {
    label: effect.placements.length > 1 ? 'Delete Cards' : 'Delete Card',
    async undo() {
      await restoreCards(effect.placements, effect.items, effect.connections);
    },
    async redo() {
      // `effect` still names live rows however many times this command is undone and redone,
      // because a restore puts every id back. What the delete *reports* is still what leaves
      // the store: the cascade decides which lines and orphaned items actually went.
      const ids = effect.placements.map((p) => p.id);
      const removed = await invokeSafe<DeleteEffect>('delete_placements', { ids });
      for (const p of removed.placements) canvasStore.removePlacement(p.id);
      for (const i of removed.items) canvasStore.removeItem(i.id);
      for (const c of removed.connections) canvasStore.removeConnection(c.id);
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

/** Duplicating a selection. Undo removes the copies; redo puts them back under the same ids. */
export function duplicateCommand(copies: PlacementWithItem[]): UndoableCommand {
  return {
    label: copies.length > 1 ? 'Duplicate Cards' : 'Duplicate Card',
    async undo() {
      const ids = copies.map((c) => c.placement.id);
      await invokeSafe<DeleteEffect>('delete_placements', { ids });
      for (const c of copies) {
        canvasStore.removePlacement(c.placement.id);
        canvasStore.removeItem(c.item.id);
      }
    },
    async redo() {
      for (const c of copies) {
        const card = await invokeSafe<PlacementWithItem>('restore_card', {
          canvasId: c.placement.canvas_id,
          placementId: c.placement.id,
          itemId: c.item.id,
          x: c.placement.x,
          y: c.placement.y,
          width: c.placement.width,
          height: c.placement.height,
          zOrder: c.placement.z_order,
          kind: c.item.kind,
          payload: c.item.payload,
        });
        canvasStore.upsertCard(card);
      }
    },
  };
}

// --- connections --------------------------------------------------------

/** Drawing one line. Undo deletes it; redo re-creates it under the same id. */
export function createConnectionCommand(connection: Connection): UndoableCommand {
  return {
    label: 'Connect Cards',
    async undo() {
      await invokeSafe<Connection[]>('delete_connections', { ids: [connection.id] });
      canvasStore.removeConnection(connection.id);
    },
    async redo() {
      const restored = await invokeSafe<Connection>('restore_connection', { connection });
      canvasStore.upsertConnection(restored);
    },
  };
}

/** Deleting connections directly, rather than as a side effect of deleting a card. */
export function deleteConnectionsCommand(removed: Connection[]): UndoableCommand {
  return {
    label: 'Delete Connection',
    async undo() {
      for (const connection of removed) {
        // An endpoint that has since gone would fail the foreign key; skip it instead.
        if (!canvasStore.placements.has(connection.from_placement_id)) continue;
        if (!canvasStore.placements.has(connection.to_placement_id)) continue;
        const row = await invokeSafe<Connection>('restore_connection', { connection });
        canvasStore.upsertConnection(row);
      }
    },
    async redo() {
      const ids = removed.map((c) => c.id);
      await invokeSafe<Connection[]>('delete_connections', { ids });
      for (const id of ids) canvasStore.removeConnection(id);
    },
  };
}

/**
 * Changing a connection's label, arrow direction, colour, width, route, chip visibility or
 * either anchor. Pushed on commit, not per keystroke — and every field travels together in
 * one `ConnectionEdit`, because one command writes them all.
 */
export function editConnectionCommand(
  connectionId: number,
  before: ConnectionEdit,
  after: ConnectionEdit,
): UndoableCommand {
  async function write(state: ConnectionEdit) {
    const row = await invokeSafe<Connection>('update_connection', { connectionId, ...state });
    canvasStore.upsertConnection(row);
  }
  return {
    label: 'Edit Connection',
    undo: () => write(before),
    redo: () => write(after),
  };
}

// --- canvases ---------------------------------------------------------------
//
// These three deliberately do *not* reuse `restoreCards`. That helper writes into
// `canvasStore.placements`, which holds the ACTIVE canvas — and the canvas being restored is
// never the active one, because deleting the active canvas switches away from it first.
// Restoring through Rust keeps the active canvas's store untouched and the whole restore in
// one transaction.

/**
 * What the root hands the canvas commands, so this file imports no feature: re-listing the
 * canvases, and making one active (which also flushes whatever the outgoing one owes).
 */
export interface CanvasCommandHooks {
  refresh: () => Promise<unknown>;
  activate: (canvasId: number) => Promise<void>;
}

/**
 * Adding a canvas. Undo switches away from it first and then removes it; redo re-creates it,
 * adopts the new row and makes it active again.
 *
 * A new canvas is made active the moment it is created, so its undo has to leave the shell on
 * a canvas that still exists — the same rule the delete follows.
 */
export function createCanvasCommand(canvas: Canvas, hooks: CanvasCommandHooks): UndoableCommand {
  // An empty effect: the canvas was only ever created, so it holds no cards of its own.
  const effect: CanvasDeleteEffect = {
    canvas,
    placements: [],
    items: [],
    connections: [],
    assets: [],
  };
  return {
    label: 'New Canvas',
    async undo() {
      const sibling = canvasStore.canvases.find((c) => c.id !== canvas.id);
      if (sibling && canvas.id === canvasStore.activeCanvasId) await hooks.activate(sibling.id);
      await invokeSafe<CanvasDeleteEffect>('delete_canvas', { canvasId: canvas.id });
      await hooks.refresh();
    },
    async redo() {
      // `restore_canvas`, not `create_canvas`: the row has to come back under its own id, or
      // a rename or a delete of this canvas further up the stack would name a row that has
      // gone.
      await invokeSafe<Canvas>('restore_canvas', { effect });
      await hooks.refresh();
      await hooks.activate(canvas.id);
    },
  };
}

/** Renaming a canvas. Pushed on commit, not per keystroke. */
export function renameCanvasCommand(
  canvasId: number,
  before: string,
  after: string,
): UndoableCommand {
  async function write(name: string) {
    const row = await invokeSafe<Canvas>('rename_canvas', { canvasId, name });
    canvasStore.canvases = canvasStore.canvases.map((c) => (c.id === canvasId ? row : c));
  }
  return {
    label: 'Rename Canvas',
    undo: () => write(before),
    redo: () => write(after),
  };
}

/**
 * Deleting a canvas. `effect` names the canvas row, every placement on it, the items it
 * orphaned, the connections the cascade took and the asset files no remaining payload named,
 * so `Ctrl+Z` brings all of it back together and the restored lines join the cards they were
 * drawn between.
 *
 * Every row is restored under its own id, so the effect stays true however many times this
 * command is undone and redone.
 */
export function deleteCanvasCommand(
  effect: CanvasDeleteEffect,
  hooks: CanvasCommandHooks,
): UndoableCommand {
  return {
    label: 'Delete Canvas',
    async undo() {
      await invokeSafe<Canvas>('restore_canvas', { effect });
      await hooks.refresh();
      await hooks.activate(effect.canvas.id);
    },
    async redo() {
      await invokeSafe<CanvasDeleteEffect>('delete_canvas', { canvasId: effect.canvas.id });
      await hooks.refresh();
    },
  };
}
