/**
 * The three routes to a connection, driven through the real composition root with real
 * pointer events — the only level at which the gesture is actually testable, because it is
 * spread across the rail, the card layer, the canvas surface and the window's pointerup.
 *
 * The click-then-click route is here because it was broken and looked like a dead tool: the
 * release on the source card dropped the pending link, so a click could never start one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { Canvas, Connection, PlacementWithItem } from '../../../lib/types';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const invokeSafe = vi.fn();

vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (command: string, args?: Record<string, unknown>) => invokeSafe(command, args),
  toFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  IpcError: class IpcError extends Error {},
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
  }),
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
}));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(), revealItemInDir: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

const App = (await import('../../../app.svelte')).default;
const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { undoStack } = await import('../../undo/undoStack.svelte');
const { projectsState } = await import('../../projects/projects.svelte');

const PROJECT = 'C:\\Projects\\Alpha';
const VIEWPORT = { width: 1000, height: 700 };
/** Card A occupies world 0..240, card B 400..640, both 140 tall. */
const OVER_A = { clientX: 50, clientY: 50 };
const OVER_B = { clientX: 450, clientY: 50 };

const CANVAS: Canvas = {
  id: 1,
  project_id: 1,
  name: 'Canvas 1',
  sort_order: 0,
  view_x: 0,
  view_y: 0,
  view_zoom: 1,
  created_at: '',
  updated_at: '',
};

let nextId = 100;
let cards: PlacementWithItem[] = [];
let connections: Connection[] = [];

function makeNote(x: number, title: string): PlacementWithItem {
  const id = nextId++;
  const card: PlacementWithItem = {
    placement: { id, canvas_id: 1, item_id: id, x, y: 0, width: 240, height: 140, z_order: 0 },
    item: {
      id,
      project_id: 1,
      kind: 'note',
      payload: JSON.stringify({ title, text: '' }),
      created_at: '',
      updated_at: '',
    },
  };
  cards.push(card);
  return card;
}

beforeEach(() => {
  nextId = 100;
  cards = [];
  connections = [];
  invokeSafe.mockReset();
  invokeSafe.mockImplementation((command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case 'read_settings':
        return Promise.resolve({
          autoSaveMs: 5000,
          snapToGrid: false,
          zoomModifier: 'ctrl',
          theme: 'light',
        });
      case 'list_recent_projects':
        return Promise.resolve([{ path: PROJECT, name: 'Alpha', opened_at: '' }]);
      case 'open_project':
        return Promise.resolve({ id: 1, name: 'Alpha', created_at: '', updated_at: '' });
      case 'list_canvases':
        return Promise.resolve([CANVAS]);
      case 'list_placements':
        return Promise.resolve(cards);
      case 'list_connections':
        return Promise.resolve(connections);
      case 'assets_folder':
        return Promise.resolve(`${PROJECT}\\assets`);
      case 'asset_statuses':
        return Promise.resolve([]);
      case 'create_connection': {
        const row: Connection = {
          id: nextId++,
          canvas_id: 1,
          from_placement_id: args!.fromPlacementId as number,
          to_placement_id: args!.toPlacementId as number,
          label: null,
          directed: 1,
          color: 'default',
          width: 1,
          label_visible: true,
          route: 'straight',
        };
        connections.push(row);
        return Promise.resolve(row);
      }
      case 'perf_gate_requested':
        return Promise.reject(new Error('not a debug build'));
      default:
        return Promise.resolve(null);
    }
  });
  canvasStore.closeProject();
  undoStack.clear();
  projectsState.recents = [];
  projectsState.selectedIndex = -1;
  projectsState.failure = null;
});

afterEach(cleanup);

/**
 * jsdom has no PointerEvent, and testing-library's pointer helpers drop the coordinates, so
 * these dispatch a MouseEvent under the pointer event's name. The handlers only read
 * `clientX`, `clientY` and `button`, which a MouseEvent carries.
 */
function pointer(target: EventTarget, type: string, init: MouseEventInit = {}) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...init }));
  return Promise.resolve();
}

/** Open the one recent project and put two cards on its canvas. */
async function openWithTwoCards() {
  makeNote(0, 'A');
  makeNote(400, 'B');

  const view = render(App);
  const recent = await waitFor(() => {
    const found = view.getByTestId('recent-grid').querySelector('button.card');
    if (!found) throw new Error('the recent grid has not rendered yet');
    return found;
  });
  await fireEvent.click(recent);
  await waitFor(() => expect(canvasStore.project).not.toBeNull());
  canvasStore.setViewportSize(VIEWPORT);
  await waitFor(() => expect(canvasStore.cardCount).toBe(2));

  const surface = view.getByTestId('canvas-surface');
  // jsdom gives every element a zero rect; the surface's origin is what screen coordinates
  // are measured from.
  surface.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: VIEWPORT.width, height: VIEWPORT.height }) as DOMRect;
  // Pointer capture is not implemented in jsdom, and the surface takes it on every press.
  surface.setPointerCapture = () => {};

  const shells = view.getAllByTestId('card');
  const shellFor = (id: number) => {
    const el = shells.find((e) => e.getAttribute('data-placement-id') === String(id))!;
    // Pointer capture is not implemented in jsdom.
    el.setPointerCapture = () => {};
    return el;
  };
  return { view, surface, a: shellFor(100), b: shellFor(101) };
}

describe('making a connection', () => {
  it('connectTool_pressedOnOneCardAndReleasedOnAnother_writesTheLine', async () => {
    const { view, surface, a } = await openWithTwoCards();
    await fireEvent.click(view.getByText('Connect'));
    expect(canvasStore.activeTool).toBe('connect');

    await pointer(surface, 'pointermove', OVER_A);
    await pointer(a, 'pointerdown', OVER_A);
    await pointer(surface, 'pointermove', OVER_B);
    await pointer(window, 'pointerup');

    await waitFor(() => expect(connections).toHaveLength(1));
    expect(connections[0].from_placement_id).toBe(100);
    expect(connections[0].to_placement_id).toBe(101);
  });

  it('connectTool_clickedOnOneCardThenTheOther_writesTheLine', async () => {
    const { view, surface, a, b } = await openWithTwoCards();
    await fireEvent.click(view.getByText('Connect'));

    // A click on the first card: press and release with no travel. It arms the link rather
    // than throwing it away, and the dashed line stays on screen.
    await pointer(surface, 'pointermove', OVER_A);
    await pointer(a, 'pointerdown', OVER_A);
    await pointer(window, 'pointerup');
    expect(canvasStore.pendingLink?.fromPlacementId).toBe(100);
    expect(view.queryByTestId('pending-link')).not.toBeNull();

    // A click on the second card finishes it.
    await pointer(surface, 'pointermove', OVER_B);
    await pointer(b, 'pointerdown', OVER_B);
    await pointer(window, 'pointerup');

    await waitFor(() => expect(connections).toHaveLength(1));
    expect(connections[0].from_placement_id).toBe(100);
    expect(connections[0].to_placement_id).toBe(101);
  });

  it('connectFromHere_chosenFromTheCardMenu_thenClickingTheOtherCard_writesTheLine', async () => {
    const { view, surface, a, b } = await openWithTwoCards();

    await fireEvent.contextMenu(a, OVER_A);
    await waitFor(() => expect(view.queryByTestId('context-menu')).not.toBeNull());
    await fireEvent.click(view.getByText('Connect From Here'));
    expect(canvasStore.pendingLink?.fromPlacementId).toBe(100);

    await pointer(surface, 'pointermove', OVER_B);
    await pointer(b, 'pointerdown', OVER_B);
    await pointer(window, 'pointerup');

    await waitFor(() => expect(connections).toHaveLength(1));
    expect(connections[0].to_placement_id).toBe(101);
  });

  it('anExistingLine_pressedOnAfterBeingDeselected_isSelectedAgain', async () => {
    const { view, surface, a, b } = await openWithTwoCards();
    await fireEvent.click(view.getByText('Connect'));

    await pointer(surface, 'pointermove', OVER_A);
    await pointer(a, 'pointerdown', OVER_A);
    await pointer(surface, 'pointermove', OVER_B);
    await pointer(b, 'pointerdown', OVER_B);
    await pointer(window, 'pointerup');
    await waitFor(() => expect(connections).toHaveLength(1));
    const lineId = connections[0].id;
    expect(canvasStore.selectedConnectionId).toBe(lineId);

    // Back to the Select tool, then deselect by clicking the empty background.
    await fireEvent.click(view.getByText('Select'));
    await pointer(surface, 'pointermove', { clientX: 800, clientY: 400 });
    await pointer(surface, 'pointerdown', { clientX: 800, clientY: 400 });
    // The surface takes the pointer capture on its own press, so the release lands there.
    await pointer(surface, 'pointerup');
    expect(canvasStore.selectedConnectionId).toBeNull();

    // Press the line's hit path. The press must not reach the surface, whose release would
    // otherwise run the background handler and clear the selection again.
    const hit = view.container.querySelector('path.hit')!;
    expect(hit).not.toBeNull();
    await pointer(hit, 'pointerdown', { clientX: 300, clientY: 90 });
    await pointer(surface, 'pointerup');
    await pointer(window, 'pointerup');

    expect(canvasStore.selectedConnectionId).toBe(lineId);
  });

  it('connectTool_armedThenClickedOnTheBackground_cancelsInsteadOfSticking', async () => {
    const { view, surface, a } = await openWithTwoCards();
    await fireEvent.click(view.getByText('Connect'));

    await pointer(surface, 'pointermove', OVER_A);
    await pointer(a, 'pointerdown', OVER_A);
    await pointer(window, 'pointerup');
    expect(canvasStore.pendingLink).not.toBeNull();

    // Empty space at x = 800: past both cards.
    await pointer(surface, 'pointermove', { clientX: 800, clientY: 400 });
    await pointer(surface, 'pointerdown', { clientX: 800, clientY: 400 });
    await pointer(window, 'pointerup');

    expect(canvasStore.pendingLink).toBeNull();
    expect(connections).toHaveLength(0);
  });
});
