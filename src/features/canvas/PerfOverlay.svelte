<!--
  The development-only performance badge, frame 21h. It reads a rolling median frame time
  from one requestAnimationFrame loop and the drawn/total counts from the culling
  instrumentation.

  The frame's ph-gauge glyph is deliberately omitted: design-system §7.1 declares the icon
  set closed at 34 and ph-gauge is not among them. A development-only badge is not worth
  reopening a closed set, and a text label carries the same information.
-->
<script lang="ts">
  import { cullCounts } from '../../lib/culling';

  interface Props {
    /** Emitted every second with the rolling numbers, so a harness can record them. */
    onSample?: (sample: { fps: number; total: number; drawn: number }) => void;
  }

  const { onSample }: Props = $props();

  let fps = $state(0);
  let total = $state(0);
  let drawn = $state(0);

  $effect(() => {
    const frameTimes: number[] = [];
    let last = performance.now();
    let handle = 0;
    let lastReport = last;

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      if (delta > 0) {
        frameTimes.push(delta);
        if (frameTimes.length > 120) frameTimes.shift();
      }

      if (now - lastReport >= 500) {
        lastReport = now;
        const sorted = [...frameTimes].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? 16.7;
        fps = Math.round(1000 / median);
        total = cullCounts.total;
        drawn = cullCounts.drawn;
        onSample?.({ fps, total, drawn });
      }

      handle = requestAnimationFrame(tick);
    };

    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  });
</script>

<div class="badge" data-testid="perf-overlay">
  {fps}fps · {total} cards, {drawn} drawn
</div>

<style>
  .badge {
    position: absolute;
    top: var(--space-14);
    right: var(--space-14);
    z-index: var(--z-canvas-bars);
    padding: 3px 8px;
    background: var(--color-surface);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-zoom-bar);
    font-size: var(--text-11-5);
    opacity: 0.75;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
