<!--
  The Randomize button (design-system §9.31).

  It is right-aligned on a GROUP label and rerolls every randomizable slider in that group —
  never one button per slider. It owns no randomness of its own: it calls back and
  `lib/randomize.ts` does the rolling, which is what keeps the roll pure and testable.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';

  interface Props {
    onRoll?: () => void;
    label?: string;
  }

  const { onRoll, label = 'Randomize' }: Props = $props();
</script>

<button type="button" class="dice" aria-label={label} onclick={() => onRoll?.()}>
  <Icon glyph="dice-five" size={14} />
</button>

<style>
  .dice {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-accent-text);
    cursor: pointer;
  }

  .dice:hover {
    background: var(--tint-accent-hover);
  }
</style>
