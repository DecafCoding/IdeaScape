import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import LeftColumn from '../LeftColumn.svelte';
import { SHORTCUT_LABELS } from '../../../lib/shortcuts';
import { setBlueprints, type Blueprint } from '../../../lib/blueprints.svelte';

const WRITING: Blueprint[] = [
  ['book', 'Book', 'book'],
  ['chapter', 'Chapter', 'file-text'],
  ['scene', 'Scene', 'film-slate'],
  ['beat', 'Beat', 'dot-outline'],
  ['character', 'Character', 'user-circle'],
  ['location', 'Location', 'map-pin'],
].map(([id, label, glyph]) => ({
  id,
  label,
  glyph: glyph as Blueprint['glyph'],
  sheet: false,
  default_size: { width: 200, height: 100 },
  fields: [
    { key: 'name', label: 'Name', kind: 'short-text' as const, meaning: 'x', show_on_face: true },
  ],
}));

beforeEach(() => {
  cleanup();
  setBlueprints(WRITING);
});

describe('the rail Cards group', () => {
  it('leftColumn_theCardsGroupHasTwoSubmenuParentsAndNoFlatCardRows', () => {
    const { getByTestId, queryByText } = render(LeftColumn, { props: {} });
    const group = getByTestId('cards-group');
    expect(getByTestId('left-column').textContent).toContain('Cards');
    expect(group.textContent).toContain('General');
    expect(group.textContent).toContain('Writing Pack');
    // No flat rows: eight kinds do not fit in a 168px rail.
    expect(queryByText('Note')).toBeNull();
    expect(queryByText('Book')).toBeNull();
  });

  it('leftColumn_openingAParent_drawsA206pxFlyoutAtLeft100Percent', async () => {
    const { getByTestId, queryByTestId } = render(LeftColumn, { props: {} });
    expect(queryByTestId('cards-flyout')).toBeNull();

    await fireEvent.click(getByTestId('cards-parent-writing'));
    expect(getByTestId('cards-flyout')).not.toBeNull();

    // jsdom does not apply a component's scoped stylesheet, so §8.3's locked measurements
    // are asserted against the source — the same way the shell's own sizes are.
    const source = readFileSync(resolve('src/features/shell/LeftColumn.svelte'), 'utf8');
    const flyoutRule = source.slice(source.indexOf('.flyout {'), source.indexOf('.flyout-row'));
    expect(flyoutRule).toContain('position: absolute');
    expect(flyoutRule).toContain('left: 100%');
    expect(flyoutRule).toContain('width: 206px');
    expect(flyoutRule).toContain('var(--z-context-menu)');
    expect(flyoutRule).toContain('var(--shadow-context-menu)');
  });

  it('leftColumn_anOpenParent_takesThePressedAppearance', async () => {
    const { getByTestId } = render(LeftColumn, { props: {} });
    const parent = getByTestId('cards-parent-writing');
    expect(parent.className).not.toContain('active');
    await fireEvent.click(parent);
    // The same appearance as the active tool, which is correct: it is the thing acting.
    expect(parent.className).toContain('active');
    expect(parent.getAttribute('aria-expanded')).toBe('true');
  });

  it('leftColumn_theWritingPackSubmenuPrintsTheKeys2To7FromShortcutLabels', async () => {
    const { getByTestId } = render(LeftColumn, { props: {} });
    await fireEvent.click(getByTestId('cards-parent-writing'));
    const rows = [...getByTestId('cards-flyout').querySelectorAll('.flyout-row')];
    expect(rows.map((r) => r.querySelector('.flyout-label')?.textContent)).toEqual([
      'Book',
      'Chapter',
      'Scene',
      'Beat',
      'Character',
      'Location',
    ]);
    // Derived from SHORTCUT_LABELS — a menu never retypes a key (PRD §6.8).
    expect(rows.map((r) => r.querySelector('.flyout-shortcut')?.textContent)).toEqual([
      SHORTCUT_LABELS['new-book'],
      SHORTCUT_LABELS['new-chapter'],
      SHORTCUT_LABELS['new-scene'],
      SHORTCUT_LABELS['new-beat'],
      SHORTCUT_LABELS['new-character'],
      SHORTCUT_LABELS['new-location'],
    ]);
    expect(rows.map((r) => r.querySelector('.flyout-shortcut')?.textContent)).toEqual([
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
  });

  it('leftColumn_choosingAWritingRow_callsTheSameCreateFunctionTheKeyDoes', async () => {
    const made: string[] = [];
    const { getByTestId } = render(LeftColumn, {
      props: { onNewWritingCard: (id: string) => made.push(id) },
    });
    await fireEvent.click(getByTestId('cards-parent-writing'));
    const rows = [...getByTestId('cards-flyout').querySelectorAll('.flyout-row')];
    (rows[4] as HTMLButtonElement).click();
    expect(made).toEqual(['character']);
  });

  it('leftColumn_theGeneralSubmenuHoldsNoteAndImage', async () => {
    const onNewNote = vi.fn();
    const { getByTestId } = render(LeftColumn, { props: { onNewNote } });
    await fireEvent.click(getByTestId('cards-parent-general'));
    const rows = [...getByTestId('cards-flyout').querySelectorAll('.flyout-row')];
    expect(rows.map((r) => r.querySelector('.flyout-label')?.textContent)).toEqual([
      'Note',
      'Image',
    ]);
    expect(rows[0].querySelector('.flyout-shortcut')?.textContent).toBe('N');
    (rows[0] as HTMLButtonElement).click();
    expect(onNewNote).toHaveBeenCalledTimes(1);
  });

  it('leftColumn_withShowWritingCardsOff_doesNotDrawTheWritingPackParentAtAll', () => {
    const { getByTestId, queryByTestId } = render(LeftColumn, {
      props: { showWritingCards: false },
    });
    // Not drawn at all, not dimmed.
    expect(queryByTestId('cards-parent-writing')).toBeNull();
    expect(getByTestId('cards-group').textContent).not.toContain('Writing Pack');
  });

  it('leftColumn_withShowWritingCardsOff_keepsGeneralAsASubmenu', () => {
    const { getByTestId, queryByText } = render(LeftColumn, {
      props: { showWritingCards: false },
    });
    // General stays a submenu rather than flattening, so the rail does not change shape.
    expect(getByTestId('cards-parent-general')).not.toBeNull();
    expect(queryByText('Note')).toBeNull();
  });
});
