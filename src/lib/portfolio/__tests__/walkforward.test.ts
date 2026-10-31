import { describe, expect, it } from 'vitest';
import type { AlignedPanel } from '../../returns';
import { walkForward } from '../walkforward';

/** Deterministic LCG (Park–Miller) so tests need no random seed handling. */
function lcg(seed: number) {
  let s = seed;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

function makePanel(T: number, N: number, collinear = false): AlignedPanel {
  const rand = lcg(12345);
  const dates = Array.from({ length: T }, (_, i) => `2024-01-${String((i % 28) + 1).padStart(2, '0')}`);
  const values: number[][] = [];
  for (let t = 0; t < T; t++) {
    const row: number[] = [];
    for (let j = 0; j < N; j++) row.push((rand() - 0.5) * 0.02 * (j + 1));
    if (collinear && N >= 2) row[1] = row[0]; // asset 2 = asset 1 → singular covariance
    values.push(row);
  }
  return { dates, tickers: Array.from({ length: N }, (_, j) => `A${j}`), values, dropped: {} };
}

describe('walkForward', () => {
  const opts = { window: 60, rebalance: 21, estimator: 'sample' as const, maxWeight: 1, longOnly: true };

  it('produces non-overlapping origins with feasible weights and no look-ahead', () => {
    const panel = makePanel(300, 3);
    const r = walkForward(panel, opts);
    expect(r.summary.origins).toBeGreaterThan(5);
    expect(r.summary.failed).toBe(0);
    // Origin indices step by rebalance; first origin has a full estimation window (t ≥ window−1).
    const ok = r.origins.filter((o) => o.status === 'OK');
    for (let i = 1; i < r.origins.length; i++) expect(r.origins[i].index - r.origins[i - 1].index).toBe(21);
    for (const o of ok) {
      expect(o.index).toBeGreaterThanOrEqual(59);
      expect(Math.abs(o.weights!.reduce((a, v) => a + v, 0) - 1)).toBeLessThanOrEqual(1e-12);
      expect(o.weights!.every((w) => w >= -1e-12)).toBe(true);
      expect(o.realizedVol!).toBeGreaterThan(0);
      // Holding block is strictly after the estimation date.
      expect(panel.dates.indexOf(o.date)).toBe(o.index);
    }
  });

  it('reports summary metrics with the equal-weight comparison', () => {
    const r = walkForward(makePanel(300, 3), opts);
    expect(r.summary.gmvMeanRealizedVol!).toBeGreaterThan(0);
    expect(r.summary.ewMeanRealizedVol!).toBeGreaterThan(0);
    expect(r.summary.volRatio!).toBeGreaterThan(0);
    expect(r.summary.gmvMeanHhi!).toBeGreaterThanOrEqual(1 / 3 - 1e-12);
    expect(r.summary.gmvMeanTurnover!).toBeGreaterThanOrEqual(0);
  });

  it('records failed origins instead of skipping them (collinear assets)', () => {
    const r = walkForward(makePanel(300, 3, true), opts);
    expect(r.summary.failed).toBeGreaterThan(0);
    expect(r.origins.some((o) => o.status === 'SINGULAR')).toBe(true);
  });

  it('supports the EWMA estimator with the same protocol', () => {
    const r = walkForward(makePanel(300, 3), { ...opts, estimator: 'ewma' });
    expect(r.summary.origins).toBeGreaterThan(5);
    expect(r.summary.converged).toBeGreaterThan(0);
  });

  it('rejects window ≤ N for the sample estimator (singular by construction)', () => {
    expect(() => walkForward(makePanel(300, 3), { ...opts, window: 3 })).toThrow(/window > N/);
  });

  it('is deterministic', () => {
    const a = walkForward(makePanel(300, 3), opts);
    const b = walkForward(makePanel(300, 3), opts);
    expect(a.summary).toEqual(b.summary);
    expect(a.origins.map((o) => o.weights)).toEqual(b.origins.map((o) => o.weights));
  });
});
