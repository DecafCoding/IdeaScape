/**
 * The canvas feature state: the name a new canvas gets, the no-op rename, and the delete's
 * re-listing. All writes go through a mocked `invokeSafe`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Canvas } from '../../../lib/types';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({ invokeSafe, IpcError: class extends Error {} }));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { createCanvas, deleteCanvas, nextCanvasName, refreshCanvases, renameCanvas } =
  await import('../canvases.svelte');

function canvas(id: number, name: string, sortOrder = id): Canvas {
  return {
    id,
    project_id: 1,
    name,
    sort_order: sortOrder,
    view_x: 0,
    view_y: 0,
    view_zoom: 1,
    created_at: '',
    updated_at: '',
  };
}

beforeEach(() => {
  invokeSafe.mockReset();
  canvasStore.closeProject();
  canvasStore.project = { id: 1, name: 'P', created_at: '', updated_at: '' };
  canvasStore.canvases = [canvas(1, 'Canvas 1'), canvas(2, 'Canvas 2')];
});

describe('the canvas feature state', () => {
  it('createCanvas_thirdCanvas_isNamedCanvasThree', async () => {
    invokeSafe.mockResolvedValue(canvas(3, 'Canvas 3'));
    const created = await createCanvas();

    expect(invokeSafe).toHaveBeenCalledWith('create_canvas', { projectId: 1, name: 'Canvas 3' });
    expect(created?.name).toBe('Canvas 3');
    expect(canvasStore.canvases.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('nextCanvasName_afterADelete_doesNotReuseAName', () => {
    // Counting rows would give "Canvas 2" here, which already exists.
    expect(nextCanvasName([canvas(1, 'Canvas 1'), canvas(3, 'Canvas 2')])).toBe('Canvas 3');
    expect(nextCanvasName([canvas(9, 'Canvas 9')])).toBe('Canvas 10');
    // A renamed canvas does not take part in the numbering.
    expect(nextCanvasName([canvas(1, 'Hull studies')])).toBe('Canvas 1');
    expect(nextCanvasName([])).toBe('Canvas 1');
  });

  it('renameCanvas_blankName_writesNothing', async () => {
    expect(await renameCanvas(1, '   ')).toBeNull();
    expect(await renameCanvas(1, '')).toBeNull();
    // An unchanged name is also a no-op: committing an untouched edit must not write.
    expect(await renameCanvas(1, 'Canvas 1')).toBeNull();
    expect(invokeSafe).not.toHaveBeenCalled();
  });

  it('renameCanvas_newName_writesAndReportsTheOldOne', async () => {
    invokeSafe.mockResolvedValue(canvas(1, 'Hull studies'));
    const result = await renameCanvas(1, '  Hull studies  ');

    expect(invokeSafe).toHaveBeenCalledWith('rename_canvas', {
      canvasId: 1,
      name: 'Hull studies',
    });
    expect(result?.before).toBe('Canvas 1');
    expect(canvasStore.canvases[0].name).toBe('Hull studies');
  });

  it('deleteCanvas_reListsTheCanvasesAfterwards', async () => {
    const effect = {
      canvas: canvas(2, 'Canvas 2'),
      placements: [],
      items: [],
      connections: [],
      assets: [],
    };
    invokeSafe.mockImplementation((command: string) => {
      if (command === 'delete_canvas') return Promise.resolve(effect);
      if (command === 'list_canvases') return Promise.resolve([canvas(1, 'Canvas 1')]);
      return Promise.resolve(null);
    });

    const returned = await deleteCanvas(2);
    expect(returned.canvas.id).toBe(2);
    expect(canvasStore.canvases.map((c) => c.id)).toEqual([1]);
  });

  it('refreshCanvases_withNoProject_isANoOp', async () => {
    canvasStore.closeProject();
    expect(await refreshCanvases()).toEqual([]);
    expect(await createCanvas()).toBeNull();
    expect(invokeSafe).not.toHaveBeenCalled();
  });
});
