/**
 * Milestone 2's checkpoint. It mounts the real card layer over the real store, with one
 * image whose asset `asset_statuses` reports as present and one it reports absent, and
 * asserts the two drawn states compose over the culled render path at the same authored
 * size. No single component test reaches this: each tests its piece against a stub.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';

const invokeSafe = vi.fn();

vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (command: string, args?: Record<string, unknown>) => invokeSafe(command, args),
  toFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  IpcError: class IpcError extends Error {},
}));

const CardLayer = (await import('../CardLayer.svelte')).default;
const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { setAssetsFolder } = await import('../../../lib/assets.svelte');

const CANVAS_ID = 1;
const AUTHORED_WIDTH = 320;
const AUTHORED_HEIGHT = 200;

function imageCard(id: number, asset: string, sourceName: string) {
  return {
    placement: {
      id,
      canvas_id: CANVAS_ID,
      item_id: id,
      x: id * 400,
      y: 0,
      width: AUTHORED_WIDTH,
      height: AUTHORED_HEIGHT,
      z_order: id,
    },
    item: {
      id,
      project_id: 1,
      kind: 'image' as const,
      payload: JSON.stringify({
        asset,
        natural_width: 640,
        natural_height: 400,
        alt: `alt for ${sourceName}`,
        source_name: sourceName,
      }),
      created_at: 'now',
      updated_at: 'now',
    },
  };
}

const props = {
  onGeometryCommitted: () => {},
  onOpenElementMenu: () => {},
  onCommitEdit: () => {},
  onSelect: () => {},
  onConnectFrom: () => {},
};

describe('the card layer with images', () => {
  beforeEach(async () => {
    invokeSafe.mockReset();
    canvasStore.closeProject();
    setAssetsFolder('C:/Project/assets');

    const cards = [imageCard(1, 'here.png', 'present.png'), imageCard(2, 'gone.png', 'absent.png')];
    canvasStore.canvases = [
      {
        id: CANVAS_ID,
        project_id: 1,
        name: 'Canvas 1',
        sort_order: 0,
        view_x: 0,
        view_y: 0,
        view_zoom: 1,
        created_at: 'now',
        updated_at: 'now',
      },
    ];
    invokeSafe.mockImplementation((command: string) => {
      if (command === 'list_placements') return Promise.resolve(cards);
      if (command === 'list_connections') return Promise.resolve([]);
      if (command === 'asset_statuses') {
        return Promise.resolve([
          { name: 'here.png', exists: true, byte_size: 100 },
          { name: 'gone.png', exists: false, byte_size: 0 },
        ]);
      }
      return Promise.resolve([]);
    });

    await canvasStore.loadCanvas(CANVAS_ID);
    canvasStore.setViewportSize({ width: 2000, height: 1000 });
  });

  afterEach(() => {
    cleanup();
    setAssetsFolder(null);
  });

  it('cardLayer_onePresentAndOneAbsentAsset_drawsThePictureAndTheMissingMarkerSideBySide', () => {
    const { getByTestId } = render(CardLayer, { props });

    const present = getByTestId('image-card');
    const images = present.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('alt')).toBe('alt for present.png');
    expect(decodeURIComponent(images[0].getAttribute('src') ?? '')).toContain('here.png');

    const missing = getByTestId('image-card-missing');
    expect(missing.querySelectorAll('img')).toHaveLength(0);
    expect(missing.textContent).toContain('File not found in assets/');
    expect(missing.querySelector('.dashed')).not.toBeNull();
  });

  it('cardLayer_aMissingAsset_keepsTheCardAtItsAuthoredWidthAndHeight', () => {
    const { getByTestId } = render(CardLayer, { props });
    const layer = getByTestId('card-layer');
    const shells = [...layer.querySelectorAll<HTMLElement>('[data-placement-id]')];
    expect(shells).toHaveLength(2);
    for (const shell of shells) {
      expect(shell.style.width).toBe(`${AUTHORED_WIDTH}px`);
      expect(shell.style.height).toBe(`${AUTHORED_HEIGHT}px`);
    }
  });

  it('cardLayer_loadingACanvasOfImages_asksForEveryAssetStatusInOneCall', () => {
    const calls = invokeSafe.mock.calls.filter((call) => call[0] === 'asset_statuses');
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ names: ['here.png', 'gone.png'] });
  });

  it('cardLayer_theMissingMarker_neverUsesTheDestructiveAccent', () => {
    const { getByTestId } = render(CardLayer, { props });
    expect(getByTestId('image-card-missing').outerHTML).not.toContain('accent-2');
  });
});
