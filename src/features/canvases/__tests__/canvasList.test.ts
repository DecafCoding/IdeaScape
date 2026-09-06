/**
 * The canvas rows, the live `+`, inline rename, and the delete confirm.
 *
 * The two undrawn states designed in this phase — inline rename and the confirm — are asserted
 * on behaviour, not on pixels: the row becomes a text box holding the name, Enter commits, Esc
 * keeps the old name, and the confirm names the canvas and its card count.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import type { Canvas } from '../../../lib/types';

vi.mock('../../../lib/ipc', () => ({ invokeSafe: vi.fn(), IpcError: class extends Error {} }));

const CanvasList = (await import('../CanvasList.svelte')).default;
const DeleteCanvasDialog = (await import('../DeleteCanvasDialog.svelte')).default;
const { canvasStore } = await import('../../../stores/canvasStore.svelte');

function canvas(id: number, name: string): Canvas {
  return {
    id,
    project_id: 1,
    name,
    sort_order: id,
    view_x: 0,
    view_y: 0,
    view_zoom: 1,
    created_at: '',
    updated_at: '2026-09-06T12:00:00Z',
  };
}

beforeEach(() => {
  canvasStore.closeProject();
  canvasStore.project = { id: 1, name: 'P', created_at: '', updated_at: '' };
  canvasStore.canvases = [canvas(1, 'Canvas 1'), canvas(2, 'Hull studies')];
});

describe('the canvas list', () => {
  afterEach(cleanup);

  it('canvasList_plusClicked_createsACanvas', async () => {
    let created = 0;
    const { getByLabelText } = render(CanvasList, {
      props: { onCreateCanvas: () => (created += 1) },
    });

    // The `+` was drawn at the unavailable opacity until this phase; it is a real button now.
    const plus = getByLabelText('New Canvas') as HTMLButtonElement;
    expect(plus.disabled).toBe(false);
    await fireEvent.click(plus);
    expect(created).toBe(1);
  });

  it('canvasList_rowClicked_switchesToThatCanvas', async () => {
    const switched: number[] = [];
    const { getByText } = render(CanvasList, {
      props: { onSelectCanvas: (id: number) => switched.push(id) },
    });
    await fireEvent.click(getByText('Hull studies'));
    expect(switched).toEqual([2]);
  });

  it('canvasList_doubleClickedRow_becomesATextBoxHoldingTheName', async () => {
    const begun: number[] = [];
    const view = render(CanvasList, {
      props: { onBeginRename: (id: number) => begun.push(id) },
    });

    await fireEvent.dblClick(view.getByText('Hull studies'));
    expect(begun).toEqual([2]);

    // The root owns which row is renaming, so re-render with it set.
    view.unmount();
    const editing = render(CanvasList, { props: { renamingId: 2 } });
    const input = editing.getByLabelText('Canvas Name') as HTMLInputElement;
    expect(input.value).toBe('Hull studies');
    expect(document.activeElement).toBe(input);
  });

  it('canvasList_renameCommitted_writesTheNewName', async () => {
    const committed: [number, string][] = [];
    const { getByLabelText } = render(CanvasList, {
      props: {
        renamingId: 2,
        onCommitRename: (id: number, name: string) => committed.push([id, name]),
      },
    });

    const input = getByLabelText('Canvas Name');
    await fireEvent.input(input, { target: { value: 'Frames' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(committed).toEqual([[2, 'Frames']]);
    // Blur after Enter must not commit a second time.
    await fireEvent.blur(input);
    expect(committed).toHaveLength(1);
  });

  it('canvasList_renameEscaped_keepsTheOldName', async () => {
    const committed: [number, string][] = [];
    let cancelled = 0;
    const { getByLabelText } = render(CanvasList, {
      props: {
        renamingId: 2,
        onCommitRename: (id: number, name: string) => committed.push([id, name]),
        onCancelRename: () => (cancelled += 1),
      },
    });

    const input = getByLabelText('Canvas Name');
    await fireEvent.input(input, { target: { value: 'Half typed' } });
    await fireEvent.keyDown(input, { key: 'Escape' });

    expect(cancelled).toBe(1);
    expect(committed).toEqual([]);
    // And the blur that follows the cancel writes nothing either.
    await fireEvent.blur(input);
    expect(committed).toEqual([]);
    expect(canvasStore.canvases[1].name).toBe('Hull studies');
  });

  it('canvasList_renameBlurred_commitsOnce', async () => {
    const committed: [number, string][] = [];
    const { getByLabelText } = render(CanvasList, {
      props: {
        renamingId: 2,
        onCommitRename: (id: number, name: string) => committed.push([id, name]),
      },
    });
    const input = getByLabelText('Canvas Name');
    await fireEvent.input(input, { target: { value: 'Frames' } });
    await fireEvent.blur(input);
    expect(committed).toEqual([[2, 'Frames']]);
  });

  it('canvasList_rightClickedRow_raisesTheMenuWithThatCanvasId', async () => {
    const raised: number[] = [];
    const { getByText } = render(CanvasList, {
      props: { onOpenMenu: (_event: MouseEvent, id: number) => raised.push(id) },
    });
    await fireEvent.contextMenu(getByText('Hull studies'));
    expect(raised).toEqual([2]);
  });
});

describe('the delete canvas confirm', () => {
  afterEach(cleanup);

  it('deleteCanvasDialog_namesTheCanvasAndItsCardCount', () => {
    const { getByTestId, getByText } = render(DeleteCanvasDialog, {
      props: { name: 'Hull studies', cardCount: 7 },
    });

    const body = getByTestId('delete-canvas-dialog').textContent ?? '';
    expect(body).toContain('Hull studies');
    expect(body).toContain('7 cards');
    // A confirm is a warning, not the remedy: the printed key comes from SHORTCUT_LABELS.
    expect(body).toContain('Ctrl+Z');
    // The destructive button takes focus on mount.
    expect(document.activeElement).toBe(getByText('Delete Canvas'));
  });

  it('deleteCanvasDialog_oneCard_readsSingular', () => {
    const { getByTestId } = render(DeleteCanvasDialog, {
      props: { name: 'Spare', cardCount: 1 },
    });
    expect(getByTestId('delete-canvas-dialog').textContent).toContain('1 card ');
  });

  it('deleteCanvasDialog_escape_cancelsWithoutDeleting', async () => {
    let confirmed = 0;
    let cancelled = 0;
    const { getByTestId } = render(DeleteCanvasDialog, {
      props: {
        name: 'Hull studies',
        cardCount: 2,
        onConfirm: () => (confirmed += 1),
        onCancel: () => (cancelled += 1),
      },
    });

    await fireEvent.keyDown(getByTestId('delete-canvas-dialog'), { key: 'Escape' });
    expect(cancelled).toBe(1);
    expect(confirmed).toBe(0);
  });
});
