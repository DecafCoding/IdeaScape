<!--
  An image card's contents, in all three of the states design-system §9.4 draws: the picture
  itself, the "no asset yet" ground, and the missing-file marker for a named file that is not
  in `assets/`.

  The missing state keeps the card's authored width and height, so the canvas never
  rearranges itself around a problem the user has not seen yet, and it deliberately does
  *not* use the destructive second accent — a missing picture is a state to fix, not damage.

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

{#if state === 'present'}
  <div class="image" data-testid="image-card">
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

<style>
  .image {
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
    position: relative;
  }

  .image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .image.empty {
    background: var(--color-raised);
    display: grid;
    place-items: center;
  }

  .image.missing {
    background: var(--color-inset);
    display: grid;
    place-items: center;
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
