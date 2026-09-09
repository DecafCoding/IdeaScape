/**
 * Shared types mirroring the Rust row structs in `src-tauri/src/db/models.rs` and the
 * typed item payloads from PRD §6.9. Field names must stay in step with the Rust side.
 */

import { imageKeys, parseBlueprintPayload } from './blueprints.svelte';

export interface Project {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

/**
 * One entry in `%APPDATA%\IdeaScape\recent.json` — a project the user has opened, with
 * the counts and the timestamp a Recent card on the picker prints. This is a file record
 * rather than a row, so its Rust struct lives in `commands/project.rs`.
 */
export interface RecentProject {
  path: string;
  name: string;
  canvas_count: number;
  card_count: number;
  opened_at: string;
}

export interface Canvas {
  id: number;
  project_id: number;
  name: string;
  sort_order: number;
  view_x: number;
  view_y: number;
  view_zoom: number;
  created_at: string;
  updated_at: string;
}

/**
 * One canvas whose name matched a search. Canvas hits are their own group and always
 * rendered before card hits — that ranking is the requirement (`search-method`).
 */
export interface CanvasHit {
  canvas_id: number;
  name: string;
  card_count: number;
  updated_at: string;
}

/**
 * One card whose note title or body text matched. `matched_title` says which of the two
 * found it; either way the row is named by the card's title. Only `note` items are searched
 * in the MVP, so `kind` is always `'note'` — it is carried so widening the search later
 * changes a query and not a shape.
 */
export interface CardHit {
  placement_id: number;
  canvas_id: number;
  canvas_name: string;
  item_id: number;
  kind: ItemKind;
  title: string;
  snippet: string;
  matched_title: boolean;
}

export interface SearchResults {
  canvases: CanvasHit[];
  cards: CardHit[];
}

export type ItemKind = 'note' | 'image' | 'link' | 'video' | 'blueprint';

export interface Item {
  id: number;
  project_id: number;
  kind: ItemKind;
  payload: string;
  created_at: string;
  updated_at: string;
}

export interface Placement {
  id: number;
  canvas_id: number;
  item_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  z_order: number;
}

/** One card: a placement joined to the item it points at. */
export interface PlacementWithItem {
  placement: Placement;
  item: Item;
}

/** One placement's new geometry and stacking order, as sent to `update_placements`. */
export interface PlacementUpdate {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  z_order: number;
}

/** Everything a delete actually removed, so one undo command restores all of it. */
export interface DeleteEffect {
  placements: Placement[];
  items: Item[];
  connections: Connection[];
  /**
   * The asset file names the delete moved out of `assets/` because no remaining item
   * payload named them. The Rust side is the only thing that knows what the cascade and
   * the reference count actually did, so it reports rather than the front end inferring.
   */
  assets: string[];
}

/**
 * Everything a canvas delete removed, so one undo command restores the canvas, its cards,
 * its lines and its asset files together. `restore_canvas` takes this whole structure back
 * and puts every row back under the id it had, which keeps the rest of the undo stack valid.
 */
export interface CanvasDeleteEffect {
  canvas: Canvas;
  placements: Placement[];
  items: Item[];
  connections: Connection[];
  assets: string[];
}

/**
 * One line joining two cards. Endpoints are derived from the two placement rectangles at
 * render time and never stored, so a card that moves or grows writes no connection row.
 * Pinning an end (`from_anchor` / `to_anchor`) stores which SIDE it uses, still never a
 * coordinate, so that stays true.
 */
export interface Connection {
  id: number;
  canvas_id: number;
  from_placement_id: number;
  to_placement_id: number;
  label: string | null;
  directed: number;
  /** A key from the line palette in `lib/connectionStyle.ts`, never a hex value. */
  color: string;
  /** The width step: 1 thin, 2 medium, 3 thick. */
  width: number;
  /** Whether the label chip is drawn. The label text is kept when this is false. */
  label_visible: boolean;
  /** The line's shape: a key from `lib/connectionStyle.ts` — `straight` or `elbow`. */
  route: string;
  /**
   * Which side of the `from` card the line leaves: `auto`, or one of `top`, `right`,
   * `bottom`, `left`. A key, never a coordinate — see `lib/connectionStyle.ts`.
   */
  from_anchor: string;
  /** Which side of the `to` card the line enters. The same keys as `from_anchor`. */
  to_anchor: string;
  /**
   * A hand-placed bend as JSON, or the empty string for none. It is a position in the frame
   * of the two card centres, never a canvas coordinate, so the bend moves with the cards —
   * see `parseBend` in `lib/connectionGeometry.ts`.
   */
  bend: string;
}

/**
 * The fields the properties panel and the endpoint handles commit together. They travel as
 * a set because one command writes them all — a partial update would need a second command.
 */
export interface ConnectionEdit {
  label: string | null;
  directed: number;
  color: string;
  width: number;
  labelVisible: boolean;
  route: string;
  fromAnchor: string;
  toAnchor: string;
  bend: string;
}

/**
 * A stored row as an edit, so a caller can change the one field it owns and send the rest
 * back unchanged. It is the only place the snake_case row and the camelCase command meet.
 */
export function connectionEdit(connection: Connection): ConnectionEdit {
  return {
    label: connection.label,
    directed: connection.directed,
    color: connection.color,
    width: connection.width,
    labelVisible: connection.label_visible,
    route: connection.route,
    fromAnchor: connection.from_anchor,
    toAnchor: connection.to_anchor,
    bend: connection.bend,
  };
}

/** Arrow direction: none, an arrow at the `to` end, at the `from` end, or both. */
export const DIRECTED_NONE = 0;
export const DIRECTED_FORWARD = 1;
export const DIRECTED_BACK = 2;
export const DIRECTED_BOTH = 3;

// The four typed payloads, exactly as PRD §6.9 lists them. Every asset field holds a bare
// file name inside the project's `assets/` folder and never a path — `asset-storage` is
// explicit about that, and `validate_payload` in Rust refuses a name carrying a separator.

/** The note payload is `{ title, text }` — the amended shape PRD §6.9 settles on. */
export interface NotePayload {
  title: string;
  text: string;
}

/**
 * `source_name` is the original file name the picture arrived under. Content-hash naming
 * destroys it, and design-system §9.4 draws it on the card and in the panel's File group,
 * so it is kept beside the hash. It is display-only; nothing keys off it.
 */
export interface ImagePayload {
  asset: string | null;
  natural_width: number;
  natural_height: number;
  alt: string;
  /** Shown under the picture when on. The alt attribute carries it either way. */
  alt_visible: boolean;
  source_name: string;
  /** A caption the user types. Shown centred above the picture when `title_visible`. */
  title: string;
  title_visible: boolean;
}

/** `fetched_at` is ISO-8601, or null when the address has not been read yet. */
export interface LinkPayload {
  url: string;
  title: string;
  description: string;
  favicon_asset: string | null;
  thumbnail_asset: string | null;
  fetched_at: string | null;
}

export interface VideoPayload {
  url: string;
  provider: string;
  title: string;
  thumbnail_asset: string | null;
  fetched_at: string | null;
}

export type ItemPayload = NotePayload | ImagePayload | LinkPayload | VideoPayload;

/** Read a note payload back out of its JSON column, tolerating a malformed row. */
export function parseNotePayload(payload: string): NotePayload {
  try {
    const value = JSON.parse(payload) as Partial<NotePayload>;
    return {
      title: typeof value.title === 'string' ? value.title : '',
      text: typeof value.text === 'string' ? value.text : '',
    };
  } catch {
    return { title: '', text: '' };
  }
}

function asObject(payload: string): Record<string, unknown> {
  try {
    const value = JSON.parse(payload) as unknown;
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** An asset field: a non-empty string, or null. A malformed value reads as absent. */
function asAssetName(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Read an image payload, tolerating a malformed row rather than throwing into a render. */
export function parseImagePayload(payload: string): ImagePayload {
  const value = asObject(payload);
  return {
    asset: asAssetName(value.asset),
    natural_width: asNumber(value.natural_width),
    natural_height: asNumber(value.natural_height),
    alt: asString(value.alt),
    alt_visible: value.alt_visible === true,
    source_name: asString(value.source_name),
    title: asString(value.title),
    title_visible: value.title_visible === true,
  };
}

/** Read a link payload, tolerating a malformed row rather than throwing into a render. */
export function parseLinkPayload(payload: string): LinkPayload {
  const value = asObject(payload);
  return {
    url: asString(value.url),
    title: asString(value.title),
    description: asString(value.description),
    favicon_asset: asAssetName(value.favicon_asset),
    thumbnail_asset: asAssetName(value.thumbnail_asset),
    fetched_at: asAssetName(value.fetched_at),
  };
}

/** Read a video payload. `provider` defaults to youtube — the only provider in the MVP. */
export function parseVideoPayload(payload: string): VideoPayload {
  const value = asObject(payload);
  return {
    url: asString(value.url),
    provider: asString(value.provider) || 'youtube',
    title: asString(value.title),
    thumbnail_asset: asAssetName(value.thumbnail_asset),
    fetched_at: asAssetName(value.fetched_at),
  };
}

/** The host of an address, or an empty string when it does not parse. */
export function urlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * The display name for a card of any kind: the note title, the image's original file name,
 * the link or video title, falling back to the address host and then to a stable
 * `<kind>-<padded id>`. The properties panel header and (from Phase 4) search both need
 * one answer to this, which is why it lives in `lib/` rather than in either.
 */
export function cardTitle(item: Item): string {
  const fallback = `${item.kind}-${String(item.id).padStart(3, '0')}`;
  switch (item.kind) {
    case 'note':
      return parseNotePayload(item.payload).title || fallback;
    case 'image': {
      const payload = parseImagePayload(item.payload);
      return payload.source_name || payload.alt || fallback;
    }
    case 'link': {
      const payload = parseLinkPayload(item.payload);
      return payload.title || urlHost(payload.url) || fallback;
    }
    case 'video': {
      const payload = parseVideoPayload(item.payload);
      return payload.title || urlHost(payload.url) || fallback;
    }
    case 'blueprint':
      return parseBlueprintPayload(item.payload).name || fallback;
    default:
      return fallback;
  }
}

/** Every asset file name a payload holds. Mirrors `asset_names` in Rust. */
export function payloadAssetNames(kind: ItemKind, payload: string): string[] {
  const names: (string | null)[] = [];
  if (kind === 'image') names.push(parseImagePayload(payload).asset);
  if (kind === 'link') {
    const value = parseLinkPayload(payload);
    names.push(value.favicon_asset, value.thumbnail_asset);
  }
  if (kind === 'blueprint') {
    // Mirrors the `"blueprint"` arm of `asset_names` in Rust: which keys are Image is a
    // blueprint question, so the registry answers it rather than a list written twice.
    const value = parseBlueprintPayload(payload);
    for (const key of imageKeys(value.blueprint)) {
      const name = value.fields[key];
      if (typeof name === 'string') names.push(name);
    }
  }
  return names.filter((n): n is string => n !== null && n.length > 0);
}

/** Whether a fetching card's preview has been read, and how it went. */
export type FetchStatus = 'idle' | 'fetching' | 'ok' | 'failed';

/** One asset file name and whether it is actually in `assets/`. Mirrors the Rust struct. */
export interface AssetStatus {
  name: string;
  exists: boolean;
  byte_size: number;
}

/** What `add_image_from_path` / `add_image_from_bytes` return. */
export interface AssetRef {
  name: string;
  byte_size: number;
}

/**
 * What `fetch_link_preview` returns. `fetched: false` is the drawn not-fetched state; a
 * `fetched: true` with no `thumbnail_asset` is the drawn "no preview picture" state. Neither
 * is an error — a failed fetch is a value the card draws (contract 3).
 */
export interface LinkPreviewResult {
  url: string;
  fetched: boolean;
  title: string;
  description: string;
  favicon_asset: string | null;
  thumbnail_asset: string | null;
}

/** What `fetch_video_metadata` returns. oEmbed reports no duration, so none is carried. */
export interface VideoPreviewResult {
  url: string;
  provider: string;
  fetched: boolean;
  title: string;
  author_name: string;
  thumbnail_asset: string | null;
}
