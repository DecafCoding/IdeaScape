import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import LinkCard from '../LinkCard.svelte';
import { setAssetsFolder } from '../../../lib/assets';
import { LOW_ZOOM } from '../../../lib/geometry';
import type { LinkPayload } from '../../../lib/types';

vi.mock('../../../lib/ipc', () => ({
  invokeSafe: vi.fn(),
  toFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  IpcError: class IpcError extends Error {},
}));

const FETCHED: LinkPayload = {
  url: 'https://example.com/articles/one',
  title: 'A Good Article',
  description: 'What the article is about.',
  favicon_asset: 'f.ico',
  thumbnail_asset: 't.png',
  fetched_at: '2026-09-06T10:00:00Z',
};

const NO_PREVIEW: LinkPayload = { ...FETCHED, favicon_asset: null, thumbnail_asset: null };

const NOT_FETCHED: LinkPayload = {
  url: 'https://example.com/articles/one',
  title: '',
  description: '',
  favicon_asset: null,
  thumbnail_asset: null,
  fetched_at: null,
};

describe('LinkCard', () => {
  beforeEach(() => setAssetsFolder('C:/Project/assets'));
  afterEach(() => {
    cleanup();
    setAssetsFolder(null);
  });

  it('linkCard_fetched_drawsThePreviewBandTheTitleAndTheDescription', () => {
    const { getByTestId } = render(LinkCard, {
      props: { payload: FETCHED, status: 'ok', zoom: 1 },
    });
    const card = getByTestId('link-card');
    expect(card.querySelector('.band')).not.toBeNull();
    expect(card.textContent).toContain('A Good Article');
    expect(card.textContent).toContain('What the article is about.');
    expect(card.textContent).toContain('example.com');
    expect(card.textContent).not.toContain('No preview picture');
  });

  it('linkCard_fetchedWithNoThumbnail_saysThereIsNoPreviewPictureAndDropsTheBand', () => {
    const { getByTestId } = render(LinkCard, {
      props: { payload: NO_PREVIEW, status: 'ok', zoom: 1 },
    });
    const card = getByTestId('link-card');
    expect(card.querySelector('.band')).toBeNull();
    expect(card.textContent).toContain('No preview picture on this page');
    expect(card.textContent).not.toContain('What the article is about.');
  });

  it('linkCard_notFetched_showsTheRawAddressAndARefetchButton', () => {
    const { getByTestId, getByRole } = render(LinkCard, {
      props: { payload: NOT_FETCHED, status: 'failed', zoom: 1 },
    });
    const card = getByTestId('link-card-not-fetched');
    expect(card.textContent).toContain('https://example.com/articles/one');
    expect(getByRole('button', { name: /refetch/i })).toBeTruthy();
    expect(card.textContent).not.toContain('Fetching preview');
  });

  it('linkCard_fetching_showsTheSpinnerAndNoRefetchButton', () => {
    const { getByTestId, queryByRole } = render(LinkCard, {
      props: { payload: NOT_FETCHED, status: 'fetching', zoom: 1 },
    });
    expect(getByTestId('link-card-fetching').textContent).toContain('Fetching preview');
    expect(queryByRole('button', { name: /refetch/i })).toBeNull();
  });

  it('linkCard_theRefetchButtonClicked_firesOnRefetchOnce', async () => {
    const onRefetch = vi.fn();
    const { getByRole } = render(LinkCard, {
      props: { payload: NOT_FETCHED, status: 'failed', zoom: 1, onRefetch },
    });
    await fireEvent.click(getByRole('button', { name: /refetch/i }));
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });

  it('linkCard_belowLowZoom_drawsTheBandAndNoText', () => {
    const { getByTestId } = render(LinkCard, {
      props: { payload: FETCHED, status: 'ok', zoom: LOW_ZOOM - 0.01 },
    });
    const card = getByTestId('link-card');
    expect(card.querySelector('.band')).not.toBeNull();
    expect(card.textContent?.trim()).toBe('');
  });

  it('linkCard_aTitleCarryingAnImgTag_producesZeroImgElementsInTheBody', () => {
    const { getByTestId } = render(LinkCard, {
      props: {
        payload: { ...NO_PREVIEW, title: '<img src=x onerror=alert(1)>' },
        status: 'ok',
        zoom: 1,
      },
    });
    const body = getByTestId('link-card').querySelector('.body') as HTMLElement;
    expect(body.querySelectorAll('img')).toHaveLength(0);
    expect(body.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(body.innerHTML).toContain('&lt;img');
  });

  it('linkCard_theFaviconStandIn_isTheAccentSquareWhenFetchedAndNeutralWithNoPreview', () => {
    const { getByTestId, unmount } = render(LinkCard, {
      props: { payload: FETCHED, status: 'ok', zoom: 1 },
    });
    // A fetched favicon asset makes the square transparent so the picture shows through.
    const square = getByTestId('link-card').querySelector('.favicon') as HTMLElement;
    expect(square.classList.contains('has-image')).toBe(true);
    unmount();

    const second = render(LinkCard, { props: { payload: NO_PREVIEW, status: 'ok', zoom: 1 } });
    const plain = second.getByTestId('link-card').querySelector('.favicon') as HTMLElement;
    expect(plain.classList.contains('plain')).toBe(true);
    expect(plain.classList.contains('has-image')).toBe(false);
  });
});
