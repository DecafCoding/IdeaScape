/**
 * The pure match-splitting function. This is what lets the popover bold matches through
 * Svelte's normal escaping instead of `{@html}`.
 */
import { describe, expect, it } from 'vitest';
import { splitOnMatch } from '../highlight';

describe('splitOnMatch', () => {
  it('splitOnMatch_twoOccurrences_marksBoth', () => {
    expect(splitOnMatch('the rudder and the rudder again', 'rudder')).toEqual([
      { text: 'the ', match: false },
      { text: 'rudder', match: true },
      { text: ' and the ', match: false },
      { text: 'rudder', match: true },
      { text: ' again', match: false },
    ]);
  });

  it('splitOnMatch_differentCase_stillMatches', () => {
    // The match keeps the case the text had, not the case the user typed.
    expect(splitOnMatch('Rudder studies', 'rudder')).toEqual([
      { text: 'Rudder', match: true },
      { text: ' studies', match: false },
    ]);
    expect(splitOnMatch('rudder', 'RUDDER')).toEqual([{ text: 'rudder', match: true }]);
  });

  it('splitOnMatch_emptyQuery_isOneUnmatchedPart', () => {
    expect(splitOnMatch('anything', '')).toEqual([{ text: 'anything', match: false }]);
    expect(splitOnMatch('anything', '   ')).toEqual([{ text: 'anything', match: false }]);
    expect(splitOnMatch('anything', null)).toEqual([{ text: 'anything', match: false }]);
    expect(splitOnMatch('', 'anything')).toEqual([]);
  });

  it('splitOnMatch_regexCharactersInQuery_areTreatedAsText', () => {
    // indexOf, not a regular expression: a metacharacter is just a character.
    expect(splitOnMatch('a.b and axb', '.')).toEqual([
      { text: 'a', match: false },
      { text: '.', match: true },
      { text: 'b and axb', match: false },
    ]);
    expect(splitOnMatch('100% done', '100%')).toEqual([
      { text: '100%', match: true },
      { text: ' done', match: false },
    ]);
    expect(splitOnMatch('a(b)c', '(b)')).toEqual([
      { text: 'a', match: false },
      { text: '(b)', match: true },
      { text: 'c', match: false },
    ]);
  });

  it('splitOnMatch_matchAtBothEnds_addsNoEmptyParts', () => {
    expect(splitOnMatch('abcab', 'ab')).toEqual([
      { text: 'ab', match: true },
      { text: 'c', match: false },
      { text: 'ab', match: true },
    ]);
    // The whole string matching is one part, not three.
    expect(splitOnMatch('ab', 'ab')).toEqual([{ text: 'ab', match: true }]);
  });

  it('splitOnMatch_noMatch_isOneUnmatchedPart', () => {
    expect(splitOnMatch('the keel', 'rudder')).toEqual([{ text: 'the keel', match: false }]);
  });
});
