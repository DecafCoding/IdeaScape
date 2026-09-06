/**
 * Shared types mirroring the Rust row structs in `src-tauri/src/db/models.rs` and the
 * typed item payloads from PRD §6.9. Field names must stay in step with the Rust side.
 */

export interface Project {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
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

export type ItemKind = 'note' | 'image' | 'link' | 'video';

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
}

export interface Connection {
  id: number;
  canvas_id: number;
  from_placement_id: number;
  to_placement_id: number;
  label: string | null;
  directed: number;
}

// The four typed payloads. Only NotePayload is used in Phase 1; the other three land with
// their cards in Phase 3.

/** The note payload is `{ title, text }` — the amended shape PRD §6.9 settles on. */
export interface NotePayload {
  title: string;
  text: string;
}

export interface ImagePayload {
  asset: string;
  caption: string;
  alt: string;
}

export interface LinkPayload {
  url: string;
  title: string;
  description: string;
  asset: string | null;
  fetched: boolean;
}

export interface VideoPayload {
  url: string;
  title: string;
  author: string;
  asset: string | null;
  fetched: boolean;
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
