<!--
  A link card's contents, in all three of the states design-system §9.5 draws.

  The state is derived from the *payload*, not from the status map: `fetched_at === null` is
  "not fetched", a `fetched_at` with no thumbnail is "no preview data", and both is
  "fetched". The status map only distinguishes in flight from failed, because it is
  presentation state (§13.1) and the durable truth has to be the payload.

  A fetched title or description is a text node. A page whose title is
  `<img src=x onerror=alert(1)>` shows those characters; it can never become markup.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import { assetUrl } from '../../lib/assets.svelte';
  import { LOW_ZOOM } from '../../lib/geometry';
  import { urlHost, type FetchStatus, type LinkPayload } from '../../lib/types';

  interface Props {
    payload: LinkPayload;
    status: FetchStatus;
    zoom: number;
    onRefetch?: () => void;
  }

  const { payload, status, zoom, onRefetch }: Props = $props();

  const simplified = $derived(zoom < LOW_ZOOM);
  const fetched = $derived(payload.fetched_at !== null);
  const thumbnail = $derived(assetUrl(payload.thumbnail_asset));
  const favicon = $derived(assetUrl(payload.favicon_asset));
  const domain = $derived(urlHost(payload.url) || payload.url);
  const fetching = $derived(status === 'fetching');
  const hasPreviewPicture = $derived(fetched && payload.thumbnail_asset !== null);
  /* Below LOW_ZOOM the card is the band alone: a link at that size is a coloured block. */
  const showBand = $derived(hasPreviewPicture || simplified);
</script>

<div class="link" data-testid={fetched ? 'link-card' : 'link-card-not-fetched'}>
  {#if showBand}
    <div class="band" class:fill={simplified && !hasPreviewPicture}>
      {#if thumbnail}
        <img src={thumbnail} alt="" decoding="async" loading="lazy" draggable="false" />
      {:else if !simplified}
        <Icon glyph="image" size={22} />
      {/if}
    </div>
  {/if}

  {#if !simplified}
    <div class="body" class:no-band={!hasPreviewPicture}>
      <p class="domain">
        {#if fetched}
          <span
            class="favicon"
            class:plain={!hasPreviewPicture}
            class:has-image={favicon !== ''}
            aria-hidden="true"
          >
            {#if favicon}
              <img src={favicon} alt="" decoding="async" loading="lazy" draggable="false" />
            {/if}
          </span>
        {:else}
          <Icon glyph="link-simple" size={13} />
        {/if}
        <span class="domain-text">{domain}</span>
      </p>

      {#if fetched}
        <p class="title">{payload.title || domain}</p>
        {#if hasPreviewPicture}
          <p class="description">{payload.description}</p>
        {:else}
          <p class="no-preview">No preview picture on this page</p>
        {/if}
      {:else}
        <p class="address">{payload.url}</p>
        {#if fetching}
          <p class="pending" data-testid="link-card-fetching">
            <span class="spinner"><Icon glyph="circle-dashed" size={13} /></span>
            Fetching preview…
          </p>
        {:else}
          <div class="pending">
            <button
              type="button"
              class="refetch"
              data-owns-press
              onclick={(event) => {
                event.stopPropagation();
                onRefetch?.();
              }}
            >
              <Icon glyph="arrow-clockwise" size={11} />
              Refetch
            </button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .link {
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* §9.5: a 126 px preview band on the neutral ground, above the body. */
  .band {
    height: 126px;
    flex: none;
    background: var(--color-raised);
    display: grid;
    place-items: center;
    overflow: hidden;
  }

  /* At low zoom the band is the whole card. */
  .band.fill {
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

  .body.no-band {
    padding: 11px 13px;
  }

  .domain {
    margin: 0 0 var(--space-6);
    display: flex;
    align-items: center;
    gap: var(--space-6);
    font-size: var(--text-10);
    letter-spacing: var(--tracking-6);
    text-transform: uppercase;
    opacity: 0.5;
    min-width: 0;
  }

  .domain-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A tinted stand-in until a favicon is fetched (§9.5). */
  .favicon {
    width: 12px;
    height: 12px;
    flex: none;
    border-radius: var(--radius-sm);
    background: var(--color-accent-tint-hover);
    overflow: hidden;
  }

  .favicon.plain {
    background: var(--color-inset);
  }

  .favicon.has-image {
    background: transparent;
  }

  .favicon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .title {
    margin: 0;
    font-size: var(--text-13);
    font-weight: 600;
    line-height: 1.35;
  }

  .description {
    margin: var(--space-5) 0 0;
    font-size: var(--text-11-5);
    line-height: 1.45;
    opacity: 0.72;
  }

  .no-preview {
    margin: var(--space-7) 0 0;
    font-size: var(--text-11);
    opacity: 0.45;
  }

  .address {
    margin: 0;
    font-size: var(--text-12);
    line-height: 1.45;
    word-break: break-all;
    opacity: 0.85;
  }

  .pending {
    margin: var(--space-9) 0 0;
    display: flex;
    align-items: center;
    gap: var(--space-6);
    font-size: var(--text-11);
    opacity: 0.55;
  }

  .spinner {
    display: inline-flex;
    animation: spin var(--duration-spinner) linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .refetch {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-accent-text);
    font: inherit;
    font-size: var(--text-11);
    cursor: pointer;
    transition: background-color var(--duration-90) var(--ease);
  }

  .refetch:hover {
    background: var(--tint-accent-hover);
  }

  .refetch:active {
    background: var(--tint-accent-press);
  }

  /* The one documented exception to the .35 disabled value (§9.5). */
  .refetch:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
