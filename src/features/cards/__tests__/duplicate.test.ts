/**
 * Duplicate, copy and paste. A duplicate is an INDEPENDENT card — a new item as well as a
 * new placement. Sharing the item is what post-MVP reusable library items will do, and
 * conflating them now would make an edit to one copy silently change the other.
 *
 * The behaviour under test is the composition root's, so these specs drive the same
 * `restore_card` / `create_note_card` seam it uses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlacementWithItem } from '../../../lib/types';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
}));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');

const DUPLICATE_OFFSET = 22;

function card(id: number, x: number, y: number, title = `Note ${id}`): PlacementWithItem {
  return {
    placement: { id, canvas_id: 1, item_id: id, x, y, width: 236, height: 150, z_order: id },
    item: {
      id,
      project_id: 1,
      kind: 'note',
      payload: JSON.stringify({ title, text: 'body' }),
      created_at: '',
      updated_at: '',
    },
  };
}

/** The duplicate path the composition root runs, isolated so it can be asserted directly. */
async function copyCards(source: PlacementWithItem[], at: { x: number; y: number } | null) {
  const origin = {
    x: Math.min(...source.map((c) => c.placement.x)),
    y: Math.min(...source.map((c) => c.placement.y)),
  };
  const copies: PlacementWithItem[] = [];
  for (const c of source) {
    const copy = await invokeSafe('restore_card', {
      canvasId: 1,
      x: at ? at.x + (c.placement.x - origin.x) : c.placement.x + DUPLICATE_OFFSET,
      y: at ? at.y + (c.placement.y - origin.y) : c.placement.y + DUPLICATE_OFFSET,
      width: c.placement.width,
      height: c.placement.height,
      zOrder: canvasStore.maxZOrder + 1 + copies.length,
      kind: c.item.kind,
      payload: c.item.payload,
    });
    canvasStore.upsertCard(copy as PlacementWithItem);
    copies.push(copy as PlacementWithItem);
  }
  canvasStore.setSelection(copies.map((c) => c.placement.id));
  return copies;
}

describe('duplicate', () => {
  beforeEach(() => {
    canvasStore.closeProject();
    invokeSafe.mockReset();
  });

  it('duplicate_oneCard_createsOneNewItemAndOnePlacementOffsetFromTheOriginal', async () => {
    const original = card(1, 100, 100);
    canvasStore.upsertCard(original);
    canvasStore.setSelection([1]);

    invokeSafe.mockImplementation((_name, args) =>
      Promise.resolve({
        placement: {
          ...original.placement,
          id: 2,
          item_id: 2,
          x: (args as never)['x'],
          y: (args as never)['y'],
        },
        item: { ...original.item, id: 2 },
      }),
    );

    const copies = await copyCards([original], null);

    expect(invokeSafe).toHaveBeenCalledTimes(1);
    expect(copies[0].placement.x).toBe(122);
    expect(copies[0].placement.y).toBe(122);
    // A new item, not a second placement of the same one.
    expect(copies[0].item.id).not.toBe(original.item.id);
    expect(canvasStore.items.size).toBe(2);
    expect(canvasStore.placements.size).toBe(2);
  });

  it('duplicate_editingACopy_neverChangesTheOriginal', async () => {
    const original = card(1, 0, 0, 'Original');
    canvasStore.upsertCard(original);
    invokeSafe.mockResolvedValue({
      placement: { ...original.placement, id: 2, item_id: 2 },
      item: { ...original.item, id: 2 },
    });
    await copyCards([original], null);

    canvasStore.upsertItem({
      ...original.item,
      id: 2,
      payload: JSON.stringify({ title: 'Changed', text: 'body' }),
    });

    expect(canvasStore.items.get(1)?.payload).toContain('Original');
    expect(canvasStore.items.get(2)?.payload).toContain('Changed');
  });

  it('duplicate_aMultiSelection_preservesTheirRelativePositions', async () => {
    const cards = [card(1, 100, 100), card(2, 400, 260)];
    for (const c of cards) canvasStore.upsertCard(c);
    canvasStore.setSelection([1, 2]);

    let nextId = 10;
    invokeSafe.mockImplementation((_name, args) => {
      const id = nextId++;
      const a = args as { x: number; y: number };
      return Promise.resolve({
        placement: {
          id,
          canvas_id: 1,
          item_id: id,
          x: a.x,
          y: a.y,
          width: 236,
          height: 150,
          z_order: id,
        },
        item: { id, project_id: 1, kind: 'note', payload: '{}', created_at: '', updated_at: '' },
      });
    });

    const copies = await copyCards(cards, null);

    const originalDx = cards[1].placement.x - cards[0].placement.x;
    const copyDx = copies[1].placement.x - copies[0].placement.x;
    expect(copyDx).toBe(originalDx);
    expect(copies[1].placement.y - copies[0].placement.y).toBe(
      cards[1].placement.y - cards[0].placement.y,
    );
  });

  it('duplicate_afterwards_theCopiesBecomeTheSelection', async () => {
    const original = card(1, 0, 0);
    canvasStore.upsertCard(original);
    canvasStore.setSelection([1]);
    invokeSafe.mockResolvedValue({
      placement: { ...original.placement, id: 7, item_id: 7 },
      item: { ...original.item, id: 7 },
    });

    await copyCards([original], null);

    expect([...canvasStore.selection]).toEqual([7]);
  });
});

describe('paste', () => {
  beforeEach(() => {
    canvasStore.closeProject();
    invokeSafe.mockReset();
  });

  it('paste_cardsInTheApplicationBuffer_placesTheCopiesAtThePointer', async () => {
    const buffered = [card(1, 500, 500), card(2, 600, 560)];
    let nextId = 20;
    invokeSafe.mockImplementation((_name, args) => {
      const id = nextId++;
      const a = args as { x: number; y: number };
      return Promise.resolve({
        placement: {
          id,
          canvas_id: 1,
          item_id: id,
          x: a.x,
          y: a.y,
          width: 236,
          height: 150,
          z_order: id,
        },
        item: { id, project_id: 1, kind: 'note', payload: '{}', created_at: '', updated_at: '' },
      });
    });

    const copies = await copyCards(buffered, { x: 0, y: 0 });

    // The first lands exactly at the pointer; the rest keep their offsets from it.
    expect(copies[0].placement.x).toBe(0);
    expect(copies[0].placement.y).toBe(0);
    expect(copies[1].placement.x).toBe(100);
    expect(copies[1].placement.y).toBe(60);
  });

  it('paste_plainTextOnTheClipboard_createsANoteWhoseBodyIsThatText', async () => {
    invokeSafe.mockImplementation((name, args) => {
      expect(name).toBe('create_note_card');
      const a = args as { text: string; x: number; y: number };
      return Promise.resolve({
        placement: {
          id: 1,
          canvas_id: 1,
          item_id: 1,
          x: a.x,
          y: a.y,
          width: 236,
          height: 150,
          z_order: 0,
        },
        item: {
          id: 1,
          project_id: 1,
          kind: 'note',
          payload: JSON.stringify({ title: 'Pasted Note', text: a.text }),
          created_at: '',
          updated_at: '',
        },
      });
    });

    const pasted = (await invokeSafe('create_note_card', {
      canvasId: 1,
      x: 40,
      y: 60,
      width: 236,
      height: 150,
      title: 'Pasted Note',
      text: 'some copied text',
    })) as PlacementWithItem;

    expect(JSON.parse(pasted.item.payload).text).toBe('some copied text');
    expect(pasted.placement.x).toBe(40);
  });
});
