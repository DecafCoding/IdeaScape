/**
 * Moved to `src/lib/highlight.ts` in Phase 6.
 *
 * The combo (`lib/fields/Combo.svelte`) needs the same bolded-match run the search results
 * draw, and `import-direction` says shared code moves to `lib/` rather than being imported
 * across features. This re-export keeps the search feature's own imports reading naturally.
 */
export { splitOnMatch, type TextPart } from '../../lib/highlight';
