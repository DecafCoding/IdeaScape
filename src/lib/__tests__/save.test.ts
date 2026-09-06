import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeSafe = vi.fn();
vi.mock('../ipc', () => ({
  invokeSafe: (...args: unknown[]) => invokeSafe(...args),
  IpcError: class extends Error {},
}));

const { clearPending, debounce, flushPlacements, pendingCount, queuePlacementUpdate, writeNow } =
  await import('../save');

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
