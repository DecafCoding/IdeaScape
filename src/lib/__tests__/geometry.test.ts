import { describe, expect, it } from 'vitest';
import {
  boundingRect,
  clampZoom,
  MAX_ZOOM,
  MIN_CARD_SIZE,
  MIN_ZOOM,
  rectContains,
  rectFromCorners,
  rectsIntersect,
  resizeRect,
  screenToWorld,
  snapToGrid,
  viewportWorldRect,
  worldToScreen,
} from '../geometry';

const view = { x: -100, y: -50, zoom: 2 };

describe('rectsIntersect', () => {
  it('rectsIntersect_overlappingRects_isTrue', () => {
    expect(
      rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }),
    ).toBe(true);
  });

  it('rectsIntersect_disjointRects_isFalse', () => {
    expect(
      rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 5, height: 5 }),
    ).toBe(false);
  });

  it('rectsIntersect_touchingEdges_isFalse', () => {
    expect(
      rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 5, height: 5 }),
    ).toBe(false);
  });
});

describe('rectContains', () => {
  const outer = { x: 0, y: 0, width: 100, height: 100 };

  it('rectContains_fullyEnclosedRect_isTrue', () => {
    expect(rectContains(outer, { x: 10, y: 10, width: 20, height: 20 })).toBe(true);
  });

  it('rectContains_rectMerelyTouchedByTheBand_isFalse', () => {
    expect(rectContains(outer, { x: 90, y: 0, width: 20, height: 20 })).toBe(false);
  });

  it('rectContains_rectExactlyOnTheBoundary_isTrue', () => {
    expect(rectContains(outer, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
  });
});

describe('screenToWorld / worldToScreen', () => {
  it('screenToWorld_thenWorldToScreen_roundTrips', () => {
    const point = { x: 321, y: 654 };
    const back = worldToScreen(screenToWorld(point, view), view);
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });

  it('screenToWorld_atTheViewOrigin_isTheWorldOrigin', () => {
    expect(screenToWorld({ x: -100, y: -50 }, view)).toEqual({ x: 0, y: 0 });
  });
});

describe('viewportWorldRect', () => {
  it('viewportWorldRect_zeroMargin_coversExactlyTheVisibleWorld', () => {
    const rect = viewportWorldRect({ x: 0, y: 0, zoom: 1 }, { width: 800, height: 600 });
    expect(rect).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('viewportWorldRect_margin_isConvertedIntoWorldUnitsSoItIsZoomIndependent', () => {
    const atOne = viewportWorldRect({ x: 0, y: 0, zoom: 1 }, { width: 800, height: 600 }, 200);
    const atHalf = viewportWorldRect({ x: 0, y: 0, zoom: 0.5 }, { width: 800, height: 600 }, 200);
    expect(atOne.x).toBe(-200);
    expect(atHalf.x).toBe(-400);
  });
});

describe('clampZoom', () => {
  it('clampZoom_belowTheFloor_returnsTheFloor', () => {
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
  });

  it('clampZoom_aboveTheCeiling_returnsTheCeiling', () => {
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });

  it('clampZoom_aValueInRange_isUnchanged', () => {
    expect(clampZoom(0.24)).toBe(0.24);
  });

  it('clampZoom_aNonFiniteValue_fallsBackToOne', () => {
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe('resizeRect', () => {
  const rect = { x: 100, y: 100, width: 200, height: 200 };

  it('resizeRect_southEastHandle_growsWidthAndHeightAndKeepsTheOrigin', () => {
    expect(resizeRect(rect, 'se', 50, 40)).toEqual({ x: 100, y: 100, width: 250, height: 240 });
  });

  it('resizeRect_northWestHandle_movesTheOriginAsWellAsTheSize', () => {
    expect(resizeRect(rect, 'nw', 50, 50)).toEqual({ x: 150, y: 150, width: 150, height: 150 });
  });

  it('resizeRect_northEastHandle_movesOnlyTheTopEdge', () => {
    expect(resizeRect(rect, 'ne', 20, 30)).toEqual({ x: 100, y: 130, width: 220, height: 170 });
  });

  it('resizeRect_southWestHandle_movesOnlyTheLeftEdge', () => {
    expect(resizeRect(rect, 'sw', 20, 30)).toEqual({ x: 120, y: 100, width: 180, height: 230 });
  });

  it.each(['nw', 'ne', 'sw', 'se'] as const)(
    'resizeRect_%sHandleDraggedPastTheMinimum_clampsAtFiftyPixels',
    (handle) => {
      const result = resizeRect(rect, handle, -1000, -1000);
      const grown = resizeRect(rect, handle, 1000, 1000);
      const shrunk = handle === 'se' ? result : grown;
      void shrunk;
      const both = [result, resizeRect(rect, handle, 1000, 1000)];
      for (const r of both) {
        expect(r.width).toBeGreaterThanOrEqual(MIN_CARD_SIZE);
        expect(r.height).toBeGreaterThanOrEqual(MIN_CARD_SIZE);
      }
    },
  );

  it('resizeRect_draggedToExactlyFiftyPixels_isAllowed', () => {
    const result = resizeRect({ x: 0, y: 0, width: 100, height: 100 }, 'se', -50, -50);
    expect(result).toEqual({ x: 0, y: 0, width: MIN_CARD_SIZE, height: MIN_CARD_SIZE });
  });

  it('resizeRect_hasNoMaximum', () => {
    expect(resizeRect(rect, 'se', 100000, 100000).width).toBe(100200);
  });
});

describe('boundingRect and rectFromCorners', () => {
  it('boundingRect_emptyList_isNull', () => {
    expect(boundingRect([])).toBeNull();
  });

  it('boundingRect_severalRects_coversAllOfThem', () => {
    expect(
      boundingRect([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 50, y: 20, width: 10, height: 10 },
      ]),
    ).toEqual({ x: 0, y: 0, width: 60, height: 30 });
  });

  it('rectFromCorners_draggedUpAndLeft_isNormalised', () => {
    expect(rectFromCorners({ x: 100, y: 100 }, { x: 40, y: 60 })).toEqual({
      x: 40,
      y: 60,
      width: 60,
      height: 40,
    });
  });
});

describe('snapToGrid', () => {
  it('snapToGrid_aValue_roundsOntoTheTwentyTwoPixelPitch', () => {
    expect(snapToGrid(23)).toBe(22);
    expect(snapToGrid(34)).toBe(44);
    expect(snapToGrid(0)).toBe(0);
  });
});
