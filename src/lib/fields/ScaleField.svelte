<!--
  The Scale slider (design-system §9.25, "The Scale slider").

  Seven notches, −3 to +3, all zero by default — and ALL ZERO IS A REAL ANSWER, meaning
  "unremarkable, like most people". An absent key and a stored 0 must be indistinguishable on
  screen: there is no placeholder, no dash and no dimmed state for a field never touched.

  The knob's 2px ring is drawn in the GROUND colour, which differs between the panel and a
  full-screen sheet, so it arrives as a prop rather than being hard-coded.

  A drag produces ONE undo entry, not one per notch crossed: the value at pointer-down is
  recorded and a single command is pushed at pointer-up, exactly as `CardLayer` does for a
  move.
-->
<script lang="ts">
  import { scaleValue, type BlueprintField, type FieldValue } from '../blueprints.svelte';

  interface Props {
    field: BlueprintField;
    value: FieldValue | undefined;
    /** The colour behind the knob's ring: the surface in the panel, the bg on a sheet. */
    ground?: string;
    /** Called once per settled change, with the value before it and the value after. */
    onCommit?: (next: number, before: number) => void;
  }

  const { field, value, ground = 'var(--color-surface)', onCommit }: Props = $props();

  const stored = $derived(scaleValue(value));
  /** What the rail draws while a drag is in flight, before anything is committed. */
  let dragged = $state<number | null>(null);
  /** The value at pointer-down, so the whole drag commits as one step. */
  let dragStart = $state(0);
  let rail = $state<HTMLDivElement | null>(null);

  const current = $derived(dragged ?? stored);
  const percent = $derived(((current + 3) / 6) * 100);
  const signed = $derived(current > 0 ? `+${current}` : current < 0 ? `−${-current}` : '0');
  const nearer = $derived(current < 0 ? (field.low ?? '') : current > 0 ? (field.high ?? '') : '');

  function commit(next: number, before: number) {
    if (next === before) return;
    onCommit?.(next, before);
  }

  function step(delta: number) {
    const next = Math.max(-3, Math.min(3, stored + delta));
    commit(next, stored);
  }

  function notchAt(clientX: number): number {
    const box = rail?.getBoundingClientRect();
    if (!box || box.width === 0) return stored;
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    return Math.round(ratio * 6) - 3;
  }

  function onPointerDown(event: PointerEvent) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragStart = stored;
    dragged = notchAt(event.clientX);
  }

  function onPointerMove(event: PointerEvent) {
    if (dragged === null) return;
    dragged = notchAt(event.clientX);
  }

  function onPointerUp() {
    if (dragged === null) return;
    const next = dragged;
    dragged = null;
    commit(next, dragStart);
  }

  function onKeyDown(event: KeyboardEvent) {
    const map: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
    };
    if (event.key in map) {
      event.preventDefault();
      step(map[event.key]);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      commit(-3, stored);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      commit(3, stored);
    }
  }
</script>

<div class="scale" data-testid="scale-field">
  <span class="value" data-testid="scale-value">{signed}</span>
  <div
    bind:this={rail}
    class="rail"
    role="slider"
    tabindex="0"
    aria-label={field.label}
    aria-valuemin="-3"
    aria-valuemax="3"
    aria-valuenow={current}
    aria-valuetext={nearer ? `${signed}, ${nearer}` : signed}
    onkeydown={onKeyDown}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <span class="track"></span>
    <span class="notches" aria-hidden="true">
      {#each [0, 1, 2, 3, 4, 5, 6] as notch (notch)}
        <span class="notch"></span>
      {/each}
    </span>
    <span class="knob" style="left: {percent}%; --ring: {ground}"></span>
  </div>
  <div class="ends" aria-hidden="true">
    <span>{field.low ?? ''}</span>
    <span>{field.high ?? ''}</span>
  </div>
</div>

<style>
  .scale {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  /* Right-aligned above the rail, signed, with a TRUE minus sign (U+2212), tabular so the
     number does not shift the row as it changes. */
  .value {
    align-self: flex-end;
    font-size: var(--text-11);
    font-weight: 600;
    opacity: 0.65;
    font-variant-numeric: tabular-nums;
  }

  .rail {
    position: relative;
    display: flex;
    align-items: center;
    height: 16px;
    width: 100%;
    cursor: pointer;
    touch-action: none;
  }

  .track {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--color-divider);
  }

  .notches {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
  }

  .notch {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--color-ink-30);
  }

  .knob {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-accent);
    /* The ring is the GROUND colour, so the knob reads as sitting on the rail rather than
       being outlined. It differs between the panel and a full-screen sheet. */
    box-shadow: 0 0 0 2px var(--ring);
    transform: translateX(-50%);
  }

  .ends {
    display: flex;
    justify-content: space-between;
    gap: var(--space-6);
    font-size: var(--text-10);
    opacity: 0.42;
  }
</style>
