<!--
  The left column's Unplaced section (design-system §8.3's section-label and row grammar).

  A writing card that loses its last placement stays in the project — that is the corrected
  delete rule, and this is what keeps it from becoming invisible junk. THE WHOLE SECTION IS
  NOT RENDERED WHEN THE LIST IS EMPTY: not dimmed, not an empty state. §8.3 draws no empty
  state for it, and the feature doc says it "is empty and hidden until a blueprint item loses
  its last placement".

  Every row measurement here is §8.3's, the same values `CanvasList.svelte` already uses.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { blueprintForPayload } from '../../lib/blueprints.svelte';
  import { cardTitle } from '../../lib/types';
  import type { Glyph } from '../../lib/glyphs';
  import type { Item } from '../../lib/types';
  import { unplacedItems } from './unplaced.svelte';

  interface Props {
    /** Place the record on the open canvas. The root owns the view centre it lands at. */
    onPlace?: (item: Item) => void;
    /** Delete for good. The root pushes the undo command. */
    onDeleteForGood?: (item: Item) => void;
    onOpenMenu?: (event: MouseEvent, item: Item) => void;
  }

  const { onPlace, onDeleteForGood, onOpenMenu }: Props = $props();

  const items = $derived(unplacedItems());

  /** The card type's kicker glyph, so an unplaced row reads as what it is. */
  function glyphFor(item: Item): Glyph {
    return blueprintForPayload(item.payload)?.glyph ?? 'square-half';
  }

  function onKeyDown(event: KeyboardEvent, item: Item) {
    if (event.key === 'Delete') {
      event.preventDefault();
      onDeleteForGood?.(item);
    }
  }
</script>

{#if items.length > 0}
  <p class="section-label">Unplaced</p>
  <ul class="rows" data-testid="unplaced-list">
    {#each items as item (item.id)}
      <li>
        <button
          type="button"
          class="unplaced-row"
          ondblclick={() => onPlace?.(item)}
          onkeydown={(event) => onKeyDown(event, item)}
          oncontextmenu={(event) => onOpenMenu?.(event, item)}
        >
          <Icon glyph={glyphFor(item)} size={14} />
          <span class="name">{cardTitle(item)}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .section-label {
    margin: 0;
    padding: var(--space-14) var(--space-14) 8px;
    font-size: var(--text-10);
    letter-spacing: var(--tracking-10);
    text-transform: uppercase;
    opacity: 0.65;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .unplaced-row {
    display: flex;
    align-items: center;
    gap: var(--space-10);
    width: 100%;
    padding: var(--space-7) var(--space-14);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-12-5);
    text-align: left;
    cursor: pointer;
    opacity: 0.85;
    transition: background-color var(--duration-90) var(--ease);
  }

  .unplaced-row:hover {
    background: var(--tint-accent-hover);
    opacity: 1;
  }

  .unplaced-row:active {
    background: var(--tint-accent-press);
  }

  /* The glyph is the card type's own kicker, dimmed a step below the name (§8.3). */
  .unplaced-row :global(i) {
    opacity: 0.7;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
