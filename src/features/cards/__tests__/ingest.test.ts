import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeSafe = vi.fn();
const open = vi.fn();

vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (command: string, args?: Record<string, unknown>) => invokeSafe(command, args),
  toFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  IpcError: class IpcError extends Error {},
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...args: unknown[]) => open(...args) }));

const {
  addImageFromClipboardItem,
  addImagesFromPaths,
  extensionForMimeType,
  imageTypeOf,
  isImagePath,
  pickImages,
  INGEST_GAP,
  PASTED_IMAGE_NAME,
} = await import('../ingest.svelte');
const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { IMAGE_FIT_BOX } = await import('../../../lib/cardKinds');

const CANVAS_ID = 3;

function cardFor(id: number) {
  return {
    placement: {
      id,
      canvas_id: CANVAS_ID,
      item_id: id,
      x: 0,
      y: 0,
      width: IMAGE_FIT_BOX,
      height: IMAGE_FIT_BOX,
      z_order: id,
    },
    item: {
      id,
      project_id: 1,
      kind: 'image' as const,
      payload: '{"asset":"a.png"}',
      created_at: 'now',
      updated_at: 'now',
    },
  };
}

describe('image ingestion', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    open.mockReset();
    canvasStore.closeProject();
    canvasStore.activeCanvasId = CANVAS_ID;
  });

  function respondToCreates() {
    let next = 1;
    invokeSafe.mockImplementation((command: string) => {
      if (command === 'add_image_from_path' || command === 'add_image_from_bytes') {
        return Promise.resolve({ name: `hash${next}.png`, byte_size: 10 });
      }
      if (command === 'create_image_card') return Promise.resolve(cardFor(next++));
      return Promise.resolve(null);
    });
  }

  it('addImagesFromPaths_threePaths_createThreeCards22PixelsApart', async () => {
    respondToCreates();
    const created = await addImagesFromPaths(['C:/a/one.png', 'C:/a/two.jpg', 'C:/a/three.webp'], {
      x: 100,
      y: 50,
    });

    const creates = invokeSafe.mock.calls.filter((c) => c[0] === 'create_image_card');
    expect(creates).toHaveLength(3);
    expect(created).toHaveLength(3);
    const xs = creates.map((c) => (c[1] as { x: number }).x);
    expect(xs).toEqual([
      100,
      100 + IMAGE_FIT_BOX + INGEST_GAP,
      100 + 2 * (IMAGE_FIT_BOX + INGEST_GAP),
    ]);
    expect(creates.every((c) => (c[1] as { y: number }).y === 50)).toBe(true);
  });

  it('addImagesFromPaths_aTextFile_createsNothingAndDoesNotThrow', async () => {
    respondToCreates();
    const created = await addImagesFromPaths(['C:/a/notes.txt', 'C:/a/folder'], { x: 0, y: 0 });
    expect(created).toEqual([]);
    expect(invokeSafe.mock.calls.filter((c) => c[0] === 'create_image_card')).toHaveLength(0);
  });

  it('addImagesFromPaths_oneBadFileAmongThree_stillAddsTheOtherTwo', async () => {
    let next = 1;
    invokeSafe.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'add_image_from_path') {
        if ((args as { path: string }).path.includes('bad')) {
          return Promise.reject(new Error('that picture could not be added'));
        }
        return Promise.resolve({ name: `hash${next}.png`, byte_size: 10 });
      }
      if (command === 'create_image_card') return Promise.resolve(cardFor(next++));
      return Promise.resolve(null);
    });

    const created = await addImagesFromPaths(['C:/a/one.png', 'C:/a/bad.png', 'C:/a/two.png'], {
      x: 0,
      y: 0,
    });
    expect(created).toHaveLength(2);
  });

  it('addImagesFromPaths_theOriginalFileName_reachesThePayloadAsSourceName', async () => {
    respondToCreates();
    await addImagesFromPaths(['C:/a/truss reference.PNG'], { x: 0, y: 0 });
    const create = invokeSafe.mock.calls.find((c) => c[0] === 'create_image_card');
    expect((create?.[1] as { sourceName: string }).sourceName).toBe('truss reference.PNG');
  });

  it('pickImages_theDialogCancelled_createsNothing', async () => {
    respondToCreates();
    open.mockResolvedValue(null);
    expect(await pickImages({ x: 0, y: 0 })).toEqual([]);
    expect(invokeSafe.mock.calls.filter((c) => c[0] === 'create_image_card')).toHaveLength(0);
  });

  it('pickImages_twoChosenFiles_addsBoth', async () => {
    respondToCreates();
    open.mockResolvedValue(['C:/a/one.png', 'C:/a/two.png']);
    const created = await pickImages({ x: 0, y: 0 });
    expect(created).toHaveLength(2);
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: true, directory: false }),
    );
  });

  it('addImageFromClipboardItem_anImagePngItem_sendsTheBytesAndNeverCreatesANote', async () => {
    respondToCreates();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const item = {
      types: ['text/plain', 'image/png'],
      getType: vi.fn().mockResolvedValue({ arrayBuffer: async () => bytes.buffer }),
    } as unknown as ClipboardItem;

    const created = await addImageFromClipboardItem(item, { x: 7, y: 9 });

    expect(created).toHaveLength(1);
    const call = invokeSafe.mock.calls.find((c) => c[0] === 'add_image_from_bytes');
    expect(call?.[1]).toEqual({ bytes: [1, 2, 3, 4], ext: 'png' });
    expect(invokeSafe.mock.calls.some((c) => c[0] === 'create_note_card')).toBe(false);
    const create = invokeSafe.mock.calls.find((c) => c[0] === 'create_image_card');
    expect((create?.[1] as { sourceName: string }).sourceName).toBe(PASTED_IMAGE_NAME);
  });

  it('addImageFromClipboardItem_anItemWithNoImageType_createsNothing', async () => {
    respondToCreates();
    const item = { types: ['text/plain'], getType: vi.fn() } as unknown as ClipboardItem;
    expect(await addImageFromClipboardItem(item, { x: 0, y: 0 })).toEqual([]);
  });
});

describe('ingestion helpers', () => {
  it('isImagePath_theSevenAcceptedExtensions_areAllRecognisedCaseInsensitively', () => {
    for (const ext of ['png', 'JPG', 'jpeg', 'gif', 'WEBP', 'bmp', 'svg']) {
      expect(isImagePath(`C:/a/file.${ext}`)).toBe(true);
    }
    expect(isImagePath('C:/a/file.txt')).toBe(false);
    expect(isImagePath('C:/a/folder')).toBe(false);
  });

  it('imageTypeOf_anItemOfferingSeveralTypes_returnsTheImageOne', () => {
    expect(imageTypeOf({ types: ['text/html', 'image/webp'] })).toBe('image/webp');
    expect(imageTypeOf({ types: ['text/plain'] })).toBeNull();
  });

  it('extensionForMimeType_mapsTheAwkwardOnes', () => {
    expect(extensionForMimeType('image/jpeg')).toBe('jpg');
    expect(extensionForMimeType('image/svg+xml')).toBe('svg');
    expect(extensionForMimeType('image/png')).toBe('png');
  });
});
