<!--
  The toggle (design-system §9.11): a 34 × 19 px switch with a 15 px knob. One Settings row
  is this control, and it is the only consumer of `--shadow-toggle-knob` in the product.

  §11.2 draws only the HOVERED "on" track colour (`--color-accent-600`), which is one step
  down from `--color-accent` — so the resting "on" value it implies is the accent itself,
  and the hovered one is the new `--color-accent-hover` role token. That resting state is
  designed in Phase 5 and flagged in the PR body.

  The whole control is one `<button role="switch">`. There is deliberately no nested
  `<input type="checkbox">`: a control inside a button is invalid, and the root's global
  keydown listener would see the key twice.

  The geometry below is written as literals because it is the control's own drawn geometry,
  exactly as ZoomBar writes its 26 × 24 cells. A literal *colour* is what is forbidden.
-->
<script lang="ts">
  interface Props {
    checked: boolean;
    /** The accessible name; the visible row label lives on the row. */
    label: string;
    onChange: (checked: boolean) => void;
  }

  const { checked, label, onChange }: Props = $props();
</script>

<button
  type="button"
  role="switch"
  class="track"
  class:on={checked}
  aria-checked={checked}
  aria-label={label}
  data-testid="toggle"
  onclick={() => onChange(!checked)}
>
  <span class="knob" data-testid="toggle-knob"></span>
</button>

<style>
  .track {
    position: relative;
    width: 34px;
    height: 19px;
    flex: none;
    padding: 0;
    border: none;
    border-radius: 10px;
    background: var(--color-inset);
    cursor: pointer;
    transition: background var(--duration-90) var(--ease);
  }

  .track.on {
    background: var(--color-accent);
  }

  .track:hover {
    background: var(--color-inset-hover);
  }

  .track.on:hover {
    background: var(--color-accent-hover);
  }

  .track:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  /* transform, never left: a layout-animating knob is the one place this phase could put
     work on the compositor's slow path. */
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: var(--color-surface);
    box-shadow: var(--shadow-toggle-knob);
    transition:
      transform var(--duration-110) var(--ease),
      width var(--duration-90) var(--ease);
  }

  /* 34 − 15 − 2 − 2 */
  .track.on .knob {
    transform: translateX(15px);
  }

  /* §11.2: pressed narrows the knob for the press duration. */
  .track:active .knob {
    width: 13px;
  }
</style>
