import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLYPHS } from '../glyphs';

const fonts = readFileSync(resolve('src/lib/fonts.css'), 'utf8');
const icons = readFileSync(resolve('src/lib/icons.css'), 'utf8');

describe('vendored assets', () => {
  it('assets_fontAndIconStylesheets_referenceNoNetworkHost', () => {
    expect(fonts).not.toMatch(/https?:\/\//);
    expect(icons).not.toMatch(/https?:\/\//);
  });

  it('assets_iconStylesheet_pullsTheRegularWeightOnly', () => {
    const imports = [...icons.matchAll(/@import\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['@phosphor-icons/web/regular']);
  });

  it('assets_fontStylesheet_pullsOnlyTheThreeFacesTheDesignUses', () => {
    expect(fonts).toContain('latin-400.css');
    expect(fonts).toContain('latin-600.css');
    expect(fonts).toContain('latin-400-italic.css');
    expect(fonts.match(/@import/g)?.length).toBe(3);
  });

  it('assets_glyphSet_holdsExactlyTheThirtyFourClosedNames', () => {
    expect(GLYPHS).toHaveLength(34);
    expect(new Set(GLYPHS).size).toBe(34);
  });
});
