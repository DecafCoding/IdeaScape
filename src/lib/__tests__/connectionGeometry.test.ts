import { describe, expect, it } from 'vitest';
import type { Rect } from '../geometry';
import {
  connectionEndpoints,
  connectionInView,
  labelVisible,
  rectCentre,
  rectEdgePoint,
  segmentLength,
  segmentMidpoint,
  trimSegment,
} from '../connectionGeometry';

const box = (x: number, y: number, width = 100, height = 100): Rect => ({ x, y, width, height });

describe('rectEdgePoint', () => {
  it('rectEdgePoint_aPointDirectlyRight_landsOnTheRightBorder', () => {
    const rect = box(0, 0);
    expect(rectEdgePoint(rect, { x: 500, y: 50 })).toEqual({ x: 100, y: 50 });
  });

  it('rectEdgePoint_aPointDirectlyAbove_landsOnTheTopBorder', () => {
    expect(rectEdgePoint(box(0, 0), { x: 50, y: -500 })).toEqual({ x: 50, y: 0 });
  });

  it('rectEdgePoint_aPointDirectlyBelow_landsOnTheBottomBorder', () => {
    expect(rectEdgePoint(box(0, 0), { x: 50, y: 500 })).toEqual({ x: 50, y: 100 });
  });

  it('rectEdgePoint_aPointDirectlyLeft_landsOnTheLeftBorder', () => {
    expect(rectEdgePoint(box(0, 0), { x: -500, y: 50 })).toEqual({ x: 0, y: 50 });
  });

  it('rectEdgePoint_aDiagonalTarget_landsOnTheNearerBorder', () => {
    // A wide, short card: a 45° ray leaves through the top or bottom, not the side.
    const rect = box(0, 0, 200, 50);
    const point = rectEdgePoint(rect, { x: 1000, y: 1000 });
    expect(point.y).toBeCloseTo(50);
    expect(point.x).toBeCloseTo(123.077);
    expect(point.x).toBeLessThan(200);
  });

  it('rectEdgePoint_theCentreItself_returnsTheCentre', () => {
    expect(rectEdgePoint(box(0, 0), { x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
  });
});

describe('connectionEndpoints', () => {
  it('connectionEndpoints_twoSeparatedRects_bothPointsSitOnTheirOwnBorder', () => {
    const from = box(0, 0);
    const to = box(400, 0);
    const result = connectionEndpoints(from, to);
    expect(result).not.toBeNull();
    expect(result!.start).toEqual({ x: 100, y: 50 });
    expect(result!.end).toEqual({ x: 400, y: 50 });
  });

  it('connectionEndpoints_overlappingRects_returnsNull', () => {
    expect(connectionEndpoints(box(0, 0), box(50, 50))).toBeNull();
  });

  it('connectionEndpoints_rectsSharingACentre_returnsNull', () => {
    expect(connectionEndpoints(box(0, 0, 100, 100), box(25, 25, 50, 50))).toBeNull();
  });
});

describe('segment maths', () => {
  it('segmentMidpoint_twoPoints_isTheirAverage', () => {
    expect(segmentMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });

  it('segmentLength_a3by4Segment_is5', () => {
    expect(segmentLength({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('labelVisible', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 60, y: 0 };

  it('labelVisible_a60pxLineAtHalfZoom_isFalse', () => {
    expect(labelVisible(a, b, 0.5)).toBe(false);
  });

  it('labelVisible_a60pxLineAt100Percent_isTrue', () => {
    expect(labelVisible(a, b, 1)).toBe(true);
  });

  it('labelVisible_a40pxLineZoomedTo2_isTrue', () => {
    expect(labelVisible(a, { x: 40, y: 0 }, 2)).toBe(true);
  });
});

describe('connectionInView', () => {
  const view = { x: 0, y: 0, zoom: 1 };
  const viewport = { width: 800, height: 600 };

  it('connectionInView_aLineInsideTheViewport_isTrue', () => {
    expect(connectionInView({ x: 10, y: 10 }, { x: 200, y: 200 }, view, viewport)).toBe(true);
  });

  it('connectionInView_aLineEntirelyOffScreen_isFalse', () => {
    expect(connectionInView({ x: 5000, y: 5000 }, { x: 5200, y: 5200 }, view, viewport)).toBe(
      false,
    );
  });

  it('connectionInView_bothCardsOffScreenButTheLineCrossing_isTrue', () => {
    // Both endpoints sit outside the 800 × 600 window, yet the line runs straight
    // through its middle. Culling on the visible card set would have dropped it.
    expect(connectionInView({ x: -900, y: 300 }, { x: 1700, y: 300 }, view, viewport)).toBe(true);
  });
});

describe('rectCentre', () => {
  it('rectCentre_aRect_isItsMiddle', () => {
    expect(rectCentre(box(10, 20, 100, 60))).toEqual({ x: 60, y: 50 });
  });
});

describe('trimSegment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };

  it('trimSegment_oneArrowedEnd_pullsOnlyThatEndInward', () => {
    expect(trimSegment(a, b, 0, 7.5)).toEqual({ start: a, end: { x: 92.5, y: 0 } });
  });

  it('trimSegment_bothEnds_pullsEachAlongItsOwnDirection', () => {
    expect(trimSegment(a, b, 10, 20)).toEqual({ start: { x: 10, y: 0 }, end: { x: 80, y: 0 } });
  });

  it('trimSegment_insetsLongerThanTheLine_collapsesRatherThanCrossing', () => {
    // 30 + 30 of trim on a 20-unit line: each end gets its half, and the stroke vanishes
    // instead of pointing backwards.
    const trimmed = trimSegment(a, { x: 20, y: 0 }, 30, 30);
    expect(trimmed.start).toEqual({ x: 10, y: 0 });
    expect(trimmed.end).toEqual({ x: 10, y: 0 });
  });

  it('trimSegment_azeroLengthSegment_isReturnedUnchanged', () => {
    expect(trimSegment(a, a, 5, 5)).toEqual({ start: a, end: a });
  });
});
