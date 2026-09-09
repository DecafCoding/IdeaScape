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
const { clearListCache } = await import('../../../lib/lists');
const PropertiesPanel = (await import('../PropertiesPanel.svelte')).default;

import type { Blueprint } from '../../../lib/blueprints.svelte';
import type { Item, Placement } from '../../../lib/types';

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
    {
      key: 'one_liner',
      label: 'One-liner',
      kind: 'short-text',
      meaning: 'In one sentence.',
      show_on_face: false,
    },
    {
      key: 'description',
      label: 'Description',
      kind: 'long-text',
      meaning: 'Never shown on the card face.',
      show_on_face: false,
    },
    {
      key: 'age',
      label: 'Age',
      kind: 'number',
      meaning: 'Empty is not zero.',
      show_on_face: false,
    },
    ...(
      ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'] as const
    ).map((key) => ({
      key,
      label: key[0].toUpperCase() + key.slice(1),
      kind: 'scale' as const,
      meaning: 'Seven notches.',
      show_on_face: false,
      low: 'Low',
      high: 'High',
      randomizable: true,
    })),
    {
      key: 'character_tropes',
      label: 'Character Tropes',
      kind: 'pick-many',
      meaning: 'Drag a chip to reorder.',
      show_on_face: false,
      list: 'character-tropes',
    },
  ],
};

const BEAT: Blueprint = {
  id: 'beat',
  label: 'Beat',
  glyph: 'dot-outline',
  sheet: false,
  default_size: { width: 200, height: 104 },
  fields: [
    {
      key: 'name',
      label: 'Name',
      kind: 'short-text',
      meaning: 'What it is called.',
      show_on_face: true,
    },
    {
      key: 'text',
      label: 'Text',
      kind: 'short-text',
      meaning: 'The beat itself.',
      show_on_face: true,
    },
  ],
};

function card(id: number, blueprint: string, fields: Record<string, unknown> = {}) {
  const placement: Placement = {
    id,
    canvas_id: 1,
    item_id: id,
    x: 0,
    y: 0,
    width: 220,
    height: 210,
    z_order: 0,
  };
  const item: Item = {
    id,
    project_id: 1,
    kind: 'blueprint',
    payload: JSON.stringify({ blueprint, name: 'Vela', detail_canvas_id: null, fields }),
    created_at: 't',
    updated_at: 't',
  };
  return { placement, item };
}

function select(which: ReturnType<typeof card>) {
  canvasStore.upsertCard(which);
  canvasStore.setSelection([which.placement.id]);
  flushSync();
}

function render(props: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const component = mount(PropertiesPanel, {
    target: host,
    props: { expanded: true, onToggle: () => {}, ...props },
  });
  flushSync();
  return {
    host,
    fields: () => [...host.querySelectorAll('[data-testid="field"]')] as HTMLElement[],
    keys: () =>
      [...host.querySelectorAll('[data-testid="field"]')].map((f) =>
        f.getAttribute('data-field-key'),
      ),
    destroy() {
      void unmount(component);
      host.remove();
    },
  };
}

beforeEach(() => {
  invokeSafe.mockReset();
  invokeSafe.mockResolvedValue(null);
  clearListCache();
  setBlueprints([CHARACTER, BEAT]);
  canvasStore.closeProject();
  canvasStore.project = { id: 1, name: 'P', created_at: 't', updated_at: 't' };
  canvasStore.activeCanvasId = 1;
});

describe('the generated panel', () => {
  it('panel_aCharacterCard_drawsOneControlPerFieldInBlueprintOrder', () => {
    select(card(1, 'character'));
    const view = render();
    // Exactly one control per field, in the blueprint's own order — the panel is genuinely
    // generated, not hand-built.
    expect(view.keys()).toEqual(CHARACTER.fields.map((f) => f.key));
    view.destroy();
  });

  it('panel_everyFieldDrawsItsLabelAboveAndItsMeaningLineBelow', () => {
    select(card(1, 'character'));
    const view = render();
    for (const field of view.fields()) {
      const label = field.querySelector('.label');
      const meaning = field.querySelector('.meaning');
      expect(label?.textContent?.trim().length).toBeGreaterThan(0);
      expect(meaning?.textContent?.trim().length).toBeGreaterThan(0);
      // Label first, meaning last.
      expect(field.firstElementChild).toBe(label);
      expect(field.lastElementChild).toBe(meaning);
    }
    view.destroy();
  });

  it('panel_swappingFromCharacterToBeat_drawsTheBeatsTwoFieldsAndNothingElse', () => {
    select(card(1, 'character'));
    const view = render();
    expect(view.keys()).toHaveLength(CHARACTER.fields.length);

    // Without touching the component: a different card type, a different panel.
    select(card(2, 'beat'));
    expect(view.keys()).toEqual(['name', 'text']);
    view.destroy();
  });

  it('panel_theFiveScaleRowsAllReadZeroWithNoEmptyState', () => {
    select(card(1, 'character'));
    const view = render();
    const values = [...view.host.querySelectorAll('[data-testid="scale-value"]')].map(
      (v) => v.textContent,
    );
    expect(values).toEqual(['0', '0', '0', '0', '0']);
    view.destroy();
  });

  it('panel_aLongTextField_drawsA44pxTextareaAndNeverAppearsOnTheFace', () => {
    select(card(1, 'character'));
    const view = render();
    const long = view.fields().find((f) => f.dataset.fieldKind === 'long-text');
    const textarea = long?.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.getAttribute('style')).toContain('height: 44px');
    // The blueprint bars it from the face; a Rust test asserts the data file agrees.
    expect(CHARACTER.fields.find((f) => f.key === 'description')?.show_on_face).toBe(false);
    view.destroy();
  });

  it('panel_aNumberField_leavesAnEmptyBoxEmptyRatherThanShowingZero', () => {
    select(card(1, 'character'));
    const view = render();
    const number = view.fields().find((f) => f.dataset.fieldKind === 'number');
    const input = number?.querySelector('input') as HTMLInputElement;
    // EMPTY IS NOT ZERO. An unanswered number field is simply unanswered.
    expect(input.value).toBe('');
    view.destroy();
  });

  it('panel_aNumberFieldHoldingZero_showsZeroRatherThanNothing', () => {
    select(card(1, 'character', { age: 0 }));
    const view = render();
    const number = view.fields().find((f) => f.dataset.fieldKind === 'number');
    expect((number?.querySelector('input') as HTMLInputElement).value).toBe('0');
    view.destroy();
  });

  it('panel_editingAShortTextField_commitsOnBlurAndPushesOneUndoCommand', () => {
    const onFieldChange = vi.fn();
    select(card(1, 'character'));
    const view = render({ onFieldChange });
    const input = view.fields()[1].querySelector('input') as HTMLInputElement;

    input.dispatchEvent(new FocusEvent('focus'));
    input.value = 'The archivist';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    // Nothing per keystroke — that is what keeps the undo stack usable.
    expect(onFieldChange).not.toHaveBeenCalled();

    input.dispatchEvent(new FocusEvent('blur'));
    flushSync();
    expect(onFieldChange).toHaveBeenCalledTimes(1);
    expect(onFieldChange).toHaveBeenCalledWith('one_liner', 'The archivist', false);
    view.destroy();
  });

  it('panel_aWritingType_showsTheCardGroupNamedForItsTypeInsteadOfDuplicateAndDelete', () => {
    select(card(1, 'beat'));
    const view = render();
    const actions = view.host.querySelector('.card-actions');
    expect(actions).not.toBeNull();
    expect(actions?.textContent).toContain('Expand Into A Canvas');
    expect(actions?.textContent).toContain('Delete Beat');
    // §9.28: the Card group REPLACES the Duplicate/Delete pair rather than joining it.
    expect(view.host.querySelector('.icon-button.duplicate')).toBeNull();
    view.destroy();
  });

  it('panel_aNoteCard_keepsItsOwnStateWithNoGeneratedFields', () => {
    const placement: Placement = {
      id: 9,
      canvas_id: 1,
      item_id: 9,
      x: 0,
      y: 0,
      width: 236,
      height: 150,
      z_order: 0,
    };
    const item: Item = {
      id: 9,
      project_id: 1,
      kind: 'note',
      payload: JSON.stringify({ title: 'A note', text: '' }),
      created_at: 't',
      updated_at: 't',
    };
    canvasStore.upsertCard({ placement, item });
    canvasStore.setSelection([9]);
    flushSync();

    const view = render();
    expect(view.fields()).toHaveLength(0);
    expect(view.host.querySelector('[data-testid="panel-title-group"]')).not.toBeNull();
    // The four original kinds' panel states are untouched — a PRD §11 regression line.
    expect(view.host.querySelector('.icon-button.duplicate')).not.toBeNull();
    view.destroy();
  });

  it('panel_theHeaderIsNamedByTheBlueprint', () => {
    select(card(1, 'beat'));
    const view = render();
    expect(view.host.querySelector('.kind')?.textContent).toBe('Beat');
    view.destroy();
  });
});
