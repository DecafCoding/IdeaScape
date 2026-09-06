<!--
  The canvas surface. One absolutely positioned world layer carries the single CSS transform
  everything on the canvas shares (rendering-approach); the dot grid tracks it, and the zoom
  bar floats over it.

  Panning and wheel zooming are untransitioned — 0 ms, always. The motion table puts them
  there deliberately: any easing on a gesture that follows the pointer reads as lag and
  fights the 60 fps gate. Only the zoom buttons, Zoom To Fit and Reset Zoom ease.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import DotGrid from './DotGrid.svelte';
  import ZoomBar from './ZoomBar.svelte';
  import Marquee from './Marquee.svelte';
  import { canvasStore } from '../../stores/canvasStore.svelte';
  import {
    boundingRect,
    clampZoom,
    rectFromCorners,
    screenToWorld,
    worldToScreen,
    ZOOM_STEP,
    type Point,
    type Rect,
  } from '../../lib/geometry';
  import { getSettings } from '../../lib/settings.svelte';

  interface Props {
    onViewSettled: () => void;
    /**
     * A finished selection band, in world units. Applying it belongs to the selection
     * feature, which this one may not import, so the composition root does it.
     */
    onMarqueeEnd: (band: Rect, additive: boolean) => void;
    /** A click on the empty background, which clears the selection. */
    onBackgroundClick: () => void;
    onOpenBackgroundMenu: (event: MouseEvent) => void;
    /** The last pointer position in world units, so N and Paste create where the pointer is. */
    onPointerWorld: (point: Point) => void;
    children: Snippet;
  }

  const {
    onViewSettled,
    onMarqueeEnd,
    onBackgroundClick,
    onOpenBackgroundMenu,
    onPointerWorld,
    children,
  }: Props = $props();

  let surface: HTMLDivElement | null = $state(null);
  let eased = $state(false);

  type Gesture =
    | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
    | { kind: 'marquee'; origin: Point; additive: boolean };

  let gesture: Gesture | null = $state(null);
  let band = $state<Rect | null>(null);

  // Keep the store's idea of the viewport in step with the real element, because culling
  // is computed from it.
  $effect(() => {
    if (!surface) return;
    const observer = new ResizeObserver(([entry]) => {
      canvasStore.setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(surface);
    return () => observer.disconnect();
  });

  function localPoint(event: PointerEvent | MouseEvent): Point {
    const rect = surface?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    surface?.setPointerCapture(event.pointerId);
    eased = false;

    // The Pan tool always pans; the Select tool pans only from the empty background,
    // which is where this handler runs.
    const panning = canvasStore.activeTool === 'pan';
    if (panning) {
      gesture = {
        kind: 'pan',
        startX: event.clientX,
        startY: event.clientY,
        originX: canvasStore.view.x,
        originY: canvasStore.view.y,
      };
      return;
    }

    // Under the Connect tool a background press is a link that will miss, never a marquee.
    if (canvasStore.activeTool === 'connect') {
      gesture = null;
      band = null;
      return;
    }

    // A drag on the empty background draws the selection band.
    gesture = {
      kind: 'marquee',
      origin: localPoint(event),
      additive: event.ctrlKey || event.shiftKey,
    };
    band = null;
  }

  function onPointerMove(event: PointerEvent) {
    const local = localPoint(event);
    onPointerWorld(screenToWorld(local, canvasStore.view));

    if (!gesture) return;
    if (gesture.kind === 'pan') {
      canvasStore.setView({
        x: gesture.originX + (event.clientX - gesture.startX),
        y: gesture.originY + (event.clientY - gesture.startY),
      });
      return;
    }
    band = rectFromCorners(gesture.origin, local);
  }

  function onPointerUp() {
    if (!gesture) return;
    if (gesture.kind === 'pan') {
      gesture = null;
      onViewSettled();
      return;
    }

    if (band && (band.width > 2 || band.height > 2)) {
      const topLeft = screenToWorld({ x: band.x, y: band.y }, canvasStore.view);
      const bottomRight = screenToWorld(
        { x: band.x + band.width, y: band.y + band.height },
        canvasStore.view,
      );
      onMarqueeEnd(rectFromCorners(topLeft, bottomRight), gesture.additive);
    } else {
      onBackgroundClick();
    }
    gesture = null;
    band = null;
  }

  /** Zoom about a screen point, so the world under the pointer stays under the pointer. */
  function zoomAbout(nextZoom: number, anchor: Point) {
    const zoom = clampZoom(nextZoom);
    const world = screenToWorld(anchor, canvasStore.view);
    canvasStore.setView({
      zoom,
      x: anchor.x - world.x * zoom,
      y: anchor.y - world.y * zoom,
    });
  }

  function onWheel(event: WheelEvent) {
    const wantsCtrl = getSettings().zoomWith === 'ctrl-scroll';
    if (wantsCtrl !== event.ctrlKey) return;
    event.preventDefault();
    eased = false;
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAbout(canvasStore.view.zoom * factor, localPoint(event as unknown as PointerEvent));
    onViewSettled();
  }

  function centre(): Point {
    return {
      x: canvasStore.viewportSize.width / 2,
      y: canvasStore.viewportSize.height / 2,
    };
  }

  function stepZoom(direction: 1 | -1) {
    eased = true;
    zoomAbout(canvasStore.view.zoom + direction * ZOOM_STEP, centre());
    onViewSettled();
  }

  const contentBounds = $derived(
    boundingRect(
      canvasStore.orderedPlacements.map((p) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
      })),
    ),
  );

  /** True when the current view already holds everything, which dims Zoom To Fit. */
  const fitsAlready = $derived.by(() => {
    if (!contentBounds) return true;
    const topLeft = worldToScreen({ x: contentBounds.x, y: contentBounds.y }, canvasStore.view);
    const bottomRight = worldToScreen(
      { x: contentBounds.x + contentBounds.width, y: contentBounds.y + contentBounds.height },
      canvasStore.view,
    );
    return (
      topLeft.x >= 0 &&
      topLeft.y >= 0 &&
      bottomRight.x <= canvasStore.viewportSize.width &&
      bottomRight.y <= canvasStore.viewportSize.height
    );
  });

  export function zoomToFit() {
    const bounds = contentBounds;
    const { width, height } = canvasStore.viewportSize;
    if (!bounds || width === 0 || height === 0) return;
    eased = true;
    const padding = 48;
    const zoom = clampZoom(
      Math.min((width - padding * 2) / bounds.width, (height - padding * 2) / bounds.height),
    );
    canvasStore.setView({
      zoom,
      x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
    });
    onViewSettled();
  }

  /**
   * Put `rect`'s centre at the viewport centre at the current zoom, easing there like any other
   * programmatic view change and persisting the result — a search result opened on another
   * canvas has to leave the view where the user can see it, and saved.
   */
  export function centreOn(rect: Rect) {
    const { width, height } = canvasStore.viewportSize;
    if (width === 0 || height === 0) return;
    eased = true;
    const zoom = canvasStore.view.zoom;
    canvasStore.setView({
      zoom,
      x: width / 2 - (rect.x + rect.width / 2) * zoom,
      y: height / 2 - (rect.y + rect.height / 2) * zoom,
    });
    onViewSettled();
  }

  export function resetZoom() {
    eased = true;
    zoomAbout(1, centre());
    onViewSettled();
  }

  export function pointerWorld(): Point {
    return screenToWorld(centre(), canvasStore.view);
  }
</script>

<div
  bind:this={surface}
  class="surface"
  class:panning={canvasStore.activeTool === 'pan'}
  class:connecting={canvasStore.activeTool === 'connect'}
  data-testid="canvas-surface"
  role="application"
  aria-label="Canvas"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onwheel={onWheel}
  oncontextmenu={(event) => {
    event.preventDefault();
    if (event.target === surface) onOpenBackgroundMenu(event);
  }}
>
  <DotGrid view={canvasStore.view} />

  <div
    class="world"
    class:eased
    data-testid="canvas-world"
    style="transform: translate({canvasStore.view.x}px, {canvasStore.view.y}px) scale({canvasStore
      .view.zoom});"
  >
    {@render children()}
  </div>

  {#if band}
    <Marquee {band} />
  {/if}

  <ZoomBar
    zoom={canvasStore.view.zoom}
    {fitsAlready}
    onZoomIn={() => stepZoom(1)}
    onZoomOut={() => stepZoom(-1)}
    onZoomToFit={zoomToFit}
  />
</div>

<style>
  .surface {
    flex: 1;
    position: relative;
    overflow: hidden;
    background-color: var(--color-bg);
    /* Pointer capture plus touch-action: none, or a fast drag drops events. */
    touch-action: none;
    cursor: grab;
  }

  .surface:active {
    cursor: grabbing;
  }

  /* Everywhere on the canvas while the Connect tool is active (design-system §11.5). */
  .surface.connecting,
  .surface.connecting:active {
    cursor: crosshair;
  }

  .world {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;
  }

  /* Only the button paths ease. Hand panning and wheel zooming stay at 0 ms. */
  .world.eased {
    transition: transform var(--duration-160) var(--ease);
  }
</style>
