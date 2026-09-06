<!--
  The marquee band, frame 21c. Two stacked divs on the same rectangle: a tinted fill and a
  full-opacity border. A single tinted div would fade its own border with it.

  The design file sizes the band to its selection; the application does it the other way
  round — the band is what the pointer drew, and the selection follows from it.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
  import type { Rect } from '../../lib/geometry';

  interface Props {
    /** The band in screen pixels. */
    band: Rect;
  }

  const { band }: Props = $props();

  const style = $derived(
    `left: ${band.x}px; top: ${band.y}px; width: ${band.width}px; height: ${band.height}px;`,
  );
</script>

<div class="marquee" data-testid="marquee">
  <div class="fill" {style}></div>
  <div class="border" {style}></div>
  <div class="cursor" style="left: {band.x + band.width}px; top: {band.y + band.height}px;">
    <Icon glyph="cursor" size={13} />
  </div>
</div>

<style>
  .marquee {
    position: absolute;
    inset: 0;
    z-index: var(--z-marquee);
    pointer-events: none;
  }

  .fill,
  .border {
    position: absolute;
  }

  .fill {
    background: var(--color-accent);
    opacity: 0.1;
  }

  .border {
    border: 1px solid var(--color-accent);
    box-sizing: border-box;
  }

  .cursor {
    position: absolute;
    color: var(--color-accent);
  }
</style>
