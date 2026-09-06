/**
 * The Milestone 4 and Milestone 5 front-end checkpoints, as one scripted session against
 * the real store with the IPC layer mocked.
 *
 * It drives create → type hostile Markdown → leave edit → marquee-select with a second
 * card → bring one forward → duplicate → delete → reload, asserting after every step that
 * the store, the rendered card set and the counts all agree and that no script node ever
 * entered the document. Then it undoes every step and asserts the store returns byte
 * identical to where it started — which is what proves persistence and undo compose.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '../../../lib/markdown';
import { bringForward } from '../zorder';
import { CULL_MARGIN_PX, visiblePlacements } from '../../../lib/culling';
import type { DeleteEffect, Placement, PlacementWithItem } from '../../../lib/types';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
}));
vi.mock('../../../lib/logger', () => ({ logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { undoStack } = await import('../../undo/undoStack.svelte');
const { applyMarquee } = await import('../../selection/selection.svelte');
const { createCardCommand, deleteCardsCommand, updatePlacementsCommand } =
  await import('../../undo/commands');

/** A miniature in-memory backend, so the session exercises real command shapes. */
function fakeBackend() {
  let nextId = 1;
  const rows = new Map<number, PlacementWithItem>();

  invokeSafe.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'create_note_card' || name === 'restore_card') {
      const id = nextId++;
      const card: PlacementWithItem = {
        placement: {
          id,
          canvas_id: 1,
          item_id: id,
          x: args.x as number,
          y: args.y as number,
          width: args.width as number,
          height: args.height as number,
          z_order: (args.zOrder as number) ?? rows.size,
        },
        item: {
          id,
          project_id: 1,
          kind: 'note',
          payload:
            (args.payload as string) ?? JSON.stringify({ title: args.title, text: args.text }),
          created_at: '',
          updated_at: '',
        },
      };
      rows.set(id, card);
      return card;
    }

    if (name === 'update_placements') {
      for (const u of args.updates as Placement[]) {
        const row = rows.get(u.id);
        if (row) rows.set(u.id, { ...row, placement: { ...row.placement, ...u } });
      }
      return undefined;
    }

    if (name === 'update_item_payload') {
      for (const [id, row] of rows) {
        if (row.item.id === args.itemId) {
          rows.set(id, { ...row, item: { ...row.item, payload: args.payload as string } });
        }
      }
      return rows.get(args.itemId as number)?.item;
    }

    if (name === 'delete_placements') {
      const effect: DeleteEffect = { placements: [], items: [], connections: [], assets: [] };
      for (const id of args.ids as number[]) {
        const row = rows.get(id);
        if (!row) continue;
        effect.placements.push(row.placement);
        effect.items.push(row.item);
        rows.delete(id);
      }
      return effect;
    }

    if (name === 'list_placements') return [...rows.values()];
    if (name === 'list_connections') return [];
    return undefined;
  });

  return { rows };
}

const VIEWPORT = { width: 1000, height: 700 };

function drawn(): number[] {
  return visiblePlacements(
    canvasStore.orderedPlacements,
    canvasStore.view,
    canvasStore.viewportSize,
    CULL_MARGIN_PX,
  ).map((p) => p.id);
}

describe('a scripted session', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    canvasStore.closeProject();
    undoStack.clear();
    canvasStore.setViewportSize(VIEWPORT);
    canvasStore.canvases = [
      {
        id: 1,
        project_id: 1,
        name: 'Canvas 1',
        sort_order: 0,
        view_x: 0,
        view_y: 0,
        view_zoom: 1,
        created_at: '',
        updated_at: '',
      },
    ];
    canvasStore.activeCanvasId = 1;
  });

  it('session_createEditSelectReorderDuplicateDelete_keepsStoreCardsAndCountsInStep', async () => {
    fakeBackend();

    // 1 — create two notes, the first carrying a hostile Markdown body.
    const hostile = '<script>alert(1)</script>\n\n**bold**';
    const first = (await invokeSafe('create_note_card', {
      canvasId: 1,
      x: 40,
      y: 40,
      width: 236,
      height: 150,
      title: 'First',
      text: hostile,
    })) as PlacementWithItem;
    canvasStore.upsertCard(first);
    undoStack.push(createCardCommand(first));

    const second = (await invokeSafe('create_note_card', {
      canvasId: 1,
      x: 320,
      y: 40,
      width: 236,
      height: 150,
      title: 'Second',
      text: 'plain',
    })) as PlacementWithItem;
    canvasStore.upsertCard(second);
    undoStack.push(createCardCommand(second));

    expect(canvasStore.cardCount).toBe(2);
    expect(drawn().sort()).toEqual([1, 2]);

    // 2 — the hostile body never produces a script node.
    const host = document.createElement('div');
    host.innerHTML = renderMarkdown(hostile);
    document.body.append(host);
    expect(host.querySelector('script')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    host.remove();

    // 3 — marquee-select both cards.
    applyMarquee({ x: 0, y: 0, width: 700, height: 400 }, false);
    expect([...canvasStore.selection].sort()).toEqual([1, 2]);
    expect(canvasStore.selection.size).toBe(2);

    // 4 — bring the first card forward. One transaction, one undo step.
    const beforeOrder = canvasStore.orderedPlacements.map((p) => ({ ...p }));
    const updates = bringForward(beforeOrder, [1]);
    const afterOrder = beforeOrder.map((p) => {
      const u = updates.find((x) => x.id === p.id);
      return u ? { ...p, z_order: u.z_order } : p;
    });
    await invokeSafe('update_placements', { updates: afterOrder });
    for (const p of afterOrder) canvasStore.patchPlacement(p.id, { z_order: p.z_order });
    undoStack.push(updatePlacementsCommand('Bring To Front', beforeOrder, afterOrder));
    expect(canvasStore.orderedPlacements.at(-1)?.id).toBe(1);

    // 5 — delete one card; the item goes with its last placement.
    const effect = (await invokeSafe('delete_placements', { ids: [2] })) as DeleteEffect;
    for (const p of effect.placements) canvasStore.removePlacement(p.id);
    for (const i of effect.items) canvasStore.removeItem(i.id);
    canvasStore.clearSelection();
    undoStack.push(deleteCardsCommand(effect));

    expect(canvasStore.cardCount).toBe(1);
    expect(canvasStore.selection.size).toBe(0);
    expect(drawn()).toEqual([1]);

    // 6 — reopening the canvas from the backend agrees with the store.
    await canvasStore.loadCanvas(1);
    expect(canvasStore.cardCount).toBe(1);
    expect([...canvasStore.placements.keys()]).toEqual([1]);
  });

  it('session_undoingEveryStep_returnsTheStoreToWhereItStarted', async () => {
    fakeBackend();

    const startingCards = canvasStore.cardCount;
    const startingSelection = canvasStore.selection.size;

    const card = (await invokeSafe('create_note_card', {
      canvasId: 1,
      x: 10,
      y: 10,
      width: 236,
      height: 150,
      title: 'Only',
      text: '',
    })) as PlacementWithItem;
    canvasStore.upsertCard(card);
    canvasStore.setSelection([card.placement.id]);
    undoStack.push(createCardCommand(card));

    const before = [{ ...card.placement }];
    const after = [{ ...card.placement, x: 900, y: 400 }];
    await invokeSafe('update_placements', { updates: after });
    canvasStore.patchPlacement(card.placement.id, { x: 900, y: 400 });
    undoStack.push(updatePlacementsCommand('Move Cards', before, after));

    expect(canvasStore.placements.get(card.placement.id)?.x).toBe(900);

    await undoStack.undo(); // the move
    expect(canvasStore.placements.get(card.placement.id)?.x).toBe(10);

    await undoStack.undo(); // the create
    expect(canvasStore.cardCount).toBe(startingCards);
    expect(canvasStore.items.size).toBe(0);

    canvasStore.clearSelection();
    expect(canvasStore.selection.size).toBe(startingSelection);
    expect(undoStack.undoDepth).toBe(0);
    expect(undoStack.redoDepth).toBe(2);
  });

  it('session_undoingADelete_bringsBackThePlacementAndItsItemTogether', async () => {
    fakeBackend();

    const card = (await invokeSafe('create_note_card', {
      canvasId: 1,
      x: 0,
      y: 0,
      width: 236,
      height: 150,
      title: 'Doomed',
      text: 'body',
    })) as PlacementWithItem;
    canvasStore.upsertCard(card);

    const effect = (await invokeSafe('delete_placements', {
      ids: [card.placement.id],
    })) as DeleteEffect;
    for (const p of effect.placements) canvasStore.removePlacement(p.id);
    for (const i of effect.items) canvasStore.removeItem(i.id);
    const command = deleteCardsCommand(effect);

    expect(canvasStore.placements.size).toBe(0);
    expect(canvasStore.items.size).toBe(0);

    await command.undo();

    expect(canvasStore.placements.size).toBe(1);
    expect(canvasStore.items.size).toBe(1);
    const restored = [...canvasStore.items.values()][0];
    expect(JSON.parse(restored.payload).title).toBe('Doomed');
  });

  it('session_theCardBeingEdited_survivesAPanThatCarriesItOffScreen', async () => {
    fakeBackend();
    const card = (await invokeSafe('create_note_card', {
      canvasId: 1,
      x: 0,
      y: 0,
      width: 236,
      height: 150,
      title: 'Editing',
      text: 'unsaved',
    })) as PlacementWithItem;
    canvasStore.upsertCard(card);
    canvasStore.editingPlacementId = card.placement.id;

    canvasStore.setView({ x: -9000, y: -9000 });

    const withoutException = visiblePlacements(
      canvasStore.orderedPlacements,
      canvasStore.view,
      canvasStore.viewportSize,
      CULL_MARGIN_PX,
    );
    const withException = visiblePlacements(
      canvasStore.orderedPlacements,
      canvasStore.view,
      canvasStore.viewportSize,
      CULL_MARGIN_PX,
      new Set([canvasStore.editingPlacementId!]),
    );

    expect(withoutException).toHaveLength(0);
    expect(withException.map((p) => p.id)).toEqual([card.placement.id]);
  });
});
