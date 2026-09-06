import { describe, expect, it } from 'vitest';
import { relativeTime } from '../relativeTime';
import { imageFitBox, LINK_SIZE, NOTE_SIZE, VIDEO_SIZE } from '../cardKinds';
import { MIN_CARD_SIZE } from '../geometry';

/** A frozen clock, so the phrasing is asserted at fixed offsets rather than against now. */
const NOW = Date.parse('2026-09-06T12:00:00Z');

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe('relativeTime', () => {
  it('relativeTime_twentySecondsAgo_readsJustNow', () => {
    expect(relativeTime(ago(20_000), NOW)).toBe('just now');
  });

  it('relativeTime_twoMinutesAgo_readsTwoMinAgo', () => {
    expect(relativeTime(ago(2 * 60_000), NOW)).toBe('2 min ago');
  });

  it('relativeTime_oneMinuteAgo_stillReadsMinRatherThanMins', () => {
    expect(relativeTime(ago(90_000), NOW)).toBe('1 min ago');
  });

  it('relativeTime_threeHoursAgo_readsThreeHoursAgo', () => {
    expect(relativeTime(ago(3 * 3_600_000), NOW)).toBe('3 hours ago');
    expect(relativeTime(ago(3_600_000), NOW)).toBe('1 hour ago');
  });

  it('relativeTime_threeDaysAgo_readsThreeDaysAgo', () => {
    expect(relativeTime(ago(3 * 86_400_000), NOW)).toBe('3 days ago');
    expect(relativeTime(ago(86_400_000), NOW)).toBe('1 day ago');
  });

  it('relativeTime_nullOrUnparseable_readsAsNothing', () => {
    expect(relativeTime(null, NOW)).toBe('');
    expect(relativeTime('not a date', NOW)).toBe('');
  });
});

describe('cardKinds', () => {
  it('defaultSizes_areTheDrawnValuesFromTheDesignSystem', () => {
    expect(NOTE_SIZE).toEqual({ width: 236, height: 150 });
    expect(LINK_SIZE).toEqual({ width: 236, height: 236 });
    expect(VIDEO_SIZE).toEqual({ width: 272, height: 246 });
  });

  it('imageFitBox_aLandscapePicture_scalesIntoTheBoxKeepingItsAspectRatio', () => {
    const size = imageFitBox(1920, 1080, 320);
    expect(size.width).toBe(320);
    expect(size.height).toBe(180);
  });

  it('imageFitBox_aPortraitPicture_scalesOnItsHeight', () => {
    const size = imageFitBox(1080, 1920, 320);
    expect(size.height).toBe(320);
    expect(size.width).toBe(180);
  });

  it('imageFitBox_aPictureSmallerThanTheBox_keepsItsOwnSize', () => {
    expect(imageFitBox(120, 80, 320)).toEqual({ width: 120, height: 80 });
  });

  it('imageFitBox_aVeryThinPicture_isFlooredAtTheMinimumCardSize', () => {
    const size = imageFitBox(4000, 10, 320);
    expect(size.height).toBe(MIN_CARD_SIZE);
  });

  it('imageFitBox_unknownDimensions_fallsBackToTheWholeBox', () => {
    expect(imageFitBox(0, 0, 320)).toEqual({ width: 320, height: 320 });
    expect(imageFitBox(Number.NaN, 100, 320)).toEqual({ width: 320, height: 320 });
  });
});
