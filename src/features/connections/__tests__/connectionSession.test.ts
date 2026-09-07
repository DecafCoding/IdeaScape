/**
 * The phase gate, driven as a script: the numbered session `scripts/phase-2-session.md`
 * records, run against the real store, the real components and a fake command seam whose
 * call log is asserted at every step.
 *
 * Each `it` here is one numbered step in that artefact, so a failure names the step that
 * broke rather than "the session".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import type {
  Connection,
  DeleteEffect,
  Item,
  Placement,
  PlacementWithItem,
} from '../../../lib/types';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
}));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { completeLink, beginLink, deleteConnections, updateConnection } =
  await import('../connections.svelte');
const { deleteCardsCommand } = await import('../../undo/commands');
const ConnectionLayer = (await import('../ConnectionLayer.svelte')).default;
const ConnectionLabels = (await import('../ConnectionLabels.svelte')).default;

/** A fake project: one canvas, cards and connections in memory, mirroring the Rust rules. */
class FakeProject {
  cards = new Map<number, PlacementWithItem>();
  rows = new Map<number, Connection>();
  nextPlacementId = 1;
  nextItemId = 1;
  nextConnectionId = 1;

  note(x: number, y = 0): PlacementWithItem {
    const placement: Placement = {
      id: this.nextPlacementId++,
      canvas_id: 1,
      item_id: this.nextItemId,
      x,
      y,
      width: 100,
      height: 100,
      z_order: this.cards.size,
    };
    const item: Item = {
      id: this.nextItemId++,
      project_id: 1,
      kind: 'note',
      payload: `{"title":"Note ${placement.id}","text":""}`,
      created_at: '',
      updated_at: '',
    };
    const card = { placement, item };
    this.cards.set(placement.id, card);
    return card;
  }

  handle(name: string, args: Record<string, unknown>): unknown {
    if (name === 'list_placements') return [...this.cards.values()];
    if (name === 'list_connections') return [...this.rows.values()];

    if (name === 'create_connection') {
      const from = args.fromPlacementId as number;
      const to = args.toPlacementId as number;
      if (from === to) throw new Error('a card cannot be connected to itself');
      for (const r of this.rows.values()) {
        if (r.from_placement_id === from && r.to_placement_id === to) {
          throw new Error('those two cards are already connected');
        }
      }
      if (!this.cards.has(from) || !this.cards.has(to)) throw new Error('foreign key');
      const label = args.label as string | null;
      const row: Connection = {
        id: this.nextConnectionId++,
        canvas_id: 1,
        from_placement_id: from,
        to_placement_id: to,
        label: label === null || label.trim() === '' ? null : label,
        directed: args.directed as number,
        color: 'default',
        width: 1,
        label_visible: true,
        route: 'straight',
      };
      this.rows.set(row.id, row);
      return row;
    }

    if (name === 'update_connection') {
      const row = this.rows.get(args.connectionId as number);
      if (!row) throw new Error('not found');
      const label = args.label as string | null;
      const next: Connection = {
        ...row,
        label: label === null || label.trim() === '' ? null : label,
        directed: args.directed as number,
        color: (args.color as string | undefined) ?? row.color,
        width: (args.width as number | undefined) ?? row.width,
        label_visible: (args.labelVisible as boolean | undefined) ?? row.label_visible,
      };
      this.rows.set(next.id, next);
      return next;
    }

    if (name === 'delete_connections') {
      const removed: Connection[] = [];
      for (const id of args.ids as number[]) {
        const row = this.rows.get(id);
        if (!row) continue;
        removed.push(row);
        this.rows.delete(id);
      }
      return removed;
    }

    if (name === 'delete_placements') {
      const effect: DeleteEffect = { placements: [], items: [], connections: [], assets: [] };
      const seen = new Set<number>();
      for (const id of args.ids as number[]) {
        const card = this.cards.get(id);
        if (!card) continue;
        for (const row of this.rows.values()) {
          if (row.from_placement_id !== id && row.to_placement_id !== id) continue;
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          effect.connections.push(row);
        }
        for (const row of effect.connections) this.rows.delete(row.id);
        this.cards.delete(id);
        effect.placements.push(card.placement);
        effect.items.push(card.item);
      }
      return effect;
    }

    if (name === 'restore_card') {
      // An undo names the ids the delete removed and gets them back, exactly as Rust does:
      // ids are AUTOINCREMENT and never re-issued, so the old id is always free. A duplicate
      // sends no ids and takes new ones.
      const card = this.note(args.x as number, args.y as number);
      const placementId = args.placementId as number | null;
      const itemId = args.itemId as number | null;
      if (placementId === null || placementId === undefined) return card;
      this.cards.delete(card.placement.id);
      const restored: PlacementWithItem = {
        placement: { ...card.placement, id: placementId, item_id: itemId ?? card.item.id },
        item: { ...card.item, id: itemId ?? card.item.id },
      };
      this.cards.set(placementId, restored);
      return restored;
    }

    if (name === 'restore_connection') {
      // The line goes back under its own id, so an edit still on the stack keeps naming it.
      const row = args.connection as Connection;
      const live = this.rows.get(row.id);
      if (live) return live;
      if (!this.cards.has(row.from_placement_id)) throw new Error('foreign key');
      if (!this.cards.has(row.to_placement_id)) throw new Error('foreign key');
      this.rows.set(row.id, row);
      return row;
    }

    throw new Error(`unexpected command ${name}`);
  }
}

let project: FakeProject;

beforeEach(async () => {
  cleanup();
  project = new FakeProject();
  invokeSafe.mockReset();
  invokeSafe.mockImplementation((name: string, args: Record<string, unknown> = {}) =>
    Promise.resolve(project.handle(name, args)),
  );
  canvasStore.closeProject();
  canvasStore.setViewportSize({ width: 1200, height: 800 });
  canvasStore.activeCanvasId = 1;
});

function drawnConnections(): number {
  const { getByTestId } = render(ConnectionLayer, { props: { onSelect: () => {} } });
  const count = Number(getByTestId('connection-layer').getAttribute('data-drawn'));
  cleanup();
  return count;
}

function drawnChips(): number {
  const { getByTestId } = render(ConnectionLabels, { props: {} });
  const count = Number(getByTestId('connection-labels').getAttribute('data-drawn'));
  cleanup();
  return count;
}

async function link(from: number, to: number): Promise<Connection | null> {
  beginLink(from, { x: 0, y: 0 });
  return completeLink(to);
}

describe('the phase 2 gate session', () => {
  it('step1_createSeveralNotes_theyAllLandOnTheCanvas', async () => {
    for (let n = 0; n < 4; n += 1) canvasStore.upsertCard(project.note(n * 300));
    await canvasStore.loadCanvas(1);
    expect(canvasStore.cardCount).toBe(4);
  });

  it('step2_connectThem_everyLineIsWrittenAndDrawn', async () => {
    for (let n = 0; n < 4; n += 1) canvasStore.upsertCard(project.note(n * 300));
    for (const [from, to] of [
      [1, 2],
      [2, 3],
      [3, 4],
    ]) {
      expect(await link(from, to)).not.toBeNull();
    }
    expect(project.rows.size).toBe(3);
    expect(canvasStore.connections.size).toBe(3);
    expect(drawnConnections()).toBe(3);
  });

  it('step3_labelThreeLines_theChipsAppear', async () => {
    for (let n = 0; n < 4; n += 1) canvasStore.upsertCard(project.note(n * 300));
    const made = [await link(1, 2), await link(2, 3), await link(3, 4)];
    for (const [i, row] of made.entries()) {
      await updateConnection(
        row!.id,
        `edge ${i + 1}`,
        row!.directed,
        row!.color,
        row!.width,
        row!.label_visible,
        row!.route,
      );
    }
    expect([...project.rows.values()].map((r) => r.label)).toEqual(['edge 1', 'edge 2', 'edge 3']);
    expect(drawnChips()).toBe(3);
  });

  it('step4_flipADirection_theRowAndTheMarkerFollow', async () => {
    canvasStore.upsertCard(project.note(0));
    canvasStore.upsertCard(project.note(300));
    const row = (await link(1, 2))!;
    expect(row.directed).toBe(1);

    await updateConnection(
      row.id,
      row.label,
      2,
      row.color,
      row.width,
      row.label_visible,
      row.route,
    );
    expect(project.rows.get(row.id)?.directed).toBe(2);

    // Deselect first: a freshly drawn line is selected, and a selected line draws the
    // accent marker rather than the resting one.
    canvasStore.selectConnection(null);
    const { container } = render(ConnectionLayer, { props: { onSelect: () => {} } });
    const stroke = container.querySelector('path.stroke');
    expect(stroke?.getAttribute('marker-start')).toBe('url(#ideascape-arrow-default-1)');
    expect(stroke?.getAttribute('marker-end')).toBeNull();
  });

  it('step5_moveAConnectedCard_theLineFollowsAndNoConnectionRowIsWritten', async () => {
    canvasStore.upsertCard(project.note(0));
    canvasStore.upsertCard(project.note(300));
    await link(1, 2);

    const { container } = render(ConnectionLayer, { props: { onSelect: () => {} } });
    // The hit path holds the untrimmed geometry; the stroke stops at the arrowhead.
    expect(container.querySelector('path.hit')?.getAttribute('d')).toBe('M100,50 L300,50');
    cleanup();

    invokeSafe.mockClear();
    canvasStore.patchPlacement(2, { x: 700 });
    const second = render(ConnectionLayer, { props: { onSelect: () => {} } });
    expect(second.container.querySelector('path.hit')?.getAttribute('d')).toBe('M100,50 L700,50');
    // The move wrote nothing at all to the connection table.
    expect(invokeSafe.mock.calls.map((c) => c[0])).not.toContain('update_connection');
  });

  it('step6_zoomOutPastFiftyPixelsAndBack_theChipGoesAndReturnsUnchanged', async () => {
    canvasStore.upsertCard(project.note(0));
    canvasStore.upsertCard(project.note(300));
    const row = (await link(1, 2))!;
    await updateConnection(
      row.id,
      'because',
      row.directed,
      row.color,
      row.width,
      row.label_visible,
      row.route,
    );

    canvasStore.setView({ zoom: 1 });
    expect(drawnChips()).toBe(1);

    // 200 world units of line at 0.2 is 40 screen pixels: below the threshold.
    canvasStore.setView({ zoom: 0.2 });
    expect(drawnChips()).toBe(0);
    // The label was hidden, not lost.
    expect(canvasStore.connections.get(row.id)?.label).toBe('because');

    canvasStore.setView({ zoom: 1 });
    expect(drawnChips()).toBe(1);
    const { getByText } = render(ConnectionLabels, { props: {} });
    expect(getByText('because')).toBeInTheDocument();
  });

  it('step7_deleteAConnectedCard_bothItsLinesLeaveWithIt', async () => {
    for (let n = 0; n < 3; n += 1) canvasStore.upsertCard(project.note(n * 300));
    await link(1, 2);
    await link(2, 3);

    const effect = (await invokeSafe('delete_placements', { ids: [2] })) as DeleteEffect;
    for (const p of effect.placements) canvasStore.removePlacement(p.id);
    for (const i of effect.items) canvasStore.removeItem(i.id);
    for (const c of effect.connections) canvasStore.removeConnection(c.id);

    expect(effect.connections.length).toBe(2);
    expect(project.rows.size).toBe(0);
    expect(canvasStore.connections.size).toBe(0);
    expect(drawnConnections()).toBe(0);
  });

  it('step8_undoTheDelete_theCardAndBothLinesComeBackUnderTheirOwnIds', async () => {
    for (let n = 0; n < 3; n += 1) canvasStore.upsertCard(project.note(n * 300));
    const a = (await link(1, 2))!;
    await updateConnection(a.id, 'first', 3, a.color, a.width, a.label_visible, a.route);
    await link(2, 3);

    const effect = (await invokeSafe('delete_placements', { ids: [2] })) as DeleteEffect;
    for (const p of effect.placements) canvasStore.removePlacement(p.id);
    for (const i of effect.items) canvasStore.removeItem(i.id);
    for (const c of effect.connections) canvasStore.removeConnection(c.id);

    const command = deleteCardsCommand(effect);
    await command.undo();

    // The card came back as placement 2, the id it had, and both lines point at it.
    expect(canvasStore.cardCount).toBe(3);
    expect(canvasStore.connections.size).toBe(2);
    expect(canvasStore.placements.has(2)).toBe(true);
    const endpoints = [...canvasStore.connections.values()].flatMap((c) => [
      c.from_placement_id,
      c.to_placement_id,
    ]);
    expect(endpoints).toContain(2);
    // Labels and directions survived the round trip.
    const labelled = [...canvasStore.connections.values()].find((c) => c.label === 'first');
    expect(labelled?.directed).toBe(3);
  });

  it('step9_redoTheDelete_everythingGoesAgain', async () => {
    for (let n = 0; n < 3; n += 1) canvasStore.upsertCard(project.note(n * 300));
    await link(1, 2);
    await link(2, 3);

    const effect = (await invokeSafe('delete_placements', { ids: [2] })) as DeleteEffect;
    for (const p of effect.placements) canvasStore.removePlacement(p.id);
    for (const i of effect.items) canvasStore.removeItem(i.id);
    for (const c of effect.connections) canvasStore.removeConnection(c.id);

    const command = deleteCardsCommand(effect);
    await command.undo();
    expect(canvasStore.connections.size).toBe(2);

    await command.redo();
    expect(canvasStore.connections.size).toBe(0);
    expect(canvasStore.cardCount).toBe(2);
    expect(project.rows.size).toBe(0);

    // And again: the ids did not drift, so a second undo and redo still name live rows. This
    // is what used to break after one redo.
    await command.undo();
    expect(canvasStore.cardCount).toBe(3);
    expect(canvasStore.connections.size).toBe(2);
    await command.redo();
    expect(canvasStore.cardCount).toBe(2);
    expect(canvasStore.connections.size).toBe(0);
  });

  it('step10_closeAndReopenTheProject_everyLineComesBack', async () => {
    canvasStore.upsertCard(project.note(0));
    canvasStore.upsertCard(project.note(300));
    const row = (await link(1, 2))!;
    await updateConnection(
      row.id,
      'survives',
      3,
      row.color,
      row.width,
      row.label_visible,
      row.route,
    );

    // Close: the store is emptied. The fake project keeps its rows, as SQLite would.
    canvasStore.closeProject();
    expect(canvasStore.connections.size).toBe(0);

    canvasStore.activeCanvasId = 1;
    await canvasStore.loadCanvas(1);
    expect(canvasStore.connections.size).toBe(1);
    const back = [...canvasStore.connections.values()][0];
    expect(back.label).toBe('survives');
    expect(back.directed).toBe(3);
  });

  it('step11_theRejectedCases_bothCancelQuietly', async () => {
    canvasStore.upsertCard(project.note(0));
    canvasStore.upsertCard(project.note(300));

    // A card cannot connect to itself.
    expect(await link(1, 1)).toBeNull();
    expect(project.rows.size).toBe(0);

    const first = await link(1, 2);
    expect(first).not.toBeNull();

    // The same ordered pair a second time selects the existing row instead of erroring.
    expect(await link(1, 2)).toBeNull();
    expect(project.rows.size).toBe(1);
    expect(canvasStore.selectedConnectionId).toBe(first!.id);

    // The reverse pair is a genuinely different connection and is allowed.
    expect(await link(2, 1)).not.toBeNull();
    expect(project.rows.size).toBe(2);
  });

  it('step12_deleteALineOnItsOwn_itLeavesAndTheCardsStay', async () => {
    canvasStore.upsertCard(project.note(0));
    canvasStore.upsertCard(project.note(300));
    const row = (await link(1, 2))!;

    const removed = await deleteConnections([row.id]);
    expect(removed.length).toBe(1);
    expect(project.rows.size).toBe(0);
    expect(canvasStore.connections.size).toBe(0);
    expect(canvasStore.cardCount).toBe(2);
  });
});
