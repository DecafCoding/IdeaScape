/**
 * Guards the double-click that opens a note's editor.
 *
 * The handler must sit on the card shell, not on the note content inside it. `beginMove`
 * takes pointer capture in order to drag, and a captured pointer retargets the click and
 * dblclick that follow to the capture element — so a handler on a descendant is never
 * reached in a real window, while every other route (Enter, the element menu) still works.
 * jsdom does not model that retargeting, so the test dispatches at the shell directly:
 * that is the element the browser really delivers to.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

const invokeSafe = vi.fn();

vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (command: string, args?: Record<string, unknown>) => invokeSafe(command, args),
  toFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  IpcError: class IpcError extends Error {},
}));

const CardLayer = (await import('../CardLayer.svelte')).default;
const { canvasStore } = await import('../../../stores/canvasStore.svelte');

const CANVAS_ID = 1;

const props = {
  onGeometryCommitted: () => {},
  onOpenElementMenu: () => {},
  onCommitEdit: () => {},
  onSelect: () => {},
  onConnectFrom: () => {},
};

function card(id: number, kind: 'note' | 'image', payload: Record<string, unknown>) {
  return {
    placement: {
      id,
      canvas_id: CANVAS_ID,
      item_id: id,
      x: id * 400,
      y: 0,
      width: 236,
      height: 150,
      z_order: id,
    },
    item: {
      id,
      project_id: 1,
      kind,
      payload: JSON.stringify(payload),
      created_at: 'now',
      updated_at: 'now',
    },
  };
}

function shellFor(container: HTMLElement, placementId: number) {
  const shell = container.querySelector(`[data-placement-id="${placementId}"]`);
  if (!shell) throw new Error(`no card shell for placement ${placementId}`);
  return shell;
}

describe('opening a note editor by double-click', () => {
  beforeEach(async () => {
    invokeSafe.mockReset();
    canvasStore.closeProject();

    const cards = [
      card(1, 'note', { title: 'A Note', text: 'body text' }),
      card(2, 'image', { asset: 'here.png', natural_width: 640, natural_height: 400, alt: '' }),
    ];
    canvasStore.canvases = [
      {
        id: CANVAS_ID,
        project_id: 1,
        name: 'Canvas 1',
        sort_order: 0,
        view_x: 0,
        view_y: 0,
        view_zoom: 1,
        created_at: 'now',
        updated_at: 'now',
      },
    ];
    invokeSafe.mockImplementation((command: string) => {
      if (command === 'list_placements') return Promise.resolve(cards);
      if (command === 'list_connections') return Promise.resolve([]);
      if (command === 'asset_statuses') {
        return Promise.resolve([{ name: 'here.png', exists: true, byte_size: 100 }]);
      }
      return Promise.resolve([]);
    });

    await canvasStore.loadCanvas(CANVAS_ID);
    canvasStore.setViewportSize({ width: 2000, height: 1000 });
  });

  afterEach(cleanup);

  it('cardLayer_doubleClickOnANoteShell_opensTheEditorOnThatCard', async () => {
    const { container } = render(CardLayer, { props });
    expect(canvasStore.editingPlacementId).toBeNull();

    await fireEvent.dblClick(shellFor(container as HTMLElement, 1));

    expect(canvasStore.editingPlacementId).toBe(1);
  });

  it('cardLayer_doubleClickOnANoteShell_swapsTheRenderedNoteForATextBox', async () => {
    const { container, queryByTestId } = render(CardLayer, { props });
    expect(queryByTestId('note-card')).not.toBeNull();

    await fireEvent.dblClick(shellFor(container as HTMLElement, 1));

    expect(queryByTestId('note-card')).toBeNull();
    expect(container.querySelector('textarea')).not.toBeNull();
  });

  it('cardLayer_doubleClickOnANonNoteShell_opensNoEditor', async () => {
    const { container } = render(CardLayer, { props });

    await fireEvent.dblClick(shellFor(container as HTMLElement, 2));

    expect(canvasStore.editingPlacementId).toBeNull();
  });
});

describe('editing a note title on the card', () => {
  beforeEach(async () => {
    invokeSafe.mockReset();
    canvasStore.closeProject();
    const cards = [card(1, 'note', { title: 'Old Title', text: 'body text' })];
    canvasStore.canvases = [
      {
        id: CANVAS_ID,
        project_id: 1,
        name: 'Canvas 1',
        sort_order: 0,
        view_x: 0,
        view_y: 0,
        view_zoom: 1,
        created_at: 'now',
        updated_at: 'now',
      },
    ];
    invokeSafe.mockImplementation((command: string) => {
      if (command === 'list_placements') return Promise.resolve(cards);
      return Promise.resolve([]);
    });
    await canvasStore.loadCanvas(CANVAS_ID);
    canvasStore.setViewportSize({ width: 2000, height: 1000 });
  });

  afterEach(cleanup);

  it('noteEditor_theOpenEditor_offersATitleFieldHoldingTheCurrentTitle', async () => {
    const { container } = render(CardLayer, { props });
    await fireEvent.dblClick(shellFor(container as HTMLElement, 1));

    const title = container.querySelector('input.title-input') as HTMLInputElement;
    expect(title).not.toBeNull();
    expect(title.value).toBe('Old Title');
  });

  it('noteEditor_focusMovingFromBodyToTitle_keepsTheEditorOpen', async () => {
    const { container } = render(CardLayer, { props });
    await fireEvent.dblClick(shellFor(container as HTMLElement, 1));

    const title = container.querySelector('input.title-input') as HTMLInputElement;
    const body = container.querySelector('textarea.body-input') as HTMLTextAreaElement;

    // The real gesture: the body has focus, the user clicks the title box.
    await fireEvent.focusOut(body, { relatedTarget: title });

    expect(canvasStore.editingPlacementId).toBe(1);
    expect(container.querySelector('input.title-input')).not.toBeNull();
  });

  it('noteEditor_focusLeavingTheEditorEntirely_commitsTheEditedTitle', async () => {
    const committed: Array<[number, string, string]> = [];
    const { container } = render(CardLayer, {
      props: { ...props, onCommitEdit: (id, t, x) => committed.push([id, t, x]) },
    });
    await fireEvent.dblClick(shellFor(container as HTMLElement, 1));

    const title = container.querySelector('input.title-input') as HTMLInputElement;
    await fireEvent.input(title, { target: { value: 'New Title' } });
    await fireEvent.focusOut(title, { relatedTarget: document.body });

    expect(committed).toEqual([[1, 'New Title', 'body text']]);
    expect(canvasStore.editingPlacementId).toBeNull();
  });
});
