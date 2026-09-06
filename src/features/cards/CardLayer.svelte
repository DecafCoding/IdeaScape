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
  import { canvasStore } from '../../stores/canvasStore.svelte';
  import { cullWithCounts, recordCullCounts } from '../../lib/culling';
  import { resizeRect, snapToGrid, type ResizeHandle } from '../../lib/geometry';
  import { getSettings } from '../../lib/settings';
  import { parseNotePayload, type Placement } from '../../lib/types';

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
  }

  const { onGeometryCommitted, onOpenElementMenu, onCommitEdit, onSelect, onConnectFrom }: Props =
    $props();

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
          <div class="note-hit" role="presentation" ondblclick={() => startEditing(placement.id)}>
            <NoteCard
              title={payload.title}
              text={payload.text}
              selected={canvasStore.isSelected(placement.id)}
              zoom={canvasStore.view.zoom}
            />
          </div>
        {/if}
      {/if}
    </CardShell>
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
</style>
