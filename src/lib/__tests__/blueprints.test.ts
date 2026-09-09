import { beforeEach, describe, expect, it } from 'vitest';

import {
  fieldValueText,
  getBlueprint,
  allBlueprints,
  parseBlueprintPayload,
  parsePickEntries,
  parsePickEntry,
  scaleValue,
  setBlueprints,
  type Blueprint,
  type BlueprintField,
} from '../blueprints.svelte';

const CHARACTER: Blueprint = {
  id: 'character',
  label: 'Character',
  glyph: 'user-circle',
  sheet: true,
  default_size: { width: 220, height: 210 },
  fields: [
    {
      key: 'name',
      label: 'Name',
      kind: 'short-text',
      meaning: 'What the character is called.',
      show_on_face: true,
    },
    {
      key: 'openness',
      label: 'Openness',
      kind: 'scale',
      meaning: 'Seven notches.',
      show_on_face: false,
      low: 'Conventional',
      high: 'Curious',
      randomizable: true,
    },
  ],
};

const scaleField = CHARACTER.fields[1] as BlueprintField;

describe('parseBlueprintPayload', () => {
  beforeEach(() => setBlueprints([]));

  it('parseBlueprintPayload_malformedJson_returnsAnEmptyPayload', () => {
    expect(parseBlueprintPayload('not json at all')).toEqual({
      blueprint: '',
      name: '',
      detail_canvas_id: null,
      fields: {},
    });
  });

  it('parseBlueprintPayload_missingFields_returnsAnEmptyFieldMap', () => {
    const payload = parseBlueprintPayload('{"blueprint":"beat","name":"B"}');
    expect(payload.blueprint).toBe('beat');
    expect(payload.name).toBe('B');
    expect(payload.fields).toEqual({});
    expect(payload.detail_canvas_id).toBeNull();
  });

  it('parseBlueprintPayload_fieldsAsAnArray_readsAsAnEmptyFieldMap', () => {
    expect(parseBlueprintPayload('{"blueprint":"beat","fields":[1,2]}').fields).toEqual({});
  });

  it('parseBlueprintPayload_aDetailCanvasId_isCarried', () => {
    expect(parseBlueprintPayload('{"detail_canvas_id":7}').detail_canvas_id).toBe(7);
  });
});

describe('pick entries', () => {
  it('parsePickEntry_aTypedValue_hasNoIdAndNoSources', () => {
    expect(parsePickEntry({ text: 'Ark ship, becalmed' })).toEqual({
      id: null,
      text: 'Ark ship, becalmed',
      sources: [],
    });
  });

  it('parsePickEntry_aShippedValue_keepsItsIdAndSources', () => {
    expect(parsePickEntry({ id: 'trope.x', text: 'X', sources: ['story-tropes'] })).toEqual({
      id: 'trope.x',
      text: 'X',
      sources: ['story-tropes'],
    });
  });

  it('parsePickEntry_anEmptyOrMalformedValue_isNull', () => {
    expect(parsePickEntry(null)).toBeNull();
    expect(parsePickEntry({ text: '' })).toBeNull();
    expect(parsePickEntry(42)).toBeNull();
  });

  it('parsePickEntries_aNonArray_returnsAnEmptyList', () => {
    expect(parsePickEntries('nope')).toEqual([]);
    expect(parsePickEntries(undefined)).toEqual([]);
  });

  it('parsePickEntries_dropsMalformedMembersAndKeepsTheOrder', () => {
    const entries = parsePickEntries([{ text: 'A' }, null, { text: 'B' }]);
    expect(entries.map((e) => e.text)).toEqual(['A', 'B']);
  });
});

describe('the registry', () => {
  beforeEach(() => setBlueprints([]));

  it('getBlueprint_beforeSetBlueprints_returnsNull', () => {
    expect(getBlueprint('character')).toBeNull();
    expect(allBlueprints()).toEqual([]);
  });

  it('getBlueprint_afterSetBlueprints_returnsTheBlueprint', () => {
    setBlueprints([CHARACTER]);
    expect(getBlueprint('character')?.label).toBe('Character');
    expect(getBlueprint('nothing')).toBeNull();
  });
});

describe('fieldValueText', () => {
  it('fieldValueText_aScaleWithNoStoredValue_readsZero', () => {
    expect(fieldValueText(scaleField, undefined)).toBe('0');
    expect(scaleValue(undefined)).toBe(0);
  });

  it('fieldValueText_aScale_isSignedAndUsesATrueMinusSign', () => {
    expect(fieldValueText(scaleField, 2)).toBe('+2');
    expect(fieldValueText(scaleField, -2)).toBe('−2');
    expect(fieldValueText(scaleField, -2)).not.toContain('-');
  });

  it('scaleValue_clampsToMinusThreeToPlusThree', () => {
    expect(scaleValue(9)).toBe(3);
    expect(scaleValue(-9)).toBe(-3);
  });

  it('fieldValueText_aPickMany_joinsTheEntryTexts', () => {
    const field: BlueprintField = {
      key: 'themes',
      label: 'Themes',
      kind: 'pick-many',
      meaning: 'x',
      show_on_face: true,
      list: 'themes',
    };
    expect(fieldValueText(field, [{ id: null, text: 'Grief', sources: [] }])).toBe('Grief');
  });
});
