/**
 * The shaped roll behind Randomize.
 *
 * Plain local random numbers — no network call, no AI, permanently. Carried unchanged from
 * `feature-character-record.html` by way of `feature-writing-pack.html` §5.
 *
 * The weights make a bell curve, so most sliders land near the middle. The **guarantee** is
 * the part that matters: if every slider came out inside −1..+1, one of them is redrawn from
 * the tails. An unguarded bell curve gives a cast of ordinary people; a flat roll gives a
 * cast of extremists. The guarantee gives a mostly ordinary person with one clear edge. Do
 * not "simplify" it away.
 *
 * `random` is injected so every function here is deterministic under test, and nothing else
 * in the module reads `Math.random` directly.
 */

/** The relative weights for −3, −2, −1, 0, +1, +2, +3. */
export const SCALE_WEIGHTS = [1, 3, 6, 8, 6, 3, 1] as const;

const TOTAL_WEIGHT = SCALE_WEIGHTS.reduce((sum, w) => sum + w, 0);

/** The values outside −1..+1 — what the guarantee redraws from. */
const TAILS = [-3, -2, 2, 3] as const;
const TAIL_WEIGHTS = [1, 3, 3, 1] as const;
const TAIL_TOTAL = TAIL_WEIGHTS.reduce((sum, w) => sum + w, 0);

/** One weighted draw, returning −3..3. */
export function rollScale(random: () => number = Math.random): number {
  let ticket = random() * TOTAL_WEIGHT;
  for (let i = 0; i < SCALE_WEIGHTS.length; i += 1) {
    ticket -= SCALE_WEIGHTS[i];
    if (ticket < 0) return i - 3;
  }
  return 3;
}

/** One draw from the tails only, weighted the same way the tails are weighted in the curve. */
function rollTail(random: () => number): number {
  let ticket = random() * TAIL_TOTAL;
  for (let i = 0; i < TAILS.length; i += 1) {
    ticket -= TAIL_WEIGHTS[i];
    if (ticket < 0) return TAILS[i];
  }
  return TAILS[TAILS.length - 1];
}

/**
 * One draw per slider, then the guarantee: if every result fell inside −1..+1, one slider
 * chosen at random is replaced by a draw from the tails.
 *
 * The redraw is a single bounded draw rather than a rejection loop, so a pathological
 * generator can never hang the renderer.
 */
export function rollSpread(count: number, random: () => number = Math.random): number[] {
  if (count <= 0) return [];
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) values.push(rollScale(random));

  const flat = values.every((v) => v >= -1 && v <= 1);
  if (flat) {
    const index = Math.min(count - 1, Math.floor(random() * count));
    values[index] = rollTail(random);
  }
  return values;
}
