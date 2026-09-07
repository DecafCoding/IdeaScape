import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

const invokeSafe = vi.fn();

vi.mock('../../../lib/ipc', () => ({
  invokeSafe: (command: string, args?: Record<string, unknown>) => invokeSafe(command, args),
  toFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  IpcError: class IpcError extends Error {},
}));

const PropertiesPanel = (await import('../PropertiesPanel.svelte')).default;
const { canvasStore } = await import('../../../stores/canvasStore.svelte');

const PLACEMENT_ID = 1;
const ITEM_ID = 1;
const ADDRESS = 'https://example.com/articles/one';

function seedLinkCard(fetchedAt: string | null) {
  canvasStore.upsertCard({
    placement: {
      id: PLACEMENT_ID,
      canvas_id: 1,
      item_id: ITEM_ID,
      x: 0,
      y: 0,
      width: 236,
      height: 236,
      z_order: 0,
    },
    item: {
      id: ITEM_ID,
      project_id: 1,
      kind: 'link',
      payload: JSON.stringify({
        url: ADDRESS,
        title: 'A Good Article',
        description: '',
        favicon_asset: null,
        thumbnail_asset: null,
        fetched_at: fetchedAt,
      }),
      created_at: 'now',
      updated_at: 'now',
    },
  });
  canvasStore.setSelection([PLACEMENT_ID]);
}

const props = { expanded: true, onToggle: () => {} };

describe('the properties panel for a link card', () => {
  beforeEach(() => {
    invokeSafe.mockReset();
    canvasStore.closeProject();
  });

  afterEach(cleanup);

  it('panel_aLinkSelection_rendersTheSourceGroupWithTheAddressReadOnly', () => {
    seedLinkCard('2026-09-06T10:00:00Z');
    const { getByTestId, getByLabelText } = render(PropertiesPanel, { props });
    expect(getByTestId('panel-source-group')).toBeTruthy();
    const input = getByLabelText('Source Address') as HTMLInputElement;
    expect(input.value).toBe(ADDRESS);
    expect(input.readOnly).toBe(true);
  });

  it('panel_aLinkSelection_readsAsLinkAndTitlesItselfFromThePayload', () => {
    seedLinkCard('2026-09-06T10:00:00Z');
    const { getByTestId } = render(PropertiesPanel, { props });
    const panel = getByTestId('properties-panel');
    expect(panel.querySelector('.kind')?.textContent).toBe('Link');
    expect(panel.querySelector('.item-id')?.textContent).toBe('A Good Article');
  });

  it('panel_aFetchedAtInThePast_printsPreviewFetchedAndARelativeTime', () => {
    seedLinkCard(new Date(Date.now() - 2 * 60_000).toISOString());
    const { getByTestId } = render(PropertiesPanel, { props });
    expect(getByTestId('panel-source-meta').textContent).toBe('Preview fetched 2 min ago');
  });

  it('panel_fetchedAtNull_printsNotFetchedYetAndTheFiveSecondLimit', () => {
    seedLinkCard(null);
    const { getByTestId } = render(PropertiesPanel, { props });
    expect(getByTestId('panel-source-meta').textContent).toBe('Not fetched yet · 5s limit');
  });

  it('panel_refetchWhileFetching_isDisabled', () => {
    seedLinkCard(null);
    canvasStore.setFetchStatus(ITEM_ID, 'fetching');
    const { getByRole } = render(PropertiesPanel, { props });
    expect((getByRole('button', { name: /refetch/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('panel_refetchWhenEnabled_firesTheCallbackOnce', async () => {
    seedLinkCard(null);
    const onRefetch = vi.fn();
    const { getByRole } = render(PropertiesPanel, { props: { ...props, onRefetch } });
    const button = getByRole('button', { name: /refetch/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await fireEvent.click(button);
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it('panel_aLinkSelection_hasNoFileOrAltTextGroup', () => {
    seedLinkCard(null);
    const { queryByTestId, queryByLabelText } = render(PropertiesPanel, { props });
    expect(queryByTestId('panel-file-group')).toBeNull();
    expect(queryByLabelText('Description')).toBeNull();
  });
});
