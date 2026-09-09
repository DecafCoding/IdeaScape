import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';

const invokeSafe = vi.fn();
vi.mock('../ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
  toFileUrl: (p: string) => p,
}));

const { clearListCache } = await import('../lists');
const Combo = (await import('../fields/Combo.svelte')).default;
const PickManyField = (await import('../fields/PickManyField.svelte')).default;

import type { BlueprintField, PickEntry } from '../blueprints.svelte';

const ENTRIES = [
  { id: 'trope.ark', text: 'Ark ship', tags: ['genre.rigor'] },
  { id: 'trope.becalmed', text: 'Becalmed', tags: [] },
  { id: 'trope.cold', text: 'Cold sleep', tags: ['genre.rigor'] },
];

function render(props: Record<string, unknown>, Component: unknown = Combo) {
  const host = document.createElement('div');
  document.body.append(host);
  // The two components under test take different props, so the mount is loosely typed here
  // and each test states the shape it means.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component = mount(Component as any, { target: host, props: props as any });
  flushSync();
  return {
    host,
    input: () => host.querySelector('input') as HTMLInputElement,
    list: () => host.querySelector('[data-testid="combo-list"]'),
    rows: () => [...host.querySelectorAll('[role="option"]')] as HTMLButtonElement[],
    destroy() {
      void unmount(component);
      host.remove();
    },
  };
}

/** Let every pending promise settle, then flush the render. */
async function settle() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await tick();
  flushSync();
}

/** Focus the box and let the list read arrive. */
async function open(view: ReturnType<typeof render>) {
  view.input().dispatchEvent(new FocusEvent('focus'));
  await settle();
}

function type(view: ReturnType<typeof render>, text: string) {
  const input = view.input();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  invokeSafe.mockReset();
  clearListCache();
  invokeSafe.mockImplementation((command: string) => {
    if (command === 'list_entries') return Promise.resolve(ENTRIES);
    if (command === 'add_list_entry') return Promise.resolve(true);
    return Promise.resolve(null);
  });
});

describe('the combo', () => {
  it('combo_atRest_drawsATextBoxAndAListButton', () => {
    const view = render({ list: 'story-tropes', value: null });
    expect(view.input()).not.toBeNull();
    expect(view.host.querySelector('.caret')).not.toBeNull();
    // It is a text box first; the list is an offer, not a gate.
    expect(view.list()).toBeNull();
    view.destroy();
  });

  it('combo_typing_showsMatchingRowsWithTheMatchedRunBolded', async () => {
    const view = render({ list: 'story-tropes', value: null });
    await open(view);
    type(view, 'col');
    const rows = view.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Cold sleep');
    expect(rows[0].querySelector('b')?.textContent).toBe('Col');
    view.destroy();
  });

  it('combo_withAParentValue_headsTheFirstGroupWithTheParentAndTheSecondWithEverythingElse', async () => {
    const parent: PickEntry = { id: 'genre.rigor', text: 'Rigor', sources: ['genres'] };
    const view = render({ list: 'story-tropes', value: null, parent, parentLabel: 'Rigor' });
    await open(view);
    const headings = [...view.host.querySelectorAll('.group-heading')].map((h) => h.textContent);
    expect(headings).toEqual(['Rigor', 'Everything else']);
    // Filtering sorts; it never hides. Every entry is still reachable.
    expect(view.rows()).toHaveLength(3);
    view.destroy();
  });

  it('combo_aValueNotInTheList_offersUseItAndCommitsAnEntryWithNoIdAndNoSources', async () => {
    const onCommit = vi.fn();
    const view = render({ list: 'story-tropes', value: null, onCommit });
    await open(view);
    type(view, 'Ark ship, becalmed');
    const useMine = view.host.querySelector('.use-mine') as HTMLButtonElement;
    expect(useMine.textContent).toContain('Use “Ark ship, becalmed”');
    expect(useMine.textContent).toContain('Nothing in the list matches');

    useMine.click();
    await settle();
    expect(onCommit).toHaveBeenCalledWith(
      { id: null, text: 'Ark ship, becalmed', sources: [] },
      true,
    );
    view.destroy();
  });

  it('combo_aTypedValue_callsAddListEntryOnce', async () => {
    const view = render({ list: 'story-tropes', value: null, onCommit: vi.fn() });
    await open(view);
    type(view, 'Ark ship, becalmed');
    (view.host.querySelector('.use-mine') as HTMLButtonElement).click();
    await settle();
    const adds = invokeSafe.mock.calls.filter((call) => call[0] === 'add_list_entry');
    expect(adds).toHaveLength(1);
    expect(adds[0][1]).toEqual({ list: 'story-tropes', text: 'Ark ship, becalmed' });
    view.destroy();
  });

  it('combo_blurWithTypedText_commitsRatherThanDiscarding', async () => {
    // Losing what the user typed because they clicked away is the failure this control
    // exists to prevent.
    const onCommit = vi.fn();
    const view = render({ list: 'story-tropes', value: null, onCommit });
    await open(view);
    type(view, 'Hollow moon');
    view.input().dispatchEvent(new FocusEvent('blur'));
    await settle();
    expect(onCommit).toHaveBeenCalledWith({ id: null, text: 'Hollow moon', sources: [] }, true);
    view.destroy();
  });

  it('combo_aShippedValue_commitsWithItsIdAndItsSource', async () => {
    const onCommit = vi.fn();
    const view = render({ list: 'story-tropes', value: null, onCommit });
    await open(view);
    view.rows()[0].click();
    await settle();
    expect(onCommit).toHaveBeenCalledWith(
      { id: 'trope.ark', text: 'Ark ship', sources: ['story-tropes'] },
      false,
    );
    view.destroy();
  });

  it('combo_isOperableByKeyboardAlone', async () => {
    const onCommit = vi.fn();
    const view = render({ list: 'story-tropes', value: null, onCommit });
    await open(view);
    const input = view.input();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    flushSync();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(onCommit).toHaveBeenCalledWith(
      { id: 'trope.ark', text: 'Ark ship', sources: ['story-tropes'] },
      false,
    );
    view.destroy();
  });
});

const TROPES: BlueprintField = {
  key: 'story_tropes',
  label: 'Story Tropes',
  kind: 'pick-many',
  meaning: 'Drag a chip to reorder. The order is yours and is kept.',
  show_on_face: true,
  list: 'story-tropes',
};

describe('Pick Many', () => {
  const value = [
    { id: 'trope.ark', text: 'Ark ship', sources: ['story-tropes'] },
    { id: null, text: 'Hollow moon', sources: [] },
    { id: 'trope.cold', text: 'Cold sleep', sources: ['story-tropes'] },
  ];

  it('pickMany_chipsWrapAndCarryARemoveIcon', () => {
    const view = render({ field: TROPES, value }, PickManyField);
    const row = view.host.querySelector('[data-testid="chip-row"]') as HTMLElement;
    expect(row).not.toBeNull();
    // The chips wrap rather than scroll, so one long trope name never widens the panel.
    expect(row.className).toContain('chips');
    expect(view.host.querySelectorAll('[data-testid="chip"]')).toHaveLength(3);
    expect(view.host.querySelectorAll('.remove')).toHaveLength(3);
    view.destroy();
  });

  it('pickMany_removingAChip_keepsTheOrderOfTheRest', () => {
    const onCommit = vi.fn();
    const view = render({ field: TROPES, value, onCommit }, PickManyField);
    (view.host.querySelectorAll('.remove')[1] as HTMLButtonElement).click();
    expect(onCommit).toHaveBeenCalledWith(
      [
        { id: 'trope.ark', text: 'Ark ship', sources: ['story-tropes'] },
        { id: 'trope.cold', text: 'Cold sleep', sources: ['story-tropes'] },
      ],
      false,
    );
    view.destroy();
  });

  it('pickMany_theAdderIsNamedForTheFieldItFeeds', () => {
    const view = render({ field: TROPES, value: null }, PickManyField);
    expect(view.input().placeholder).toBe('Add A Story Trope…');
    view.destroy();
  });
});
