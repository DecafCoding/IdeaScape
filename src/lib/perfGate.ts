/**
 * The performance-gate harness. CLAUDE.md requires the 60 fps / 250 card gate be measured
 * in the running application, not in a unit test — but the measurement still has to be
 * repeatable and recordable, so this drives the pan itself rather than asking a person to
 * hold the mouse down for thirty seconds.
 *
 * It runs only when the binary is launched with `--perf-gate`. It seeds the canvas, pans
 * continuously for a fixed window at 100% and again at 40%, samples every frame through
 * requestAnimationFrame, and hands back the median and 5th-percentile frame rates together
 * with the drawn-card count the cull produced.
 *
 * The drawn count is the number to read first: if it is close to the total the cull is
 * broken and the frame rate beside it means nothing.
 */
import { connectionCullCounts, cullCounts } from './culling';

export interface GatePass {
  label: string;
  zoom: number;
  medianFps: number;
  p5Fps: number;
  medianFrameMs: number;
  /** Frames that took longer than 1.5 display intervals — the frames actually missed. */
  droppedFrames: number;
  frames: number;
  total: number;
  drawn: number;
  connectionsTotal: number;
  connectionsDrawn: number;
}

export interface GateResult {
  startedAt: string;
  passes: GatePass[];
}

function percentileFps(frameTimes: number[], percentile: number): number {
  if (frameTimes.length === 0) return 0;
  const sorted = [...frameTimes].sort((a, b) => a - b);
  // A high frame time is a low frame rate, so the 5th percentile of fps is the 95th of time.
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * percentile));
  return Math.round((1000 / sorted[index]) * 10) / 10;
}

/**
 * Pan continuously for `durationMs`, sampling every frame. `applyView` is the store's
 * setView, kept as an argument so this module imports no feature and no store.
 */
export function runPass(
  label: string,
  zoom: number,
  durationMs: number,
  applyView: (view: { x: number; y: number; zoom: number }) => void,
): Promise<GatePass> {
  return new Promise((resolve) => {
    const frameTimes: number[] = [];
    const started = performance.now();
    let last = started;
    let peakDrawn = 0;
    let total = 0;
    let peakConnectionsDrawn = 0;
    let connectionsTotal = 0;

    const step = (now: number) => {
      const delta = now - last;
      last = now;
      // Skip the very first frame: it carries the cost of the mode switch, not of panning.
      if (delta > 0 && now - started > 250) frameTimes.push(delta);

      const elapsed = now - started;
      // A continuous diagonal sweep, so new cards enter and leave the window all the way
      // through rather than the view settling on one static set.
      applyView({ x: -elapsed * 0.6, y: -elapsed * 0.35, zoom });

      peakDrawn = Math.max(peakDrawn, cullCounts.drawn);
      total = cullCounts.total;
      peakConnectionsDrawn = Math.max(peakConnectionsDrawn, connectionCullCounts.drawn);
      connectionsTotal = connectionCullCounts.total;

      if (elapsed >= durationMs) {
        const sorted = [...frameTimes].sort((a, b) => a - b);
        const medianFrameMs = sorted[Math.floor(sorted.length / 2)] ?? 0;
        // requestAnimationFrame is locked to the display, so a 60 Hz panel reports at most
        // ~59.9 fps however fast the renderer is. What proves the gate is therefore not the
        // raw number but whether any frame was missed against that interval.
        const droppedFrames = frameTimes.filter((t) => t > medianFrameMs * 1.5).length;
        resolve({
          label,
          zoom,
          medianFps: percentileFps(frameTimes, 0.5),
          p5Fps: percentileFps(frameTimes, 0.95),
          medianFrameMs: Math.round(medianFrameMs * 100) / 100,
          droppedFrames,
          frames: frameTimes.length,
          total,
          drawn: peakDrawn,
          connectionsTotal,
          connectionsDrawn: peakConnectionsDrawn,
        });
        return;
      }
      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  });
}
