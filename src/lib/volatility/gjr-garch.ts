/**
 * VOL-004 — GJR-GARCH(1,1,1), constant mean, Gaussian MLE (in-sample estimation only).
 * Spec: docs/quant/asymmetric-garch.md
 *
 * Mathematical specification:
 *   r_t = μ + ε_t,  ε_t = √h_t z_t,  z_t ~ N(0,1)
 *   h_t = ω + (α + γ·I[ε_{t−1} < 0]) ε²_{t−1} + β h_{t−1}
 * The indicator applies to the INNOVATION ε_{t−1} = r_{t−1} − μ (current μ), not to the raw
 * return; ε = 0 counts as non-negative (arch uses sign(ε) < 0). News-impact coefficient:
 * α for ε ≥ 0, α+γ for ε < 0. Persistence ρ = α + β + γ/2 (E[I·z²] = ½ for symmetric z);
 * h̄ = ω/(1−ρ) when ρ < 1, else undefined. γ = 0 reduces exactly to VOL-003.
 *
 * Admissible region = Python arch 8.0.0 `GARCH(p=1,o=1,q=1).constraints()`:
 *   ω > 0, α ≥ 0, α+γ ≥ 0, β ≥ 0, ρ < 1.  γ MAY BE NEGATIVE (user decision D1-A): the
 * estimator is not biased toward a leverage effect, and the benchmark maps exactly to arch.
 *
 * Software conventions (match arch 8.0.0; benchmark only, never a runtime dependency):
 * - Backcast b and variance bounds: identical to VOL-003 (arch shares that code for o = 1,
 *   power = 2), so `garchBackcast` / `garchVarianceBounds` are reused unchanged.
 * - t = 0 DIFFERS from VOL-003: h_0 = ω + (α + γ/2 + β)·b — arch's recursion multiplies the
 *   asymmetric term by 0.5·backcast (recursions_python.garch_recursion_python).
 * - Estimation on y = 100·r; back-conversion μ/100, ω/1e4, h/1e4, ℓ_r = ℓ_y + n·ln100. k = 5.
 *
 * Feasible 5-parameter transform (no clipping): split ρ into three non-negative parts
 *   ρ = α/2 + (α+γ)/2 + β,  shares s = softmax(θ3, θ4, 0),  ρ = logistic(θ2), ω = e^{θ1}
 *   α = 2 s1 ρ,  α+γ = 2 s2 ρ,  β = s3 ρ.
 * Every real θ satisfies all constraints. The boundaries α = 0, α+γ = 0, β = 0, ρ = 1 are
 * unattainable, so values within 1e-6 (or ρ > 0.999) are flagged near-boundary.
 * γ ≈ 0 is an INTERIOR point under these constraints; it is reported (`nestedGarch`), never forced.
 */
import { nelderMead } from '../optim/nelder-mead';
import { cachedFitGarch, garchBackcast, garchVarianceBounds, GARCH_SCALE, GARCH_MIN_OBS, NEAR_BOUNDARY } from './garch';
import { TRADING_DAYS, type VolatilityModel } from './types';

export interface GjrParams { mu: number; omega: number; alpha: number; gamma: number; beta: number }
export class GjrInputError extends Error {}
export const GJR_NESTED_TOL = 1e-6;

export interface GjrRecursion { h: number[]; eps: number[]; logLik: number; boundHits: number }

/** Persistence ρ = α + β + γ/2. */
export const gjrPersistence = (p: Pick<GjrParams, 'alpha' | 'gamma' | 'beta'>) => p.alpha + p.beta + p.gamma / 2;

/**
 * Conditional variance path and Gaussian log-likelihood at FIXED parameters (units of `r`).
 * `bounds` optional (omit for the pure recursion); bound handling identical to VOL-003/arch.
 */
export function gjrRecursion(r: number[], p: GjrParams, backcast: number, bounds?: [number[], number[]]): GjrRecursion {
  const n = r.length, h = new Array(n), eps = r.map((x) => x - p.mu);
  let ll = 0, hits = 0;
  for (let t = 0; t < n; t++) {
    let v: number;
    if (t === 0) v = p.omega + (p.alpha + p.gamma / 2 + p.beta) * backcast;
    else { const e = eps[t - 1]; v = p.omega + (p.alpha + (e < 0 ? p.gamma : 0)) * e * e + p.beta * h[t - 1]; }
    if (bounds) {
      const lo = bounds[0][t], hi = bounds[1][t];
      if (v < lo) { v = lo; hits++; } else if (v > hi) { v = Number.isFinite(v) ? hi + Math.log(v / hi) : hi + 1000; hits++; }
    }
    h[t] = v;
    ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(v) + eps[t] ** 2 / v);
  }
  return { h, eps, logLik: ll, boundHits: hits };
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => Math.log(p / (1 - p));

/** θ (unconstrained, length 5) → feasible natural parameters. */
export function gjrToParams(th: number[]): GjrParams {
  const rho = logistic(th[2]);
  const m = Math.max(th[3], th[4], 0), w1 = Math.exp(th[3] - m), w2 = Math.exp(th[4] - m), w3 = Math.exp(-m), sw = w1 + w2 + w3;
  const alpha = 2 * rho * w1 / sw, delta = 2 * rho * w2 / sw, beta = rho * w3 / sw;
  return { mu: th[0], omega: Math.exp(th[1]), alpha, gamma: delta - alpha, beta };
}

/** Inverse transform; requires a strictly interior point (α > 0, α+γ > 0, β > 0, 0 < ρ < 1). */
export function gjrFromParams(q: GjrParams): number[] {
  const rho = gjrPersistence(q), s1 = q.alpha / 2, s2 = (q.alpha + q.gamma) / 2, s3 = q.beta;
  return [q.mu, Math.log(q.omega), logit(rho), Math.log(s1 / s3), Math.log(s2 / s3)];
}

export type GjrStatus = 'CONVERGED' | 'CONVERGED_NEAR_BOUNDARY' | 'NOT_CONVERGED';
export interface GjrFit {
  params: GjrParams;                  // decimal-return units
  persistence: number;
  unconditionalVariance: number | null;
  newsImpact: { positive: number; negative: number }; // α, α+γ
  variance: number[]; volatility: number[]; annualizedVolatility: number[]; standardizedResiduals: number[];
  logLik: number; aic: number; bic: number; nobs: number; k: 5;
  backcast: number;
  status: GjrStatus;
  /** |γ| < 1e-6: estimate coincides with the nested GARCH(1,1) (interior point, informational). */
  nestedGarch: boolean;
  /** Which candidate was selected by the final likelihood comparison ('none' when neither is valid). */
  selectedCandidate: 'optimizer' | 'nested-garch' | 'none';
  /** In-sample comparison with the VOL-003 fit on the same data (information only, no test). */
  nested: { garchLogLik: number; garchAic: number; deltaLogLik: number; deltaAic: number } | null;
  diagnostics: { iterations: number; evaluations: number; restarts: number; nonFinite: number; reason: string; boundHits: number; nearBoundary: string[] };
}

/**
 * Final candidate selection: highest finite likelihood among VALID candidates. Ties keep the optimizer
 * (an asymmetric optimum is never discarded unless the nested solution is strictly better).
 */
export function selectGjrCandidate(opt: { valid: boolean; logLik: number }, nest: { valid: boolean; logLik: number }): 'optimizer' | 'nested-garch' | 'none' {
  const o = opt.valid && Number.isFinite(opt.logLik), g = nest.valid && Number.isFinite(nest.logLik);
  if (o && g) return nest.logLik > opt.logLik ? 'nested-garch' : 'optimizer';
  return o ? 'optimizer' : g ? 'nested-garch' : 'none';
}

/**
 * Fit GJR-GARCH(1,1,1) by Gaussian MLE on daily decimal log returns (from the Returns Engine).
 *
 * Starts: the project's deterministic multi-start grid, using the same grid VALUES as arch v8.0.0
 * `GARCH.starting_values` (α, γ ∈ {0.01,0.05,0.1,0.2}, ρ ∈ {0.5,0.7,0.9,0.98}; ω = (1−ρ)·mean ε²),
 * but NOT identical to arch: points with β ≤ 0 are skipped, the best 3 (not 1) are refined, and the
 * VOL-003 optimum (γ = 1e-6) is added as a further seed. Source:
 * https://github.com/bashtage/arch/blob/v8.0.0/arch/univariate/volatility.py (GARCH.starting_values).
 *
 * Nested-likelihood safeguard: a start value alone does NOT guarantee ℓ_GJR ≥ ℓ_GARCH. After the
 * optimizer, the converged VOL-003 solution is evaluated EXACTLY as a GJR candidate with γ = 0 (same
 * returns, backcast, bounds, 100·r units, Gaussian likelihood; with γ = 0 the GJR recursion — incl.
 * t = 0 — equals VOL-003's), and the valid candidate with the higher likelihood is selected. This is
 * a numerical-correctness safeguard, not a statistical claim about asymmetry.
 */
export function fitGjrGarch(r: number[]): GjrFit {
  if (!r.every(Number.isFinite)) throw new GjrInputError('GJR-GARCH: returns contain non-finite values');
  if (r.length < GARCH_MIN_OBS) throw new GjrInputError(`GJR-GARCH: needs at least ${GARCH_MIN_OBS} returns, got ${r.length}`);
  if (r.every((v) => v === r[0])) throw new GjrInputError('GJR-GARCH: returns are constant');
  const n = r.length, S = GARCH_SCALE, S2 = S * S, y = r.map((v) => v * S);
  const ybar = y.reduce((a, b) => a + b, 0) / n, e0 = y.map((v) => v - ybar);
  const b = garchBackcast(e0), bounds = garchVarianceBounds(e0);
  const v0 = e0.reduce((s, e) => s + e * e, 0) / n;
  const nll = (th: number[]) => -gjrRecursion(y, gjrToParams(th), b, bounds).logLik;

  const starts: { th: number[]; f: number }[] = [];
  for (const a of [0.01, 0.05, 0.1, 0.2]) for (const g of [0.01, 0.05, 0.1, 0.2]) for (const rho of [0.5, 0.7, 0.9, 0.98]) {
    const beta = rho - a - g / 2;
    if (beta <= 0) continue;
    const th = gjrFromParams({ mu: ybar, omega: v0 * (1 - rho), alpha: a, gamma: g, beta });
    starts.push({ th, f: nll(th) });
  }
  starts.sort((x, z) => x.f - z.f);
  const seeds = starts.slice(0, 3).map((s) => s.th);
  const g0 = cachedFitGarch(r).fit;
  const garchValid = !!g0 && g0.status !== 'NOT_CONVERGED' && Number.isFinite(g0.logLik);
  if (garchValid && g0!.params.alpha > 1e-8 && g0!.params.beta > 1e-8 && g0!.persistence < 1) {
    seeds.push(gjrFromParams({ mu: g0!.params.mu * S, omega: g0!.params.omega * S2, alpha: g0!.params.alpha, gamma: 1e-6, beta: g0!.params.beta }));
  }

  let best = { x: seeds[0], f: Infinity, iterations: 0, evaluations: 0, converged: false, nonFinite: 0, reason: '' };
  let restarts = 0, iters = 0, evalsTot = 0, nonF = 0;
  for (const s of seeds) {
    let res = nelderMead(nll, s, { step: 0.2 });
    iters += res.iterations; evalsTot += res.evaluations; nonF += res.nonFinite;
    const re = nelderMead(nll, res.x, { step: 0.05 }); restarts++;
    iters += re.iterations; evalsTot += re.evaluations; nonF += re.nonFinite;
    res = re;
    if (res.f < best.f) best = res;
  }

  // Candidate A: optimizer. Candidate B: exact nested VOL-003 solution with γ = 0 (scaled units).
  const optOk = best.converged && Number.isFinite(best.f);
  const qOpt = gjrToParams(best.x), recOpt = gjrRecursion(y, qOpt, b, bounds);
  const qNest: GjrParams | null = garchValid
    ? { mu: g0!.params.mu * S, omega: g0!.params.omega * S2, alpha: g0!.params.alpha, gamma: 0, beta: g0!.params.beta } : null;
  const recNest = qNest ? gjrRecursion(y, qNest, b, bounds) : null;
  const nestOk = !!recNest && Number.isFinite(recNest.logLik);
  const sel = selectGjrCandidate({ valid: optOk, logLik: recOpt.logLik }, { valid: nestOk, logLik: recNest ? recNest.logLik : NaN });
  const useNested = sel === 'nested-garch', ok = sel !== 'none';
  const qy = useNested ? qNest! : qOpt, rec = useNested ? recNest! : recOpt;

  const params: GjrParams = { mu: qy.mu / S, omega: qy.omega / S2, alpha: qy.alpha, gamma: qy.gamma, beta: qy.beta };
  const persistence = gjrPersistence(params);
  const variance = rec.h.map((v) => v / S2);
  const logLik = rec.logLik + n * Math.log(S);
  const near = [
    params.alpha < NEAR_BOUNDARY.alpha && 'α ≈ 0',
    params.alpha + params.gamma < NEAR_BOUNDARY.alpha && 'α+γ ≈ 0',
    params.beta < NEAR_BOUNDARY.beta && 'β ≈ 0',
    persistence > NEAR_BOUNDARY.persistence && 'ρ ≈ 1',
  ].filter(Boolean) as string[];
  const aic = -2 * logLik + 10;
  return {
    params, persistence, unconditionalVariance: persistence < 1 ? params.omega / (1 - persistence) : null,
    newsImpact: { positive: params.alpha, negative: params.alpha + params.gamma },
    variance, volatility: variance.map(Math.sqrt), annualizedVolatility: variance.map((v) => Math.sqrt(v * TRADING_DAYS)),
    standardizedResiduals: rec.eps.map((e, t) => e / Math.sqrt(rec.h[t])),
    logLik, aic, bic: -2 * logLik + 5 * Math.log(n), nobs: n, k: 5, backcast: b / S2,
    status: !ok ? 'NOT_CONVERGED' : near.length ? 'CONVERGED_NEAR_BOUNDARY' : 'CONVERGED',
    nestedGarch: Math.abs(params.gamma) < GJR_NESTED_TOL,
    selectedCandidate: sel,
    nested: garchValid ? { garchLogLik: g0!.logLik, garchAic: g0!.aic, deltaLogLik: logLik - g0!.logLik, deltaAic: aic - g0!.aic } : null,
    diagnostics: { iterations: iters, evaluations: evalsTot, restarts, nonFinite: nonF, reason: useNested && !optOk ? `optimizer: ${best.reason}; nested GARCH candidate selected` : best.reason, boundHits: rec.boundHits, nearBoundary: near },
  };
}

/** Next-period variance h_n from a fit on r_0..r_{n−1} (bounds not applied). */
export function gjrNextVariance(fit: GjrFit, r: number[]): number {
  const last = r.length - 1, e = r[last] - fit.params.mu, p = fit.params;
  return p.omega + (p.alpha + (e < 0 ? p.gamma : 0)) * e * e + p.beta * fit.variance[last];
}

export function tryFitGjrGarch(r: number[]): { fit: GjrFit | null; error: string | null } {
  try { return { fit: fitGjrGarch(r), error: null }; }
  catch (e) { return { fit: null, error: e instanceof Error ? e.message : String(e) }; }
}

let lastInput: number[] | null = null, lastOut: (ReturnType<typeof tryFitGjrGarch> & { elapsedMs: number }) | null = null;
/** One-entry cache keyed by array identity (comparison table and panel share one fit). */
export function cachedFitGjrGarch(r: number[]) {
  if (r !== lastInput || !lastOut) { const t0 = performance.now(); const o = tryFitGjrGarch(r); lastInput = r; lastOut = { ...o, elapsedMs: performance.now() - t0 }; }
  return lastOut;
}

/** VolatilityModel adapter: in-sample σ_t (annualized) and next-period σ_n. Failures → nulls. */
export const gjrGarchModel: VolatilityModel = {
  id: 'gjr-garch-1-1-1', name: 'GJR-GARCH(1,1,1)', method: 'Gaussian MLE, asymmetric · next-period σ',
  calculate(returns, dates) {
    const { fit } = cachedFitGjrGarch(returns);
    if (!fit || fit.status === 'NOT_CONVERGED') return { dates, values: returns.map(() => null), current: null };
    return { dates, values: fit.annualizedVolatility, current: Math.sqrt(gjrNextVariance(fit, returns) * TRADING_DAYS) };
  },
};
