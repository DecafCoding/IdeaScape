/**
 * The vocabulary a Pick or Pick Many field offers, and the one-hop filter that orders it.
 *
 * The ruling that matters more than the mechanism: **filtering sorts, it never hides.** A
 * value the shipped list has never heard of is always reachable, and so is an untagged one.
 * A list that hides things teaches the user to distrust it, and they then type the value
 * they already know is there — which is worse than showing it low down (§9.26).
 *
 * `loadListEntries` caches per list for the open project. The combo re-reads on every
 * keystroke, and going through the seam six times per keystroke is the one place this
 * feature could feel slow. `clearListCache` is called when a project closes, because the
 * user rows are per project.
 */
import { invokeSafe } from './ipc';
import { logWarn } from './logger';

export interface ListEntry {
  /** The library's own permanent id, or null for a value the user typed. */
  id: string | null;
  text: string;
  /** The ids of the parent entries this one sorts under. Empty is normal. */
  tags: string[];
}

/** One drawn group in the combo's list (§9.26). A null heading draws no header row. */
export interface ListGroup {
  heading: string | null;
  entries: ListEntry[];
  /** True for the *Everything else* group, whose rows sit at opacity .72. */
  dimmed: boolean;
}

const cache = new Map<string, ListEntry[]>();

/** Called when a project closes: the user's own rows belong to the project, not the app. */
export function clearListCache(): void {
  cache.clear();
}

/** Drop one list's cache, so the next read sees a value just added or removed. */
export function invalidateList(list: string): void {
  cache.delete(list);
}

export async function loadListEntries(list: string): Promise<ListEntry[]> {
  const cached = cache.get(list);
  if (cached) return cached;
  try {
    const entries = await invokeSafe<ListEntry[]>('list_entries', { list });
    cache.set(list, entries);
    return entries;
  } catch (error) {
    logWarn('a list could not be read', error);
    return [];
  }
}

/**
 * Save a value the user typed. Returns whether a row was written, which is what tells the
 * caller whether there is anything for undo to reverse.
 */
export async function addListEntry(list: string, text: string): Promise<boolean> {
  try {
    const wrote = await invokeSafe<boolean>('add_list_entry', { list, text });
    invalidateList(list);
    return wrote;
  } catch (error) {
    logWarn('a list entry could not be saved', error);
    return false;
  }
}

export async function removeListEntry(list: string, text: string): Promise<void> {
  try {
    await invokeSafe('remove_list_entry', { list, text });
    invalidateList(list);
  } catch (error) {
    logWarn('a list entry could not be removed', error);
  }
}

/**
 * Every entry, partitioned into two stable groups: those tagged with `parentId` first, then
 * the rest. `parentId` is the *id* of the parent field's current pick entry — null when the
 * parent is empty or when the user typed their own value, in which case the input order
 * comes back unchanged.
 *
 * Partition rather than `sort`: two calls with the same arguments must produce the same
 * order, or the list reshuffles under the pointer between keystrokes.
 */
export function sortForFilter(entries: ListEntry[], parentId: string | null): ListEntry[] {
  if (parentId === null) return entries.slice();
  const matching: ListEntry[] = [];
  const rest: ListEntry[] = [];
  for (const entry of entries) {
    (entry.tags.includes(parentId) ? matching : rest).push(entry);
  }
  return [...matching, ...rest];
}

/**
 * The §9.26 shape the combo draws: at most two groups, the first headed by the parent's own
 * text, the second headed *Everything else*. When `parentId` is null, one unheaded group
 * holding everything.
 */
export function groupForFilter(
  entries: ListEntry[],
  parentId: string | null,
  parentLabel: string,
): ListGroup[] {
  if (parentId === null) {
    return entries.length === 0 ? [] : [{ heading: null, entries: entries.slice(), dimmed: false }];
  }
  const matching: ListEntry[] = [];
  const rest: ListEntry[] = [];
  for (const entry of entries) {
    (entry.tags.includes(parentId) ? matching : rest).push(entry);
  }
  const groups: ListGroup[] = [];
  if (matching.length > 0) groups.push({ heading: parentLabel, entries: matching, dimmed: false });
  if (rest.length > 0) {
    groups.push({
      // With nothing tagged there is no contrast to draw, so the second group loses its
      // heading rather than reading as "everything else" than nothing.
      heading: matching.length > 0 ? 'Everything else' : null,
      entries: rest,
      dimmed: matching.length > 0,
    });
  }
  return groups;
}

/**
 * The case-insensitive substring match the combo filters on while typing, preserving order
 * so the highlight can bold the matched run.
 */
export function matchEntries(entries: ListEntry[], typed: string): ListEntry[] {
  const needle = typed.trim().toLowerCase();
  if (needle.length === 0) return entries.slice();
  return entries.filter((entry) => entry.text.toLowerCase().includes(needle));
}
