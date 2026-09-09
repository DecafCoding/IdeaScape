import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
  toFileUrl: (p: string) => p,
}));

const { clearAssetStatuses, noteAssetPresent, refreshAssetStatuses, setAssetsFolder } =
  await import('../../../lib/assets.svelte');
const { parseBlueprintPayload, setBlueprints } = await import('../../../lib/blueprints.svelte');
const BlueprintCard = (await import('../BlueprintCard.svelte')).default;

import type { Blueprint } from '../../../lib/blueprints.svelte';

const CHAPTER: Blueprint = {
  id: 'chapter',
  label: 'Chapter',
  glyph: 'file-text',
  sheet: true,
  default_size: { width: 264, height: 168 },
  fields: [
    { key: 'name', label: 'Name', kind: 'short-text', meaning: 'x', show_on_face: true },
    { key: 'summary', label: 'Summary', kind: 'short-text', meaning: 'x', show_on_face: true },
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

/** A deliberately broken data file: a Long Text field marked for the face. */
const BAD: Blueprint = {
  ...CHAPTER,
  id: 'bad',
  label: 'Bad',
  fields: CHAPTER.fields.map((f) => (f.kind === 'long-text' ? { ...f, show_on_face: true } : f)),
};

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
  ],
};

function payloadFor(
  blueprint: string,
  fields: Record<string, unknown>,
  detail: number | null = null,
) {
  return parseBlueprintPayload(
    JSON.stringify({ blueprint, name: 'The archivist', detail_canvas_id: detail, fields }),
  );
}

function render(
  blueprint: Blueprint,
  fields: Record<string, unknown>,
  detail: number | null = null,
) {
  const host = document.createElement('div');
  document.body.append(host);
  const component = mount(BlueprintCard, {
    target: host,
    props: { blueprint, payload: payloadFor(blueprint.id, fields, detail), zoom: 1 },
  });
  flushSync();
  return {
    host,
    chips: () =>
      [...host.querySelectorAll('[data-testid="chip"]')].map((c) => c.textContent?.trim()),
    destroy() {
      void unmount(component);
      host.remove();
    },
  };
}

const theme = (text: string) => ({ id: `t.${text}`, text, sources: ['themes'] });

beforeEach(() => {
  invokeSafe.mockReset();
  clearAssetStatuses();
  setAssetsFolder('C:/Projects/Hull/assets');
  setBlueprints([CHAPTER, CHARACTER, BAD]);
});

/** Record a file as absent, the way a canvas load does. */
async function markMissing(name: string) {
  invokeSafe.mockResolvedValue([{ name, exists: false, byte_size: 0 }]);
  await refreshAssetStatuses([name]);
}

describe('the blueprint card face', () => {
  it('blueprintCard_drawsOnlyTheFieldsMarkedShowOnFace', () => {
    const view = render(CHAPTER, {
      summary: 'The archivist wakes',
      prose: 'A wall of prose that must never reach the face.',
    });
    expect(view.host.textContent).toContain('The archivist wakes');
    expect(view.host.textContent).not.toContain('A wall of prose');
    view.destroy();
  });

  it('blueprintCard_drawsTheTypeKickerWithItsGlyph', () => {
    const view = render(CHAPTER, {});
    const kicker = view.host.querySelector('[data-testid="blueprint-kicker"]');
    expect(kicker?.textContent).toContain('Chapter');
    expect(kicker?.querySelector('i')?.className).toContain('ph-file-text');
    view.destroy();
  });

  it('blueprintCard_aLongTextField_isNeverRenderedEvenWhenMarkedShowOnFace', () => {
    // The blueprint bars it and a Rust test asserts the data files agree — but a HAND-EDITED
    // data file must not be able to put a wall of prose on a 264px tile either.
    const view = render(BAD, { prose: 'A wall of prose that must never reach the face.' });
    expect(view.host.textContent).not.toContain('A wall of prose');
    view.destroy();
  });

  it('blueprintCard_pickManyBeyondTheFaceLimit_drawsAnOverflowChip', () => {
    const view = render(CHAPTER, {
      themes: ['Grief', 'Duty', 'Memory', 'Exile', 'Hunger', 'Return'].map(theme),
    });
    const chips = view.chips();
    expect(chips).toHaveLength(5);
    expect(chips.slice(0, 4)).toEqual(['Grief', 'Duty', 'Memory', 'Exile']);
    // The count comes from the array length, never from measuring the DOM.
    expect(chips[4]).toBe('+2');
    view.destroy();
  });

  it('blueprintCard_pickManyInsideTheLimit_drawsNoOverflowChip', () => {
    const view = render(CHAPTER, { themes: ['Grief', 'Duty'].map(theme) });
    expect(view.chips()).toEqual(['Grief', 'Duty']);
    view.destroy();
  });

  it('blueprintCard_withADetailCanvasId_drawsTheSquareHalfMark', () => {
    const plain = render(CHAPTER, {});
    expect(plain.host.querySelector('.ph-square-half')).toBeNull();
    plain.destroy();

    const expanded = render(CHAPTER, {}, 7);
    // The only mark of it on the face.
    expect(expanded.host.querySelector('.ph-square-half')).not.toBeNull();
    expanded.destroy();
  });

  it('blueprintCard_aMissingPictureFile_drawsTheMarkerAndKeepsTheItem', async () => {
    await markMissing('gone.png');
    const view = render(CHARACTER, { picture: 'gone.png' });
    const band = view.host.querySelector('[data-testid="blueprint-card-band"]');
    expect(band?.className).toContain('missing');
    expect(band?.querySelector('.ph-image-broken')).not.toBeNull();
    // The item is never deleted for it: the name and role still draw.
    expect(view.host.textContent).toContain('The archivist');
    view.destroy();
  });

  it('blueprintCard_aPresentPictureFile_drawsThePicture', () => {
    noteAssetPresent('there.png', 10);
    const view = render(CHARACTER, { picture: 'there.png' });
    const band = view.host.querySelector('[data-testid="blueprint-card-band"]');
    expect(band?.className).not.toContain('missing');
    expect(band?.querySelector('img')).not.toBeNull();
    view.destroy();
  });

  it('blueprintCard_belowLowZoom_drawsBarsRatherThanText', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const component = mount(BlueprintCard, {
      target: host,
      props: { blueprint: CHAPTER, payload: payloadFor('chapter', {}), zoom: 0.1 },
    });
    flushSync();
    expect(host.querySelector('[data-testid="blueprint-card-simplified"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Chapter');
    void unmount(component);
    host.remove();
  });
});
