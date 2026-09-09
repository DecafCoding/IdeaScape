<!--
  The search results popover (design-system §9.8, frame 20c). Canvases first, always: the
  ranking is the requirement, not the indexing (`search-method`), and it is structural here —
  two groups in a fixed order rather than one sorted list.

  Matched words are bolded by splitting text into parts and rendering `<b>` around the matching
  ones through Svelte's normal escaping, never the raw-HTML directive: PRD §8.3 forbids stored
  text reaching the page as markup.

  The keyboard hints come from `SHORTCUT_LABELS`, never retyped — PRD §6.8 makes every printed
  key a contract the application must honour.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { getBlueprint } from '../../lib/blueprints.svelte';
  import type { Glyph } from '../../lib/glyphs';
  import { relativeTime } from '../../lib/relativeTime';
  import { SHORTCUT_LABELS } from '../../lib/shortcuts';
  import { splitOnMatch } from './highlight';
  import type { CanvasHit, CardHit, SearchResults } from '../../lib/types';

  interface Props {
    results: SearchResults;
    query: string;
    /** An index across both groups: canvases first, then cards. `-1` is none. */
    highlighted?: number;
    onOpenCanvas?: (hit: CanvasHit) => void;
    onOpenCard?: (hit: CardHit) => void;
  }

  const { results, query, highlighted = -1, onOpenCanvas, onOpenCard }: Props = $props();

  const canvasCount = $derived(results.canvases.length);

  function canvasSubLine(hit: CanvasHit): string {
    const cards = `${hit.card_count} ${hit.card_count === 1 ? 'card' : 'cards'}`;
    const when = relativeTime(hit.updated_at);
    return when ? `${cards} · last opened ${when}` : cards;
  }

  /**
   * The row's icon. A writing card carries its own TYPE KICKER glyph, so a Chapter hit is
   * visibly a Chapter; every other kind keeps the note or image glyph it always had.
   */
  function glyphFor(hit: CardHit): Glyph {
    if (hit.blueprint) return getBlueprint(hit.blueprint)?.glyph ?? 'note';
    return hit.kind === 'image' ? 'image' : 'note';
  }

  /** The row's sub-line: the card TYPE, which for a writing card is its blueprint's label. */
  function kindLabel(hit: CardHit): string {
    if (hit.blueprint) {
      const found = getBlueprint(hit.blueprint);
      if (found) return found.label;
    }
    return hit.kind.charAt(0).toUpperCase() + hit.kind.slice(1);
  }
</script>

<div
  class="popover scroll-thin"
  role="listbox"
  aria-label="Search Results"
  data-testid="search-results"
>
  {#if canvasCount > 0}
    <div class="group-header">
      <span class="group-label">Canvases</span>
      <span class="group-count">{canvasCount}</span>
    </div>
    {#each results.canvases as hit, index (hit.canvas_id)}
      <button
        type="button"
        class="row"
        class:highlighted={index === highlighted}
        role="option"
        aria-selected={index === highlighted}
        onclick={() => onOpenCanvas?.(hit)}
      >
        <Icon glyph="square-half" size={14} />
        <span class="text">
          <span class="title">
            {#each splitOnMatch(hit.name, query) as part, partIndex (partIndex)}
              {#if part.match}<b>{part.text}</b>{:else}{part.text}{/if}
            {/each}
          </span>
          <span class="sub">{canvasSubLine(hit)}</span>
        </span>
      </button>
    {/each}
  {/if}

  {#if canvasCount > 0 && results.cards.length > 0}
    <div class="rule" role="separator"></div>
  {/if}

  {#if results.cards.length > 0}
    <div class="group-header">
      <span class="group-label">Cards</span>
      <span class="group-count">{results.cards.length}</span>
    </div>
    {#each results.cards as hit, index (hit.placement_id)}
      <button
        type="button"
        class="row"
        class:highlighted={canvasCount + index === highlighted}
        role="option"
        aria-selected={canvasCount + index === highlighted}
        onclick={() => onOpenCard?.(hit)}
      >
        <Icon glyph={glyphFor(hit)} size={14} />
        <span class="text">
          <span class="title">
            {#each splitOnMatch(hit.title, query) as part, partIndex (partIndex)}
              {#if part.match}<b>{part.text}</b>{:else}{part.text}{/if}
            {/each}
          </span>
          <span class="sub">{kindLabel(hit)} · {hit.canvas_name}</span>
          {#if hit.snippet}
            <span class="snippet">
              {#each splitOnMatch(hit.snippet, query) as part, partIndex (partIndex)}
                {#if part.match}<b>{part.text}</b>{:else}{part.text}{/if}
              {/each}
            </span>
          {/if}
        </span>
      </button>
    {/each}
  {/if}

  <div class="rule" role="separator"></div>
  <div class="footer">
    <span>{SHORTCUT_LABELS['result-up']}{SHORTCUT_LABELS['result-down']} to move</span>
    <span>{SHORTCUT_LABELS.edit} to open</span>
    <span class="right">{SHORTCUT_LABELS.cancel} to close</span>
  </div>
</div>

<style>
  .popover {
    position: absolute;
    left: 156px;
    top: 34px;
    width: 318px;
    max-height: 420px;
    overflow-y: auto;
    z-index: var(--z-search-popover);
    padding: var(--space-6) 0 4px;
    background: var(--color-surface);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-search-popover);
    box-sizing: border-box;
    /* The same grammar as the context menu (§11.3): 110 ms, a 3 px rise, one curve. */
    animation: rise var(--duration-110) var(--ease);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .group-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: var(--space-6) var(--space-12) 4px;
  }

  .group-label {
    font-size: var(--text-10);
    letter-spacing: var(--tracking-10);
    text-transform: uppercase;
    opacity: 0.65;
  }

  .group-count {
    font-size: var(--text-10);
    opacity: 0.4;
  }

  .rule {
    height: 1px;
    margin: var(--space-6) 0;
    background: var(--color-divider);
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-9);
    width: 100%;
    padding: 7px var(--space-12);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    box-sizing: border-box;
    transition: background-color var(--duration-90) var(--ease);
  }

  .row :global(i) {
    margin-top: 1px;
    opacity: 0.55;
  }

  .row:hover {
    background: var(--tint-accent-hover);
  }

  .row.highlighted {
    background: var(--color-accent-tint-fill);
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .title {
    font-size: var(--text-12);
    font-weight: 600;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sub {
    font-size: var(--text-10-5);
    opacity: 0.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .snippet {
    font-size: var(--text-10-5);
    line-height: 1.4;
    opacity: 0.6;
  }

  .footer {
    display: flex;
    align-items: baseline;
    gap: var(--space-12);
    padding: 2px var(--space-12) var(--space-5);
    font-size: var(--text-10-5);
    opacity: 0.42;
  }

  .footer .right {
    margin-left: auto;
  }
</style>
