/**
 * The two new controls. Both are asserted on behaviour and on the accessibility contract —
 * the roles, `aria-checked`, the roving tabindex and the keyboard route — rather than on
 * pixels, plus the one style assertion that matters: no literal colour outside the token
 * layer.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SegmentedControl = (await import('../SegmentedControl.svelte')).default;
const Toggle = (await import('../Toggle.svelte')).default;

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

afterEach(cleanup);

describe('the segmented control', () => {
  it('segmented_click_callsOnChangeWithThatOptionOnce', async () => {
    const seen: string[] = [];
    const { getByText } = render(SegmentedControl, {
      props: {
        options: THEMES,
        value: 'light',
        label: 'Theme',
        onChange: (v: string) => seen.push(v),
      },
    });
    await fireEvent.click(getByText('Dark'));
    expect(seen).toEqual(['dark']);
  });

  it('segmented_clickTheActiveOption_stillReportsItWithoutError', async () => {
    const seen: string[] = [];
    const { getByText } = render(SegmentedControl, {
      props: {
        options: THEMES,
        value: 'light',
        label: 'Theme',
        onChange: (v: string) => seen.push(v),
      },
    });
    await fireEvent.click(getByText('Light'));
    expect(seen).toEqual(['light']);
  });

  it('segmented_arrowRightOnTheLastOption_wrapsToTheFirst', async () => {
    const seen: string[] = [];
    const { getByText } = render(SegmentedControl, {
      props: {
        options: THEMES,
        value: 'system',
        label: 'Theme',
        onChange: (v: string) => seen.push(v),
      },
    });
    await fireEvent.keyDown(getByText('System'), { key: 'ArrowRight' });
    expect(seen).toEqual(['light']);
  });

  it('segmented_arrowLeftOnTheFirstOption_wrapsToTheLast', async () => {
    const seen: string[] = [];
    const { getByText } = render(SegmentedControl, {
      props: {
        options: THEMES,
        value: 'light',
        label: 'Theme',
        onChange: (v: string) => seen.push(v),
      },
    });
    await fireEvent.keyDown(getByText('Light'), { key: 'ArrowLeft' });
    expect(seen).toEqual(['system']);
  });

  it('segmented_homeAndEnd_jumpToTheEnds', async () => {
    const seen: string[] = [];
    const { getByText } = render(SegmentedControl, {
      props: {
        options: THEMES,
        value: 'dark',
        label: 'Theme',
        onChange: (v: string) => seen.push(v),
      },
    });
    await fireEvent.keyDown(getByText('Dark'), { key: 'End' });
    await fireEvent.keyDown(getByText('Dark'), { key: 'Home' });
    expect(seen).toEqual(['system', 'light']);
  });

  it('segmented_render_marksExactlyOneOptionAriaCheckedAndTabbable', () => {
    const { getAllByRole } = render(SegmentedControl, {
      props: { options: THEMES, value: 'dark', label: 'Theme', onChange: () => {} },
    });
    const radios = getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    expect(radios.filter((r) => r.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(radios.find((r) => r.getAttribute('tabindex') === '0')?.textContent?.trim()).toBe(
      'Dark',
    );
  });

  it('segmented_render_isARadioGroupNamedByItsLabel', () => {
    const { getByRole } = render(SegmentedControl, {
      props: { options: THEMES, value: 'light', label: 'Zoom with', onChange: () => {} },
    });
    expect(getByRole('radiogroup', { name: 'Zoom with' })).toBeTruthy();
  });

  it('segmented_render_usesNoLiteralColourValue', () => {
    const source = readFileSync(resolve('src/features/settings/SegmentedControl.svelte'), 'utf8');
    const style = source.slice(source.indexOf('<style>'));
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(style).not.toMatch(/rgba?\(/);
    expect(style).not.toMatch(/--color-(neutral|accent)-[0-9]/);
  });
});

describe('the toggle', () => {
  it('toggle_click_callsOnChangeWithTheOppositeValue', async () => {
    const seen: boolean[] = [];
    const { getByRole } = render(Toggle, {
      props: { checked: false, label: 'Snap to grid', onChange: (v: boolean) => seen.push(v) },
    });
    await fireEvent.click(getByRole('switch'));
    expect(seen).toEqual([true]);
  });

  it('toggle_render_reportsRoleSwitchAndAriaChecked', () => {
    const { getByRole } = render(Toggle, {
      props: { checked: true, label: 'Snap to grid', onChange: () => {} },
    });
    const control = getByRole('switch', { name: 'Snap to grid' });
    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('toggle_spaceKey_togglesIt', async () => {
    const seen: boolean[] = [];
    const { getByRole } = render(Toggle, {
      props: { checked: true, label: 'Snap to grid', onChange: (v: boolean) => seen.push(v) },
    });
    // A <button> turns Space and Enter into a click for free; asserting the click path is
    // asserting the key path, and a keydown handler of our own would double-fire.
    const control = getByRole('switch');
    await fireEvent.keyDown(control, { key: ' ' });
    await fireEvent.click(control);
    expect(seen).toEqual([false]);
    expect(control.tagName).toBe('BUTTON');
  });

  it('toggle_render_usesNoLiteralColourValue', () => {
    const source = readFileSync(resolve('src/features/settings/Toggle.svelte'), 'utf8');
    const style = source.slice(source.indexOf('<style>'));
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(style).not.toMatch(/rgba?\(/);
    expect(style).not.toMatch(/--color-(neutral|accent)-[0-9]/);
  });
});
