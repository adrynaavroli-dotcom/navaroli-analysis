/**
 * VOL-004 GJR-GARCH(1,1,1) unit/numerical tests. Deterministic: committed synthetic fixture
 * (validation/python/benchmark_vol004.py) and closed-form cases. The arch benchmark runs
 * separately (bun validation/run-vol004.ts).
 */
import { describe, it, expect } from 'vitest';
import { fitGarch, garchBackcast, garchRecursion, garchVarianceBounds, GARCH_SCALE } from '../garch';
import {
  fitGjrGarch, gjrRecursion, gjrToParams, gjrFromParams, gjrPersistence, gjrNextVariance, gjrGarchModel,
  tryFitGjrGarch, GjrInputError, type GjrParams,
} from '../gjr-garch';
import { TRADING_DAYS } from '../types';
import fx from '../../validation/fixtures/vol004-benchmark.json';

const toR = (y: number[]) => y.map((v) => v / GARCH_SCALE);
const RA = toR(fx.cases.gjr_asymmetric_n2000.y);
const FIT = fitGjrGarch(RA);

describe('GJR recursion', () => {
  it('hand-computed h_0..h_2 with t=0 term (α+γ/2+β)·b and asymmetry only after a negative shock', () => {
    const p: GjrParams = { mu: 0, omega: 0.1, alpha: 0.1, gamma: 0.2, beta: 0.7 }, b = 2;
    const h = gjrRecursion([1, -1, 2], p, b).h;
    const h0 = 0.1 + (0.1 + 0.1 + 0.7) * 2, h1 = 0.1 + 0.1 * 1 + 0.7 * h0, h2 = 0.1 + 0.3 * 1 + 0.7 * h1;
    expect(h[0]).toBeCloseTo(h0, 14); expect(h[1]).toBeCloseTo(h1, 14); expect(h[2]).toBeCloseTo(h2, 14);
  });
  it('indicator applies to ε = r − μ, not to the raw return; ε = 0 counts as non-negative', () => {
    const p: GjrParams = { mu: 0.5, omega: 0.1, alpha: 0.1, gamma: 0.4, beta: 0.5 };
    // r_0 = 0.2 > 0 but ε_0 = −0.3 < 0 → asymmetric coefficient used.
    expect(gjrRecursion([0.2, 0], p, 1).h[1]).toBeCloseTo(0.1 + 0.5 * 0.09 + 0.5 * gjrRecursion([0.2, 0], p, 1).h[0], 14);
    // ε_0 = 0 → no γ contribution (ε² = 0 anyway) and r_0 = μ gives the symmetric branch.
    const h = gjrRecursion([0.5, 0], p, 1).h; expect(h[1]).toBeCloseTo(0.1 + 0.5 * h[0], 14);
  });
  it('γ = 0 reproduces the VOL-003 GARCH recursion exactly (same backcast and bounds)', () => {
    const y = fx.cases.gjr_asymmetric_n2000.y, m = y.reduce((a, b) => a + b, 0) / y.length, e0 = y.map((v) => v - m);
    const b = garchBackcast(e0), bd = garchVarianceBounds(e0), q = { mu: 0.05, omega: 0.02, alpha: 0.08, beta: 0.9 };
    const g = garchRecursion(y, q, b, bd), j = gjrRecursion(y, { ...q, gamma: 0 }, b, bd);
    expect(j.logLik).toBe(g.logLik); j.h.forEach((v, t) => expect(v).toBe(g.h[t]));
  });
  it('no look-ahead: a shock at t=500 first enters h_501', () => {
    const p: GjrParams = { mu: 0, omega: 0.02, alpha: 0.03, gamma: 0.12, beta: 0.88 }, y = fx.cases.gjr_asymmetric_n2000.y;
    const a = gjrRecursion(y, p, 1).h, c = gjrRecursion(y.map((v, t) => (t === 500 ? v - 10 : v)), p, 1).h;
    expect(a.slice(0, 501)).toEqual(c.slice(0, 501)); expect(c[501]).not.toBe(a[501]);
  });
});

describe('Transform', () => {
  it('every real θ maps into the arch admissible region (γ may be negative)', () => {
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 20; };
    let negGamma = 0;
    for (let i = 0; i < 2000; i++) {
      const q = gjrToParams([rnd(), rnd(), rnd(), rnd(), rnd()]);
      expect(q.omega).toBeGreaterThan(0); expect(q.alpha).toBeGreaterThanOrEqual(0);
      expect(q.alpha + q.gamma).toBeGreaterThanOrEqual(-1e-15); expect(q.beta).toBeGreaterThanOrEqual(0);
      expect(gjrPersistence(q)).toBeLessThan(1);
      if (q.gamma < 0) negGamma++;
    }
    expect(negGamma).toBeGreaterThan(0);
  });
  it('round-trips interior points, including negative γ', () => {
    for (const q of [{ mu: 0.05, omega: 0.02, alpha: 0.03, gamma: 0.12, beta: 0.88 }, { mu: -0.1, omega: 1, alpha: 0.08, gamma: -0.05, beta: 0.85 }]) {
      const back = gjrToParams(gjrFromParams(q));
      for (const k of ['mu', 'omega', 'alpha', 'gamma', 'beta'] as const) expect(back[k]).toBeCloseTo(q[k], 12);
    }
  });
});

describe('fitGjrGarch', () => {
  it('converges on the asymmetric fixture with k = 5 and consistent derived quantities', () => {
    expect(FIT.status).toBe('CONVERGED'); expect(FIT.k).toBe(5);
    const p = FIT.params;
    expect(FIT.persistence).toBeCloseTo(p.alpha + p.beta + p.gamma / 2, 14);
    expect(FIT.unconditionalVariance!).toBeCloseTo(p.omega / (1 - FIT.persistence), 18);
    expect(FIT.newsImpact).toEqual({ positive: p.alpha, negative: p.alpha + p.gamma });
    expect(FIT.aic).toBeCloseTo(-2 * FIT.logLik + 10, 9); expect(FIT.bic).toBeCloseTo(-2 * FIT.logLik + 5 * Math.log(RA.length), 9);
    expect(FIT.diagnostics.boundHits).toBe(0);
  });
  it('unit scaling: ℓ_r = ℓ_y + n·ln100 and h_r = h_y/10⁴', () => {
    const y = RA.map((v) => v * GARCH_SCALE), m = y.reduce((a, b) => a + b, 0) / y.length, e0 = y.map((v) => v - m), p = FIT.params;
    const rec = gjrRecursion(y, { mu: p.mu * 100, omega: p.omega * 1e4, alpha: p.alpha, gamma: p.gamma, beta: p.beta }, garchBackcast(e0), garchVarianceBounds(e0));
    expect(FIT.logLik).toBeCloseTo(rec.logLik + y.length * Math.log(100), 8);
    rec.h.forEach((v, t) => expect(FIT.variance[t]).toBeCloseTo(v / 1e4, 15));
  });
  it('nests GARCH: ℓ_GJR ≥ ℓ_GARCH on the same data (information only)', () => {
    const g = fitGarch(RA);
    expect(FIT.logLik).toBeGreaterThanOrEqual(g.logLik - 1e-6);
    expect(FIT.nested!.deltaLogLik).toBeCloseTo(FIT.logLik - g.logLik, 9);
    expect(FIT.nested!.deltaAic).toBeCloseTo(FIT.aic - g.aic, 9);
  });
  it('does not force γ positive on data simulated with γ = 0', () => {
    const f = fitGjrGarch(toR(fx.cases.gjr_true_gamma0_n800.y));
    expect(f.status).toBe('CONVERGED'); expect(f.params.gamma).toBeLessThan(0);
    expect(f.params.alpha + f.params.gamma).toBeGreaterThan(0);
  });
  it('rejects constant, short and non-finite input with GjrInputError', () => {
    expect(() => fitGjrGarch(new Array(200).fill(0.01))).toThrow(GjrInputError);
    expect(() => fitGjrGarch(RA.slice(0, 99))).toThrow(GjrInputError);
    expect(() => fitGjrGarch([...RA.slice(0, 200), NaN])).toThrow(GjrInputError);
    expect(() => fitGjrGarch([...RA.slice(0, 200), -Infinity])).toThrow(GjrInputError);
    expect(tryFitGjrGarch([1, 2]).fit).toBeNull();
  });
  it('next-period variance uses the asymmetric branch of the last innovation', () => {
    const p = FIT.params, last = RA.length - 1, e = RA[last] - p.mu;
    expect(gjrNextVariance(FIT, RA)).toBeCloseTo(p.omega + (p.alpha + (e < 0 ? p.gamma : 0)) * e * e + p.beta * FIT.variance[last], 18);
  });
  it('model adapter returns annualized in-sample σ and nulls for invalid input', () => {
    const res = gjrGarchModel.calculate(RA, RA.map((_, i) => String(i)));
    expect(res.values[10]).toBeCloseTo(Math.sqrt(FIT.variance[10] * TRADING_DAYS), 12);
    expect(gjrGarchModel.calculate([0.01, 0.02], ['a', 'b'])).toEqual({ dates: ['a', 'b'], values: [null, null], current: null });
  });
});
