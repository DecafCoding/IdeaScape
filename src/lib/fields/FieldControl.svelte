<!--
  The field dispatcher (design-system §9.25).

  Given a blueprint field, a value and an `onCommit`, it draws the field in three parts,
  always in this order: the LABEL, the CONTROL, and the blueprint's MEANING line. The meaning
  is authored once in the data file — it is never written per card.

  This component knows the seven field kinds and NOTHING ELSE. It has never heard of a
  Character. If a per-card-type branch is ever needed here, the blueprint format is missing a
  member and the fix belongs in the data file.
-->
<script lang="ts">
  import ImageField from './ImageField.svelte';
  import LongTextField from './LongTextField.svelte';
  import NumberField from './NumberField.svelte';
  import PickField from './PickField.svelte';
  import PickManyField from './PickManyField.svelte';
  import ScaleField from './ScaleField.svelte';
  import ShortTextField from './ShortTextField.svelte';
  import type { BlueprintField, FieldValue, PickEntry } from '../blueprints.svelte';

  interface Props {
    field: BlueprintField;
    value: FieldValue | undefined;
    /** The value of the field named by `filter_by`, for the one-hop sort. */
    parent?: PickEntry | null;
    parentLabel?: string;
    /** The ground behind a Scale knob's ring: the surface in a panel, the bg on a sheet. */
    ground?: string;
    /** A sheet gives a Long Text box its own height; the panel takes 44px. */
    longTextHeight?: number;
    /** A sheet draws a bigger picture box; the panel takes 52px. */
    imageSize?: number;
    /** `added` is true when a combo wrote a row to the project's own vocabulary. */
    onCommit?: (value: FieldValue, added: boolean) => void;
    /** A Scale reports the value it started from, so a whole drag is one undo entry. */
    onCommitScale?: (next: number, before: number) => void;
    onReplaceImage?: () => void;
    /** Drawn in place of the label row — the sheets put a dice button there. */
    labelAfter?: import('svelte').Snippet;
  }

  const {
    field,
    value,
    parent = null,
    parentLabel = '',
    ground = 'var(--color-surface)',
    longTextHeight = 44,
    imageSize = 52,
    onCommit,
    onCommitScale,
    onReplaceImage,
    labelAfter,
  }: Props = $props();

  function commit(next: FieldValue, added = false) {
    onCommit?.(next, added);
  }
</script>

<div class="field" data-testid="field" data-field-key={field.key} data-field-kind={field.kind}>
  <p class="label">
    <span>{field.label}</span>
    {@render labelAfter?.()}
  </p>

  {#if field.kind === 'short-text'}
    <ShortTextField {field} {value} onCommit={(next) => commit(next)} />
  {:else if field.kind === 'long-text'}
    <LongTextField {field} {value} height={longTextHeight} onCommit={(next) => commit(next)} />
  {:else if field.kind === 'pick'}
    <PickField {field} {value} {parent} {parentLabel} onCommit={commit} />
  {:else if field.kind === 'pick-many'}
    <PickManyField {field} {value} {parent} {parentLabel} onCommit={commit} />
  {:else if field.kind === 'image'}
    <ImageField
      {field}
      {value}
      size={imageSize}
      onReplace={onReplaceImage}
      onCommit={(next) => commit(next)}
    />
  {:else if field.kind === 'number'}
    <NumberField {field} {value} onCommit={(next) => commit(next)} />
  {:else if field.kind === 'scale'}
    <ScaleField
      {field}
      {value}
      {ground}
      onCommit={(next, before) => {
        if (onCommitScale) onCommitScale(next, before);
        else commit(next);
      }}
    />
  {/if}

  <p class="meaning">{field.meaning}</p>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    margin: 0;
    font-size: var(--text-10);
    letter-spacing: var(--tracking-10);
    text-transform: uppercase;
    opacity: 0.45;
  }

  /* Authored once in the data file — help text today, a field definition later. */
  .meaning {
    margin: 0;
    font-size: var(--text-10);
    line-height: 1.4;
    opacity: 0.45;
  }
</style>
