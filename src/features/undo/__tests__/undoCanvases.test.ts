/**
 * The three canvas undo commands. What matters is that each writes through the same command
 * the forward action used, and that a restored canvas's new ids are adopted so a following
 * redo names rows that actually exist.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Canvas, CanvasDeleteEffect } from '../../../lib/types';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({ invokeSafe, IpcError: class extends Error {} }));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { createCanvasCommand, deleteCanvasCommand, renameCanvasCommand } =
  await import('../commands');

function canvas(id: number, name: string): Canvas {
  return {
    id,
    project_id: 1,
    name,
    sort_order: 1,
    view_x: 0,
    view_y: 0,
    view_zoom: 1,
    created_at: '',
    updated_at: '',
  };
}

function effectFor(id: number): CanvasDeleteEffect {
  return {
    canvas: canvas(id, 'Hull studies'),
    placements: [
      { id: 100, canvas_id: id, item_id: 200, x: 0, y: 0, width: 240, height: 140, z_order: 0 },
    ],
    items: [
      {
        id: 200,
        project_id: 1,
        kind: 'note',
        payload: '{"title":"Frames","text":""}',
        created_at: '',
        updated_at: '',
      },
    ],
    connections: [
      {
        id: 300,
        canvas_id: id,
        from_placement_id: 100,
        to_placement_id: 101,
        label: null,
        directed: 1,
      },
    ],
    assets: ['pic.png'],
  };
}

/** The hooks the root supplies, so this module imports no feature. */
function hooks() {
  const calls: string[] = [];
  return {
    calls,
    refresh: async () => {
      calls.push('refresh');
    },
    activate: async (id: number) => {
      calls.push(`activate:${id}`);
    },
  };
}

beforeEach(() => {
  invokeSafe.mockReset();
  canvasStore.closeProject();
  canvasStore.project = { id: 1, name: 'P', created_at: '', updated_at: '' };
  canvasStore.canvases = [canvas(1, 'Canvas 1')];
});

describe('the canvas undo commands', () => {
  it('createCanvasCommand_undo_deletesIt_andRedoAdoptsANewRow', async () => {
    canvasStore.canvases = [canvas(1, 'Canvas 1'), canvas(2, 'Canvas 2')];
    canvasStore.activeCanvasId = 2;
    const h = hooks();
    const command = createCanvasCommand(canvas(2, 'Canvas 2'), h);

    invokeSafe.mockResolvedValue({ canvas: canvas(2, 'Canvas 2') });
    await command.undo();
    // A new canvas is active the moment it is created, so its undo leaves the shell on a
    // canvas that still exists before removing it.
    expect(h.calls).toEqual(['activate:1', 'refresh']);
    expect(invokeSafe).toHaveBeenCalledWith('delete_canvas', { canvasId: 2 });

    // The redo mints a NEW id, which the command adopts.
    invokeSafe.mockResolvedValue(canvas(9, 'Canvas 2'));
    await command.redo();
    expect(invokeSafe).toHaveBeenCalledWith('create_canvas', { projectId: 1, name: 'Canvas 2' });
    expect(h.calls.at(-1)).toBe('activate:9');

    invokeSafe.mockResolvedValue({ canvas: canvas(9, 'Canvas 2') });
    await command.undo();
    expect(invokeSafe).toHaveBeenLastCalledWith('delete_canvas', { canvasId: 9 });
  });

  it('renameCanvasCommand_undo_writesTheOldName', async () => {
    const command = renameCanvasCommand(1, 'Canvas 1', 'Hull studies');

    invokeSafe.mockResolvedValue(canvas(1, 'Canvas 1'));
    await command.undo();
    expect(invokeSafe).toHaveBeenCalledWith('rename_canvas', { canvasId: 1, name: 'Canvas 1' });
    expect(canvasStore.canvases[0].name).toBe('Canvas 1');

    invokeSafe.mockResolvedValue(canvas(1, 'Hull studies'));
    await command.redo();
    expect(invokeSafe).toHaveBeenLastCalledWith('rename_canvas', {
      canvasId: 1,
      name: 'Hull studies',
    });
    expect(canvasStore.canvases[0].name).toBe('Hull studies');
  });

  it('deleteCanvasCommand_undo_callsRestoreCanvasWithTheWholeEffect', async () => {
    const effect = effectFor(2);
    const h = hooks();
    const command = deleteCanvasCommand(effect, h);

    invokeSafe.mockResolvedValue(canvas(7, 'Hull studies'));
    await command.undo();

    // The whole structure goes back, not just the canvas row: the placements, the items, the
    // connections and the asset names are what let Rust restore rows, lines and files together.
    expect(invokeSafe).toHaveBeenCalledWith('restore_canvas', { effect });
    const sent = invokeSafe.mock.calls[0][1].effect as CanvasDeleteEffect;
    expect(sent.placements).toHaveLength(1);
    expect(sent.connections).toHaveLength(1);
    expect(sent.assets).toEqual(['pic.png']);

    // And the restored canvas is made active again.
    expect(h.calls).toEqual(['refresh', 'activate:7']);
  });

  it('deleteCanvasCommand_redoAfterUndo_deletesTheRestoredId', async () => {
    const h = hooks();
    const command = deleteCanvasCommand(effectFor(2), h);

    invokeSafe.mockResolvedValue(canvas(7, 'Hull studies'));
    await command.undo();

    // The restore minted id 7, so the redo must delete 7 and not the original 2.
    invokeSafe.mockResolvedValue(effectFor(7));
    await command.redo();
    expect(invokeSafe).toHaveBeenLastCalledWith('delete_canvas', { canvasId: 7 });

    // And the second undo sends the effect the redo just came back with.
    invokeSafe.mockResolvedValue(canvas(12, 'Hull studies'));
    await command.undo();
    const second = invokeSafe.mock.calls.at(-1)![1].effect as CanvasDeleteEffect;
    expect(second.canvas.id).toBe(7);
  });

  it('deleteCanvasCommand_label_isTitleCase', () => {
    expect(deleteCanvasCommand(effectFor(2), hooks()).label).toBe('Delete Canvas');
    expect(createCanvasCommand(canvas(2, 'Canvas 2'), hooks()).label).toBe('New Canvas');
    expect(renameCanvasCommand(1, 'a', 'b').label).toBe('Rename Canvas');
  });
});
