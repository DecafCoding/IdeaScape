/**
 * A card type as data. A blueprint is a read-only list of fields, shipped as a JSON file
 * inside the Rust binary and handed over once at boot through `list_blueprints`; the
 * properties panel, the card face and the three full-screen sheets all generate themselves
 * from it and know only the seven field kinds. Adding an eighth card type is a data file
 * and no code.
 *
 * The Rust structs in `src-tauri/src/blueprints/mod.rs` are the other half of this seam and
 * must stay in step, field name for field name.
 *
 * Nothing here reads the network, and nothing here reads a list — `lib/lists.ts` owns the
 * vocabulary a Pick field draws from.
 */
import type { Glyph } from './glyphs';
import { invokeSafe } from './ipc';
import { logWarn } from './logger';

/** The seven field kinds a generated surface knows. Nothing else may be added lightly: a
 *  new kind is a new control in every one of those surfaces. */
export type FieldKind =
  'short-text' | 'long-text' | 'pick' | 'pick-many' | 'image' | 'number' | 'scale';

/**
 * One value chosen for a Pick or Pick Many field.
 *
 * `id` and `sources` are the provenance spine. A value taken from a shipped list carries the
 * Book Guides library's own permanent id and the list it came from; a value the user typed
 * carries `id: null` and `sources: []` **permanently** — that absence is what marks it as
 * theirs. Editing the text of a picked entry never changes its id, and a typed value never
 * gains one later even when its text comes to match a shipped entry exactly, because the id
 * means "this came from there" and minting one would be a false claim.
 */
export interface PickEntry {
  id: string | null;
  text: string;
  sources: string[];
}

/** What one field's slot in `BlueprintPayload.fields` may hold. */
export type FieldValue = string | number | PickEntry | PickEntry[] | null;

export interface BlueprintField {
  /** Permanent. The payload stores against this, so nothing may ever key off `label`. */
  key: string;
  /** Title Case, drawn above the control. Free to change; nothing keys off it. */
  label: string;
  kind: FieldKind;
  /** One sentence, sentence case — the grey help line under the control (§9.25). */
  meaning: string;
  /** Whether the card face prints it. A `long-text` field is never true here. */
  show_on_face: boolean;
  /** For `pick` / `pick-many`: which shipped list the combo offers. */
  list?: string;
  /** For `pick` / `pick-many`: the key of an EARLIER `pick` field on the same blueprint
   *  whose value sorts this one. One hop only — there is no transitive resolution. */
  filter_by?: string;
  /** For `scale`: the plain word at −3 and the plain word at +3. */
  low?: string;
  high?: string;
  /** For `scale`: whether Randomize rerolls it. */
  randomizable?: boolean;
}

export interface Blueprint {
  id: string;
  label: string;
  glyph: Glyph;
  /** Whether this type opens a full-screen sheet. Book, Chapter and Character do. */
  sheet: boolean;
  /** Authored, because no document draws a card face height — see `cardKinds.ts`. */
  default_size: { width: number; height: number };
  fields: BlueprintField[];
}

/**
 * What a `blueprint` item's payload column holds. `name` and `detail_canvas_id` are
 * top-level rather than fields, because every blueprint has them and neither is authored.
 */
export interface BlueprintPayload {
  blueprint: string;
  name: string;
  detail_canvas_id: number | null;
  fields: Record<string, FieldValue>;
}

const EMPTY_PAYLOAD: BlueprintPayload = {
  blueprint: '',
  name: '',
  detail_canvas_id: null,
  fields: {},
};

/** Read one pick entry, tolerating anything. A bare string reads as a typed value. */
export function parsePickEntry(value: unknown): PickEntry | null {
  if (typeof value === 'string') {
    return value.length > 0 ? { id: null, text: value, sources: [] } : null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;
  const text = typeof source.text === 'string' ? source.text : '';
  if (text.length === 0) return null;
  return {
    id: typeof source.id === 'string' && source.id.length > 0 ? source.id : null,
    text,
    sources: Array.isArray(source.sources)
      ? source.sources.filter((s): s is string => typeof s === 'string')
      : [],
  };
}

/** Read a Pick Many value. A non-array, or a malformed member, contributes nothing. */
export function parsePickEntries(value: unknown): PickEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((member) => parsePickEntry(member))
    .filter((entry): entry is PickEntry => entry !== null);
}

/**
 * Read a blueprint payload back out of its JSON column. The same tolerant contract
 * `parseNotePayload` follows: a malformed row renders as empty, it never throws into a
 * render.
 */
export function parseBlueprintPayload(payload: string): BlueprintPayload {
  try {
    const value = JSON.parse(payload) as unknown;
    if (typeof value !== 'object' || value === null) return { ...EMPTY_PAYLOAD, fields: {} };
    const source = value as Record<string, unknown>;
    const rawFields = source.fields;
    const fields: Record<string, FieldValue> =
      typeof rawFields === 'object' && rawFields !== null && !Array.isArray(rawFields)
        ? (rawFields as Record<string, FieldValue>)
        : {};
    return {
      blueprint: typeof source.blueprint === 'string' ? source.blueprint : '',
      name: typeof source.name === 'string' ? source.name : '',
      detail_canvas_id:
        typeof source.detail_canvas_id === 'number' && Number.isFinite(source.detail_canvas_id)
          ? source.detail_canvas_id
          : null,
      fields,
    };
  } catch {
    return { ...EMPTY_PAYLOAD, fields: {} };
  }
}

/**
 * The plain-text rendering of one field value — what the card face prints and what a search
 * snippet is cut from. A Scale reads as its signed number using a true minus sign; an absent
 * Scale reads as `0`, because an absent key and a stored 0 must be indistinguishable.
 */
export function fieldValueText(field: BlueprintField, value: FieldValue | undefined): string {
  switch (field.kind) {
    case 'pick': {
      const entry = parsePickEntry(value);
      return entry ? entry.text : '';
    }
    case 'pick-many':
      return parsePickEntries(value)
        .map((entry) => entry.text)
        .join(', ');
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
    case 'scale': {
      const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
      if (n > 0) return `+${n}`;
      if (n < 0) return `−${Math.abs(n)}`;
      return '0';
    }
    default:
      return typeof value === 'string' ? value : '';
  }
}

/** A Scale value for display: a missing key reads as 0, and 0 is a real answer. */
export function scaleValue(value: FieldValue | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(-3, Math.min(3, Math.round(value)));
}

// The registry. Backed by a module-level `$state` box behind accessor functions — the same
// shape `settings.svelte.ts` uses — so a component re-renders when the registry loads. There
// is no fetch and no network here: `app.svelte` fills it from `list_blueprints` at boot.

const registry = $state<{ list: Blueprint[] }>({ list: [] });
let byId = new Map<string, Blueprint>();

export function setBlueprints(list: Blueprint[]): void {
  // Tolerant on the way in, exactly as the payload readers are: a surface that generates
  // itself from this must draw nothing rather than throw into a render.
  const safe = Array.isArray(list) ? list : [];
  registry.list = safe;
  byId = new Map(safe.map((blueprint) => [blueprint.id, blueprint]));
}

export function getBlueprint(id: string): Blueprint | null {
  return byId.get(id) ?? null;
}

export function allBlueprints(): Blueprint[] {
  return registry.list;
}

/** The blueprint a `blueprint` item's payload names, or null when it names none. */
export function blueprintForPayload(payload: string): Blueprint | null {
  return getBlueprint(parseBlueprintPayload(payload).blueprint);
}

/**
 * Fill the registry from Rust, once at boot. It does not depend on an open project — the
 * card types are the same everywhere — so this belongs beside the settings load rather than
 * inside `openProject`. A failure leaves the registry empty and is logged; every generated
 * surface then simply draws nothing rather than throwing into a render.
 */
export async function loadBlueprints(): Promise<Blueprint[]> {
  try {
    const list = await invokeSafe<Blueprint[]>('list_blueprints');
    setBlueprints(list);
    return list;
  } catch (error) {
    logWarn('the shipped card types could not be read', error);
    return [];
  }
}

/** The keys of every Image field on a blueprint. Mirrors `image_keys` in Rust. */
export function imageKeys(id: string): string[] {
  const blueprint = getBlueprint(id);
  if (!blueprint) return [];
  return blueprint.fields.filter((f) => f.kind === 'image').map((f) => f.key);
}
