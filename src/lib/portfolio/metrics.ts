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

/**
 * One-way turnover between two fully invested weight vectors: ½·Σ|w_next − w_prev|.
 * For long-only, fully invested portfolios buys equal sells, so the factor ½
 * counts each unit of traded capital once. Pass the drifted pre-trade weights
 * as `prev` to obtain actual turnover (costs are POR-006).
 */
export const turnover = (prev: number[], next: number[]): number =>
  0.5 * prev.reduce((a, v, i) => a + Math.abs(next[i] - v), 0);

/**
 * Buy-and-hold weight drift after one period of simple returns:
 * w'_i = w_i·(1+r_i)/(1+r_p), with r_p = Σ w_i·r_i. Returns the portfolio
 * simple return and the post-return weights (which still sum to 1).
 */
export function driftWeights(w: number[], simpleReturns: number[]): { portfolioReturn: number; weights: number[] } {
  let rp = 0;
  for (let i = 0; i < w.length; i++) rp += w[i] * simpleReturns[i];
  if (!(1 + rp > 0)) throw new Error('Portfolio wiped out (1 + r_p ≤ 0): drift undefined');
  return { portfolioReturn: rp, weights: w.map((wi, i) => (wi * (1 + simpleReturns[i])) / (1 + rp)) };
}

/** Equal-weight benchmark 1/N. */
export const equalWeights = (n: number): number[] => new Array(n).fill(1 / n);
