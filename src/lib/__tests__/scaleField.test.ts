import { describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import ScaleField from '../fields/ScaleField.svelte';
import DiceButton from '../fields/DiceButton.svelte';
import FieldControl from '../fields/FieldControl.svelte';
import type { BlueprintField } from '../blueprints.svelte';

const OPENNESS: BlueprintField = {
  key: 'openness',
  label: 'Openness',
  kind: 'scale',
  meaning: 'Seven notches. The two end words live in the blueprint, never typed per card.',
  show_on_face: false,
  low: 'Conventional',
  high: 'Curious',
  randomizable: true,
};

const PLAIN: BlueprintField = { ...OPENNESS, key: 'plain', randomizable: false };

/** jsdom has no PointerEvent, so a MouseEvent carrying `pointerId` stands in for one. */
function pointer(type: string, clientX: number): Event {
  const event = new MouseEvent(type, { clientX, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

function render(props: Record<string, unknown>, Component: unknown = ScaleField) {
  const host = document.createElement('div');
  document.body.append(host);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component = mount(Component as any, { target: host, props });
  flushSync();
  return {
    host,
    rail: () => host.querySelector('[role="slider"]') as HTMLElement,
    value: () => host.querySelector('[data-testid="scale-value"]')?.textContent ?? '',
    key(key: string) {
      this.rail().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      flushSync();
    },
    destroy() {
      void unmount(component);
      host.remove();
    },
  };
}

describe('the Scale slider', () => {
  it('scaleField_withNoStoredValue_readsZeroAndDrawsNoEmptyState', () => {
    const view = render({ field: OPENNESS, value: undefined });
    // All zero is a real answer — "unremarkable, like most people". An absent key and a
    // stored 0 must be indistinguishable: no placeholder, no dash, no dimmed state.
    expect(view.value()).toBe('0');
    expect(view.rail().getAttribute('aria-valuenow')).toBe('0');
    const withZero = render({ field: OPENNESS, value: 0 });
    expect(withZero.host.innerHTML).toBe(view.host.innerHTML);
    withZero.destroy();
    view.destroy();
  });

  it('scaleField_drawsSevenNotchesAndTheBlueprintsTwoEndWords', () => {
    const view = render({ field: OPENNESS, value: 0 });
    expect(view.host.querySelectorAll('.notch')).toHaveLength(7);
    const ends = [...view.host.querySelectorAll('.ends span')].map((s) => s.textContent);
    expect(ends).toEqual(['Conventional', 'Curious']);
    view.destroy();
  });

  it('scaleField_theValueIsSignedAndUsesATrueMinusSign', () => {
    const plus = render({ field: OPENNESS, value: 2 });
    expect(plus.value()).toBe('+2');
    plus.destroy();

    const minus = render({ field: OPENNESS, value: -2 });
    expect(minus.value()).toBe('−2');
    // U+2212, never a hyphen.
    expect(minus.value().charCodeAt(0)).toBe(0x2212);
    minus.destroy();
  });

  it('scaleField_arrowRight_stepsOneNotchAndStopsAtPlusThree', () => {
    const onCommit = vi.fn();
    const view = render({ field: OPENNESS, value: 3, onCommit });
    view.key('ArrowRight');
    // Already at the top: nothing changed, so nothing is committed.
    expect(onCommit).not.toHaveBeenCalled();
    view.destroy();

    const stepping = render({ field: OPENNESS, value: 1, onCommit });
    stepping.key('ArrowRight');
    expect(onCommit).toHaveBeenCalledWith(2, 1);
    stepping.destroy();
  });

  it('scaleField_homeAndEnd_jumpToMinusThreeAndPlusThree', () => {
    const onCommit = vi.fn();
    const view = render({ field: OPENNESS, value: 0, onCommit });
    view.key('Home');
    expect(onCommit).toHaveBeenCalledWith(-3, 0);
    view.key('End');
    expect(onCommit).toHaveBeenCalledWith(3, 0);
    view.destroy();
  });

  it('scaleField_arrowDownAndUp_alsoStepOneNotch', () => {
    const onCommit = vi.fn();
    const view = render({ field: OPENNESS, value: 0, onCommit });
    view.key('ArrowDown');
    expect(onCommit).toHaveBeenLastCalledWith(-1, 0);
    view.key('ArrowUp');
    expect(onCommit).toHaveBeenLastCalledWith(1, 0);
    view.destroy();
  });

  it('scaleField_aDragAcrossFourNotches_pushesOneUndoCommand', () => {
    const onCommit = vi.fn();
    const view = render({ field: OPENNESS, value: -2, onCommit });
    const rail = view.rail();
    rail.setPointerCapture = () => {};
    rail.getBoundingClientRect = () =>
      ({ left: 0, width: 120, top: 0, height: 16, right: 120, bottom: 16 }) as DOMRect;

    rail.dispatchEvent(pointer('pointerdown', 10));
    flushSync();
    for (const x of [30, 60, 90, 118]) {
      rail.dispatchEvent(pointer('pointermove', x));
      flushSync();
    }
    // Nothing is committed while the drag is in flight.
    expect(onCommit).not.toHaveBeenCalled();

    rail.dispatchEvent(pointer('pointerup', 118));
    flushSync();
    // ONE command, carrying the value at pointer-down — not one per notch crossed.
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(3, -2);
    view.destroy();
  });

  it('scaleField_reportsRoleSliderWithAriaValueNowAndValueText', () => {
    const view = render({ field: OPENNESS, value: 2 });
    const rail = view.rail();
    expect(rail.getAttribute('role')).toBe('slider');
    expect(rail.getAttribute('aria-valuemin')).toBe('-3');
    expect(rail.getAttribute('aria-valuemax')).toBe('3');
    expect(rail.getAttribute('aria-valuenow')).toBe('2');
    expect(rail.getAttribute('aria-valuetext')).toContain('Curious');
    expect(rail.tabIndex).toBe(0);
    view.destroy();
  });
});

describe('the dice button', () => {
  it('diceButton_isOnlyDrawnForARandomizableField', () => {
    // §9.31 places ONE button on the group label that rerolls all five — never one per
    // slider — so `FieldControl` never draws one and the sheet decides.
    const control = render({ field: OPENNESS, value: 0 }, FieldControl);
    expect(control.host.querySelector('.dice')).toBeNull();
    control.destroy();

    const dice = render({ onRoll: vi.fn() }, DiceButton);
    expect(dice.host.querySelector('.dice')).not.toBeNull();
    dice.destroy();
  });

  it('diceButton_click_callsBackAndOwnsNoRandomnessOfItsOwn', () => {
    const onRoll = vi.fn();
    const view = render({ onRoll }, DiceButton);
    (view.host.querySelector('.dice') as HTMLButtonElement).click();
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(onRoll).toHaveBeenCalledWith();
    view.destroy();
  });

  it('fieldControl_aRandomizableField_stillDrawsItsLabelAndMeaning', () => {
    const view = render({ field: PLAIN, value: 0 }, FieldControl);
    expect(view.host.querySelector('.label')?.textContent).toContain('Openness');
    expect(view.host.querySelector('.meaning')?.textContent).toContain('Seven notches');
    view.destroy();
  });
});
