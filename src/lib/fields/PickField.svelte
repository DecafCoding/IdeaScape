<!--
  A Pick field: one combo (design-system §9.25, §9.26).

  It stores one pick entry — an id, your words, and where it came from. A value the shipped
  list has never heard of is accepted like any other.
-->
<script lang="ts">
  import Combo from './Combo.svelte';
  import { parsePickEntry, type BlueprintField, type FieldValue } from '../blueprints.svelte';
  import type { PickEntry } from '../blueprints.svelte';

  interface Props {
    field: BlueprintField;
    value: FieldValue | undefined;
    /** The value of the field named by `filter_by`, for the one-hop sort. */
    parent?: PickEntry | null;
    parentLabel?: string;
    onCommit?: (value: FieldValue, added: boolean) => void;
  }

  const { field, value, parent = null, parentLabel = '', onCommit }: Props = $props();

  const entry = $derived(parsePickEntry(value));
</script>

<Combo
  list={field.list ?? ''}
  value={entry}
  {parent}
  {parentLabel}
  placeholder="Choose Or Type…"
  onCommit={(picked, added) => onCommit?.(picked, added)}
  onClear={() => onCommit?.(null, false)}
/>
