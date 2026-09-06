<!--
  The mid-drop state. design-system §15.1 lists it as undrawn and assigns the design pass to
  the phase that builds the state, which is this one.

  A 2 px dashed accent ring inset 6 px over the canvas, plus a centred surface chip saying
  what the drop will do. Dashed-for-provisional is the language the design system already
  uses for the missing-asset marker and that Phase 2 extended to a line mid-drag; the accent
  means "active", which a live drop target is. No new token and no new glyph.
-->
<script lang="ts">
  import Icon from '../../lib/Icon.svelte';
</script>

<div class="drop-target" data-testid="drop-target" aria-hidden="true">
  <span class="chip">
    <Icon glyph="image" size={13} />
    Drop a picture to add it here
  </span>
</div>

<style>
  .drop-target {
    position: absolute;
    inset: 6px;
    border: 2px dashed var(--color-accent);
    border-radius: var(--radius-card);
    display: grid;
    place-items: center;
    pointer-events: none;
    z-index: var(--z-marquee);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-6) var(--space-10);
    background: var(--color-surface);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-zoom-bar);
    font-size: var(--text-11);
  }
</style>
