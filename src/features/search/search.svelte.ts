/**
 * Search's feature state: the query, the debounced run, the results, and the highlight cursor
 * that moves across both groups (canvases first, then cards).
 *
 * The debounce is `lib/save.ts`'s — already written, with `flush` and `cancel` — rather than a
 * second one. A slow response is dropped if a newer query has been typed since, so results can
 * never arrive out of order.
 */
import { invokeSafe } from '../../lib/ipc';
import { debounce } from '../../lib/save';
import { logError } from '../../lib/logger';
import type { CanvasHit, CardHit, SearchResults } from '../../lib/types';

/** Long enough that a keystroke does not run a query, short enough to feel immediate. */
const DEBOUNCE_MS = 140;

const EMPTY: SearchResults = { canvases: [], cards: [] };

class SearchState {
  query = $state('');
  results = $state<SearchResults>(EMPTY);
  /** Whether the popover is on screen. */
  open = $state(false);
  /** An index across both groups: canvases first, then cards. `-1` is "nothing highlighted". */
  highlighted = $state(-1);

  /** Every query gets a number; a response with a stale one is thrown away. */
  #issued = 0;
  #answered = 0;

  #run = debounce(() => {
    void this.#search();
  }, DEBOUNCE_MS);

  get total(): number {
    return this.results.canvases.length + this.results.cards.length;
  }

  /** Take a new query. A query with no non-space character closes the popover and runs nothing. */
  type(next: string): void {
    this.query = next;
    if (next.trim().length === 0) {
      this.#run.cancel();
      this.clear();
      return;
    }
    this.open = true;
    this.highlighted = -1;
    this.#run();
  }

  /** Run the query now, skipping the debounce. The tests and Enter use this. */
  async runNow(): Promise<void> {
    this.#run.cancel();
    await this.#search();
  }

  async #search(): Promise<void> {
    const query = this.query.trim();
    if (query.length === 0) {
      this.clear();
      return;
    }
    const id = ++this.#issued;
    try {
      const results = await invokeSafe<SearchResults>('search_project', { query });
      // A slower earlier query must not overwrite a newer one's results.
      if (id < this.#answered) return;
      this.#answered = id;
      this.results = results;
      this.open = true;
    } catch (error) {
      // Search failing is not worth a strip over the canvas; it is logged and shows nothing.
      logError('the search could not be run', error);
      if (id >= this.#answered) this.results = EMPTY;
    }
  }

  /** Close the popover and forget the query and the results. */
  clear(): void {
    this.#run.cancel();
    this.query = '';
    this.results = EMPTY;
    this.open = false;
    this.highlighted = -1;
  }

  /** Close the popover but keep the query, so a second Enter is not needed to search again. */
  close(): void {
    this.open = false;
    this.highlighted = -1;
  }

  /** Move the highlight, wrapping across both groups as one list. */
  move(delta: number): void {
    if (this.total === 0) {
      this.highlighted = -1;
      return;
    }
    const next = this.highlighted < 0 ? (delta > 0 ? 0 : this.total - 1) : this.highlighted + delta;
    this.highlighted = (next + this.total) % this.total;
  }

  /** The highlighted row, as a canvas hit or a card hit. */
  current(): { kind: 'canvas'; hit: CanvasHit } | { kind: 'card'; hit: CardHit } | null {
    if (this.highlighted < 0) return null;
    const canvases = this.results.canvases;
    if (this.highlighted < canvases.length) {
      return { kind: 'canvas', hit: canvases[this.highlighted] };
    }
    const card = this.results.cards[this.highlighted - canvases.length];
    return card ? { kind: 'card', hit: card } : null;
  }
}

export const searchState = new SearchState();
export type { SearchState };
