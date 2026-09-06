/**
 * The measurement design-system §15.4 item 2 and §12.9 asked for, taken rather than
 * eyeballed. The WCAG 2.1 relative-luminance and contrast-ratio formulas are implemented
 * here, in the test, and applied to hex values read out of the token files — so a later
 * palette edit that breaks one of these pairs fails the suite instead of shipping.
 *
 * The token files are read as text. jsdom does not resolve custom properties, and
 * `--color-divider` and the tints are `color-mix()` expressions rather than hexes, so this
 * file only ever looks up tokens it names.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const tokens = readFileSync(resolve('src/lib/tokens.css'), 'utf8');
const theme = readFileSync(resolve('src/lib/theme.css'), 'utf8');

/** The value of one named token, as a hex string. Throws if it is not a plain hex. */
function hex(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`${name} is not declared as a plain hex in that file`);
  return match[1];
}

type Rgb = [number, number, number];

function toRgb(value: string): Rgb {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.1 relative luminance. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, (L1 + 0.05) / (L2 + 0.05). */
function contrast(a: string, b: string): number {
  const la = luminance(toRgb(a));
  const lb = luminance(toRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Ink at `alpha` opacity over an opaque ground, composited, then measured. */
function contrastAtOpacity(ink: string, ground: string, alpha: number): number {
  const i = toRgb(ink);
  const g = toRgb(ground);
  const mixed = g.map((channel, index) =>
    Math.round(channel * (1 - alpha) + i[index] * alpha),
  ) as Rgb;
  const lm = luminance(mixed);
  const lg = luminance(g);
  const [hi, lo] = lm > lg ? [lm, lg] : [lg, lm];
  return (hi + 0.05) / (lo + 0.05);
}

const round = (n: number) => Math.round(n * 10) / 10;

describe('the unmeasured contrast pairs', () => {
  it('contrast_accent2On400OnTheDarkSurface_clears4point5', () => {
    // §15.4's open item: the destructive accent as ink on the dark surface. It is the
    // Delete button's label and the destructive context-menu rows.
    const ink = hex(tokens, '--color-accent-2-400'); // #ff90b1
    const ground = hex(theme, '--color-surface'); // #262322
    const ratio = contrast(ink, ground);
    expect({ pair: `${ink} on ${ground}`, ratio: round(ratio) }).toEqual({
      pair: '#ff90b1 on #262322',
      ratio: 7.3,
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('contrast_darkOnAccentInkOnTheDestructiveFill_clears4point5', () => {
    // The other half of the same pair: the dark theme's on-accent ink over a #ff90b1 fill.
    const ink = hex(theme, '--color-on-accent'); // #151312
    const fill = hex(tokens, '--color-accent-2-400'); // #ff90b1
    const ratio = contrast(ink, fill);
    expect({ pair: `${ink} on ${fill}`, ratio: round(ratio) }).toEqual({
      pair: '#151312 on #ff90b1',
      ratio: 8.7,
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('contrast_theThreeOpacitySteps_areMeasurableInBothPalettes', () => {
    // §12.2 asks that the .42 / .40 / .38 dimming steps be measured before sign-off. They
    // are informational — the design has already committed to them — so this records the
    // ratios rather than gating on a threshold the design did not set.
    const measured: Record<string, number> = {};
    for (const [palette, ink, ground] of [
      ['light', hex(tokens, '--color-text'), hex(tokens, '--color-bg')],
      ['dark', hex(theme, '--color-text'), hex(theme, '--color-bg')],
    ] as const) {
      for (const step of [0.42, 0.4, 0.38]) {
        const ratio = contrastAtOpacity(ink, ground, step);
        measured[`${palette} @ ${step}`] = round(ratio);
        expect(Number.isFinite(ratio)).toBe(true);
        expect(ratio).toBeGreaterThan(1);
      }
    }
    expect(Object.keys(measured)).toHaveLength(6);
    // Recorded, so a palette edit that flattens a dimming step shows up as a diff here.
    expect(measured).toEqual({
      'light @ 0.42': 2.5,
      'light @ 0.4': 2.4,
      'light @ 0.38': 2.3,
      'dark @ 0.42': 3.6,
      'dark @ 0.4': 3.4,
      'dark @ 0.38': 3.2,
    });
  });
});
