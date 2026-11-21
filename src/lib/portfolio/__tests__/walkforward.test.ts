import { describe, expect, it } from 'vitest';
import type { AlignedPanel } from '../../returns';
import { readFileSync } from 'node:fs';
import { walkForward } from '../walkforward';
import { runObservedWalkForward, type Por001Snapshot } from '../observed';

/** Deterministic LCG (Park–Miller) so tests need no random seed handling. */
function lcg(seed: number) {
  let s = seed;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

function makePanel(T: number, N: number, collinear = false): AlignedPanel {
  const rand = lcg(12345);
  // Unique sequential dates so index lookups are unambiguous.
  const epoch = Date.UTC(2024, 0, 1);
  const dates = Array.from({ length: T }, (_, i) => new Date(epoch + i * 86400000).toISOString().slice(0, 10));
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
    expect(r.summary.gmvMeanTargetWeightChange!).toBeGreaterThanOrEqual(0);
    expect(r.summary.gmvActualTurnover!.mean).toBeGreaterThanOrEqual(0);
    expect(r.summary.ewActualTurnover!.mean).toBeGreaterThan(0); // EW drifts, so rebalancing trades
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

describe('walkForward — buy-and-hold returns and actual turnover (F0 regression)', () => {
  it('matches a hand-computed buy-and-hold block and drifted weights', () => {
    // 2 assets, window 3, rebalance 3. Origin t=2, block = returns 3..5.
    const L = [[0.01, -0.02], [0.03, 0.01], [-0.01, 0.02], [0.02, -0.01], [-0.03, 0.04], [0.01, 0.005]];
    const panel: AlignedPanel = { dates: L.map((_, i) => `2024-01-0${i + 1}`), tickers: ['A', 'B'], values: L, dropped: {} };
    const r = walkForward(panel, { window: 3, rebalance: 3, estimator: 'sample', maxWeight: 1, longOnly: true });
    const o = r.origins[0];
    // Independent recomputation of the definition (EW leg, fixed weights 0.5/0.5).
    let w = [0.5, 0.5]; const rp: number[] = [];
    for (let t = 3; t < 6; t++) {
      const s = L[t].map(Math.exp).map((x) => x - 1);
      const p = w[0] * s[0] + w[1] * s[1];
      rp.push(p); w = [w[0] * (1 + s[0]) / (1 + p), w[1] * (1 + s[1]) / (1 + p)];
    }
    const mu = rp.reduce((a, v) => a + v, 0) / 3;
    const vol = Math.sqrt((rp.reduce((a, v) => a + (v - mu) ** 2, 0) / 2) * 252);
    expect(o.ewRealizedVol!).toBeCloseTo(vol, 14);
    expect(o.ewDriftedWeights![0]).toBeCloseTo(w[0], 14);
    expect(o.ewDriftedWeights![0] + o.ewDriftedWeights![1]).toBeCloseTo(1, 14);
  });

  // Reference values from an independent Python recalculation on the recorded
  // snapshot (POR-001 F0 reconciliation, 2026-11-21). Tolerance 1e-12 absolute.
  const snap = JSON.parse(readFileSync('src/lib/validation/fixtures/por001-snapshot.json', 'utf8')) as Por001Snapshot;
  const s = runObservedWalkForward(snap, 'test').outcome.summary;

  it('observed snapshot: buy-and-hold mean realized volatility', () => {
    expect(Math.abs(s.gmvMeanRealizedVol! - 0.0887169870602708)).toBeLessThan(1e-12);
    expect(Math.abs(s.ewMeanRealizedVol! - 0.1208663441134454)).toBeLessThan(1e-12);
  });

  it('observed snapshot: actual one-way turnover (GMV and EW)', () => {
    expect(s.gmvActualTurnover!.n).toBe(16);
    expect(Math.abs(s.gmvActualTurnover!.mean - 0.0620066745264357)).toBeLessThan(1e-12);
    expect(Math.abs(s.ewActualTurnover!.mean - 0.0168712087132582)).toBeLessThan(1e-12);
    expect(Math.abs(s.gmvMeanTargetWeightChange! - 0.058000289227528805)).toBeLessThan(1e-12);
  });
});
