/**
 * The one place an asset file name becomes something the page can load, and the one place
 * that knows whether a named file is actually in `assets/`.
 *
 * Pictures reach the page through Tauri's asset protocol rather than through the IPC seam:
 * 250 base64 payloads would sit squarely on the two-second project-open budget and the
 * 60 fps gate. The protocol's scope is empty in `tauri.conf.json` and granted at runtime to
 * exactly the open project's `assets/` directory.
 */
import { invokeSafe, toFileUrl } from './ipc';
import { logError } from './logger';
import { SvelteMap } from 'svelte/reactivity';
import type { AssetStatus } from './types';

/**
 * The open project's `assets/` folder, as an absolute path. Set when a project opens and
 * cleared when it closes. Reactive: the cards derive their `src` from it, and the folder is
 * read from Rust after the first canvas has already been drawn.
 */
let assetsFolder = $state<string | null>(null);

/**
 * Whether each named file is actually there. A name absent from the map is treated as
 * *present*, so a card never flickers into the missing state while the check is in flight.
 */
const statuses = new SvelteMap<string, AssetStatus>();

export function setAssetsFolder(path: string | null): void {
  assetsFolder = path;
}

export function getAssetsFolder(): string | null {
  return assetsFolder;
}

/** Every path this module builds uses forward slashes, which WebView2 accepts on Windows. */
function joinFolder(folder: string, name: string): string {
  const normalized = folder.replace(/\\/g, '/').replace(/\/+$/, '');
  return `${normalized}/${name}`;
}

/**
 * The `src` for one asset file name. An empty string when the folder is not known yet or
 * the name is empty — an `<img>` with no source is one drawn state, never a thrown error.
 */
export function assetUrl(name: string | null | undefined): string {
  if (!name || assetsFolder === null) return '';
  return toFileUrl(joinFolder(assetsFolder, name));
}

/** Ask Rust about a whole canvas's asset names in one call, never one call per card. */
export async function refreshAssetStatuses(names: Iterable<string>): Promise<void> {
  const wanted = [...new Set([...names].filter((n) => n.length > 0))];
  if (wanted.length === 0) return;
  try {
    const reported = await invokeSafe<AssetStatus[]>('asset_statuses', { names: wanted });
    for (const status of reported) statuses.set(status.name, status);
  } catch (error) {
    // A failed check leaves every name reading as present, which is the safe default: a
    // card drawn normally with a broken picture is better than a false missing marker.
    logError('the asset statuses could not be read', error);
  }
}

/** What is known about one asset. An unknown name reads as present with no size. */
export function assetStatus(name: string | null | undefined): AssetStatus {
  if (!name) return { name: '', exists: false, byte_size: 0 };
  return statuses.get(name) ?? { name, exists: true, byte_size: 0 };
}

/** Record one status directly — used when a picture has just been copied in. */
export function noteAssetPresent(name: string, byteSize: number): void {
  statuses.set(name, { name, exists: true, byte_size: byteSize });
}

/** Forget everything. Called when a project closes, so a stale answer never survives. */
export function clearAssetStatuses(): void {
  statuses.clear();
}
