/**
 * The one route Markdown takes into the page. `marked` parses; DOMPurify cleans. marked
 * explicitly does not sanitize, so DOMPurify is not optional — and `{@html}` is used
 * nowhere in the front end except on the output of `renderMarkdown`.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
];

marked.setOptions({ gfm: true, breaks: false, async: false });

/** Parse Markdown and clean the result. A note card can never run script. */
export function renderMarkdown(source: string): string {
  if (!source) return '';
  const raw = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'title'],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
    FORBID_ATTR: ['style'],
  });
}

export type Mark = 'bold' | 'italic' | 'bullet-list' | 'numbered-list';

export interface MarkResult {
  source: string;
  selectionStart: number;
  selectionEnd: number;
}

const WRAPPERS: Record<'bold' | 'italic', string> = { bold: '**', italic: '_' };

/**
 * The pure text transform behind the floating text bar's four buttons. Wrapping an
 * already-wrapped selection unwraps it again.
 */
export function insertMark(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  mark: Mark,
): MarkResult {
  const start = Math.max(0, Math.min(selectionStart, source.length));
  const end = Math.max(start, Math.min(selectionEnd, source.length));

  if (mark === 'bold' || mark === 'italic') {
    const token = WRAPPERS[mark];
    const selected = source.slice(start, end);
    const before = source.slice(0, start);
    const after = source.slice(end);

    // Already wrapped, either inside the selection or just outside it — unwrap.
    if (
      selected.length >= token.length * 2 &&
      selected.startsWith(token) &&
      selected.endsWith(token)
    ) {
      const inner = selected.slice(token.length, selected.length - token.length);
      return {
        source: before + inner + after,
        selectionStart: start,
        selectionEnd: start + inner.length,
      };
    }
    if (before.endsWith(token) && after.startsWith(token)) {
      return {
        source:
          before.slice(0, before.length - token.length) + selected + after.slice(token.length),
        selectionStart: start - token.length,
        selectionEnd: end - token.length,
      };
    }

    const next = `${before}${token}${selected}${token}${after}`;
    return {
      source: next,
      selectionStart: start + token.length,
      selectionEnd: end + token.length,
    };
  }

  // A list prefixes each line of the selection, expanded out to whole lines.
  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nextBreak = source.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? source.length : nextBreak;

  const lines = source.slice(lineStart, lineEnd).split('\n');
  const prefixed = lines.map((line, index) =>
    mark === 'bullet-list' ? `- ${line}` : `${index + 1}. ${line}`,
  );
  const replacement = prefixed.join('\n');

  return {
    source: source.slice(0, lineStart) + replacement + source.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + replacement.length,
  };
}
