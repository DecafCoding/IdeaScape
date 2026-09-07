/**
 * The connections feature's operations over the shared store: starting a link, tracking it,
 * completing it, and editing or deleting a connection.
 *
 * It imports from `lib/` and `stores/` only. Undo commands are pushed by `src/app.svelte`,
 * not from here — every other action in the codebase does it that way, and importing
 * `features/undo` from a feature would break the import direction rule.
 *
 * Connection writes are all discrete: they go through `writeNow`, never through
 * `queuePlacementUpdate`. A connection has no continuous geometry of its own, because its
 * endpoints are derived from the two placement rectangles at render time.
 */
import { invokeSafe } from '../../lib/ipc';
import { writeNow, type SaveHooks } from '../../lib/save';
import { canvasStore } from '../../stores/canvasStore.svelte';
import type { Point } from '../../lib/geometry';
import { DIRECTED_FORWARD, type Connection } from '../../lib/types';

/**
 * Begin drawing a line from `fromPlacementId`.
 *
 * A link already in flight is never restarted. That is what makes the click-then-click route
 * work: with the Connect tool the press on the second card runs through here too, and
 * restarting the link there would move the source onto the card the user is trying to finish
 * on, so the release could never complete anything.
 */
export function beginLink(fromPlacementId: number, pointer: Point): void {
  if (canvasStore.pendingLink) return;
  if (!canvasStore.placements.has(fromPlacementId)) return;
  canvasStore.pendingLink = { fromPlacementId, pointer: { ...pointer } };
}

/** Move the free end of the line being drawn. The source never changes mid-gesture. */
export function trackLink(pointer: Point): void {
  const link = canvasStore.pendingLink;
  if (!link) return;
  canvasStore.pendingLink = { fromPlacementId: link.fromPlacementId, pointer: { ...pointer } };
}

/** Abandon the line being drawn. Nothing is written. */
export function cancelLink(): void {
  canvasStore.pendingLink = null;
}

/** The topmost placement whose rectangle contains `point`, by z-order. */
export function hitPlacementAt(point: Point): number | null {
  let best: { id: number; z: number } | null = null;
  for (const p of canvasStore.placements.values()) {
    if (point.x < p.x || point.x > p.x + p.width) continue;
    if (point.y < p.y || point.y > p.y + p.height) continue;
    if (!best || p.z_order > best.z || (p.z_order === best.z && p.id > best.id)) {
      best = { id: p.id, z: p.z_order };
    }
  }
  return best?.id ?? null;
}

/** The row joining this ordered pair, if one already exists. */
export function existingConnection(from: number, to: number): Connection | null {
  for (const c of canvasStore.connections.values()) {
    if (c.from_placement_id === from && c.to_placement_id === to) return c;
  }
  return null;
}

/**
 * Finish the line on `toPlacementId`, returning the new row — or null when nothing was
 * created. Dropping on empty space, or on a pair that is already connected, cancels quietly;
 * in the duplicate case the existing connection is selected instead, because the user's
 * intent is already satisfied and an error would be wrong.
 *
 * Releasing back on the SOURCE card keeps the link armed rather than dropping it. That
 * release is what a click is — press and let go without travelling — so dropping the link
 * there made click-then-click impossible and the whole tool look dead. Armed, the dashed
 * line stays on screen and the next click on another card finishes it. Escape and a click on
 * the empty background still cancel.
 */
export async function completeLink(
  toPlacementId: number | null,
  hooks?: SaveHooks,
): Promise<Connection | null> {
  const link = canvasStore.pendingLink;
  canvasStore.pendingLink = null;
  if (!link) return null;

  const fromPlacementId = link.fromPlacementId;
  if (toPlacementId === fromPlacementId) {
    canvasStore.pendingLink = link;
    return null;
  }
  if (toPlacementId === null) return null;
  if (!canvasStore.placements.has(toPlacementId)) return null;

  const already = existingConnection(fromPlacementId, toPlacementId);
  if (already) {
    canvasStore.selectConnection(already.id);
    return null;
  }

  const canvasId = canvasStore.activeCanvasId;
  if (canvasId === null) return null;

  const created = await writeNow(
    () =>
      invokeSafe<Connection>('create_connection', {
        canvasId,
        fromPlacementId,
        toPlacementId,
        label: null,
        directed: DIRECTED_FORWARD,
      }),
    hooks,
  );
  canvasStore.upsertConnection(created);
  canvasStore.selectConnection(created.id);
  return created;
}

/**
 * Write a connection's label, direction, colour, width, route and chip visibility, and mirror
 * the row back into the store. They all travel together — the panel holds them all and one
 * command writes them.
 */
export async function updateConnection(
  connectionId: number,
  label: string | null,
  directed: number,
  color: string,
  width: number,
  labelVisible: boolean,
  route: string,
  hooks?: SaveHooks,
): Promise<Connection> {
  const updated = await writeNow(
    () =>
      invokeSafe<Connection>('update_connection', {
        connectionId,
        label,
        directed,
        color,
        width,
        labelVisible,
        route,
      }),
    hooks,
  );
  canvasStore.upsertConnection(updated);
  return updated;
}

/** Delete one connection, returning the rows removed so undo can put them back. */
export async function deleteConnections(ids: number[], hooks?: SaveHooks): Promise<Connection[]> {
  if (ids.length === 0) return [];
  const removed = await writeNow(
    () => invokeSafe<Connection[]>('delete_connections', { ids }),
    hooks,
  );
  for (const c of removed) canvasStore.removeConnection(c.id);
  return removed;
}
