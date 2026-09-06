<!--
  The dot grid. It scales with the view and its offset tracks the pan exactly, so it reads
  as part of the world rather than as a fixed backdrop. It is decorative and implies no
  snapping — snap to grid is off by default and is a separate setting.

  Below roughly 40% zoom the pitch drops and the ink lightens (frame 21h): at that size a
  22 px grid is visual noise and drawing it is wasted work.
-->
<script lang="ts">
  import type { View } from '../../lib/geometry';
  import { GRID_SIZE, LOW_ZOOM } from '../../lib/geometry';

  interface Props {
    view: View;
  }

  const { view }: Props = $props();

  const pitch = $derived(view.zoom < LOW_ZOOM ? 6 : GRID_SIZE * view.zoom);
  const faded = $derived(view.zoom < LOW_ZOOM);
</script>

<div
  class="dot-grid"
  class:faded
  data-testid="dot-grid"
  style="
    background-size: {pitch}px {pitch}px;
    background-position: {view.x % pitch}px {view.y % pitch}px;
  "
></div>

<style>
  .dot-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(circle, var(--color-dot) 1px, transparent 1.2px);
  }

  .dot-grid.faded {
    opacity: 0.6;
  }
</style>
