<!--
  Character, full screen (design-system §9.31).

  The identity band is a 150×150 picture beside Name and Role side by side, then One-liner,
  then Description. The left column is **Personality** — the five sliders stacked at gap 7px,
  which is the gap that keeps all five visible with no scrolling, with ONE dice button
  right-aligned on the group label. The right column carries the tropes, the two context
  groups and the Card actions.

  Randomize is local random numbers. NO NETWORK CALL, NO AI, PERMANENTLY. It rerolls the five
  sliders and NOTHING ELSE — not the name, not the tropes, not the notes — and it is ONE undo
  entry that restores all five previous values in a single step.

  The sliders sit on the full-screen ground, so the knob's ring takes `--color-bg` rather
  than the panel's `--color-surface`.
-->
<script lang="ts">
  import SheetShell from './SheetShell.svelte';
  import DiceButton from '../../lib/fields/DiceButton.svelte';
  import FieldControl from '../../lib/fields/FieldControl.svelte';
  import CardContext from '../../lib/fields/CardContext.svelte';
  import Icon from '../../lib/Icon.svelte';
  import { parseBlueprintPayload, type Blueprint } from '../../lib/blueprints.svelte';
  import type { FieldValue } from '../../lib/blueprints.svelte';
  import type { Item, ItemContext } from '../../lib/types';

  interface Props {
    blueprint: Blueprint;
    item: Item;
    context: ItemContext | null;
    onBack?: () => void;
    onFieldChange?: (key: string, value: FieldValue, listAdded?: boolean) => void;
    onScaleChange?: (key: string, next: number, before: number) => void;
    onReplaceFieldImage?: (key: string) => void;
    onRandomize?: () => void;
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
    onScaleChange,
    onReplaceFieldImage,
    onRandomize,
    onExpandIntoCanvas,
    onDelete,
    onOpenPlacement,
    onOpenItem,
  }: Props = $props();

  const payload = $derived(parseBlueprintPayload(item.payload));

  const field = (key: string) => blueprint.fields.find((f) => f.key === key) ?? null;
  const value = (key: string) => payload.fields[key];

  /** The identity fields, in blueprint order, minus the picture the band draws itself. */
  const identityKeys = ['name', 'role', 'one_liner', 'description'];
  const pictureField = $derived(blueprint.fields.find((f) => f.kind === 'image') ?? null);
  const sliders = $derived(blueprint.fields.filter((f) => f.kind === 'scale'));
  const tropeFields = $derived(blueprint.fields.filter((f) => f.kind === 'pick-many'));
  const restKeys = $derived(
    blueprint.fields
      .filter(
        (f) => f.kind === 'long-text' && !identityKeys.includes(f.key) && f.key !== 'description',
      )
      .map((f) => f.key),
  );

  function commit(key: string, next: FieldValue, added = false) {
    onFieldChange?.(key, next, added);
  }
</script>

<SheetShell name={payload.name} typeLabel={blueprint.label} {onBack}>
  {#snippet identity()}
    {#if pictureField}
      <div class="portrait">
        <FieldControl
          field={pictureField}
          value={value(pictureField.key)}
          imageSize={150}
          onCommit={(next) => commit(pictureField.key, next)}
          onReplaceImage={() => onReplaceFieldImage?.(pictureField.key)}
        />
      </div>
    {/if}
    <div class="identity-fields">
      <div class="pair">
        {#each ['name', 'role'] as key (key)}
          {@const found = field(key)}
          {#if found}
            <FieldControl
              field={found}
              value={key === 'name' ? payload.name : value(key)}
              onCommit={(next, added) => commit(key, next, added)}
            />
          {/if}
        {/each}
      </div>
      {#each ['one_liner', 'description'] as key (key)}
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
    </div>
  {/snippet}

  {#snippet columns()}
    <div class="column">
      {#if sliders.length > 0}
        <section class="group" data-testid="personality">
          <p class="group-label">
            Personality
            {#if sliders.some((f) => f.randomizable)}
              <DiceButton onRoll={() => onRandomize?.()} />
            {/if}
          </p>
          <div class="sliders">
            {#each sliders as slider (slider.key)}
              <FieldControl
                field={slider}
                value={value(slider.key)}
                ground="var(--color-bg)"
                onCommitScale={(next, before) => onScaleChange?.(slider.key, next, before)}
              />
            {/each}
          </div>
          <!-- Printed verbatim: the guarantee is the whole point of the roll. -->
          <p class="guarantee" data-testid="randomize-guarantee">
            Randomize rolls a bell curve, then guarantees at least one slider reaches ±2 — a mostly
            ordinary person with one clear edge. Undo restores all five in one step.
          </p>
        </section>
      {/if}
    </div>

    <div class="column">
      {#each tropeFields as tropes (tropes.key)}
        <FieldControl
          field={tropes}
          value={value(tropes.key)}
          onCommit={(next, added) => commit(tropes.key, next, added)}
        />
      {/each}

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
  .portrait {
    flex: none;
    width: 150px;
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

  .group {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .group-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-9);
    margin: 0 0 var(--space-9);
    font-size: var(--text-10);
    letter-spacing: var(--tracking-10);
    text-transform: uppercase;
    opacity: 0.45;
  }

  /* gap 7px is the gap that keeps all five sliders visible with no scrolling. */
  .sliders {
    display: flex;
    flex-direction: column;
    gap: var(--space-7);
  }

  .guarantee {
    margin: var(--space-12) 0 0;
    font-size: var(--text-10-5);
    line-height: 1.5;
    opacity: 0.5;
  }

  /* Placed on and Joined to sit side by side on a sheet (§9.31). */
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
