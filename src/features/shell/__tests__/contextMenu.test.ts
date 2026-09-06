/**
 * The two context menus. The shortcut labels a menu prints are a contract (PRD §6.8): the
 * application must honour every key it shows, so these assertions check the labels come
 * from the shortcut map and match it exactly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { SHORTCUT_LABELS } from '../../../lib/shortcuts';
import { BACKGROUND_MENU_WIDTH, ELEMENT_MENU_WIDTH, type MenuEntry } from '../../../lib/menu';
import ContextMenu from '../ContextMenu.svelte';

const elementEntries: MenuEntry[] = [
  { kind: 'item', label: 'Edit Text', glyph: 'note', action: 'edit' },
  {
    kind: 'item',
    label: 'Connect From Here',
    glyph: 'flow-arrow',
    action: 'connect',
    available: false,
  },
  { kind: 'item', label: 'Duplicate', glyph: 'copy', action: 'duplicate' },
  { kind: 'item', label: 'Copy', glyph: 'copy', action: 'copy' },
  { kind: 'separator' },
  { kind: 'item', label: 'Bring To Front', glyph: 'arrow-line-up', action: 'bring-forward' },
  { kind: 'item', label: 'Send To Back', glyph: 'arrow-line-down', action: 'send-back' },
  { kind: 'separator' },
  { kind: 'item', label: 'Delete', glyph: 'trash', action: 'delete', destructive: true },
];

const backgroundEntries: MenuEntry[] = [
  { kind: 'item', label: 'New Note Here', glyph: 'note', action: 'new-note' },
  { kind: 'item', label: 'Add Image…', glyph: 'image', action: 'new-image', available: false },
  { kind: 'item', label: 'Paste', glyph: 'copy', action: 'paste', available: false },
  { kind: 'separator' },
  { kind: 'item', label: 'Select All', glyph: 'cursor', action: 'select-all' },
  { kind: 'item', label: 'Zoom To Fit', glyph: 'corners-out', action: 'zoom-to-fit' },
  { kind: 'item', label: 'Reset Zoom', glyph: 'magnifying-glass', action: 'reset-zoom' },
];

function open(entries: MenuEntry[], width: number) {
  return render(ContextMenu, { props: { x: 100, y: 100, width, entries, onClose: () => {} } });
}

describe('the element context menu', () => {
  afterEach(cleanup);

  it('elementMenu_printsEveryLabelVerbatim', () => {
    const { getByText } = open(elementEntries, ELEMENT_MENU_WIDTH);
    for (const label of [
      'Edit Text',
      'Connect From Here',
      'Duplicate',
      'Copy',
      'Bring To Front',
      'Send To Back',
      'Delete',
    ]) {
      expect(getByText(label)).toBeInTheDocument();
    }
  });

  it('elementMenu_printsTheShortcutTheDispatcherActuallyHonours', () => {
    const { getByText } = open(elementEntries, ELEMENT_MENU_WIDTH);
    expect(getByText(SHORTCUT_LABELS.edit)).toBeInTheDocument();
    expect(getByText(SHORTCUT_LABELS.duplicate)).toBeInTheDocument();
    expect(getByText(SHORTCUT_LABELS['bring-forward'])).toBeInTheDocument();
    expect(getByText(SHORTCUT_LABELS['send-back'])).toBeInTheDocument();
    expect(getByText(SHORTCUT_LABELS.delete)).toBeInTheDocument();
  });

  it('elementMenu_isTwoHundredAndFiftySixPixelsWide', () => {
    expect(ELEMENT_MENU_WIDTH).toBe(256);
    const { getByTestId } = open(elementEntries, ELEMENT_MENU_WIDTH);
    expect(getByTestId('context-menu').getAttribute('style')).toContain('width: 256px');
  });

  it('elementMenu_theDeleteRow_carriesTheSecondAccent', () => {
    const { getByText } = open(elementEntries, ELEMENT_MENU_WIDTH);
    const row = getByText('Delete').closest('button');
    expect(row?.className).toContain('destructive');
  });

  it('elementMenu_connectFromHere_isUnavailableWithNoSelection', () => {
    const { getByText } = open(elementEntries, ELEMENT_MENU_WIDTH);
    const row = getByText('Connect From Here').closest('button');
    expect(row).toBeDisabled();
    expect(row?.className).toContain('is-unavailable');
  });

  it('elementMenu_connectFromHere_isAvailableWithOneCardSelected', () => {
    // The row goes live from Phase 2: `available` is set from the same rule the C
    // shortcut uses — exactly one card selected on a canvas of two or more.
    const live = elementEntries.map((entry) =>
      entry.kind === 'item' && entry.action === 'connect'
        ? { ...entry, available: true, run: () => {} }
        : entry,
    );
    const { getByText } = open(live, ELEMENT_MENU_WIDTH);
    const row = getByText('Connect From Here').closest('button');
    expect(row).not.toBeDisabled();
    expect(row?.className).not.toContain('is-unavailable');
  });

  it('elementMenu_clickingARow_runsItAndClosesTheMenu', async () => {
    const run = vi.fn();
    const onClose = vi.fn();
    const { getByText } = render(ContextMenu, {
      props: {
        x: 10,
        y: 10,
        width: ELEMENT_MENU_WIDTH,
        entries: [{ kind: 'item', label: 'Duplicate', glyph: 'copy', action: 'duplicate', run }],
        onClose,
      },
    });
    await fireEvent.click(getByText('Duplicate'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('elementMenu_clickingAnUnavailableRow_doesNothing', async () => {
    const run = vi.fn();
    const onClose = vi.fn();
    const { getByText } = render(ContextMenu, {
      props: {
        x: 10,
        y: 10,
        width: ELEMENT_MENU_WIDTH,
        entries: [
          {
            kind: 'item',
            label: 'Add Image…',
            glyph: 'image',
            action: 'new-image',
            available: false,
            run,
          },
        ],
        onClose,
      },
    });
    await fireEvent.click(getByText('Add Image…'));
    expect(run).not.toHaveBeenCalled();
  });
});

describe('the background context menu', () => {
  afterEach(cleanup);

  it('backgroundMenu_printsEveryLabelVerbatim', () => {
    const { getByText } = open(backgroundEntries, BACKGROUND_MENU_WIDTH);
    for (const label of [
      'New Note Here',
      'Add Image…',
      'Paste',
      'Select All',
      'Zoom To Fit',
      'Reset Zoom',
    ]) {
      expect(getByText(label)).toBeInTheDocument();
    }
  });

  it('backgroundMenu_isTwoHundredAndThirtySixPixelsWide', () => {
    expect(BACKGROUND_MENU_WIDTH).toBe(236);
    const { getByTestId } = open(backgroundEntries, BACKGROUND_MENU_WIDTH);
    expect(getByTestId('context-menu').getAttribute('style')).toContain('width: 236px');
  });

  it('backgroundMenu_resetZoom_printsItsValueRatherThanAKey', () => {
    const { getByText } = open(backgroundEntries, BACKGROUND_MENU_WIDTH);
    expect(getByText('100%')).toBeInTheDocument();
    expect(SHORTCUT_LABELS['reset-zoom']).toBe('100%');
  });

  it('backgroundMenu_pasteWithAnEmptyClipboard_isGreyedOut', () => {
    const { getByText } = open(backgroundEntries, BACKGROUND_MENU_WIDTH);
    expect(getByText('Paste').closest('button')).toBeDisabled();
  });
});
