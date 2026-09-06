import { describe, expect, it } from 'vitest';
import {
  cardTitle,
  parseImagePayload,
  parseLinkPayload,
  parseNotePayload,
  parseVideoPayload,
  payloadAssetNames,
  urlHost,
  type Item,
  type ItemKind,
} from '../types';

function item(kind: ItemKind, payload: string, id = 7): Item {
  return {
    id,
    project_id: 1,
    kind,
    payload,
    created_at: '2026-09-06T00:00:00Z',
    updated_at: '2026-09-06T00:00:00Z',
  };
}

describe('payload parsers', () => {
  it('parseImagePayload_anEmptyObject_returnsAFullyPopulatedDefault', () => {
    expect(parseImagePayload('{}')).toEqual({
      asset: null,
      natural_width: 0,
      natural_height: 0,
      alt: '',
      source_name: '',
    });
  });

  it('parseImagePayload_malformedJson_returnsTheDefaultRatherThanThrowing', () => {
    expect(() => parseImagePayload('not json')).not.toThrow();
    expect(parseImagePayload('not json').asset).toBeNull();
  });

  it('parseImagePayload_aWellFormedPayload_roundTrips', () => {
    const payload = {
      asset: 'ab12.png',
      natural_width: 1920,
      natural_height: 1080,
      alt: 'A truss',
      source_name: 'truss-reference.jpg',
    };
    expect(parseImagePayload(JSON.stringify(payload))).toEqual(payload);
  });

  it('parseLinkPayload_anEmptyObject_returnsAFullyPopulatedDefault', () => {
    expect(parseLinkPayload('{}')).toEqual({
      url: '',
      title: '',
      description: '',
      favicon_asset: null,
      thumbnail_asset: null,
      fetched_at: null,
    });
  });

  it('parseLinkPayload_malformedJson_returnsTheDefault', () => {
    expect(parseLinkPayload('[[[').url).toBe('');
  });

  it('parseLinkPayload_aWellFormedPayload_roundTrips', () => {
    const payload = {
      url: 'https://example.com/a',
      title: 'A Page',
      description: 'About it',
      favicon_asset: 'f.ico',
      thumbnail_asset: 't.png',
      fetched_at: '2026-09-06T10:00:00Z',
    };
    expect(parseLinkPayload(JSON.stringify(payload))).toEqual(payload);
  });

  it('parseVideoPayload_anEmptyObject_defaultsTheProviderToYoutube', () => {
    expect(parseVideoPayload('{}')).toEqual({
      url: '',
      provider: 'youtube',
      title: '',
      thumbnail_asset: null,
      fetched_at: null,
    });
  });

  it('parseVideoPayload_malformedJson_stillDefaultsTheProvider', () => {
    expect(parseVideoPayload('nope').provider).toBe('youtube');
  });

  it('parseVideoPayload_aWellFormedPayload_roundTrips', () => {
    const payload = {
      url: 'https://youtu.be/dQw4w9WgXcQ',
      provider: 'youtube',
      title: 'A Video',
      thumbnail_asset: 't.jpg',
      fetched_at: '2026-09-06T10:00:00Z',
    };
    expect(parseVideoPayload(JSON.stringify(payload))).toEqual(payload);
  });

  it('parseNotePayload_isUnchanged_byTheOtherThreeLanding', () => {
    expect(parseNotePayload('{"title":"T","text":"b"}')).toEqual({ title: 'T', text: 'b' });
  });
});

describe('cardTitle', () => {
  it('cardTitle_aNoteWithATitle_returnsTheTitle', () => {
    expect(cardTitle(item('note', '{"title":"My Note","text":""}'))).toBe('My Note');
  });

  it('cardTitle_anImage_returnsTheOriginalFileName', () => {
    expect(cardTitle(item('image', '{"asset":"h.png","source_name":"truss.jpg"}'))).toBe(
      'truss.jpg',
    );
  });

  it('cardTitle_aLinkWithNoTitle_fallsBackToTheHost', () => {
    expect(cardTitle(item('link', '{"url":"https://example.com/deep/page"}'))).toBe('example.com');
  });

  it('cardTitle_aVideoWithATitle_returnsTheTitle', () => {
    expect(cardTitle(item('video', '{"url":"https://youtu.be/x","title":"Clip"}'))).toBe('Clip');
  });

  it('cardTitle_nothingUsable_fallsBackToKindAndPaddedId', () => {
    expect(cardTitle(item('link', '{}', 4))).toBe('link-004');
  });
});

describe('payloadAssetNames', () => {
  it('payloadAssetNames_aFullyFetchedLink_returnsBothNames', () => {
    const payload = '{"url":"https://x/","favicon_asset":"f.ico","thumbnail_asset":"t.png"}';
    expect(payloadAssetNames('link', payload)).toEqual(['f.ico', 't.png']);
  });

  it('payloadAssetNames_aNote_returnsNone', () => {
    expect(payloadAssetNames('note', '{"title":"T","text":""}')).toEqual([]);
  });

  it('payloadAssetNames_anImageWithNoAsset_returnsNone', () => {
    expect(payloadAssetNames('image', '{}')).toEqual([]);
  });
});

describe('urlHost', () => {
  it('urlHost_anAddressThatDoesNotParse_returnsAnEmptyString', () => {
    expect(urlHost('just some words')).toBe('');
  });

  it('urlHost_anAddress_returnsItsHost', () => {
    expect(urlHost('https://www.example.com:8080/x')).toBe('www.example.com:8080');
  });
});
