/**
 * Static assertions over the token layer. The rule this file enforces is the phase's
 * "nothing moves between the two themes" promise: the dark palette redefines role colours
 * and nothing else.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const tokens = readFileSync(resolve('src/lib/tokens.css'), 'utf8');
const theme = readFileSync(resolve('src/lib/theme.css'), 'utf8');

function declaredNames(css: string): string[] {
  return [...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]);
}

const lightNames = new Set(declaredNames(tokens));
const darkNames = new Set(declaredNames(theme));

describe('the token layer', () => {
  it('tokens_darkBlock_redefinesOnlyTokensTheLightBlockAlreadyDeclares', () => {
    const orphans = [...darkNames].filter((name) => !lightNames.has(name));
    expect(orphans).toEqual([]);
  });

  it('tokens_darkBlock_redefinesNoMeasurementToken', () => {
    const measurementPrefixes = [
      '--radius-',
      '--space-',
      '--duration-',
      '--text-',
      '--tracking-',
      '--size-',
      '--z-',
      '--font-',
    ];
    const moved = [...darkNames].filter((name) =>
      measurementPrefixes.some((prefix) => name.startsWith(prefix)),
    );
    expect(moved).toEqual([]);
  });

  it('tokens_grounds_areEachDeclaredExactlyOnceInTheirOwnFile', () => {
    expect(tokens.match(/#f3f2f2/g)?.length).toBe(1);
    expect(theme.match(/#1a1817/g)?.length).toBe(2); // once per dark block
  });

  it('tokens_broadsheetLeftovers_areNotShipped', () => {
    expect(tokens).not.toMatch(/@import/);
    expect(tokens).not.toMatch(/process-yellow/);
    expect(tokens).not.toMatch(/--space-1\s*:/);
  });

  it('tokens_ease_isTheOneCurveTheDesignSystemAllows', () => {
    expect(tokens).toContain('--ease: cubic-bezier(0.2, 0, 0.2, 1)');
    expect(tokens.match(/cubic-bezier/g)?.length).toBe(1);
  });

  it('tokens_theTwoNewElevations_arePresentAndNamed', () => {
    expect(lightNames.has('--shadow-card-drag')).toBe(true);
    expect(lightNames.has('--shadow-textbar')).toBe(true);
  });

  it('tokens_darkBlock_appearsUnderBothTheAttributeAndThePreference', () => {
    expect(theme).toContain(":root[data-theme='dark']");
    expect(theme).toContain('@media (prefers-color-scheme: dark)');
    expect(theme).toContain(":root:not([data-theme='light'])");
  });

  it('tokens_thinScrollbarAndFocusRing_areGlobalRules', () => {
    expect(tokens).toContain('scrollbar-width: thin');
    expect(tokens).toContain('outline: 2px solid var(--color-accent)');
    expect(tokens).toContain('outline-offset: 2px');
  });

  it('tokens_reducedMotion_zeroesTheRiseSlideAndZoomDurations', () => {
    const block = tokens.slice(tokens.indexOf('prefers-reduced-motion'));
    expect(block).toContain('--duration-110: 0ms');
    expect(block).toContain('--duration-140: 0ms');
    expect(block).toContain('--duration-160: 0ms');
    // Hover tints and the spinner carry state, so their durations survive.
    expect(block).not.toContain('--duration-90: 0ms');
    expect(block).not.toContain('--duration-spinner');
  });
});
