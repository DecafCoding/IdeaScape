import { describe, expect, it } from 'vitest';
import { decidePaste, type UrlClassification } from '../paste';

const VIDEO: UrlClassification = {
  kind: 'video',
  url: 'https://youtu.be/dQw4w9WgXcQ',
  provider: 'youtube',
  video_id: 'dQw4w9WgXcQ',
};
const LINK: UrlClassification = { kind: 'link', url: 'https://example.com/' };
const NONE: UrlClassification = { kind: 'none' };

describe('decidePaste', () => {
  it('decidePaste_internalCardsHeld_winsOverEverythingElse', () => {
    expect(
      decidePaste({
        hasCards: true,
        imageMimeType: 'image/png',
        text: 'https://youtu.be/dQw4w9WgXcQ',
        classification: VIDEO,
      }),
    ).toEqual({ kind: 'cards' });
  });

  it('decidePaste_aPictureOnTheClipboard_winsOverAnAddress', () => {
    expect(
      decidePaste({
        hasCards: false,
        imageMimeType: 'image/png',
        text: 'https://example.com/',
        classification: LINK,
      }),
    ).toEqual({ kind: 'image', mimeType: 'image/png' });
  });

  it('decidePaste_aYoutubeAddress_winsOverThePlainLinkPath', () => {
    expect(
      decidePaste({ hasCards: false, imageMimeType: null, text: 'x', classification: VIDEO }),
    ).toEqual({ kind: 'video', url: VIDEO.url, provider: 'youtube' });
  });

  it('decidePaste_aWebAddress_becomesALink', () => {
    expect(
      decidePaste({ hasCards: false, imageMimeType: null, text: 'x', classification: LINK }),
    ).toEqual({ kind: 'link', url: 'https://example.com/' });
  });

  it('decidePaste_plainProse_becomesANoteCarryingTheOriginalText', () => {
    const text = '  some words\nover two lines  ';
    expect(
      decidePaste({ hasCards: false, imageMimeType: null, text, classification: NONE }),
    ).toEqual({ kind: 'note', text });
  });

  it('decidePaste_noClassificationAtAll_stillBecomesANote', () => {
    expect(decidePaste({ hasCards: false, imageMimeType: null, text: 'words' })).toEqual({
      kind: 'note',
      text: 'words',
    });
  });

  it('decidePaste_anEmptyOrWhitespaceClipboard_isNothing', () => {
    expect(decidePaste({ hasCards: false, imageMimeType: null, text: '' })).toEqual({
      kind: 'none',
    });
    expect(decidePaste({ hasCards: false, imageMimeType: null, text: '   \n ' })).toEqual({
      kind: 'none',
    });
  });
});
