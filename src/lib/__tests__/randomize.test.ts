import { describe, expect, it } from 'vitest';

import { rollScale, rollSpread, SCALE_WEIGHTS } from '../randomize';

/** A deterministic generator cycling a fixed list, so a test never depends on Math.random. */
function fixed(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('rollScale', () => {
  it('rollScale_neverReturnsAValueOutsideMinusThreeToPlusThree', () => {
    for (let i = 0; i < 5000; i += 1) {
      const value = rollScale();
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(3);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('rollScale_overALargeSample_matchesTheWeights1_3_6_8_6_3_1WithinTolerance', () => {
    // The RAW distribution, before the guarantee's redraw — measuring rollSpread here would
    // read heavy in the tails and the test would look broken.
    const runs = 120_000;
    const counts = new Array(7).fill(0);
    for (let i = 0; i < runs; i += 1) counts[rollScale() + 3] += 1;

    const total = SCALE_WEIGHTS.reduce((sum, w) => sum + w, 0);
    for (let i = 0; i < 7; i += 1) {
      const expected = SCALE_WEIGHTS[i] / total;
      const actual = counts[i] / runs;
      expect(Math.abs(actual - expected)).toBeLessThan(0.01);
    }
  });
});

describe('rollSpread', () => {
  it('rollSpread_overTenThousandRuns_neverLeavesEveryValueInsideMinusOneToPlusOne', () => {
    // The guarantee. PRD §11 names this assertion; it must run in well under a second.
    for (let run = 0; run < 10_000; run += 1) {
      const values = rollSpread(5);
      expect(values.some((v) => v <= -2 || v >= 2)).toBe(true);
    }
  });

  it('rollSpread_returnsOneValuePerSlider', () => {
    expect(rollSpread(5)).toHaveLength(5);
    expect(rollSpread(1)).toHaveLength(1);
    expect(rollSpread(0)).toHaveLength(0);
  });

  it('rollSpread_withAnInjectedGenerator_isDeterministic', () => {
    const seed = [0.05, 0.2, 0.5, 0.8, 0.95, 0.4, 0.6];
    expect(rollSpread(5, fixed(seed))).toEqual(rollSpread(5, fixed(seed)));
  });

  it('rollSpread_everyValueStaysInsideTheRange', () => {
    for (let run = 0; run < 2000; run += 1) {
      for (const value of rollSpread(5)) {
        expect(value).toBeGreaterThanOrEqual(-3);
        expect(value).toBeLessThanOrEqual(3);
      }
    }
  });

  it('rollSpread_aGeneratorThatAlwaysLandsInTheMiddle_stillReachesTheTails', () => {
    // 0.5 lands squarely on 0 every time, so the guarantee is the only thing that can save
    // this spread. It must not hang, and it must produce an edge.
    const values = rollSpread(5, () => 0.5);
    expect(values).toHaveLength(5);
    expect(values.some((v) => v <= -2 || v >= 2)).toBe(true);
  });
});
