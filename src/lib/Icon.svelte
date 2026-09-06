<!--
  The one place a Phosphor class is written. Every icon-only control passes a `label`, so
  it has an accessible name; a decorative icon beside its own text label passes none and is
  hidden from the accessibility tree instead.

  An icon inherits its row's colour and opacity and never sets its own (design-system §7).
-->
<script lang="ts">
  import type { Glyph } from './glyphs';

  interface Props {
    glyph: Glyph;
    /** Size in px. The contexts and their sizes are design-system §7.2. */
    size?: number;
    /** An accessible name. Required for an icon-only control; omitted beside a text label. */
    label?: string;
  }

  const { glyph, size = 13, label }: Props = $props();
</script>

<i
  class="ph ph-{glyph}"
  style="font-size: {size}px"
  aria-hidden={label ? undefined : 'true'}
  aria-label={label}
  role={label ? 'img' : undefined}
></i>

<style>
  i {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    flex: none;
  }
</style>
