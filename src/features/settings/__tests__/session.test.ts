/**
 * The route in, the route out, and the boot load — the only place the screen conditional,
 * the shortcut maps and the drag guards are exercised together, against the real composition
 * root and a miniature in-memory backend.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { Canvas, PlacementWithItem } from '../../../lib/types';

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
const { getSettings, resetSettings } = await import('../../../lib/settings.svelte');

const PROJECT = 'C:\\Projects\\Alpha';

let nextId = 100;
let canvases: Canvas[] = [];
let cards: PlacementWithItem[] = [];
/** What `read_settings` hands back this run. */
let storedSettings: Record<string, unknown> = {};
let order: string[] = [];

function makeCanvas(name: string): Canvas {
  const canvas: Canvas = {
    id: nextId++,
    project_id: 1,
    name,
    sort_order: canvases.length,
    view_x: 0,
    view_y: 0,
    view_zoom: 1,
    created_at: '',
    updated_at: '2026-09-06T12:00:00Z',
  };
  canvases.push(canvas);
  return canvas;
}

function makeNote(canvasId: number, title: string): PlacementWithItem {
  const id = nextId++;
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
      payload: JSON.stringify({ title, text: '' }),
      created_at: '',
      updated_at: '',
    },
  };
  cards.push(card);
  return card;
}

function backend() {
  invokeSafe.mockImplementation((command: string, args?: Record<string, unknown>) => {
    order.push(command);
    switch (command) {
      case 'read_settings':
        return Promise.resolve(storedSettings);
      case 'write_settings':
        storedSettings = { ...(args?.settings as Record<string, unknown>) };
        return Promise.resolve(null);
      case 'settings_location':
        return Promise.resolve('C:\\Users\\Someone\\AppData\\Roaming\\IdeaScape');
      case 'list_recent_projects':
        return Promise.resolve([
          {
            path: PROJECT,
            name: 'Alpha',
            canvas_count: canvases.length,
            card_count: cards.length,
            opened_at: new Date().toISOString(),
          },
        ]);
      case 'open_project':
        return Promise.resolve({ id: 1, name: 'Alpha', created_at: '', updated_at: '' });
      case 'assets_folder':
        return Promise.resolve(`${PROJECT}\\assets`);
      case 'list_canvases':
        return Promise.resolve(canvases.map((c) => ({ ...c })));
      case 'list_placements':
        return Promise.resolve(cards.filter((c) => c.placement.canvas_id === args?.canvasId));
      case 'list_connections':
        return Promise.resolve([]);
      case 'asset_statuses':
        return Promise.resolve([]);
      case 'perf_gate_requested':
        return Promise.reject(new Error('not a debug build'));
      default:
        return Promise.resolve(null);
    }
  });
}

async function mountAndOpen() {
  const view = render(App);
  const card = await waitFor(() => {
    const found = view.getByTestId('recent-grid').querySelector('button.card');
    if (!found) throw new Error('the recent grid has not rendered yet');
    return found;
  });
  await fireEvent.click(card);
  await waitFor(() => expect(canvasStore.project).not.toBeNull());
  canvasStore.setViewportSize({ width: 1000, height: 700 });
  return view;
}

beforeEach(() => {
  invokeSafe.mockReset();
  order = [];
  nextId = 100;
  canvases = [];
  cards = [];
  storedSettings = {};
  canvasStore.closeProject();
  undoStack.clear();
  searchState.clear();
  projectsState.recents = [];
  projectsState.selectedIndex = -1;
  projectsState.failure = null;
  resetSettings();
  document.documentElement.removeAttribute('data-theme');
  makeCanvas('Canvas 1');
  backend();
});

afterEach(cleanup);

describe('the Settings screen in the shell', () => {
  it('shell_clickTheGearRow_showsTheSettingsPageAndKeepsTheLeftColumn', async () => {
    const view = await mountAndOpen();
    expect(view.queryByTestId('settings-page')).toBeNull();

    await fireEvent.click(view.getByTestId('settings-row'));

    await waitFor(() => expect(view.getByTestId('settings-page')).toBeTruthy());
    // The left column and the title bar stay; the canvas and the panel go.
    expect(view.getByTestId('left-column')).toBeTruthy();
    expect(view.queryByTestId('canvas-surface')).toBeNull();
    expect(view.queryByTestId('properties-panel')).toBeNull();
  });

  it('shell_settingsOpen_marksTheGearRowActive', async () => {
    const view = await mountAndOpen();
    const gear = view.getByTestId('settings-row');
    expect(gear.classList.contains('active')).toBe(false);
    await fireEvent.click(gear);
    await waitFor(() =>
      expect(view.getByTestId('settings-row').classList.contains('active')).toBe(true),
    );
  });

  it('shell_backToCanvas_returnsToTheCanvasWithTheSelectionIntact', async () => {
    makeNote(canvases[0].id, 'A note');
    const view = await mountAndOpen();
    await canvasStore.loadCanvas(canvases[0].id);
    canvasStore.selection.add(cards[0].placement.id);
    const selectedBefore = [...canvasStore.selection];

    await fireEvent.click(view.getByTestId('settings-row'));
    await waitFor(() => expect(view.getByTestId('settings-page')).toBeTruthy());
    await fireEvent.click(view.getByTestId('settings-back'));

    await waitFor(() => expect(view.queryByTestId('settings-page')).toBeNull());
    expect([...canvasStore.selection]).toEqual(selectedBefore);
    expect(canvasStore.activeCanvasId).toBe(canvases[0].id);
  });

  // The canvas rows stay visible on the Settings page, so clicking one has to mean "show me
  // that canvas". The row for the canvas already active is the ordinary case — a project
  // starts with exactly one — and it used to do nothing, leaving no pointer route back.
  it('shell_clickTheActiveCanvasRowFromSettings_returnsToTheCanvas', async () => {
    const view = await mountAndOpen();
    await canvasStore.loadCanvas(canvases[0].id);
    await fireEvent.click(view.getByTestId('settings-row'));
    await waitFor(() => expect(view.getByTestId('settings-page')).toBeTruthy());

    await fireEvent.click(view.getByText('Canvas 1'));

    await waitFor(() => expect(view.queryByTestId('settings-page')).toBeNull());
    expect(view.getByTestId('canvas-surface')).toBeTruthy();
    expect(canvasStore.activeCanvasId).toBe(canvases[0].id);
  });

  it('shell_clickAnotherCanvasRowFromSettings_returnsToThatCanvas', async () => {
    makeCanvas('Canvas 2');
    const view = await mountAndOpen();
    await canvasStore.loadCanvas(canvases[0].id);
    await fireEvent.click(view.getByTestId('settings-row'));
    await waitFor(() => expect(view.getByTestId('settings-page')).toBeTruthy());

    await fireEvent.click(view.getByText('Canvas 2'));

    await waitFor(() => expect(view.queryByTestId('settings-page')).toBeNull());
    expect(canvasStore.activeCanvasId).toBe(canvases[1].id);
  });

  it('shell_escapeOnSettings_returnsToTheCanvas', async () => {
    const view = await mountAndOpen();
    await fireEvent.click(view.getByTestId('settings-row'));
    await waitFor(() => expect(view.getByTestId('settings-page')).toBeTruthy());

    await fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(view.queryByTestId('settings-page')).toBeNull());
  });

  it('shell_closeProject_leavesSettingsClosed', async () => {
    const view = await mountAndOpen();
    await fireEvent.click(view.getByTestId('settings-row'));
    await waitFor(() => expect(view.getByTestId('settings-page')).toBeTruthy());

    await fireEvent.click(view.getByText('Close Project'));

    await waitFor(() => expect(canvasStore.project).toBeNull());
    expect(view.queryByTestId('settings-page')).toBeNull();
    expect(view.getByTestId('project-picker')).toBeTruthy();
  });

  it('shell_settingsOpen_theCanvasShortcutsDoNotFire', async () => {
    const view = await mountAndOpen();
    await fireEvent.click(view.getByTestId('settings-row'));
    await waitFor(() => expect(view.getByTestId('settings-page')).toBeTruthy());

    order = [];
    // N is New note on the canvas. There is no canvas here.
    await fireEvent.keyDown(window, { key: 'n' });
    expect(order.filter((c) => c.startsWith('create_'))).toEqual([]);
  });

  it('boot_settingsSayDark_appliesTheAttributeBeforeTheFirstDataLoad', async () => {
    storedSettings = {
      autoSaveMs: 10000,
      snapToGrid: true,
      zoomWith: 'ctrl-scroll',
      theme: 'dark',
    };
    render(App);

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
    expect(getSettings()).toEqual({
      autoSaveMs: 10000,
      snapToGrid: true,
      zoomWith: 'ctrl-scroll',
      theme: 'dark',
    });
    // The settings read is the very first thing the application does.
    expect(order[0]).toBe('read_settings');
    expect(order.indexOf('read_settings')).toBeLessThan(order.indexOf('list_recent_projects'));
  });

  it('boot_theSettingsFileIsMissing_startsOnTheDrawnDefaultsWithNoTheme', async () => {
    invokeSafe.mockImplementation((command: string) =>
      command === 'read_settings'
        ? Promise.reject(new Error('no such file'))
        : command === 'list_recent_projects'
          ? Promise.resolve([])
          : Promise.resolve(null),
    );
    render(App);
    await waitFor(() => expect(getSettings().theme).toBe('light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
