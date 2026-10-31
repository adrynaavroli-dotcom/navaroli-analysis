/**
 * Portfolio metrics — POR-001. Pure functions on weight vectors and covariance
 * matrices; no estimation logic lives here.
 */
import type { Matrix } from '../correlation';
import { TRADING_DAYS } from '../volatility/types';

/** Daily portfolio variance wᵀΣw. */
export const portfolioVariance = (w: number[], S: Matrix): number =>
  w.reduce((a, wi, i) => a + wi * S[i].reduce((b, sij, j) => b + sij * w[j], 0), 0);

/** Annualized portfolio volatility √(wᵀΣw · 252) — same convention as the volatility module. */
export const annualizedVol = (w: number[], S: Matrix): number =>
  Math.sqrt(portfolioVariance(w, S) * TRADING_DAYS);

/** Herfindahl–Hirschman concentration index Σw² (1/N = fully diversified, 1 = single asset). */
export const hhi = (w: number[]): number => w.reduce((a, x) => a + x * x, 0);

/** Effective number of assets 1/HHI. */
export const effectiveN = (w: number[]): number => 1 / hhi(w);

/** One-way turnover between two weight vectors: Σ|w_next − w_prev| (reported only; costs are POR-006). */
export const turnover = (prev: number[], next: number[]): number =>
  prev.reduce((a, v, i) => a + Math.abs(next[i] - v), 0);

/** Equal-weight benchmark 1/N. */
export const equalWeights = (n: number): number[] => new Array(n).fill(1 / n);
