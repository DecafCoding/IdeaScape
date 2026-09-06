/**
 * Creating, renaming, deleting and re-listing the canvases in the open project.
 *
 * Each write goes through `invokeSafe`, updates `canvasStore.canvases`, and *returns* the
 * undo command rather than pushing it: `import-direction` forbids a feature importing another
 * feature, so `features/undo/` is reached by the root, exactly as every other command already
 * is. This module imports `stores/` and `lib/` only.
 */
import { invokeSafe } from '../../lib/ipc';
import { canvasStore } from '../../stores/canvasStore.svelte';
import type { Canvas, CanvasDeleteEffect } from '../../lib/types';

/**
 * The name a new canvas gets: `Canvas {n}`, where n is one past the highest existing
 * `Canvas <number>`. Counting the rows instead would give a duplicate name after a delete.
 * Names are not required to be unique; this only avoids the obvious collision.
 */
export function nextCanvasName(existing: readonly Canvas[]): string {
  let highest = 0;
  for (const canvas of existing) {
    const match = /^Canvas (\d+)$/.exec(canvas.name.trim());
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `Canvas ${highest + 1}`;
}

/** Re-read the canvas list from the project. Used after a delete or a restore. */
export async function refreshCanvases(): Promise<Canvas[]> {
  const projectId = canvasStore.project?.id;
  if (projectId === undefined) return [];
  canvasStore.canvases = await invokeSafe<Canvas[]>('list_canvases', { projectId });
  return canvasStore.canvases;
}

/** Add a canvas to the open project and adopt the row. Returns it, or null with no project. */
export async function createCanvas(): Promise<Canvas | null> {
  const projectId = canvasStore.project?.id;
  if (projectId === undefined) return null;

  const canvas = await invokeSafe<Canvas>('create_canvas', {
    projectId,
    name: nextCanvasName(canvasStore.canvases),
  });
  canvasStore.canvases = [...canvasStore.canvases, canvas];
  return canvas;
}

/**
 * Rename a canvas in place. A blank name, or one that has not changed, writes nothing —
 * committing an untouched inline edit must not put a row on the undo stack.
 */
export async function renameCanvas(
  canvasId: number,
  name: string,
): Promise<{ canvas: Canvas; before: string } | null> {
  const existing = canvasStore.canvases.find((c) => c.id === canvasId);
  const next = name.trim();
  if (!existing || next.length === 0 || next === existing.name) return null;

  const canvas = await invokeSafe<Canvas>('rename_canvas', { canvasId, name: next });
  canvasStore.canvases = canvasStore.canvases.map((c) => (c.id === canvasId ? canvas : c));
  return { canvas, before: existing.name };
}

/**
 * Delete a canvas and everything it owned. The effect names every row and file that went, so
 * the undo command can put all of it back in one transaction. Rust refuses the last canvas in
 * a project, and that error reaches the shell's strip through the root's `guard`.
 */
export async function deleteCanvas(canvasId: number): Promise<CanvasDeleteEffect> {
  const effect = await invokeSafe<CanvasDeleteEffect>('delete_canvas', { canvasId });
  await refreshCanvases();
  return effect;
}
