/**
 * Splitting text on every occurrence of a query, so a component can render `<b>` around the
 * matching parts through Svelte's normal text escaping.
 *
 * This is why the highlight never needs `{@html}`: PRD §8.3 forbids inserting stored or
 * fetched text as markup, and the codebase holds exactly one `{@html}`, on rendered Markdown.
 */

export interface TextPart {
  text: string;
  match: boolean;
}

/**
 * `text` split into alternating non-matching and matching parts, case-insensitively.
 *
 * An empty or absent query returns the whole string as one non-matching part. The query is
 * compared with `indexOf` rather than a regular expression, so a metacharacter the user typed
 * is treated as text.
 */
export function splitOnMatch(text: string, query: string | null | undefined): TextPart[] {
  const needle = (query ?? '').trim();
  if (text.length === 0) return [];
  if (needle.length === 0) return [{ text, match: false }];

  const haystack = text.toLowerCase();
  const lowered = needle.toLowerCase();
  const parts: TextPart[] = [];
  let cursor = 0;

  for (;;) {
    const at = haystack.indexOf(lowered, cursor);
    if (at === -1) break;
    if (at > cursor) parts.push({ text: text.slice(cursor, at), match: false });
    // Sliced from the original, so the match keeps the case the user's text had.
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    cursor = at + needle.length;
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}
