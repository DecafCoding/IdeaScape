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
  import PerfOverlay from './features/canvas/PerfOverlay.svelte';
  import CardLayer from './features/cards/CardLayer.svelte';
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
    createCardCommand,
    createConnectionCommand,
    deleteCardsCommand,
    deleteConnectionsCommand,
    duplicateCommand,
    editConnectionCommand,
    editItemCommand,
    updatePlacementsCommand,
  } from './features/undo/commands';
  import { canvasStore } from './stores/canvasStore.svelte';
  import { invokeSafe, IpcError } from './lib/ipc';
  import { registerShortcuts } from './lib/shortcuts';
  import { debounce, flushPlacements, queuePlacementUpdate, writeNow } from './lib/save';
  import { runPass } from './lib/perfGate';
  import { logError, logInfo } from './lib/logger';
  import {
    BACKGROUND_MENU_WIDTH,
    ELEMENT_MENU_WIDTH,
    type MenuEntry,
    type OpenMenu,
  } from './lib/menu';
  import type { Point } from './lib/geometry';
  import {
    parseNotePayload,
    type DeleteEffect,
    type Item,
    type Placement,
    type PlacementWithItem,
  } from './lib/types';

  const NEW_NOTE_WIDTH = 236;
  const NEW_NOTE_HEIGHT = 150;
  const DUPLICATE_OFFSET = 22;
  /** Below this window width the fixed chrome leaves no canvas, so the panel must collapse. */
  const PANEL_AUTO_COLLAPSE_WIDTH = 420;

  /**
   * True in a debug build. It is discovered by asking for a command that only a debug
   * build registers, rather than read from import.meta.env — `tauri build --debug` still
   * builds the front end in production mode, so the bundle's own DEV flag is false there
   * and would hide the overlay in exactly the build the gate is measured on.
   */
  let isDevelopment = $state(false);

  let folderPath = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let panelOpen = $state(false);
  let windowWidth = $state(typeof window === 'undefined' ? 1180 : window.innerWidth);
  let openMenu = $state<OpenMenu | null>(null);
  let pointerWorld = $state<Point>({ x: 0, y: 0 });
  /** Cards copied with Ctrl+C, held in the application rather than the system clipboard. */
  let clipboard = $state<PlacementWithItem[]>([]);

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

  $effect(() => {
    void guard(async () => {
      folderPath = await invokeSafe<string>('dev_project_path');
      await canvasStore.openProject(folderPath);
      await maybeRunPerfGate();
    });
  });

  /**
   * Task 21's measurement, run inside the real window when the binary is launched with
   * `--perf-gate`. It seeds 250 note cards, pans continuously at 100% and again at 40%,
   * and records the result so an automated check can assert on a number that was actually
   * measured in the running application.
   */
  async function maybeRunPerfGate() {
    // A release build does not register this command, so this is also how the front end
    // learns it is running in a debug build.
    const wanted = await invokeSafe<boolean>('perf_gate_requested').catch(() => null);
    if (wanted === null) return;
    isDevelopment = true;
    if (!wanted) return;

    const canvasId = canvasStore.activeCanvasId;
    if (canvasId === null) return;

    if (canvasStore.cardCount < 250) {
      await invokeSafe('seed_note_cards', { canvasId, count: 250 - canvasStore.cardCount });
      await canvasStore.loadCanvas(canvasId);
    }

    const passes = [];
    for (const [label, zoom] of [
      ['100% zoom', 1],
      ['40% zoom', 0.4],
    ] as const) {
      passes.push(await runPass(label, zoom, 30_000, (view) => canvasStore.setView(view)));
    }

    const path = await invokeSafe<string>('record_perf_result', {
      json: JSON.stringify({ startedAt: new Date().toISOString(), passes }, null, 2),
    });
    logInfo(`the performance gate result was written to ${path}`);
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    // destroy, not close: close() is preventable and the harness must always exit.
    await getCurrentWindow().destroy();
  }

  const persistView = debounce(() => {
    const canvasId = canvasStore.activeCanvasId;
    if (canvasId === null) return;
    void invokeSafe('update_canvas_view', {
      canvasId,
      viewX: canvasStore.view.x,
      viewY: canvasStore.view.y,
      viewZoom: canvasStore.view.zoom,
    }).catch((error) => logError('the canvas view could not be saved', error));
  }, 400);

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

  async function paste() {
    if (clipboard.length > 0) {
      await copyCards(clipboard, pointerWorld);
      return;
    }
    // Address-shaped and image clipboard content becomes its own card kind in Phase 3;
    // until then everything pasted lands in a note.
    let text = '';
    try {
      text = (await navigator.clipboard?.readText()) ?? '';
    } catch (error) {
      logError('the system clipboard could not be read', error);
      return;
    }
    if (!text.trim()) return;

    const canvasId = canvasStore.activeCanvasId;
    if (canvasId === null) return;
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

  async function changeConnection(label: string | null, directed: number) {
    const before = canvasStore.selectedConnection;
    if (!before) return;
    await guard(async () => {
      await updateConnection(before.id, label, directed, saveHooks);
      undoStack.push(
        editConnectionCommand(
          before.id,
          { label: before.label, directed: before.directed },
          { label, directed },
        ),
      );
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

  $effect(() =>
    registerShortcuts({
      'new-note': () => void createNote(pointerWorld),
      edit: () => cards?.editSelected(),
      connect: startLinkFromSelection,
      cancel: () => {
        // Esc is overloaded: cancel a link, close a menu, finish an edit, then clear.
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
      undo: () => void undoStack.undo(),
      redo: () => void undoStack.redo(),
    }),
  );

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
    { kind: 'item', label: 'Add Image…', glyph: 'image', action: 'new-image', available: false },
    {
      kind: 'item',
      label: 'Paste',
      glyph: 'copy',
      action: 'paste',
      available: clipboard.length > 0,
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
    onMinimize={() => void windowAction('minimize')}
    onMaximize={() => void windowAction('toggleMaximize')}
    onClose={() => void windowAction('close')}
  />

  <div class="body">
    <LeftColumn
      undoDepth={undoStack.undoDepth}
      redoDepth={undoStack.redoDepth}
      onNewNote={() => void createNote(pointerWorld)}
      onUndo={() => void undoStack.undo()}
      onRedo={() => void undoStack.redo()}
      onSelectCanvas={(id) => void guard(() => canvasStore.loadCanvas(id))}
    />

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
      <ConnectionLayer onSelect={(id) => canvasStore.selectConnection(id)} />
      <ConnectionLabels />

      <CardLayer
        bind:this={cards}
        onGeometryCommitted={(before, after, label) => void commitGeometry(before, after, label)}
        onOpenElementMenu={openElementMenu}
        onCommitEdit={(id, title, text) => void commitEdit(id, title, text)}
        onSelect={selectCard}
        onConnectFrom={(placementId) => beginLink(placementId, pointerWorld)}
      />
    </CanvasSurface>

    {#if canvasStore.cardCount === 0}
      <EmptyCanvas onNewNote={() => void createNote(pointerWorld)} />
    {/if}

    <PropertiesPanel
      expanded={panelExpanded}
      onToggle={() => (panelOpen = !panelOpen)}
      onGeometryChange={changeGeometry}
      onBringForward={() => void reorder('front')}
      onSendBack={() => void reorder('back')}
      onDuplicate={() => void duplicateSelection()}
      onDelete={() => void deleteSelection()}
      onConnectionChange={(label, directed) => void changeConnection(label, directed)}
      onDeleteConnection={() => void deleteSelectedConnection()}
    />
  </div>

  {#if errorMessage}
    <p class="error" role="status">{errorMessage}</p>
  {/if}

  {#if isDevelopment}
    <PerfOverlay />
  {/if}

  {#if openMenu}
    <ContextMenu
      x={openMenu.x}
      y={openMenu.y}
      width={openMenu.kind === 'element' ? ELEMENT_MENU_WIDTH : BACKGROUND_MENU_WIDTH}
      entries={openMenu.kind === 'element' ? elementMenu : backgroundMenu}
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
    background: var(--color-accent-2-100);
    color: var(--color-accent-2-700);
    font-size: var(--text-11-5);
  }
</style>
