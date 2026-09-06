/**
 * The paste-routing decision, as one pure function. `Ctrl+V` is the busiest key in the
 * product: it has to choose between internal cards, a picture on the clipboard, a YouTube
 * address, a web address and plain text, in that priority order.
 *
 * The address half is not decided here. `classify_url` in Rust owns what a web address and
 * a YouTube address are — one source of truth, already tested — so the classification is
 * passed *in* and this function stays pure and synchronous.
 */

/** The classification `classify_url` returns, mirrored field for field. */
export type UrlClassification =
  | { kind: 'video'; url: string; provider: string; video_id: string }
  | { kind: 'link'; url: string }
  | { kind: 'none' };

export interface PasteInput {
  /** True when the application's own card clipboard holds something. */
  hasCards: boolean;
  /** The `image/*` type the system clipboard offers, or null. */
  imageMimeType: string | null;
  /** The clipboard's text, already read. */
  text: string;
  /** What Rust made of that text. Omit when there was no text to classify. */
  classification?: UrlClassification;
}

export type PasteDecision =
  | { kind: 'cards' }
  | { kind: 'image'; mimeType: string }
  | { kind: 'video'; url: string; provider: string }
  | { kind: 'link'; url: string }
  | { kind: 'note'; text: string }
  | { kind: 'none' };

/**
 * The priority order, which is also the order the acceptance criteria state: internal
 * cards, then a picture, then a YouTube address, then a web address, then plain text.
 */
export function decidePaste(input: PasteInput): PasteDecision {
  if (input.hasCards) return { kind: 'cards' };
  if (input.imageMimeType !== null) return { kind: 'image', mimeType: input.imageMimeType };

  const text = input.text.trim();
  if (text === '') return { kind: 'none' };

  const classification = input.classification;
  if (classification?.kind === 'video') {
    return { kind: 'video', url: classification.url, provider: classification.provider };
  }
  if (classification?.kind === 'link') {
    return { kind: 'link', url: classification.url };
  }
  return { kind: 'note', text: input.text };
}
