<!--
  A Number field (design-system §9.25): a 131px right-aligned input plus a 22px stepper
  column, totalling the panel's 153px of content width.

  EMPTY IS NOT ZERO. An empty number field is simply unanswered, and neither is ever drawn as
  the other — clearing the box removes the key rather than storing a 0.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import type { BlueprintField, FieldValue } from '../blueprints.svelte';

  interface Props {
    field: BlueprintField;
    value: FieldValue | undefined;
    onCommit?: (value: FieldValue) => void;
  }

  const { field, value, onCommit }: Props = $props();

  const stored = $derived(typeof value === 'number' && Number.isFinite(value) ? value : null);
  let draft = $state('');
  let editing = $state(false);

  const shown = $derived(editing ? draft : stored === null ? '' : String(stored));

  function parse(text: string): number | null {
    const trimmed = text.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function commit() {
    editing = false;
    const next = parse(draft);
    if (next === stored) return;
    onCommit?.(next);
  }

  function step(delta: number) {
    // Stepping from empty starts at the step itself, not at zero-plus-step: an unanswered
    // field has no value to add to.
    const next = (stored ?? 0) + delta;
    onCommit?.(next);
  }
</script>

<div class="number">
  <input
    class="input"
    type="text"
    inputmode="numeric"
    aria-label={field.label}
    value={shown}
    onfocus={() => {
      draft = stored === null ? '' : String(stored);
      editing = true;
    }}
    oninput={(event) => (draft = event.currentTarget.value)}
    onkeydown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        commit();
        event.currentTarget.blur();
      }
    }}
    onblur={commit}
  />
  <span class="stepper">
    <button type="button" aria-label="Increase {field.label}" onclick={() => step(1)}>
      <Icon glyph="caret-up" size={12} />
    </button>
    <button type="button" aria-label="Decrease {field.label}" onclick={() => step(-1)}>
      <Icon glyph="caret-down" size={13} />
    </button>
  </span>
</div>

<style>
  .number {
    display: flex;
    align-items: stretch;
    width: 100%;
  }

  .input {
    flex: 1;
    min-width: 0;
    padding: var(--space-2) 4px;
    border: 1px solid var(--color-divider);
    border-right: none;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
    background: var(--color-raised);
    color: inherit;
    font: inherit;
    font-size: var(--text-11);
    text-align: right;
    font-variant-numeric: tabular-nums;
    box-sizing: border-box;
  }

  .input:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: -1px;
  }

  .stepper {
    display: flex;
    flex-direction: column;
    width: 22px;
    flex: none;
    border: 1px solid var(--color-divider);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }

  .stepper button {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.7;
  }

  .stepper button:first-child {
    border-bottom: 1px solid var(--color-divider);
  }

  .stepper button:hover {
    opacity: 1;
    background: var(--tint-neutral-hover);
  }
</style>
