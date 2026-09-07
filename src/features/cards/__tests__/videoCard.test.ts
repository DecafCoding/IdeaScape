import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import VideoCard from '../VideoCard.svelte';
import { setAssetsFolder } from '../../../lib/assets.svelte';
import { ownsPress } from '../../../lib/pressTarget';
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

describe('VideoCard', () => {
  beforeEach(() => setAssetsFolder('C:/Project/assets'));
  afterEach(() => {
    cleanup();
    setAssetsFolder(null);
  });

  it('videoCard_fetched_drawsTheProviderMarkAndTheTitleAndNoPlayBadge', () => {
    const { getByTestId, queryByTestId } = render(VideoCard, {
      props: { payload: FETCHED, zoom: 1 },
    });
    const card = getByTestId('video-card');
    // The badge was removed on 2026-09-07: the card does not play, so it must not promise to.
    expect(queryByTestId('video-card-play')).toBeNull();
    expect(card.textContent).toContain('A Video Everyone Knows');
    expect(card.querySelectorAll('img')).toHaveLength(1);
    // The provider is a corner mark on the thumbnail, and its name is never drawn as text.
    const mark = getByTestId('video-card-provider');
    expect(mark.parentElement?.classList.contains('band')).toBe(true);
    expect(card.textContent).not.toContain('youtube');
  });

  it('videoCard_notFetched_fallsBackToTheAddress', () => {
    const { getByTestId } = render(VideoCard, { props: { payload: NOT_FETCHED, zoom: 1 } });
    const card = getByTestId('video-card');
    expect(card.textContent).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
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

  it('videoCard_theYouTubeMark_firesOnOpenOnceAndOwnsItsOwnPress', async () => {
    const onOpen = vi.fn();
    const { getByTestId } = render(VideoCard, { props: { payload: FETCHED, zoom: 1, onOpen } });
    const button = getByTestId('video-card-provider');
    expect(button.getAttribute('aria-label')).toBe('Open In Your Browser');

    // The card layer takes pointer capture on press and would otherwise swallow this click;
    // `ownsPress` is the check that makes it stand back.
    expect(ownsPress({ target: button })).toBe(true);

    await fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
    // The card body is not a target: pressing it must never reach `ownsPress`.
    expect(ownsPress({ target: getByTestId('video-card') })).toBe(false);
  });

  it('videoCard_aClickOnTheCardItself_neverOpensTheBrowser', async () => {
    const onOpen = vi.fn();
    const { getByTestId } = render(VideoCard, { props: { payload: FETCHED, zoom: 1, onOpen } });
    await fireEvent.click(getByTestId('video-card'));
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
