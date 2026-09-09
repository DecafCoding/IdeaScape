<!--
  A Long Text field (design-system §9.25): a 153 × 44px textarea in the panel — the same box
  as the image card's Alt text (§9.4), so the panel has one textarea size and not two.

  It stores Markdown, through the same sanitised path a note body uses. A Long Text field is
  NEVER shown on a card face; that is the blueprint's rule, asserted by a Rust test, and the
  card component refuses to render one besides.
-->
<script lang="ts">
  import type { BlueprintField, FieldValue } from '../blueprints.svelte';

  interface Props {
    field: BlueprintField;
    value: FieldValue | undefined;
    /** A sheet gives the box its own height; the panel takes the 44px default. */
    height?: number;
    onCommit?: (value: FieldValue) => void;
  }

  const { field, value, height = 44, onCommit }: Props = $props();

  const stored = $derived(typeof value === 'string' ? value : '');
  let draft = $state('');
  let editing = $state(false);

  const shown = $derived(editing ? draft : stored);

  function commit() {
    editing = false;
    if (draft === stored) return;
    onCommit?.(draft.length === 0 ? null : draft);
  }
</script>

<textarea
  class="input"
  aria-label={field.label}
  style="height: {height}px"
  value={shown}
  onfocus={() => {
    draft = stored;
    editing = true;
  }}
  oninput={(event) => (draft = event.currentTarget.value)}
  onblur={commit}
></textarea>

<style>
  .input {
    width: 100%;
    padding: var(--space-5) var(--space-6);
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: var(--color-raised);
    color: inherit;
    font: inherit;
    font-size: var(--text-11);
    line-height: 1.5;
    resize: none;
    box-sizing: border-box;
  }

  .input:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: -1px;
  }
</style>
