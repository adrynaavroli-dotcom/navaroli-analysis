/**
 * VOL-005 — Out-of-sample variance forecast evaluation.
 * Spec: docs/quant/volatility-forecasting.md
 *
 * Protocol (rolling origin, expanding window, no look-ahead):
 * - Input: daily log returns r_0..r_{n-1} (decimal) from the Returns Engine.
 * - Initial training window: train = max(252, floor(0.6·n)) returns; the first
 *   forecast origin is t0 = train − 1 (uses r_0..r_{t0} only).
 * - Origins t = t0 .. n−1−maxH. At each origin every model forecasts the
 *   conditional variance of days t+1..t+H using ONLY r_0..r_t.
 * - GARCH(1,1): parameters refit every `refitEvery` origins on r_0..r_t
 *   (expanding window); between refits the conditional variance state is
 *   updated recursively with the frozen parameters. Multi-step forecasts use
 *   the analytic expectation path (see below).
 * - EWMA (λ = 0.94, RiskMetrics) and historical trailing 20/60-return windows
 *   issue a FLAT variance forecast across the horizon: their one-step variance
 *   is the expected variance for all future days (fixed-parameter convention,
 *   no mean reversion model).
 * - Scores per horizon H: v̂(t,H) = mean of the H daily forecast variances;
 *   proxy(t,H) = mean of r² over the same future days. Squared returns are a
 *   NOISY proxy for latent variance, not observed variance.
 * - QLIKE (robust comparison form) = mean( ln v̂ + proxy/v̂ ); it omits an
 *   additive realized-only term, so only differences across models on the
 *   same origins are meaningful. MSE = mean( (v̂ − proxy)² ), RMSE = √MSE.
 * - All models are scored on exactly the same valid origins per horizon.
 *   Overlapping multi-day windows make origins dependent: no significance
 *   test is applied and none is claimed.
 */
import { fitGarch, type GarchFit, type GarchParams } from '../garch';

export const HORIZONS = [1, 5, 10, 20] as const;
export const GARCH_REFIT_EVERY = 20;
export const MIN_OOS_ORIGINS = 100;
export const MIN_TRAIN_SIZE = 252;
export const TRAIN_FRACTION = 0.6;
export const EWMA_LAMBDA = 0.94;
export const EWMA_SEED = 20;
export const HIST20 = 20;
export const HIST60 = 60;

export type ForecastModelId = 'garch' | 'ewma' | 'hist20' | 'hist60';
export const FORECAST_MODELS: { id: ForecastModelId; name: string; convention: string }[] = [
  { id: 'garch', name: 'GARCH(1,1)', convention: 'Analytic multi-step conditional variance; refit every 20 origins' },
  { id: 'ewma', name: 'EWMA (λ=0.94)', convention: 'Flat: one-step EWMA variance held across the horizon' },
  { id: 'hist20', name: 'Historical 20D', convention: 'Flat: trailing 20-return sample variance' },
  { id: 'hist60', name: 'Historical 60D', convention: 'Flat: trailing 60-return sample variance (baseline)' },
];
export const BASELINE_MODEL: ForecastModelId = 'hist60';

/** Sample variance (n−1 denominator) of a slice — matches VOL-001/VOL-002 conventions. */
const sampleVar = (x: number[], from: number, to: number): number => {
  const w = to - from;
  const m = x.slice(from, to).reduce((a, b) => a + b, 0) / w;
  return x.slice(from, to).reduce((s, v) => s + (v - m) ** 2, 0) / (w - 1);
};

/**
 * Multi-step conditional variance expectation, recursive form (valid for any
 * persistence ρ = α+β): E[h_{t+k}|t] = ω + ρ·E[h_{t+k−1}|t], starting from the
 * one-step forecast h1 = h_{t+1|t}.
 */
export function garchVarianceForecastPath(p: GarchParams, h1: number, horizon: number): number[] {
  const rho = p.alpha + p.beta;
  const out = [h1];
  for (let k = 1; k < horizon; k++) out.push(p.omega + rho * out[k - 1]);
  return out;
}

/**
 * Closed form for ρ < 1: h_{t+k|t} = h̄ + ρ^{k−1}·(h_{t+1|t} − h̄) with
 * h̄ = ω/(1−ρ). For ρ ≥ 1 the unconditional variance does not exist and the
 * recursion is used instead (integrated/near-integrated variance: no mean
 * reversion to a finite h̄).
 */
export function garchVarianceForecastAnalytic(p: GarchParams, h1: number, horizon: number): number[] {
  const rho = p.alpha + p.beta;
  if (!(rho < 1)) return garchVarianceForecastPath(p, h1, horizon);
  const hbar = p.omega / (1 - rho);
  return Array.from({ length: horizon }, (_, k) => hbar + rho ** k * (h1 - hbar));
}

export interface ModelScore { qlike: number; mse: number; rmse: number; qlikeDiffVsBaseline: number | null; relMseVsBaseline: number | null; rank: number }
export interface HorizonResult {
  horizon: number;
  origins: number;
  /** Dates of the first/last forecast origin (last known return date). */
  originFrom: string;
  originTo: string;
  /** Dates of the first/last scored future day. */
  targetFrom: string;
  targetTo: string;
  scores: Partial<Record<ForecastModelId, ModelScore>>;
}
export interface GarchFailure { originIndex: number; date: string; message: string }
export interface ForecastEvaluation {
  status: 'ok';
  n: number;
  trainSize: number;
  refitEvery: number;
  /** Number of GARCH parameter fits performed (initial + refits). */
  garchFits: number;
  garchFailures: GarchFailure[];
  /** Models excluded because they produced no valid forecast. */
  failedModels: { id: ForecastModelId; reason: string }[];
  horizons: HorizonResult[];
}
export interface InsufficientHistory {
  status: 'insufficient-history';
  n: number;
  requiredMin: number;
  detail: string;
}
export type ForecastOutcome = ForecastEvaluation | InsufficientHistory;

export interface ForecastOptions {
  horizons?: number[];
  refitEvery?: number;
  minOrigins?: number;
  /** Injectable for tests (count refits, force failures). Defaults to fitGarch. */
  fitter?: (r: number[]) => GarchFit;
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;

/**
 * Run the rolling-origin evaluation. Returns an InsufficientHistory object
 * (never fabricates scores) when the protocol's minimums cannot be met.
 */
export function evaluateForecastModels(returns: number[], dates: string[], opts: ForecastOptions = {}): ForecastOutcome {
  const horizons = [...(opts.horizons ?? HORIZONS)].sort((a, b) => a - b);
  const refitEvery = opts.refitEvery ?? GARCH_REFIT_EVERY;
  const minOrigins = opts.minOrigins ?? MIN_OOS_ORIGINS;
  const fitter = opts.fitter ?? fitGarch;
  const n = returns.length;
  const maxH = horizons[horizons.length - 1];
  const train = Math.max(MIN_TRAIN_SIZE, Math.floor(TRAIN_FRACTION * n));
  const t0 = train - 1;
  const tLast = n - 1 - maxH;
  const originsCount = tLast - t0 + 1;
  const requiredMin = train + maxH + minOrigins - 1;
  if (n < requiredMin || originsCount < minOrigins) {
    return {
      status: 'insufficient-history', n, requiredMin,
      detail: `Need at least ${requiredMin} returns (train ${train} + horizon ${maxH} + ${minOrigins - 1} more) for ${minOrigins} origins at horizon ${maxH}; got ${n}.`,
    };
  }

  // Prefix sums of r² for O(1) realized-variance proxies.
  const r2 = returns.map((v) => v * v);
  const pre = [0];
  for (let i = 0; i < n; i++) pre.push(pre[i] + r2[i]);
  const rvProxy = (t: number, H: number) => (pre[t + 1 + H] - pre[t + 1]) / H;

  // ---- model states (all causal) ----
  // GARCH: fit on r_0..r_t0, then recurse; refit every `refitEvery` origins.
  let garchFit: GarchFit | null = null;
  let garchFits = 0;
  const garchFailures: GarchFailure[] = [];
  let gH = NaN; // last conditional variance h_t (state)
  const refit = (t: number) => {
    try {
      garchFit = fitter(returns.slice(0, t + 1));
      garchFits++;
      if (garchFit.status === 'NOT_CONVERGED') throw new Error('optimizer did not converge');
      gH = garchFit.variance[t];
    } catch (e) {
      garchFailures.push({ originIndex: t, date: dates[t], message: e instanceof Error ? e.message : String(e) });
    }
  };
  refit(t0);

  // EWMA: seed = sample variance of the first EWMA_SEED returns (inside the
  // training window), then v_{t+1} = λv_t + (1−λ)r_t² through the origin.
  let vEwma = sampleVar(returns, 0, EWMA_SEED);
  for (let t = EWMA_SEED; t <= t0; t++) vEwma = EWMA_LAMBDA * vEwma + (1 - EWMA_LAMBDA) * r2[t - 1];
  // vEwma now forecasts day t0+1 (uses returns through t0).

  // Historical windows: sliding sums for trailing sample variance.
  const slide = (w: number) => {
    let sum = 0, sumSq = 0;
    for (let i = t0 - w + 1; i <= t0; i++) { sum += returns[i]; sumSq += r2[i]; }
    return { sum, sumSq };
  };
  const s20 = slide(HIST20), s60 = slide(HIST60);
  const histVar = (s: { sum: number; sumSq: number }, w: number) => Math.max(0, (s.sumSq - (s.sum * s.sum) / w) / (w - 1));

  // ---- rolling-origin loop ----
  const vhat: Record<ForecastModelId, (number[] | null)[]> = { garch: [], ewma: [], hist20: [], hist60: [] };
  const originIdx: number[] = [];
  for (let t = t0; t <= tLast; t++) {
    if (t > t0 && (t - t0) % refitEvery === 0) refit(t);
    originIdx.push(t);

    // GARCH multi-step path for days t+1..t+maxH.
    if (garchFit) {
      const p = garchFit.params;
      const h1 = p.omega + p.alpha * (returns[t] - p.mu) ** 2 + p.beta * gH;
      vhat.garch.push(garchVarianceForecastAnalytic(p, h1, maxH));
    } else vhat.garch.push(null);

    // Flat baselines.
    vhat.ewma.push(new Array(maxH).fill(vEwma));
    vhat.hist20.push(new Array(maxH).fill(histVar(s20, HIST20)));
    vhat.hist60.push(new Array(maxH).fill(histVar(s60, HIST60)));

    // Advance states to origin t+1 using the newly observed return r_{t+1}.
    if (t < tLast) {
      if (garchFit) {
        const p = garchFit.params;
        gH = p.omega + p.alpha * (returns[t] - p.mu) ** 2 + p.beta * gH;
      }
      vEwma = EWMA_LAMBDA * vEwma + (1 - EWMA_LAMBDA) * r2[t];
      s20.sum += returns[t + 1] - returns[t + 1 - HIST20];
      s20.sumSq += r2[t + 1] - r2[t + 1 - HIST20];
      s60.sum += returns[t + 1] - returns[t + 1 - HIST60];
      s60.sumSq += r2[t + 1] - r2[t + 1 - HIST60];
    }
  }

  // ---- scoring on common valid origins per horizon ----
  const ids: ForecastModelId[] = ['garch', 'ewma', 'hist20', 'hist60'];
  const failedModels: { id: ForecastModelId; reason: string }[] = [];
  const usable = ids.filter((id) => {
    const ok = vhat[id].some((p) => p !== null && p.every((v) => Number.isFinite(v) && v > 0));
    if (!ok) failedModels.push({ id, reason: id === 'garch' ? (garchFailures[0]?.message ?? 'no valid fit') : 'no valid variance' });
    return ok;
  });

  const horizonResults: HorizonResult[] = horizons.map((H) => {
    // Common origins: every usable model has a finite positive mean variance.
    const rows: { t: number; v: Partial<Record<ForecastModelId, number>>; rv: number }[] = [];
    for (let j = 0; j < originIdx.length; j++) {
      const t = originIdx[j];
      if (t + H > n - 1) continue;
      const v: Partial<Record<ForecastModelId, number>> = {};
      let ok = true;
      for (const id of usable) {
        const path = vhat[id][j];
        const m = path ? mean(path.slice(0, H)) : NaN;
        if (!Number.isFinite(m) || m <= 0) { ok = false; break; }
        v[id] = m;
      }
      if (ok) rows.push({ t, v, rv: rvProxy(t, H) });
    }
    const scores: Partial<Record<ForecastModelId, ModelScore>> = {};
    const raw: Partial<Record<ForecastModelId, { qlike: number; mse: number }>> = {};
    for (const id of usable) {
      const vs = rows.map((r) => r.v[id]!), ps = rows.map((r) => r.rv);
      raw[id] = { qlike: mean(vs.map((v, i) => Math.log(v) + ps[i] / v)), mse: mean(vs.map((v, i) => (v - ps[i]) ** 2)) };
    }
    const base = raw[BASELINE_MODEL];
    const ranked = usable.filter((id) => raw[id]).sort((a, b) => raw[a]!.qlike - raw[b]!.qlike);
    for (const id of usable) {
      if (!raw[id]) continue;
      scores[id] = {
        qlike: raw[id]!.qlike, mse: raw[id]!.mse, rmse: Math.sqrt(raw[id]!.mse),
        qlikeDiffVsBaseline: base && id !== BASELINE_MODEL ? raw[id]!.qlike - base.qlike : null,
        relMseVsBaseline: base && id !== BASELINE_MODEL && base.mse > 0 ? 1 - raw[id]!.mse / base.mse : null,
        rank: ranked.indexOf(id) + 1,
      };
    }
    return {
      horizon: H, origins: rows.length,
      originFrom: dates[rows[0].t], originTo: dates[rows[rows.length - 1].t],
      targetFrom: dates[rows[0].t + 1], targetTo: dates[rows[rows.length - 1].t + H],
      scores,
    };
  });

  return { status: 'ok', n, trainSize: train, refitEvery, garchFits, garchFailures, failedModels, horizons: horizonResults };
}
