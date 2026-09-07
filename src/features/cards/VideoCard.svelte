<!--
  A video card's contents, per design-system §9.6: a 153 px thumbnail band with the red
  YouTube mark in its bottom-right corner, then the title.

  There is no play badge. It was drawn in the mockups and shipped in Phase 3, and the owner
  removed it on 2026-09-07: the badge promised playback the card does not do, and a YouTube
  thumbnail usually carries its own.

  Video never plays in place. There is no iframe: watching happens in the system browser,
  which is what the boundary table's YouTube row requires, and an embedded player is a
  documented post-MVP gap rather than an omission to fix here.

  The YouTube mark IS the open control — it is the one thing on the card that opens the
  address in the system browser. Opening is never the card body: that belongs to selection
  and dragging like every other card kind, so a click meaning "select this" cannot be
  mistaken for one meaning "leave the application". The mark carries `data-owns-press` so
  the card layer's pointer capture leaves its click alone.

  The drawn duration chip is deliberately NOT built — YouTube's public oEmbed response
  carries no duration, and the only endpoint that does needs an API key, which CLAUDE.md
  rules out. An invented or empty chip would be worse than none.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { assetUrl } from '../../lib/assets.svelte';
  import { LOW_ZOOM } from '../../lib/geometry';
  import type { VideoPayload } from '../../lib/types';

  interface Props {
    payload: VideoPayload;
    zoom: number;
    /** The YouTube mark was clicked. The root decides what opening means. */
    onOpen?: () => void;
  }

  const { payload, zoom, onOpen }: Props = $props();

  const simplified = $derived(zoom < LOW_ZOOM);
  const fetched = $derived(payload.fetched_at !== null);
  const thumbnail = $derived(assetUrl(payload.thumbnail_asset));
</script>

<div class="video" data-testid="video-card">
  <div class="band" class:fill={simplified}>
    {#if thumbnail}
      <img src={thumbnail} alt="" decoding="async" loading="lazy" draggable="false" />
    {/if}
    <!-- The provider is a mark on the thumbnail, not a word: the logo says "YouTube" on its
         own, and the corner keeps the body to the title alone. It is also the open button. -->
    <button
      type="button"
      class="provider-mark"
      data-testid="video-card-provider"
      data-owns-press
      title="Open In Your Browser"
      aria-label="Open In Your Browser"
      onclick={(event) => {
        event.stopPropagation();
        onOpen?.();
      }}
    >
      <Icon glyph="youtube-logo" size={13} />
    </button>
  </div>

  {#if !simplified}
    <div class="body">
      <p class="title">{fetched && payload.title ? payload.title : payload.url}</p>
    </div>
  {/if}
</div>

<style>
  .video {
    height: 100%;
    box-sizing: border-box;
    /* The shell's own radius, repeated here: the thumbnail band starts at the very top of
       the card, and without this its square corners paint over the shell's rounded ones.
       `overflow: hidden` is what clips the picture to it. */
    border-radius: var(--radius-card);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* §9.6 draws the band 153 px tall, which is 16:9 against the card's authored 272 px
     width. It is written as the ratio rather than the pixel height so the band follows the
     card as it is resized and the whole 16:9 thumbnail keeps showing. At the authored width
     it is the same 153 px. */
  .band {
    aspect-ratio: 16 / 9;
    height: auto;
    flex: none;
    position: relative;
    background: var(--color-inset);
    display: grid;
    place-items: center;
    overflow: hidden;
  }

  /* The simplified card at low zoom is thumbnail only, so the band takes the whole card
     and the ratio gives way. */
  .band.fill {
    aspect-ratio: auto;
    height: 100%;
  }

  .band img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .body {
    padding: 10px 13px 12px;
    min-width: 0;
  }

  /* The logo in its own brand red, straight on the thumbnail with no ground: it is a mark,
     not a chip. §9.6's duration-chip corner: 7px in. It is also the card's only control, so
     it is a real button — hence the reset of the browser's own button paint. */
  .provider-mark {
    position: absolute;
    right: 7px;
    bottom: 7px;
    display: grid;
    place-items: center;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-provider-youtube);
    cursor: pointer;
  }

  .title {
    margin: 0;
    font-size: var(--text-13);
    font-weight: 600;
    line-height: 1.35;
    overflow: hidden;
    word-break: break-word;
  }
</style>
