/**
 * The search state machine: the popover closing on an emptied query, a stale response being
 * discarded, and the highlight wrapping across both groups as one list.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasHit, CardHit, SearchResults } from '../../../lib/types';

const invokeSafe = vi.fn();
vi.mock('../../../lib/ipc', () => ({ invokeSafe, IpcError: class extends Error {} }));
vi.mock('../../../lib/logger', () => ({ logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }));

const { searchState } = await import('../search.svelte');

function canvasHit(id: number, name: string): CanvasHit {
  return { canvas_id: id, name, card_count: 3, updated_at: '2026-09-06T12:00:00Z' };
}

function cardHit(id: number, title: string): CardHit {
  return {
    placement_id: id,
    canvas_id: 9,
    canvas_name: 'Hull studies',
    item_id: id * 10,
    kind: 'note',
    title,
    snippet: 'a snippet',
    matched_title: true,
  };
}

const RESULTS: SearchResults = {
  canvases: [canvasHit(1, 'Chapter 3')],
  cards: [cardHit(5, 'Chapter 3'), cardHit(6, 'Chapter 3 again')],
};

beforeEach(() => {
  invokeSafe.mockReset();
  searchState.clear();
});

describe('the search state', () => {
  it('search_aQuery_runsItAndOpensThePopover', async () => {
    invokeSafe.mockResolvedValue(RESULTS);
    searchState.type('chapter 3');
    await searchState.runNow();

    expect(invokeSafe).toHaveBeenCalledWith('search_project', { query: 'chapter 3' });
    expect(searchState.open).toBe(true);
    expect(searchState.total).toBe(3);
  });

  it('search_typingThenClearing_closesThePopover', async () => {
    invokeSafe.mockResolvedValue(RESULTS);
    searchState.type('chapter');
    await searchState.runNow();
    expect(searchState.open).toBe(true);

    // A query with no non-space character closes the popover and runs nothing.
    invokeSafe.mockClear();
    searchState.type('   ');
    expect(searchState.open).toBe(false);
    expect(searchState.query).toBe('');
    expect(searchState.total).toBe(0);
    expect(invokeSafe).not.toHaveBeenCalled();
  });

  it('search_staleResponse_isDiscarded', async () => {
    const older: SearchResults = { canvases: [canvasHit(1, 'Old')], cards: [] };
    const newer: SearchResults = { canvases: [canvasHit(2, 'New')], cards: [] };

    let releaseOlder: ((value: SearchResults) => void) | null = null;
    invokeSafe
      .mockImplementationOnce(() => new Promise<SearchResults>((r) => (releaseOlder = r)))
      .mockImplementationOnce(() => Promise.resolve(newer));

    searchState.type('ol');
    const first = searchState.runNow();
    searchState.type('ne');
    await searchState.runNow();
    expect(searchState.results.canvases[0].name).toBe('New');

    // The slower earlier query answers last and must not overwrite the newer results.
    releaseOlder!(older);
    await first;
    expect(searchState.results.canvases[0].name).toBe('New');
  });

  it('search_move_wrapsAcrossBothGroups', async () => {
    invokeSafe.mockResolvedValue(RESULTS);
    searchState.type('chapter 3');
    await searchState.runNow();

    expect(searchState.highlighted).toBe(-1);
    searchState.move(1);
    expect(searchState.current()).toEqual({ kind: 'canvas', hit: RESULTS.canvases[0] });
    searchState.move(1);
    expect(searchState.current()).toEqual({ kind: 'card', hit: RESULTS.cards[0] });
    searchState.move(1);
    expect(searchState.current()).toEqual({ kind: 'card', hit: RESULTS.cards[1] });
    // Past the last card it wraps to the first canvas.
    searchState.move(1);
    expect(searchState.highlighted).toBe(0);
    // And up from the first wraps to the last card.
    searchState.move(-1);
    expect(searchState.current()).toEqual({ kind: 'card', hit: RESULTS.cards[1] });
  });

  it('search_moveWithNoResults_highlightsNothing', () => {
    searchState.move(1);
    expect(searchState.highlighted).toBe(-1);
    expect(searchState.current()).toBeNull();
  });

  it('search_close_keepsTheQueryButHidesThePopover', async () => {
    invokeSafe.mockResolvedValue(RESULTS);
    searchState.type('chapter 3');
    await searchState.runNow();
    searchState.move(1);

    searchState.close();
    expect(searchState.open).toBe(false);
    // Kept, so a second Enter is not needed to search again.
    expect(searchState.query).toBe('chapter 3');
    expect(searchState.highlighted).toBe(-1);
  });

  it('search_aFailedQuery_showsNothingAndNeverThrows', async () => {
    invokeSafe.mockRejectedValue(new Error('offline'));
    searchState.type('chapter');
    await expect(searchState.runNow()).resolves.toBeUndefined();
    expect(searchState.total).toBe(0);
  });
});
