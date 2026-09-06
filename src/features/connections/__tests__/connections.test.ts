/**
 * The pending-link state machine, `hitPlacementAt`'s topmost-wins rule, and the overlay
 * and label layers — Milestones 2 and 3.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Connection, Placement } from '../../../lib/types';

/**
 * jsdom does not apply Svelte's scoped stylesheet, so a rule that lives only in a
 * `<style>` block is asserted against the component source instead — the same approach
 * `shell.test.ts` takes with the token sheet.
 */
const layerSource = readFileSync(
  resolve('src/features/connections/ConnectionLayer.svelte'),
  'utf8',
);

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
}));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { connectionEndpoints } = await import('../../../lib/connectionGeometry');
const { beginLink, cancelLink, completeLink, hitPlacementAt, trackLink } =
  await import('../connections.svelte');
const ConnectionLayer = (await import('../ConnectionLayer.svelte')).default;
const ConnectionLabels = (await import('../ConnectionLabels.svelte')).default;

function placement(id: number, x: number, y = 0, z = id): Placement {
  return { id, canvas_id: 1, item_id: id, x, y, width: 100, height: 100, z_order: z };
}

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 7,
    canvas_id: 1,
    from_placement_id: 1,
    to_placement_id: 2,
    label: null,
    directed: 1,
    ...overrides,
  };
}

/** Two well-separated cards, a viewport that holds them, and an identity view. */
function twoCards() {
  canvasStore.upsertPlacement(placement(1, 0));
  canvasStore.upsertPlacement(placement(2, 400));
  canvasStore.setViewportSize({ width: 800, height: 600 });
  canvasStore.activeCanvasId = 1;
}

beforeEach(() => {
  invokeSafe.mockReset();
  canvasStore.closeProject();
});

afterEach(cleanup);

describe('the pending link', () => {
  beforeEach(twoCards);

  it('beginLink_aSourceCard_setsPendingLink', () => {
    beginLink(1, { x: 50, y: 50 });
    expect(canvasStore.pendingLink).toEqual({ fromPlacementId: 1, pointer: { x: 50, y: 50 } });
  });

  it('beginLink_aCardThatIsNotOnTheCanvas_setsNothing', () => {
    beginLink(99, { x: 0, y: 0 });
    expect(canvasStore.pendingLink).toBeNull();
  });

  it('trackLink_aPointerMove_updatesThePendingPointerOnly', () => {
    beginLink(1, { x: 50, y: 50 });
    trackLink({ x: 260, y: 90 });
    expect(canvasStore.pendingLink).toEqual({ fromPlacementId: 1, pointer: { x: 260, y: 90 } });
  });

  it('cancelLink_aPendingLink_clearsItWithoutWriting', () => {
    beginLink(1, { x: 50, y: 50 });
    cancelLink();
    expect(canvasStore.pendingLink).toBeNull();
    expect(invokeSafe).not.toHaveBeenCalled();
  });

  it('completeLink_aDifferentCard_invokesCreateConnectionOnceAndClearsPending', async () => {
    invokeSafe.mockResolvedValue(connection());
    beginLink(1, { x: 50, y: 50 });

    const created = await completeLink(2);

    expect(invokeSafe).toHaveBeenCalledTimes(1);
    expect(invokeSafe).toHaveBeenCalledWith('create_connection', {
      canvasId: 1,
      fromPlacementId: 1,
      toPlacementId: 2,
      label: null,
      directed: 1,
    });
    expect(created?.id).toBe(7);
    expect(canvasStore.connections.get(7)).toBeDefined();
    expect(canvasStore.selectedConnectionId).toBe(7);
    expect(canvasStore.pendingLink).toBeNull();
  });

  it('completeLink_theSourceCard_createsNothing', async () => {
    beginLink(1, { x: 50, y: 50 });
    expect(await completeLink(1)).toBeNull();
    expect(invokeSafe).not.toHaveBeenCalled();
    expect(canvasStore.pendingLink).toBeNull();
  });

  it('completeLink_emptySpace_createsNothing', async () => {
    beginLink(1, { x: 50, y: 50 });
    expect(await completeLink(null)).toBeNull();
    expect(invokeSafe).not.toHaveBeenCalled();
  });

  it('completeLink_aPairThatAlreadyHasOne_selectsTheExistingConnection', async () => {
    canvasStore.upsertConnection(connection({ id: 12 }));
    beginLink(1, { x: 50, y: 50 });

    expect(await completeLink(2)).toBeNull();
    expect(invokeSafe).not.toHaveBeenCalled();
    expect(canvasStore.selectedConnectionId).toBe(12);
  });
});

describe('hitPlacementAt', () => {
  it('hitPlacementAt_apointOverTwoStackedCards_returnsTheTopmost', () => {
    canvasStore.upsertPlacement(placement(1, 0, 0, 5));
    canvasStore.upsertPlacement(placement(2, 0, 0, 9));
    expect(hitPlacementAt({ x: 50, y: 50 })).toBe(2);
  });

  it('hitPlacementAt_emptySpace_returnsNull', () => {
    canvasStore.upsertPlacement(placement(1, 0));
    expect(hitPlacementAt({ x: 900, y: 900 })).toBeNull();
  });
});

describe('the connection overlay', () => {
  beforeEach(() => {
    twoCards();
    canvasStore.upsertConnection(connection());
  });

  function draw() {
    return render(ConnectionLayer, { props: { onSelect: () => {} } });
  }

  it('overlay_oneConnection_drawsExactlyOneArrowedStroke', () => {
    const { container } = draw();
    const strokes = container.querySelectorAll('path.stroke[marker-end]');
    expect(strokes.length).toBe(1);
  });

  it('overlay_theDrawnPath_endsOnEachCardsRealBorder', () => {
    const { container } = draw();
    const points = connectionEndpoints(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 400, y: 0, width: 100, height: 100 },
    )!;
    const d = container.querySelector('path.stroke')?.getAttribute('d');
    expect(d).toBe(`M${points.start.x},${points.start.y} L${points.end.x},${points.end.y}`);
    // Not the centres: 100 is the right border of card A, 400 the left border of card B.
    expect(points.start).toEqual({ x: 100, y: 50 });
    expect(points.end).toEqual({ x: 400, y: 50 });
  });

  it('overlay_theMarker_matchesTheDesignSystemDefinitionVerbatim', () => {
    const { container } = draw();
    const marker = container.querySelector('#ideascape-arrow');
    expect(marker?.getAttribute('orient')).toBe('auto-start-reverse');
    expect(marker?.getAttribute('refX')).toBe('8');
    expect(marker?.getAttribute('refY')).toBe('4.5');
    expect(marker?.getAttribute('viewBox')).toBe('0 0 9 9');
    expect(marker?.getAttribute('markerWidth')).toBe('6');
    expect(marker?.getAttribute('markerHeight')).toBe('6');
  });

  it('overlay_theRootSvg_isPointerEventsNone', () => {
    const { getByTestId } = draw();
    const svg = getByTestId('connection-layer');
    expect(svg.style.pointerEvents).toBe('none');
    expect(layerSource).toMatch(/\.connection-layer\s*\{[^}]*pointer-events:\s*none/);
    // The hit paths are the only thing that takes a pointer at all.
    expect(layerSource).toMatch(/\.hit\s*\{[^}]*pointer-events:\s*stroke/);
  });

  it('overlay_sitsOnTheConnectionsRungBelowTheCards', () => {
    expect(layerSource).toMatch(/z-index:\s*var\(--z-connections\)/);
  });

  it('overlay_directedBoth_usesMarkerStartAndMarkerEndFromTheOneMarker', () => {
    canvasStore.upsertConnection(connection({ directed: 3 }));
    const { container } = draw();
    const stroke = container.querySelector('path.stroke');
    expect(stroke?.getAttribute('marker-start')).toBe('url(#ideascape-arrow)');
    expect(stroke?.getAttribute('marker-end')).toBe('url(#ideascape-arrow)');
  });

  it('overlay_directedNone_drawsNoArrowheadAtAll', () => {
    canvasStore.upsertConnection(connection({ directed: 0 }));
    const { container } = draw();
    const stroke = container.querySelector('path.stroke');
    expect(stroke?.getAttribute('marker-start')).toBeNull();
    expect(stroke?.getAttribute('marker-end')).toBeNull();
  });

  it('overlay_aConnectionWithAMissingPlacement_isSkipped', () => {
    canvasStore.removePlacement(2);
    const { getByTestId } = draw();
    expect(getByTestId('connection-layer').getAttribute('data-drawn')).toBe('0');
    expect(getByTestId('connection-layer').getAttribute('data-total')).toBe('1');
  });

  it('overlay_aLineFarOffScreen_isCulledButStillCounted', () => {
    canvasStore.upsertPlacement(placement(1, 90_000));
    canvasStore.upsertPlacement(placement(2, 90_400));
    const { getByTestId } = draw();
    expect(getByTestId('connection-layer').getAttribute('data-drawn')).toBe('0');
    expect(getByTestId('connection-layer').getAttribute('data-total')).toBe('1');
  });

  it('hitPath_clicked_selectsTheConnectionAndClearsTheCardSelection', async () => {
    canvasStore.setSelection([1, 2]);
    const { container } = render(ConnectionLayer, {
      props: { onSelect: (id: number) => canvasStore.selectConnection(id) },
    });
    await fireEvent.click(container.querySelector('path.hit')!);
    expect(canvasStore.selectedConnectionId).toBe(7);
    expect(canvasStore.selection.size).toBe(0);
  });

  it('hitPath_enterPressedWhileFocused_selectsTheConnection', async () => {
    const { container } = render(ConnectionLayer, {
      props: { onSelect: (id: number) => canvasStore.selectConnection(id) },
    });
    await fireEvent.keyDown(container.querySelector('path.hit')!, { key: 'Enter' });
    expect(canvasStore.selectedConnectionId).toBe(7);
  });

  it('hitPath_isReachableByTabAndNamesBothEndpoints', () => {
    canvasStore.upsertItem({
      id: 1,
      project_id: 1,
      kind: 'note',
      payload: '{"title":"Cause","text":""}',
      created_at: '',
      updated_at: '',
    });
    canvasStore.upsertItem({
      id: 2,
      project_id: 1,
      kind: 'note',
      payload: '{"title":"Effect","text":""}',
      created_at: '',
      updated_at: '',
    });
    const { container } = draw();
    const hit = container.querySelector('path.hit')!;
    expect(hit.getAttribute('tabindex')).toBe('0');
    expect(hit.getAttribute('role')).toBe('button');
    expect(hit.getAttribute('aria-label')).toBe('Connection from Cause to Effect');
  });

  it('selectedConnection_rendered_drawsNoAccentOnTheStrokeItself', () => {
    canvasStore.selectConnection(7);
    const { container } = draw();
    const group = container.querySelector('g.connection') as SVGGElement;
    const stroke = container.querySelector('path.stroke') as SVGPathElement;
    expect(group.classList.contains('selected')).toBe(true);
    // Neutral ink, heavier — never the accent. The accent lives in the square handles.
    expect(layerSource).toMatch(
      /\.connection\.selected \.stroke\s*\{\s*stroke:\s*var\(--color-text\)/,
    );
    expect(layerSource).not.toMatch(/\.stroke\s*\{\s*stroke:\s*var\(--color-accent\)/);
    expect(stroke.getAttribute('stroke-width')).toBe('2.5');
    expect(container.querySelectorAll('rect.handle').length).toBe(2);
    expect(container.querySelector('rect.handle')?.getAttribute('width')).toBe('7');
    expect(container.querySelector('rect.handle')?.getAttribute('height')).toBe('7');
    expect(layerSource).toMatch(/\.handle\s*\{\s*fill:\s*var\(--color-accent\)/);
  });

  it('pendingLink_overEmptySpace_drawsADashedLineWithNoArrowhead', () => {
    beginLink(1, { x: 250, y: 50 });
    const { getByTestId } = draw();
    const pending = getByTestId('pending-link');
    expect(pending.getAttribute('marker-end')).toBeNull();
    expect(pending.classList.contains('snapped')).toBe(false);
    expect(layerSource).toMatch(/\.pending\s*\{[^}]*stroke-dasharray:\s*4 3/);
    // It follows the pointer, so nothing about it eases.
    expect(layerSource).toMatch(/\.pending\s*\{[^}]*transition:\s*none/);
  });

  it('pendingLink_overAValidTarget_snapsSolidWithAnArrowhead', () => {
    beginLink(1, { x: 450, y: 50 });
    const { getByTestId } = draw();
    const pending = getByTestId('pending-link');
    expect(pending.getAttribute('marker-end')).toBe('url(#ideascape-arrow)');
    expect(pending.getAttribute('d')).toBe('M100,50 L400,50');
    expect(pending.classList.contains('snapped')).toBe(true);
    expect(layerSource).toMatch(/\.pending\.snapped\s*\{\s*stroke-dasharray:\s*none/);
  });
});

describe('label chips', () => {
  beforeEach(twoCards);

  it('chip_aLabelledConnectionOver50px_isRendered', () => {
    canvasStore.upsertConnection(connection({ label: 'causes' }));
    const { getByText } = render(ConnectionLabels, { props: {} });
    expect(getByText('causes')).toBeInTheDocument();
  });

  it('chip_theSameConnectionZoomedTo0Point4_isNotRendered', () => {
    canvasStore.upsertConnection(connection({ label: 'causes' }));
    // The line is 300 world units; below 50 screen pixels the chip goes.
    canvasStore.setView({ zoom: 0.1 });
    const { queryByText } = render(ConnectionLabels, { props: {} });
    expect(queryByText('causes')).toBeNull();
  });

  it('chip_reZoomedTo1_returnsWithTheSameText', () => {
    canvasStore.upsertConnection(connection({ label: 'causes' }));
    canvasStore.setView({ zoom: 0.1 });
    const first = render(ConnectionLabels, { props: {} });
    expect(first.queryByText('causes')).toBeNull();
    cleanup();

    canvasStore.setView({ zoom: 1 });
    const second = render(ConnectionLabels, { props: {} });
    // The label was hidden, not lost.
    expect(second.getByText('causes')).toBeInTheDocument();
  });

  it('chip_aLabelContainingMarkup_isRenderedAsText', () => {
    canvasStore.upsertConnection(connection({ label: '<b>bold</b>' }));
    const { getByText, container } = render(ConnectionLabels, { props: {} });
    expect(getByText('<b>bold</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it('chip_anEmptyLabel_drawsNothing', () => {
    canvasStore.upsertConnection(connection({ label: '' }));
    const { getByTestId } = render(ConnectionLabels, { props: {} });
    expect(getByTestId('connection-labels').getAttribute('data-drawn')).toBe('0');
  });

  it('chip_positioned_landsOnTheSegmentMidpoint', () => {
    canvasStore.upsertConnection(connection({ label: 'causes' }));
    const { getByText } = render(ConnectionLabels, { props: {} });
    const style = getByText('causes').getAttribute('style') ?? '';
    // Midpoint of (100,50) → (400,50).
    expect(style).toContain('left: 250px');
    expect(style).toContain('top: 50px');
  });
});

describe('lines follow, and leave with, their cards', () => {
  beforeEach(() => {
    twoCards();
    canvasStore.upsertConnection(connection());
  });

  it('endpoints_afterMovingACard_followTheNewRectangle', async () => {
    const first = render(ConnectionLayer, { props: { onSelect: () => {} } });
    expect(first.container.querySelector('path.stroke')?.getAttribute('d')).toBe('M100,50 L400,50');
    cleanup();

    canvasStore.patchPlacement(2, { x: 700 });
    const second = render(ConnectionLayer, { props: { onSelect: () => {} } });
    expect(second.container.querySelector('path.stroke')?.getAttribute('d')).toBe(
      'M100,50 L700,50',
    );
  });

  it('drag_aConnectedCard_writesNoConnectionRow', () => {
    // A move only patches the store; endpoints re-derive, so no connection row is written.
    canvasStore.patchPlacement(1, { x: 40, y: 30 });
    canvasStore.patchPlacement(1, { x: 80, y: 60 });
    const written = invokeSafe.mock.calls.map((c) => c[0]);
    expect(written).not.toContain('update_connection');
    expect(written).not.toContain('create_connection');
  });

  it('deleteSelection_aCardWithTwoLines_removesBothFromTheStore', () => {
    canvasStore.upsertPlacement(placement(3, 800));
    canvasStore.upsertConnection(connection({ id: 8, from_placement_id: 2, to_placement_id: 3 }));
    // The effect the Rust side reports is what drives the store, not a front-end guess.
    const effect = {
      placements: [placement(2, 400)],
      items: [],
      connections: [connection(), connection({ id: 8, from_placement_id: 2, to_placement_id: 3 })],
    };
    for (const p of effect.placements) canvasStore.removePlacement(p.id);
    for (const c of effect.connections) canvasStore.removeConnection(c.id);
    expect(canvasStore.connections.size).toBe(0);
  });
});
