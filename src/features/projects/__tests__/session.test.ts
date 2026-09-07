/**
 * Milestone 2's checkpoint. It mounts the real composition root and drives the whole session
 * shape the picker exists for:
 *
 * - with no project the picker is shown and the shell is not,
 * - a project created through the dialog replaces the picker with the shell, its first canvas
 *   active and the assets folder set,
 * - Close Project brings the picker back with the store empty and the undo depth at zero,
 * - and a *second* project opened in the same session re-reads the assets folder and comes
 *   back with the recents list reordered.
 *
 * No individual task crosses the boot decision, the create flow, the teardown and the
 * recents ordering together.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { RecentProject } from '../../../lib/types';

/** jsdom has no ResizeObserver, and the canvas surface measures its viewport with one. */
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
const { getAssetsFolder } = await import('../../../lib/assets.svelte');
const { projectsState } = await import('../projects.svelte');

const ALPHA = 'C:\\Projects\\Alpha';
const BETA = 'C:\\Projects\\Beta';

/** Which project the fake backend currently has open, and what each one holds. */
let openPath: string | null = null;
let recents: RecentProject[] = [];
/** Every command the root called, in order. */
let order: string[] = [];

const CANVASES: Record<string, { id: number; name: string }[]> = {
  [ALPHA]: [{ id: 11, name: 'Canvas 1' }],
  [BETA]: [{ id: 21, name: 'Canvas 1' }],
};

function entry(path: string, name: string): RecentProject {
  return {
    path,
    name,
    canvas_count: 1,
    card_count: 0,
    opened_at: new Date().toISOString(),
  };
}

function backend() {
  invokeSafe.mockImplementation((command: string, args?: Record<string, unknown>) => {
    order.push(command);
    switch (command) {
      case 'list_recent_projects':
        return Promise.resolve([...recents]);
      case 'default_project_parent':
        return Promise.resolve('C:\\Projects');
      case 'create_project': {
        const path = `${args?.parentPath}\\${args?.name}`;
        CANVASES[path] ??= [{ id: 31, name: 'Canvas 1' }];
        // Rust returns the folder it created; the front end builds no path.
        return Promise.resolve(path);
      }
      case 'open_project': {
        openPath = String(args?.path);
        const name = openPath.split('\\').pop() ?? 'Project';
        // The recents file moves the just-opened project to the front, newest first.
        recents = [entry(openPath, name), ...recents.filter((r) => r.path !== openPath)];
        return Promise.resolve({ id: 1, name, created_at: '', updated_at: '' });
      }
      case 'close_project':
        openPath = null;
        return Promise.resolve(null);
      case 'list_canvases':
        return Promise.resolve(
          (CANVASES[openPath ?? ''] ?? []).map((c) => ({
            id: c.id,
            project_id: 1,
            name: c.name,
            sort_order: 0,
            view_x: 0,
            view_y: 0,
            view_zoom: 1,
            created_at: '',
            updated_at: '',
          })),
        );
      case 'list_placements':
      case 'list_connections':
      case 'asset_statuses':
        return Promise.resolve([]);
      case 'assets_folder':
        // Per project: the second project of a session must get its own folder.
        return Promise.resolve(`${openPath}\\assets`);
      case 'perf_gate_requested':
        return Promise.reject(new Error('not a debug build'));
      default:
        return Promise.resolve(null);
    }
  });
}

describe('the project session', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    openPath = null;
    order = [];
    recents = [];
    canvasStore.closeProject();
    undoStack.clear();
    projectsState.recents = [];
    projectsState.selectedIndex = -1;
    projectsState.failure = null;
    projectsState.defaultParent = null;
    backend();
  });

  afterEach(cleanup);

  it('milestone2_boot_create_close_thenASecondProject_movesEverySessionPiece', async () => {
    const view = render(App);

    // --- with no project the picker is the screen -------------------------------
    await waitFor(() => expect(view.queryByTestId('project-picker')).not.toBeNull());
    expect(view.queryByTestId('left-column')).toBeNull();
    expect(view.queryByTestId('canvas-surface') ?? document.querySelector('.body')).toBeNull();
    expect(canvasStore.project).toBeNull();

    // --- create a project through the dialog ------------------------------------
    await fireEvent.click(view.getByText('New project…'));
    await waitFor(() => expect(view.queryByTestId('new-project-dialog')).not.toBeNull());
    expect(view.getByTestId('new-project-parent').textContent).toBe('C:\\Projects');

    await fireEvent.input(view.getByLabelText('Name'), { target: { value: 'Alpha' } });
    await fireEvent.click(view.getByText('Create Project'));

    await waitFor(() => expect(canvasStore.project?.name).toBe('Alpha'));
    expect(order).toContain('create_project');
    // The shell replaced the picker, with the new project's first canvas active.
    await waitFor(() => expect(view.queryByTestId('left-column')).not.toBeNull());
    expect(view.queryByTestId('project-picker')).toBeNull();
    await waitFor(() => expect(view.queryByTestId('new-project-dialog')).toBeNull());
    expect(canvasStore.activeCanvasId).toBe(CANVASES[ALPHA][0].id);
    expect(getAssetsFolder()).toBe(`${ALPHA}\\assets`);

    // --- close it: back to the picker, store empty, undo depth zero -------------
    undoStack.push({ label: 'Anything', undo: async () => {}, redo: async () => {} });
    expect(undoStack.undoDepth).toBe(1);

    await fireEvent.click(view.getByText('Close Project'));
    await waitFor(() => expect(canvasStore.project).toBeNull());

    expect(order).toContain('close_project');
    await waitFor(() => expect(view.queryByTestId('project-picker')).not.toBeNull());
    expect(view.queryByTestId('left-column')).toBeNull();
    expect(canvasStore.canvases).toEqual([]);
    expect(canvasStore.activeCanvasId).toBeNull();
    expect(canvasStore.cardCount).toBe(0);
    expect(undoStack.undoDepth).toBe(0);
    expect(getAssetsFolder()).toBeNull();
    // The just-closed project is now the first recent card.
    expect(projectsState.recents[0]?.path).toBe(ALPHA);

    // --- a second project in the same session ----------------------------------
    recents = [entry(BETA, 'Beta'), ...recents];
    await projectsState.loadRecents();
    order = [];

    const betaCard = await waitFor(() => {
      const card = [...view.getByTestId('recent-grid').querySelectorAll('button.card')].find((b) =>
        b.textContent?.includes('Beta'),
      );
      if (!card) throw new Error('Beta is not in the grid yet');
      return card;
    });
    await fireEvent.click(betaCard);

    await waitFor(() => expect(canvasStore.project?.name).toBe('Beta'));
    expect(canvasStore.activeCanvasId).toBe(CANVASES[BETA][0].id);
    // The assets folder was re-read, so Beta does not draw Alpha's pictures.
    await waitFor(() => expect(getAssetsFolder()).toBe(`${BETA}\\assets`));
    expect(order).toContain('assets_folder');
    // And the recents list came back with the second project first.
    await waitFor(() => expect(projectsState.recents[0]?.path).toBe(BETA));
    expect(projectsState.recents.map((r) => r.path)).toContain(ALPHA);
  });

  it('app_openFailed_drawsTheMessageOnThePickerAndStaysThere', async () => {
    const view = render(App);
    await waitFor(() => expect(view.queryByTestId('project-picker')).not.toBeNull());

    recents = [entry(ALPHA, 'Alpha')];
    await projectsState.loadRecents();

    const message =
      'the project database could not be opened: C:\\Projects\\Alpha\\ideascape.db — file is not a database';
    const IpcErrorClass = (await import('../../../lib/ipc')).IpcError;
    invokeSafe.mockImplementation((command: string) => {
      order.push(command);
      if (command === 'open_project') return Promise.reject(new IpcErrorClass(message));
      if (command === 'list_recent_projects') return Promise.resolve([...recents]);
      return Promise.resolve(null);
    });

    const card = view.getByTestId('recent-grid').querySelector('button.card')!;
    await fireEvent.click(card);

    // Drawn on the picker, naming the file, with the picker still on screen (§15.2).
    await waitFor(() => expect(view.queryByTestId('picker-failure')).not.toBeNull());
    expect(view.getByTestId('picker-failure').textContent).toContain('ideascape.db');
    expect(view.queryByTestId('project-picker')).not.toBeNull();
    expect(canvasStore.project).toBeNull();
    // The entry stays in the list: a temporarily missing drive is not a reason to forget it.
    expect(projectsState.recents).toHaveLength(1);
  });
});
