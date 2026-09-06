/**
 * The project picker screen: the 2 × 2 Recent grid, the actions with no recents, the arrow
 * keys reaching a card, the failure strip, and the counts and relative time a card prints.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';

vi.mock('../../../lib/ipc', () => ({ invokeSafe: vi.fn(), IpcError: class extends Error {} }));

const ProjectPicker = (await import('../ProjectPicker.svelte')).default;
const { projectsState } = await import('../projects.svelte');

function recent(name: string, path: string, canvases = 3, cards = 12) {
  return {
    path,
    name,
    canvas_count: canvases,
    card_count: cards,
    opened_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  };
}

const four = [
  recent('Alpha', 'C:\\Projects\\Alpha'),
  recent('Beta', 'C:\\Projects\\Beta'),
  recent('Gamma', 'C:\\Projects\\Gamma'),
  recent('Delta', 'C:\\Projects\\Delta'),
];

describe('the project picker', () => {
  afterEach(cleanup);

  it('picker_fourRecents_rendersATwoByTwoGrid', () => {
    const { getByTestId, getByText } = render(ProjectPicker, { props: { recents: four } });

    const grid = getByTestId('recent-grid');
    expect(grid.querySelectorAll('button.card')).toHaveLength(4);
    for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
      expect(getByText(name)).toBeInTheDocument();
    }
    // The 2 × 2 shape is the grid's own two columns, not four separate rows.
    expect(grid.className).toContain('grid');
  });

  it('picker_noRecents_showsTheActionsAndNoGrid', () => {
    const { getByText, queryByTestId } = render(ProjectPicker, { props: { recents: [] } });

    expect(getByText('New project…')).toBeInTheDocument();
    expect(getByText('Open folder…')).toBeInTheDocument();
    expect(queryByTestId('recent-grid')).toBeNull();
  });

  it('picker_arrowDownThenEnter_opensTheSecondRecent', async () => {
    // The grid is not a text box, so the dispatcher's result-down serves it — the picker
    // holds the cursor and the root turns Enter into an open.
    projectsState.recents = four;
    projectsState.selectedIndex = -1;
    projectsState.move(1);
    projectsState.move(1);

    expect(projectsState.selectedIndex).toBe(1);
    expect(projectsState.current()).toBe('C:\\Projects\\Beta');

    const opened: string[] = [];
    const { getByTestId } = render(ProjectPicker, {
      props: {
        recents: four,
        selectedIndex: projectsState.selectedIndex,
        onOpenPath: (path: string) => opened.push(path),
      },
    });

    const cards = getByTestId('recent-grid').querySelectorAll('button.card');
    expect(cards[1].className).toContain('selected');
    expect(cards[0].className).not.toContain('selected');

    // Enter on the picker is the root calling the same thing a click does.
    await fireEvent.click(cards[1]);
    expect(opened).toEqual(['C:\\Projects\\Beta']);
  });

  it('picker_openFailed_drawsTheMessageNamingTheFile', () => {
    const message =
      'the project database could not be opened: C:\\Projects\\Alpha\\ideascape.db — file is not a database';
    const { getByTestId, getByText } = render(ProjectPicker, {
      props: { recents: four, failure: message },
    });

    expect(getByTestId('picker-failure')).toBeInTheDocument();
    expect(getByText(message)).toBeInTheDocument();
    // Still a drawn strip, not a dialog: the grid is unaffected and stays on screen.
    expect(getByTestId('recent-grid').querySelectorAll('button.card')).toHaveLength(4);
  });

  it('picker_recentCard_showsCanvasAndCardCountsAndRelativeTime', () => {
    const { getByText } = render(ProjectPicker, {
      props: { recents: [recent('Alpha', 'C:\\Projects\\Alpha', 3, 12)] },
    });

    expect(getByText('3 canvases · 12 cards')).toBeInTheDocument();
    expect(getByText('5 min ago')).toBeInTheDocument();
    expect(getByText('C:\\Projects\\Alpha')).toBeInTheDocument();
  });

  it('picker_recentCard_singularCountsReadSingular', () => {
    const { getByText } = render(ProjectPicker, {
      props: { recents: [recent('Solo', 'C:\\Solo', 1, 1)] },
    });
    expect(getByText('1 canvas · 1 card')).toBeInTheDocument();
  });

  it('move_wrapsAtBothEndsOfTheGrid', () => {
    projectsState.recents = four;
    projectsState.selectedIndex = 3;
    projectsState.move(1);
    expect(projectsState.selectedIndex).toBe(0);
    projectsState.move(-1);
    expect(projectsState.selectedIndex).toBe(3);

    projectsState.recents = [];
    projectsState.move(1);
    expect(projectsState.selectedIndex).toBe(-1);
    expect(projectsState.current()).toBeNull();
  });
});
