/**
 * A small count spelled out, for helper text.
 *
 * Design-system §9.28's *Placed on* helper reads "One record, three places" — words, not
 * digits. Beyond ten it falls back to digits, because "seventeen" reads worse than "17" and
 * a card on seventeen canvases is not the case the sentence exists for.
 *
 * It lives beside `relativeTime.ts`: both turn a number into the words a helper line uses.
 */
const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
] as const;

export function countInWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  const whole = Math.round(n);
  return whole <= 10 ? WORDS[whole] : String(whole);
}
