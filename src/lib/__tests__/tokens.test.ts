/**
 * Static assertions over the token layer. The rule this file enforces is the phase's
 * "nothing moves between the two themes" promise: the dark palette redefines role colours
 * and nothing else.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

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

  it('tokens_theDialogElevationAndScrim_areDeclaredOnceLightAndTwiceDark', () => {
    // Phase 4's two additions. A token added to one of theme.css's two dark blocks and not
    // the other makes the System theme disagree with the explicit one.
    for (const name of ['--shadow-dialog', '--scrim']) {
      expect(lightNames.has(name)).toBe(true);
      expect(tokens.match(new RegExp(`${name}\\s*:`, 'g'))?.length).toBe(1);
      expect(theme.match(new RegExp(`${name}\\s*:`, 'g'))?.length).toBe(2);
    }
  });

  it('tokens_everyNewRoleToken_isDeclaredOnceLightAndTwiceDark', () => {
    // Phase 5's four. They exist so no component has to name a ramp step; a missing dark
    // declaration would leave the light value in place and the audit would be undone.
    for (const name of [
      '--color-accent-text',
      '--color-accent-hover',
      '--color-inset',
      '--color-inset-hover',
      '--color-accent-tint-hover',
      '--color-accent-2-hover',
      '--color-accent-2-tint-fill',
      '--color-accent-2-tint-text',
    ]) {
      expect(lightNames.has(name)).toBe(true);
      expect(tokens.match(new RegExp(`${name}\\s*:`, 'g'))?.length).toBe(1);
      expect(theme.match(new RegExp(`${name}\\s*:`, 'g'))?.length).toBe(2);
    }
  });

  it('tokens_theTwoDarkBlocks_declareTheSameTokenNames', () => {
    // The invariant the per-name count of two was approximating. If the explicit dark block
    // and the prefers-color-scheme block declare different sets, the System theme disagrees
    // with the chosen one on whatever is missing.
    const mediaAt = theme.indexOf('@media (prefers-color-scheme: dark)');
    expect(mediaAt).toBeGreaterThan(0);
    const attributeBlock = new Set(declaredNames(theme.slice(0, mediaAt)));
    const preferenceBlock = new Set(declaredNames(theme.slice(mediaAt)));
    expect([...attributeBlock].sort()).toEqual([...preferenceBlock].sort());
  });

  it('theme_theFourSettledShadows_useTheRecordedAlphas', () => {
    // Design-system §15.4 item 1, settled in Phase 5. The three DRAWN dark shadows occupy
    // .42–.50; the two overlays sit just above the card at .55, the knob at the top of that
    // band, and the picker card takes the card value §5.3 directs it to.
    const settled: Record<string, string> = {
      '--shadow-context-menu': '0 10px 28px rgba(0, 0, 0, 0.55)',
      '--shadow-search-popover': '0 12px 30px rgba(0, 0, 0, 0.55)',
      '--shadow-toggle-knob': '0 1px 3px rgba(0, 0, 0, 0.5)',
      '--shadow-picker-card': '0 2px 8px rgba(0, 0, 0, 0.42)',
    };
    for (const [name, value] of Object.entries(settled)) {
      expect(
        theme.match(new RegExp(`${name}: ${value.replace(/[()]/g, '\\$&')};`, 'g'))?.length,
      ).toBe(2);
    }
    // The interim note §15.4 left behind is gone, because the question is closed.
    expect(theme).not.toContain('until Phase 5');
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

  it('tokens_noComponent_referencesARampStepDirectly', () => {
    // Phase 5's dark-theme audit, made permanent. A ramp does not move between palettes, so a
    // ramp step named in a component is a colour that is wrong on dark by construction. Only
    // tokens.css and theme.css may name one; everything else goes through a role token.
    //
    // `--color-accent-2` itself IS a role token (it flips in theme.css), as are the Phase 5
    // additions whose names carry a `2`, so the pattern below matches a ramp step only.
    const rampStep = /--color-neutral-\d|--color-accent-2-\d|--color-accent-(?!2\b)(?!2-)\d/;

    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
      );
    }

    const sources = [
      ...walk(resolve('src/features')),
      resolve('src/app.svelte'),
      resolve('src/app.css'),
    ].filter((file) => ['.svelte', '.css', '.ts'].includes(extname(file)));

    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      // Styles only — a doc comment may name the ramp step a role token replaced.
      const styles = [...text.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
      const body = file.endsWith('.svelte') ? styles.join('\n') : text;
      for (const line of body.split('\n')) {
        if (rampStep.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
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
