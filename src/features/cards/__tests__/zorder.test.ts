import { describe, expect, it } from 'vitest';
import { bringForward, sendBack } from '../zorder';
import type { Placement } from '../../../lib/types';

function placement(id: number, z: number): Placement {
  return { id, canvas_id: 1, item_id: id, x: 0, y: 0, width: 236, height: 150, z_order: z };
}

/** Apply a set of updates and read the resulting stacking order, bottom first. */
function orderAfter(cards: Placement[], updates: { id: number; z_order: number }[]): number[] {
  const byId = new Map(cards.map((c) => [c.id, { ...c }]));
  for (const u of updates) byId.get(u.id)!.z_order = u.z_order;
  return [...byId.values()].sort((a, b) => a.z_order - b.z_order).map((p) => p.id);
}

const cards = [placement(1, 0), placement(2, 1), placement(3, 2), placement(4, 3)];

describe('bringForward', () => {
  it('bringForward_theTopmostCard_isANoOp', () => {
    expect(bringForward(cards, [4])).toEqual([]);
  });

  it('bringForward_aMiddleCard_putsItOnTop', () => {
    expect(orderAfter(cards, bringForward(cards, [2]))).toEqual([1, 3, 4, 2]);
  });

  it('bringForward_aMultiSelection_preservesTheirRelativeOrder', () => {
    expect(orderAfter(cards, bringForward(cards, [1, 3]))).toEqual([2, 4, 1, 3]);
  });

  it('bringForward_anEmptySelection_isANoOp', () => {
    expect(bringForward(cards, [])).toEqual([]);
  });

  it('bringForward_returnsOnlyTheRowsWhoseZActuallyChanges', () => {
    const updates = bringForward(cards, [3]);
    expect(updates.map((u) => u.id).sort()).toEqual([3, 4]);
  });
});

describe('sendBack', () => {
  it('sendBack_theBottommostCard_isANoOp', () => {
    expect(sendBack(cards, [1])).toEqual([]);
  });

  it('sendBack_aMiddleCard_putsItUnderneath', () => {
    expect(orderAfter(cards, sendBack(cards, [3]))).toEqual([3, 1, 2, 4]);
  });

  it('sendBack_aMultiSelection_preservesTheirRelativeOrder', () => {
    expect(orderAfter(cards, sendBack(cards, [2, 4]))).toEqual([2, 4, 1, 3]);
  });

  it('sendBack_everyCard_isANoOp', () => {
    expect(sendBack(cards, [1, 2, 3, 4])).toEqual([]);
  });
});

describe('zorder purity', () => {
  it('bringForward_calledTwice_mutatesNothingAndReturnsTheSameUpdates', () => {
    const snapshot = JSON.stringify(cards);
    const first = bringForward(cards, [1]);
    const second = bringForward(cards, [1]);
    expect(first).toEqual(second);
    expect(JSON.stringify(cards)).toBe(snapshot);
  });
});
