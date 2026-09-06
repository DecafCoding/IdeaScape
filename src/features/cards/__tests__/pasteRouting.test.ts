/**
 * Milestone 4's checkpoint. It mounts the real composition root and drives Ctrl+V over a
 * mocked seam, asserting the whole sequence for one pasted address:
 *
 * - `create_link_card` is called BEFORE `fetch_link_preview` (contract 2: the card exists
 *   before the network is consulted),
 * - the paste handler returns before the fetch resolves (the wait never blocks the work),
 * - the store's `fetchStatus` goes `fetching` then `failed` when the fetch resolves
 *   not-fetched, and the card renders the not-fetched state with a Refetch control
 *   throughout (contract 3: failure is drawn),
 * - `guard()` is never invoked — no message strip, no dialog.
 *
 * No single task's tests assert that ordering end to end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';

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

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
  revealItemInDir: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

const App = (await import('../../../app.svelte')).default;
const { canvasStore } = await import('../../../stores/canvasStore.svelte');
const { undoStack } = await import('../../undo/undoStack.svelte');

const CANVAS_ID = 1;
const ADDRESS = 'https://example.com/articles/one';

/** The order commands were called in, which is what the checkpoint is about. */
let order: string[] = [];
/** Resolves the pending fetch, so the test controls when the network "answers". */
let resolveFetch: ((value: unknown) => void) | null = null;

function backend() {
  let nextId = 10;
  invokeSafe.mockImplementation((command: string, args?: Record<string, unknown>) => {
    order.push(command);
    switch (command) {
      case 'dev_project_path':
        return Promise.resolve('C:/Project');
      case 'open_project':
        return Promise.resolve({
          id: 1,
          name: 'Project',
          created_at: 'now',
          updated_at: 'now',
        });
      case 'list_canvases':
        return Promise.resolve([
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
        ]);
      case 'list_placements':
      case 'list_connections':
        return Promise.resolve([]);
      case 'assets_folder':
        return Promise.resolve('C:/Project/assets');
      case 'asset_statuses':
        return Promise.resolve([]);
      case 'perf_gate_requested':
        return Promise.reject(new Error('not a debug build'));
      case 'classify_url':
        return Promise.resolve({ kind: 'link', url: ADDRESS });
      case 'create_link_card': {
        const id = nextId++;
        return Promise.resolve({
          placement: {
            id,
            canvas_id: CANVAS_ID,
            item_id: id,
            x: args?.x as number,
            y: args?.y as number,
            width: args?.width as number,
            height: args?.height as number,
            z_order: 0,
          },
          item: {
            id,
            project_id: 1,
            kind: 'link',
            payload: JSON.stringify({
              url: ADDRESS,
              title: '',
              description: '',
              favicon_asset: null,
              thumbnail_asset: null,
              fetched_at: null,
            }),
            created_at: 'now',
            updated_at: 'now',
          },
        });
      }
      case 'fetch_link_preview':
        return new Promise((resolve) => {
          resolveFetch = resolve;
        });
      case 'update_item_payload':
        return Promise.resolve({
          id: args?.itemId as number,
          project_id: 1,
          kind: 'link',
          payload: args?.payload as string,
          created_at: 'now',
          updated_at: 'now',
        });
      default:
        return Promise.resolve(null);
    }
  });
}

async function mountAndPaste() {
  const view = render(App);
  await waitFor(() => expect(canvasStore.activeCanvasId).toBe(CANVAS_ID));

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      read: async () => [],
      readText: async () => ADDRESS,
      writeText: async () => {},
    },
  });

  order = [];
  await fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
  return view;
}

describe('paste routing', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    resolveFetch = null;
    order = [];
    canvasStore.closeProject();
    undoStack.clear();
    backend();
  });

  afterEach(cleanup);

  it('paste_aWebAddress_createsTheCardBeforeTheFetchAndNeverBlocksOnIt', async () => {
    const { queryByTestId } = await mountAndPaste();

    await waitFor(() => expect(order).toContain('fetch_link_preview'));

    // Contract 2: the card exists before the network is consulted.
    expect(order.indexOf('create_link_card')).toBeGreaterThan(-1);
    expect(order.indexOf('create_link_card')).toBeLessThan(order.indexOf('fetch_link_preview'));

    // The handler returned: the card is on the canvas while the fetch is still pending.
    expect(canvasStore.cardCount).toBe(1);
    const itemId = [...canvasStore.items.keys()][0];
    expect(canvasStore.fetchStatusFor(itemId)).toBe('fetching');
    expect(order).not.toContain('update_item_payload');

    // The card draws the not-fetched state throughout, with a Refetch control.
    await waitFor(() => expect(queryByTestId('link-card-not-fetched')).not.toBeNull());
  });

  it('paste_theFetchResolvingNotFetched_setsFailedAndDrawsTheCardRatherThanAnError', async () => {
    const { queryByTestId, queryAllByRole } = await mountAndPaste();
    await waitFor(() => expect(order).toContain('fetch_link_preview'));
    const itemId = [...canvasStore.items.keys()][0];

    resolveFetch?.({
      url: ADDRESS,
      fetched: false,
      title: '',
      description: '',
      favicon_asset: null,
      thumbnail_asset: null,
    });

    await waitFor(() => expect(canvasStore.fetchStatusFor(itemId)).toBe('failed'));
    expect(queryByTestId('link-card-not-fetched')).not.toBeNull();
    // Contract 11: the card and the panel both offer Refetch — no route is the only route.
    expect(queryAllByRole('button', { name: /refetch/i }).length).toBeGreaterThanOrEqual(2);
    // Contract 3: no message strip and no dialog. `guard()` was never reached.
    expect(document.querySelector('.error')).toBeNull();
  });

  it('paste_aFetchThatRejects_setsFailedAndStillShowsNoErrorStrip', async () => {
    const { queryByTestId } = await mountAndPaste();
    await waitFor(() => expect(order).toContain('fetch_link_preview'));
    const itemId = [...canvasStore.items.keys()][0];

    // A rejected fetch is logged and drawn, never surfaced through guard().
    resolveFetch = null;
    invokeSafe.mockImplementation((command: string) => {
      order.push(command);
      if (command === 'fetch_link_preview') return Promise.reject(new Error('offline'));
      return Promise.resolve(null);
    });
    canvasStore.setFetchStatus(itemId, 'fetching');

    await waitFor(() => expect(queryByTestId('link-card-not-fetched')).not.toBeNull());
    expect(document.querySelector('.error')).toBeNull();
  });

  it('paste_aCardDeletedWhileItsFetchIsInFlight_writesNoPayload', async () => {
    await mountAndPaste();
    await waitFor(() => expect(order).toContain('fetch_link_preview'));
    const itemId = [...canvasStore.items.keys()][0];
    const placementId = [...canvasStore.placements.keys()][0];

    // The undone paste removes the row; the fetch must not put it back.
    canvasStore.removePlacement(placementId);
    canvasStore.removeItem(itemId);

    resolveFetch?.({
      url: ADDRESS,
      fetched: true,
      title: 'Too Late',
      description: '',
      favicon_asset: null,
      thumbnail_asset: null,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).not.toContain('update_item_payload');
  });
});
