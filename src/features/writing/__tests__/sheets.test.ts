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
const { closeSheet, openSheetFor, sheetBlueprint, sheetOpen } = await import('../writing.svelte');
const CharacterSheet = (await import('../CharacterSheet.svelte')).default;
const BookSheet = (await import('../BookSheet.svelte')).default;
const ChapterSheet = (await import('../ChapterSheet.svelte')).default;
const SheetShell = (await import('../SheetShell.svelte')).default;

import type { Blueprint } from '../../../lib/blueprints.svelte';
import type { Item, ItemContext, Placement } from '../../../lib/types';

const scale = (key: string) => ({
  key,
  label: key[0].toUpperCase() + key.slice(1),
  kind: 'scale' as const,
  meaning: 'Seven notches.',
  show_on_face: false,
  low: 'Low',
  high: 'High',
  randomizable: true,
});

const CHARACTER: Blueprint = {
  id: 'character',
  label: 'Character',
  glyph: 'user-circle',
  sheet: true,
  default_size: { width: 220, height: 210 },
  fields: [
    { key: 'name', label: 'Name', kind: 'short-text', meaning: 'x', show_on_face: true },
    { key: 'picture', label: 'Picture', kind: 'image', meaning: 'x', show_on_face: true },
    { key: 'role', label: 'Role', kind: 'short-text', meaning: 'x', show_on_face: true },
    { key: 'one_liner', label: 'One-liner', kind: 'short-text', meaning: 'x', show_on_face: false },
    {
      key: 'description',
      label: 'Description',
      kind: 'long-text',
      meaning: 'x',
      show_on_face: false,
    },
    ...['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'].map(scale),
    {
      key: 'character_tropes',
      label: 'Character Tropes',
      kind: 'pick-many',
      meaning: 'x',
      show_on_face: false,
      list: 'character-tropes',
    },
    { key: 'notes', label: 'Notes', kind: 'long-text', meaning: 'x', show_on_face: false },
  ],
};

const BOOK: Blueprint = {
  id: 'book',
  label: 'Book',
  glyph: 'book',
  sheet: true,
  default_size: { width: 300, height: 210 },
  fields: [
    { key: 'name', label: 'Name', kind: 'short-text', meaning: 'x', show_on_face: true },
    { key: 'cover', label: 'Cover', kind: 'image', meaning: 'x', show_on_face: false },
    { key: 'logline', label: 'Logline', kind: 'short-text', meaning: 'x', show_on_face: true },
    {
      key: 'genre',
      label: 'Genre',
      kind: 'pick',
      meaning: 'x',
      show_on_face: true,
      list: 'genres',
    },
    {
      key: 'subgenre',
      label: 'Sub-genre',
      kind: 'pick',
      meaning: 'x',
      show_on_face: true,
      list: 'subgenres',
      filter_by: 'genre',
    },
    { key: 'synopsis', label: 'Synopsis', kind: 'long-text', meaning: 'x', show_on_face: false },
    {
      key: 'story_tropes',
      label: 'Story Tropes',
      kind: 'pick-many',
      meaning: 'x',
      show_on_face: true,
      list: 'story-tropes',
      filter_by: 'genre',
    },
    {
      key: 'themes',
      label: 'Themes',
      kind: 'pick-many',
      meaning: 'x',
      show_on_face: false,
      list: 'themes',
    },
  ],
};

const CHAPTER: Blueprint = {
  id: 'chapter',
  label: 'Chapter',
  glyph: 'file-text',
  sheet: true,
  default_size: { width: 264, height: 168 },
  fields: [
    { key: 'number', label: 'Number', kind: 'number', meaning: 'x', show_on_face: true },
    { key: 'name', label: 'Name', kind: 'short-text', meaning: 'x', show_on_face: true },
    { key: 'summary', label: 'Summary', kind: 'short-text', meaning: 'x', show_on_face: true },
    { key: 'word_target', label: 'Word Target', kind: 'number', meaning: 'x', show_on_face: false },
    {
      key: 'themes',
      label: 'Themes',
      kind: 'pick-many',
      meaning: 'x',
      show_on_face: true,
      list: 'themes',
    },
    { key: 'prose', label: 'Prose', kind: 'long-text', meaning: 'x', show_on_face: false },
  ],
};

function makeItem(blueprint: string, fields: Record<string, unknown> = {}, name = 'Vela'): Item {
  return {
    id: 1,
    project_id: 1,
    kind: 'blueprint',
    payload: JSON.stringify({ blueprint, name, detail_canvas_id: null, fields }),
    created_at: 't',
    updated_at: 't',
  };
}

const CONTEXT: ItemContext = {
  placements: [
    { placement_id: 1, canvas_id: 1, canvas_name: 'Chapter One', x: 0, y: 0 },
    { placement_id: 2, canvas_id: 2, canvas_name: 'Cast', x: 10, y: 10 },
  ],
  joined: [
    {
      connection_id: 1,
      canvas_id: 1,
      other_item_id: 5,
      other_name: 'Chapter One',
      other_blueprint: 'chapter',
      role: 'part-of',
      reversed: true,
    },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function render(Component: any, props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const component = mount(Component, { target: host, props });
  flushSync();
  return {
    host,
    text: () => (host.textContent ?? '').replace(/\s+/g, ' '),
    field: (key: string) => host.querySelector(`[data-field-key="${key}"]`) as HTMLElement | null,
    destroy() {
      void unmount(component);
      host.remove();
    },
  };
}

beforeEach(() => {
  invokeSafe.mockReset();
  invokeSafe.mockResolvedValue([]);
  clearListCache();
  setBlueprints([CHARACTER, BOOK, CHAPTER]);
  canvasStore.closeProject();
  canvasStore.project = { id: 1, name: 'P', created_at: 't', updated_at: 't' };
  canvasStore.activeCanvasId = 1;
  closeSheet();
});

describe('the shared sheet shell', () => {
  it('sheetShell_drawsBackToCanvasThenTheCardNameThenTheType', () => {
    const view = render(SheetShell, { name: 'Vela', typeLabel: 'Character' });
    const header = view.host.querySelector('.header') as HTMLElement;
    const order = [...header.children].map((el) => el.className.split(' ')[0]);
    expect(order.slice(0, 3)).toEqual(['back', 'name', 'type']);
    expect(view.host.querySelector('[data-testid="sheet-back"]')?.textContent).toContain(
      'Back to canvas',
    );
    expect(view.host.querySelector('[data-testid="sheet-name"]')?.textContent).toBe('Vela');
    expect(view.host.querySelector('[data-testid="sheet-type"]')?.textContent).toBe('Character');
    view.destroy();
  });

  it('sheetShell_backToCanvas_callsBack', () => {
    const onBack = vi.fn();
    const view = render(SheetShell, { name: 'Vela', typeLabel: 'Character', onBack });
    (view.host.querySelector('[data-testid="sheet-back"]') as HTMLButtonElement).click();
    expect(onBack).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it('sheetShell_takesNoStackingRung', async () => {
    // §8.6: a sheet is not a dialog. It replaces the canvas rather than layering over it, so
    // it must claim no z-index of its own.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve('src/features/writing/SheetShell.svelte'), 'utf8');
    expect(source).not.toContain('z-index');
    expect(source).not.toContain('--z-dialog');
  });

  it('sheetShell_opensAndClosesThroughTheStore_keepingTheSelectionAndTheView', () => {
    const placement: Placement = {
      id: 3,
      canvas_id: 1,
      item_id: 1,
      x: 40,
      y: 50,
      width: 220,
      height: 210,
      z_order: 0,
    };
    canvasStore.upsertCard({ placement, item: makeItem('character') });
    canvasStore.setSelection([3]);
    canvasStore.view = { x: 12, y: 34, zoom: 1.5 };

    openSheetFor(3);
    expect(sheetOpen()).toBe(true);
    expect(sheetBlueprint()?.id).toBe('character');

    closeSheet();
    expect(sheetOpen()).toBe(false);
    // Leaving returns to exactly the canvas the user left.
    expect([...canvasStore.selection]).toEqual([3]);
    expect(canvasStore.view).toEqual({ x: 12, y: 34, zoom: 1.5 });
  });

  it('sheetBlueprint_aTypeWithNoSheet_opensNothing', () => {
    const scene: Blueprint = { ...CHAPTER, id: 'scene', label: 'Scene', sheet: false };
    setBlueprints([scene]);
    const placement: Placement = {
      id: 4,
      canvas_id: 1,
      item_id: 1,
      x: 0,
      y: 0,
      width: 240,
      height: 130,
      z_order: 0,
    };
    canvasStore.upsertCard({ placement, item: makeItem('scene') });
    openSheetFor(4);
    // Scene, Beat and Location stay in the panel and open nothing.
    expect(sheetOpen()).toBe(false);
  });
});

describe('Character, full screen', () => {
  const props = () => ({
    blueprint: CHARACTER,
    item: makeItem('character'),
    context: CONTEXT,
  });

  it('characterSheet_drawsA150pxPictureAndTheFourIdentityFields', () => {
    const view = render(CharacterSheet, props());
    const box = view.host.querySelector('[data-testid="image-field-box"]') as HTMLElement;
    expect(box.getAttribute('style')).toContain('width: 150px');
    for (const key of ['name', 'role', 'one_liner', 'description']) {
      expect(view.field(key)).not.toBeNull();
    }
    view.destroy();
  });

  it('characterSheet_drawsFiveSlidersAtGapSevenWithOneDiceButtonOnTheGroupLabel', () => {
    const view = render(CharacterSheet, props());
    expect(view.host.querySelectorAll('[data-testid="scale-field"]')).toHaveLength(5);
    // ONE dice button, on the group label — never one per slider.
    expect(view.host.querySelectorAll('.dice')).toHaveLength(1);
    const label = view.host.querySelector('[data-testid="personality"] .group-label');
    expect(label?.querySelector('.dice')).not.toBeNull();
    view.destroy();
  });

  it('characterSheet_printsTheRandomizeGuaranteeVerbatim', () => {
    const view = render(CharacterSheet, props());
    const text = (
      view.host.querySelector('[data-testid="randomize-guarantee"]')?.textContent ?? ''
    ).replace(/\s+/g, ' ');
    expect(text).toBe(
      'Randomize rolls a bell curve, then guarantees at least one slider reaches ±2 — a ' +
        'mostly ordinary person with one clear edge. Undo restores all five in one step.',
    );
    view.destroy();
  });

  it('characterSheet_randomize_callsBackOnceRatherThanOncePerSlider', () => {
    const onRandomize = vi.fn();
    const view = render(CharacterSheet, { ...props(), onRandomize });
    (view.host.querySelector('.dice') as HTMLButtonElement).click();
    expect(onRandomize).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it('characterSheet_theSlidersTakeTheFullScreenGroundForTheirRing', () => {
    const view = render(CharacterSheet, props());
    const knob = view.host.querySelector('.knob') as HTMLElement;
    expect(knob.getAttribute('style')).toContain('--ring: var(--color-bg)');
    view.destroy();
  });

  it('characterSheet_editingTheNameHere_writesThroughTheSameOneFieldPath', () => {
    const onFieldChange = vi.fn();
    const view = render(CharacterSheet, { ...props(), onFieldChange });
    const input = view.field('name')?.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new FocusEvent('focus'));
    input.value = 'Vela Aster';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur'));
    flushSync();
    // The same key the panel's name box uses, so both produce one payload and one undo entry.
    expect(onFieldChange).toHaveBeenCalledWith('name', 'Vela Aster', false);
    view.destroy();
  });

  it('characterSheet_drawsPlacedOnAndJoinedTo', () => {
    const view = render(CharacterSheet, props());
    expect(view.host.querySelector('[data-testid="panel-placed-on"]')).not.toBeNull();
    expect(view.host.querySelector('[data-testid="panel-joined-to"]')).not.toBeNull();
    view.destroy();
  });
});

describe('Book, full screen', () => {
  const props = (fields: Record<string, unknown> = {}) => ({
    blueprint: BOOK,
    item: makeItem('book', fields, 'The Long Dark'),
    context: CONTEXT,
  });

  it('bookSheet_drawsA132CoverAndTheFiveIdentityFields', () => {
    const view = render(BookSheet, props());
    const box = view.host.querySelector('[data-testid="image-field-box"]') as HTMLElement;
    expect(box.getAttribute('style')).toContain('width: 132px');
    for (const key of ['name', 'genre', 'subgenre', 'logline', 'synopsis']) {
      expect(view.field(key)).not.toBeNull();
    }
    view.destroy();
  });

  it('bookSheet_leftColumnCarriesTropesAndThemesAndNoSliders', () => {
    const view = render(BookSheet, props());
    const left = view.host.querySelector('[data-testid="book-chips"]') as HTMLElement;
    const keys = [...left.querySelectorAll('[data-field-key]')].map((f) =>
      f.getAttribute('data-field-key'),
    );
    expect(keys).toEqual(['story_tropes', 'themes']);
    expect(view.host.querySelectorAll('[data-testid="scale-field"]')).toHaveLength(0);
    view.destroy();
  });

  it('bookSheet_joinedTo_readsContainsForAChapterPartOfThisBook', () => {
    const view = render(BookSheet, props());
    // One group carries both directions: Contains is Part Of read from the other end.
    expect(view.host.querySelector('.role-line')?.textContent).toBe('Contains');
    view.destroy();
  });

  it('bookSheet_synopsisIsLongTextAndNeverReachesTheFace', () => {
    const view = render(BookSheet, props());
    expect(view.field('synopsis')?.dataset.fieldKind).toBe('long-text');
    expect(BOOK.fields.find((f) => f.key === 'synopsis')?.show_on_face).toBe(false);
    // Logline is the Short Text the face shows. Do not swap them.
    expect(view.field('logline')?.dataset.fieldKind).toBe('short-text');
    expect(BOOK.fields.find((f) => f.key === 'logline')?.show_on_face).toBe(true);
    view.destroy();
  });

  it('bookSheet_sharesTheSheetShellHeaderWithCharacterSheet', () => {
    const book = render(BookSheet, props());
    const character = render(CharacterSheet, {
      blueprint: CHARACTER,
      item: makeItem('character'),
      context: CONTEXT,
    });
    const shape = (host: HTMLElement) =>
      [...(host.querySelector('.header') as HTMLElement).children].map(
        (el) => el.className.split(' ')[0],
      );
    expect(shape(book.host)).toEqual(shape(character.host));
    expect(book.host.querySelector('[data-testid="sheet-type"]')?.textContent).toBe('Book');
    book.destroy();
    character.destroy();
  });
});

describe('Chapter, the writing surface', () => {
  const props = (fields: Record<string, unknown> = {}) => ({
    blueprint: CHAPTER,
    item: makeItem('chapter', fields, 'The archivist'),
    context: CONTEXT,
  });

  it('chapterSheet_drawsTheStripWithNumberTitleAndWordTarget', () => {
    const view = render(ChapterSheet, props());
    const strip = view.host.querySelector('[data-testid="chapter-strip"]') as HTMLElement;
    const keys = [...strip.querySelectorAll('[data-field-key]')].map((f) =>
      f.getAttribute('data-field-key'),
    );
    expect(keys).toEqual(['number', 'name', 'word_target', 'summary', 'themes']);
    view.destroy();
  });

  it('chapterSheet_collapsesPlacedOnAndJoinedToIntoOneContextLine', () => {
    const view = render(ChapterSheet, props());
    const line = view.host.querySelector('[data-testid="chapter-context-line"]');
    expect(line).not.toBeNull();
    expect(line?.textContent).toContain('Placed on');
    expect(line?.textContent).toContain('Contains');
    // The one place the two §9.28 groups collapse to a line rather than being drawn.
    expect(view.host.querySelector('[data-testid="panel-placed-on"]')).toBeNull();
    expect(view.host.querySelector('[data-testid="panel-joined-to"]')).toBeNull();
    view.destroy();
  });

  it('chapterSheet_atRest_drawsTheRenderedProseAndSwapsInATextBoxToEdit', () => {
    const view = render(ChapterSheet, props({ prose: 'She woke in the **hull**.' }));
    const prose = view.host.querySelector('[data-testid="writing-prose"]') as HTMLElement;
    expect(prose).not.toBeNull();
    // Rendered Markdown, not the source.
    expect(prose.querySelector('strong')?.textContent).toBe('hull');
    expect(view.host.querySelector('textarea')).toBeNull();

    prose.click();
    flushSync();
    // Editing swaps a plain text box over the source. There is no editor library.
    expect(view.host.querySelector('textarea')).not.toBeNull();
    expect(view.host.querySelector('[data-testid="writing-prose"]')).toBeNull();
    view.destroy();
  });

  it('chapterSheet_theWritingSurfaceIsA560pxMeasure', async () => {
    const view = render(ChapterSheet, props());
    expect(view.host.querySelector('[data-testid="writing-surface"]')).not.toBeNull();
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve('src/features/writing/ChapterSheet.svelte'), 'utf8');
    const measure = source.slice(source.indexOf('.measure {'), source.indexOf('.measure:focus'));
    expect(measure).toContain('width: 560px');
    expect(measure).toContain('line-height: 1.85');
    expect(measure).toContain('caret-color: var(--color-accent)');
    view.destroy();
  });

  it('chapterSheet_theFootCountsWordsAgainstTheTargetAndStoresNoCount', () => {
    const view = render(ChapterSheet, props({ prose: 'one two three four five', word_target: 10 }));
    const foot = view.host.querySelector('[data-testid="chapter-foot"]') as HTMLElement;
    const text = (foot.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('Prose · Long Text');
    expect(text).toContain('5 of 10 words');
    expect(text).toContain('Never shown on the card face');
    // Computed for display and NEVER stored: nothing was written back.
    expect(invokeSafe).not.toHaveBeenCalledWith('set_item_field', expect.anything());
    view.destroy();
  });

  it('chapterSheet_theHeaderCarriesTheCardActions', () => {
    const onExpandIntoCanvas = vi.fn();
    const view = render(ChapterSheet, { ...props(), onExpandIntoCanvas });
    const header = view.host.querySelector('.header') as HTMLElement;
    const actions = header.querySelector('.header-actions');
    expect(actions?.textContent).toContain('Expand into a canvas');
    expect(actions?.textContent).toContain('Delete');
    (actions?.querySelector('.card-action') as HTMLButtonElement).click();
    expect(onExpandIntoCanvas).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it('chapterSheet_aBurstOfTypingCommitsOnceOnBlur', () => {
    const onFieldChange = vi.fn();
    const view = render(ChapterSheet, { ...props(), onFieldChange });
    (view.host.querySelector('[data-testid="writing-prose"]') as HTMLElement).click();
    flushSync();
    const textarea = view.host.querySelector('textarea') as HTMLTextAreaElement;

    for (const text of ['S', 'Sh', 'She', 'She w', 'She wo']) {
      textarea.value = text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
    }
    // Nothing per keystroke: a burst is grouped and written when it ends.
    expect(onFieldChange).not.toHaveBeenCalled();

    textarea.dispatchEvent(new FocusEvent('blur'));
    flushSync();
    expect(onFieldChange).toHaveBeenCalledTimes(1);
    expect(onFieldChange).toHaveBeenCalledWith('prose', 'She wo');
    view.destroy();
  });

  it('chapterSheet_scriptInTheProse_isSanitisedAndNeverRuns', () => {
    const view = render(ChapterSheet, props({ prose: '<script>alert(1)</' + 'script>' }));
    // The rendered view goes through the same sanitised Markdown path a note body does.
    expect(view.host.querySelector('script')).toBeNull();
    expect(view.host.querySelector('[data-testid="writing-prose"]')?.innerHTML).not.toContain(
      '<script',
    );

    // And the source is still there, unchanged, in the text box.
    (view.host.querySelector('[data-testid="writing-prose"]') as HTMLElement).click();
    flushSync();
    expect((view.host.querySelector('textarea') as HTMLTextAreaElement).value).toContain(
      '<script>',
    );
    view.destroy();
  });

  it('chapterSheet_proseNeverAppearsOnTheCardFace', () => {
    // The blueprint bars it, and the face component refuses to render a long-text field
    // besides — so a hand-edited data file cannot put prose on a 264px tile either.
    expect(CHAPTER.fields.find((f) => f.key === 'prose')?.show_on_face).toBe(false);
  });
});
