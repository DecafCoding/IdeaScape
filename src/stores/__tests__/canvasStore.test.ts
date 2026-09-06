import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM } from '../../lib/geometry';
import type { Placement } from '../../lib/types';

const invokeSafe = vi.fn();
vi.mock('../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
}));

const { canvasStore } = await import('../canvasStore.svelte');

function placement(id: number, z = id): Placement {
  return { id, canvas_id: 1, item_id: id, x: id * 10, y: 0, width: 236, height: 150, z_order: z };
}

describe('canvasStore', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    canvasStore.closeProject();
  });

  describe('selection', () => {
    beforeEach(() => {
      for (const id of [1, 2, 3]) canvasStore.upsertPlacement(placement(id));
    });

    it('setSelection_aListOfIds_replacesTheWholeSelection', () => {
      canvasStore.setSelection([1, 2]);
      expect([...canvasStore.selection]).toEqual([1, 2]);
      canvasStore.setSelection([3]);
      expect([...canvasStore.selection]).toEqual([3]);
    });

    it('toggleSelected_anUnselectedId_addsItWithoutClearingTheRest', () => {
      canvasStore.setSelection([1]);
      canvasStore.toggleSelected(2);
      expect([...canvasStore.selection].sort()).toEqual([1, 2]);
    });

    it('toggleSelected_aSelectedId_removesIt', () => {
      canvasStore.setSelection([1, 2]);
      canvasStore.toggleSelected(2);
      expect([...canvasStore.selection]).toEqual([1]);
    });

    it('clearSelection_anySelection_emptiesIt', () => {
      canvasStore.setSelection([1, 2, 3]);
      canvasStore.clearSelection();
      expect(canvasStore.selection.size).toBe(0);
    });

    it('selectAll_aPopulatedCanvas_selectsEveryPlacement', () => {
      canvasStore.selectAll();
      expect(canvasStore.selection.size).toBe(3);
    });

    it('removePlacement_aSelectedCard_dropsItFromTheSelectionToo', () => {
      canvasStore.setSelection([1, 2]);
      canvasStore.removePlacement(1);
      expect([...canvasStore.selection]).toEqual([2]);
      expect(canvasStore.placements.has(1)).toBe(false);
    });

    it('selectedPlacements_aSelection_resolvesToThePlacementRows', () => {
      canvasStore.setSelection([2, 3]);
      expect(canvasStore.selectedPlacements.map((p) => p.id).sort()).toEqual([2, 3]);
    });
  });

  describe('maxZOrder', () => {
    it('maxZOrder_anEmptyCanvas_isMinusOne', () => {
      expect(canvasStore.maxZOrder).toBe(-1);
    });

    it('maxZOrder_aPopulatedCanvas_isTheHighestZ', () => {
      canvasStore.upsertPlacement(placement(1, 0));
      canvasStore.upsertPlacement(placement(2, 7));
      canvasStore.upsertPlacement(placement(3, 3));
      expect(canvasStore.maxZOrder).toBe(7);
    });
  });

  describe('setView', () => {
    it('setView_aZoomBelowTheFloor_clampsIt', () => {
      canvasStore.setView({ zoom: 0.0001 });
      expect(canvasStore.view.zoom).toBe(MIN_ZOOM);
    });

    it('setView_aZoomAboveTheCeiling_clampsIt', () => {
      canvasStore.setView({ zoom: 100 });
      expect(canvasStore.view.zoom).toBe(MAX_ZOOM);
    });

    it('setView_onlyAnOffset_leavesTheZoomAlone', () => {
      canvasStore.setView({ zoom: 0.5 });
      canvasStore.setView({ x: -40, y: 12 });
      expect(canvasStore.view).toEqual({ x: -40, y: 12, zoom: 0.5 });
    });
  });

  describe('orderedPlacements', () => {
    it('orderedPlacements_mixedZOrders_sortsBottomOfTheStackFirst', () => {
      canvasStore.upsertPlacement(placement(1, 5));
      canvasStore.upsertPlacement(placement(2, 1));
      expect(canvasStore.orderedPlacements.map((p) => p.id)).toEqual([2, 1]);
    });
  });

  describe('loadCanvas', () => {
    it('loadCanvas_aCanvasWithCards_fillsPlacementsAndItemsAndRestoresTheView', async () => {
      canvasStore.canvases = [
        {
          id: 9,
          project_id: 1,
          name: 'Canvas 1',
          sort_order: 0,
          view_x: -120,
          view_y: 30,
          view_zoom: 0.5,
          created_at: '',
          updated_at: '',
        },
      ];
      invokeSafe.mockResolvedValue([
        {
          placement: placement(1),
          item: {
            id: 1,
            project_id: 1,
            kind: 'note',
            payload: '{"title":"T","text":""}',
            created_at: '',
            updated_at: '',
          },
        },
      ]);

      await canvasStore.loadCanvas(9);

      expect(invokeSafe).toHaveBeenCalledWith('list_placements', { canvasId: 9 });
      expect(canvasStore.placements.size).toBe(1);
      expect(canvasStore.items.size).toBe(1);
      expect(canvasStore.view).toEqual({ x: -120, y: 30, zoom: 0.5 });
    });
  });

  describe('closeProject', () => {
    it('closeProject_anOpenProject_resetsEveryPieceOfCanvasState', () => {
      canvasStore.upsertPlacement(placement(1));
      canvasStore.setSelection([1]);
      canvasStore.setView({ x: 10, y: 10, zoom: 2 });

      canvasStore.closeProject();

      expect(canvasStore.placements.size).toBe(0);
      expect(canvasStore.selection.size).toBe(0);
      expect(canvasStore.view).toEqual({ x: 0, y: 0, zoom: 1 });
      expect(canvasStore.project).toBeNull();
    });
  });
});
