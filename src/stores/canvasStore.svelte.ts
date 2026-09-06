/**
 * The one shared canvas state. Cards, connections, selection, pan, zoom and undo all read
 * and write it, which is why it is named up front and lives here rather than inside a
 * feature (architecture §4). It imports from `lib/` only — never from a feature.
 *
 * No component reaches into the raw state to mutate it: every change goes through one of
 * the mutator functions below, so the save scheduler and the undo stack have one place to
 * observe. The collections are SvelteMap and SvelteSet rather than plain ones: a plain Map
 * inside `$state` is not reactive when an entry is set, so every card move would have to
 * reassign the whole container — which is precisely the fine-grained reactivity Svelte was
 * chosen for. Mutate the entry, not the container.
 *
 * The file must keep its `.svelte.ts` extension or the runes will not compile.
 */
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { invokeSafe } from '../lib/ipc';
import { clearAssetStatuses, refreshAssetStatuses } from '../lib/assets';
import { clampZoom, type Point, type Size, type View } from '../lib/geometry';
import {
  payloadAssetNames,
  type Canvas,
  type Connection,
  type FetchStatus,
  type Item,
  type Placement,
  type PlacementWithItem,
  type Project,
} from '../lib/types';

export type Tool = 'select' | 'pan' | 'connect';
export type SaveState = 'idle' | 'saving' | 'saved';

class CanvasStore {
  project = $state<Project | null>(null);
  canvases = $state<Canvas[]>([]);
  activeCanvasId = $state<number | null>(null);

  placements = new SvelteMap<number, Placement>();
  items = new SvelteMap<number, Item>();
  connections = new SvelteMap<number, Connection>();

  /**
   * How a link or video card's preview fetch is going, keyed by item id. Presentation
   * state only (design-system §13.1): the durable truth is the payload's `fetched_at`, and
   * this map distinguishes only *in flight* from *failed*.
   */
  fetchStatus = new SvelteMap<number, FetchStatus>();

  selection = new SvelteSet<number>();
  /** Exclusive with `selection` — the panel shows one selected thing at a time. */
  selectedConnectionId = $state<number | null>(null);
  /** The line being drawn: its source card, and where the pointer is now, in world units. */
  pendingLink = $state<{ fromPlacementId: number; pointer: Point } | null>(null);
  activeTool = $state<Tool>('select');

  view = $state<View>({ x: 0, y: 0, zoom: 1 });
  viewportSize = $state<Size>({ width: 0, height: 0 });

  editingPlacementId = $state<number | null>(null);

  saveState = $state<SaveState>('idle');
  savedAt = $state<number | null>(null);

  readonly activeCanvas = $derived(this.canvases.find((c) => c.id === this.activeCanvasId) ?? null);
  readonly cardCount = $derived(this.placements.size);
  readonly selectedPlacements = $derived(
    [...this.selection]
      .map((id) => this.placements.get(id))
      .filter((p): p is Placement => p !== undefined),
  );
  readonly selectedConnection = $derived(
    this.selectedConnectionId === null
      ? null
      : (this.connections.get(this.selectedConnectionId) ?? null),
  );
  readonly maxZOrder = $derived(
    this.placements.size === 0
      ? -1
      : Math.max(...[...this.placements.values()].map((p) => p.z_order)),
  );
  /** Every placement on the active canvas, bottom of the stack first. */
  readonly orderedPlacements = $derived(
    [...this.placements.values()].sort((a, b) => a.z_order - b.z_order || a.id - b.id),
  );

  // --- view -------------------------------------------------------------

  setView(next: Partial<View>): void {
    const zoom = next.zoom === undefined ? this.view.zoom : clampZoom(next.zoom);
    this.view = {
      x: next.x === undefined ? this.view.x : next.x,
      y: next.y === undefined ? this.view.y : next.y,
      zoom,
    };
  }

  setViewportSize(size: Size): void {
    this.viewportSize = { ...size };
  }

  // --- placements and items --------------------------------------------

  upsertPlacement(placement: Placement): void {
    this.placements.set(placement.id, { ...placement });
  }

  /** Change one placement's fields in place, leaving the container alone. */
  patchPlacement(id: number, patch: Partial<Placement>): void {
    const current = this.placements.get(id);
    if (!current) return;
    this.placements.set(id, { ...current, ...patch });
  }

  removePlacement(id: number): void {
    this.placements.delete(id);
    this.selection.delete(id);
    if (this.editingPlacementId === id) this.editingPlacementId = null;
  }

  upsertItem(item: Item): void {
    this.items.set(item.id, { ...item });
  }

  removeItem(id: number): void {
    this.items.delete(id);
  }

  upsertCard(card: PlacementWithItem): void {
    this.upsertItem(card.item);
    this.upsertPlacement(card.placement);
  }

  /** The item a placement points at, or null when the row is missing. */
  itemFor(placement: Placement): Item | null {
    return this.items.get(placement.item_id) ?? null;
  }

  // --- connections ------------------------------------------------------

  upsertConnection(connection: Connection): void {
    this.connections.set(connection.id, { ...connection });
  }

  patchConnection(id: number, patch: Partial<Connection>): void {
    const current = this.connections.get(id);
    if (!current) return;
    this.connections.set(id, { ...current, ...patch });
  }

  removeConnection(id: number): void {
    this.connections.delete(id);
    if (this.selectedConnectionId === id) this.selectedConnectionId = null;
  }

  /** Selecting a line clears the card selection: the two are mutually exclusive. */
  selectConnection(id: number | null): void {
    if (id !== null) this.clearSelection();
    this.selectedConnectionId = id;
  }

  // --- selection --------------------------------------------------------

  setSelection(ids: Iterable<number>): void {
    const next = new Set(ids);
    for (const id of [...this.selection]) if (!next.has(id)) this.selection.delete(id);
    for (const id of next) this.selection.add(id);
    this.selectedConnectionId = null;
  }

  toggleSelected(id: number): void {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.selectedConnectionId = null;
  }

  clearSelection(): void {
    this.selection.clear();
  }

  selectAll(): void {
    this.setSelection(this.placements.keys());
  }

  isSelected(id: number): boolean {
    return this.selection.has(id);
  }

  // --- save state -------------------------------------------------------

  markSaving(): void {
    this.saveState = 'saving';
  }

  markSaved(at: number = Date.now()): void {
    this.saveState = 'saved';
    this.savedAt = at;
  }

  // --- fetch status -----------------------------------------------------

  setFetchStatus(itemId: number, status: FetchStatus): void {
    this.fetchStatus.set(itemId, status);
  }

  fetchStatusFor(itemId: number): FetchStatus {
    return this.fetchStatus.get(itemId) ?? 'idle';
  }

  // --- loading ----------------------------------------------------------

  /**
   * Keep a canvas row's saved view in step with what was just written to it.
   *
   * `loadCanvas` restores a canvas's view from this list, and the list is otherwise only read
   * when the project opens — so without this, panning canvas A, switching to B and switching
   * back would put A at the position it had when the project was opened. "Everything is
   * exactly as it was left, including the view position" is a PRD §10.2 acceptance line.
   */
  recordCanvasView(canvasId: number, view: { x: number; y: number; zoom: number }): void {
    this.canvases = this.canvases.map((c) =>
      c.id === canvasId ? { ...c, view_x: view.x, view_y: view.y, view_zoom: view.zoom } : c,
    );
  }

  /** Read a canvas and every card on it, and restore the view the canvas was left at. */
  async loadCanvas(canvasId: number): Promise<void> {
    const cards = await invokeSafe<PlacementWithItem[]>('list_placements', {
      canvasId,
    });

    const connections = await invokeSafe<Connection[]>('list_connections', { canvasId });

    this.placements.clear();
    this.items.clear();
    for (const card of cards) this.upsertCard(card);

    this.connections.clear();
    for (const connection of connections) this.upsertConnection(connection);

    this.activeCanvasId = canvasId;
    this.clearSelection();
    this.selectedConnectionId = null;
    this.pendingLink = null;
    this.editingPlacementId = null;
    this.fetchStatus.clear();

    // One call for the whole canvas: 250 round trips would sit on the two-second open
    // budget. A card whose asset is absent draws the missing-file marker; nothing throws.
    const assetNames = cards.flatMap((card) =>
      payloadAssetNames(card.item.kind, card.item.payload),
    );
    await refreshAssetStatuses(assetNames);

    const canvas = this.canvases.find((c) => c.id === canvasId);
    if (canvas) {
      this.setView({ x: canvas.view_x, y: canvas.view_y, zoom: canvas.view_zoom });
    }
  }

  /** Open a project and load its first canvas. */
  async openProject(path: string): Promise<void> {
    this.project = await invokeSafe<Project>('open_project', { path });
    this.canvases = await invokeSafe<Canvas[]>('list_canvases', {
      projectId: this.project.id,
    });
    if (this.canvases.length > 0) await this.loadCanvas(this.canvases[0].id);
  }

  /** Reset everything a closing project owns. The undo stack clears separately. */
  closeProject(): void {
    this.project = null;
    this.canvases = [];
    this.activeCanvasId = null;
    this.placements.clear();
    this.items.clear();
    this.connections.clear();
    this.selection.clear();
    this.selectedConnectionId = null;
    this.pendingLink = null;
    this.editingPlacementId = null;
    this.fetchStatus.clear();
    clearAssetStatuses();
    this.view = { x: 0, y: 0, zoom: 1 };
    this.saveState = 'idle';
    this.savedAt = null;
  }
}

export const canvasStore = new CanvasStore();
export type { CanvasStore };
