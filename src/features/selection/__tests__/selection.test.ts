import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Placement } from '../../../lib/types';

vi.mock('../../../lib/ipc', () => ({
  invokeSafe: vi.fn(),
  IpcError: class extends Error {},
}));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { applyMarquee, isToggleModifier, placementsWithin, selectCard } =
  await import('../selection.svelte');

function placement(id: number, x: number, y: number, width = 100, height = 80): Placement {
  return { id, canvas_id: 1, item_id: id, x, y, width, height, z_order: id };
}

describe('selection', () => {
  beforeEach(() => {
    canvasStore.closeProject();
    canvasStore.upsertPlacement(placement(1, 0, 0));
    canvasStore.upsertPlacement(placement(2, 200, 0));
    canvasStore.upsertPlacement(placement(3, 1000, 1000));
  });

  describe('placementsWithin', () => {
    it('placementsWithin_bandEnclosingTwoCards_returnsExactlyThoseTwo', () => {
      const band = { x: -10, y: -10, width: 330, height: 120 };
      expect(placementsWithin(canvasStore.placements.values(), band).map((p) => p.id)).toEqual([
        1, 2,
      ]);
    });

    it('placementsWithin_cardMerelyTouchedByTheBand_isNotSelected', () => {
      // The band clips the right half of card 2 but does not enclose it.
      const band = { x: -10, y: -10, width: 260, height: 120 };
      expect(placementsWithin(canvasStore.placements.values(), band).map((p) => p.id)).toEqual([1]);
    });

    it('placementsWithin_anEmptyBand_selectsNothing', () => {
      expect(
        placementsWithin(canvasStore.placements.values(), { x: 0, y: 0, width: 0, height: 0 }),
      ).toHaveLength(0);
    });
  });

  describe('applyMarquee', () => {
    it('applyMarquee_notAdditive_replacesTheSelection', () => {
      canvasStore.setSelection([3]);
      applyMarquee({ x: -10, y: -10, width: 330, height: 120 }, false);
      expect([...canvasStore.selection].sort()).toEqual([1, 2]);
    });

    it('applyMarquee_additive_keepsWhatWasAlreadySelected', () => {
      canvasStore.setSelection([3]);
      applyMarquee({ x: -10, y: -10, width: 330, height: 120 }, true);
      expect([...canvasStore.selection].sort()).toEqual([1, 2, 3]);
    });
  });

  describe('selectCard', () => {
    it('selectCard_plainClick_selectsExactlyThatCard', () => {
      canvasStore.setSelection([2, 3]);
      selectCard(1, false);
      expect([...canvasStore.selection]).toEqual([1]);
    });

    it('selectCard_plainClickOnAnAlreadySelectedCard_keepsTheWholeSelection', () => {
      // Otherwise starting a drag on one card of a multi-selection would collapse it.
      canvasStore.setSelection([1, 2]);
      selectCard(1, false);
      expect([...canvasStore.selection].sort()).toEqual([1, 2]);
    });

    it('selectCard_toggleClick_addsWithoutClearing', () => {
      canvasStore.setSelection([1]);
      selectCard(2, true);
      expect([...canvasStore.selection].sort()).toEqual([1, 2]);
    });

    it('selectCard_toggleClickOnASelectedCard_removesIt', () => {
      canvasStore.setSelection([1, 2]);
      selectCard(2, true);
      expect([...canvasStore.selection]).toEqual([1]);
    });
  });

  describe('isToggleModifier', () => {
    it('isToggleModifier_ctrlOrShift_isTrue', () => {
      expect(isToggleModifier({ ctrlKey: true, shiftKey: false })).toBe(true);
      expect(isToggleModifier({ ctrlKey: false, shiftKey: true })).toBe(true);
    });

    it('isToggleModifier_noModifier_isFalse', () => {
      expect(isToggleModifier({ ctrlKey: false, shiftKey: false })).toBe(false);
    });
  });

  describe('select all and clear', () => {
    it('selectAll_selectsEveryPlacementOnTheActiveCanvasOnly', () => {
      // The store holds only the active canvas's placements, which is what makes this true.
      canvasStore.selectAll();
      expect([...canvasStore.selection].sort()).toEqual([1, 2, 3]);
    });

    it('clearSelection_afterASelection_leavesNothingSelected', () => {
      canvasStore.selectAll();
      canvasStore.clearSelection();
      expect(canvasStore.selection.size).toBe(0);
    });
  });
});
