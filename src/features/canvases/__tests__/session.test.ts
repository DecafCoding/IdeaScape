/**
 * Milestones 3 and 4's checkpoints, as one scripted session against the real composition root
 * and a miniature in-memory backend.
 *
 * Milestone 3 — the canvas lifecycle: create two canvases, rename one in place, put cards on
 * each, pan each to a different position, switch between them twice and assert each comes back
 * at its own view and with its own cards, then delete one, assert the shell switched away and
 * the undo depth rose, undo it, and assert the canvas, its cards and its lines are all back and
 * it is active again.
 *
 * Milestone 4 — the ranking rule end to end against a deliberately ambiguous project: a canvas
 * named "Chapter 3" and a note titled "Chapter 3" on another canvas, asserting the canvas row
 * is rendered first, the matched words are bolded as text nodes with no markup from the data,
 * and Enter on the card result switches canvas, selects that placement and centres the view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type {
  Canvas,
  CanvasDeleteEffect,
  Connection,
  Placement,
  PlacementWithItem,
  SearchResults,
} from '../../../lib/types';

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
const { searchState } = await import('../../search/search.svelte');

const PROJECT = 'C:\\Projects\\Alpha';
const VIEWPORT = { width: 1000, height: 700 };

/** A miniature in-memory backend: canvases, placements, items and connections. */
interface Db {
  nextId: number;
  canvases: Canvas[];
  placements: Map<number, PlacementWithItem>;
  connections: Map<number, Connection>;
  views: Map<number, { x: number; y: number; zoom: number }>;
}
let db: Db;
let order: string[] = [];

function freshDb(): Db {
  return {
    nextId: 100,
    canvases: [],
    placements: new Map(),
    connections: new Map(),
    views: new Map(),
  };
}

function makeCanvas(name: string, sortOrder: number): Canvas {
  const id = db.nextId++;
  const canvas: Canvas = {
    id,
    project_id: 1,
    name,
    sort_order: sortOrder,
    view_x: 0,
    view_y: 0,
    view_zoom: 1,
    created_at: '',
    updated_at: '2026-09-06T12:00:00Z',
  };
  db.canvases.push(canvas);
  db.views.set(id, { x: 0, y: 0, zoom: 1 });
  return canvas;
}

function makeNote(canvasId: number, title: string, text = ''): PlacementWithItem {
  const id = db.nextId++;
  const card: PlacementWithItem = {
    placement: {
      id,
      canvas_id: canvasId,
      item_id: id,
      x: 40,
      y: 40,
      width: 240,
      height: 140,
      z_order: 0,
    },
    item: {
      id,
      project_id: 1,
      kind: 'note',
      payload: JSON.stringify({ title, text }),
      created_at: '',
      updated_at: '',
    },
  };
  db.placements.set(id, card);
  return card;
}

function currentView(canvasId: number) {
  return db.views.get(canvasId) ?? { x: 0, y: 0, zoom: 1 };
}

function backend() {
  invokeSafe.mockImplementation((command: string, args?: Record<string, unknown>) => {
    order.push(command);
    switch (command) {
      case 'list_recent_projects':
        return Promise.resolve([
          {
            path: PROJECT,
            name: 'Alpha',
            canvas_count: db.canvases.length,
            card_count: db.placements.size,
            opened_at: new Date().toISOString(),
          },
        ]);
      case 'open_project':
        return Promise.resolve({ id: 1, name: 'Alpha', created_at: '', updated_at: '' });
      case 'assets_folder':
        return Promise.resolve(`${PROJECT}\\assets`);
      case 'list_canvases':
        return Promise.resolve(
          db.canvases.map((c) => ({ ...c, ...toViewFields(currentView(c.id)) })),
        );
      case 'create_canvas':
        return Promise.resolve(makeCanvas(String(args?.name), db.canvases.length));
      case 'rename_canvas': {
        const canvas = db.canvases.find((c) => c.id === args?.canvasId)!;
        canvas.name = String(args?.name);
        return Promise.resolve({ ...canvas });
      }
      case 'update_canvas_view':
        db.views.set(Number(args?.canvasId), {
          x: Number(args?.viewX),
          y: Number(args?.viewY),
          zoom: Number(args?.viewZoom),
        });
        return Promise.resolve(null);
      case 'delete_canvas': {
        const canvasId = Number(args?.canvasId);
        const canvas = db.canvases.find((c) => c.id === canvasId)!;
        const placements: Placement[] = [];
        const items = [];
        for (const [id, card] of [...db.placements]) {
          if (card.placement.canvas_id !== canvasId) continue;
          placements.push(card.placement);
          items.push(card.item);
          db.placements.delete(id);
        }
        const connections: Connection[] = [];
        for (const [id, line] of [...db.connections]) {
          if (line.canvas_id !== canvasId) continue;
          connections.push(line);
          db.connections.delete(id);
        }
        db.canvases = db.canvases.filter((c) => c.id !== canvasId);
        const effect: CanvasDeleteEffect = { canvas, placements, items, connections, assets: [] };
        return Promise.resolve(effect);
      }
      case 'restore_canvas': {
        // Rust puts every row back under the id it had, so the rest of the undo stack keeps
        // naming rows that exist. Ids are AUTOINCREMENT and never re-issued.
        const effect = args?.effect as CanvasDeleteEffect;
        const canvas = { ...effect.canvas };
        if (!db.canvases.some((c) => c.id === canvas.id)) {
          db.canvases.push(canvas);
          db.views.set(canvas.id, { x: canvas.view_x, y: canvas.view_y, zoom: canvas.view_zoom });
        }
        for (const placement of effect.placements) {
          const item = effect.items.find((i) => i.id === placement.item_id)!;
          db.placements.set(placement.id, { placement, item });
        }
        for (const line of effect.connections) db.connections.set(line.id, line);
        return Promise.resolve(canvas);
      }
      case 'list_placements':
        return Promise.resolve(
          [...db.placements.values()].filter((c) => c.placement.canvas_id === args?.canvasId),
        );
      case 'list_connections':
        return Promise.resolve(
          [...db.connections.values()].filter((c) => c.canvas_id === args?.canvasId),
        );
      case 'search_project': {
        const query = String(args?.query).toLowerCase();
        const results: SearchResults = {
          canvases: db.canvases
            .filter((c) => c.name.toLowerCase().includes(query))
            .map((c) => ({
              canvas_id: c.id,
              name: c.name,
              card_count: [...db.placements.values()].filter((p) => p.placement.canvas_id === c.id)
                .length,
              updated_at: c.updated_at,
            })),
          cards: [...db.placements.values()]
            .filter((card) => JSON.parse(card.item.payload).title?.toLowerCase().includes(query))
            .map((card) => ({
              placement_id: card.placement.id,
              canvas_id: card.placement.canvas_id,
              canvas_name: db.canvases.find((c) => c.id === card.placement.canvas_id)?.name ?? '',
              item_id: card.item.id,
              kind: 'note' as const,
              title: JSON.parse(card.item.payload).title,
              snippet: JSON.parse(card.item.payload).text,
              matched_title: true,
            })),
        };
        return Promise.resolve(results);
      }
      case 'asset_statuses':
        return Promise.resolve([]);
      case 'perf_gate_requested':
        return Promise.reject(new Error('not a debug build'));
      default:
        return Promise.resolve(null);
    }
  });
}

function toViewFields(view: { x: number; y: number; zoom: number }) {
  return { view_x: view.x, view_y: view.y, view_zoom: view.zoom };
}

/** Mount the root and open the one recent project, as the user would. */
async function mountAndOpen() {
  const view = render(App);
  const card = await waitFor(() => {
    const found = view.getByTestId('recent-grid').querySelector('button.card');
    if (!found) throw new Error('the recent grid has not rendered yet');
    return found;
  });
  await fireEvent.click(card);
  await waitFor(() => expect(canvasStore.project).not.toBeNull());
  canvasStore.setViewportSize(VIEWPORT);
  return view;
}

beforeEach(() => {
  invokeSafe.mockReset();
  order = [];
  db = freshDb();
  makeCanvas('Canvas 1', 0);
  canvasStore.closeProject();
  undoStack.clear();
  searchState.clear();
  projectsState.recents = [];
  projectsState.selectedIndex = -1;
  projectsState.failure = null;
  backend();
});

afterEach(cleanup);

describe('the canvas lifecycle', () => {
  it('milestone3_create_rename_pan_switch_delete_undo_composes', async () => {
    const view = await mountAndOpen();
    const first = db.canvases[0].id;
    expect(canvasStore.activeCanvasId).toBe(first);

    // --- create a second canvas, and switch to it --------------------------------
    await fireEvent.click(view.getByLabelText('New Canvas'));
    await waitFor(() => expect(canvasStore.canvases).toHaveLength(2));
    const second = canvasStore.canvases[1].id;
    await waitFor(() => expect(canvasStore.activeCanvasId).toBe(second));
    await waitFor(() => expect(undoStack.undoDepth).toBe(1));

    // --- rename it in place -------------------------------------------------------
    await fireEvent.dblClick(view.getByText('Canvas 2'));
    const input = await waitFor(() => view.getByLabelText('Canvas Name') as HTMLInputElement);
    expect(input.value).toBe('Canvas 2');
    await fireEvent.input(input, { target: { value: 'Hull studies' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(view.queryByText('Hull studies')).not.toBeNull());
    expect(db.canvases[1].name).toBe('Hull studies');
    await waitFor(() => expect(undoStack.undoDepth).toBe(2));

    // --- a card on each, and a line on the second ---------------------------------
    makeNote(first, 'On the first');
    const noteA = makeNote(second, 'On the second');
    const noteB = makeNote(second, 'Also on the second');
    const lineId = db.nextId++;
    db.connections.set(lineId, {
      id: lineId,
      canvas_id: second,
      from_placement_id: noteA.placement.id,
      to_placement_id: noteB.placement.id,
      label: 'joins',
      directed: 1,
      color: 'default',
      width: 1,
      label_visible: true,
      route: 'straight',
    });
    await canvasStore.loadCanvas(second);
    expect(canvasStore.cardCount).toBe(2);

    // --- pan each canvas to its own position --------------------------------------
    canvasStore.setView({ x: -300, y: -120, zoom: 1 });
    canvasStore.recordCanvasView(second, { x: -300, y: -120, zoom: 1 });
    db.views.set(second, { x: -300, y: -120, zoom: 1 });
    db.views.set(first, { x: 55, y: 44, zoom: 0.5 });
    canvasStore.recordCanvasView(first, { x: 55, y: 44, zoom: 0.5 });

    // --- switch between them twice ------------------------------------------------
    await fireEvent.click(view.getByText('Canvas 1'));
    await waitFor(() => expect(canvasStore.activeCanvasId).toBe(first));
    // Each canvas comes back at its own view, with its own cards.
    expect(canvasStore.view).toEqual({ x: 55, y: 44, zoom: 0.5 });
    expect(canvasStore.cardCount).toBe(1);
    // And the switch cleared the stack: its ids belong to the canvas that left.
    expect(undoStack.undoDepth).toBe(0);

    await fireEvent.click(view.getByText('Hull studies'));
    await waitFor(() => expect(canvasStore.activeCanvasId).toBe(second));
    expect(canvasStore.view).toEqual({ x: -300, y: -120, zoom: 1 });
    expect(canvasStore.cardCount).toBe(2);
    expect(canvasStore.connections.size).toBe(1);

    // --- delete it, through the confirm -------------------------------------------
    await fireEvent.contextMenu(view.getByText('Hull studies'));
    await waitFor(() => expect(view.queryByTestId('context-menu')).not.toBeNull());
    await fireEvent.click(view.getByText('Delete Canvas'));

    const dialog = await waitFor(() => view.getByTestId('delete-canvas-dialog'));
    expect(dialog.textContent).toContain('Hull studies');
    expect(dialog.textContent).toContain('2 cards');
    await fireEvent.click(view.getByRole('button', { name: 'Delete Canvas' }));

    await waitFor(() => expect(canvasStore.canvases).toHaveLength(1));
    // The shell switched to a remaining canvas rather than showing rows that are gone.
    expect(canvasStore.activeCanvasId).toBe(first);
    expect(undoStack.undoDepth).toBe(1);
    expect(undoStack.nextUndoLabel).toBe('Delete Canvas');

    // --- undo it: the canvas, its cards and its lines all come back ----------------
    await undoStack.undo();
    await waitFor(() => expect(canvasStore.canvases).toHaveLength(2));

    const restored = canvasStore.canvases.find((c) => c.name === 'Hull studies')!;
    expect(restored).toBeDefined();
    // The canvas came back under the id it had, not a new one.
    expect(restored.id).toBe(second);
    await waitFor(() => expect(canvasStore.activeCanvasId).toBe(restored.id));
    expect(canvasStore.cardCount).toBe(2);
    expect(canvasStore.connections.size).toBe(1);
    // The line joins the restored cards, and both endpoints kept their ids.
    const line = [...canvasStore.connections.values()][0];
    const ids = [...canvasStore.placements.keys()];
    expect(ids).toContain(line.from_placement_id);
    expect(ids).toContain(line.to_placement_id);
    expect(line.from_placement_id).toBe(noteA.placement.id);
    expect(line.to_placement_id).toBe(noteB.placement.id);

    // Redo the delete and undo it once more: the ids did not drift, so the second round
    // still names live rows. This is what used to break after one redo.
    await undoStack.redo();
    await waitFor(() => expect(canvasStore.canvases).toHaveLength(1));
    await undoStack.undo();
    await waitFor(() => expect(canvasStore.canvases).toHaveLength(2));
    expect(canvasStore.canvases.find((c) => c.name === 'Hull studies')!.id).toBe(second);
    expect(canvasStore.cardCount).toBe(2);
    expect(canvasStore.connections.size).toBe(1);
  });
});

describe('search, end to end', () => {
  it('milestone4_ambiguousTerm_ranksTheCanvasFirst_andEnterOpensTheCard', async () => {
    const view = await mountAndOpen();
    const first = db.canvases[0].id;

    // A canvas named "Chapter 3", and a note titled "Chapter 3" on ANOTHER canvas.
    db.canvases[0].name = 'Chapter 3';
    const other = makeCanvas('Hull studies', 1);
    const note = makeNote(other.id, 'Chapter 3', 'the frames in chapter 3 are forward');
    await canvasStore.loadCanvas(first);
    canvasStore.canvases = [...db.canvases];

    // --- type into the search box -------------------------------------------------
    const box = view.getByLabelText('Search');
    await fireEvent.input(box, { target: { value: 'Chapter 3' } });
    await searchState.runNow();

    const popover = await waitFor(() => view.getByTestId('search-results'));

    // The canvas hit is rendered first, and the card hit second. That ranking is the point.
    const rows = view.getAllByRole('option');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('cards');
    expect(rows[1].textContent).toContain('Note · Hull studies');
    const text = popover.textContent ?? '';
    expect(text.indexOf('Canvases')).toBeLessThan(text.indexOf('Cards'));

    // The matched words are bold text nodes; nothing from the data reached the page as markup.
    expect([...popover.querySelectorAll('b')].map((b) => b.textContent)).toContain('Chapter 3');
    expect(popover.querySelector('script')).toBeNull();

    // Searching selects nothing, so the properties panel stays collapsed.
    expect(canvasStore.selection.size).toBe(0);

    // --- Enter on the card result -------------------------------------------------
    searchState.move(1);
    searchState.move(1);
    expect(searchState.current()?.kind).toBe('card');
    await fireEvent.keyDown(box, { key: 'Enter' });

    // It switched canvas, selected that placement, and centred the view on it.
    await waitFor(() => expect(canvasStore.activeCanvasId).toBe(other.id));
    await waitFor(() => expect(canvasStore.selection.has(note.placement.id)).toBe(true));
    expect(canvasStore.view.x).toBeCloseTo(
      VIEWPORT.width / 2 - (note.placement.x + note.placement.width / 2) * canvasStore.view.zoom,
    );
    expect(canvasStore.view.y).toBeCloseTo(
      VIEWPORT.height / 2 - (note.placement.y + note.placement.height / 2) * canvasStore.view.zoom,
    );
    // The popover closed, and the query was kept.
    expect(searchState.open).toBe(false);
    expect(searchState.query).toBe('Chapter 3');
  });

  it('search_escape_closesThePopoverWithoutClearingTheSelection', async () => {
    const view = await mountAndOpen();
    const note = makeNote(db.canvases[0].id, 'Frames');
    await canvasStore.loadCanvas(db.canvases[0].id);
    canvasStore.setSelection([note.placement.id]);

    const box = view.getByLabelText('Search');
    await fireEvent.input(box, { target: { value: 'Frames' } });
    await searchState.runNow();
    await waitFor(() => expect(view.queryByTestId('search-results')).not.toBeNull());

    await fireEvent.keyDown(box, { key: 'Escape' });

    await waitFor(() => expect(view.queryByTestId('search-results')).toBeNull());
    // The box handles Esc itself and stops it propagating, so the global chain never runs.
    expect(canvasStore.selection.has(note.placement.id)).toBe(true);
  });
});
