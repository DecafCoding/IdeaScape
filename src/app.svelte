<!--
  The composition root. It is the only module allowed to reach into several features at
  once — the import direction rule binds features to one another, not the root that
  assembles them. Everything below is wiring: features raise callbacks, this file decides
  what they mean, writes through the command seam and records the undo command.
-->
<script lang="ts">
  import TitleBar from './features/shell/TitleBar.svelte';
  import LeftColumn from './features/shell/LeftColumn.svelte';
  import PropertiesPanel from './features/shell/PropertiesPanel.svelte';
  import ContextMenu from './features/shell/ContextMenu.svelte';
  import CanvasSurface from './features/canvas/CanvasSurface.svelte';
  import EmptyCanvas from './features/canvas/EmptyCanvas.svelte';
  import CardLayer from './features/cards/CardLayer.svelte';
  import DropTarget from './features/cards/DropTarget.svelte';
  import SettingsPage from './features/settings/SettingsPage.svelte';
  import {
    addImageFromClipboardItem,
    addImagesFromPaths,
    imageTypeOf,
    pickImages,
    IMAGE_EXTENSIONS,
  } from './features/cards/ingest.svelte';
  import CanvasList from './features/canvases/CanvasList.svelte';
  import DeleteCanvasDialog from './features/canvases/DeleteCanvasDialog.svelte';
  import {
    createCanvas,
    deleteCanvas as deleteCanvasRow,
    refreshCanvases,
    renameCanvas,
  } from './features/canvases/canvases.svelte';
  import SearchBox from './features/search/SearchBox.svelte';
  import SearchResults from './features/search/SearchResults.svelte';
  import { searchState } from './features/search/search.svelte';
  import ProjectPicker from './features/projects/ProjectPicker.svelte';
  import NewProjectDialog from './features/projects/NewProjectDialog.svelte';
  import { projectsState } from './features/projects/projects.svelte';
  import ConnectionLayer from './features/connections/ConnectionLayer.svelte';
  import ConnectionLabels from './features/connections/ConnectionLabels.svelte';
  import {
    beginLink,
    cancelLink,
    completeLink,
    deleteConnections,
    hitPlacementAt,
    trackLink,
    updateConnection,
  } from './features/connections/connections.svelte';
  import { applyMarquee, selectCard } from './features/selection/selection.svelte';
  import { bringForward, sendBack } from './features/cards/zorder';
  import { undoStack } from './features/undo/undoStack.svelte';
  import {
    createCanvasCommand,
    createCardCommand,
    createConnectionCommand,
    deleteCanvasCommand,
    deleteCardsCommand,
    deleteConnectionsCommand,
    duplicateCommand,
    editConnectionCommand,
    editItemCommand,
    renameCanvasCommand,
    updatePlacementsCommand,
  } from './features/undo/commands';
  import { canvasStore } from './stores/canvasStore.svelte';
  import { invokeSafe, IpcError } from './lib/ipc';
  import { getAssetsFolder, noteAssetPresent, setAssetsFolder } from './lib/assets.svelte';
  import { LINK_SIZE, NOTE_SIZE, VIDEO_SIZE } from './lib/cardKinds';
  import { decidePaste, type UrlClassification } from './lib/paste';
  import { registerShortcuts } from './lib/shortcuts';
  import { getSettings, loadSettings } from './lib/settings.svelte';
  import { loadBlueprints } from './lib/blueprints.svelte';
  import { clearListCache } from './lib/lists';
  import { applyFont, applyTheme } from './lib/theme';
  import {
    debounce,
    flushPlacements,
    queuePlacementUpdate,
    startAutoSave,
    writeNow,
  } from './lib/save';
  import { runPass } from './lib/perfGate';
  import { logError, logInfo } from './lib/logger';
  import {
    BACKGROUND_MENU_WIDTH,
    CANVAS_MENU_WIDTH,
    ELEMENT_MENU_WIDTH,
    type MenuEntry,
    type OpenMenu,
  } from './lib/menu';
  import type { Point } from './lib/geometry';
  import {
    connectionEdit,
    parseImagePayload,
    parseLinkPayload,
    parseNotePayload,
    parseVideoPayload,
    type AssetRef,
    type ConnectionEdit,
    type DeleteEffect,
    type Item,
    type LinkPreviewResult,
    type CanvasHit,
    type CardHit,
    type Placement,
    type PlacementWithItem,
    type VideoPreviewResult,
  } from './lib/types';

  const NEW_NOTE_WIDTH = NOTE_SIZE.width;
  const NEW_NOTE_HEIGHT = NOTE_SIZE.height;
  const DUPLICATE_OFFSET = 22;
  /** Below this window width the fixed chrome leaves no canvas, so the panel must collapse. */
  const PANEL_AUTO_COLLAPSE_WIDTH = 420;

  let folderPath = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let panelOpen = $state(false);
  let windowWidth = $state(typeof window === 'undefined' ? 1180 : window.innerWidth);
  let openMenu = $state<OpenMenu | null>(null);
  let pointerWorld = $state<Point>({ x: 0, y: 0 });
  /** Cards copied with Ctrl+C, held in the application rather than the system clipboard. */
  let clipboard = $state<PlacementWithItem[]>([]);

  /** True while a file drag is over the window, which draws the mid-drop state. */
  let dragOver = $state(false);
  /** The item just pasted, which carries the §9.7 "Pasted here · Ctrl+V" caption. */
  let pastePendingItemId = $state<number | null>(null);

  /** Which canvas row is a text box, and which canvas the delete confirm is about. */
  let renamingCanvasId = $state<number | null>(null);
  let deletingCanvasId = $state<number | null>(null);
  /**
   * Which row the canvas menu is about, held apart from `openMenu`. The root closes every menu
   * on a capturing click, which runs *before* the chosen row's own handler — so a `run` that
   * read `openMenu.canvasId` would always find it null.
   */
  let menuCanvasId = $state<number | null>(null);

  /** True while the Settings page has replaced the canvas (§9.11, frame 16a). */
  let settingsOpen = $state(false);

  /** The New project dialog: whether it is open, where it will write, and its own failure. */
  let newProjectOpen = $state(false);
  let newProjectParent = $state('');
  let newProjectFailure = $state<string | null>(null);
  let newProjectBusy = $state(false);

  let canvas = $state<CanvasSurface | null>(null);
  let cards = $state<CardLayer | null>(null);

  const saveHooks = {
    onSaving: () => canvasStore.markSaving(),
    onSaved: () => canvasStore.markSaved(),
  };

  /** Cards or a connection: the panel shows one selected thing at a time. */
  const somethingSelected = $derived(
    canvasStore.selection.size > 0 || canvasStore.selectedConnectionId !== null,
  );

  const panelExpanded = $derived(
    panelOpen && somethingSelected && windowWidth >= PANEL_AUTO_COLLAPSE_WIDTH,
  );

  // The panel opens itself when something is selected and closes when nothing is.
  $effect(() => {
    panelOpen = somethingSelected;
  });

  async function guard(work: () => Promise<void>) {
    try {
      await work();
      errorMessage = null;
    } catch (error) {
      // Failure is drawn in the shell, never in a dialog.
      errorMessage = error instanceof IpcError ? error.message : 'Something went wrong.';
      logError('an action failed', error);
    }
  }

  // --- start up ---------------------------------------------------------

  /**
   * Boot reads the settings file and applies the theme FIRST, before any data load, then
   * loads the recents list. There is no developer path any more and the application does not
   * auto-open the last project: design-system §9.1 makes the picker the launch screen, and
   * the Recent grid would be pointless if a project opened itself.
   *
   * A Dark theme on a light Windows shows the light ground for one frame, because index.html
   * paints before the file is read. §11.3 treats the theme change as an instant repaint, so
   * that frame is not hidden behind a transition and not paid for with a blocking read.
   */
  $effect(() => {
    void guard(async () => {
      const loaded = await loadSettings();
      applyTheme(loaded.theme);
      applyFont(loaded.font);
      await loadBlueprints();
      await projectsState.loadRecents();
      await maybeRunPerfGate();
    });
  });

  /**
   * The auto-save ceiling. Re-reading `autoSaveMs` inside the effect means changing the
   * cadence on the Settings page tears the old timer down and starts a new one, and closing
   * the project stops it.
   */
  $effect(() => {
    const cadence = getSettings().autoSaveMs;
    if (canvasStore.project === null) return;
    return startAutoSave(saveHooks, cadence);
  });

  /**
   * Open a project and move every piece of session state onto it. The order matters: the
   * assets folder is per project, so it is re-read on every open — read once at boot, the
   * second project of a session would draw the first project's pictures, or none.
   */
  async function openProject(path: string) {
    try {
      await canvasStore.openProject(path);
      // Read after the project is open — the folder is per project — but the value is
      // reactive, so the cards drawn by `openProject` pick their pictures up from here.
      setAssetsFolder(await invokeSafe<string>('assets_folder'));
      folderPath = path;
      // The stack holds ids from the project that is closing. `undo-model`: session only.
      undoStack.clear();
      clipboard = [];
      projectsState.failure = null;
      errorMessage = null;
      newProjectOpen = false;
      await projectsState.loadRecents();
    } catch (error) {
      const message = error instanceof IpcError ? error.message : 'Something went wrong.';
      // Drawn where the user is looking: they are on the picker, so the strip goes there.
      projectsState.failure = message;
      errorMessage = message;
      logError('a project could not be opened', error);
    }
  }

  /** Let go of the project and return to the picker, losing nothing that was in flight. */
  async function closeProject() {
    await flushPlacements(saveHooks);
    persistView.flush();
    await guard(async () => {
      await invokeSafe('close_project');
      canvasStore.closeProject();
      undoStack.clear();
      setAssetsFolder(null);
      // The project's own vocabulary goes with the project, not with the application.
      clearListCache();
      clipboard = [];
      folderPath = null;
      openMenu = null;
      settingsOpen = false;
      // The just-closed project is now the first recent card.
      await projectsState.loadRecents();
    });
  }

  /** The New project dialog's Create. A rejected name draws inside the dialog. */
  async function createProject(name: string) {
    newProjectBusy = true;
    try {
      // Rust returns the folder it created, so the front end never builds a path.
      const created = await invokeSafe<string>('create_project', {
        parentPath: newProjectParent,
        name,
      });
      logInfo(`created the project at ${created}`);
      newProjectFailure = null;
      await openProject(created);
    } catch (error) {
      newProjectFailure = error instanceof IpcError ? error.message : 'Something went wrong.';
      logError('a project could not be created', error);
    } finally {
      newProjectBusy = false;
    }
  }

  async function openNewProjectDialog() {
    newProjectFailure = null;
    newProjectParent = await projectsState.loadDefaultParent();
    newProjectOpen = true;
  }

  async function chooseProjectFolder() {
    const path = await projectsState.chooseFolder();
    if (path) await openProject(path);
  }

  /**
   * File drop. Tauri's `dragDropEnabled` is on by default and suppresses the webview's own
   * HTML5 drop events in favour of `tauri://drag-drop`, so an `ondrop` handler on the canvas
   * would silently never fire.
   */
  $effect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload;
          // Settings has no canvas under the pointer, so a drop there would make a card the
          // user cannot see.
          if (settingsOpen) return;
          if (payload.type === 'enter' || payload.type === 'over') {
            dragOver = true;
            return;
          }
          if (payload.type === 'leave') {
            dragOver = false;
            return;
          }
          dragOver = false;
          void addDroppedFiles(payload.paths);
        });
        if (cancelled) unlisten();
        else stop = unlisten;
      } catch (error) {
        // No Tauri runtime (a unit test, or the bare Vite server): drop is simply absent.
        logError('file drop could not be listened for', error);
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  });

  async function addDroppedFiles(paths: string[]) {
    if (settingsOpen) return;
    await guard(async () => {
      const created = await addImagesFromPaths(paths, pointerWorld);
      if (created.length === 0) return;
      undoStack.push(addImagesCommand(created));
      canvasStore.markSaved();
    });
  }

  async function addFromPicker() {
    await guard(async () => {
      const created = await pickImages(pointerWorld);
      if (created.length === 0) return;
      undoStack.push(addImagesCommand(created));
      canvasStore.markSaved();
    });
  }

  /** One command for a whole ingestion batch: forty dropped pictures are one Ctrl+Z. */
  function addImagesCommand(created: PlacementWithItem[]) {
    const command = duplicateCommand(created);
    return {
      ...command,
      label: created.length > 1 ? 'Add Images' : 'Add Image',
    };
  }

  /** An image the page has decoded: record its real size and re-fit the card once. */
  async function recordImageSize(itemId: number, naturalWidth: number, naturalHeight: number) {
    await guard(async () => {
      const updated = await invokeSafe<Item>('update_image_dimensions', {
        itemId,
        naturalWidth,
        naturalHeight,
      });
      canvasStore.upsertItem(updated);
    });
  }

  /**
   * Task 21's measurement, run inside the real window when the binary is launched with
   * `--perf-gate`. It seeds 250 MIXED cards — notes, pictures, link and video previews —
   * pans continuously at 100% and again at 40%,
   * and records the result so an automated check can assert on a number that was actually
   * measured in the running application.
   */
  async function maybeRunPerfGate() {
    // A release build does not register this command, so the call simply fails there.
    const wanted = await invokeSafe<boolean>('perf_gate_requested').catch(() => null);
    if (!wanted) return;

    // The harness opens its own project from the debug-only `--project <path>` argument: the
    // boot effect no longer opens one, because a release build's only route in is the picker.
    const gatePath = await invokeSafe<string>('perf_gate_project_path');
    await openProject(gatePath);

    const canvasId = canvasStore.activeCanvasId;
    if (canvasId === null) return;

    if (canvasStore.cardCount < 250) {
      await invokeSafe('seed_mixed_cards', { canvasId, count: 250 - canvasStore.cardCount });
      await canvasStore.loadCanvas(canvasId);
    }

    // The two-second project-open budget, re-measured on the mixed canvas. Two figures, because
    // §10.2's clock starts when the recent card is clicked, not when `list_placements` is
    // called: `openMs` is the canvas read alone, and `pickerOpenMs` is the whole route the
    // picker takes — `open_project`, `list_canvases`, the canvas read, `assets_folder` and the
    // recents list — by calling the very function a Recent card's click calls.
    const canvasStarted = performance.now();
    await canvasStore.loadCanvas(canvasId);
    const openMs = Math.round(performance.now() - canvasStarted);

    const pickerStarted = performance.now();
    await openProject(gatePath);
    const pickerOpenMs = Math.round(performance.now() - pickerStarted);

    const passes = [];
    for (const [label, zoom] of [
      ['100% zoom', 1],
      ['40% zoom', 0.4],
    ] as const) {
      passes.push(await runPass(label, zoom, 30_000, (view) => canvasStore.setView(view)));
    }

    const path = await invokeSafe<string>('record_perf_result', {
      json: JSON.stringify(
        { startedAt: new Date().toISOString(), openMs, pickerOpenMs, passes },
        null,
        2,
      ),
    });
    logInfo(`the performance gate result was written to ${path}`);
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    // destroy, not close: close() is preventable and the harness must always exit.
    await getCurrentWindow().destroy();
  }

  const persistView = debounce(() => {
    const canvasId = canvasStore.activeCanvasId;
    if (canvasId === null) return;
    // The store's canvas row carries the view `loadCanvas` restores, so it has to move too.
    canvasStore.recordCanvasView(canvasId, canvasStore.view);
    void invokeSafe('update_canvas_view', {
      canvasId,
      viewX: canvasStore.view.x,
      viewY: canvasStore.view.y,
      viewZoom: canvasStore.view.zoom,
    }).catch((error) => logError('the canvas view could not be saved', error));
  }, 400);

  // --- canvases ---------------------------------------------------------

  /**
   * Make a canvas active. A switch owes the outgoing canvas two things — any geometry still
   * queued, and its pan position, which `persistView` holds behind a 400 ms trailing debounce —
   * and it owes the incoming one an empty undo stack, because the stack's ids belong to the
   * canvas that is leaving (`undo-model`).
   *
   * `loadCanvas` already clears the selection, the pending link, the edit target and the fetch
   * statuses and restores the canvas's saved view, so none of that is repeated here.
   */
  async function switchCanvas(canvasId: number) {
    // The canvas the user is being moved to has to be the thing on screen. This runs before
    // the early return below: choosing the canvas already active is still a request to look
    // at it, and from the Settings page it is the only way back with the pointer.
    settingsOpen = false;
    if (canvasId === canvasStore.activeCanvasId) return;
    await flushPlacements(saveHooks);
    persistView.flush();
    undoStack.clear();
    await guard(() => canvasStore.loadCanvas(canvasId));
  }

  /** The hooks the canvas undo commands need, so `features/undo/` imports no feature. */
  const canvasHooks = { refresh: refreshCanvases, activate: switchCanvas };

  async function newCanvas() {
    await guard(async () => {
      const canvas = await createCanvas();
      if (!canvas) return;
      // Switch first: `switchCanvas` clears the stack, so pushing before it would lose the
      // command it just recorded.
      await switchCanvas(canvas.id);
      undoStack.push(createCanvasCommand(canvas, canvasHooks));
    });
  }

  async function commitCanvasRename(canvasId: number, name: string) {
    renamingCanvasId = null;
    await guard(async () => {
      const result = await renameCanvas(canvasId, name);
      if (result) undoStack.push(renameCanvasCommand(canvasId, result.before, result.canvas.name));
    });
  }

  /**
   * Open the delete confirm, switching to the canvas first when it is not already active. The
   * confirm names the canvas's card count (design-system §15.1), and the store only holds the
   * cards of the active canvas — making it active is cheaper and more honest than a second
   * count query, and the user sees what they are about to remove.
   */
  async function openDeleteCanvasConfirm(canvasId: number) {
    if (canvasId !== canvasStore.activeCanvasId) await switchCanvas(canvasId);
    deletingCanvasId = canvasId;
  }

  /**
   * Delete a canvas, having switched away from it first when it is the active one — the shell
   * must never be showing rows that no longer exist. Rust refuses the last canvas in a project
   * and that message reaches the shell's strip through `guard`.
   */
  async function confirmDeleteCanvas(canvasId: number) {
    deletingCanvasId = null;
    await guard(async () => {
      if (canvasId === canvasStore.activeCanvasId) {
        const next = canvasStore.canvases.find((c) => c.id !== canvasId);
        if (next) await switchCanvas(next.id);
      }
      const effect = await deleteCanvasRow(canvasId);
      undoStack.push(deleteCanvasCommand(effect, canvasHooks));
    });
  }

  // --- search -----------------------------------------------------------

  /**
   * Open a result. A canvas hit switches canvas; a card hit switches when the canvas differs,
   * then selects the placement and centres the view on it. The placement is only in the store
   * once its canvas has loaded, so the rectangle is read after the switch resolves.
   */
  async function openResult(result: { kind: 'canvas' | 'card'; hit: CanvasHit | CardHit }) {
    searchState.close();
    if (result.kind === 'canvas') {
      await switchCanvas((result.hit as CanvasHit).canvas_id);
      return;
    }
    const hit = result.hit as CardHit;
    if (hit.canvas_id !== canvasStore.activeCanvasId) await switchCanvas(hit.canvas_id);
    const placement = canvasStore.placements.get(hit.placement_id);
    if (!placement) return;
    canvasStore.setSelection([hit.placement_id]);
    canvas?.centreOn({
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    });
  }

  // --- card actions -----------------------------------------------------

  async function createNote(at: Point) {
    const canvasId = canvasStore.activeCanvasId;
    if (canvasId === null) return;
    await guard(async () => {
      const card = await writeNow(
        () =>
          invokeSafe<PlacementWithItem>('create_note_card', {
            canvasId,
            x: at.x,
            y: at.y,
            width: NEW_NOTE_WIDTH,
            height: NEW_NOTE_HEIGHT,
            title: 'New Note',
            text: '',
          }),
        saveHooks,
      );
      canvasStore.upsertCard(card);
      canvasStore.setSelection([card.placement.id]);
      undoStack.push(createCardCommand(card));
    });
  }

  async function deleteSelection() {
    const ids = [...canvasStore.selection];
    if (ids.length === 0) return;
    await guard(async () => {
      const effect = await writeNow(
        () => invokeSafe<DeleteEffect>('delete_placements', { ids }),
        saveHooks,
      );
      for (const p of effect.placements) canvasStore.removePlacement(p.id);
      for (const i of effect.items) canvasStore.removeItem(i.id);
      // The Rust side is the one that reports what the cascade removed; never pre-delete.
      for (const c of effect.connections) canvasStore.removeConnection(c.id);
      canvasStore.clearSelection();
      undoStack.push(deleteCardsCommand(effect));
    });
  }

  async function copyCards(source: PlacementWithItem[], at: Point | null) {
    if (source.length === 0) return;
    const canvasId = canvasStore.activeCanvasId;
    if (canvasId === null) return;

    const origin = {
      x: Math.min(...source.map((c) => c.placement.x)),
      y: Math.min(...source.map((c) => c.placement.y)),
    };

    await guard(async () => {
      const copies: PlacementWithItem[] = [];
      for (const card of source) {
        // A duplicate is an independent card: a new item, not a second placement of the
        // same one. Sharing the item would make an edit to one copy change the other.
        const copy = await invokeSafe<PlacementWithItem>('restore_card', {
          canvasId,
          // A duplicate is a new card, so it takes new ids. Only an undo asks for the old
          // ones back.
          placementId: null,
          itemId: null,
          x: at ? at.x + (card.placement.x - origin.x) : card.placement.x + DUPLICATE_OFFSET,
          y: at ? at.y + (card.placement.y - origin.y) : card.placement.y + DUPLICATE_OFFSET,
          width: card.placement.width,
          height: card.placement.height,
          zOrder: canvasStore.maxZOrder + 1 + copies.length,
          kind: card.item.kind,
          payload: card.item.payload,
        });
        canvasStore.upsertCard(copy);
        copies.push(copy);
      }
      canvasStore.setSelection(copies.map((c) => c.placement.id));
      undoStack.push(duplicateCommand(copies));
      canvasStore.markSaved();
    });
  }

  function selectedCards(): PlacementWithItem[] {
    return canvasStore.selectedPlacements
      .map((placement) => {
        const item = canvasStore.itemFor(placement);
        return item ? { placement, item } : null;
      })
      .filter((c): c is PlacementWithItem => c !== null);
  }

  async function duplicateSelection() {
    await copyCards(selectedCards(), null);
  }

  async function copySelection() {
    const cardsToCopy = selectedCards();
    if (cardsToCopy.length === 0) return;
    clipboard = cardsToCopy.map((c) => ({
      placement: { ...c.placement },
      item: { ...c.item },
    }));
    // Also put the note text on the system clipboard, so it is useful outside the app.
    const text = cardsToCopy
      .filter((c) => c.item.kind === 'note')
      .map((c) => parseNotePayload(c.item.payload).text)
      .join('\n\n');
    try {
      await navigator.clipboard?.writeText(text);
    } catch (error) {
      logError('the system clipboard could not be written', error);
    }
  }

  /**
   * The one clipboard read. `readText()` alone cannot see image bits, so the item list is
   * read first and the text second; both are allowed to fail, because a clipboard the
   * renderer refuses is not an error the user needs told about.
   */
  async function readClipboard(): Promise<{ item: ClipboardItem | null; text: string }> {
    let item: ClipboardItem | null = null;
    try {
      const items = (await navigator.clipboard?.read()) ?? [];
      item = items.find((candidate) => imageTypeOf(candidate) !== null) ?? null;
    } catch (error) {
      logInfo('the clipboard offered no readable items; falling back to text');
      logError('the clipboard items could not be read', error);
    }
    let text = '';
    try {
      text = (await navigator.clipboard?.readText()) ?? '';
    } catch (error) {
      logError('the system clipboard could not be read', error);
    }
    return { item, text };
  }

  /**
   * Ctrl+V, the busiest key in the product. It routes internal cards, a picture, a YouTube
   * address, a web address and plain text — in that order — to the right card kind.
   *
   * For an address the card is created FIRST, marked not fetched, and the fetch is started
   * without being awaited here (contract 2: the wait never blocks the work).
   */
  async function paste() {
    if (settingsOpen) return;
    const canvasId = canvasStore.activeCanvasId;
    if (canvasId === null) return;

    const { item, text } = clipboard.length > 0 ? { item: null, text: '' } : await readClipboard();
    let classification: UrlClassification | undefined;
    if (clipboard.length === 0 && item === null && text.trim() !== '') {
      classification = await invokeSafe<UrlClassification>('classify_url', { text }).catch(
        () => ({ kind: 'none' }) as UrlClassification,
      );
    }

    const decision = decidePaste({
      hasCards: clipboard.length > 0,
      imageMimeType: item === null ? null : imageTypeOf(item),
      text,
      classification,
    });

    switch (decision.kind) {
      case 'cards':
        await copyCards(clipboard, pointerWorld);
        return;
      case 'image':
        await guard(async () => {
          const created = await addImageFromClipboardItem(item as ClipboardItem, pointerWorld);
          if (created.length === 0) return;
          undoStack.push(addImagesCommand(created));
          canvasStore.markSaved();
        });
        return;
      case 'video':
        await createFetchingCard(canvasId, 'video', decision.url, decision.provider);
        return;
      case 'link':
        await createFetchingCard(canvasId, 'link', decision.url, null);
        return;
      case 'note':
        await createPastedNote(canvasId, decision.text);
        return;
      default:
        return;
    }
  }

  async function createPastedNote(canvasId: number, text: string) {
    await guard(async () => {
      const card = await writeNow(
        () =>
          invokeSafe<PlacementWithItem>('create_note_card', {
            canvasId,
            x: pointerWorld.x,
            y: pointerWorld.y,
            width: NEW_NOTE_WIDTH,
            height: NEW_NOTE_HEIGHT,
            title: 'Pasted Note',
            text,
          }),
        saveHooks,
      );
      canvasStore.upsertCard(card);
      canvasStore.setSelection([card.placement.id]);
      undoStack.push(createCardCommand(card));
    });
  }

  /**
   * Create a link or video card and start its fetch. The card exists on the canvas before
   * the network is consulted, and the fetch is deliberately NOT awaited: awaiting it would
   * make Ctrl+V hang for up to five seconds.
   */
  async function createFetchingCard(
    canvasId: number,
    kind: 'link' | 'video',
    url: string,
    provider: string | null,
  ) {
    await guard(async () => {
      const size = kind === 'video' ? VIDEO_SIZE : LINK_SIZE;
      const card = await writeNow(
        () =>
          invokeSafe<PlacementWithItem>(
            kind === 'video' ? 'create_video_card' : 'create_link_card',
            {
              canvasId,
              x: pointerWorld.x,
              y: pointerWorld.y,
              width: size.width,
              height: size.height,
              url,
              ...(kind === 'video' ? { provider: provider ?? 'youtube' } : {}),
            },
          ),
        saveHooks,
      );
      canvasStore.upsertCard(card);
      canvasStore.setSelection([card.placement.id]);
      undoStack.push(createCardCommand(card));
      pastePendingItemId = card.item.id;
      void fetchPreview(card.item.id, false);
    });
  }

  /**
   * Read an address and patch the card's payload. The one function the paste path and both
   * Refetch controls share.
   *
   * A failure never goes through `guard()` — a failed fetch is drawn on the card (contract
   * 3), and an `Err` here would land in the shell's message strip, which is the dialog
   * behaviour by another name.
   */
  async function fetchPreview(itemId: number, pushUndo: boolean) {
    const before = canvasStore.items.get(itemId);
    if (!before) return;
    const wasVideo = before.kind === 'video';
    const url = wasVideo
      ? parseVideoPayload(before.payload).url
      : parseLinkPayload(before.payload).url;
    if (!url) return;

    canvasStore.setFetchStatus(itemId, 'fetching');
    try {
      // Re-classify from the payload's stored address, never from displayed text: a video
      // that has become a plain link must not write a payload of the wrong shape. When the
      // classification no longer matches the item's kind, the kind is kept and the link
      // path is taken.
      const classification = await invokeSafe<UrlClassification>('classify_url', { text: url });
      const asVideo = wasVideo && classification.kind === 'video';

      let payload: string;
      let fetched: boolean;
      if (asVideo) {
        const meta = await invokeSafe<VideoPreviewResult>('fetch_video_metadata', { url });
        fetched = meta.fetched;
        payload = JSON.stringify({
          url,
          provider: meta.provider || 'youtube',
          title: meta.title,
          thumbnail_asset: meta.thumbnail_asset,
          fetched_at: meta.fetched ? new Date().toISOString() : null,
        });
      } else {
        const preview = await invokeSafe<LinkPreviewResult>('fetch_link_preview', { url });
        fetched = preview.fetched;
        payload = wasVideo
          ? JSON.stringify({
              url,
              provider: parseVideoPayload(before.payload).provider,
              title: preview.title,
              thumbnail_asset: preview.thumbnail_asset,
              fetched_at: preview.fetched ? new Date().toISOString() : null,
            })
          : JSON.stringify({
              url,
              title: preview.title,
              description: preview.description,
              favicon_asset: preview.favicon_asset,
              thumbnail_asset: preview.thumbnail_asset,
              fetched_at: preview.fetched ? new Date().toISOString() : null,
            });
      }

      // The card may have been deleted while the fetch was in flight; writing the payload
      // back would re-create a row an undone paste had removed.
      if (!canvasStore.items.has(itemId)) return;

      const updated = await invokeSafe<Item>('update_item_payload', { itemId, payload });
      canvasStore.upsertItem(updated);
      canvasStore.setFetchStatus(itemId, fetched ? 'ok' : 'failed');
      if (pushUndo) undoStack.push(editItemCommand(itemId, before.payload, payload));
    } catch (error) {
      logError('the preview could not be fetched', error);
      canvasStore.setFetchStatus(itemId, 'failed');
    } finally {
      if (pastePendingItemId === itemId) pastePendingItemId = null;
    }
  }

  /** Open a video in the system browser, re-checking the address parses as http/https. */
  async function openVideo(itemId: number) {
    const item = canvasStore.items.get(itemId);
    if (!item) return;
    const { url } = parseVideoPayload(item.payload);
    const classification = await invokeSafe<UrlClassification>('classify_url', { text: url }).catch(
      () => ({ kind: 'none' }) as UrlClassification,
    );
    if (classification.kind === 'none') {
      logInfo('that video address is not an http address and was not opened');
      return;
    }
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(classification.url);
    } catch (error) {
      logError('the video could not be opened in the system browser', error);
    }
  }

  async function reorder(direction: 'front' | 'back') {
    const ids = [...canvasStore.selection];
    if (ids.length === 0) return;
    const all = canvasStore.orderedPlacements;
    const updates = direction === 'front' ? bringForward(all, ids) : sendBack(all, ids);
    if (updates.length === 0) return;

    const before = updates.map((u) => ({ ...canvasStore.placements.get(u.id)! }));
    const after = before.map((p, i) => ({ ...p, z_order: updates[i].z_order }));

    await guard(async () => {
      await writeNow(
        () =>
          invokeSafe('update_placements', {
            updates: after.map((p) => ({
              id: p.id,
              x: p.x,
              y: p.y,
              width: p.width,
              height: p.height,
              z_order: p.z_order,
            })),
          }),
        saveHooks,
      );
      for (const p of after) canvasStore.patchPlacement(p.id, { z_order: p.z_order });
      undoStack.push(
        updatePlacementsCommand(
          direction === 'front' ? 'Bring To Front' : 'Send To Back',
          before,
          after,
        ),
      );
    });
  }

  /** A finished drag or resize: one queued flush, one transaction, one undo command. */
  async function commitGeometry(before: Placement[], after: Placement[], label: string) {
    for (const p of after) {
      queuePlacementUpdate({
        id: p.id,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        z_order: p.z_order,
      });
    }
    await guard(async () => {
      await flushPlacements(saveHooks);
      undoStack.push(updatePlacementsCommand(label, before, after));
    });
  }

  function changeGeometry(field: 'x' | 'y' | 'width' | 'height', value: number) {
    const before = canvasStore.selectedPlacements.map((p) => ({ ...p }));
    if (before.length === 0) return;
    const after = before.map((p) => ({ ...p, [field]: value }));
    for (const p of after) canvasStore.patchPlacement(p.id, { [field]: value });
    void commitGeometry(before, after, 'Change Size');
  }

  async function commitEdit(placementId: number, title: string, text: string) {
    const placement = canvasStore.placements.get(placementId);
    if (!placement) return;
    const item = canvasStore.itemFor(placement);
    if (!item) return;
    const payload = JSON.stringify({ title, text });
    if (payload === item.payload) return;

    await guard(async () => {
      const updated = await writeNow(
        () => invokeSafe<Item>('update_item_payload', { itemId: item.id, payload }),
        saveHooks,
      );
      canvasStore.upsertItem(updated);
      undoStack.push(editItemCommand(item.id, item.payload, payload));
    });
  }

  // --- image card actions ------------------------------------------------

  /** The single selected card's item, or null. The panel's per-kind groups act on it. */
  function selectedItem(): Item | null {
    if (canvasStore.selection.size !== 1) return null;
    const placement = canvasStore.selectedPlacements[0];
    return placement ? canvasStore.itemFor(placement) : null;
  }

  async function writeItemPayload(item: Item, payload: string) {
    if (payload === item.payload) return;
    const updated = await writeNow(
      () => invokeSafe<Item>('update_item_payload', { itemId: item.id, payload }),
      saveHooks,
    );
    canvasStore.upsertItem(updated);
    undoStack.push(editItemCommand(item.id, item.payload, payload));
  }

  /** The Alt text group, committed on blur. */
  /** The panel's Title group. Keeps the body untouched — only the heading changes. */
  async function commitNoteTitle(title: string) {
    const item = selectedItem();
    if (!item || item.kind !== 'note') return;
    await guard(async () => {
      const payload = parseNotePayload(item.payload);
      await writeItemPayload(item, JSON.stringify({ ...payload, title }));
    });
  }

  /** The image card's caption. Blank text is kept as blank, not removed from the payload. */
  async function commitImageTitle(title: string) {
    const item = selectedItem();
    if (!item || item.kind !== 'image') return;
    const payload = parseImagePayload(item.payload);
    if (payload.title === title) return;
    await guard(async () => {
      await writeItemPayload(item, JSON.stringify({ ...payload, title }));
    });
  }

  /** The checkbox beside it: whether the card draws the caption above the picture. */
  async function commitImageTitleVisible(visible: boolean) {
    const item = selectedItem();
    if (!item || item.kind !== 'image') return;
    const payload = parseImagePayload(item.payload);
    if (payload.title_visible === visible) return;
    await guard(async () => {
      await writeItemPayload(item, JSON.stringify({ ...payload, title_visible: visible }));
    });
  }

  /** The checkbox beside the description: whether the card draws it below the picture. */
  async function commitAltVisible(visible: boolean) {
    const item = selectedItem();
    if (!item || item.kind !== 'image') return;
    const payload = parseImagePayload(item.payload);
    if (payload.alt_visible === visible) return;
    await guard(async () => {
      await writeItemPayload(item, JSON.stringify({ ...payload, alt_visible: visible }));
    });
  }

  async function commitAltText(alt: string) {
    const item = selectedItem();
    if (!item || item.kind !== 'image') return;
    await guard(async () => {
      const payload = parseImagePayload(item.payload);
      await writeItemPayload(item, JSON.stringify({ ...payload, alt }));
    });
  }

  /**
   * Replace: choose one new picture and patch the payload. The alt text is deliberately
   * kept — the card is still about the same thing.
   */
  async function replaceImage() {
    const item = selectedItem();
    if (!item || item.kind !== 'image') return;
    await guard(async () => {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const chosen = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Pictures', extensions: [...IMAGE_EXTENSIONS] }],
      });
      if (chosen === null || Array.isArray(chosen)) return;
      const asset = await invokeSafe<AssetRef>('add_image_from_path', { path: chosen });
      noteAssetPresent(asset.name, asset.byte_size);
      const before = parseImagePayload(item.payload);
      await writeItemPayload(
        item,
        JSON.stringify({
          asset: asset.name,
          natural_width: 0,
          natural_height: 0,
          alt: before.alt,
          alt_visible: before.alt_visible,
          title: before.title,
          title_visible: before.title_visible,
          source_name: chosen.split(/[\\/]/).pop() ?? chosen,
        }),
      );
    });
  }

  /** Show in folder: a WebView cannot reveal a path, so the opener plugin does it. */
  async function showAssetsFolder() {
    try {
      const path = getAssetsFolder();
      if (path === null) return;
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
      await revealItemInDir(path);
    } catch (error) {
      logError('the assets folder could not be revealed', error);
    }
  }

  // --- connection actions ------------------------------------------------

  /** True when a link can be started from the current selection. */
  const canStartLink = $derived(canvasStore.selection.size === 1 && canvasStore.cardCount >= 2);

  function startLinkFromSelection() {
    if (!canStartLink) return;
    beginLink([...canvasStore.selection][0], pointerWorld);
  }

  async function finishLink() {
    if (!canvasStore.pendingLink) return;
    await guard(async () => {
      const created = await completeLink(hitPlacementAt(pointerWorld), saveHooks);
      if (created) undoStack.push(createConnectionCommand(created));
    });
  }

  /**
   * Commit a connection's fields. Everything travels in one `ConnectionEdit`, so the panel's
   * controls and a dragged endpoint handle share this one path and one undo entry.
   */
  async function changeConnection(edit: ConnectionEdit) {
    const before = canvasStore.selectedConnection;
    if (!before) return;
    await guard(async () => {
      await updateConnection(before.id, edit, saveHooks);
      undoStack.push(editConnectionCommand(before.id, connectionEdit(before), edit));
    });
  }

  /**
   * Pin one end of a line to a card side, or set it back to `auto`. It goes through
   * `changeConnection`, so a dragged handle is undone exactly like a panel change — but it
   * names its own connection rather than the selected one, because a handle can be released
   * after the selection has moved on.
   */
  async function changeConnectionAnchor(connectionId: number, end: 'from' | 'to', anchor: string) {
    const before = canvasStore.connections.get(connectionId);
    if (!before) return;
    const edit = connectionEdit(before);
    if (end === 'from') edit.fromAnchor = anchor;
    else edit.toAnchor = anchor;
    await guard(async () => {
      await updateConnection(connectionId, edit, saveHooks);
      undoStack.push(editConnectionCommand(connectionId, connectionEdit(before), edit));
    });
  }

  /**
   * Move, or clear, a line's hand-placed bend. Like an anchor it goes through the one edit
   * command, so a dragged bend and a Straighten Line click share an undo entry shape, and it
   * names its own connection rather than the selected one.
   */
  async function changeConnectionBend(connectionId: number, bend: string) {
    const before = canvasStore.connections.get(connectionId);
    if (!before || before.bend === bend) return;
    const edit = { ...connectionEdit(before), bend };
    await guard(async () => {
      await updateConnection(connectionId, edit, saveHooks);
      undoStack.push(editConnectionCommand(connectionId, connectionEdit(before), edit));
    });
  }

  async function deleteSelectedConnection() {
    const id = canvasStore.selectedConnectionId;
    if (id === null) return;
    await guard(async () => {
      const removed = await deleteConnections([id], saveHooks);
      if (removed.length > 0) undoStack.push(deleteConnectionsCommand(removed));
    });
  }

  // --- keyboard ---------------------------------------------------------

  /**
   * The picker's own small map. A canvas shortcut must not fire when there is no canvas, so
   * with no project open only the Recent grid's four keys are registered. The grid is not a
   * text box, so the dispatcher's `result-up` / `result-down` serve it.
   */
  const pickerShortcuts = {
    'result-up': () => projectsState.move(-1),
    'result-down': () => projectsState.move(1),
    edit: () => {
      const path = projectsState.current();
      if (path) void openProject(path);
    },
    cancel: () => {
      if (newProjectOpen) {
        newProjectOpen = false;
        return;
      }
      projectsState.selectedIndex = -1;
    },
  };

  /**
   * Settings has no canvas, so the canvas keys must not fire on it — the same reasoning that
   * gave the picker its own map. No new Action and no new SHORTCUT_LABELS entry: §11.6's
   * keyboard map prints no key for Settings, and Escape already dispatches as `cancel`.
   */
  const settingsShortcuts = {
    cancel: () => (settingsOpen = false),
  };

  $effect(() => {
    if (canvasStore.project === null) return registerShortcuts(pickerShortcuts);
    if (settingsOpen) return registerShortcuts(settingsShortcuts);
    return registerShortcuts(shellShortcuts);
  });

  const shellShortcuts = $derived({
    'new-note': () => void createNote(pointerWorld),
    'new-image': () => void addFromPicker(),
    edit: () => cards?.editSelected(),
    connect: startLinkFromSelection,
    cancel: () => {
      // Esc is overloaded: close the search popover, cancel a link, close a menu, finish an
      // edit, then clear. The popover goes first because it is the frontmost thing on screen.
      if (searchState.open) {
        searchState.close();
        return;
      }
      if (renamingCanvasId !== null) {
        renamingCanvasId = null;
        return;
      }
      if (deletingCanvasId !== null) {
        deletingCanvasId = null;
        return;
      }
      if (canvasStore.pendingLink) {
        cancelLink();
        return;
      }
      if (openMenu) {
        openMenu = null;
        return;
      }
      if (cards?.cancelEdit()) return;
      if (canvasStore.selectedConnectionId !== null) {
        canvasStore.selectConnection(null);
        return;
      }
      canvasStore.clearSelection();
    },
    delete: () => {
      if (canvasStore.selection.size === 0 && canvasStore.selectedConnectionId !== null) {
        void deleteSelectedConnection();
        return;
      }
      void deleteSelection();
    },
    duplicate: () => void duplicateSelection(),
    copy: () => void copySelection(),
    paste: () => void paste(),
    'select-all': () => canvasStore.selectAll(),
    'zoom-to-fit': () => canvas?.zoomToFit(),
    'bring-forward': () => void reorder('front'),
    'send-back': () => void reorder('back'),
    undo: () => void guard(() => undoStack.undo()),
    redo: () => void guard(() => undoStack.redo()),
  } satisfies Parameters<typeof registerShortcuts>[0]);

  // --- context menus ----------------------------------------------------

  const elementMenu = $derived<MenuEntry[]>([
    {
      kind: 'item',
      label: 'Edit Text',
      glyph: 'note',
      action: 'edit',
      run: () => cards?.editSelected(),
    },
    {
      kind: 'item',
      label: 'Connect From Here',
      glyph: 'flow-arrow',
      action: 'connect',
      available: canStartLink,
      run: startLinkFromSelection,
    },
    {
      kind: 'item',
      label: 'Duplicate',
      glyph: 'copy',
      action: 'duplicate',
      run: () => void duplicateSelection(),
    },
    { kind: 'item', label: 'Copy', glyph: 'copy', action: 'copy', run: () => void copySelection() },
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'Bring To Front',
      glyph: 'arrow-line-up',
      action: 'bring-forward',
      run: () => void reorder('front'),
    },
    {
      kind: 'item',
      label: 'Send To Back',
      glyph: 'arrow-line-down',
      action: 'send-back',
      run: () => void reorder('back'),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'Delete',
      glyph: 'trash',
      action: 'delete',
      destructive: true,
      run: () => void deleteSelection(),
    },
  ]);

  const backgroundMenu = $derived<MenuEntry[]>([
    {
      kind: 'item',
      label: 'New Note Here',
      glyph: 'note',
      action: 'new-note',
      run: () => void createNote(pointerWorld),
    },
    {
      kind: 'item',
      label: 'Add Image…',
      glyph: 'image',
      action: 'new-image',
      run: () => void addFromPicker(),
    },
    {
      kind: 'item',
      label: 'Paste',
      glyph: 'copy',
      action: 'paste',
      // Always available: an address or a picture on the system clipboard is pasteable
      // even when the application's own card clipboard is empty.
      run: () => void paste(),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'Select All',
      glyph: 'cursor',
      action: 'select-all',
      run: () => canvasStore.selectAll(),
    },
    {
      kind: 'item',
      label: 'Zoom To Fit',
      glyph: 'corners-out',
      action: 'zoom-to-fit',
      run: () => canvas?.zoomToFit(),
    },
    {
      kind: 'item',
      label: 'Reset Zoom',
      glyph: 'magnifying-glass',
      action: 'reset-zoom',
      run: () => canvas?.resetZoom(),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'Background',
      glyph: 'square-half',
      action: 'cancel',
      shortcutLabel: '',
      available: false,
    },
  ]);

  const canvasMenu = $derived<MenuEntry[]>([
    {
      kind: 'item',
      label: 'Rename',
      glyph: 'note',
      action: 'edit',
      // The row becomes a text box; there is no key for it, so no key is printed.
      shortcutLabel: '',
      run: () => {
        if (menuCanvasId !== null) renamingCanvasId = menuCanvasId;
      },
    },
    {
      kind: 'item',
      label: 'Delete Canvas',
      glyph: 'trash',
      action: 'delete',
      destructive: true,
      // A project with no canvas has no drawn state, so the last one cannot go.
      available: canvasStore.canvases.length > 1,
      run: () => {
        if (menuCanvasId !== null) void openDeleteCanvasConfirm(menuCanvasId);
      },
    },
  ]);

  function openCanvasMenu(event: MouseEvent, canvasId: number) {
    event.preventDefault();
    event.stopPropagation();
    menuCanvasId = canvasId;
    openMenu = { kind: 'canvas', x: event.clientX, y: event.clientY, canvasId };
  }

  function openElementMenu(event: MouseEvent, placementId: number) {
    event.preventDefault();
    event.stopPropagation();
    // Right-clicking a card selects it first, so the panel fills in behind the menu.
    if (!canvasStore.isSelected(placementId)) canvasStore.setSelection([placementId]);
    openMenu = { kind: 'element', x: event.clientX, y: event.clientY };
  }

  function openBackgroundMenu(event: MouseEvent) {
    openMenu = { kind: 'background', x: event.clientX, y: event.clientY };
  }

  // --- window -----------------------------------------------------------

  async function windowAction(action: 'minimize' | 'toggleMaximize' | 'close') {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      if (action === 'close') {
        // The close write must complete before the process exits.
        await flushPlacements(saveHooks);
        persistView.flush();
      }
      await win[action]();
    } catch (error) {
      logError(`the window could not ${action}`, error);
    }
  }
</script>

<svelte:window
  bind:innerWidth={windowWidth}
  onblur={() => void flushPlacements(saveHooks)}
  onpointerup={() => void finishLink()}
/>

<div class="app" onclickcapture={() => (openMenu = null)} role="presentation">
  <TitleBar
    {folderPath}
    pickerMode={canvasStore.project === null}
    onMinimize={() => void windowAction('minimize')}
    onMaximize={() => void windowAction('toggleMaximize')}
    onClose={() => void windowAction('close')}
  />

  {#if canvasStore.project === null}
    <ProjectPicker
      recents={projectsState.recents}
      selectedIndex={projectsState.selectedIndex}
      failure={projectsState.failure}
      onOpenPath={(path) => void openProject(path)}
      onChooseFolder={() => void chooseProjectFolder()}
      onNewProject={() => void openNewProjectDialog()}
      onSelect={(index) => (projectsState.selectedIndex = index)}
    />
  {:else}
    <div class="body">
      <!-- The two snippets are how the left column renders a feature it may not import. -->
      <LeftColumn
        undoDepth={undoStack.undoDepth}
        redoDepth={undoStack.redoDepth}
        onNewNote={() => void createNote(pointerWorld)}
        onNewImage={() => void addFromPicker()}
        onUndo={() => void guard(() => undoStack.undo())}
        onRedo={() => void guard(() => undoStack.redo())}
        onCloseProject={() => void closeProject()}
        onSettings={() => (settingsOpen = true)}
        settingsActive={settingsOpen}
      >
        {#snippet search()}
          <SearchBox
            query={searchState.query}
            onType={(next) => searchState.type(next)}
            onMove={(delta) => searchState.move(delta)}
            onOpen={() => {
              const result = searchState.current();
              if (result) void openResult(result);
            }}
            onClose={() => searchState.close()}
            onClear={() => searchState.clear()}
          />
        {/snippet}
        {#snippet canvases()}
          <CanvasList
            renamingId={renamingCanvasId}
            onSelectCanvas={(id) => void switchCanvas(id)}
            onCreateCanvas={() => void newCanvas()}
            onBeginRename={(id) => (renamingCanvasId = id)}
            onCommitRename={(id, name) => void commitCanvasRename(id, name)}
            onCancelRename={() => (renamingCanvasId = null)}
            onOpenMenu={openCanvasMenu}
          />
        {/snippet}
      </LeftColumn>

      <!-- §9.11: the Settings page replaces the canvas, the empty state, the drop target
           and the properties panel. The title bar and the left column stay. -->
      {#if settingsOpen}
        <SettingsPage {folderPath} onBack={() => (settingsOpen = false)} />
      {:else}
        <CanvasSurface
          bind:this={canvas}
          onViewSettled={persistView}
          onMarqueeEnd={applyMarquee}
          onBackgroundClick={() => {
            canvasStore.selectConnection(null);
            canvasStore.clearSelection();
          }}
          onOpenBackgroundMenu={openBackgroundMenu}
          onPointerWorld={(point) => {
            pointerWorld = point;
            trackLink(point);
          }}
        >
          <!-- Before the card layer in DOM order, so cards always paint over lines. -->
          <ConnectionLayer
            onSelect={(id) => canvasStore.selectConnection(id)}
            onAnchorChange={(id, end, anchor) => void changeConnectionAnchor(id, end, anchor)}
            onBendChange={(id, bend) => void changeConnectionBend(id, bend)}
          />
          <ConnectionLabels />

          <CardLayer
            bind:this={cards}
            onGeometryCommitted={(before, after, label) =>
              void commitGeometry(before, after, label)}
            onOpenElementMenu={openElementMenu}
            onCommitEdit={(id, title, text) => void commitEdit(id, title, text)}
            onSelect={selectCard}
            onConnectFrom={(placementId) => beginLink(placementId, pointerWorld)}
            onImageDecoded={(itemId, width, height) => void recordImageSize(itemId, width, height)}
            onRefetch={(itemId) => void fetchPreview(itemId, true)}
            onOpenVideo={(itemId) => void openVideo(itemId)}
            {pastePendingItemId}
          />
        </CanvasSurface>

        {#if canvasStore.cardCount === 0 && !dragOver}
          <EmptyCanvas onNewNote={() => void createNote(pointerWorld)} />
        {/if}

        {#if dragOver}
          <DropTarget />
        {/if}

        <PropertiesPanel
          expanded={panelExpanded}
          onToggle={() => (panelOpen = !panelOpen)}
          onGeometryChange={changeGeometry}
          onBringForward={() => void reorder('front')}
          onSendBack={() => void reorder('back')}
          onDuplicate={() => void duplicateSelection()}
          onDelete={() => void deleteSelection()}
          onConnectionChange={(edit) => void changeConnection(edit)}
          onDeleteConnection={() => void deleteSelectedConnection()}
          onAltTextChange={(alt) => void commitAltText(alt)}
          onAltVisibleChange={(visible) => void commitAltVisible(visible)}
          onImageTitleChange={(title) => void commitImageTitle(title)}
          onImageTitleVisibleChange={(visible) => void commitImageTitleVisible(visible)}
          onNoteTitleChange={(title) => void commitNoteTitle(title)}
          onReplaceImage={() => void replaceImage()}
          onShowInFolder={() => void showAssetsFolder()}
          onRefetch={() => {
            const item = selectedItem();
            if (item) void fetchPreview(item.id, true);
          }}
        />
      {/if}
    </div>
  {/if}

  {#if searchState.open && canvasStore.project !== null}
    <!-- Over the canvas, and selecting nothing, so the properties panel stays collapsed. -->
    <SearchResults
      results={searchState.results}
      query={searchState.query}
      highlighted={searchState.highlighted}
      onOpenCanvas={(hit) => void openResult({ kind: 'canvas', hit })}
      onOpenCard={(hit) => void openResult({ kind: 'card', hit })}
    />
  {/if}

  {#if deletingCanvasId !== null}
    <DeleteCanvasDialog
      name={canvasStore.canvases.find((c) => c.id === deletingCanvasId)?.name ?? ''}
      cardCount={canvasStore.cardCount}
      onConfirm={() => void confirmDeleteCanvas(deletingCanvasId!)}
      onCancel={() => (deletingCanvasId = null)}
    />
  {/if}

  {#if newProjectOpen}
    <NewProjectDialog
      parentPath={newProjectParent}
      failure={newProjectFailure}
      busy={newProjectBusy}
      onCreate={(name) => void createProject(name)}
      onChooseParent={async () => {
        const picked = await projectsState.chooseFolder(newProjectParent);
        if (picked) newProjectParent = picked;
      }}
      onCancel={() => (newProjectOpen = false)}
    />
  {/if}

  {#if errorMessage}
    <p class="error" role="status">{errorMessage}</p>
  {/if}

  {#if openMenu}
    <ContextMenu
      x={openMenu.x}
      y={openMenu.y}
      width={openMenu.kind === 'element'
        ? ELEMENT_MENU_WIDTH
        : openMenu.kind === 'canvas'
          ? CANVAS_MENU_WIDTH
          : BACKGROUND_MENU_WIDTH}
      entries={openMenu.kind === 'element'
        ? elementMenu
        : openMenu.kind === 'canvas'
          ? canvasMenu
          : backgroundMenu}
      onClose={() => (openMenu = null)}
    />
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-body);
    overflow: hidden;
  }

  .body {
    flex: 1;
    display: flex;
    min-height: 0;
    position: relative;
  }

  .error {
    margin: 0;
    padding: var(--space-6) var(--space-14);
    background: var(--color-accent-2-tint-fill);
    color: var(--color-accent-2-tint-text);
    font-size: var(--text-11-5);
  }
</style>
