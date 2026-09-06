/**
 * The panel's Title group for a note card. It is always editable, whether or not the
 * card's own editor is open — a selected-but-not-editing card has no text field the
 * pointer can reach, so this is the only route to a rename that does not enter the card.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

const invokeSafe = vi.fn();

vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (command: string, args?: Record<string, unknown>) => invokeSafe(command, args),
  toFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  IpcError: class IpcError extends Error {},
}));

const PropertiesPanel = (await import('../PropertiesPanel.svelte')).default;
const { canvasStore } = await import('../../../stores/canvasStore.svelte');

const PLACEMENT_ID = 1;
const ITEM_ID = 1;

function seedNoteCard(title: string, text: string) {
  canvasStore.upsertCard({
    placement: {
      id: PLACEMENT_ID,
      canvas_id: 1,
      item_id: ITEM_ID,
      x: 0,
      y: 0,
      width: 236,
      height: 150,
      z_order: 0,
    },
    item: {
      id: ITEM_ID,
      project_id: 1,
      kind: 'note',
      payload: JSON.stringify({ title, text }),
      created_at: 'now',
      updated_at: 'now',
    },
  });
  canvasStore.setSelection([PLACEMENT_ID]);
}

function seedImageCard() {
  canvasStore.upsertCard({
    placement: {
      id: 2,
      canvas_id: 1,
      item_id: 2,
      x: 0,
      y: 0,
      width: 320,
      height: 200,
      z_order: 0,
    },
    item: {
      id: 2,
      project_id: 1,
      kind: 'image',
      payload: JSON.stringify({ asset: 'a.png', natural_width: 10, natural_height: 10, alt: '' }),
      created_at: 'now',
      updated_at: 'now',
    },
  });
  canvasStore.setSelection([2]);
}

const props = { expanded: true, onToggle: () => {} };

describe('the properties panel Title group', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    canvasStore.closeProject();
  });

  afterEach(cleanup);

  it('panel_aNoteSelection_offersATitleBoxHoldingTheCurrentTitle', () => {
    seedNoteCard('New Note', 'body');
    const { getByTestId, getByLabelText } = render(PropertiesPanel, { props });

    expect(getByTestId('panel-title-group')).not.toBeNull();
    expect((getByLabelText('Note Title') as HTMLInputElement).value).toBe('New Note');
  });

  it('panel_aTitleEditedThenBlurred_reportsTheNewTitleOnce', async () => {
    seedNoteCard('New Note', 'body');
    const seen: string[] = [];
    const { getByLabelText } = render(PropertiesPanel, {
      props: { ...props, onNoteTitleChange: (t: string) => seen.push(t) },
    });

    const box = getByLabelText('Note Title') as HTMLInputElement;
    await fireEvent.input(box, { target: { value: 'Hull Studies' } });
    await fireEvent.blur(box);

    expect(seen).toEqual(['Hull Studies']);
  });

  it('panel_aNoteSelection_offersTheTitleBoxWithoutOpeningTheCardEditor', () => {
    seedNoteCard('New Note', 'body');
    const { getByTestId } = render(PropertiesPanel, { props });

    expect(getByTestId('panel-title-group')).not.toBeNull();
    expect(canvasStore.editingPlacementId).toBeNull();
  });

  it('panel_aNonNoteSelection_showsNoTitleGroup', () => {
    seedImageCard();
    const { queryByTestId } = render(PropertiesPanel, { props });

    expect(queryByTestId('panel-title-group')).toBeNull();
  });
});
