/**
 * The search box and the results popover. The load-bearing assertions are the ranking —
 * canvases before cards, always — and that the highlight reaches the page as `<b>` text nodes
 * with no markup from the data.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import type { CanvasHit, CardHit, SearchResults } from '../../../lib/types';

vi.mock('../../../lib/ipc', () => ({ invokeSafe: vi.fn(), IpcError: class extends Error {} }));

const SearchResultsView = (await import('../SearchResults.svelte')).default;
const SearchBox = (await import('../SearchBox.svelte')).default;

function canvasHit(id: number, name: string): CanvasHit {
  return { canvas_id: id, name, card_count: 3, updated_at: new Date().toISOString() };
}

function cardHit(id: number, title: string, snippet = ''): CardHit {
  return {
    placement_id: id,
    canvas_id: 9,
    canvas_name: 'Hull studies',
    item_id: id * 10,
    kind: 'note',
    title,
    snippet,
    matched_title: true,
  };
}

const AMBIGUOUS: SearchResults = {
  canvases: [canvasHit(1, 'Chapter 3')],
  cards: [cardHit(5, 'Chapter 3', 'the frames in chapter 3 are forward')],
};

describe('the search results popover', () => {
  afterEach(cleanup);

  it('searchResults_canvasAndCardHits_rendersCanvasesFirst', () => {
    const { getAllByRole, getByTestId } = render(SearchResultsView, {
      props: { results: AMBIGUOUS, query: 'Chapter 3' },
    });

    const rows = getAllByRole('option');
    expect(rows).toHaveLength(2);
    // The canvas hit and the card hit share a name; the canvas is still first.
    expect(rows[0].textContent).toContain('3 cards');
    expect(rows[1].textContent).toContain('Note · Hull studies');

    const text = getByTestId('search-results').textContent ?? '';
    expect(text.indexOf('Canvases')).toBeLessThan(text.indexOf('Cards'));
  });

  it('searchResults_matchedWords_areWrappedInBoldTextNodes', () => {
    const { getByTestId } = render(SearchResultsView, {
      props: {
        results: {
          canvases: [],
          cards: [cardHit(5, 'Chapter 3', 'a <script>alert(1)</script> body naming chapter 3')],
        },
        query: 'chapter 3',
      },
    });

    const popover = getByTestId('search-results');
    const bolds = [...popover.querySelectorAll('b')].map((b) => b.textContent);
    expect(bolds).toContain('Chapter 3');
    expect(bolds).toContain('chapter 3');

    // Nothing from the data reached the page as markup: the tag is text, not an element.
    expect(popover.querySelector('script')).toBeNull();
    expect(popover.textContent).toContain('<script>alert(1)</script>');
  });

  it('searchResults_cardHit_showsKindAndCanvasInTheSubLine', () => {
    const { getByText } = render(SearchResultsView, {
      props: { results: { canvases: [], cards: [cardHit(5, 'Frames')] }, query: 'frames' },
    });
    expect(getByText('Note · Hull studies')).toBeInTheDocument();
  });

  it('searchResults_groupHeaders_carryTheirCounts', () => {
    const results: SearchResults = {
      canvases: [canvasHit(1, 'A'), canvasHit(2, 'B')],
      cards: [cardHit(5, 'C')],
    };
    const { getByTestId } = render(SearchResultsView, { props: { results, query: 'x' } });

    const headers = [...getByTestId('search-results').querySelectorAll('.group-header')];
    expect(headers[0].textContent).toContain('Canvases');
    expect(headers[0].textContent).toContain('2');
    expect(headers[1].textContent).toContain('Cards');
    expect(headers[1].textContent).toContain('1');
  });

  it('searchResults_highlightIndex_countsAcrossBothGroups', () => {
    const { getAllByRole } = render(SearchResultsView, {
      props: { results: AMBIGUOUS, query: 'chapter', highlighted: 1 },
    });
    const rows = getAllByRole('option');
    expect(rows[0].className).not.toContain('highlighted');
    expect(rows[1].className).toContain('highlighted');
    expect(rows[1].getAttribute('aria-selected')).toBe('true');
  });

  it('searchResults_footer_printsTheKeysFromTheShortcutTable', () => {
    const { getByTestId } = render(SearchResultsView, {
      props: { results: AMBIGUOUS, query: 'chapter' },
    });
    const text = getByTestId('search-results').textContent ?? '';
    expect(text).toContain('to move');
    expect(text).toContain('Enter to open');
    expect(text).toContain('Esc to close');
  });
});

describe('the search box', () => {
  afterEach(cleanup);

  it('searchBox_withAQuery_showsTheClearGlyph', () => {
    const idle = render(SearchBox, { props: { query: '' } });
    expect(idle.queryByLabelText('Clear Search')).toBeNull();
    idle.unmount();

    const typed = render(SearchBox, { props: { query: 'chapter' } });
    expect(typed.getByLabelText('Clear Search')).toBeInTheDocument();
    expect(typed.getByTestId('search-box').className).toContain('has-query');
  });

  it('searchBox_clearClicked_emptiesTheQuery', async () => {
    let cleared = 0;
    const { getByLabelText } = render(SearchBox, {
      props: { query: 'chapter', onClear: () => (cleared += 1) },
    });
    await fireEvent.click(getByLabelText('Clear Search'));
    expect(cleared).toBe(1);
  });

  it('searchBox_arrowDown_movesTheHighlightWithoutLosingFocus', async () => {
    const moves: number[] = [];
    const { getByLabelText } = render(SearchBox, {
      props: { query: 'chapter', onMove: (delta: number) => moves.push(delta) },
    });

    const input = getByLabelText('Search') as HTMLInputElement;
    input.focus();
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'ArrowUp' });

    expect(moves).toEqual([1, -1]);
    // The keys are handled on the input, so focus never leaves the box.
    expect(document.activeElement).toBe(input);
  });

  it('searchBox_escape_closesThePopoverAndDoesNotClearTheSelection', async () => {
    let closed = 0;
    let cleared = 0;
    const { getByLabelText } = render(SearchBox, {
      props: {
        query: 'chapter',
        onClose: () => (closed += 1),
        onClear: () => (cleared += 1),
      },
    });

    const input = getByLabelText('Search');
    // stopPropagation is what keeps the global `cancel` chain from also clearing a selection.
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    let reachedWindow = false;
    const listener = () => (reachedWindow = true);
    window.addEventListener('keydown', listener);
    input.dispatchEvent(event);
    window.removeEventListener('keydown', listener);

    expect(closed).toBe(1);
    expect(cleared).toBe(0);
    expect(reachedWindow).toBe(false);
  });

  it('searchBox_enter_opensTheHighlightedResult', async () => {
    let opened = 0;
    const { getByLabelText } = render(SearchBox, {
      props: { query: 'chapter', onOpen: () => (opened += 1) },
    });
    await fireEvent.keyDown(getByLabelText('Search'), { key: 'Enter' });
    expect(opened).toBe(1);
  });

  it('searchBox_typing_raisesTheQuery', async () => {
    const typed: string[] = [];
    const { getByLabelText } = render(SearchBox, {
      props: { query: '', onType: (next: string) => typed.push(next) },
    });
    await fireEvent.input(getByLabelText('Search'), { target: { value: 'chap' } });
    expect(typed).toEqual(['chap']);
  });
});
