import { describe, expect, it } from 'vitest';

import { ROLES, roleGlyph, roleIsDrawn, roleLabel, suggestRole } from '../roles';

describe('suggestRole', () => {
  it('suggestRole_beatToScene_isFeeds', () => {
    expect(suggestRole('beat', 'scene')).toBe('feeds');
  });

  it('suggestRole_chapterToBook_isPartOf', () => {
    expect(suggestRole('chapter', 'book')).toBe('part-of');
  });

  it('suggestRole_characterToScene_isAppearsIn', () => {
    expect(suggestRole('character', 'scene')).toBe('appears-in');
    expect(suggestRole('character', 'chapter')).toBe('appears-in');
  });

  it('suggestRole_beatToChapter_isFeedsAndIsNeverRefused', () => {
    // A Beat joined straight to a Chapter is a real way to write. The suggestion is a
    // default, never a rule, and no pair is ever refused.
    expect(suggestRole('beat', 'chapter')).toBe('feeds');
  });

  it('suggestRole_aNoteToACharacter_isNull', () => {
    expect(suggestRole(null, 'character')).toBeNull();
    expect(suggestRole('character', null)).toBeNull();
    expect(suggestRole(null, null)).toBeNull();
  });

  it('suggestRole_anUnlistedPair_isNullAndStillAllowed', () => {
    expect(suggestRole('book', 'beat')).toBeNull();
    expect(suggestRole('location', 'book')).toBeNull();
  });

  it('suggestRole_sceneToScene_isFollows', () => {
    expect(suggestRole('scene', 'scene')).toBe('follows');
    expect(suggestRole('chapter', 'chapter')).toBe('follows');
  });

  it('suggestRole_locationToScene_isSetIn', () => {
    expect(suggestRole('location', 'scene')).toBe('set-in');
  });
});

describe('roleLabel', () => {
  it('roleLabel_partOfReversed_readsContains', () => {
    expect(roleLabel('part-of', false)).toBe('Part Of');
    // Contains is not an eighth role — it is Part Of read from the other end.
    expect(roleLabel('part-of', true)).toBe('Contains');
    expect(ROLES.some((r) => r.label === 'Contains')).toBe(false);
  });

  it('roleLabel_aTypedRole_returnsItsOwnTextAndTheNeutralGlyph', () => {
    expect(roleLabel('haunts')).toBe('haunts');
    expect(roleGlyph('haunts')).toBe('minus');
  });

  it('roleLabel_null_readsRelatesTo', () => {
    expect(roleLabel(null)).toBe('Relates To');
    expect(roleLabel(undefined)).toBe('Relates To');
  });

  it('roleLabel_reversalOnlyAffectsPartOf', () => {
    expect(roleLabel('feeds', true)).toBe('Feeds');
    expect(roleLabel('appears-in', true)).toBe('Appears In');
  });
});

describe('roleIsDrawn', () => {
  it('roleIsDrawn_nullAndRelatesTo_drawNothing', () => {
    // Both must be indistinguishable on screen; that is why no back-fill was needed.
    expect(roleIsDrawn(null)).toBe(false);
    expect(roleIsDrawn('relates-to')).toBe(false);
  });

  it('roleIsDrawn_theOtherSixRoles_drawARestGlyph', () => {
    for (const role of ROLES) {
      if (role.key === 'relates-to') continue;
      expect(roleIsDrawn(role.key)).toBe(true);
    }
  });

  it('roles_areTheSevenNamedInTheDesignSystem', () => {
    expect(ROLES.map((r) => r.key)).toEqual([
      'feeds',
      'follows',
      'part-of',
      'appears-in',
      'told-by',
      'set-in',
      'relates-to',
    ]);
  });
});
