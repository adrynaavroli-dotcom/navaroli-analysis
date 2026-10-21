/**
 * VOL-005 — Out-of-sample variance forecast evaluation.
 * Spec: docs/quant/volatility-forecasting.md
 *
 * Protocol (rolling origin, expanding window, no look-ahead):
 * - Input: daily log returns r_0..r_{n-1} (decimal) from the Returns Engine.
 * - Initial training window: train = max(252, floor(0.6·n)) returns; the first
 *   forecast origin is t0 = train − 1 (uses r_0..r_{t0} only).
 * - Origins t = t0 .. n−2 (each horizon keeps t+H ≤ n−1). At each origin every model forecasts the
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
import { fitGarch, garchNextVariance, type GarchFit, type GarchParams } from '../garch';

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
  checkForecastInput(p, h1, horizon);
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
  checkForecastInput(p, h1, horizon);
  const rho = p.alpha + p.beta;
  if (!(rho < 1) || 1 - rho < 1e-8) return garchVarianceForecastPath(p, h1, horizon);
  const hbar = p.omega / (1 - rho);
  return Array.from({ length: horizon }, (_, k) => k === 0 ? h1 : hbar + rho ** k * (h1 - hbar));
}

/** Validate public formula helpers rather than returning empty or non-finite paths. */
function checkForecastInput(p: GarchParams, h1: number, horizon: number) {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 10000 ||
      !Object.values(p).every(Number.isFinite) || p.omega <= 0 || p.alpha < 0 || p.beta < 0 || !Number.isFinite(h1) || h1 <= 0)
    throw new Error('Invalid GARCH forecast parameters, variance or horizon');
}

/** Robust comparison QLIKE (realized-only term omitted), MSE and RMSE in daily decimal² units. */
export function forecastMetrics(v: number[], proxy: number[]) {
  if (!v.length || v.length !== proxy.length || v.some(x => !Number.isFinite(x) || x <= 0) || proxy.some(x => !Number.isFinite(x) || x < 0))
    throw new Error('Metrics require aligned nonempty finite proxies and positive forecasts');
  const qlike = mean(v.map((x, i) => Math.log(x) + proxy[i] / x));
  const mse = mean(v.map((x, i) => (x - proxy[i]) ** 2));
  if (![qlike, mse].every(Number.isFinite)) throw new Error('Metric overflow');
  return { qlike, mse, rmse: Math.sqrt(mse) };
}
export interface ForecastTrace { originIndex: number; date: string; paths: Record<ForecastModelId, number[] | null> }

export interface ModelScore { qlike: number; mse: number; rmse: number; qlikeDiffVsBaseline: number | null; relMseVsBaseline: number | null; rank: number }
export interface HorizonResult {
  horizon: number;
  origins: number;
  excludedOrigins: number;
  originIndices: number[];
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
  refitOrigins: { originIndex: number; date: string; success: boolean }[];
  trace?: ForecastTrace[];
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
export interface ForecastFailure { status: 'invalid-input' | 'failed'; detail: string }
export type ForecastOutcome = ForecastEvaluation | InsufficientHistory | ForecastFailure;

export interface ForecastOptions {
  horizons?: number[];
  /** Capture causal paths for audit/tests, not needed for normal UI runs. */
  captureTrace?: boolean;
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
  if (n !== dates.length || returns.some(v => !Number.isFinite(v) || !Number.isFinite(v * v)) ||
      dates.some((d, i) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d || (i > 0 && d <= dates[i - 1])) ||
      !horizons.length || horizons.some(h => !HORIZONS.some(valid => valid === h)) || new Set(horizons).size !== horizons.length ||
      !Number.isInteger(refitEvery) || refitEvery < 1 || !Number.isInteger(minOrigins) || minOrigins < 1)
    return { status: 'invalid-input', detail: 'Require aligned finite daily returns, strictly increasing ISO dates, unique horizons 1/5/10/20, and positive integer cadence/minimum origins.' };
  const maxH = horizons[horizons.length - 1];
  const train = Math.max(MIN_TRAIN_SIZE, Math.floor(TRAIN_FRACTION * n));
  const t0 = train - 1;
  // Origins run to the last scorable day; each horizon keeps origins with t+H ≤ n−1,
  // so shorter horizons legitimately have more origins than the longest one.
  const tLast = n - 2;
  const originsCount = n - 1 - maxH - t0 + 1; // origins available at the longest horizon
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
  const refitOrigins: ForecastEvaluation['refitOrigins'] = [];
  const trace: ForecastTrace[] = [];
  let gH = NaN; // last conditional variance h_t (state)
  const refit = (t: number) => {
    try {
      garchFits++;
      const candidate = fitter(returns.slice(0, t + 1));
      if (candidate.status === 'NOT_CONVERGED' || candidate.variance.length !== t + 1 ||
          !Object.values(candidate.params).every(Number.isFinite) || candidate.params.omega <= 0 || candidate.params.alpha < 0 || candidate.params.beta < 0 ||
          candidate.params.alpha + candidate.params.beta >= 1 || !Number.isFinite(candidate.variance[t]) || candidate.variance[t] <= 0)
        throw new Error('Invalid or non-converged fit');
      garchFit = candidate;
      gH = candidate.variance[t]; // h_t excludes r_t; one-step helper applies r_t exactly once.
      refitOrigins.push({ originIndex: t, date: dates[t], success: true });
    } catch (e) {
      // A failed refit invalidates forecasts until the next successful scheduled fit.
      // Never assign failed candidate parameters or silently label an old fit current.
      garchFit = null;
      gH = NaN;
      refitOrigins.push({ originIndex: t, date: dates[t], success: false });
      garchFailures.push({ originIndex: t, date: dates[t], message: e instanceof Error ? e.message : String(e) });
    }
  };
  refit(t0);

  // EWMA: seed = sample variance of the first EWMA_SEED returns (inside the
  // training window) = v at t = SEED−1; then v_{t+1} = λv_t + (1−λ)r_t².
  let vEwma = sampleVar(returns, 0, EWMA_SEED);
  for (let t = EWMA_SEED - 1; t <= t0; t++) vEwma = EWMA_LAMBDA * vEwma + (1 - EWMA_LAMBDA) * r2[t];
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
      const h1 = garchNextVariance({ ...garchFit, variance: [gH] }, [returns[t]]);
      vhat.garch.push(garchVarianceForecastAnalytic(p, h1, maxH));
    } else vhat.garch.push(null);

    // Flat baselines.
    vhat.ewma.push(new Array(maxH).fill(vEwma));
    vhat.hist20.push(new Array(maxH).fill(histVar(s20, HIST20)));
    vhat.hist60.push(new Array(maxH).fill(histVar(s60, HIST60)));

    if (opts.captureTrace) trace.push({ originIndex: t, date: dates[t], paths: Object.fromEntries(
      FORECAST_MODELS.map(({ id }) => [id, vhat[id][vhat[id].length - 1]])
    ) as ForecastTrace['paths'] });

    // Advance states to origin t+1 using the newly observed return r_{t+1}.
    if (t < tLast) {
      if (garchFit) {
        const p = garchFit.params;
        gH = p.omega + p.alpha * (returns[t] - p.mu) ** 2 + p.beta * gH;
      }
      vEwma = EWMA_LAMBDA * vEwma + (1 - EWMA_LAMBDA) * r2[t + 1];
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

  if (!usable.length) return { status: 'failed', detail: 'No model produced a finite positive variance forecast.' };
  const horizonResults: HorizonResult[] = [];
  for (const H of horizons) {
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
        if (!path?.slice(0, H).every(x => Number.isFinite(x) && x > 0) || !Number.isFinite(m) || m <= 0) { ok = false; break; }
        v[id] = m;
      }
      if (ok) rows.push({ t, v, rv: rvProxy(t, H) });
    }
    if (rows.length < minOrigins) return { status: 'failed', detail: `Only ${rows.length} common valid origins at H=${H}; minimum ${minOrigins}. No partial/stale scores published.` };
    const scores: Partial<Record<ForecastModelId, ModelScore>> = {};
    const raw: Partial<Record<ForecastModelId, { qlike: number; mse: number }>> = {};
    for (const id of usable) {
      const vs = rows.map((r) => r.v[id] ?? NaN), ps = rows.map((r) => r.rv);
      try { raw[id] = forecastMetrics(vs, ps); } catch { return { status: 'failed', detail: 'Non-finite metric; evaluation rejected.' }; }
    }
    const base = raw[BASELINE_MODEL];
    const ranked = usable.filter((id) => raw[id]).sort((a, b) => (raw[a]?.qlike ?? Infinity) - (raw[b]?.qlike ?? Infinity));
    for (const id of usable) {
      const metric = raw[id];
      if (!metric) continue;
      scores[id] = {
        qlike: metric.qlike, mse: metric.mse, rmse: Math.sqrt(metric.mse),
        qlikeDiffVsBaseline: base && id !== BASELINE_MODEL ? metric.qlike - base.qlike : null,
        relMseVsBaseline: base && id !== BASELINE_MODEL && base.mse > 0 ? 1 - metric.mse / base.mse : null,
        rank: ranked.indexOf(id) + 1,
      };
    }
    horizonResults.push({
      horizon: H, origins: rows.length, excludedOrigins: n - train - H + 1 - rows.length, originIndices: rows.map(r => r.t),
      originFrom: dates[rows[0].t], originTo: dates[rows[rows.length - 1].t],
      targetFrom: dates[rows[0].t + 1], targetTo: dates[rows[rows.length - 1].t + H],
      scores,
    });
  }

  return { status: 'ok', n, trainSize: train, refitEvery, garchFits, refitOrigins, ...(opts.captureTrace ? { trace } : {}), garchFailures, failedModels, horizons: horizonResults };
}
