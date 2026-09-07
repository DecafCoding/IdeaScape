<!--
  An image card's contents, in all three of the states design-system §9.4 draws: the picture
  itself, the "no asset yet" ground, and the missing-file marker for a named file that is not
  in `assets/`.

  The missing state keeps the card's authored width and height, so the canvas never
  rearranges itself around a problem the user has not seen yet, and it deliberately does
  *not* use the destructive second accent — a missing picture is a state to fix, not damage.

  When the payload carries a visible title, it is drawn centred above the picture in all
  three states, so the caption stays with the card whether or not the file is there. The
  description sits below the picture on the same terms.

  Below LOW_ZOOM the picture (or the ground) is drawn alone with no text, matching the note
  card's simplified branch.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { assetUrl } from '../../lib/assets';
  import { LOW_ZOOM } from '../../lib/geometry';
  import type { ImagePayload } from '../../lib/types';

  interface Props {
    payload: ImagePayload;
    /** True when the payload names a file that is not in `assets/`. */
    missing: boolean;
    zoom: number;
    /** The card's authored width, which decides the 20 px / 26 px glyph size. */
    width?: number;
    /**
     * Raised once, from the `<img>` load event, when the payload does not know the
     * picture's real dimensions yet. The composition root patches them back through
     * `update_image_dimensions`; this component never writes.
     */
    onDecoded?: (naturalWidth: number, naturalHeight: number) => void;
  }

  const { payload, missing, zoom, width = 0, onDecoded }: Props = $props();

  const simplified = $derived(zoom < LOW_ZOOM);
  const glyphSize = $derived(width > 240 ? 26 : 20);
  const src = $derived(missing ? '' : assetUrl(payload.asset));
  const state = $derived(missing ? 'missing' : src === '' ? 'empty' : 'present');
  // The caption is text, so it follows the same low-zoom rule as every other card label.
  const showTitle = $derived(!simplified && payload.title_visible && payload.title !== '');
  const showAlt = $derived(!simplified && payload.alt_visible && payload.alt !== '');

  /**
   * The picture's own shape, once the payload knows it. The picture box is then exactly as
   * tall as the picture at the card's width, so the description sits directly under it
   * instead of at the foot of the card. Before the size is known the box fills the card,
   * which is what it did before there was a description.
   */
  const ratio = $derived(
    payload.natural_width > 0 && payload.natural_height > 0
      ? `${payload.natural_width} / ${payload.natural_height}`
      : null,
  );

  /**
   * Guarded on the payload not knowing its size yet, so a pan that re-mounts the card does
   * not write to the database on every cull cycle.
   */
  let reported = false;

  function onLoad(event: Event) {
    if (reported || payload.natural_width !== 0) return;
    const img = event.currentTarget as HTMLImageElement;
    if (!img.naturalWidth || !img.naturalHeight) return;
    reported = true;
    onDecoded?.(img.naturalWidth, img.naturalHeight);
  }
</script>

<div class="wrap">
  {#if showTitle}
    <p class="image-title" data-testid="image-card-title">{payload.title}</p>
  {/if}

  {#if state === 'present'}
    <div
      class="image present"
      class:sized={ratio !== null}
      style={ratio === null ? undefined : `aspect-ratio: ${ratio}`}
      data-testid="image-card"
    >
      <img
        {src}
        alt={payload.alt}
        decoding="async"
        loading="lazy"
        draggable="false"
        onload={onLoad}
      />
    </div>
  {:else if state === 'missing'}
    <!-- §9.4's missing-file marker: the interface's only dashed border. -->
    <div class="image missing" data-testid="image-card-missing">
      <div class="dashed" aria-hidden="true"></div>
      {#if !simplified}
        <div class="stack">
          <Icon glyph="image-broken" size={glyphSize} />
          <span class="file-name">{payload.source_name || payload.asset}</span>
          <span class="note">File not found in assets/</span>
        </div>
      {/if}
    </div>
  {:else}
    <div class="image empty" data-testid="image-card-empty">
      {#if !simplified}
        <div class="stack">
          <Icon glyph="image" size={glyphSize} />
          <span class="file-name">{payload.source_name}</span>
        </div>
      {/if}
    </div>
  {/if}

  {#if showAlt}
    <p class="image-alt" data-testid="image-card-alt">{payload.alt}</p>
  {/if}
</div>

<style>
  /* A column so the caption takes the height it needs and the picture keeps the rest. */
  .wrap {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    overflow: hidden;
  }

  .image-title {
    flex: none;
    margin: 0;
    /* The same space above and below, so the caption sits evenly over the picture. */
    padding: var(--space-5) var(--space-10);
    text-align: center;
    font-size: var(--text-12);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .image-alt {
    flex: none;
    margin: 0;
    padding: var(--space-5) var(--space-10);
    text-align: center;
    font-size: var(--text-11);
    line-height: 1.4;
    opacity: 0.8;
    /* Wraps over as many lines as it needs; the card clips what will not fit. */
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .image {
    /* The empty and missing grounds fill what is left; a real picture does not — see below. */
    flex: 1 1 auto;
    min-height: 0;
    box-sizing: border-box;
    overflow: hidden;
    position: relative;
  }

  /*
    With a known shape the box takes the picture's own height and no more, and still shrinks
    when the card is too short for it — `object-fit: contain` then scales the picture down
    rather than cutting it off.
  */
  .image.sized {
    flex: 0 1 auto;
  }

  .image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: top center;
    display: block;
  }

  /* The placeholder stacks from the top like everything else, kept off the very edge. */
  .image.empty {
    background: var(--color-raised);
    display: grid;
    place-items: start center;
    padding-top: var(--space-10);
  }

  .image.missing {
    background: var(--color-inset);
    display: grid;
    place-items: start center;
    padding-top: var(--space-10);
  }

  /* Inset 1 px, at --radius-sm, drawn as its own layer so the card's own radius is kept. */
  .dashed {
    position: absolute;
    inset: 1px;
    border: 1px dashed var(--color-divider);
    border-radius: var(--radius-sm);
    pointer-events: none;
  }

  .stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    padding: 0 var(--space-10);
    text-align: center;
    min-width: 0;
  }

  .file-name {
    font-size: var(--text-11);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note {
    /* Two pixels below the file name, on top of the 5 px stack gap. */
    margin-top: -3px;
    font-size: var(--text-10-5);
    opacity: 0.6;
  }
</style>
