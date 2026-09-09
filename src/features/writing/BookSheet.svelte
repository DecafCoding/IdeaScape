<!--
  Book, full screen (design-system §9.32).

  DELIBERATELY THE SAME SHAPE AS CHARACTER: one sheet pattern, two types. Any divergence
  beyond the left column and the identity picture size is a defect.

  The identity band is a 132×190 cover, then Name, then Genre and Sub-genre as two combos,
  then Logline and Synopsis. Book has no sliders, so the left column carries **Tropes** and
  **Themes** — one chip style for both — and the right column carries the two context groups
  and the Card actions.

  The Sub-genre combo's `filter_by: "genre"` is what makes the one-hop filter visible for the
  first time: the card's own genre group first, then *Everything else*, nothing hidden. Story
  tropes filter by the same parent.

  *Joined to* reads DOWNWARD here — *Contains* — where Character's reads upward. One group
  carries both directions, driven by the `reversed` flag, never by a second stored role.

  Synopsis is the Long Text and NEVER REACHES THE CARD FACE. Logline is the Short Text the
  face shows. Do not swap them.
-->
<script lang="ts">
  import SheetShell from './SheetShell.svelte';
  import FieldControl from '../../lib/fields/FieldControl.svelte';
  import CardContext from '../../lib/fields/CardContext.svelte';
  import Icon from '../../lib/Icon.svelte';
  import { parseBlueprintPayload, parsePickEntry } from '../../lib/blueprints.svelte';
  import type { Blueprint, BlueprintField, FieldValue } from '../../lib/blueprints.svelte';
  import type { Item, ItemContext } from '../../lib/types';

  interface Props {
    blueprint: Blueprint;
    item: Item;
    context: ItemContext | null;
    onBack?: () => void;
    onFieldChange?: (key: string, value: FieldValue, listAdded?: boolean) => void;
    onReplaceFieldImage?: (key: string) => void;
    onExpandIntoCanvas?: () => void;
    onDelete?: () => void;
    onOpenPlacement?: (canvasId: number, placementId: number) => void;
    onOpenItem?: (canvasId: number, itemId: number) => void;
  }

  const {
    blueprint,
    item,
    context,
    onBack,
    onFieldChange,
    onReplaceFieldImage,
    onExpandIntoCanvas,
    onDelete,
    onOpenPlacement,
    onOpenItem,
  }: Props = $props();

  const payload = $derived(parseBlueprintPayload(item.payload));

  const field = (key: string) => blueprint.fields.find((f) => f.key === key) ?? null;
  const value = (key: string) => payload.fields[key];

  const coverField = $derived(blueprint.fields.find((f) => f.kind === 'image') ?? null);
  const nameField = $derived(field('name'));
  const identityKeys = ['name', 'genre', 'subgenre', 'logline', 'synopsis'];
  /** The left column: every chip set, one style for all of them. */
  const chipFields = $derived(blueprint.fields.filter((f) => f.kind === 'pick-many'));
  const restKeys = $derived(
    blueprint.fields
      .filter((f) => f.kind === 'long-text' && !identityKeys.includes(f.key))
      .map((f) => f.key),
  );

  /** The parent value for a field's one-hop filter. One hop, never a chain. */
  function parentOf(f: BlueprintField) {
    return f.filter_by ? parsePickEntry(value(f.filter_by)) : null;
  }

  function parentLabelOf(f: BlueprintField): string {
    return parentOf(f)?.text ?? '';
  }

  function commit(key: string, next: FieldValue, added = false) {
    onFieldChange?.(key, next, added);
  }
</script>

<SheetShell name={payload.name} typeLabel={blueprint.label} {onBack}>
  {#snippet identity()}
    {#if coverField}
      <div class="cover">
        <FieldControl
          field={coverField}
          value={value(coverField.key)}
          imageSize={132}
          onCommit={(next) => commit(coverField.key, next)}
          onReplaceImage={() => onReplaceFieldImage?.(coverField.key)}
        />
      </div>
    {/if}
    <div class="identity-fields">
      {#if nameField}
        <FieldControl
          field={nameField}
          value={payload.name}
          onCommit={(next, added) => commit('name', next, added)}
        />
      {/if}
      <div class="pair">
        {#each ['genre', 'subgenre'] as key (key)}
          {@const found = field(key)}
          {#if found}
            <FieldControl
              field={found}
              value={value(key)}
              parent={parentOf(found)}
              parentLabel={parentLabelOf(found)}
              onCommit={(next, added) => commit(key, next, added)}
            />
          {/if}
        {/each}
      </div>
      {#each ['logline', 'synopsis'] as key (key)}
        {@const found = field(key)}
        {#if found}
          <FieldControl
            field={found}
            value={value(key)}
            longTextHeight={92}
            onCommit={(next, added) => commit(key, next, added)}
          />
        {/if}
      {/each}
    </div>
  {/snippet}

  {#snippet columns()}
    <div class="column" data-testid="book-chips">
      {#each chipFields as chips (chips.key)}
        <FieldControl
          field={chips}
          value={value(chips.key)}
          parent={parentOf(chips)}
          parentLabel={parentLabelOf(chips)}
          onCommit={(next, added) => commit(chips.key, next, added)}
        />
      {/each}
    </div>

    <div class="column">
      <div class="context">
        <CardContext {context} {onOpenPlacement} {onOpenItem} />
      </div>

      {#each restKeys as key (key)}
        {@const found = field(key)}
        {#if found}
          <FieldControl
            field={found}
            value={value(key)}
            longTextHeight={72}
            onCommit={(next, added) => commit(key, next, added)}
          />
        {/if}
      {/each}

      <div class="card-actions">
        <button type="button" class="card-action" onclick={() => onExpandIntoCanvas?.()}>
          <Icon glyph="square-half" size={13} />
          Expand Into A Canvas
        </button>
        <button type="button" class="card-action destructive" onclick={() => onDelete?.()}>
          <Icon glyph="trash" size={13} />
          Delete {blueprint.label}
        </button>
      </div>
    </div>
  {/snippet}
</SheetShell>

<style>
  /* 132 × 190 here, and the 52px square everywhere else: a layout prop, not a second
     Image control. The cover is an ordinary Image field going through the existing assets
     module — copied in, named by content hash, reference counted. */
  .cover {
    flex: none;
    width: 132px;
  }

  .identity-fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    flex: 1;
    min-width: 0;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-16);
  }

  .column {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
    min-width: 0;
  }

  .context {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-16);
    align-items: start;
  }

  .card-actions {
    display: flex;
    gap: var(--space-6);
  }

  .card-action {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-5) var(--space-9);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-11);
    cursor: pointer;
  }

  .card-action:hover {
    background: var(--tint-accent-hover);
  }

  .card-action.destructive {
    border-color: var(--color-accent-2);
    color: var(--color-accent-2-tint-text);
  }

  .card-action.destructive:hover {
    background: var(--color-accent-2-tint-fill);
  }
</style>
