import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
  toFileUrl: (p: string) => p,
}));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { setBlueprints } = await import('../../../lib/blueprints.svelte');
const PropertiesPanel = (await import('../PropertiesPanel.svelte')).default;

import type { Blueprint } from '../../../lib/blueprints.svelte';
import type { ItemContext, Item, Placement } from '../../../lib/types';

const CHARACTER: Blueprint = {
  id: 'character',
  label: 'Character',
  glyph: 'user-circle',
  sheet: false,
  default_size: { width: 220, height: 210 },
  fields: [
    {
      key: 'name',
      label: 'Name',
      kind: 'short-text',
      meaning: 'What they are called.',
      show_on_face: true,
    },
  ],
};

function selectCard(kind: 'blueprint' | 'note') {
  const placement: Placement = {
    id: 1,
    canvas_id: 1,
    item_id: 1,
    x: 0,
    y: 0,
    width: 220,
    height: 210,
    z_order: 0,
  };
  const item: Item = {
    id: 1,
    project_id: 1,
    kind,
    payload:
      kind === 'blueprint'
        ? JSON.stringify({
            blueprint: 'character',
            name: 'Vela',
            detail_canvas_id: null,
            fields: {},
          })
        : JSON.stringify({ title: 'A note', text: '' }),
    created_at: 't',
    updated_at: 't',
  };
  canvasStore.upsertCard({ placement, item });
  canvasStore.setSelection([1]);
  flushSync();
}

function render(itemContext: ItemContext | null) {
  const host = document.createElement('div');
  document.body.append(host);
  const component = mount(PropertiesPanel, {
    target: host,
    props: { expanded: true, onToggle: () => {}, itemContext },
  });
  flushSync();
  return {
    host,
    placedOn: () => host.querySelector('[data-testid="panel-placed-on"]'),
    joinedTo: () => host.querySelector('[data-testid="panel-joined-to"]'),
    destroy() {
      void unmount(component);
      host.remove();
    },
  };
}

const placement = (id: number, canvasId: number, name: string, x = 10, y = 20) => ({
  placement_id: id,
  canvas_id: canvasId,
  canvas_name: name,
  x,
  y,
});

const join = (
  id: number,
  name: string,
  role: string | null,
  reversed = false,
  blueprint: string | null = 'beat',
) => ({
  connection_id: id,
  canvas_id: 1,
  other_item_id: id + 100,
  other_name: name,
  other_blueprint: blueprint,
  role,
  reversed,
});

beforeEach(() => {
  invokeSafe.mockReset();
  invokeSafe.mockResolvedValue(null);
  setBlueprints([CHARACTER]);
  canvasStore.closeProject();
  canvasStore.project = { id: 1, name: 'P', created_at: 't', updated_at: 't' };
  canvasStore.activeCanvasId = 1;
});

describe('Placed on and Joined to', () => {
  it('placedOn_threePlacements_statesTheCountInWords', () => {
    selectCard('blueprint');
    const view = render({
      placements: [
        placement(1, 1, 'Chapter One'),
        placement(2, 2, 'Chapter Two'),
        placement(3, 3, 'Cast'),
      ],
      joined: [],
    });
    const group = view.placedOn();
    expect(group?.querySelectorAll('.context-row')).toHaveLength(3);
    // The counts are WORDS, not digits — this is helper text and stays sentence case.
    const helper = (group?.querySelector('.footer-note')?.textContent ?? '').replace(/\s+/g, ' ');
    expect(helper).toContain('One record, three places');
    expect(helper).toContain('Editing here changes all three');
    expect(helper).not.toMatch(/\b3\b/);
    view.destroy();
  });

  it('placedOn_onePlacement_statesNoCount', () => {
    selectCard('blueprint');
    const view = render({ placements: [placement(1, 1, 'Chapter One')], joined: [] });
    expect(view.placedOn()?.querySelector('.footer-note')).toBeNull();
    view.destroy();
  });

  it('placedOn_drawsTheCanvasNameAndTheCoordinates', () => {
    selectCard('blueprint');
    const view = render({ placements: [placement(1, 1, 'Chapter One', 12.4, 88.6)], joined: [] });
    const row = view.placedOn()?.querySelector('.context-row');
    expect(row?.querySelector('.context-name')?.textContent).toBe('Chapter One');
    expect(row?.querySelector('.coords')?.textContent).toBe('12, 89');
    view.destroy();
  });

  it('joinedTo_drawsTheRoleOnItsOwnLineBeneathTheFarCardName', () => {
    selectCard('blueprint');
    const view = render({
      placements: [placement(1, 1, 'Chapter One')],
      joined: [join(1, 'The archivist wakes', 'appears-in')],
    });
    const group = view.joinedTo();
    expect(group?.querySelector('.context-name')?.textContent).toBe('The archivist wakes');
    expect(group?.querySelector('.role-line')?.textContent).toBe('Appears In');
    view.destroy();
  });

  it('joinedTo_twoConnectionsOfOneRole_collapseToACount', () => {
    selectCard('blueprint');
    const view = render({
      placements: [placement(1, 1, 'Chapter One')],
      joined: [join(1, 'Beat one', 'feeds'), join(2, 'Beat two', 'feeds')],
    });
    const group = view.joinedTo();
    expect(group?.querySelectorAll('.context-row')).toHaveLength(1);
    expect(group?.querySelector('.context-name')?.textContent).toBe('2 cards');
    expect(group?.querySelector('.role-line')?.textContent).toBe('Feeds');
    view.destroy();
  });

  it('joinedTo_aPartOfConnectionFromTheOtherEnd_readsContains', () => {
    selectCard('blueprint');
    const view = render({
      placements: [placement(1, 1, 'Book')],
      joined: [join(1, 'Chapter One', 'part-of', true, 'chapter')],
    });
    // Contains is not an eighth role — it is Part Of read from the other end.
    expect(view.joinedTo()?.querySelector('.role-line')?.textContent).toBe('Contains');
    view.destroy();
  });

  it('joinedTo_aNullRole_readsRelatesTo', () => {
    selectCard('blueprint');
    const view = render({
      placements: [placement(1, 1, 'Chapter One')],
      joined: [join(1, 'A note', null, false, null)],
    });
    expect(view.joinedTo()?.querySelector('.role-line')?.textContent).toBe('Relates To');
    view.destroy();
  });

  it('panel_aNoteCard_drawsNeitherGroup', () => {
    selectCard('note');
    const view = render({
      placements: [placement(1, 1, 'Chapter One'), placement(2, 2, 'Chapter Two')],
      joined: [join(1, 'Beat one', 'feeds')],
    });
    // Both groups are drawn for writing cards ONLY — a PRD §11 regression line.
    expect(view.placedOn()).toBeNull();
    expect(view.joinedTo()).toBeNull();
    view.destroy();
  });

  it('panel_withNoContext_drawsNeitherGroup', () => {
    selectCard('blueprint');
    const view = render(null);
    expect(view.placedOn()).toBeNull();
    expect(view.joinedTo()).toBeNull();
    view.destroy();
  });
});
