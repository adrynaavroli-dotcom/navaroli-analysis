import { describe, expect, it } from 'vitest';
import { annualizedVol, effectiveN, equalWeights, hhi, portfolioVariance, turnover } from '../metrics';

describe('portfolio metrics', () => {
  const S = [[0.04, 0.006], [0.006, 0.01]];

  it('portfolioVariance matches the hand computation', () => {
    // w = [0.5, 0.5]: 0.25·0.04 + 2·0.25·0.006 + 0.25·0.01 = 0.0155
    expect(portfolioVariance([0.5, 0.5], S)).toBeCloseTo(0.0155, 15);
  });

  it('annualizedVol uses √252', () => {
    expect(annualizedVol([1, 0], S)).toBeCloseTo(Math.sqrt(0.04 * 252), 12);
  });

  it('hhi and effectiveN: equal weights → 1/N and N; single asset → 1 and 1', () => {
    expect(hhi([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.25, 15);
    expect(effectiveN([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(4, 12);
    expect(hhi([1, 0, 0])).toBe(1);
    expect(effectiveN([1, 0, 0])).toBe(1);
  });

  it('turnover sums absolute weight changes', () => {
    expect(turnover([0.5, 0.5], [0.7, 0.3])).toBeCloseTo(0.4, 15);
    expect(turnover([0.5, 0.5], [0.5, 0.5])).toBe(0);
  });

  it('equalWeights sums to 1', () => {
    const w = equalWeights(5);
    expect(w).toHaveLength(5);
    expect(w.reduce((a, v) => a + v, 0)).toBeCloseTo(1, 15);
  });
});
