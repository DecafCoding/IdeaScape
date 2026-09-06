import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import VideoCard from '../VideoCard.svelte';
import { setAssetsFolder } from '../../../lib/assets';
import type { VideoPayload } from '../../../lib/types';

vi.mock('../../../lib/ipc', () => ({
  invokeSafe: vi.fn(),
  toFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  IpcError: class IpcError extends Error {},
}));

const FETCHED: VideoPayload = {
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  provider: 'youtube',
  title: 'A Video Everyone Knows',
  thumbnail_asset: 't.jpg',
  fetched_at: '2026-09-06T10:00:00Z',
};

const NOT_FETCHED: VideoPayload = {
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  provider: 'youtube',
  title: '',
  thumbnail_asset: null,
  fetched_at: null,
};

/** A press then a click, `moved` pixels apart. */
async function pressAndClick(element: Element, moved: number) {
  await fireEvent.mouseDown(element, { clientX: 100, clientY: 100 });
  await fireEvent.click(element, { clientX: 100 + moved, clientY: 100 });
}

describe('VideoCard', () => {
  beforeEach(() => setAssetsFolder('C:/Project/assets'));
  afterEach(() => {
    cleanup();
    setAssetsFolder(null);
  });

  it('videoCard_fetched_drawsThePlayBadgeTheTitleAndTheInvitation', () => {
    const { getByTestId } = render(VideoCard, { props: { payload: FETCHED, zoom: 1 } });
    const card = getByTestId('video-card');
    expect(getByTestId('video-card-play')).toBeTruthy();
    expect(card.textContent).toContain('A Video Everyone Knows');
    expect(card.textContent).toContain('Click to open in your browser');
    expect(card.querySelectorAll('img')).toHaveLength(1);
  });

  it('videoCard_notFetched_fallsBackToTheAddressAndKeepsThePlayBadge', () => {
    const { getByTestId } = render(VideoCard, { props: { payload: NOT_FETCHED, zoom: 1 } });
    const card = getByTestId('video-card');
    expect(getByTestId('video-card-play')).toBeTruthy();
    expect(card.textContent).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(card.textContent).toContain('Click to open in your browser');
    expect(card.querySelectorAll('img')).toHaveLength(0);
  });

  it('videoCard_never_rendersAnIframeOrADurationChip', () => {
    const { getByTestId } = render(VideoCard, { props: { payload: FETCHED, zoom: 1 } });
    const card = getByTestId('video-card');
    expect(card.querySelector('iframe')).toBeNull();
    // The oEmbed response carries no duration, so no chip is drawn at all.
    expect(card.querySelector('.duration')).toBeNull();
    expect(card.textContent).not.toMatch(/\d+:\d\d/);
  });

  it('videoCard_aStationaryClick_firesOnOpenOnce', async () => {
    const onOpen = vi.fn();
    const { getByTestId } = render(VideoCard, { props: { payload: FETCHED, zoom: 1, onOpen } });
    await pressAndClick(getByTestId('video-card'), 0);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('videoCard_aClickAfterATwentyPixelPointerMove_neverOpensTheBrowser', async () => {
    const onOpen = vi.fn();
    const { getByTestId } = render(VideoCard, { props: { payload: FETCHED, zoom: 1, onOpen } });
    await pressAndClick(getByTestId('video-card'), 20);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('videoCard_aTitleCarryingMarkup_isTextRatherThanAnElement', () => {
    const { getByTestId } = render(VideoCard, {
      props: { payload: { ...FETCHED, title: '<script>alert(1)</script>' }, zoom: 1 },
    });
    const card = getByTestId('video-card');
    expect(card.querySelector('script')).toBeNull();
    expect(card.textContent).toContain('<script>alert(1)</script>');
  });
});
