/**
 * The Milestone 2 checkpoint: the shell's structural measurements, and the phase's
 * "nothing moves between the two themes" rule asserted across the token task, the asset
 * task and the chrome task at once.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../../lib/ipc', () => ({ invokeSafe: vi.fn(), IpcError: class extends Error {} }));

const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const TitleBar = (await import('../TitleBar.svelte')).default;
const LeftColumn = (await import('../LeftColumn.svelte')).default;
const PropertiesPanel = (await import('../PropertiesPanel.svelte')).default;

const tokens = readFileSync(resolve('src/lib/tokens.css'), 'utf8');

/** Read a declared token value straight from the sheet — jsdom does not resolve custom properties. */
function token(name: string): string {
  const match = tokens.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token ${name} is not declared`);
  return match[1].trim();
}

describe('the shell measurements', () => {
  afterEach(cleanup);

  it('titleBar_isThirtyFourPixelsTall', () => {
    expect(token('--size-title-bar')).toBe('34px');
    const { getByTestId } = render(TitleBar, { props: {} });
    expect(getByTestId('title-bar')).toBeInTheDocument();
  });

  it('leftColumn_isOneHundredAndSixtyEightPixelsWide', () => {
    expect(token('--size-left-column')).toBe('168px');
    const { getByTestId } = render(LeftColumn, { props: {} });
    expect(getByTestId('left-column')).toBeInTheDocument();
  });

  it('propertiesPanel_isOneHundredAndSeventySevenPixelsExpanded', () => {
    expect(token('--size-panel-expanded')).toBe('177px');
  });

  it('propertiesPanel_isThirtyTwoPixelsCollapsed', () => {
    expect(token('--size-panel-collapsed')).toBe('32px');
  });

  it('propertiesPanel_collapsed_showsTheCaretAndTheVerticalLabel', () => {
    const { getByTestId, getByLabelText } = render(PropertiesPanel, {
      props: { expanded: false, onToggle: () => {} },
    });
    const panel = getByTestId('properties-panel');
    expect(panel.className).toContain('collapsed');
    expect(getByLabelText('Expand Properties')).toBeInTheDocument();
  });

  it('propertiesPanel_expandedWithNoSelection_isNotTheCollapsedShape', () => {
    const { getByTestId } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {} },
    });
    expect(getByTestId('properties-panel').className).not.toContain('collapsed');
  });

  it('propertiesPanel_expandedWithASelection_showsPositionSizeAndOrder', () => {
    canvasStore.closeProject();
    canvasStore.upsertItem({
      id: 1,
      project_id: 1,
      kind: 'note',
      payload: '{"title":"A Note","text":""}',
      created_at: '',
      updated_at: '',
    });
    canvasStore.upsertPlacement({
      id: 1,
      canvas_id: 1,
      item_id: 1,
      x: 10,
      y: 20,
      width: 236,
      height: 150,
      z_order: 0,
    });
    canvasStore.setSelection([1]);

    const { getByLabelText, getByText } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {} },
    });

    expect((getByLabelText('Position X') as HTMLInputElement).value).toBe('10');
    expect((getByLabelText('Size W') as HTMLInputElement).value).toBe('236');
    expect(getByText('Front')).toBeInTheDocument();
    expect(getByText('Back')).toBeInTheDocument();
    expect(getByLabelText('Duplicate')).toBeInTheDocument();
    expect(getByLabelText('Delete')).toBeInTheDocument();
  });

  it('propertiesPanel_multiSelectionWithDifferingValues_readsMixed', () => {
    canvasStore.closeProject();
    for (const id of [1, 2]) {
      canvasStore.upsertPlacement({
        id,
        canvas_id: 1,
        item_id: id,
        x: id * 100,
        y: 40,
        width: 236,
        height: 150,
        z_order: id,
      });
    }
    canvasStore.setSelection([1, 2]);

    const { getByLabelText } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {} },
    });

    expect((getByLabelText('Position X') as HTMLInputElement).value).toBe('mixed');
    // Y is the same on both, so it reads its value rather than "mixed".
    expect((getByLabelText('Position Y') as HTMLInputElement).value).toBe('40');
  });
});

describe('theme parity', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    cleanup();
  });

  const theme = readFileSync(resolve('src/lib/theme.css'), 'utf8');

  function darkNames(): Set<string> {
    return new Set([...theme.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
  }

  it('theme_flippingToDark_changesNoStructuralMeasurement', () => {
    const structural = [
      '--size-title-bar',
      '--size-left-column',
      '--size-panel-expanded',
      '--size-panel-collapsed',
      '--size-grid-pitch',
    ];
    const redefined = darkNames();
    for (const name of structural) {
      expect(redefined.has(name), `${name} must not move between themes`).toBe(false);
    }
  });

  it('theme_flippingToDark_changesTheGroundAndTheInk', () => {
    expect(theme).toMatch(/--color-bg:\s*#1a1817/);
    expect(theme).toMatch(/--color-text:\s*#ece9e6/);
  });

  it('theme_theShellStillRenders_withTheDarkAttributeSet', () => {
    document.documentElement.dataset.theme = 'dark';
    const { getByTestId } = render(TitleBar, { props: {} });
    expect(getByTestId('title-bar')).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
