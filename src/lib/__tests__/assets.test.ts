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

  it('assets_fontStylesheet_pullsOnlyTheLatinFacesTheThreeChoicesUse', () => {
    const imports = [...fonts.matchAll(/@import\s+'([^']+)'/g)].map((m) => m[1]);
    // Three faces each for the two full families, one for the single-weight hand.
    expect(imports).toEqual([
      '@fontsource/source-serif-4/latin-400.css',
      '@fontsource/source-serif-4/latin-600.css',
      '@fontsource/source-serif-4/latin-400-italic.css',
      '@fontsource/inter/latin-400.css',
      '@fontsource/inter/latin-600.css',
      '@fontsource/inter/latin-400-italic.css',
      '@fontsource/patrick-hand/latin-400.css',
    ]);
  });

  it('assets_glyphSet_holdsExactlyTheThirtyThreeClosedNames', () => {
    expect(GLYPHS).toHaveLength(33);
    expect(new Set(GLYPHS).size).toBe(33);
  });
});
