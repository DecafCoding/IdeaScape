import { describe, expect, it } from 'vitest';

import { groupForFilter, matchEntries, sortForFilter, type ListEntry } from '../lists';

const entry = (text: string, tags: string[] = []): ListEntry => ({ id: `id.${text}`, text, tags });

const ENTRIES: ListEntry[] = [
  entry('Ark ship', ['genre.rigor']),
  entry('Becalmed', []),
  entry('Cold sleep', ['genre.rigor', 'genre.time-reality']),
  entry('Dyson swarm', ['genre.scope-setting']),
];

describe('sortForFilter', () => {
  it('sortForFilter_aTaggedParent_putsMatchingEntriesFirstAndKeepsEveryOther', () => {
    const sorted = sortForFilter(ENTRIES, 'genre.rigor');
    expect(sorted.map((e) => e.text)).toEqual(['Ark ship', 'Cold sleep', 'Becalmed', 'Dyson swarm']);
  });

  it('sortForFilter_returnsTheSameNumberOfEntriesItWasGiven', () => {
    expect(sortForFilter(ENTRIES, 'genre.rigor')).toHaveLength(ENTRIES.length);
    expect(sortForFilter(ENTRIES, 'genre.nothing-matches')).toHaveLength(ENTRIES.length);
  });

  it('sortForFilter_aNullParent_returnsTheInputOrderUnchanged', () => {
    expect(sortForFilter(ENTRIES, null).map((e) => e.text)).toEqual(ENTRIES.map((e) => e.text));
  });

  it('sortForFilter_anUntaggedEntry_sortsBelowButIsStillPresent', () => {
    const sorted = sortForFilter(ENTRIES, 'genre.rigor');
    expect(sorted.map((e) => e.text)).toContain('Becalmed');
    expect(sorted.findIndex((e) => e.text === 'Becalmed')).toBeGreaterThan(
      sorted.findIndex((e) => e.text === 'Cold sleep'),
    );
  });

  it('sortForFilter_calledTwice_producesTheSameOrder', () => {
    const first = sortForFilter(ENTRIES, 'genre.rigor').map((e) => e.text);
    const second = sortForFilter(ENTRIES, 'genre.rigor').map((e) => e.text);
    expect(first).toEqual(second);
  });

  it('sortForFilter_doesNotMutateTheInput', () => {
    const before = ENTRIES.map((e) => e.text);
    sortForFilter(ENTRIES, 'genre.rigor');
    expect(ENTRIES.map((e) => e.text)).toEqual(before);
  });
});

describe('groupForFilter', () => {
  it('groupForFilter_aTaggedParent_returnsTwoGroupsHeadedByTheParentAndEverythingElse', () => {
    const groups = groupForFilter(ENTRIES, 'genre.rigor', 'Rigor');
    expect(groups).toHaveLength(2);
    expect(groups[0].heading).toBe('Rigor');
    expect(groups[0].dimmed).toBe(false);
    expect(groups[0].entries.map((e) => e.text)).toEqual(['Ark ship', 'Cold sleep']);
    expect(groups[1].heading).toBe('Everything else');
    expect(groups[1].dimmed).toBe(true);
    expect(groups[1].entries.map((e) => e.text)).toEqual(['Becalmed', 'Dyson swarm']);
  });

  it('groupForFilter_aNullParent_returnsOneUnheadedGroupHoldingEverything', () => {
    const groups = groupForFilter(ENTRIES, null, 'Rigor');
    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBeNull();
    expect(groups[0].entries).toHaveLength(4);
  });

  it('groupForFilter_hidesNothing', () => {
    const groups = groupForFilter(ENTRIES, 'genre.rigor', 'Rigor');
    const total = groups.reduce((n, g) => n + g.entries.length, 0);
    expect(total).toBe(ENTRIES.length);
  });
});

describe('matchEntries', () => {
  it('matchEntries_isCaseInsensitiveAndPreservesOrder', () => {
    expect(matchEntries(ENTRIES, 'S').map((e) => e.text)).toEqual([
      'Ark ship',
      'Cold sleep',
      'Dyson swarm',
    ]);
  });

  it('matchEntries_anEmptyQuery_returnsEverything', () => {
    expect(matchEntries(ENTRIES, '   ')).toHaveLength(4);
  });
});
