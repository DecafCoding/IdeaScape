<!--
  A Pick Many field: a wrapping chip row above the same combo, used as the adder
  (design-system §9.25).

  The chips WRAP rather than scroll, and a chip takes `max-width: 100%` with its text
  ellipsized, so one long trope name never widens the 177px panel.

  The order is the stored order of the array, and it is the user's — a chip can be dragged to
  a new place and the order is kept.
-->
<script lang="ts">
  import Chip from './Chip.svelte';
  import Combo from './Combo.svelte';
  import { parsePickEntries, type BlueprintField, type FieldValue } from '../blueprints.svelte';
  import type { PickEntry } from '../blueprints.svelte';

  interface Props {
    field: BlueprintField;
    value: FieldValue | undefined;
    parent?: PickEntry | null;
    parentLabel?: string;
    onCommit?: (value: FieldValue, added: boolean) => void;
  }

  const { field, value, parent = null, parentLabel = '', onCommit }: Props = $props();

  const entries = $derived(parsePickEntries(value));

  /** The placeholder is named for the field it feeds: "Add a trope…", "Add a theme…". */
  const placeholder = $derived(`Add A ${singular(field.label)}…`);

  /** Dragging one chip onto another reorders the array; nothing is stored but the order. */
  let dragging = $state(-1);

  function singular(label: string): string {
    return label.endsWith('s') ? label.slice(0, -1) : label;
  }

  function add(entry: PickEntry, added: boolean) {
    if (entries.some((e) => e.text.toLowerCase() === entry.text.toLowerCase())) return;
    onCommit?.([...entries, entry], added);
  }

  function remove(index: number) {
    const next = entries.filter((_, i) => i !== index);
    onCommit?.(next.length === 0 ? null : next, false);
  }

  function drop(target: number) {
    if (dragging === -1 || dragging === target) return;
    const next = entries.slice();
    const [moved] = next.splice(dragging, 1);
    next.splice(target, 0, moved);
    dragging = -1;
    onCommit?.(next, false);
  }
</script>

<div class="pick-many">
  {#if entries.length > 0}
    <div class="chips" data-testid="chip-row">
      {#each entries as entry, index (entry.id ?? entry.text)}
        <span
          class="slot"
          draggable="true"
          role="listitem"
          ondragstart={() => (dragging = index)}
          ondragover={(event) => event.preventDefault()}
          ondrop={() => drop(index)}
          ondragend={() => (dragging = -1)}
        >
          <Chip text={entry.text} onRemove={() => remove(index)} />
        </span>
      {/each}
    </div>
  {/if}
  <Combo list={field.list ?? ''} value={null} {parent} {parentLabel} {placeholder} onCommit={add} />
</div>

<style>
  .pick-many {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    width: 100%;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    width: 100%;
  }

  .slot {
    display: inline-flex;
    max-width: 100%;
    cursor: grab;
  }
</style>
