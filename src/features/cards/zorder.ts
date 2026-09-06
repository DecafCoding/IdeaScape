/**
 * Stacking order. Both functions are pure: they take the current placements and the ids to
 * move, and return only the rows whose `z_order` actually changes — so a reorder is the
 * smallest possible transaction, and undoing one is the inverse set.
 */
import type { Placement } from '../../lib/types';

export interface ZOrderUpdate {
  id: number;
  z_order: number;
}

function sorted(placements: Iterable<Placement>): Placement[] {
  return [...placements].sort((a, b) => a.z_order - b.z_order || a.id - b.id);
}

/**
 * Reassign contiguous z values from 0 up, with `moving` placed at the top or the bottom.
 * The relative order *within* the moving set and within the rest is preserved in both
 * directions, which is what "send back on a multi-selection keeps their relative order"
 * means.
 */
function restack(
  placements: Iterable<Placement>,
  ids: ReadonlySet<number>,
  to: 'front' | 'back',
): ZOrderUpdate[] {
  const all = sorted(placements);
  const moving = all.filter((p) => ids.has(p.id));
  if (moving.length === 0) return [];

  const rest = all.filter((p) => !ids.has(p.id));
  const ordered = to === 'front' ? [...rest, ...moving] : [...moving, ...rest];

  const updates: ZOrderUpdate[] = [];
  ordered.forEach((placement, index) => {
    if (placement.z_order !== index) updates.push({ id: placement.id, z_order: index });
  });
  return updates;
}

/** Bring the given placements to the front. A no-op when they are already there. */
export function bringForward(
  placements: Iterable<Placement>,
  ids: Iterable<number>,
): ZOrderUpdate[] {
  return restack(placements, new Set(ids), 'front');
}

/** Send the given placements to the back. A no-op when they are already there. */
export function sendBack(placements: Iterable<Placement>, ids: Iterable<number>): ZOrderUpdate[] {
  return restack(placements, new Set(ids), 'back');
}
