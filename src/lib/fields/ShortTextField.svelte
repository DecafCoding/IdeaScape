<!--
  A Short Text field (design-system §9.25): the panel's existing 11px input, full width.

  It commits on blur and on Enter, never on every keystroke — the same rule `NoteEditor`
  follows, and what keeps the undo stack usable.
-->
<script lang="ts">
  import type { BlueprintField, FieldValue } from '../blueprints.svelte';

  interface Props {
    field: BlueprintField;
    value: FieldValue | undefined;
    onCommit?: (value: FieldValue) => void;
  }

  const { field, value, onCommit }: Props = $props();

  const stored = $derived(typeof value === 'string' ? value : '');
  let draft = $state('');
  let editing = $state(false);

  const shown = $derived(editing ? draft : stored);

  function commit() {
    editing = false;
    const next = draft.trim();
    if (next === stored) return;
    onCommit?.(next.length === 0 ? null : next);
  }
</script>

<input
  class="input"
  type="text"
  aria-label={field.label}
  value={shown}
  spellcheck="false"
  onfocus={() => {
    draft = stored;
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

<style>
  .input {
    width: 100%;
    padding: var(--space-2) 4px;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: var(--color-raised);
    color: inherit;
    font: inherit;
    font-size: var(--text-11);
    box-sizing: border-box;
  }

  .input:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: -1px;
  }
</style>
