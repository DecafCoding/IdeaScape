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
import { assetStatus, refreshAssetStatuses } from '../../lib/assets';
import { logWarn } from '../../lib/logger';
import { payloadAssetNames } from '../../lib/types';
import { canvasStore } from '../../stores/canvasStore.svelte';
import type {
  Canvas,
  CanvasDeleteEffect,
  Connection,
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
 * Re-create a set of cards from the rows a delete removed, and adopt the new ids.
 *
 * `restore_card` mints a *new* placement id, so a connection restored against the old id
 * would either fail the foreign key or attach to the wrong card. The old-id → new-id map
 * built here is what keeps the lines pointing at the cards they were drawn between. A
 * connection whose endpoint card stayed deleted is skipped rather than re-created against
 * a dead id.
 *
 * It returns the rows it actually created, because every id in them is new: a caller that
 * kept the original effect and redid the delete against it would be naming rows that no
 * longer exist, and the redo would silently do nothing.
 */
async function restoreCards(
  placements: Placement[],
  items: Item[],
  connections: Connection[] = [],
): Promise<DeleteEffect> {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const idMap = new Map<number, number>();
  const restoredEffect: DeleteEffect = { placements: [], items: [], connections: [], assets: [] };
  const restoredAssetNames: string[] = [];

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
    idMap.set(placement.id, restored.placement.id);
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
    const from = resolveEndpoint(connection.from_placement_id, idMap);
    const to = resolveEndpoint(connection.to_placement_id, idMap);
    if (from === null || to === null) continue;
    const restored = await invokeSafe<Connection>('create_connection', {
      canvasId: connection.canvas_id,
      fromPlacementId: from,
      toPlacementId: to,
      label: connection.label,
      directed: connection.directed,
    });
    canvasStore.upsertConnection(restored);
    restoredEffect.connections.push(restored);
  }

  return restoredEffect;
}

/** The live placement id for an endpoint: the one just restored, or one still on the canvas. */
function resolveEndpoint(oldId: number, idMap: Map<number, number>): number | null {
  const remapped = idMap.get(oldId);
  if (remapped !== undefined) return remapped;
  return canvasStore.placements.has(oldId) ? oldId : null;
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
 * Deleting a selection. `effect` names every row the backend actually removed — the
 * placements, the items the delete orphaned, the connections the cascade took, and the
 * asset files no remaining payload still named — so all of it comes back as one step. The
 * files come back because `restore_card` untrashes them in Rust, not because anything here
 * carries bytes.
 */
export function deleteCardsCommand(effect: DeleteEffect): UndoableCommand {
  let current = effect;
  return {
    label: current.placements.length > 1 ? 'Delete Cards' : 'Delete Card',
    async undo() {
      // Adopt the restored rows: every id in them is new, and the next redo must delete
      // the placements that now exist rather than the ones it originally removed.
      current = await restoreCards(current.placements, current.items, current.connections);
    },
    async redo() {
      const ids = current.placements.map((p) => p.id);
      current = await invokeSafe<DeleteEffect>('delete_placements', { ids });
      for (const p of current.placements) canvasStore.removePlacement(p.id);
      for (const i of current.items) canvasStore.removeItem(i.id);
      for (const c of current.connections) canvasStore.removeConnection(c.id);
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

// --- connections --------------------------------------------------------

/** Drawing one line. Undo deletes it; redo re-creates it and adopts the new id. */
export function createConnectionCommand(connection: Connection): UndoableCommand {
  let current = connection;
  return {
    label: 'Connect Cards',
    async undo() {
      await invokeSafe<Connection[]>('delete_connections', { ids: [current.id] });
      canvasStore.removeConnection(current.id);
    },
    async redo() {
      const restored = await invokeSafe<Connection>('create_connection', {
        canvasId: current.canvas_id,
        fromPlacementId: current.from_placement_id,
        toPlacementId: current.to_placement_id,
        label: current.label,
        directed: current.directed,
      });
      current = restored;
      canvasStore.upsertConnection(restored);
    },
  };
}

/** Deleting connections directly, rather than as a side effect of deleting a card. */
export function deleteConnectionsCommand(removed: Connection[]): UndoableCommand {
  let current = removed;
  return {
    label: 'Delete Connection',
    async undo() {
      const restored: Connection[] = [];
      for (const c of current) {
        // An endpoint that has since gone would fail the foreign key; skip it instead.
        if (!canvasStore.placements.has(c.from_placement_id)) continue;
        if (!canvasStore.placements.has(c.to_placement_id)) continue;
        const row = await invokeSafe<Connection>('create_connection', {
          canvasId: c.canvas_id,
          fromPlacementId: c.from_placement_id,
          toPlacementId: c.to_placement_id,
          label: c.label,
          directed: c.directed,
        });
        canvasStore.upsertConnection(row);
        restored.push(row);
      }
      current = restored;
    },
    async redo() {
      const ids = current.map((c) => c.id);
      await invokeSafe<Connection[]>('delete_connections', { ids });
      for (const id of ids) canvasStore.removeConnection(id);
    },
  };
}

/** Changing a connection's label or its arrow direction. Pushed on commit, not per keystroke. */
export function editConnectionCommand(
  connectionId: number,
  before: { label: string | null; directed: number },
  after: { label: string | null; directed: number },
): UndoableCommand {
  async function write(state: { label: string | null; directed: number }) {
    const row = await invokeSafe<Connection>('update_connection', {
      connectionId,
      label: state.label,
      directed: state.directed,
    });
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
  let current = canvas;
  return {
    label: 'New Canvas',
    async undo() {
      const sibling = canvasStore.canvases.find((c) => c.id !== current.id);
      if (sibling && current.id === canvasStore.activeCanvasId) await hooks.activate(sibling.id);
      await invokeSafe<CanvasDeleteEffect>('delete_canvas', { canvasId: current.id });
      await hooks.refresh();
    },
    async redo() {
      // A new row, with a new id: nothing may assume the old one came back.
      current = await invokeSafe<Canvas>('create_canvas', {
        projectId: current.project_id,
        name: current.name,
      });
      await hooks.refresh();
      await hooks.activate(current.id);
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
 * The `let current = effect` re-adoption is mandatory: every id in a restored effect is new,
 * so a redo against the original effect would name rows that no longer exist.
 */
export function deleteCanvasCommand(
  effect: CanvasDeleteEffect,
  hooks: CanvasCommandHooks,
): UndoableCommand {
  let current = effect;
  return {
    label: 'Delete Canvas',
    async undo() {
      const restored = await invokeSafe<Canvas>('restore_canvas', { effect: current });
      await hooks.refresh();
      await hooks.activate(restored.id);
      // Re-read the effect against the restored ids, so a following redo deletes what exists.
      current = {
        ...current,
        canvas: restored,
      };
    },
    async redo() {
      current = await invokeSafe<CanvasDeleteEffect>('delete_canvas', {
        canvasId: current.canvas.id,
      });
      await hooks.refresh();
    },
  };
}
