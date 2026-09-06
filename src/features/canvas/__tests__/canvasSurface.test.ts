/**
 * The Milestone 3 checkpoint: store, transform, dot grid and cull are one consistent
 * system. Each of those tasks tests only its own half; this spec walks a scripted
 * pan-and-zoom path and asserts they agree at every step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { GRID_SIZE, LOW_ZOOM } from '../../../lib/geometry';
import { CULL_MARGIN_PX, cullWithCounts, visiblePlacements } from '../../../lib/culling';
import type { Placement } from '../../../lib/types';

vi.mock('../../../lib/ipc', () => ({ invokeSafe: vi.fn(), IpcError: class extends Error {} }));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const DotGrid = (await import('../DotGrid.svelte')).default;
const ZoomBar = (await import('../ZoomBar.svelte')).default;

function placement(id: number, x: number, y: number): Placement {
  return { id, canvas_id: 1, item_id: id, x, y, width: 236, height: 150, z_order: id };
}

const VIEWPORT = { width: 1000, height: 700 };

describe('the dot grid follows the view', () => {
  afterEach(cleanup);

  it.each([1, 0.5, 2])('dotGrid_atZoom%s_scalesItsPitchWithTheView', (zoom) => {
    const { getByTestId } = render(DotGrid, { props: { view: { x: 0, y: 0, zoom } } });
    expect(getByTestId('dot-grid').getAttribute('style')).toContain(
      `background-size: ${GRID_SIZE * zoom}px`,
    );
  });

  it('dotGrid_panned_offsetsItsBackgroundSoItTracksThePanExactly', () => {
    const { getByTestId } = render(DotGrid, { props: { view: { x: -30, y: 12, zoom: 1 } } });
    const style = getByTestId('dot-grid').getAttribute('style') ?? '';
    expect(style).toContain(`background-position: ${-30 % GRID_SIZE}px ${12 % GRID_SIZE}px`);
  });

  it('dotGrid_belowTheLowZoomThreshold_dropsToTheFinerPitch', () => {
    const { getByTestId } = render(DotGrid, {
      props: { view: { x: 0, y: 0, zoom: LOW_ZOOM - 0.1 } },
    });
    const grid = getByTestId('dot-grid');
    expect(grid.getAttribute('style')).toContain('background-size: 6px');
    expect(grid.className).toContain('faded');
  });
});

describe('the zoom bar reports the store', () => {
  afterEach(cleanup);

  it.each([
    [1, '100%'],
    [0.24, '24%'],
    [4, '400%'],
  ])('zoomBar_atZoom%s_readsThePercentage%s', (zoom, label) => {
    const { getByTestId } = render(ZoomBar, {
      props: { zoom, onZoomIn: () => {}, onZoomOut: () => {}, onZoomToFit: () => {} },
    });
    expect(getByTestId('zoom-percentage').textContent).toBe(label);
  });

  it('zoomBar_whenTheViewAlreadyHoldsEverything_dimsZoomToFit', () => {
    const { getByLabelText } = render(ZoomBar, {
      props: {
        zoom: 1,
        fitsAlready: true,
        onZoomIn: () => {},
        onZoomOut: () => {},
        onZoomToFit: () => {},
      },
    });
    expect(getByLabelText('Zoom To Fit').closest('button')).toBeDisabled();
  });

  it('zoomBar_everyIconOnlyControl_hasAnAccessibleName', () => {
    const { getByLabelText } = render(ZoomBar, {
      props: { zoom: 1, onZoomIn: () => {}, onZoomOut: () => {}, onZoomToFit: () => {} },
    });
    for (const name of ['Zoom In', 'Zoom Out', 'Zoom To Fit']) {
      expect(getByLabelText(name)).toBeInTheDocument();
    }
  });
});

describe('store, transform, grid and cull agree', () => {
  const cards = Array.from({ length: 1000 }, (_, i) =>
    placement(i + 1, (i % 40) * 300, Math.floor(i / 40) * 220),
  );

  beforeEach(() => {
    canvasStore.closeProject();
    for (const card of cards) canvasStore.upsertPlacement(card);
    canvasStore.setViewportSize(VIEWPORT);
  });

  const path = [
    { x: 0, y: 0, zoom: 1 },
    { x: -1200, y: -400, zoom: 1 },
    { x: -1200, y: -400, zoom: 0.5 },
    { x: -3000, y: -2000, zoom: 0.5 },
    { x: -3000, y: -2000, zoom: 2 },
    { x: 0, y: 0, zoom: 1 },
  ];

  it('scriptedPanAndZoom_atEveryStep_theVisibleSetMatchesThePureGeometry', () => {
    for (const step of path) {
      canvasStore.setView(step);
      const predicted = visiblePlacements(
        cards,
        canvasStore.view,
        canvasStore.viewportSize,
        CULL_MARGIN_PX,
      ).map((p) => p.id);
      const actual = visiblePlacements(
        canvasStore.orderedPlacements,
        canvasStore.view,
        canvasStore.viewportSize,
        CULL_MARGIN_PX,
      ).map((p) => p.id);
      expect(actual.sort()).toEqual(predicted.sort());
    }
  });

  it('scriptedPanAndZoom_atTheDefaultZoom_drawsUnderFifteenPercentOfTheTotal', () => {
    for (const step of path.filter((s) => s.zoom >= 1)) {
      canvasStore.setView(step);
      const { total, drawn } = cullWithCounts(
        canvasStore.orderedPlacements,
        canvasStore.view,
        canvasStore.viewportSize,
        CULL_MARGIN_PX,
      );
      expect(drawn / total, `drawn ${drawn} of ${total} at zoom ${step.zoom}`).toBeLessThan(0.15);
    }
  });

  it('scriptedPanAndZoom_atEveryStep_theTransformAndTheGridReadTheSameView', () => {
    for (const step of path) {
      canvasStore.setView(step);
      const { view } = canvasStore;
      const transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
      const pitch = view.zoom < LOW_ZOOM ? 6 : GRID_SIZE * view.zoom;
      const percentage = `${Math.round(view.zoom * 100)}%`;

      expect(transform).toContain(`${view.x}px`);
      expect(pitch).toBeGreaterThan(0);
      expect(percentage).toBe(`${Math.round(step.zoom * 100)}%`);
    }
  });

  it('setView_zoomBeyondTheClamps_isConstrainedBeforeAnythingReadsIt', () => {
    canvasStore.setView({ zoom: 50 });
    expect(canvasStore.view.zoom).toBe(4);
    canvasStore.setView({ zoom: 0.001 });
    expect(canvasStore.view.zoom).toBe(0.1);
  });
});
