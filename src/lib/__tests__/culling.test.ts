import { describe, expect, it } from 'vitest';
import { CULL_MARGIN_PX, cullWithCounts, visiblePlacements } from '../culling';
import type { Placement } from '../types';

function placement(id: number, x: number, y: number, width = 236, height = 150): Placement {
  return { id, canvas_id: 1, item_id: id, x, y, width, height, z_order: id };
}

const viewport = { width: 1000, height: 700 };
const view = { x: 0, y: 0, zoom: 1 };

describe('visiblePlacements', () => {
  it('visiblePlacements_cardFullyInsideTheViewport_isVisible', () => {
    expect(visiblePlacements([placement(1, 100, 100)], view, viewport, 0)).toHaveLength(1);
  });

  it('visiblePlacements_cardFullyOutsideTheViewportAndMargin_isNotVisible', () => {
    expect(visiblePlacements([placement(1, 5000, 5000)], view, viewport, 0)).toHaveLength(0);
  });

  it('visiblePlacements_cardStraddlingAnEdge_isVisible', () => {
    expect(visiblePlacements([placement(1, 900, 100)], view, viewport, 0)).toHaveLength(1);
    expect(visiblePlacements([placement(1, -100, 100)], view, viewport, 0)).toHaveLength(1);
  });

  it('visiblePlacements_cardInsideTheMarginButOutsideTheViewport_isVisible', () => {
    const justOutside = placement(1, viewport.width + 50, 100);
    expect(visiblePlacements([justOutside], view, viewport, 0)).toHaveLength(0);
    expect(visiblePlacements([justOutside], view, viewport, CULL_MARGIN_PX)).toHaveLength(1);
  });

  it('visiblePlacements_zoomingOut_bringsMoreCardsIntoTheSet', () => {
    const cards = Array.from({ length: 40 }, (_, i) => placement(i + 1, i * 300, 0));
    const atOne = visiblePlacements(cards, { x: 0, y: 0, zoom: 1 }, viewport, 0).length;
    const atQuarter = visiblePlacements(cards, { x: 0, y: 0, zoom: 0.25 }, viewport, 0).length;
    expect(atQuarter).toBeGreaterThan(atOne);
  });

  it('visiblePlacements_panning_changesWhichCardsQualify', () => {
    const cards = [placement(1, 0, 0), placement(2, 3000, 0)];
    expect(visiblePlacements(cards, { x: 0, y: 0, zoom: 1 }, viewport, 0).map((p) => p.id)).toEqual(
      [1],
    );
    expect(
      visiblePlacements(cards, { x: -2900, y: 0, zoom: 1 }, viewport, 0).map((p) => p.id),
    ).toEqual([2]);
  });

  it('visiblePlacements_theCardBeingEdited_survivesCullingSoItsUnsavedTextIsNotLost', () => {
    const offscreen = placement(7, 9000, 9000);
    expect(visiblePlacements([offscreen], view, viewport, 0)).toHaveLength(0);
    expect(visiblePlacements([offscreen], view, viewport, 0, new Set([7]))).toHaveLength(1);
  });

  it('visiblePlacements_oneThousandCardsAtTheDefaultZoom_drawsUnderFifteenPercent', () => {
    const cards = Array.from({ length: 1000 }, (_, i) =>
      placement(i + 1, (i % 40) * 300, Math.floor(i / 40) * 220),
    );
    const { total, drawn } = cullWithCounts(cards, view, viewport, CULL_MARGIN_PX);
    expect(total).toBe(1000);
    expect(drawn).toBeGreaterThan(0);
    expect(drawn / total).toBeLessThan(0.15);
  });

  it('visiblePlacements_calledTwiceWithTheSameInputs_isPureAndMutatesNothing', () => {
    const cards = [placement(1, 0, 0), placement(2, 400, 0)];
    const snapshot = JSON.stringify(cards);
    const first = visiblePlacements(cards, view, viewport);
    const second = visiblePlacements(cards, view, viewport);
    expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id));
    expect(JSON.stringify(cards)).toBe(snapshot);
  });
});

describe('cullWithCounts', () => {
  it('cullWithCounts_reportsTotalAndDrawnForThePerformanceOverlay', () => {
    const cards = [placement(1, 0, 0), placement(2, 9000, 9000)];
    expect(cullWithCounts(cards, view, viewport, 0)).toMatchObject({ total: 2, drawn: 1 });
  });
});
