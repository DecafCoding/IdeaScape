import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeSafe = vi.fn();
vi.mock('../ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
}));

const {
  clearPending,
  debounce,
  flushPlacements,
  pendingCount,
  queuePlacementUpdate,
  startAutoSave,
  writeNow,
} = await import('../save');
const { DEFAULT_SETTINGS, applySettings, autoSaveFooterText, resetSettings } =
  await import('../settings.svelte');

function update(id: number, x: number) {
  return { id, x, y: 0, width: 236, height: 150, z_order: id };
}

describe('the save scheduler', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    invokeSafe.mockResolvedValue(undefined);
    clearPending();
  });

  it('flushPlacements_manyPointerMovesInOneDrag_producesExactlyOneCall', async () => {
    // Two hundred frames of a drag on three cards.
    for (let frame = 0; frame < 200; frame += 1) {
      for (const id of [1, 2, 3]) queuePlacementUpdate(update(id, frame));
    }
    expect(pendingCount()).toBe(3);

    await flushPlacements();

    expect(invokeSafe).toHaveBeenCalledTimes(1);
    const [name, args] = invokeSafe.mock.calls[0];
    expect(name).toBe('update_placements');
    // One transaction, one row per card, carrying the last frame's geometry.
    expect((args as { updates: { id: number; x: number }[] }).updates).toHaveLength(3);
    expect((args as { updates: { id: number; x: number }[] }).updates[0].x).toBe(199);
  });

  it('flushPlacements_withNothingQueued_makesNoCall', async () => {
    await flushPlacements();
    expect(invokeSafe).not.toHaveBeenCalled();
  });

  it('flushPlacements_clearsTheQueueSoASecondFlushIsANoOp', async () => {
    queuePlacementUpdate(update(1, 10));
    await flushPlacements();
    await flushPlacements();
    expect(invokeSafe).toHaveBeenCalledTimes(1);
  });

  it('flushPlacements_drivesTheSaveStateFromSavingToSaved', async () => {
    const seen: string[] = [];
    queuePlacementUpdate(update(1, 10));
    await flushPlacements({
      onSaving: () => seen.push('saving'),
      onSaved: () => seen.push('saved'),
    });
    expect(seen).toEqual(['saving', 'saved']);
  });

  it('writeNow_aDiscreteChange_writesImmediatelyAndDrivesTheSaveState', async () => {
    const seen: string[] = [];
    const result = await writeNow(async () => 'done', {
      onSaving: () => seen.push('saving'),
      onSaved: () => seen.push('saved'),
    });
    expect(result).toBe('done');
    expect(seen).toEqual(['saving', 'saved']);
  });

  it('writeNow_doesNotWaitForAFlush', async () => {
    queuePlacementUpdate(update(1, 10));
    await writeNow(() => invokeSafe('create_note_card'));
    expect(invokeSafe).toHaveBeenCalledWith('create_note_card');
    // The queued drag is still pending: a discrete write does not drain it.
    expect(pendingCount()).toBe(1);
  });
});

describe('debounce', () => {
  it('debounce_repeatedCalls_runsOnceWithTheLastArguments', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced(1);
    debounced(2);
    debounced(3);
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
    vi.useRealTimers();
  });

  it('debounce_flush_runsThePendingCallAtOnce', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 10_000);
    debounced('view');
    debounced.flush();
    expect(fn).toHaveBeenCalledWith('view');
    vi.useRealTimers();
  });

  it('debounce_cancel_dropsThePendingCall', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('view');
    debounced.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

/**
 * Task 10's auto-save ceiling. Its own describe so the shared mock is reset between these
 * tests — the `debounce` block above has no beforeEach of its own.
 */
describe('the auto-save ceiling', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    invokeSafe.mockResolvedValue(undefined);
    clearPending();
  });

  it('startAutoSave_geometryQueuedPastTheCadence_flushesItOnce', async () => {
    vi.useFakeTimers();
    const stop = startAutoSave({ onSaving: () => {}, onSaved: () => {} }, 3000);
    queuePlacementUpdate(update(1, 5));
    expect(invokeSafe).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(invokeSafe).toHaveBeenCalledTimes(1);
    expect(pendingCount()).toBe(0);

    // Nothing new queued: the next tick writes nothing.
    await vi.advanceTimersByTimeAsync(3000);
    expect(invokeSafe).toHaveBeenCalledTimes(1);
    stop();
    vi.useRealTimers();
  });

  it('startAutoSave_nothingQueued_writesNothing', async () => {
    vi.useFakeTimers();
    const stop = startAutoSave({ onSaving: () => {}, onSaved: () => {} }, 1000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(invokeSafe).not.toHaveBeenCalled();
    stop();
    vi.useRealTimers();
  });

  it('startAutoSave_teardown_stopsTheTimer', async () => {
    vi.useFakeTimers();
    const stop = startAutoSave({ onSaving: () => {}, onSaved: () => {} }, 1000);
    stop();
    queuePlacementUpdate(update(1, 5));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(invokeSafe).not.toHaveBeenCalled();
    clearPending();
    vi.useRealTimers();
  });

  it('autoSaveFooterText_afterTheCadenceChanges_readsTheNewValue', () => {
    resetSettings();
    expect(autoSaveFooterText()).toContain('autosave in 3s');
    applySettings({ autoSaveMs: 10000 });
    expect(autoSaveFooterText()).toContain('autosave in 10s');
    applySettings({ autoSaveMs: DEFAULT_SETTINGS.autoSaveMs });
  });
});
