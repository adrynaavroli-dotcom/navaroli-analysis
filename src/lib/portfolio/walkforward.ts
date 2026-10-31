/**
 * Walk-forward out-of-sample evaluation of the GMV portfolio — POR-001.
 * Spec: docs/quant/minimum-variance.md §Walk-forward.
 *
 * Protocol (same no-look-ahead discipline as VOL-005):
 *   - Origins are non-overlapping blocks of `rebalance` trading days.
 *   - At origin t the covariance is estimated with returns up to and including
 *     index t only: sample → trailing window of `window` returns ending at t;
 *     EWMA → the ex-ante EWMA estimate at t+1 (which uses returns ≤ t).
 *   - The weights are held fixed over the next `rebalance` returns (t+1..t+R)
 *     and the realized portfolio volatility is measured on that block.
 *   - Origins whose optimization fails are recorded with their status and
 *     excluded from the summary means — never silently skipped.
 *
 * Passing this evaluation means the protocol was executed correctly, NOT that
 * GMV beats equal weight; the realized numbers are reported as they come out.
 */
import type { AlignedPanel } from '../returns';
import { rollingCovariance, type Matrix } from '../correlation';
import { ewmaCovariance } from '../correlation/ewma';
import { TRADING_DAYS } from '../volatility/types';
import { gmvClosedForm, gmvLongOnly, type MinVarianceStatus } from './min-variance';
import { equalWeights, hhi, turnover } from './metrics';

export interface WalkForwardOptions {
  /** Estimation window in returns (sample estimator). */
  window: number;
  /** Holding period between rebalances, in trading days. */
  rebalance: number;
  estimator: 'sample' | 'ewma';
  /** Per-asset cap for the long-only QP. */
  maxWeight: number;
  /** true → long-only active-set QP; false → unconstrained closed form. */
  longOnly: boolean;
}

export const DEFAULT_WALKFORWARD: WalkForwardOptions = { window: 120, rebalance: 21, estimator: 'sample', maxWeight: 1, longOnly: true };

export interface WalkForwardOrigin {
  /** Date of the last return used for estimation. */
  date: string;
  index: number;
  status: MinVarianceStatus;
  weights: number[] | null;
  conditionNumber: number | null;
  /** Annualized realized volatility over the holding block; null when the origin failed. */
  realizedVol: number | null;
  hhi: number | null;
}

export interface WalkForwardSummary {
  origins: number;
  converged: number;
  failed: number;
  gmvMeanRealizedVol: number | null;
  ewMeanRealizedVol: number | null;
  /** gmvMeanRealizedVol / ewMeanRealizedVol (< 1 means lower realized risk than equal weight). */
  volRatio: number | null;
  gmvMeanHhi: number | null;
  gmvMeanTurnover: number | null;
}

export interface WalkForwardResult {
  tickers: string[];
  options: WalkForwardOptions;
  origins: WalkForwardOrigin[];
  summary: WalkForwardSummary;
}

/** Sample standard deviation (n−1) of portfolio returns over a block, annualized (√252). */
function realizedVol(panel: AlignedPanel, w: number[], from: number, to: number): number {
  const n = to - from;
  if (n < 2) return NaN;
  const pr: number[] = [];
  for (let t = from; t < to; t++) {
    let r = 0;
    for (let j = 0; j < w.length; j++) r += w[j] * panel.values[t][j];
    pr.push(r);
  }
  const mu = pr.reduce((a, v) => a + v, 0) / n;
  const v = pr.reduce((a, r) => a + (r - mu) * (r - mu), 0) / (n - 1);
  return Math.sqrt(v * TRADING_DAYS);
}

export function walkForward(panel: AlignedPanel, o: WalkForwardOptions = DEFAULT_WALKFORWARD): WalkForwardResult {
  const T = panel.dates.length;
  const n = panel.tickers.length;
  if (o.window < 2 || o.rebalance < 2) throw new Error('window and rebalance must be ≥ 2');
  if (o.estimator === 'sample' && o.window <= n) throw new Error(`Sample covariance needs window > N (${o.window} ≤ ${n}): matrix would be singular`);

  // Precompute both covariance paths once; each origin then reads the estimate
  // that uses returns ≤ t only (see header for the exact timing convention).
  const covPath: (Matrix | null)[] =
    o.estimator === 'ewma'
      ? ewmaCovariance(panel).cov.map((_, i, arr) => (i + 1 < arr.length ? arr[i + 1] : null))
      : rollingCovariance(panel, o.window).cov;

  const ew = equalWeights(n);
  const origins: WalkForwardOrigin[] = [];
  for (let t = 0; t + o.rebalance < T + 1 && t + o.rebalance <= T - 1 + 1; t += o.rebalance) {
    // holding block: returns t+1 .. t+R (indices t+1 .. t+R inclusive → realizedVol(t+1, t+R+1))
    if (t + o.rebalance >= T) break;
    const S = covPath[t];
    if (!S) continue; // warm-up: no estimate available yet
    const res = o.longOnly ? gmvLongOnly(S, o.maxWeight) : gmvClosedForm(S);
    if (res.status !== 'OK' || !res.weights) {
      origins.push({ date: panel.dates[t], index: t, status: res.status, weights: null, conditionNumber: res.conditionNumber, realizedVol: null, hhi: null });
      continue;
    }
    origins.push({
      date: panel.dates[t],
      index: t,
      status: 'OK',
      weights: res.weights,
      conditionNumber: res.conditionNumber,
      realizedVol: realizedVol(panel, res.weights, t + 1, t + 1 + o.rebalance),
      hhi: hhi(res.weights),
    });
  }

  const ok = origins.filter((x) => x.status === 'OK' && x.realizedVol !== null && Number.isFinite(x.realizedVol));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null);
  const gmvVols = ok.map((x) => x.realizedVol!);
  const ewVols = ok.map((x) => realizedVol(panel, ew, x.index + 1, x.index + 1 + o.rebalance)).filter(Number.isFinite);
  const turns: number[] = [];
  for (let i = 1; i < ok.length; i++) turns.push(turnover(ok[i - 1].weights!, ok[i].weights!));

  const gmvMean = mean(gmvVols);
  const ewMean = mean(ewVols);
  return {
    tickers: panel.tickers,
    options: o,
    origins,
    summary: {
      origins: origins.length,
      converged: ok.length,
      failed: origins.length - ok.length,
      gmvMeanRealizedVol: gmvMean,
      ewMeanRealizedVol: ewMean,
      volRatio: gmvMean !== null && ewMean ? gmvMean / ewMean : null,
      gmvMeanHhi: mean(ok.map((x) => x.hhi!)),
      gmvMeanTurnover: mean(turns),
    },
  };
}
