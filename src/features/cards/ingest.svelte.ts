/**
 * The three doors a picture comes in through — a file drop from Explorer, the file picker,
 * and a clipboard paste of image bits — converging on one function, so forty dropped
 * pictures are one undo step rather than forty.
 *
 * Every route ends in `create_image_card`. Only the clipboard route sends bytes: a
 * `Uint8Array` reaches Tauri as a JSON number array, which is fine for a screenshot and
 * not for a 40 MB file, so drop and picker send an absolute path instead.
 *
 * It returns the cards it created and pushes no undo command itself: the undo stack lives
 * in another feature, and a feature may not import another feature. The composition root
 * takes the returned list and records one command for the batch.
 */
import { invokeSafe } from '../../lib/ipc';
import { noteAssetPresent } from '../../lib/assets.svelte';
import { imageFitBox } from '../../lib/cardKinds';
import { logInfo, logError } from '../../lib/logger';
import { canvasStore } from '../../stores/canvasStore.svelte';
import type { AssetRef, PlacementWithItem } from '../../lib/types';
import type { Point } from '../../lib/geometry';

/** The extensions the picker offers and a drop accepts. */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] as const;

/** The gap between pictures laid out in a row from the point the user indicated. */
export const INGEST_GAP = 22;

/** What a clipboard picture is called: it has no original file name. */
export const PASTED_IMAGE_NAME = 'Pasted image';

function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function isImagePath(path: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(path));
}

/**
 * Create one image card for `asset` at `at`. The card is authored at the fit box until the
 * page decodes the picture and reports its real dimensions.
 */
async function createImageCard(
  canvasId: number,
  asset: AssetRef,
  sourceName: string,
  at: Point,
): Promise<PlacementWithItem> {
  const size = imageFitBox(0, 0);
  const card = await invokeSafe<PlacementWithItem>('create_image_card', {
    canvasId,
    x: at.x,
    y: at.y,
    width: size.width,
    height: size.height,
    asset: asset.name,
    naturalWidth: 0,
    naturalHeight: 0,
    alt: '',
    sourceName,
  });
  noteAssetPresent(asset.name, asset.byte_size);
  canvasStore.upsertCard(card);
  return card;
}

/**
 * Copy each picture in and put a card on the canvas at `at`, laying several out in a row.
 * A non-image path — a `.txt`, a folder — is skipped quietly with a logged line: nothing
 * about a drop is ever a dialog.
 */
export async function addImagesFromPaths(paths: string[], at: Point): Promise<PlacementWithItem[]> {
  const canvasId = canvasStore.activeCanvasId;
  if (canvasId === null) return [];

  const created: PlacementWithItem[] = [];
  for (const path of paths) {
    if (!isImagePath(path)) {
      logInfo(`the dropped item ${fileNameOf(path)} is not a picture and was skipped`);
      continue;
    }
    try {
      const asset = await invokeSafe<AssetRef>('add_image_from_path', { path });
      const offset = created.length * (imageFitBox(0, 0).width + INGEST_GAP);
      created.push(
        await createImageCard(canvasId, asset, fileNameOf(path), { x: at.x + offset, y: at.y }),
      );
    } catch (error) {
      // One bad file must not abandon the rest of a forty-file drop.
      logError(`the picture ${fileNameOf(path)} could not be added`, error);
    }
  }
  if (created.length > 0) canvasStore.setSelection(created.map((c) => c.placement.id));
  return created;
}

/**
 * Open the system file selector and add whatever was chosen. Returns an empty list when the
 * dialog was cancelled, which is not a failure.
 */
export async function pickImages(at: Point, multiple = true): Promise<PlacementWithItem[]> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const chosen = await open({
    multiple,
    directory: false,
    filters: [{ name: 'Pictures', extensions: [...IMAGE_EXTENSIONS] }],
  });
  if (chosen === null) return [];
  const paths = Array.isArray(chosen) ? chosen : [chosen];
  return addImagesFromPaths(paths, at);
}

/** The one image type a clipboard item offers, or null when it offers none. */
export function imageTypeOf(item: { types: readonly string[] }): string | null {
  return item.types.find((type) => type.startsWith('image/')) ?? null;
}

/** The extension an `image/*` MIME type maps to. */
export function extensionForMimeType(type: string): string {
  const subtype = type.slice('image/'.length).toLowerCase();
  if (subtype === 'jpeg') return 'jpg';
  if (subtype === 'svg+xml') return 'svg';
  return subtype.replace(/[^a-z0-9]/g, '') || 'bin';
}

/**
 * A clipboard item carrying image bits. The bytes go straight to `add_image_from_bytes`;
 * they are never written to a temporary file first.
 */
export async function addImageFromClipboardItem(
  item: ClipboardItem,
  at: Point,
): Promise<PlacementWithItem[]> {
  const canvasId = canvasStore.activeCanvasId;
  if (canvasId === null) return [];
  const type = imageTypeOf(item);
  if (type === null) return [];

  const blob = await item.getType(type);
  const bytes = [...new Uint8Array(await blob.arrayBuffer())];
  const asset = await invokeSafe<AssetRef>('add_image_from_bytes', {
    bytes,
    ext: extensionForMimeType(type),
  });
  const card = await createImageCard(canvasId, asset, PASTED_IMAGE_NAME, at);
  canvasStore.setSelection([card.placement.id]);
  return [card];
}
