/**
 * Walk-forward out-of-sample evaluation of the GMV portfolio — POR-001.
 * Spec: docs/quant/minimum-variance.md §Walk-forward.
 *
 * Protocol (same no-look-ahead discipline as VOL-005):
 *   - Origins are non-overlapping blocks of `rebalance` trading days.
 *   - At origin t the covariance is estimated with returns up to and including
 *     index t only: sample → trailing window of `window` returns ending at t;
 *     EWMA → the ex-ante EWMA estimate at t+1 (which uses returns ≤ t).
 *   - Capital is allocated to the target weights at t and held buy-and-hold
 *     (no intra-block rebalancing) over returns t+1..t+R. Daily simple portfolio
 *     returns r_p = Σ w_drift·(exp(r_log)−1) are computed with weights drifting
 *     each day; realized volatility is the sample std (n−1) × √252 of those
 *     simple returns. (≤ v1.0.0 used Σ w·r_log with fixed weights, an
 *     approximation of a daily constant-mix portfolio.)
 *   - Actual one-way turnover at each rebalance compares the new target with
 *     the previous portfolio's drifted end-of-block weights.
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
import { driftWeights, equalWeights, hhi, turnover } from './metrics';

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
  /** Equal-weight realized volatility over the same holding block (benchmark). */
  ewRealizedVol: number | null;
  hhi: number | null;
  /** GMV weights at the end of the holding block after buy-and-hold drift. */
  driftedWeights: number[] | null;
  /** Equal-weight drifted weights at the end of the holding block. */
  ewDriftedWeights: number[] | null;
}

export interface TurnoverStats { mean: number; median: number; min: number; max: number; n: number }

export interface WalkForwardSummary {
  origins: number;
  converged: number;
  failed: number;
  gmvMeanRealizedVol: number | null;
  ewMeanRealizedVol: number | null;
  /** gmvMeanRealizedVol / ewMeanRealizedVol (< 1 means lower realized risk than equal weight). */
  volRatio: number | null;
  gmvMeanHhi: number | null;
  /** Mean one-way change between consecutive TARGET weights (ignores drift; not actual turnover). */
  gmvMeanTargetWeightChange: number | null;
  /** Actual one-way turnover: new target vs previous drifted weights. */
  gmvActualTurnover: TurnoverStats | null;
  ewActualTurnover: TurnoverStats | null;
}

export interface WalkForwardResult {
  tickers: string[];
  options: WalkForwardOptions;
  origins: WalkForwardOrigin[];
  summary: WalkForwardSummary;
}

/**
 * Buy-and-hold block: start at target weights, drift daily, collect simple
 * portfolio returns over returns [from, to). Panel values are log returns from
 * the Returns Engine; they are converted to simple returns here because a
 * portfolio's return is the weighted sum of SIMPLE asset returns.
 * Returns annualized sample volatility (n−1, √252) and end-of-block weights.
 */
function buyAndHoldBlock(panel: AlignedPanel, target: number[], from: number, to: number): { vol: number; drifted: number[] } {
  const n = to - from;
  if (n < 2) return { vol: NaN, drifted: target.slice() };
  let w = target.slice();
  const pr: number[] = [];
  for (let t = from; t < to; t++) {
    const d = driftWeights(w, panel.values[t].map((x) => Math.exp(x) - 1));
    pr.push(d.portfolioReturn);
    w = d.weights;
  }
  const mu = pr.reduce((a, v) => a + v, 0) / n;
  const v = pr.reduce((a, r) => a + (r - mu) * (r - mu), 0) / (n - 1);
  return { vol: Math.sqrt(v * TRADING_DAYS), drifted: w };
}

function stats(xs: number[]): TurnoverStats | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return { mean: xs.reduce((a, v) => a + v, 0) / xs.length, median: s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2, min: s[0], max: s[s.length - 1], n: xs.length };
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
  // Holding block of origin t: returns t+1 .. t+R, so the last valid origin has t + R ≤ T − 1.
  for (let t = 0; t + o.rebalance < T; t += o.rebalance) {
    const S = covPath[t];
    if (!S) continue; // warm-up: no estimate available yet
    const res = o.longOnly ? gmvLongOnly(S, o.maxWeight) : gmvClosedForm(S);
    if (res.status !== 'OK' || !res.weights) {
      origins.push({ date: panel.dates[t], index: t, status: res.status, weights: null, conditionNumber: res.conditionNumber, realizedVol: null, ewRealizedVol: null, hhi: null, driftedWeights: null, ewDriftedWeights: null });
      continue;
    }
    const g = buyAndHoldBlock(panel, res.weights, t + 1, t + 1 + o.rebalance);
    const e = buyAndHoldBlock(panel, ew, t + 1, t + 1 + o.rebalance);
    origins.push({
      date: panel.dates[t],
      index: t,
      status: 'OK',
      weights: res.weights,
      conditionNumber: res.conditionNumber,
      realizedVol: g.vol,
      ewRealizedVol: e.vol,
      hhi: hhi(res.weights),
      driftedWeights: g.drifted,
      ewDriftedWeights: e.drifted,
    });
  }

  const ok = origins.filter((x) => x.status === 'OK' && x.realizedVol !== null && Number.isFinite(x.realizedVol));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null);
  const gmvVols = ok.map((x) => x.realizedVol!);
  const ewVols = ok.map((x) => x.ewRealizedVol!).filter(Number.isFinite);
  // Transitions only between consecutive converged origins: after a failed
  // origin there is no well-defined held portfolio to compare against.
  const targetChange: number[] = [], gmvActual: number[] = [], ewActual: number[] = [];
  for (let i = 1; i < ok.length; i++) {
    targetChange.push(turnover(ok[i - 1].weights!, ok[i].weights!));
    gmvActual.push(turnover(ok[i - 1].driftedWeights!, ok[i].weights!));
    ewActual.push(turnover(ok[i - 1].ewDriftedWeights!, ew));
  }

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
      gmvMeanTargetWeightChange: mean(targetChange),
      gmvActualTurnover: stats(gmvActual),
      ewActualTurnover: stats(ewActual),
    },
  };
}
