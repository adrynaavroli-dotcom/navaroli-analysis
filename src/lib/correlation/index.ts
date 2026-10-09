/**
 * Covariance & Correlation Engine (COR-001, COR-002).
 * Input: ALIGNED MULTI-ASSET RETURNS from the Returns Engine (never prices).
 * Spec: docs/quant/correlation-engine.md
 */
import { TRADING_DAYS } from '../volatility/types';
import type { AlignedPanel } from '../returns';

export type Matrix = number[][];
/** Correlation cell: null = undefined (an asset has zero variance in the window). */
export type CorrMatrix = (number | null)[][];

/** Daily variance at or below this is treated as zero (σ_daily ≤ 1e-9). */
export const ZERO_VARIANCE_EPS = 1e-18;
/** Floating-point slack allowed outside [-1, 1]; larger breaches throw (never clipped). */
export const CORR_BOUND_TOL = 1e-12;
export const COV_WINDOWS = [20, 60, 120] as const;

/** Sample covariance (denominator W−1, two-pass) of rows = observations, cols = assets. null if < 2 rows. */
export function sampleCovariance(rows: number[][]): Matrix | null {
  const W = rows.length; if (W < 2) return null;
  const N = rows[0].length;
  const mu = new Array(N).fill(0);
  for (const r of rows) for (let j = 0; j < N; j++) mu[j] += r[j] / W;
  const S: Matrix = Array.from({ length: N }, () => new Array(N).fill(0));
  for (const r of rows) for (let i = 0; i < N; i++) { const di = r[i] - mu[i]; for (let j = i; j < N; j++) S[i][j] += di * (r[j] - mu[j]); }
  for (let i = 0; i < N; i++) for (let j = i; j < N; j++) { S[i][j] /= W - 1; S[j][i] = S[i][j]; }
  return S;
}

/** ρ_ij = Σ_ij / √(Σ_ii Σ_jj). Zero-variance assets → null row/column (diagonal included). */
export function covToCorr(S: Matrix): CorrMatrix {
  const N = S.length;
  const ok = S.map((r, i) => r[i] > ZERO_VARIANCE_EPS);
  return S.map((row, i) => row.map((v, j) => {
    if (!ok[i] || !ok[j]) return null;
    if (i === j) return 1;
    const rho = v / Math.sqrt(S[i][i] * S[j][j]);
    if (!Number.isFinite(rho) || Math.abs(rho) > 1 + CORR_BOUND_TOL) throw new Error(`Correlation out of bounds (${rho}) for assets ${i},${j}`);
    return rho;
  })).slice(0, N);
}

export interface RollingCovResult {
  tickers: string[];
  dates: string[];
  window: number;
  /** Daily covariance at each date; null during warm-up (first W−1 dates). */
  cov: (Matrix | null)[];
  corr: (CorrMatrix | null)[];
}

/**
 * Trailing rolling covariance & correlation on an aligned RETURNS panel.
 * Estimate at index t uses returns t−W+1..t only (no look-ahead); every asset
 * uses the same W observations because the panel is date-aligned (inner join).
 */
export function rollingCovariance(returns: AlignedPanel, window: number): RollingCovResult {
  const T = returns.dates.length;
  const cov: (Matrix | null)[] = new Array(T).fill(null);
  const corr: (CorrMatrix | null)[] = new Array(T).fill(null);
  if (window >= 2) for (let t = window - 1; t < T; t++) {
    const S = sampleCovariance(returns.values.slice(t - window + 1, t + 1))!;
    cov[t] = S; corr[t] = covToCorr(S);
  }
  return { tickers: returns.tickers, dates: returns.dates, window, cov, corr };
}

/** Annualized covariance = daily × 252 (same convention as volatility). */
export const annualize = (S: Matrix, days = TRADING_DAYS): Matrix => S.map((r) => r.map((v) => v * days));

/** Pairwise rolling correlation series for assets i, j. */
export const pairSeries = (res: RollingCovResult, i: number, j: number) => res.corr.map((c) => (c ? c[i][j] : null));
