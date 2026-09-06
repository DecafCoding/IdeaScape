<!--
  A video card's contents, per design-system §9.6: a 153 px thumbnail band with a centred
  play badge, then the provider row, the title and the invitation to open it.

  Video never plays in place. There is no iframe: watching happens in the system browser,
  which is what the boundary table's YouTube row requires, and an embedded player is a
  documented post-MVP gap rather than an omission to fix here.

  The drawn duration chip is deliberately NOT built — YouTube's public oEmbed response
  carries no duration, and the only endpoint that does needs an API key, which CLAUDE.md
  rules out. An invented or empty chip would be worse than none.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { assetUrl } from '../../lib/assets';
  import { LOW_ZOOM } from '../../lib/geometry';
  import type { VideoPayload } from '../../lib/types';

  interface Props {
    payload: VideoPayload;
    zoom: number;
    /** A stationary click, not a drag. The root decides what opening means. */
    onOpen?: () => void;
  }

  const { payload, zoom, onOpen }: Props = $props();

  /** Past this many pixels of pointer travel the gesture was a drag, not a click. */
  const CLICK_SLOP = 3;

  const simplified = $derived(zoom < LOW_ZOOM);
  const fetched = $derived(payload.fetched_at !== null);
  const thumbnail = $derived(assetUrl(payload.thumbnail_asset));

  let pressedAt: { x: number; y: number } | null = null;

  /**
   * The press position comes from `mousedown` rather than `pointerdown`: the card shell owns
   * the pointer events for dragging, and a mouse event carries the coordinates in every
   * environment the tests run in as well as in the real WebView.
   */
  function onMouseDown(event: MouseEvent) {
    pressedAt = { x: event.clientX, y: event.clientY };
  }

  function onClick(event: MouseEvent) {
    const start = pressedAt;
    pressedAt = null;
    if (!start) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved >= CLICK_SLOP) return;
    onOpen?.();
  }
</script>

<!-- The shell already owns selection and dragging; this only adds the open gesture. -->
<div
  class="video"
  data-testid="video-card"
  role="presentation"
  onmousedown={onMouseDown}
  onclick={onClick}
>
  <div class="band" class:fill={simplified}>
    {#if thumbnail}
      <img src={thumbnail} alt="" decoding="async" loading="lazy" draggable="false" />
    {/if}
    <span class="badge" data-testid="video-card-play" aria-hidden="true">
      <Icon glyph="play" size={16} />
    </span>
  </div>

  {#if !simplified}
    <div class="body">
      <p class="provider">
        <Icon glyph="youtube-logo" size={13} />
        <span class="provider-text">{payload.provider}</span>
      </p>
      <p class="title">{fetched && payload.title ? payload.title : payload.url}</p>
      <p class="open">Click to open in your browser</p>
    </div>
  {/if}
</div>

<style>
  .video {
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    cursor: pointer;
  }

  /* §9.6: 153 px tall, which is 16:9 against the card's authored 272 px width. */
  .band {
    height: 153px;
    flex: none;
    position: relative;
    background: var(--color-neutral-300);
    display: grid;
    place-items: center;
    overflow: hidden;
  }

  .band.fill {
    height: 100%;
  }

  .band img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .badge {
    position: absolute;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--color-play-badge);
    display: grid;
    place-items: center;
    color: var(--color-text);
  }

  .body {
    padding: 10px 13px 12px;
    min-width: 0;
  }

  .provider {
    margin: 0 0 var(--space-6);
    display: flex;
    align-items: center;
    gap: var(--space-6);
    font-size: var(--text-10);
    letter-spacing: var(--tracking-6);
    text-transform: uppercase;
    opacity: 0.5;
  }

  .provider-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title {
    margin: 0;
    font-size: var(--text-13);
    font-weight: 600;
    line-height: 1.35;
    overflow: hidden;
    word-break: break-word;
  }

  .open {
    margin: var(--space-6) 0 0;
    font-size: var(--text-11);
    opacity: 0.45;
  }
</style>
