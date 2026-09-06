<!--
  The card layer. It renders ONLY the placements culling says belong in the page — that is
  the product's whole performance promise — keyed by placement id so Svelte moves nodes
  rather than rebuilding them.

  It also owns the pointer paths a card responds to: dragging the selection, resizing from
  a handle, and opening the element context menu. Writes are deferred until the pointer is
  released; during the gesture only the store is touched.
-->
<script lang="ts">
  import CardShell from './CardShell.svelte';
  import NoteCard from './NoteCard.svelte';
  import NoteEditor from './NoteEditor.svelte';
  import ImageCard from './ImageCard.svelte';
  import LinkCard from './LinkCard.svelte';
  import VideoCard from './VideoCard.svelte';
  import { canvasStore } from '../../stores/canvasStore.svelte';
  import { assetStatus } from '../../lib/assets';
  import { cullWithCounts, recordCullCounts } from '../../lib/culling';
  import { resizeRect, snapToGrid, type ResizeHandle } from '../../lib/geometry';
  import { getSettings } from '../../lib/settings.svelte';
  import {
    parseImagePayload,
    parseLinkPayload,
    parseNotePayload,
    parseVideoPayload,
    type Placement,
  } from '../../lib/types';

  interface Props {
    /** Called once when a move or resize gesture ends, with the rows that changed. */
    onGeometryCommitted: (before: Placement[], after: Placement[], label: string) => void;
    onOpenElementMenu: (event: MouseEvent, placementId: number) => void;
    onCommitEdit: (placementId: number, title: string, text: string) => void;
    /**
     * Raised when a card is pressed. Selection is the selection feature's business, and a
     * feature may not import another feature — so the composition root decides what a
     * press means and this layer only reports it.
     */
    onSelect: (placementId: number, toggle: boolean) => void;
    /**
     * A press on a card under the Connect tool. Drawing the line belongs to the connections
     * feature, which this layer may not import, so the composition root wires it.
     */
    onConnectFrom: (placementId: number, event: PointerEvent) => void;
    /**
     * An image the page has just decoded, reporting its real dimensions. The root patches
     * them back through `update_image_dimensions` — this layer never writes.
     */
    onImageDecoded?: (itemId: number, naturalWidth: number, naturalHeight: number) => void;
    /** A link or video card asking for its preview to be fetched again. */
    onRefetch?: (itemId: number) => void;
    /** A stationary click on a video card: open the address in the system browser. */
    onOpenVideo?: (itemId: number) => void;
    /** The item just pasted, which carries the §9.7 caption under its card while fetching. */
    pastePendingItemId?: number | null;
  }

  const {
    onGeometryCommitted,
    onOpenElementMenu,
    onCommitEdit,
    onSelect,
    onConnectFrom,
    onImageDecoded,
    onRefetch,
    onOpenVideo,
    pastePendingItemId = null,
  }: Props = $props();

  const alwaysVisible = $derived(
    new Set(canvasStore.editingPlacementId === null ? [] : [canvasStore.editingPlacementId]),
  );

  const cull = $derived(
    cullWithCounts(
      canvasStore.orderedPlacements,
      canvasStore.view,
      canvasStore.viewportSize,
      undefined,
      alwaysVisible,
    ),
  );

  $effect(() => recordCullCounts(cull.total, cull.drawn));

  // --- gesture state ----------------------------------------------------

  type Gesture =
    | { kind: 'move'; startX: number; startY: number; before: Placement[] }
    | { kind: 'resize'; handle: ResizeHandle; startX: number; startY: number; before: Placement[] };

  let gesture: Gesture | null = $state(null);
  let draggingIds = $state(new Set<number>());

  /** A live copy of the edited note, so a keystroke does not hit the database. */
  let draft = $state<{ title: string; text: string } | null>(null);

  function snapshot(ids: Iterable<number>): Placement[] {
    return [...ids]
      .map((id) => canvasStore.placements.get(id))
      .filter((p): p is Placement => p !== undefined)
      .map((p) => ({ ...p }));
  }

  function beginMove(event: PointerEvent, placement: Placement) {
    if (event.button !== 0) return;
    if (canvasStore.editingPlacementId === placement.id) return;

    // Under the Connect tool a press on a card starts a link, never a move.
    if (canvasStore.activeTool === 'connect') {
      event.stopPropagation();
      onConnectFrom(placement.id, event);
      return;
    }

    onSelect(placement.id, event.ctrlKey || event.shiftKey || event.metaKey);
    if (!canvasStore.isSelected(placement.id)) return;

    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    draggingIds = new Set(canvasStore.selection);
    gesture = {
      kind: 'move',
      startX: event.clientX,
      startY: event.clientY,
      before: snapshot(draggingIds),
    };
  }

  function beginResize(handle: ResizeHandle, event: PointerEvent, placement: Placement) {
    if (event.button !== 0) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    draggingIds = new Set([placement.id]);
    gesture = {
      kind: 'resize',
      handle,
      startX: event.clientX,
      startY: event.clientY,
      before: snapshot(draggingIds),
    };
  }

  function onPointerMove(event: PointerEvent) {
    if (!gesture) return;
    // Convert the pointer delta into world units, or cards drift from the cursor at any
    // zoom but 100%.
    const zoom = canvasStore.view.zoom;
    const dx = (event.clientX - gesture.startX) / zoom;
    const dy = (event.clientY - gesture.startY) / zoom;
    const snap = getSettings().snapToGrid;

    if (gesture.kind === 'move') {
      for (const original of gesture.before) {
        const x = original.x + dx;
        const y = original.y + dy;
        canvasStore.patchPlacement(original.id, {
          x: snap ? snapToGrid(x) : x,
          y: snap ? snapToGrid(y) : y,
        });
      }
      return;
    }

    const original = gesture.before[0];
    if (!original) return;
    const next = resizeRect(original, gesture.handle, dx, dy);
    canvasStore.patchPlacement(original.id, next);
  }

  function onPointerUp() {
    if (!gesture) return;
    const { before, kind } = gesture;
    gesture = null;
    draggingIds = new Set();

    const after = snapshot(before.map((p) => p.id));
    const changed = after.some((a, i) => {
      const b = before[i];
      return a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height;
    });
    if (changed) {
      onGeometryCommitted(before, after, kind === 'move' ? 'Move Cards' : 'Resize Card');
    }
  }

  function startEditing(placementId: number) {
    const placement = canvasStore.placements.get(placementId);
    if (!placement) return;
    const item = canvasStore.itemFor(placement);
    if (!item || item.kind !== 'note') return;
    draft = parseNotePayload(item.payload);
    canvasStore.editingPlacementId = placementId;
  }

  function commitEdit() {
    const id = canvasStore.editingPlacementId;
    if (id === null || !draft) return;
    onCommitEdit(id, draft.title, draft.text);
    canvasStore.editingPlacementId = null;
    draft = null;
  }

  // Enter opens the editor on the single selected card; the surface owns the key event and
  // calls in through this exported handle.
  export function editSelected() {
    if (canvasStore.selection.size !== 1) return;
    startEditing([...canvasStore.selection][0]);
  }

  export function cancelEdit() {
    if (canvasStore.editingPlacementId === null) return false;
    commitEdit();
    return true;
  }
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<div class="card-layer" data-testid="card-layer" data-drawn={cull.drawn} data-total={cull.total}>
  {#each cull.visible as placement (placement.id)}
    {@const item = canvasStore.itemFor(placement)}
    {@const editing = canvasStore.editingPlacementId === placement.id}
    <CardShell
      {placement}
      selected={canvasStore.isSelected(placement.id)}
      dragging={draggingIds.has(placement.id)}
      {editing}
      onPointerDown={(event) => beginMove(event, placement)}
      onContextMenu={(event) => onOpenElementMenu(event, placement.id)}
      onResizeStart={(handle, event) => beginResize(handle, event, placement)}
      onDoubleClick={item?.kind === 'note' ? () => startEditing(placement.id) : undefined}
    >
      {#if item && item.kind === 'note'}
        {#if editing && draft}
          <NoteEditor
            title={draft.title}
            text={draft.text}
            onChange={(next) => (draft = next)}
            onCommit={commitEdit}
          />
        {:else}
          {@const payload = parseNotePayload(item.payload)}
          <!-- Fills the shell so the rendered note keeps its height. The double-click that
               opens the editor is on the shell itself, not here — see CardShell's
               `onDoubleClick`. -->
          <div class="note-hit">
            <NoteCard
              title={payload.title}
              text={payload.text}
              selected={canvasStore.isSelected(placement.id)}
              zoom={canvasStore.view.zoom}
            />
          </div>
        {/if}
      {:else if item && item.kind === 'image'}
        {@const payload = parseImagePayload(item.payload)}
        <ImageCard
          {payload}
          missing={payload.asset !== null && !assetStatus(payload.asset).exists}
          zoom={canvasStore.view.zoom}
          width={placement.width}
          onDecoded={(w, h) => onImageDecoded?.(item.id, w, h)}
        />
      {:else if item && item.kind === 'link'}
        <LinkCard
          payload={parseLinkPayload(item.payload)}
          status={canvasStore.fetchStatusFor(item.id)}
          zoom={canvasStore.view.zoom}
          onRefetch={() => onRefetch?.(item.id)}
        />
      {:else if item && item.kind === 'video'}
        <VideoCard
          payload={parseVideoPayload(item.payload)}
          zoom={canvasStore.view.zoom}
          onOpen={() => onOpenVideo?.(item.id)}
        />
      {/if}
    </CardShell>

    <!-- §9.7: the paste caption sits under the card, outside the shell, and goes as soon
         as the fetch settles. -->
    {#if item && item.id === pastePendingItemId && canvasStore.fetchStatusFor(item.id) === 'fetching'}
      <p
        class="paste-caption"
        data-testid="paste-caption"
        style="left: {placement.x}px; top: {placement.y + placement.height + 4}px;"
      >
        Pasted here · Ctrl+V
      </p>
    {/if}
  {/each}
</div>

<style>
  .card-layer {
    position: absolute;
    inset: 0;
    z-index: var(--z-cards);
  }

  .note-hit {
    height: 100%;
  }

  .paste-caption {
    position: absolute;
    margin: 0;
    font-size: var(--text-11);
    opacity: 0.4;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
