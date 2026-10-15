/**
 * GARCH(1,1) with constant mean, Gaussian (Q)MLE — VOL-003 v1.
 * Spec: docs/quant/garch.md
 *
 * Model (returns r_t = Returns Engine daily log returns, decimal units):
 *   r_t = μ + ε_t,  ε_t = √h_t z_t,  z_t ~ N(0,1)  (Gaussian assumption; QMLE if false)
 *   h_t = ω + α ε²_{t−1} + β h_{t−1},  ω > 0, α ≥ 0, β ≥ 0, α + β < 1
 *
 * Conventions chosen to match Python `arch` 8.0.0 (benchmark only, not a runtime dep):
 * - Backcast b = Σ_{i<τ} w_i ê_i², τ = min(75, n), w_i ∝ 0.94^i, ê = r − r̄ (sample-mean
 *   residuals). Computed ONCE and held fixed during optimization.
 * - t = 0: h_0 = ω + (α+β)·b (b stands in for both ε²_{−1} and h_{−1}). t ≥ 1: usual recursion.
 *   Every t = 0..n−1 enters the likelihood: ℓ = −½ Σ (ln 2π + ln h_t + ε_t²/h_t).
 * - Variance bounds (arch `variance_bounds`): from the sample-mean residuals, an EWMA(0.94)
 *   path v_t gives lower_t = max(v_t/1e6, var(ê)/1e8) and upper_t = clamp(v_t·1e6,
 *   [1+max ê², 1e7(1+max ê²)]). h below lower is set to lower; above upper → upper + ln(h/upper).
 *   These are numerical safeguards; the number of active bound hits is reported (expected 0).
 *
 * Estimation is done on y = 100·r for conditioning; results are converted back:
 *   μ_r = μ_y/100, ω_r = ω_y/1e4, h_r = h_y/1e4, ℓ_r = ℓ_y + n·ln 100.
 * Feasible parameterization (no clipping): ω = e^a, p = α+β = logistic(b), α = p·logistic(c),
 * β = p − α. Exact zeros / p = 1 are unattainable, so α or β < 1e-6 or p > 0.999 are flagged
 * as near-boundary (possible boundary optimum), not as failures.
 */
import { nelderMead } from '../optim/nelder-mead';
import { TRADING_DAYS, type VolatilityModel } from './types';

export const GARCH_SCALE = 100;
export const BACKCAST_TAU = 75;
export const BACKCAST_LAMBDA = 0.94;
export const GARCH_MIN_OBS = 100;
export const NEAR_BOUNDARY = { alpha: 1e-6, beta: 1e-6, persistence: 0.999 };

export interface GarchParams { mu: number; omega: number; alpha: number; beta: number }
export class GarchInputError extends Error {}

/** arch-style backcast: weighted mean of the first τ squared residuals, weights ∝ 0.94^i. */
export function garchBackcast(resid: number[]): number {
  const tau = Math.min(BACKCAST_TAU, resid.length);
  let sw = 0, s = 0;
  for (let i = 0; i < tau; i++) { const w = BACKCAST_LAMBDA ** i; sw += w; s += w * resid[i] ** 2; }
  return s / sw;
}

/** arch-style loose variance bounds (lower, upper) per t, from approximate residuals. */
export function garchVarianceBounds(resid: number[]): [number[], number[]] {
  const n = resid.length, sq = resid.map((e) => e * e);
  const v = new Array(n); v[0] = garchBackcast(resid);
  for (let t = 1; t < n; t++) v[t] = BACKCAST_LAMBDA * v[t - 1] + (1 - BACKCAST_LAMBDA) * sq[t - 1];
  const m = resid.reduce((a, b) => a + b, 0) / n;
  const variance = resid.reduce((s, e) => s + (e - m) ** 2, 0) / n;
  const maxSq = Math.max(...sq), minUpper = 1 + maxSq, cap = 1e7 * (1 + maxSq);
  return [v.map((x) => Math.max(x / 1e6, variance / 1e8)), v.map((x) => Math.min(Math.max(x * 1e6, minUpper), cap))];
}

export interface Recursion { h: number[]; eps: number[]; logLik: number; boundHits: number }

/**
 * Conditional variance path and Gaussian log-likelihood at FIXED parameters
 * (same units as `r`). `bounds` optional (omit for the pure recursion).
 */
export function garchRecursion(r: number[], p: GarchParams, backcast: number, bounds?: [number[], number[]]): Recursion {
  const n = r.length, h = new Array(n), eps = r.map((x) => x - p.mu);
  let ll = 0, hits = 0;
  for (let t = 0; t < n; t++) {
    let v = t === 0 ? p.omega + (p.alpha + p.beta) * backcast : p.omega + p.alpha * eps[t - 1] ** 2 + p.beta * h[t - 1];
    if (bounds) {
      const [lo, hi] = [bounds[0][t], bounds[1][t]];
      if (v < lo) { v = lo; hits++; } else if (v > hi) { v = Number.isFinite(v) ? hi + Math.log(v / hi) : hi + 1000; hits++; }
    }
    h[t] = v;
    ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(v) + eps[t] ** 2 / v);
  }
  return { h, eps, logLik: ll, boundHits: hits };
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => Math.log(p / (1 - p));
export const toParams = (th: number[]): GarchParams => {
  const p = logistic(th[2]), alpha = p * logistic(th[3]);
  return { mu: th[0], omega: Math.exp(th[1]), alpha, beta: p - alpha };
};
export const fromParams = (q: GarchParams): number[] => {
  const p = q.alpha + q.beta;
  return [q.mu, Math.log(q.omega), logit(p), logit(q.alpha / p)];
};

export type GarchStatus = 'CONVERGED' | 'CONVERGED_NEAR_BOUNDARY' | 'NOT_CONVERGED';
export interface GarchFit {
  params: GarchParams;               // decimal-return units
  persistence: number;
  unconditionalVariance: number | null; // daily, null if α+β ≥ 1
  variance: number[];                // daily h_t (decimal²)
  volatility: number[];              // daily √h_t
  annualizedVolatility: number[];    // √(252 h_t)
  standardizedResiduals: number[];   // z_t = ε_t/√h_t
  logLik: number; aic: number; bic: number; nobs: number; k: 4;
  backcast: number;                  // decimal² units
  status: GarchStatus;
  diagnostics: { iterations: number; evaluations: number; restarts: number; nonFinite: number; reason: string; boundHits: number; gradientNorm: number; nearBoundary: string[] };
}

/** Central-difference gradient of ℓ_y w.r.t. natural parameters (diagnostic only). */
function gradNorm(y: number[], q: GarchParams, b: number, bounds: [number[], number[]]) {
  const keys = ['mu', 'omega', 'alpha', 'beta'] as const;
  return Math.sqrt(keys.reduce((s, k) => {
    const hstep = 1e-6 * Math.max(1, Math.abs(q[k]));
    const up = garchRecursion(y, { ...q, [k]: q[k] + hstep }, b, bounds).logLik, dn = garchRecursion(y, { ...q, [k]: q[k] - hstep }, b, bounds).logLik;
    return s + ((up - dn) / (2 * hstep)) ** 2;
  }, 0));
}

/** Fit GARCH(1,1) by Gaussian MLE. Throws GarchInputError on invalid input. */
export function fitGarch(r: number[]): GarchFit {
  if (!r.every(Number.isFinite)) throw new GarchInputError('GARCH: returns contain non-finite values');
  if (r.length < GARCH_MIN_OBS) throw new GarchInputError(`GARCH: needs at least ${GARCH_MIN_OBS} returns, got ${r.length}`);
  if (r.every((v) => v === r[0])) throw new GarchInputError('GARCH: returns are constant');
  const n = r.length, y = r.map((v) => v * GARCH_SCALE);
  const ybar = y.reduce((a, b) => a + b, 0) / n;
  const e0 = y.map((v) => v - ybar);
  const b = garchBackcast(e0), bounds = garchVarianceBounds(e0);
  const v0 = e0.reduce((s, e) => s + e * e, 0) / n;
  const nll = (th: number[]) => -garchRecursion(y, toParams(th), b, bounds).logLik;

  // Deterministic start grid (persistence × α share); best few seed Nelder–Mead.
  const starts: { th: number[]; f: number }[] = [];
  for (const p of [0.5, 0.8, 0.9, 0.95, 0.99]) for (const a of [0.02, 0.05, 0.1, 0.2]) {
    if (a >= p) continue;
    const th = fromParams({ mu: ybar, omega: v0 * (1 - p), alpha: a, beta: p - a });
    starts.push({ th, f: nll(th) });
  }
  starts.sort((x, z) => x.f - z.f);
  let best = { x: starts[0].th, f: Infinity, iterations: 0, evaluations: 0, converged: false, nonFinite: 0, reason: '' };
  let restarts = 0, iters = 0, evalsTot = 0, nonF = 0;
  for (const s of starts.slice(0, 3)) {
    let res = nelderMead(nll, s.th, { step: 0.2 });
    iters += res.iterations; evalsTot += res.evaluations; nonF += res.nonFinite;
    // Restart from the optimum with a fresh simplex: guards against premature simplex collapse.
    const re = nelderMead(nll, res.x, { step: 0.05 }); restarts++;
    iters += re.iterations; evalsTot += re.evaluations; nonF += re.nonFinite;
    res = re;
    if (res.f < best.f) best = res;
  }
  const qy = toParams(best.x);
  const rec = garchRecursion(y, qy, b, bounds);
  const S2 = GARCH_SCALE ** 2;
  const params: GarchParams = { mu: qy.mu / GARCH_SCALE, omega: qy.omega / S2, alpha: qy.alpha, beta: qy.beta };
  const persistence = params.alpha + params.beta;
  const variance = rec.h.map((v) => v / S2);
  const logLik = rec.logLik + n * Math.log(GARCH_SCALE);
  const near = [params.alpha < NEAR_BOUNDARY.alpha && 'α ≈ 0', params.beta < NEAR_BOUNDARY.beta && 'β ≈ 0', persistence > NEAR_BOUNDARY.persistence && 'α+β ≈ 1'].filter(Boolean) as string[];
  const ok = best.converged && Number.isFinite(best.f);
  return {
    params, persistence, unconditionalVariance: persistence < 1 ? params.omega / (1 - persistence) : null,
    variance, volatility: variance.map(Math.sqrt), annualizedVolatility: variance.map((v) => Math.sqrt(v * TRADING_DAYS)),
    standardizedResiduals: rec.eps.map((e, t) => e / Math.sqrt(rec.h[t])),
    logLik, aic: -2 * logLik + 8, bic: -2 * logLik + 4 * Math.log(n), nobs: n, k: 4, backcast: b / S2,
    status: !ok ? 'NOT_CONVERGED' : near.length ? 'CONVERGED_NEAR_BOUNDARY' : 'CONVERGED',
    diagnostics: { iterations: iters, evaluations: evalsTot, restarts, nonFinite: nonF, reason: best.reason, boundHits: rec.boundHits, gradientNorm: gradNorm(y, qy, b, bounds), nearBoundary: near },
  };
}

/**
 * Next-period (t = n) conditional variance, daily decimal², from a fit on r_0..r_{n−1}:
 *   h_n = ω + α (r_{n−1} − μ)² + β h_{n−1}.
 * Distinct from the in-sample path `fit.variance` (h_0..h_{n−1}), which uses only
 * information up to t−1 at each t but with parameters estimated on the full sample.
 * Variance bounds are not applied (they are estimation safeguards; reported hits are 0).
 */
export function garchNextVariance(fit: GarchFit, r: number[]): number {
  const last = r.length - 1, eps = r[last] - fit.params.mu;
  return fit.params.omega + fit.params.alpha * eps * eps + fit.params.beta * fit.variance[last];
}

/** Safe wrapper for UIs: returns the fit or the error message, never stale values. */
export function tryFitGarch(r: number[]): { fit: GarchFit | null; error: string | null } {
  try { return { fit: fitGarch(r), error: null }; }
  catch (e) { return { fit: null, error: e instanceof Error ? e.message : String(e) }; }
}

// One-entry cache keyed by array identity so the comparison table and the diagnostics panel share one fit.
let lastInput: number[] | null = null, lastOut: ReturnType<typeof tryFitGarch> | null = null;
export function cachedFitGarch(r: number[]) {
  if (r !== lastInput || !lastOut) { lastInput = r; lastOut = tryFitGarch(r); }
  return lastOut;
}

/**
 * VolatilityModel adapter: `values` = in-sample conditional σ_t (annualized),
 * `current` = next-period conditional σ_{n} (annualized). Non-converged or invalid → nulls.
 */
export const garchModel: VolatilityModel = {
  id: 'garch-1-1', name: 'GARCH(1,1)', method: 'Gaussian MLE, constant mean · next-period σ',
  calculate(returns, dates) {
    const { fit } = cachedFitGarch(returns);
    if (!fit || fit.status === 'NOT_CONVERGED') return { dates, values: returns.map(() => null), current: null };
    return { dates, values: fit.annualizedVolatility, current: Math.sqrt(garchNextVariance(fit, returns) * TRADING_DAYS) };
  },
};
