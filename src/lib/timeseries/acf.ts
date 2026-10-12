/**
 * Autocorrelation and Ljung–Box (STA-002). Spec: docs/quant/time-series-diagnostics.md
 *
 * ACF estimator (Box–Jenkins, statsmodels `acf(adjusted=False)` default):
 *   ρ̂_k = ĉ_k / ĉ_0,   ĉ_k = (1/n) Σ_{t=k+1..n} (x_t − x̄)(x_{t−k} − x̄)
 * Denominator n (not n−k) for every lag: it keeps the autocovariance sequence
 * positive semi-definite and is the form the Ljung–Box statistic is built on.
 *
 * Ljung–Box: Q(m) = n(n+2) Σ_{k=1..m} ρ̂_k² / (n−k) ~ χ²(m) under H0 (no
 * autocorrelation up to lag m). df = m because the test is applied to raw
 * (squared) returns, not to residuals of a fitted ARMA model.
 */
import { chiSquareSurvival } from './special';

export const LJUNG_BOX_LAGS = [10, 20] as const;

export class TimeSeriesInputError extends Error {}

/** Inputs must be finite (the Returns Engine never emits gaps; any NaN here is a bug upstream). */
export function assertFiniteSeries(x: number[], minLength: number, what: string) {
  if (!x.every(Number.isFinite)) throw new TimeSeriesInputError(`${what}: series contains non-finite values`);
  if (x.length < minLength) throw new TimeSeriesInputError(`${what}: needs at least ${minLength} observations, got ${x.length}`);
}
export const isConstant = (x: number[]) => x.every((v) => v === x[0]);

/**
 * ρ̂_0..ρ̂_nlags. Returns null for a constant series (ĉ_0 = 0 ⇒ undefined; never NaN).
 * Requires n > nlags.
 */
export function acf(x: number[], nlags: number): number[] | null {
  assertFiniteSeries(x, nlags + 1, 'ACF');
  if (isConstant(x)) return null;
  const n = x.length, m = x.reduce((a, b) => a + b, 0) / n;
  const d = x.map((v) => v - m);
  const c = (k: number) => { let s = 0; for (let t = k; t < n; t++) s += d[t] * d[t - k]; return s / n; };
  const c0 = c(0);
  return Array.from({ length: nlags + 1 }, (_, k) => (k === 0 ? 1 : c(k) / c0));
}

/** Two-sided 95% band ±1.96/√n for ρ̂_k under i.i.d. (Bartlett, white-noise case). */
export const acfWhiteNoiseBand = (n: number) => 1.959963984540054 / Math.sqrt(n);

export interface LjungBoxResult { lag: number; statistic: number; df: number; pValue: number }

/** Ljung–Box at each requested lag. null for a constant series. Requires n > max(lags) + 1. */
export function ljungBox(x: number[], lags: readonly number[] = LJUNG_BOX_LAGS): LjungBoxResult[] | null {
  const maxLag = Math.max(...lags);
  assertFiniteSeries(x, maxLag + 2, 'Ljung–Box');
  const r = acf(x, maxLag);
  if (!r) return null;
  const n = x.length;
  return lags.map((m) => {
    let s = 0;
    for (let k = 1; k <= m; k++) s += (r[k] * r[k]) / (n - k);
    const statistic = n * (n + 2) * s;
    return { lag: m, statistic, df: m, pValue: chiSquareSurvival(statistic, m) };
  });
}
