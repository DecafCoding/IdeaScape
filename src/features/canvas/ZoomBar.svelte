<!--
  The zoom bar (design-system §8.4). Zoom by button, Zoom To Fit and Reset Zoom all ease
  over 160 ms; hand panning and wheel zooming are 0 ms, always — the transform transition
  is applied by the caller only for the button paths.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';

  interface Props {
    zoom: number;
    /** True when the view already holds every card, which dims Zoom To Fit. */
    fitsAlready?: boolean;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomToFit: () => void;
  }

  const { zoom, fitsAlready = false, onZoomIn, onZoomOut, onZoomToFit }: Props = $props();

  const percentage = $derived(`${Math.round(zoom * 100)}%`);
</script>

<div class="zoom-bar" data-testid="zoom-bar" data-owns-press>
  <button type="button" class="cell" onclick={onZoomOut}>
    <Icon glyph="minus" size={13} label="Zoom Out" />
  </button>

  <span class="percentage" data-testid="zoom-percentage">{percentage}</span>

  <button type="button" class="cell" onclick={onZoomIn}>
    <Icon glyph="plus" size={13} label="Zoom In" />
  </button>

  <span class="divider"></span>

  <button
    type="button"
    class="cell"
    class:is-unavailable={fitsAlready}
    disabled={fitsAlready}
    onclick={onZoomToFit}
  >
    <Icon glyph="corners-out" size={13} label="Zoom To Fit" />
  </button>
</div>

<style>
  .zoom-bar {
    position: absolute;
    left: 18px;
    bottom: var(--space-14);
    z-index: var(--z-canvas-bars);
    display: flex;
    align-items: center;
    padding: 3px;
    background: var(--color-surface);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-zoom-bar);
    font-size: var(--text-12);
  }

  .cell {
    width: 26px;
    height: 24px;
    display: grid;
    place-items: center;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
    transition:
      background-color var(--duration-90) var(--ease),
      opacity var(--duration-90) var(--ease);
  }

  .cell:hover:not(:disabled) {
    background: var(--tint-accent-hover);
    opacity: 1;
  }

  .cell:active:not(:disabled) {
    background: var(--tint-accent-press);
  }

  .percentage {
    min-width: 42px;
    text-align: center;
    font-size: var(--text-11-5);
    opacity: 0.75;
  }

  .divider {
    width: 1px;
    height: 16px;
    margin: 0 3px;
    background: var(--color-divider);
  }
</style>
