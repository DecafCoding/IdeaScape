<!--
  The segmented control (design-system §9.11). Three of the five Settings rows are this
  control, so it is built once and built properly. It is the first shared form control in
  the product.

  The design system draws only the resting states, so the keyboard behaviour comes from the
  W3C ARIA APG radio-group pattern rather than from §9.11: roving tabindex, arrow keys that
  move and select, Home and End. That is behaviour designed in Phase 5 and flagged in the PR
  body; it invents no visual value.

  `label` is the accessible name for the group. The visible row label lives on the row, not
  in here.
-->
<script lang="ts" generics="T extends string">
  interface Props<T> {
    options: { value: T; label: string }[];
    value: T;
    /** The accessible name for the group, and the source of its data-testid. */
    label: string;
    onChange: (value: T) => void;
  }

  const { options, value, label, onChange }: Props<T> = $props();

  const slug = $derived(
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
  );

  let buttons: (HTMLButtonElement | null)[] = $state([]);

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    buttons[index]?.focus();
    onChange(option.value);
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    // Moving focus also selects: that is the APG's own rule for a radio group.
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        select((index - 1 + options.length) % options.length);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        select((index + 1) % options.length);
        break;
      case 'Home':
        select(0);
        break;
      case 'End':
        select(options.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
</script>

<div class="segmented" role="radiogroup" aria-label={label} data-testid="segmented-{slug}">
  {#each options as option, index (option.value)}
    <button
      bind:this={buttons[index]}
      type="button"
      role="radio"
      class="option"
      class:active={option.value === value}
      aria-checked={option.value === value}
      tabindex={option.value === value ? 0 : -1}
      data-testid="segmented-option"
      onclick={() => onChange(option.value)}
      onkeydown={(event) => onKeyDown(event, index)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  /* overflow is visible rather than hidden: hidden clips the 2 px offset focus ring on the
     first and last options, and §12 makes the focus ring a contract. The option corners are
     clipped by their own radius instead. */
  .segmented {
    display: flex;
    font-size: var(--text-11-5);
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-card);
    overflow: visible;
  }

  .option {
    padding: 4px var(--space-12);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-11-5);
    opacity: 0.6;
    cursor: pointer;
    transition:
      background var(--duration-90) var(--ease),
      opacity var(--duration-90) var(--ease);
  }

  .option:first-child {
    border-top-left-radius: var(--radius-card);
    border-bottom-left-radius: var(--radius-card);
  }

  .option:last-child {
    border-top-right-radius: var(--radius-card);
    border-bottom-right-radius: var(--radius-card);
  }

  /* §11.2: the active option gets no hover and no pressed response — it is already the
     answer. Only the inactive options respond. */
  .option:not(.active):hover {
    background: var(--tint-accent-hover);
    opacity: 0.9;
  }

  .option:not(.active):active {
    background: var(--tint-accent-press);
  }

  .option.active {
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-weight: 600;
    opacity: 1;
  }

  .option:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
