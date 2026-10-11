/**
 * EWMA (RiskMetrics) covariance & correlation — COR-003.
 * Spec: docs/quant/correlation-engine.md §EWMA.
 *
 * Mathematical model
 *   Σ_t = λ Σ_{t−1} + (1−λ) r_{t−1} r_{t−1}ᵀ           (zero-mean outer product)
 *   seed: Σ_{s−1} = sample covariance (W−1) of returns 0..s−1
 *
 * Conventions are deliberately IDENTICAL to VOL-002 (src/lib/volatility/ewma.ts):
 * same λ default, same seed window and seed estimator, same timing (estimate at
 * t uses returns ≤ t−1 for t ≥ s, so it is ex-ante). Hence diag(Σ_t)·252 squared-rooted
 * equals the univariate EWMA volatility of each asset — one EWMA definition in the engine.
 *
 * Positive semi-definiteness: the seed is a sample covariance (PSD) and each update
 * adds a non-negative multiple of a rank-1 PSD matrix, so every Σ_t is PSD by construction
 * (positive definite once the seed is, i.e. when s > N and returns are not collinear).
 */
import type { AlignedPanel } from '../returns';
import { EWMA_SEED_WINDOW } from '../volatility/ewma';
import { covToCorr, sampleCovariance, type CorrMatrix, type Matrix } from './index';

export const EWMA_COV_LAMBDA = 0.94;

export interface EwmaCovResult {
  tickers: string[];
  dates: string[];
  lambda: number;
  seed: number;
  /** Daily covariance; null before index seed−1. */
  cov: (Matrix | null)[];
  corr: (CorrMatrix | null)[];
}

export function ewmaCovariance(returns: AlignedPanel, lambda = EWMA_COV_LAMBDA, seed = EWMA_SEED_WINDOW): EwmaCovResult {
  if (!(lambda > 0 && lambda < 1)) throw new Error(`EWMA λ must be in (0,1), got ${lambda}`);
  const T = returns.dates.length;
  const cov: (Matrix | null)[] = new Array(T).fill(null);
  const corr: (CorrMatrix | null)[] = new Array(T).fill(null);
  if (seed >= 2 && T >= seed) {
    let S = sampleCovariance(returns.values.slice(0, seed))!;
    cov[seed - 1] = S; corr[seed - 1] = covToCorr(S);
    for (let t = seed; t < T; t++) {
      const r = returns.values[t - 1];
      // Build the new matrix (never mutate the previous one: each date keeps its own estimate).
      S = S.map((row, i) => row.map((v, j) => lambda * v + (1 - lambda) * r[i] * r[j]));
      cov[t] = S; corr[t] = covToCorr(S);
    }
  }
  return { tickers: returns.tickers, dates: returns.dates, lambda, seed, cov, corr };
}
