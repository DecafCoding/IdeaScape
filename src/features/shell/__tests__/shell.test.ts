/**
 * The Milestone 2 checkpoint: the shell's structural measurements, and the phase's
 * "nothing moves between the two themes" rule asserted across the token task, the asset
 * task and the chrome task at once.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
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

  it('titleBar_pickerMode_showsTheBrandWithNoBreadcrumbSaveStateOrCounts', () => {
    canvasStore.closeProject();
    const { getByTestId, getByText, queryByText, getByLabelText } = render(TitleBar, {
      props: { pickerMode: true },
    });

    const bar = getByTestId('title-bar');
    expect(getByText('IdeaScape')).toBeInTheDocument();
    expect(getByLabelText('Close')).toBeInTheDocument();
    expect(bar.querySelector('.breadcrumb')).toBeNull();
    expect(bar.querySelector('.save-state')).toBeNull();
    expect(bar.querySelector('.counts')).toBeNull();
    expect(queryByText(/cards ·/)).toBeNull();
  });

  it('leftColumn_isOneHundredAndSixtyEightPixelsWide', () => {
    expect(token('--size-left-column')).toBe('168px');
    const { getByTestId } = render(LeftColumn, { props: {} });
    expect(getByTestId('left-column')).toBeInTheDocument();
  });

  it('leftColumn_withoutSnippets_ownsNoSearchBoxAndNoCanvasRows', () => {
    // The markup moved to `features/search/` and `features/canvases/`: `features/shell/` may
    // not import either, so the root fills two snippet props instead. Given none, the column
    // renders neither — which is what proves the markup is no longer here.
    canvasStore.closeProject();
    canvasStore.canvases = [
      {
        id: 1,
        project_id: 1,
        name: 'Canvas 1',
        sort_order: 0,
        view_x: 0,
        view_y: 0,
        view_zoom: 1,
        created_at: '',
        updated_at: '',
      },
    ];
    const { getByTestId, queryByTestId } = render(LeftColumn, { props: {} });

    expect(queryByTestId('search-box')).toBeNull();
    expect(queryByTestId('canvas-list')).toBeNull();
    expect(getByTestId('left-column').querySelector('.canvas-row')).toBeNull();
    // And it no longer draws the inert word "Search" it carried since Phase 1.
    expect(getByTestId('left-column').textContent).not.toContain('Search');
  });

  it('leftColumn_imageRow_isAvailable', () => {
    // Drawn disabled since Phase 1 even though `pickImages` shipped in Phase 3; enabling it
    // here is one line of wiring to behaviour that already exists.
    let picked = 0;
    const { getByText } = render(LeftColumn, { props: { onNewImage: () => (picked += 1) } });
    const row = getByText('Image').closest('button') as HTMLButtonElement;
    expect(row.disabled).toBe(false);
    expect(row.className).not.toContain('is-unavailable');
    row.click();
    expect(picked).toBe(1);
  });

  it('leftColumn_closeProjectRow_isPinnedAboveSettings', () => {
    let closed = 0;
    const { getByText } = render(LeftColumn, { props: { onCloseProject: () => (closed += 1) } });
    const pinned = getByText('Close Project').closest('.pinned');
    expect(pinned).not.toBeNull();
    expect(pinned?.textContent).toContain('Settings');
    (getByText('Close Project').closest('button') as HTMLButtonElement).click();
    expect(closed).toBe(1);
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

describe('the Connect tool row', () => {
  beforeEach(() => {
    canvasStore.closeProject();
  });

  afterEach(cleanup);

  function seed(count: number) {
    for (let id = 1; id <= count; id += 1) {
      canvasStore.upsertPlacement({
        id,
        canvas_id: 1,
        item_id: id,
        x: id * 400,
        y: 0,
        width: 236,
        height: 150,
        z_order: id,
      });
    }
  }

  function connectRow(container: HTMLElement): HTMLButtonElement {
    const row = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Connect',
    );
    if (!row) throw new Error('the Connect row is not rendered');
    return row as HTMLButtonElement;
  }

  it('connectRow_aCanvasWithOneCard_isDisabled', () => {
    seed(1);
    const { container } = render(LeftColumn, { props: {} });
    const row = connectRow(container as HTMLElement);
    expect(row).toBeDisabled();
    expect(row.className).toContain('is-unavailable');
  });

  it('connectRow_aCanvasWithTwoCards_isEnabled', () => {
    seed(2);
    const { container } = render(LeftColumn, { props: {} });
    expect(connectRow(container as HTMLElement)).not.toBeDisabled();
  });

  it('connectRow_clicked_setsTheActiveToolToConnect', async () => {
    seed(2);
    const { container } = render(LeftColumn, { props: {} });
    await fireEvent.click(connectRow(container as HTMLElement));
    expect(canvasStore.activeTool).toBe('connect');
  });
});

describe('the properties panel Connection state', () => {
  beforeEach(() => {
    canvasStore.closeProject();
    for (const id of [1, 2]) {
      canvasStore.upsertPlacement({
        id,
        canvas_id: 1,
        item_id: id,
        x: id * 400,
        y: 0,
        width: 236,
        height: 150,
        z_order: id,
      });
    }
    canvasStore.upsertConnection({
      id: 7,
      canvas_id: 1,
      from_placement_id: 1,
      to_placement_id: 2,
      label: 'causes',
      directed: 1,
      color: 'default',
      width: 1,
      label_visible: true,
      route: 'straight',
    });
    canvasStore.selectConnection(7);
  });

  afterEach(cleanup);

  it('panel_aSelectedConnection_showsTheLabelAndDirectionGroups', () => {
    const { getByText, getByLabelText, queryByText } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {} },
    });
    expect(getByText('Connection')).toBeInTheDocument();
    // The row id is not shown: it names nothing the user can act on.
    expect(queryByText('connection-007')).toBeNull();
    expect(getByText('Label')).toBeInTheDocument();
    expect(getByText('Arrows')).toBeInTheDocument();
    for (const name of ['None', 'Forward', 'Back', 'Both']) {
      expect(getByText(name)).toBeInTheDocument();
    }
    expect((getByLabelText('Connection Label') as HTMLInputElement).value).toBe('causes');
  });

  it('panel_aLabelTyped_invokesUpdateConnectionOnce', async () => {
    const onConnectionChange = vi.fn();
    const { getByLabelText } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {}, onConnectionChange },
    });
    const input = getByLabelText('Connection Label') as HTMLInputElement;
    input.value = 'blocks';
    await fireEvent.change(input);
    expect(onConnectionChange).toHaveBeenCalledTimes(1);
    expect(onConnectionChange).toHaveBeenCalledWith('blocks', 1, 'default', 1, true, 'straight');
  });

  it('panel_aDirectionButtonClicked_invokesUpdateConnectionWithTheNewValue', async () => {
    const onConnectionChange = vi.fn();
    const { getByText } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {}, onConnectionChange },
    });
    await fireEvent.click(getByText('Both'));
    expect(onConnectionChange).toHaveBeenCalledWith('causes', 3, 'default', 1, true, 'straight');
  });

  it('panel_aColourSwatchClicked_invokesUpdateConnectionWithTheNewKey', async () => {
    const onConnectionChange = vi.fn();
    const { getByLabelText } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {}, onConnectionChange },
    });
    await fireEvent.click(getByLabelText('Blue'));
    expect(onConnectionChange).toHaveBeenCalledWith('causes', 1, 'blue', 1, true, 'straight');
  });

  it('panel_aWidthButtonClicked_invokesUpdateConnectionWithTheNewStep', async () => {
    const onConnectionChange = vi.fn();
    const { getByLabelText } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {}, onConnectionChange },
    });
    // The buttons show a bar, not a word — the name lives on the aria-label.
    await fireEvent.click(getByLabelText('Thick'));
    expect(onConnectionChange).toHaveBeenCalledWith('causes', 1, 'default', 3, true, 'straight');
  });

  it('panel_theElbowRouteButtonClicked_invokesUpdateConnectionWithTheNewKey', async () => {
    const onConnectionChange = vi.fn();
    const { getByText } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {}, onConnectionChange },
    });
    await fireEvent.click(getByText('Elbow'));
    expect(onConnectionChange).toHaveBeenCalledWith('causes', 1, 'default', 1, true, 'elbow');
  });

  it('panel_theRouteAlreadyChosen_clickingItAgainWritesNothing', async () => {
    const onConnectionChange = vi.fn();
    const { getByText } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {}, onConnectionChange },
    });
    await fireEvent.click(getByText('Straight'));
    expect(onConnectionChange).not.toHaveBeenCalled();
  });

  it('panel_theShowLabelBox_unticked_invokesUpdateConnectionKeepingTheText', async () => {
    const onConnectionChange = vi.fn();
    const { getByLabelText } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {}, onConnectionChange },
    });
    const box = getByLabelText('Show Label On Canvas') as HTMLInputElement;
    expect(box.checked).toBe(true);
    await fireEvent.click(box);
    // The label text travels unchanged; only the visibility flag flips.
    expect(onConnectionChange).toHaveBeenCalledWith('causes', 1, 'default', 1, false, 'straight');
  });

  it('panel_theCurrentDirection_carriesWeightAsWellAsFill', () => {
    const { getByText } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {} },
    });
    const forward = getByText('Forward').closest('button');
    expect(forward?.className).toContain('active');
    expect(forward?.getAttribute('aria-pressed')).toBe('true');
  });

  it('panel_aConnectionWhoseChipIsHidden_stillShowsTheLabelText', () => {
    // The 50 px rule hides the chip on the canvas; the panel is unaffected by zoom.
    canvasStore.setView({ zoom: 0.1 });
    const { getByLabelText } = render(PropertiesPanel, {
      props: { expanded: true, onToggle: () => {} },
    });
    expect((getByLabelText('Connection Label') as HTMLInputElement).value).toBe('causes');
  });

  it('panel_nothingSelected_isCollapsed', () => {
    canvasStore.selectConnection(null);
    canvasStore.clearSelection();
    const { getByTestId } = render(PropertiesPanel, {
      props: { expanded: false, onToggle: () => {} },
    });
    expect(getByTestId('properties-panel').className).toContain('collapsed');
  });
});
