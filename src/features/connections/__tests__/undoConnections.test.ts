/**
 * Milestone 4's checkpoint: undo composing across three tables, and the id remapping that
 * keeps a restored line pointing at the card it was drawn from. `restore_card` mints a new
 * placement id, so this is the subtlest correctness risk in the phase.
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

    // A re-created connection takes a NEW id, exactly as a re-created card does.
    invokeSafe.mockResolvedValueOnce(connection({ id: 21 }));
    await command.redo();
    expect(canvasStore.connections.has(21)).toBe(true);
    expect(canvasStore.connections.get(21)?.label).toBe('causes');

    // A second undo must reach the id the redo actually minted, not the dead one.
    invokeSafe.mockResolvedValueOnce([]);
    await command.undo();
    expect(invokeSafe).toHaveBeenLastCalledWith('delete_connections', { ids: [21] });
  });
});

describe('editConnectionCommand', () => {
  it('editConnectionCommand_undone_restoresTheEarlierLabelAndDirection', async () => {
    const command = editConnectionCommand(
      7,
      { label: 'causes', directed: 1 },
      { label: 'blocks', directed: 3 },
    );

    invokeSafe.mockResolvedValueOnce(connection({ label: 'causes', directed: 1 }));
    await command.undo();
    expect(invokeSafe).toHaveBeenCalledWith('update_connection', {
      connectionId: 7,
      label: 'causes',
      directed: 1,
    });
    expect(canvasStore.connections.get(7)?.directed).toBe(1);

    invokeSafe.mockResolvedValueOnce(connection({ label: 'blocks', directed: 3 }));
    await command.redo();
    expect(canvasStore.connections.get(7)?.label).toBe('blocks');
    expect(canvasStore.connections.get(7)?.directed).toBe(3);
  });
});

describe('deleteConnectionsCommand', () => {
  it('deleteConnectionsCommand_undone_putsTheRowBackWithItsLabelAndDirection', async () => {
    canvasStore.upsertPlacement(placement(1));
    canvasStore.upsertPlacement(placement(2));
    const command = deleteConnectionsCommand([connection({ directed: 2 })]);

    invokeSafe.mockResolvedValueOnce(connection({ id: 30, directed: 2 }));
    await command.undo();
    expect(invokeSafe).toHaveBeenCalledWith('create_connection', {
      canvasId: 1,
      fromPlacementId: 1,
      toPlacementId: 2,
      label: 'causes',
      directed: 2,
    });
    expect(canvasStore.connections.get(30)?.directed).toBe(2);
  });

  it('deleteConnectionsCommand_undoneWhenAnEndpointIsGone_skipsTheRow', async () => {
    canvasStore.upsertPlacement(placement(1));
    const command = deleteConnectionsCommand([connection()]);
    await command.undo();
    expect(invokeSafe).not.toHaveBeenCalled();
  });
});

describe('deleteCardsCommand with connections', () => {
  it('deleteCardsCommand_undone_restoresTheCardAndItsConnectionsRemappedToTheNewPlacementIds', async () => {
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
    });

    // restore_card mints id 55, not 2.
    invokeSafe.mockResolvedValueOnce({ placement: { ...placement(2), id: 55 }, item: item(2) });
    invokeSafe.mockResolvedValueOnce(
      connection({ id: 70, from_placement_id: 1, to_placement_id: 55, label: 'a', directed: 1 }),
    );
    invokeSafe.mockResolvedValueOnce(
      connection({ id: 80, from_placement_id: 55, to_placement_id: 3, label: 'b', directed: 3 }),
    );

    await command.undo();

    const calls = invokeSafe.mock.calls;
    expect(calls[0][0]).toBe('restore_card');
    // Both lines were re-created against the NEW placement id, not the dead one.
    expect(calls[1]).toEqual([
      'create_connection',
      { canvasId: 1, fromPlacementId: 1, toPlacementId: 55, label: 'a', directed: 1 },
    ]);
    expect(calls[2]).toEqual([
      'create_connection',
      { canvasId: 1, fromPlacementId: 55, toPlacementId: 3, label: 'b', directed: 3 },
    ]);
    expect(canvasStore.placements.has(55)).toBe(true);
    expect(canvasStore.connections.size).toBe(2);
    expect(canvasStore.connections.get(70)?.label).toBe('a');
    expect(canvasStore.connections.get(80)?.directed).toBe(3);
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
    });

    invokeSafe.mockResolvedValueOnce({ placement: { ...placement(2), id: 55 }, item: item(2) });
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
    };
    for (const p of effect.placements) canvasStore.removePlacement(p.id);
    for (const i of effect.items) canvasStore.removeItem(i.id);
    for (const c of effect.connections) canvasStore.removeConnection(c.id);
    expect(canvasStore.connections.size).toBe(0);

    const command = deleteCardsCommand(effect);

    invokeSafe.mockResolvedValueOnce({ placement: { ...placement(2), id: 55 }, item: item(2) });
    invokeSafe.mockResolvedValueOnce(
      connection({ id: 70, from_placement_id: 1, to_placement_id: 55 }),
    );
    invokeSafe.mockResolvedValueOnce(
      connection({ id: 80, from_placement_id: 55, to_placement_id: 3 }),
    );
    await command.undo();
    expect(canvasStore.placements.has(55)).toBe(true);
    expect(canvasStore.connections.size).toBe(2);

    invokeSafe.mockResolvedValueOnce({
      placements: [{ ...placement(2), id: 55 }],
      items: [item(2)],
      connections: [
        connection({ id: 70, from_placement_id: 1, to_placement_id: 55 }),
        connection({ id: 80, from_placement_id: 55, to_placement_id: 3 }),
      ],
    });
    await command.redo();
    expect(canvasStore.placements.has(55)).toBe(false);
    expect(canvasStore.connections.size).toBe(0);
  });
});
