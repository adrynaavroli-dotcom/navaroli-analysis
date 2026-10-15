/**
 * VOL-003 GARCH(1,1) + Nelder–Mead unit/numerical tests. Deterministic: uses only the
 * committed synthetic fixture (generated offline by validation/python/benchmark_vol003.py)
 * and closed-form cases. The arch benchmark itself runs separately (bun validation/run-vol003.ts).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { nelderMead } from '../../optim/nelder-mead';
import {
  fitGarch, garchBackcast, garchRecursion, garchVarianceBounds, garchNextVariance, garchModel, tryFitGarch,
  toParams, fromParams, GarchInputError, GARCH_SCALE, NEAR_BOUNDARY,
} from '../garch';
import { TRADING_DAYS } from '../types';
import fx from '../../validation/fixtures/vol003-benchmark.json';

const toR = (y: number[]) => y.map((v) => v / GARCH_SCALE);
const R1500 = toR(fx.cases.garch_n1500.y);
const FIT = fitGarch(R1500);

describe('Nelder–Mead', () => {
  it('minimizes the Rosenbrock function to (1,1)', () => {
    const r = nelderMead(([x, y]) => 100 * (y - x * x) ** 2 + (1 - x) ** 2, [-1.2, 1]);
    expect(r.converged).toBe(true);
    expect(r.x[0]).toBeCloseTo(1, 6); expect(r.x[1]).toBeCloseTo(1, 6);
    expect(r.f).toBeLessThan(1e-12);
  });
  it('minimizes a 4-D convex quadratic exactly', () => {
    const c = [0.3, -2, 5, 1e-3];
    const r = nelderMead((x) => x.reduce((s, v, i) => s + (i + 1) * (v - c[i]) ** 2, 0), [0, 0, 0, 0]);
    expect(r.converged).toBe(true);
    r.x.forEach((v, i) => expect(Math.abs(v - c[i])).toBeLessThan(1e-7));
  });
  it('is deterministic for identical inputs', () => {
    const f = (x: number[]) => (x[0] - 2) ** 2 + Math.abs(x[1]);
    expect(nelderMead(f, [5, 5])).toEqual(nelderMead(f, [5, 5]));
  });
  it('treats non-finite objective values as rejected points and counts them', () => {
    const r = nelderMead(([x]) => (x < 0 ? NaN : (x - 1) ** 2), [0.5], { step: 2 });
    expect(r.converged).toBe(true); expect(r.x[0]).toBeCloseTo(1, 6);
    expect(r.nonFinite).toBeGreaterThan(0);
  });
  it('fails cleanly when the objective is not finite at the start', () => {
    const r = nelderMead(() => Infinity, [0, 0]);
    expect(r.converged).toBe(false); expect(r.reason).toMatch(/starting point/);
  });
  it('reports iteration and evaluation limits as non-convergence', () => {
    const rosen = ([x, y]: number[]) => 100 * (y - x * x) ** 2 + (1 - x) ** 2;
    const a = nelderMead(rosen, [-1.2, 1], { maxIter: 5 });
    expect(a.converged).toBe(false); expect(a.iterations).toBe(5); expect(a.reason).toBe('Maximum iterations reached');
    const b = nelderMead(rosen, [-1.2, 1], { maxEval: 20 });
    expect(b.converged).toBe(false); expect(b.reason).toBe('Maximum evaluations reached');
  });
});

describe('GARCH(1,1) recursion and likelihood', () => {
  it('matches a hand calculation for backcast and h_0..h_2', () => {
    const y = [1, -1, 2], w = [1, 0.94, 0.94 ** 2];
    const b = (w[0] + w[1] + 4 * w[2]) / (w[0] + w[1] + w[2]);
    expect(garchBackcast(y)).toBeCloseTo(b, 15);
    const p = { mu: 0, omega: 0.1, alpha: 0.2, beta: 0.7 };
    const h0 = 0.1 + 0.9 * b, h1 = 0.1 + 0.2 * 1 + 0.7 * h0, h2 = 0.1 + 0.2 * 1 + 0.7 * h1;
    const rec = garchRecursion(y, p, b);
    rec.h.forEach((v, i) => expect(v).toBeCloseTo([h0, h1, h2][i], 14));
    const ll = [h0, h1, h2].reduce((s, h, t) => s - 0.5 * (Math.log(2 * Math.PI) + Math.log(h) + y[t] ** 2 / h), 0);
    expect(rec.logLik).toBeCloseTo(ll, 13);
  });
  it('backcast uses only the first 75 residuals', () => {
    const e = Array.from({ length: 200 }, (_, i) => Math.sin(i));
    expect(garchBackcast(e)).toBe(garchBackcast([...e.slice(0, 75), ...new Array(125).fill(99)]));
  });
  it('variance bounds bracket the fixed-parameter path (no hits)', () => {
    const y = fx.cases.garch_n1500.y, ybar = y.reduce((a, b) => a + b, 0) / y.length, e0 = y.map((v) => v - ybar);
    const [lo, hi] = garchVarianceBounds(e0);
    const [mu, omega, alpha, beta] = fx.cases.garch_n1500.fixed.params;
    const rec = garchRecursion(y, { mu, omega, alpha, beta }, garchBackcast(e0), [lo, hi]);
    expect(rec.boundHits).toBe(0);
    rec.h.forEach((h, t) => { expect(h).toBeGreaterThanOrEqual(lo[t]); expect(h).toBeLessThanOrEqual(hi[t]); });
  });
  it('has no look-ahead: a shock at t first enters h_{t+1}', () => {
    const y = fx.cases.garch_n1500.y, p = { mu: 0.04, omega: 0.05, alpha: 0.1, beta: 0.85 };
    const a = garchRecursion(y, p, 1.2).h, b = garchRecursion(y.map((v, t) => (t === 700 ? v + 10 : v)), p, 1.2).h;
    expect(a.slice(0, 701)).toEqual(b.slice(0, 701));
    expect(b[701]).toBeGreaterThan(a[701]);
  });
});

describe('Parameterization and constraints', () => {
  it('toParams always yields ω>0, α,β ≥ 0, α+β<1 and round-trips', () => {
    for (const th of [[0, -50, 30, -30], [1, 5, -30, 30], [0.1, -3, 2, -1], [-0.2, 0, 0, 0]]) {
      const q = toParams(th);
      expect(q.omega).toBeGreaterThan(0); expect(q.alpha).toBeGreaterThanOrEqual(0); expect(q.beta).toBeGreaterThanOrEqual(0);
      expect(q.alpha + q.beta).toBeLessThan(1);
    }
    const q = { mu: 0.03, omega: 0.02, alpha: 0.08, beta: 0.9 }, back = toParams(fromParams(q));
    (['mu', 'omega', 'alpha', 'beta'] as const).forEach((k) => expect(back[k]).toBeCloseTo(q[k], 12));
  });
  it('fitted parameters satisfy the constraints and persistence = α+β', () => {
    expect(FIT.params.omega).toBeGreaterThan(0);
    expect(FIT.params.alpha).toBeGreaterThan(0); expect(FIT.params.beta).toBeGreaterThan(0);
    expect(FIT.persistence).toBe(FIT.params.alpha + FIT.params.beta);
    expect(FIT.persistence).toBeLessThan(1);
    expect(FIT.unconditionalVariance).toBeCloseTo(FIT.params.omega / (1 - FIT.persistence), 15);
  });
});

describe('fitGarch', () => {
  it('rejects constant, short, NaN and infinite inputs', () => {
    expect(() => fitGarch(new Array(200).fill(0.01))).toThrow(GarchInputError);
    expect(() => fitGarch(R1500.slice(0, 99))).toThrow(/at least 100/);
    expect(() => fitGarch([...R1500.slice(0, 200), NaN])).toThrow(GarchInputError);
    expect(() => fitGarch([...R1500.slice(0, 200), -Infinity])).toThrow(GarchInputError);
    expect(tryFitGarch([1, 2])).toEqual({ fit: null, error: expect.stringMatching(/at least/) });
  });
  it('is deterministic and converges to an interior optimum near the data-generating parameters', () => {
    expect(fitGarch(R1500)).toEqual(FIT);
    expect(FIT.status).toBe('CONVERGED');
    expect(FIT.diagnostics.boundHits).toBe(0);
    expect(FIT.diagnostics.nearBoundary).toEqual([]);
    const se = fx.cases.garch_n1500.fit.se;
    // y-units arch estimates; ours within 0.02 SE (same tolerance as the benchmark suite)
    expect(Math.abs(FIT.params.alpha - fx.cases.garch_n1500.fit.alpha) / se.alpha).toBeLessThan(0.02);
    expect(Math.abs(FIT.params.beta - fx.cases.garch_n1500.fit.beta) / se.beta).toBeLessThan(0.02);
  });
  it('converts scale: μ_r = μ_y/100, ω_r = ω_y/1e4, h_r = h_y/1e4, ℓ_r = ℓ_y + n ln100', () => {
    const y = fx.cases.garch_n1500.y, n = y.length, ybar = y.reduce((a, b) => a + b, 0) / n, e0 = y.map((v) => v - ybar);
    const qy = { mu: FIT.params.mu * 100, omega: FIT.params.omega * 1e4, alpha: FIT.params.alpha, beta: FIT.params.beta };
    const recY = garchRecursion(y, qy, garchBackcast(e0), garchVarianceBounds(e0));
    expect(FIT.logLik).toBeCloseTo(recY.logLik + n * Math.log(100), 8);
    FIT.variance.forEach((v, t) => expect(Math.abs(v - recY.h[t] / 1e4)).toBeLessThan(1e-18 + 1e-12 * v));
    expect(FIT.backcast).toBeCloseTo(garchBackcast(e0) / 1e4, 15);
    // fit on the y series itself, converted back, should give essentially the same model
    expect(Math.abs(FIT.params.mu - fx.cases.garch_n1500.fit.mu / 100)).toBeLessThan(0.02 * fx.cases.garch_n1500.fit.se.mu / 100);
  });
  it('AIC = −2ℓ + 2k and BIC = −2ℓ + k ln n with k = 4', () => {
    expect(FIT.k).toBe(4);
    expect(FIT.aic).toBeCloseTo(-2 * FIT.logLik + 8, 10);
    expect(FIT.bic).toBeCloseTo(-2 * FIT.logLik + 4 * Math.log(FIT.nobs), 10);
    expect(FIT.nobs).toBe(R1500.length);
  });
  it('flags a boundary optimum (i.i.d. data: α → 0) instead of failing', () => {
    const f = fitGarch(toR(fx.cases.iid_normal_n1000.y));
    expect(f.status).toBe('CONVERGED_NEAR_BOUNDARY');
    expect(f.params.alpha).toBeLessThan(NEAR_BOUNDARY.alpha);
    expect(f.diagnostics.nearBoundary).toContain('α ≈ 0');
  });
  it('standardized residuals are ε_t/√h_t and volatilities are √h_t, √(252 h_t)', () => {
    const t = 321;
    expect(FIT.standardizedResiduals[t]).toBeCloseTo((R1500[t] - FIT.params.mu) / Math.sqrt(FIT.variance[t]), 12);
    expect(FIT.volatility[t]).toBe(Math.sqrt(FIT.variance[t]));
    expect(FIT.annualizedVolatility[t]).toBeCloseTo(Math.sqrt(FIT.variance[t] * TRADING_DAYS), 15);
  });
});

describe('In-sample vs next-period volatility', () => {
  it('next-period h_n = ω + α ε²_{n−1} + β h_{n−1}, distinct from the last in-sample h_{n−1}', () => {
    const n = R1500.length, eps = R1500[n - 1] - FIT.params.mu;
    const next = garchNextVariance(FIT, R1500);
    expect(next).toBeCloseTo(FIT.params.omega + FIT.params.alpha * eps * eps + FIT.params.beta * FIT.variance[n - 1], 18);
    expect(next).not.toBe(FIT.variance[n - 1]);
    const res = garchModel.calculate(R1500, R1500.map((_, i) => String(i)));
    expect(res.values).toEqual(FIT.annualizedVolatility);
    expect(res.current).toBeCloseTo(Math.sqrt(next * TRADING_DAYS), 15);
  });
  it('the in-sample path at t does not depend on r_t or later returns (at fixed estimates)', () => {
    const q = { mu: FIT.params.mu, omega: FIT.params.omega, alpha: FIT.params.alpha, beta: FIT.params.beta };
    const a = garchRecursion(R1500, q, FIT.backcast).h, b = garchRecursion(R1500.map((v, t) => (t >= 900 ? 0 : v)), q, FIT.backcast).h;
    expect(a.slice(0, 901)).toEqual(b.slice(0, 901));
  });
  it('garchModel returns nulls (never stale values) for invalid input', () => {
    const res = garchModel.calculate([0.01, 0.02], ['a', 'b']);
    expect(res).toEqual({ dates: ['a', 'b'], values: [null, null], current: null });
  });
});

describe('Non-convergence reporting', () => {
  afterEach(() => { vi.doUnmock('../../optim/nelder-mead'); vi.resetModules(); });
  it('optimizer failure → status NOT_CONVERGED and garchModel outputs nulls', async () => {
    vi.resetModules();
    vi.doMock('../../optim/nelder-mead', () => ({
      nelderMead: (f: (x: number[]) => number, x0: number[]) => ({ x: x0, f: f(x0), iterations: 1, evaluations: 1, converged: false, nonFinite: 0, reason: 'Maximum iterations reached' }),
    }));
    const g = await import('../garch');
    const f = g.fitGarch(R1500);
    expect(f.status).toBe('NOT_CONVERGED');
    expect(f.diagnostics.reason).toBe('Maximum iterations reached');
    const res = g.garchModel.calculate(R1500.slice(0, 1400), R1500.slice(0, 1400).map(String));
    expect(res.current).toBeNull(); expect(res.values.every((v) => v === null)).toBe(true);
  });
});
