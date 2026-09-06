/**
 * The save scheduler. There is no Save button and no manual mode: the title bar's save
 * state is the only affordance.
 *
 * A discrete change (create, delete, edit commit, z-order) writes immediately. A continuous
 * change (a drag, a resize) mutates the store only and flushes ONCE on pointer release, so
 * a two-hundred-frame drag is one transaction and not two hundred (architecture §7,
 * persistence-strategy).
 *
 * It lives in `lib/` rather than in the store because it calls the command seam and is used
 * by several features; the store itself must stay free of scheduling.
 */
import { invokeSafe } from './ipc';
import type { PlacementUpdate } from './types';

export interface SaveHooks {
  onSaving: () => void;
  onSaved: () => void;
}

/** Pending geometry, keyed by placement id, so repeated frames collapse to one row each. */
const pending = new Map<number, PlacementUpdate>();
let flushing = false;

export function queuePlacementUpdate(update: PlacementUpdate): void {
  pending.set(update.id, update);
}

export function pendingCount(): number {
  return pending.size;
}

export function clearPending(): void {
  pending.clear();
}

/**
 * Write everything queued so far as one multi-row transaction. Called on pointer release,
 * and again when the window is closing so an interrupted drag still reaches disk.
 */
export async function flushPlacements(hooks?: SaveHooks): Promise<PlacementUpdate[]> {
  if (pending.size === 0 || flushing) return [];
  const updates = [...pending.values()];
  pending.clear();
  flushing = true;
  hooks?.onSaving();
  try {
    await invokeSafe('update_placements', { updates });
    hooks?.onSaved();
    return updates;
  } finally {
    flushing = false;
  }
}

/**
 * Run one discrete write, driving the save state around it. Discrete changes never wait
 * for a flush — they are written the moment they happen.
 */
export async function writeNow<T>(work: () => Promise<T>, hooks?: SaveHooks): Promise<T> {
  hooks?.onSaving();
  const result = await work();
  hooks?.onSaved();
  return result;
}

/** A trailing debounce, used for the per-canvas view write after panning stops. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): ((...args: A) => void) & { flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;

  const wrapped = (...args: A) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) fn(...lastArgs);
      lastArgs = null;
    }, delayMs);
  };

  wrapped.flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (lastArgs) fn(...lastArgs);
    lastArgs = null;
  };

  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  return wrapped;
}
