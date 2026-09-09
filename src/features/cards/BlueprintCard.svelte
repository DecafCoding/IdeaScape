<!--
  The generated card face (design-system §9.27).

  Every face is the blueprint's `show_on_face` fields, drawn in blueprint order. Three rules
  hold across all of them:
  - a small TYPE KICKER, so a mixed canvas reads at a glance;
  - NO LONG TEXT EVER on a face — the Chapter shows its summary, never its prose;
  - CHIPS ARE PLAIN OUTLINED PILLS, one style for genre, sub-genre, tropes and themes alike,
    because the face is not the place to teach the difference between them.

  THERE IS NO EDITING ON THE FACE. A double click opens the sheet where the blueprint has
  one, and otherwise focuses the panel's first field; the face never becomes an editor.

  THE FRAME GATE IS WON OR LOST HERE. Chips are the first thing that has ever made a card
  face more expensive, so this component stays plain elements: no per-chip transition, no
  shadow, no filter, no per-card ResizeObserver, and the overflow count is computed from the
  array length rather than by measuring the DOM.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import Chip from '../../lib/fields/Chip.svelte';
  import { assetStatus, assetUrl } from '../../lib/assets.svelte';
  import { LOW_ZOOM } from '../../lib/geometry';
  import {
    fieldValueText,
    parsePickEntries,
    parsePickEntry,
    type Blueprint,
    type BlueprintField,
    type BlueprintPayload,
  } from '../../lib/blueprints.svelte';

  interface Props {
    blueprint: Blueprint;
    payload: BlueprintPayload;
    zoom: number;
  }

  const { blueprint, payload, zoom }: Props = $props();

  /** How many chips a face shows before the `+n` pill. Counted, never measured. */
  const FACE_CHIP_LIMIT = 4;

  const simplified = $derived(zoom < LOW_ZOOM);

  /**
   * The face's fields. Long Text is barred by the blueprint and a Rust test asserts the data
   * files agree — but it is filtered here too, so a hand-edited data file cannot put a wall
   * of prose on a 264px tile.
   */
  const faceFields = $derived(
    blueprint.fields.filter((field) => field.show_on_face && field.kind !== 'long-text'),
  );

  /** The picture band is driven by the blueprint's FIRST Image field, not by the card type. */
  const imageField = $derived(faceFields.find((field) => field.kind === 'image') ?? null);
  const textFields = $derived(faceFields.filter((field) => field.kind !== 'image'));

  const imageName = $derived.by(() => {
    if (!imageField) return null;
    const value = payload.fields[imageField.key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  });
  const imageMissing = $derived(imageName !== null && !assetStatus(imageName).exists);

  /**
   * §9.27 draws two band heights — Character 104px, Location 92px — and two text-block
   * paddings, Beat's being tighter than everything else's. The blueprint format carries no
   * member for either, so those two names are read here and nowhere else. They are the only
   * per-type reads in this component: EVERY FIELD is generated, and if a third nuance ever
   * appears the fix is a member in the data file, not a third branch here.
   */
  const bandHeight = $derived(blueprint.id === 'location' ? 92 : 104);
  const tight = $derived(blueprint.id === 'beat');

  const expanded = $derived(payload.detail_canvas_id !== null);

  function chipsFor(field: BlueprintField) {
    const entries = parsePickEntries(payload.fields[field.key]);
    return { shown: entries.slice(0, FACE_CHIP_LIMIT), extra: entries.length - FACE_CHIP_LIMIT };
  }

  function pickText(field: BlueprintField): string {
    return parsePickEntry(payload.fields[field.key])?.text ?? '';
  }
</script>

{#if simplified}
  <!-- Below LOW_ZOOM the face draws as bars, exactly as a note does: reading at that size is
       impossible and drawing it is wasted work. -->
  <div class="card simplified" data-testid="blueprint-card-simplified" aria-hidden="true">
    <span class="bar wide"></span>
    <span class="bar"></span>
  </div>
{:else}
  <div class="card" class:picture={imageField !== null} data-testid="blueprint-card">
    {#if imageField}
      <div
        class="band"
        class:missing={imageMissing}
        style="height: {bandHeight}px"
        data-testid="blueprint-card-band"
      >
        {#if imageName && !imageMissing}
          <img src={assetUrl(imageName)} alt="" />
        {:else if imageMissing}
          <!-- §9.22's marker. The item is never deleted for a missing file. -->
          <Icon glyph="image-broken" size={22} label="Missing Picture" />
        {:else}
          <Icon glyph="image" size={22} />
        {/if}
      </div>
    {/if}

    <div class="body" class:tight>
      <p class="kicker" data-testid="blueprint-kicker">
        <Icon glyph={blueprint.glyph} size={blueprint.id === 'beat' ? 13 : 12} />
        <span class="kicker-label">{blueprint.label}</span>
        {#if expanded}
          <!-- The only mark on the face that this card has a canvas of its own. -->
          <Icon glyph="square-half" size={12} label="Has A Canvas Of Its Own" />
        {/if}
      </p>

      {#each textFields as field (field.key)}
        {#if field.kind === 'pick-many'}
          {@const chips = chipsFor(field)}
          {#if chips.shown.length > 0}
            <div class="chips">
              {#each chips.shown as entry (entry.id ?? entry.text)}
                <Chip text={entry.text} face />
              {/each}
              {#if chips.extra > 0}
                <Chip text={`+${chips.extra}`} face overflow />
              {/if}
            </div>
          {/if}
        {:else if field.kind === 'pick'}
          {@const text = pickText(field)}
          {#if text}
            <div class="chips"><Chip {text} face /></div>
          {/if}
        {:else}
          {@const text = fieldValueText(field, payload.fields[field.key])}
          {#if field.key === 'name'}
            <p class="name" data-testid="blueprint-name">{payload.name || text}</p>
          {:else if text}
            <p class="line">{text}</p>
          {/if}
        {/if}
      {/each}

      {#if !textFields.some((field) => field.key === 'name') && payload.name}
        <p class="name" data-testid="blueprint-name">{payload.name}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .card {
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
  }

  /* Text cards: §9.27's padding and gap. */
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-7);
    padding: 11px 13px 12px;
    min-width: 0;
  }

  /* Picture cards: the band is flush to the card edge, the text block tightens. */
  .card.picture > .body {
    gap: var(--space-5);
    padding: 9px 12px 11px;
  }

  /* §9.27: Beat is the one text card whose padding tightens. */
  .body.tight {
    gap: var(--space-6);
    padding: 10px 12px 11px;
  }

  .band {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    overflow: hidden;
    background: var(--color-inset);
  }

  /* §9.22's marker, the same shape ImageCard already draws: a dashed inset border on the
     recessed ground. The item is never deleted for a missing file. */
  .band.missing {
    border: 1px dashed var(--color-divider);
    background: var(--color-inset);
  }

  .band img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .kicker {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    margin: 0;
    font-size: var(--text-9-5);
    letter-spacing: var(--tracking-11);
    text-transform: uppercase;
    opacity: 0.45;
  }

  .kicker-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kicker :global(i:last-child) {
    opacity: 0.85;
  }

  .name {
    margin: 0;
    font-size: var(--text-13-5);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .line {
    margin: 0;
    font-size: var(--text-11-5);
    line-height: 1.5;
    opacity: 0.78;
    overflow: hidden;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  }

  .simplified {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: 11px 13px 12px;
  }

  .bar {
    height: 6px;
    border-radius: var(--radius-sm);
    background: var(--color-divider);
    width: 60%;
  }

  .bar.wide {
    width: 85%;
  }
</style>
