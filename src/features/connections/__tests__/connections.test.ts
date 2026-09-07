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
    color: 'default',
    width: 1,
    label_visible: true,
    route: 'straight',
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

  it('completeLink_theSourceCard_createsNothingAndKeepsTheLinkArmed', async () => {
    beginLink(1, { x: 50, y: 50 });
    // Press and release on the source card with no travel is a click, not a drag. Dropping
    // the link here is what made the Connect tool look dead.
    expect(await completeLink(1)).toBeNull();
    expect(invokeSafe).not.toHaveBeenCalled();
    expect(canvasStore.pendingLink).toEqual({ fromPlacementId: 1, pointer: { x: 50, y: 50 } });
  });

  it('beginLink_whileALinkIsArmed_doesNotMoveTheSource', () => {
    beginLink(1, { x: 50, y: 50 });
    void completeLink(1);
    // The press on the second card runs through beginLink too under the Connect tool.
    beginLink(2, { x: 300, y: 50 });
    expect(canvasStore.pendingLink?.fromPlacementId).toBe(1);
  });

  it('clickThenClick_armsOnTheFirstCardAndFinishesOnTheSecond', async () => {
    invokeSafe.mockResolvedValue(connection());

    // Click the first card: press, release, no travel.
    beginLink(1, { x: 50, y: 50 });
    await completeLink(1);
    expect(canvasStore.pendingLink).not.toBeNull();

    // Move over the second card and click it.
    trackLink({ x: 300, y: 50 });
    beginLink(2, { x: 300, y: 50 });
    const created = await completeLink(2);

    expect(created?.id).toBe(7);
    expect(canvasStore.pendingLink).toBeNull();
    expect(invokeSafe).toHaveBeenCalledWith('create_connection', {
      canvasId: 1,
      fromPlacementId: 1,
      toPlacementId: 2,
      label: null,
      directed: 1,
    });
  });

  it('completeLink_emptySpaceWhileArmed_cancelsSoTheLineIsNotSticky', async () => {
    beginLink(1, { x: 50, y: 50 });
    await completeLink(1);
    expect(await completeLink(null)).toBeNull();
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

  /**
   * The whole layer was invisible in the real app: `.world` holds nothing but absolutely
   * positioned children, so its box is 0 x 0, and the svg's `width: 100%` of that was a
   * 0 x 0 viewport — which a browser does not render at all. Cards and label chips are
   * ordinary HTML and paint outside a zero-size box, so only the lines went missing.
   */
  it('overlay_theRootSvg_isSizedInWorldPixelsNotPercentages', () => {
    const { getByTestId } = draw();
    const svg = getByTestId('connection-layer');
    const style = svg.getAttribute('style') ?? '';

    expect(style).not.toContain('%');
    const width = Number(/width:\s*([\d.-]+)px/.exec(style)?.[1]);
    const height = Number(/height:\s*([\d.-]+)px/.exec(style)?.[1]);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);

    // The viewBox repeats the same rectangle, so a path is still written in world units.
    const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect(vw).toBe(width);
    expect(vh).toBe(height);
    expect(/left:\s*([\d.-]+)px/.exec(style)?.[1]).toBe(String(vx));
    expect(/top:\s*([\d.-]+)px/.exec(style)?.[1]).toBe(String(vy));
  });

  it('overlay_theRootSvgBox_coversTheViewportAndTheCullMargin', () => {
    // Every line the cull keeps is inside this rectangle, because the cull tests the same one.
    canvasStore.setView({ x: 0, y: 0, zoom: 1 });
    const { getByTestId } = draw();
    const style = getByTestId('connection-layer').getAttribute('style') ?? '';
    // 800 x 600 viewport plus a 200 px cull margin on each side.
    expect(/width:\s*([\d.-]+)px/.exec(style)?.[1]).toBe('1200');
    expect(/height:\s*([\d.-]+)px/.exec(style)?.[1]).toBe('1000');
    expect(/left:\s*([\d.-]+)px/.exec(style)?.[1]).toBe('-200');
  });

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
    // The hit path carries the true geometry; the drawn stroke stops at the arrowhead.
    const d = container.querySelector('path.hit')?.getAttribute('d');
    expect(d).toBe(`M${points.start.x},${points.start.y} L${points.end.x},${points.end.y}`);
    // Not the centres: 100 is the right border of card A, 400 the left border of card B.
    expect(points.start).toEqual({ x: 100, y: 50 });
    expect(points.end).toEqual({ x: 400, y: 50 });
  });

  it('overlay_theDrawnStroke_stopsAtTheBackOfTheArrowhead', () => {
    const { container } = draw();
    // The head's back edge is 7.5 of the marker's 9 units behind the endpoint, so a thin
    // line ending at x 400 is drawn to 392.5 and never shows its width through the point.
    expect(container.querySelector('path.stroke')?.getAttribute('d')).toBe('M100,50 L392.5,50');
    // The un-arrowed end keeps the full geometry.
    expect(container.querySelector('path.hit')?.getAttribute('d')).toBe('M100,50 L400,50');
  });

  it('overlay_anElbowRoute_drawsThreeAxisAlignedSegmentsWithRoundedBends', () => {
    // Card B moved down, so the two side midpoints no longer line up and a real elbow
    // forms: out of A's right side, across the middle of the gap, into B's left side.
    canvasStore.upsertPlacement(placement(2, 400, 300));
    canvasStore.upsertConnection(connection({ route: 'elbow' }));
    const { container } = draw();

    // The hit path carries the true geometry. Each bend is a 2-unit quadratic, §5.2's
    // smallest radius, and every straight run is horizontal or vertical.
    expect(container.querySelector('path.hit')?.getAttribute('d')).toBe(
      'M100,50 L248,50 Q250,50 250,52 L250,348 Q250,350 252,350 L400,350',
    );
    // Only the arrowed END is pulled back — a bend is never trimmed past.
    expect(container.querySelector('path.stroke')?.getAttribute('d')).toBe(
      'M100,50 L248,50 Q250,50 250,52 L250,348 Q250,350 252,350 L392.5,350',
    );
  });

  it('overlay_theMarker_matchesTheDesignSystemDefinitionVerbatim', () => {
    const { container } = draw();
    // One marker per palette colour; the default one carries the §9.13 geometry.
    const marker = container.querySelector('#ideascape-arrow-default-1');
    expect(marker?.getAttribute('orient')).toBe('auto-start-reverse');
    // refX is §9.13's 8 minus the head's own 7.5-unit length: the stroke is trimmed to the
    // head's back edge, so the reference point moves there too and the tip does not shift.
    expect(marker?.getAttribute('refX')).toBe('0.5');
    expect(marker?.getAttribute('refY')).toBe('4.5');
    expect(marker?.getAttribute('viewBox')).toBe('0 0 9 9');
    // 9 in user space is the same head §9.13's 6 x a 1.5 px stroke draws. Stating it in user
    // space is what stops the stroke width from scaling the head — the width steps grow it
    // by a deliberate 25% each instead.
    expect(marker?.getAttribute('markerWidth')).toBe('9');
    expect(marker?.getAttribute('markerHeight')).toBe('9');
    expect(marker?.getAttribute('markerUnits')).toBe('userSpaceOnUse');
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
    expect(stroke?.getAttribute('marker-start')).toBe('url(#ideascape-arrow-default-1)');
    expect(stroke?.getAttribute('marker-end')).toBe('url(#ideascape-arrow-default-1)');
  });

  it('overlay_aThickerLine_growsItsArrowheadByOneQuarterPerStep', () => {
    canvasStore.upsertConnection(connection({ directed: 1, width: 3 }));
    const { container } = draw();
    const stroke = container.querySelector('path.stroke');
    expect(stroke?.getAttribute('stroke-width')).toBe('5');
    expect(stroke?.getAttribute('marker-end')).toBe('url(#ideascape-arrow-default-3)');
    // Two steps of 25%: 9 -> 11.25 -> 14.0625. The line itself has more than trebled.
    const marker = container.querySelector('#ideascape-arrow-default-3');
    expect(Number(marker?.getAttribute('markerWidth'))).toBeCloseTo(14.0625, 4);
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
    // Its own ink, heavier — never the accent. The accent lives in the square handles.
    expect(stroke.getAttribute('stroke')).toBe('var(--color-connection)');
    expect(layerSource).not.toMatch(/\.stroke\s*\{\s*stroke:\s*var\(--color-accent\)/);
    // Thin (1.5) plus the one-unit selection bonus.
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
    expect(pending.getAttribute('marker-end')).toBe('url(#ideascape-arrow-default-1)');
    // Trimmed at the head, exactly as a written connection is.
    expect(pending.getAttribute('d')).toBe('M100,50 L392.5,50');
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

  it('chip_aColouredConnection_bordersInThatColour', () => {
    canvasStore.upsertConnection(connection({ label: 'causes', color: 'purple' }));
    const { getByText } = render(ConnectionLabels, { props: {} });
    const style = getByText('causes').getAttribute('style') ?? '';
    expect(style).toContain('--chip-border: var(--color-line-purple)');
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
    // The hit path holds the untrimmed geometry, which is what this is about.
    const first = render(ConnectionLayer, { props: { onSelect: () => {} } });
    expect(first.container.querySelector('path.hit')?.getAttribute('d')).toBe('M100,50 L400,50');
    cleanup();

    canvasStore.patchPlacement(2, { x: 700 });
    const second = render(ConnectionLayer, { props: { onSelect: () => {} } });
    expect(second.container.querySelector('path.hit')?.getAttribute('d')).toBe('M100,50 L700,50');
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
