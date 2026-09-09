<!--
  The one chip style (design-system §9.25, "The chip — one style everywhere").

  One style for genre, sub-genre, tropes and themes alike. The face is not the place to teach
  the difference between them (§9.27), so there is deliberately no per-list variant here.

  Three shapes, all the same chip:
  - the default, in a form: carries its remove icon
  - `face`: on a card face — loses the remove icon and tightens
  - `overflow`: the `+n` pill, the same shape at opacity .55

  This lives in `lib/fields/` rather than in a feature because the panel
  (`features/shell`), the card face (`features/cards`) and the sheets (`features/writing`)
  all draw it, and a feature may not import another feature. `lib/Icon.svelte` is the
  precedent for a shared component in `lib/`.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';

  interface Props {
    text: string;
    /** The card-face shape: no remove icon, tighter padding. */
    face?: boolean;
    /** The `+n` pill. Implies `face` and never carries a remove icon. */
    overflow?: boolean;
    /** Omitted on a face chip — a face carries no controls at all. */
    onRemove?: () => void;
  }

  const { text, face = false, overflow = false, onRemove }: Props = $props();

  const tight = $derived(face || overflow);
</script>

<span class="chip" class:face={tight} class:overflow data-testid="chip">
  <span class="text">{text}</span>
  {#if !tight && onRemove}
    <button type="button" class="remove" onclick={() => onRemove()} aria-label="Remove {text}">
      <Icon glyph="x" size={11} />
    </button>
  {/if}
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-5);
    max-width: 100%;
    padding: 3px 6px 3px 10px;
    border: 1px solid var(--color-divider);
    border-radius: 11px;
    font-size: var(--text-11);
    line-height: 1.35;
    color: var(--color-ink-72);
    white-space: nowrap;
    box-sizing: border-box;
  }

  /* One long trope name must never widen the 177px panel. */
  .text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip.face {
    gap: 0;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: var(--text-10-5);
  }

  .chip.overflow {
    opacity: 0.55;
  }

  .remove {
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.5;
    flex: none;
  }

  .remove:hover {
    opacity: 0.85;
  }
</style>
