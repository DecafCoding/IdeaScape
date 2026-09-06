/**
 * Resize and move behaviour. Both are pure geometry: the card layer applies the world-space
 * delta these functions describe, and the 50 px floor lives in `resizeRect`, never in a
 * component.
 */
import { describe, expect, it } from 'vitest';
import { MIN_CARD_SIZE, resizeRect, screenToWorld, type ResizeHandle } from '../../../lib/geometry';

const rect = { x: 200, y: 200, width: 236, height: 150 };
const HANDLES: ResizeHandle[] = ['nw', 'ne', 'sw', 'se'];

describe('resize', () => {
  it.each(HANDLES)('resizeRect_%sDraggedFarInward_clampsAtFiftyPixelsOnBothAxes', (handle) => {
    const sign = handle === 'se' ? -1 : handle === 'nw' ? 1 : 1;
    const result = resizeRect(rect, handle, 5000 * sign, 5000 * sign);
    expect(result.width).toBeGreaterThanOrEqual(MIN_CARD_SIZE);
    expect(result.height).toBeGreaterThanOrEqual(MIN_CARD_SIZE);
  });

  it('resizeRect_topLeftHandle_movesTheOriginByExactlyTheDelta', () => {
    expect(resizeRect(rect, 'nw', 30, 20)).toEqual({
      x: 230,
      y: 220,
      width: 206,
      height: 130,
    });
  });

  it('resizeRect_bottomRightHandle_leavesTheOriginWhereItWas', () => {
    const result = resizeRect(rect, 'se', 30, 20);
    expect(result.x).toBe(rect.x);
    expect(result.y).toBe(rect.y);
  });

  it('resizeRect_clampedFromTheLeft_stopsTheOriginMovingPastTheFloor', () => {
    const result = resizeRect(rect, 'nw', 5000, 0);
    // The right edge is fixed, so the origin lands exactly 50 px short of it.
    expect(result.x + result.width).toBe(rect.x + rect.width);
    expect(result.width).toBe(MIN_CARD_SIZE);
  });

  it('resizeRect_hasNoMaximumSize', () => {
    const result = resizeRect(rect, 'se', 50_000, 50_000);
    expect(result.width).toBe(50_236);
    expect(result.height).toBe(50_150);
  });
});

describe('move', () => {
  /** The card layer divides the pointer delta by the zoom; this is that arithmetic. */
  function worldDelta(screenDx: number, screenDy: number, zoom: number) {
    return { dx: screenDx / zoom, dy: screenDy / zoom };
  }

  it.each([0.25, 0.5, 1, 2, 4])(
    'move_atZoom%s_appliesTheSameWorldDeltaToEverySelectedCard',
    (zoom) => {
      const cards = [
        { x: 0, y: 0 },
        { x: 500, y: 300 },
      ];
      const screenDx = 100;
      const screenDy = 60;
      const { dx, dy } = worldDelta(screenDx, screenDy, zoom);

      const moved = cards.map((c) => ({ x: c.x + dx, y: c.y + dy }));
      expect(moved[0].x - cards[0].x).toBeCloseTo(moved[1].x - cards[1].x);
      expect(moved[0].y - cards[0].y).toBeCloseTo(moved[1].y - cards[1].y);
      expect(moved[0].x).toBeCloseTo(screenDx / zoom);
    },
  );

  it('move_pointerDeltaAtAnyZoom_keepsTheCardUnderTheCursor', () => {
    const view = { x: -120, y: 40, zoom: 0.5 };
    const grabbed = screenToWorld({ x: 300, y: 200 }, view);
    const released = screenToWorld({ x: 400, y: 260 }, view);
    const { dx, dy } = worldDelta(100, 60, view.zoom);
    expect(released.x - grabbed.x).toBeCloseTo(dx);
    expect(released.y - grabbed.y).toBeCloseTo(dy);
  });
});
