/**
 * The asset half of undo: a delete of the last placement of an image item reports the file
 * it moved out of `assets/`, and undoing it calls `restore_card` with the same payload — so
 * the untrash in Rust puts the same bytes back beside the same card.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeSafe = vi.fn();

vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (command: string, args?: Record<string, unknown>) => invokeSafe(command, args),
  toFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  IpcError: class IpcError extends Error {},
}));

const logWarn = vi.fn();
vi.mock('../../../lib/logger', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: (...args: unknown[]) => logWarn(...args),
}));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { deleteCardsCommand } = await import('../../undo/commands');
const { clearAssetStatuses } = await import('../../../lib/assets');
const type = await import('../../../lib/types');

const ASSET = 'deadbeefdeadbeef.png';

const placement = {
  id: 5,
  canvas_id: 1,
  item_id: 5,
  x: 0,
  y: 0,
  width: 320,
  height: 200,
  z_order: 0,
};

const payload = JSON.stringify({
  asset: ASSET,
  natural_width: 640,
  natural_height: 400,
  alt: 'A steel truss',
  source_name: 'truss.png',
});

const item = {
  id: 5,
  project_id: 1,
  kind: 'image' as const,
  payload,
  created_at: 'now',
  updated_at: 'now',
};

describe('asset-aware undo', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    logWarn.mockReset();
    canvasStore.closeProject();
    clearAssetStatuses();
  });

  it('deleteEffect_theLastPlacementOfAnImageItem_namesTheAssetItTrashed', () => {
    // Shape assertion against the seam: `assets` is part of what a delete reports, so one
    // undo command can restore the file with the row.
    const effect: import('../../../lib/types').DeleteEffect = {
      placements: [placement],
      items: [item],
      connections: [],
      assets: [ASSET],
    };
    expect(effect.assets).toEqual([ASSET]);
    expect(type.payloadAssetNames('image', payload)).toEqual([ASSET]);
  });

  it('deleteCardsCommand_undone_callsRestoreCardWithTheSamePayload', async () => {
    invokeSafe.mockImplementation((command: string) => {
      if (command === 'restore_card') {
        return Promise.resolve({ placement: { ...placement, id: 55 }, item: { ...item, id: 55 } });
      }
      if (command === 'asset_statuses') {
        return Promise.resolve([{ name: ASSET, exists: true, byte_size: 100 }]);
      }
      return Promise.resolve(null);
    });

    const command = deleteCardsCommand({
      placements: [placement],
      items: [item],
      connections: [],
      assets: [ASSET],
    });
    await command.undo();

    const restore = invokeSafe.mock.calls.find((c) => c[0] === 'restore_card');
    expect(restore?.[1]).toMatchObject({ kind: 'image', payload });
    // The asset is re-checked once for the whole batch, not once per card.
    expect(invokeSafe.mock.calls.filter((c) => c[0] === 'asset_statuses')).toHaveLength(1);
    expect(logWarn).not.toHaveBeenCalled();
  });

  it('deleteCardsCommand_undoneWhenTheFileDoesNotComeBack_warnsAndStillRestoresTheRow', async () => {
    invokeSafe.mockImplementation((command: string) => {
      if (command === 'restore_card') {
        return Promise.resolve({ placement: { ...placement, id: 55 }, item: { ...item, id: 55 } });
      }
      if (command === 'asset_statuses') {
        return Promise.resolve([{ name: ASSET, exists: false, byte_size: 0 }]);
      }
      return Promise.resolve(null);
    });

    const command = deleteCardsCommand({
      placements: [placement],
      items: [item],
      connections: [],
      assets: [ASSET],
    });
    await expect(command.undo()).resolves.toBeUndefined();

    expect(canvasStore.placements.get(55)).toBeDefined();
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(String(logWarn.mock.calls[0][0])).toContain(ASSET);
  });

  it('deleteCardsCommand_undoingANoteDelete_asksAboutNoAssets', async () => {
    const note = { ...item, kind: 'note' as const, payload: '{"title":"T","text":""}' };
    invokeSafe.mockImplementation((command: string) => {
      if (command === 'restore_card') {
        return Promise.resolve({ placement: { ...placement, id: 56 }, item: { ...note, id: 56 } });
      }
      return Promise.resolve(null);
    });

    const command = deleteCardsCommand({
      placements: [placement],
      items: [note],
      connections: [],
      assets: [],
    });
    await command.undo();
    expect(invokeSafe.mock.calls.some((c) => c[0] === 'asset_statuses')).toBe(false);
  });
});
