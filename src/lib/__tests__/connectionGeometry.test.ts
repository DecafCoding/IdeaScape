import { describe, expect, it } from 'vitest';
import type { Rect } from '../geometry';
import {
  connectionEndpoints,
  labelVisible,
  rectCentre,
  rectEdgePoint,
  segmentLength,
  longestSegment,
  polylinePath,
  routeInView,
  nearestSide,
  routePoints,
  segmentMidpoint,
  sideMidpoint,
  sideNormal,
  trimRoute,
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

// --- the elbow route (design-system §9.13, "Route") ------------------------

describe('routePoints', () => {
  it('routePoints_straight_isTheTwoCentreRayEndpoints', () => {
    const points = routePoints(box(0, 0), box(300, 0), 'straight');
    expect(points).toEqual([
      { x: 100, y: 50 },
      { x: 300, y: 50 },
    ]);
  });

  it('routePoints_anUnknownKey_fallsBackToStraight', () => {
    expect(routePoints(box(0, 0), box(300, 0), 'zigzag')).toEqual(
      routePoints(box(0, 0), box(300, 0), 'straight'),
    );
  });

  it('routePoints_elbowWithAHorizontalGap_leavesAndEntersTheFacingSides', () => {
    // Right side of the left card, across the middle of the 200-unit gap, left side of
    // the right card.
    expect(routePoints(box(0, 0), box(300, 200), 'elbow')).toEqual([
      { x: 100, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 250 },
      { x: 300, y: 250 },
    ]);
  });

  it('routePoints_elbowWithTheBiggerVerticalGap_leavesTheBottomAndEntersTheTop', () => {
    expect(routePoints(box(0, 0), box(50, 400), 'elbow')).toEqual([
      { x: 50, y: 100 },
      { x: 50, y: 250 },
      { x: 100, y: 250 },
      { x: 100, y: 400 },
    ]);
  });

  it('routePoints_elbowOnCardsThatOverlapHorizontally_usesTheAxisWithARealGap', () => {
    // The x centres are 250 apart and the y centres only 210, so the centre distance
    // alone would pick horizontal — and the across segment would double back through
    // both cards. Only the vertical axis has a gap, so that is the one used.
    const points = routePoints(box(0, 0, 300, 50), box(250, 260, 300, 50), 'elbow');
    expect(points).toEqual([
      { x: 150, y: 50 },
      { x: 150, y: 155 },
      { x: 400, y: 155 },
      { x: 400, y: 260 },
    ]);
  });

  it('routePoints_elbowOnAlignedCards_collapsesToOneStraightSegment', () => {
    // Same centre line: the two middle points coincide and are dropped, so no
    // zero-length bend is drawn.
    expect(routePoints(box(0, 0), box(300, 0), 'elbow')).toEqual([
      { x: 100, y: 50 },
      { x: 300, y: 50 },
    ]);
  });

  it('routePoints_overlappingCards_isNullOnEitherRoute', () => {
    expect(routePoints(box(0, 0), box(50, 50), 'elbow')).toBeNull();
    expect(routePoints(box(0, 0), box(50, 50), 'straight')).toBeNull();
  });
});

describe('polylinePath', () => {
  const corner = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it('polylinePath_twoPoints_isAPlainLine', () => {
    expect(
      polylinePath(
        [
          { x: 0, y: 0 },
          { x: 10, y: 20 },
        ],
        2,
      ),
    ).toBe('M0,0 L10,20');
  });

  it('polylinePath_aCornerWithNoRadius_staysSquare', () => {
    expect(polylinePath(corner, 0)).toBe('M0,0 L100,0 L100,100');
  });

  it('polylinePath_aCornerWithARadius_roundsItWithAQuadratic', () => {
    // In 2 units before the corner, out 2 units after it, with the corner itself as the
    // control point.
    expect(polylinePath(corner, 2)).toBe('M0,0 L98,0 Q100,0 100,2 L100,100');
  });

  it('polylinePath_aRadiusBiggerThanTheSegments_isClampedToHalfTheShorterOne', () => {
    const tight = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 40 },
    ];
    // Half of the 6-unit segment, not the asked-for 10.
    expect(polylinePath(tight, 10)).toBe('M0,0 L3,0 Q6,0 6,3 L6,40');
  });

  it('polylinePath_fewerThanTwoPoints_isEmpty', () => {
    expect(polylinePath([{ x: 0, y: 0 }], 2)).toBe('');
  });
});

describe('trimRoute', () => {
  const elbow = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];

  it('trimRoute_anElbow_movesOnlyTheFirstAndLastPoint', () => {
    expect(trimRoute(elbow, 10, 20)).toEqual([
      { x: 10, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 180, y: 100 },
    ]);
  });

  it('trimRoute_aTwoPointRoute_trimsBothEndsOfTheOneSegment', () => {
    expect(
      trimRoute(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        10,
        20,
      ),
    ).toEqual([
      { x: 10, y: 0 },
      { x: 80, y: 0 },
    ]);
  });

  it('trimRoute_anInsetLongerThanItsOwnSegment_stopsAtTheBendRatherThanPastIt', () => {
    const short = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 100 },
    ];
    // 40 of trim on a 10-unit first segment: it collapses onto the bend, never beyond it.
    expect(trimRoute(short, 40, 0)[0]).toEqual({ x: 10, y: 0 });
  });
});

describe('longestSegment', () => {
  it('longestSegment_anElbow_isTheAcrossRun', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 300 },
      { x: 40, y: 300 },
    ];
    expect(longestSegment(points)).toEqual({ a: { x: 20, y: 0 }, b: { x: 20, y: 300 } });
  });

  it('longestSegment_oneSegment_isThatSegment', () => {
    expect(
      longestSegment([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ]),
    ).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 5, y: 0 },
    });
  });

  it('longestSegment_fewerThanTwoPoints_isNull', () => {
    expect(longestSegment([{ x: 0, y: 0 }])).toBeNull();
  });
});

describe('routeInView', () => {
  const view = { x: 0, y: 0, zoom: 1 };
  const viewport = { width: 800, height: 600 };

  it('routeInView_aBendInsideTheWindowWithBothEndsOutside_isTrue', () => {
    // Culling on the two endpoints alone would wrongly drop this: their own box misses
    // the window entirely, but the bend runs through the middle of it.
    const points = [
      { x: -900, y: 300 },
      { x: 400, y: 300 },
      { x: 400, y: 900 },
      { x: 1700, y: 900 },
    ];
    expect(routeInView(points, view, viewport)).toBe(true);
  });

  it('routeInView_aRouteWhollyOffScreen_isFalse', () => {
    expect(
      routeInView(
        [
          { x: 2000, y: 2000 },
          { x: 2100, y: 2000 },
        ],
        view,
        viewport,
      ),
    ).toBe(false);
  });
});

describe('anchors', () => {
  // Two cards side by side with a 200-unit gap: A at 0..100, B at 300..400.
  const a = box(0, 0);
  const b = box(300, 0);

  it('routePoints_bothAnchorsAuto_drawsExactlyWhatItDrewBeforeAnchorsExisted', () => {
    // The whole reason both columns default to 'auto': no existing canvas changes shape.
    expect(routePoints(a, b, 'straight', 'auto', 'auto')).toEqual(routePoints(a, b, 'straight'));
    expect(routePoints(a, b, 'elbow', 'auto', 'auto')).toEqual(routePoints(a, b, 'elbow'));
  });

  it('routePoints_anUnknownAnchorKey_readsAsAuto', () => {
    expect(routePoints(a, b, 'straight', 'sideways', '')).toEqual(routePoints(a, b, 'straight'));
  });

  it('routePoints_straightWithAPinnedEnd_leavesThatSideMidpoint', () => {
    const points = routePoints(a, b, 'straight', 'top', 'auto');
    expect(points?.[0]).toEqual({ x: 50, y: 0 });
  });

  it('routePoints_straightWithOneAutoEnd_aimsAtThePinnedPointNotTheCardCentre', () => {
    // A's end is pinned to its top. B's automatic end must clip toward THAT point, or the
    // two halves of one line disagree about where the line is going.
    const points = routePoints(a, b, 'straight', 'top', 'auto');
    expect(points?.[1]).toEqual(rectEdgePoint(b, { x: 50, y: 0 }));
  });

  it('routePoints_straightWithBothEndsPinned_joinsTheTwoSideMidpoints', () => {
    expect(routePoints(a, b, 'straight', 'bottom', 'top')).toEqual([
      { x: 50, y: 100 },
      { x: 350, y: 0 },
    ]);
  });

  it('routePoints_elbowWithBothEndsPinnedToTheSameSide_leavesAndEntersSquareOn', () => {
    const points = routePoints(a, b, 'elbow', 'top', 'top');
    expect(points).not.toBeNull();
    const route = points!;
    // Both ends sit on their card's top edge and run straight up out of it.
    expect(route[0]).toEqual({ x: 50, y: 0 });
    expect(route[route.length - 1]).toEqual({ x: 350, y: 0 });
    expect(route[1]).toEqual({ x: 50, y: -12 });
    expect(route[route.length - 2]).toEqual({ x: 350, y: -12 });
    // And every segment is horizontal or vertical, which is what makes it an elbow.
    for (let i = 1; i < route.length; i += 1) {
      const same = route[i].x === route[i - 1].x || route[i].y === route[i - 1].y;
      expect(same).toBe(true);
    }
  });

  it('routePoints_elbowWithTwoStubsPointingAway_crossesOutsideBothOfThem', () => {
    // Both stubs run up, so the crossing has to sit above the higher of the two — halfway
    // between them would run back down through a card.
    const lower = box(300, 200);
    const route = routePoints(a, lower, 'elbow', 'top', 'top')!;
    const highest = Math.min(...route.map((p) => p.y));
    expect(highest).toBe(-12);
  });

  it('routePoints_twoOverlappingCards_stillDrawsNothingWhenAnEndIsPinned', () => {
    expect(routePoints(a, box(50, 50), 'elbow', 'right', 'left')).toBeNull();
  });

  it('sideMidpoint_eachSide_isTheMiddleOfThatBorder', () => {
    expect(sideMidpoint(a, 'top')).toEqual({ x: 50, y: 0 });
    expect(sideMidpoint(a, 'bottom')).toEqual({ x: 50, y: 100 });
    expect(sideMidpoint(a, 'left')).toEqual({ x: 0, y: 50 });
    expect(sideMidpoint(a, 'right')).toEqual({ x: 100, y: 50 });
  });

  it('sideNormal_eachSide_pointsOutOfTheCard', () => {
    expect(sideNormal('top')).toEqual({ x: 0, y: -1 });
    expect(sideNormal('bottom')).toEqual({ x: 0, y: 1 });
    expect(sideNormal('left')).toEqual({ x: -1, y: 0 });
    expect(sideNormal('right')).toEqual({ x: 1, y: 0 });
  });

  it('nearestSide_justAboveAWideCard_isTopNotASide', () => {
    // The point is further from the centre horizontally than vertically in raw units. It is
    // the card's own proportions that make Top the right answer.
    const wide = box(0, 0, 400, 60);
    expect(nearestSide(wide, { x: 260, y: -20 })).toBe('top');
  });

  it('nearestSide_besideACard_isTheSideItIsBeside', () => {
    expect(nearestSide(a, { x: 500, y: 60 })).toBe('right');
    expect(nearestSide(a, { x: -500, y: 60 })).toBe('left');
    expect(nearestSide(a, { x: 50, y: 900 })).toBe('bottom');
  });
});
