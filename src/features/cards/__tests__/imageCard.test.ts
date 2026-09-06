import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import ImageCard from '../ImageCard.svelte';
import { setAssetsFolder } from '../../../lib/assets';
import { LOW_ZOOM } from '../../../lib/geometry';
import type { ImagePayload } from '../../../lib/types';

vi.mock('../../../lib/ipc', () => ({
  invokeSafe: vi.fn(),
  toFileUrl: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  IpcError: class IpcError extends Error {},
}));

/** Vite hands the test environment no <style> text, so the rule itself is read from source. */
const source = readFileSync(resolve('src/features/cards/ImageCard.svelte'), 'utf8');

function payload(over: Partial<ImagePayload> = {}): ImagePayload {
  return {
    asset: 'deadbeef.png',
    natural_width: 1920,
    natural_height: 1080,
    alt: 'A steel truss',
    source_name: 'truss-reference.jpg',
    ...over,
  };
}

describe('ImageCard', () => {
  beforeEach(() => setAssetsFolder('C:/Project/assets'));
  afterEach(() => {
    cleanup();
    setAssetsFolder(null);
  });

  it('imageCard_thePicturePresent_rendersOneImgCarryingThePayloadAlt', () => {
    const { getByTestId } = render(ImageCard, {
      props: { payload: payload(), missing: false, zoom: 1, width: 320 },
    });
    const images = getByTestId('image-card').querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('alt')).toBe('A steel truss');
    expect(decodeURIComponent(images[0].getAttribute('src') ?? '')).toContain('deadbeef.png');
  });

  it('imageCard_missing_rendersNoImgAndSaysTheFileWasNotFound', () => {
    const { getByTestId } = render(ImageCard, {
      props: { payload: payload(), missing: true, zoom: 1, width: 320 },
    });
    const card = getByTestId('image-card-missing');
    expect(card.querySelectorAll('img')).toHaveLength(0);
    expect(card.textContent).toContain('File not found in assets/');
    expect(card.textContent).toContain('truss-reference.jpg');
  });

  it('imageCard_missing_drawsTheOnlyDashedBorderInTheInterface', () => {
    const { getByTestId } = render(ImageCard, {
      props: { payload: payload(), missing: true, zoom: 1, width: 320 },
    });
    const dashed = getByTestId('image-card-missing').querySelector('.dashed');
    expect(dashed).not.toBeNull();
    expect(source).toMatch(/\.dashed\s*\{[^}]*border:\s*1px dashed var\(--color-divider\)/);
  });

  it('imageCard_missing_neverReferencesTheDestructiveSecondAccent', () => {
    const { getByTestId } = render(ImageCard, {
      props: { payload: payload(), missing: true, zoom: 1, width: 320 },
    });
    expect(getByTestId('image-card-missing').outerHTML).not.toContain('accent-2');
    // Nor may the component's own stylesheet reach for the destructive accent (§9.4).
    expect(source).not.toContain('accent-2');
  });

  it('imageCard_missingBelowLowZoom_rendersNoTextNode', () => {
    const { getByTestId } = render(ImageCard, {
      props: { payload: payload(), missing: true, zoom: LOW_ZOOM - 0.01, width: 320 },
    });
    expect(getByTestId('image-card-missing').textContent?.trim()).toBe('');
  });

  it('imageCard_noAssetYet_drawsTheEmptyGroundWithTheOriginalName', () => {
    const { getByTestId } = render(ImageCard, {
      props: { payload: payload({ asset: null }), missing: false, zoom: 1, width: 320 },
    });
    const card = getByTestId('image-card-empty');
    expect(card.textContent).toContain('truss-reference.jpg');
    expect(card.querySelectorAll('img')).toHaveLength(0);
  });

  it('imageCard_aDecodedPictureWhosePayloadKnowsNoSize_reportsItOnceOnly', async () => {
    const onDecoded = vi.fn();
    const { getByTestId } = render(ImageCard, {
      props: {
        payload: payload({ natural_width: 0, natural_height: 0 }),
        missing: false,
        zoom: 1,
        width: 320,
        onDecoded,
      },
    });
    const img = getByTestId('image-card').querySelector('img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { value: 640, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 480, configurable: true });

    await fireEvent.load(img);
    await fireEvent.load(img);

    expect(onDecoded).toHaveBeenCalledTimes(1);
    expect(onDecoded).toHaveBeenCalledWith(640, 480);
  });

  it('imageCard_aPayloadThatAlreadyKnowsItsSize_reportsNothing', async () => {
    const onDecoded = vi.fn();
    const { getByTestId } = render(ImageCard, {
      props: { payload: payload(), missing: false, zoom: 1, width: 320, onDecoded },
    });
    const img = getByTestId('image-card').querySelector('img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { value: 640, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 480, configurable: true });
    await fireEvent.load(img);
    expect(onDecoded).not.toHaveBeenCalled();
  });

  it('imageCard_theSourceNameAndAlt_areTextAndAttributesRatherThanMarkup', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const { getByTestId } = render(ImageCard, {
      props: {
        payload: payload({ asset: null, source_name: hostile }),
        missing: false,
        zoom: 1,
        width: 320,
      },
    });
    const card = getByTestId('image-card-empty');
    expect(card.querySelectorAll('img')).toHaveLength(0);
    expect(card.textContent).toContain(hostile);
    // The characters are escaped in the markup, so they are text and never an element.
    expect(card.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(card.innerHTML).not.toContain('<img');
  });
});
