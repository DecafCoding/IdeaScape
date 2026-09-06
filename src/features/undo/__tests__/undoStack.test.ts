import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UndoableCommand } from '../commands';

vi.mock('../../../lib/logger', () => ({ logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }));

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
}));

const { undoStack } = await import('../undoStack.svelte');
const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { deleteCardsCommand, updatePlacementsCommand } = await import('../commands');

/** A command that records what happened, so the stack's own behaviour is what is tested. */
function tracked(label: string, log: string[]): UndoableCommand {
  return {
    label,
    async undo() {
      log.push(`undo:${label}`);
    },
    async redo() {
      log.push(`redo:${label}`);
    },
  };
}

describe('undoStack', () => {
  beforeEach(() => {
    undoStack.clear();
    invokeSafe.mockReset();
    canvasStore.closeProject();
  });

  it('undo_thenRedo_returnsTheStackToWhereItStarted', async () => {
    const log: string[] = [];
    undoStack.push(tracked('One', log));
    await undoStack.undo();
    await undoStack.redo();
    expect(log).toEqual(['undo:One', 'redo:One']);
    expect(undoStack.undoDepth).toBe(1);
    expect(undoStack.redoDepth).toBe(0);
  });

  it('push_afterAnUndo_clearsTheRedoStack', async () => {
    const log: string[] = [];
    undoStack.push(tracked('One', log));
    await undoStack.undo();
    expect(undoStack.redoDepth).toBe(1);

    undoStack.push(tracked('Two', log));
    expect(undoStack.redoDepth).toBe(0);
  });

  it('undo_anEmptyStack_isASafeNoOp', async () => {
    await expect(undoStack.undo()).resolves.toBeUndefined();
    expect(undoStack.undoDepth).toBe(0);
    expect(undoStack.redoDepth).toBe(0);
  });

  it('redo_anEmptyStack_isASafeNoOp', async () => {
    await expect(undoStack.redo()).resolves.toBeUndefined();
    expect(undoStack.redoDepth).toBe(0);
  });

  it('undo_severalActions_appliesThemInReverseOrder', async () => {
    const log: string[] = [];
    undoStack.push(tracked('One', log));
    undoStack.push(tracked('Two', log));
    await undoStack.undo();
    await undoStack.undo();
    expect(log).toEqual(['undo:Two', 'undo:One']);
  });

  it('clear_onProjectClose_emptiesBothStacks', async () => {
    const log: string[] = [];
    undoStack.push(tracked('One', log));
    await undoStack.undo();
    undoStack.clear();
    expect(undoStack.undoDepth).toBe(0);
    expect(undoStack.redoDepth).toBe(0);
  });

  it('undo_aStepThatFails_leavesTheCommandOnTheUndoStack', async () => {
    undoStack.push({
      label: 'Fails',
      undo: () => Promise.reject(new Error('the write failed')),
      redo: () => Promise.resolve(),
    });
    await undoStack.undo();
    expect(undoStack.undoDepth).toBe(1);
    expect(undoStack.redoDepth).toBe(0);
  });

  it('nextUndoLabel_reportsTheActionTheHistoryRowWouldReverse', () => {
    undoStack.push(tracked('Move Cards', []));
    expect(undoStack.nextUndoLabel).toBe('Move Cards');
  });
});

describe('inverse commands', () => {
  beforeEach(() => {
    undoStack.clear();
    invokeSafe.mockReset();
    canvasStore.closeProject();
  });

  it('deleteCardsCommand_undone_restoresThePlacementAndItsItemTogether', async () => {
    const placement = {
      id: 5,
      canvas_id: 1,
      item_id: 9,
      x: 10,
      y: 20,
      width: 236,
      height: 150,
      z_order: 2,
    };
    const item = {
      id: 9,
      project_id: 1,
      kind: 'note' as const,
      payload: '{"title":"T","text":"b"}',
      created_at: '',
      updated_at: '',
    };

    invokeSafe.mockResolvedValue({
      placement: { ...placement, id: 55 },
      item: { ...item, id: 99 },
    });

    const command = deleteCardsCommand({ placements: [placement], items: [item], connections: [] });
    await command.undo();

    // One restore_card call carried both rows — the item and the placement come back
    // together, as one step.
    expect(invokeSafe).toHaveBeenCalledTimes(1);
    expect(invokeSafe.mock.calls[0][0]).toBe('restore_card');
    expect(canvasStore.placements.has(55)).toBe(true);
    expect(canvasStore.items.has(99)).toBe(true);
  });

  it('updatePlacementsCommand_aMultiCardMove_undoesAsOneStepNotOnePerCard', async () => {
    const before = [1, 2, 3].map((id) => ({
      id,
      canvas_id: 1,
      item_id: id,
      x: 0,
      y: 0,
      width: 236,
      height: 150,
      z_order: id,
    }));
    const after = before.map((p) => ({ ...p, x: 500 }));
    for (const p of after) canvasStore.upsertPlacement(p);

    invokeSafe.mockResolvedValue(undefined);
    const command = updatePlacementsCommand('Move Cards', before, after);
    await command.undo();

    expect(invokeSafe).toHaveBeenCalledTimes(1);
    const [name, args] = invokeSafe.mock.calls[0];
    expect(name).toBe('update_placements');
    expect((args as { updates: unknown[] }).updates).toHaveLength(3);
    expect(canvasStore.placements.get(1)?.x).toBe(0);
    expect(canvasStore.placements.get(3)?.x).toBe(0);
  });

  it('updatePlacementsCommand_redone_putsTheCardsBackWhereTheDragLeftThem', async () => {
    const before = [
      { id: 1, canvas_id: 1, item_id: 1, x: 0, y: 0, width: 236, height: 150, z_order: 0 },
    ];
    const after = [{ ...before[0], x: 400, y: 300 }];
    canvasStore.upsertPlacement(before[0]);

    invokeSafe.mockResolvedValue(undefined);
    const command = updatePlacementsCommand('Move Cards', before, after);
    await command.redo();

    expect(canvasStore.placements.get(1)?.x).toBe(400);
    expect(canvasStore.placements.get(1)?.y).toBe(300);
  });
});
