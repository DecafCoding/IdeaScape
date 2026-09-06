/**
 * The drawn relative-time phrasing — "just now", "2 min ago", "3 days ago".
 *
 * It lives in `lib/` rather than in the properties panel because the Phase 4 search
 * popover's canvas sub-line needs the same phrasing, and a phrase implemented twice drifts.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * `iso` as a phrase relative to `now`. An unparseable or future timestamp reads
 * "just now" — the panel has no state for "in the future" and inventing one would be worse
 * than rounding.
 */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';

  const elapsed = now - then;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'min');
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour');
  return plural(Math.floor(elapsed / DAY), 'day');
}

function plural(count: number, unit: string): string {
  const word = count === 1 || unit === 'min' ? unit : `${unit}s`;
  return `${count} ${word} ago`;
}
