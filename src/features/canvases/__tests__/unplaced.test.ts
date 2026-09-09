import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

// The seam is one module, so one mock covers every command.
const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
  toFileUrl: (p: string) => p,
}));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { setBlueprints } = await import('../../../lib/blueprints.svelte');
const { clearUnplaced, deleteUnplaced, placeUnplaced, refreshUnplaced, unplacedItems } =
  await import('../unplaced.svelte');
const UnplacedList = (await import('../UnplacedList.svelte')).default;

import type { Item } from '../../../lib/types';

const CHARACTER = {
  id: 'character',
  label: 'Character',
  glyph: 'user-circle' as const,
  sheet: true,
  default_size: { width: 220, height: 210 },
  fields: [
    {
      key: 'name',
      label: 'Name',
      kind: 'short-text' as const,
      meaning: 'x',
      show_on_face: true,
    },
  ],
};

function character(id: number, name: string): Item {
  return {
    id,
    project_id: 1,
    kind: 'blueprint',
    payload: JSON.stringify({
      blueprint: 'character',
      name,
      detail_canvas_id: null,
      fields: {},
    }),
    created_at: 't',
    updated_at: 't',
  };
}

function render() {
  const host = document.createElement('div');
  document.body.append(host);
  const component = mount(UnplacedList, { target: host, props: {} });
  flushSync();
  return {
    host,
    destroy() {
      void unmount(component);
      host.remove();
    },
  };
}

beforeEach(() => {
  invokeSafe.mockReset();
  clearUnplaced();
  setBlueprints([CHARACTER]);
  canvasStore.project = { id: 1, name: 'P', created_at: 't', updated_at: 't' };
});

describe('the Unplaced list', () => {
  it('unplacedList_withNoUnplacedItems_rendersNoSection', () => {
    const view = render();
    expect(view.host.querySelector('[data-testid="unplaced-list"]')).toBeNull();
    // Not dimmed, not an empty state — the whole section is simply absent.
    expect(view.host.textContent).not.toContain('Unplaced');
    view.destroy();
  });

  it('unplacedList_afterTheLastPlacementOfACharacterIsDeleted_showsTheCharacter', async () => {
    invokeSafe.mockResolvedValue([character(7, 'Vela')]);
    await refreshUnplaced();
    const view = render();
    expect(view.host.querySelector('[data-testid="unplaced-list"]')).not.toBeNull();
    expect(view.host.textContent).toContain('Unplaced');
    expect(view.host.textContent).toContain('Vela');
    view.destroy();
  });

  it('unplacedList_rowShowsTheBlueprintKickerGlyphAndTheCardName', async () => {
    invokeSafe.mockResolvedValue([character(7, 'Vela')]);
    await refreshUnplaced();
    const view = render();
    const row = view.host.querySelector('[data-testid="unplaced-list"] button');
    expect(row?.querySelector('i')?.className).toContain('ph-user-circle');
    expect(row?.querySelector('.name')?.textContent).toBe('Vela');
    view.destroy();
  });

  it('unplacedList_placeOnThisCanvas_createsAPlacementForTheSameItemId', async () => {
    const item = character(7, 'Vela');
    invokeSafe.mockImplementation((command: string) => {
      if (command === 'create_placement') {
        return Promise.resolve({
          id: 99,
          canvas_id: 3,
          item_id: 7,
          x: 10,
          y: 20,
          width: 220,
          height: 210,
          z_order: 0,
        });
      }
      return Promise.resolve([]);
    });

    const card = await placeUnplaced(item, 3, 10, 20, 220, 210);

    // A `create_placement`, never a `create_blueprint_card`: it is the SAME item, so editing
    // it on the new canvas edits every other placement of it.
    const commands = invokeSafe.mock.calls.map((call) => call[0]);
    expect(commands).toContain('create_placement');
    expect(commands).not.toContain('create_blueprint_card');
    expect(card?.placement.item_id).toBe(7);
    expect(card?.item.id).toBe(7);
  });

  it('unplacedList_deleteForGood_callsDeleteItemAndReturnsTheEffectForOneUndoCommand', async () => {
    const item = character(7, 'Vela');
    invokeSafe.mockImplementation((command: string) => {
      if (command === 'delete_item') {
        return Promise.resolve({
          placements: [],
          items: [item],
          connections: [],
          assets: ['face.png'],
        });
      }
      return Promise.resolve([]);
    });

    const effect = await deleteUnplaced(item);
    expect(invokeSafe.mock.calls[0]).toEqual(['delete_item', { itemId: 7 }]);
    // One effect naming both the row and its files, so one undo step restores them together.
    expect(effect?.items).toHaveLength(1);
    expect(effect?.assets).toEqual(['face.png']);
    expect(unplacedItems()).toEqual([]);
  });

  it('refreshUnplaced_withNoProjectOpen_isEmptyAndReadsNothing', async () => {
    canvasStore.project = null;
    await refreshUnplaced();
    expect(unplacedItems()).toEqual([]);
    expect(invokeSafe).not.toHaveBeenCalled();
  });
});
