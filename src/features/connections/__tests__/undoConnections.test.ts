/**
 * Milestone 4's checkpoint: undo composing across three tables, and the id rule that keeps a
 * restored line pointing at the card it was drawn from. A restore puts every row back under
 * the id it had — ids are `AUTOINCREMENT` and never re-issued — which is what leaves the
 * rest of the stack naming rows that exist.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Connection, Item, Placement } from '../../../lib/types';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
}));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const {
  createConnectionCommand,
  deleteCardsCommand,
  deleteConnectionsCommand,
  editConnectionCommand,
} = await import('../../undo/commands');

function placement(id: number, itemId = id): Placement {
  return {
    id,
    canvas_id: 1,
    item_id: itemId,
    x: id * 400,
    y: 0,
    width: 100,
    height: 100,
    z_order: id,
  };
}

function item(id: number): Item {
  return {
    id,
    project_id: 1,
    kind: 'note',
    payload: `{"title":"Card ${id}","text":""}`,
    created_at: '',
    updated_at: '',
  };
}

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 7,
    canvas_id: 1,
    from_placement_id: 1,
    to_placement_id: 2,
    label: 'causes',
    directed: 1,
    color: 'default',
    width: 1,
    label_visible: true,
    ...overrides,
  };
}

beforeEach(() => {
  invokeSafe.mockReset();
  canvasStore.closeProject();
});

describe('createConnectionCommand', () => {
  it('createConnectionCommand_undone_deletesTheRowAndRedoneRecreatesIt', async () => {
    const original = connection();
    canvasStore.upsertConnection(original);
    const command = createConnectionCommand(original);

    invokeSafe.mockResolvedValueOnce([original]);
    await command.undo();
    expect(invokeSafe).toHaveBeenCalledWith('delete_connections', { ids: [7] });
    expect(canvasStore.connections.has(7)).toBe(false);

    // The line comes back under its own id, so an edit of connection 7 further up the stack
    // still names a row that exists.
    invokeSafe.mockResolvedValueOnce(connection());
    await command.redo();
    expect(invokeSafe).toHaveBeenLastCalledWith('restore_connection', { connection: original });
    expect(canvasStore.connections.get(7)?.label).toBe('causes');

    // And every round after that names the same id.
    invokeSafe.mockResolvedValueOnce([]);
    await command.undo();
    expect(invokeSafe).toHaveBeenLastCalledWith('delete_connections', { ids: [7] });
  });
});

describe('editConnectionCommand', () => {
  it('editConnectionCommand_undone_restoresTheEarlierLabelDirectionAndAppearance', async () => {
    const command = editConnectionCommand(
      7,
      { label: 'causes', directed: 1, color: 'default', width: 1, labelVisible: true },
      { label: 'blocks', directed: 3, color: 'red', width: 3, labelVisible: false },
    );

    invokeSafe.mockResolvedValueOnce(connection({ label: 'causes', directed: 1 }));
    await command.undo();
    expect(invokeSafe).toHaveBeenCalledWith('update_connection', {
      connectionId: 7,
      label: 'causes',
      directed: 1,
      color: 'default',
      width: 1,
      labelVisible: true,
    });
    expect(canvasStore.connections.get(7)?.directed).toBe(1);

    invokeSafe.mockResolvedValueOnce(
      connection({ label: 'blocks', directed: 3, color: 'red', width: 3, label_visible: false }),
    );
    await command.redo();
    expect(canvasStore.connections.get(7)?.label).toBe('blocks');
    expect(canvasStore.connections.get(7)?.directed).toBe(3);
    expect(canvasStore.connections.get(7)?.color).toBe('red');
    expect(canvasStore.connections.get(7)?.width).toBe(3);
    expect(canvasStore.connections.get(7)?.label_visible).toBe(false);
  });
});

describe('deleteConnectionsCommand', () => {
  it('deleteConnectionsCommand_undone_putsTheRowBackWithItsLabelAndDirection', async () => {
    canvasStore.upsertPlacement(placement(1));
    canvasStore.upsertPlacement(placement(2));
    const removed = connection({ directed: 2 });
    const command = deleteConnectionsCommand([removed]);

    invokeSafe.mockResolvedValueOnce(removed);
    await command.undo();
    expect(invokeSafe).toHaveBeenCalledWith('restore_connection', { connection: removed });
    expect(canvasStore.connections.get(7)?.directed).toBe(2);
  });

  it('deleteConnectionsCommand_undoneWhenAnEndpointIsGone_skipsTheRow', async () => {
    canvasStore.upsertPlacement(placement(1));
    const command = deleteConnectionsCommand([connection()]);
    await command.undo();
    expect(invokeSafe).not.toHaveBeenCalled();
  });
});

describe('deleteCardsCommand with connections', () => {
  it('deleteCardsCommand_undone_restoresTheCardAndItsConnectionsUnderTheirOwnIds', async () => {
    // Card 2 was deleted; cards 1 and 3 are still on the canvas.
    canvasStore.upsertPlacement(placement(1));
    canvasStore.upsertPlacement(placement(3));
    canvasStore.upsertItem(item(1));
    canvasStore.upsertItem(item(3));

    const command = deleteCardsCommand({
      placements: [placement(2)],
      items: [item(2)],
      connections: [
        connection({ id: 7, from_placement_id: 1, to_placement_id: 2, label: 'a', directed: 1 }),
        connection({ id: 8, from_placement_id: 2, to_placement_id: 3, label: 'b', directed: 3 }),
      ],
      assets: [],
    });

    // The card goes back as placement 2, the id it always had.
    invokeSafe.mockResolvedValueOnce({ placement: placement(2), item: item(2) });
    invokeSafe.mockResolvedValueOnce(
      connection({ id: 7, from_placement_id: 1, to_placement_id: 2, label: 'a', directed: 1 }),
    );
    invokeSafe.mockResolvedValueOnce(
      connection({ id: 8, from_placement_id: 2, to_placement_id: 3, label: 'b', directed: 3 }),
    );

    await command.undo();

    const calls = invokeSafe.mock.calls;
    expect(calls[0][0]).toBe('restore_card');
    // The restore names the ids the delete removed, so the rest of the stack stays valid.
    expect(calls[0][1]).toMatchObject({ placementId: 2, itemId: 2 });
    // Both lines go back under their own ids, pointing at the same two cards as before.
    expect(calls[1][0]).toBe('restore_connection');
    expect(calls[1][1].connection).toMatchObject({
      id: 7,
      from_placement_id: 1,
      to_placement_id: 2,
    });
    expect(calls[2][0]).toBe('restore_connection');
    expect(calls[2][1].connection).toMatchObject({
      id: 8,
      from_placement_id: 2,
      to_placement_id: 3,
    });
    expect(canvasStore.placements.has(2)).toBe(true);
    expect(canvasStore.connections.size).toBe(2);
    expect(canvasStore.connections.get(7)?.label).toBe('a');
    expect(canvasStore.connections.get(8)?.directed).toBe(3);
  });

  it('restoreCards_aConnectionWithOneEndpointStillDeleted_isSkipped', async () => {
    // Card 1 was never restored and is not on the canvas, so its line must not be
    // re-created against a dead id — the foreign key would reject it and the whole undo
    // step would fail.
    canvasStore.upsertPlacement(placement(3));
    canvasStore.upsertItem(item(3));

    const command = deleteCardsCommand({
      placements: [placement(2)],
      items: [item(2)],
      connections: [connection({ id: 7, from_placement_id: 1, to_placement_id: 2 })],
      assets: [],
    });

    invokeSafe.mockResolvedValueOnce({ placement: placement(2), item: item(2) });
    await command.undo();

    expect(invokeSafe).toHaveBeenCalledTimes(1);
    expect(invokeSafe.mock.calls[0][0]).toBe('restore_card');
    expect(canvasStore.connections.size).toBe(0);
  });

  it('deleteCardsCommand_redone_dropsTheReturnedConnectionsFromTheStoreToo', async () => {
    canvasStore.upsertPlacement(placement(1));
    canvasStore.upsertPlacement(placement(2));
    canvasStore.upsertConnection(connection({ id: 7 }));

    const command = deleteCardsCommand({
      placements: [placement(2)],
      items: [item(2)],
      connections: [],
      assets: [],
    });

    invokeSafe.mockResolvedValueOnce({
      placements: [placement(2)],
      items: [item(2)],
      connections: [connection({ id: 7 })],
    });
    await command.redo();

    expect(canvasStore.placements.has(2)).toBe(false);
    expect(canvasStore.connections.has(7)).toBe(false);
  });
});

describe('the composed lifecycle', () => {
  it('session_deleteAConnectedCardUndoRedo_returnsTheStoreEachTime', async () => {
    for (const id of [1, 2, 3]) {
      canvasStore.upsertPlacement(placement(id));
      canvasStore.upsertItem(item(id));
    }
    canvasStore.upsertConnection(connection({ id: 7, from_placement_id: 1, to_placement_id: 2 }));
    canvasStore.upsertConnection(connection({ id: 8, from_placement_id: 2, to_placement_id: 3 }));

    // Delete the middle card: the effect carries both lines.
    const effect = {
      placements: [placement(2)],
      items: [item(2)],
      connections: [
        connection({ id: 7, from_placement_id: 1, to_placement_id: 2 }),
        connection({ id: 8, from_placement_id: 2, to_placement_id: 3 }),
      ],
      assets: [],
    };
    for (const p of effect.placements) canvasStore.removePlacement(p.id);
    for (const i of effect.items) canvasStore.removeItem(i.id);
    for (const c of effect.connections) canvasStore.removeConnection(c.id);
    expect(canvasStore.connections.size).toBe(0);

    const command = deleteCardsCommand(effect);

    invokeSafe.mockResolvedValueOnce({ placement: placement(2), item: item(2) });
    invokeSafe.mockResolvedValueOnce(
      connection({ id: 7, from_placement_id: 1, to_placement_id: 2 }),
    );
    invokeSafe.mockResolvedValueOnce(
      connection({ id: 8, from_placement_id: 2, to_placement_id: 3 }),
    );
    await command.undo();
    expect(canvasStore.placements.has(2)).toBe(true);
    expect(canvasStore.connections.size).toBe(2);

    invokeSafe.mockResolvedValueOnce({
      placements: [placement(2)],
      items: [item(2)],
      connections: [
        connection({ id: 7, from_placement_id: 1, to_placement_id: 2 }),
        connection({ id: 8, from_placement_id: 2, to_placement_id: 3 }),
      ],
    });
    await command.redo();
    expect(canvasStore.placements.has(2)).toBe(false);
    expect(canvasStore.connections.size).toBe(0);

    // A second round is the whole point of the fix: the ids did not drift, so undoing and
    // redoing again names the same rows and does not fail.
    invokeSafe.mockResolvedValueOnce({ placement: placement(2), item: item(2) });
    invokeSafe.mockResolvedValueOnce(
      connection({ id: 7, from_placement_id: 1, to_placement_id: 2 }),
    );
    invokeSafe.mockResolvedValueOnce(
      connection({ id: 8, from_placement_id: 2, to_placement_id: 3 }),
    );
    await command.undo();
    expect(canvasStore.placements.has(2)).toBe(true);
    expect(canvasStore.connections.size).toBe(2);
  });
});
