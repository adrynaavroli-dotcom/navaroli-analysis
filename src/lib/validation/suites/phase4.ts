import { alignPrices, panelReturns } from '../../returns';
import { covToCorr, rollingCovariance, sampleCovariance, CORR_BOUND_TOL, COV_WINDOWS, type Matrix } from '../../correlation';
import { compareExact, compareNumeric, type CompareMeta } from '../compare';
import type { ValidationResult } from '../types';

export const PHASE4_IMPLEMENTATION_VERSION = 'quant-engine/phase4-correlation@1.0.0';

type M = (number | null)[][];
export interface Phase4Fixture {
  meta: { version: string; seed: number; python: string; numpy: string; pandas: string };
  panel: { input: Record<string, { dates: string[]; prices: number[] }>; alignedDates: string[]; returnDates: string[]; returns: number[][];
    rolling: Record<string, { cov: (M | null)[]; corr: (M | null)[] }> };
  hand: { rows: number[][]; cov: number[][] };
  perfectPositive: { rows: number[][]; corr: number };
  perfectNegative: { rows: number[][]; corr: number };
  independent: { rows: number[][]; corr: number; bound: number };
  constant: { rows: number[][]; cov: number[][] };
}

/** Flatten a series of matrices (null warm-up → one null per cell) for element-wise comparison. */
const flat = (xs: (M | null)[], n: number) => xs.flatMap((m) => (m ? m.flat() : new Array(n * n).fill(null)));
const TOL = { cov: { abs: 1e-17, rel: 1e-9 }, corr: { abs: 1e-12, rel: 1e-10 }, hand: { abs: 1e-15, rel: 1e-13 } };

export function runPhase4(fx: Phase4Fixture, validationDate: string): ValidationResult[] {
  const py = `Python ${fx.meta.python} · numpy ${fx.meta.numpy} · pandas ${fx.meta.pandas}`;
  const ds = `SYNTHETIC TEST DATA — ${fx.meta.version}, seed ${fx.meta.seed}`;
  const m = (modelId: string, testName: string, reference: string, validationType: CompareMeta['validationType'] = 'independent-benchmark'): CompareMeta =>
    ({ modelId, testName, validationType, reference: validationType === 'independent-benchmark' ? `${reference} (${py})` : reference, dataset: ds, validationDate, implementationVersion: PHASE4_IMPLEMENTATION_VERSION });
  const out: ValidationResult[] = [];

  // Case A — 4 assets, missing dates, unequal histories → Returns Engine alignment → rolling windows
  const prices = alignPrices(fx.panel.input);
  const rets = panelReturns(prices, 'log');
  const N = rets.tickers.length;
  out.push(compareExact(prices.dates, fx.panel.alignedDates, m('COR-001', 'Alignment of 4 assets with missing dates / unequal histories', 'pandas concat(join="inner")')));
  out.push(compareNumeric(rets.values.flat(), fx.panel.returns.flat(), { abs: 1e-15, rel: 1e-12 }, m('COR-001', 'Aligned log-returns panel (284×4)', 'numpy log(P/P.shift(1))')));
  for (const W of COV_WINDOWS) {
    const r = rollingCovariance(rets, W);
    const ref = fx.panel.rolling[String(W)];
    out.push(compareNumeric(flat(r.cov, N), flat(ref.cov, N), TOL.cov, m('COR-001', `Rolling covariance ${W}D (incl. warm-up nulls)`, `pandas rolling(${W}).cov()`)));
    out.push(compareNumeric(flat(r.corr, N), flat(ref.corr, N), TOL.corr, m('COR-002', `Rolling correlation ${W}D (incl. warm-up nulls)`, `pandas rolling(${W}).corr()`)));
  }
  // Case B — hand-checkable
  out.push(compareNumeric(sampleCovariance(fx.hand.rows)!.flat(), fx.hand.cov.flat(), TOL.hand, m('COR-001', 'Hand-checkable 3-asset covariance (4 obs)', 'numpy.cov(ddof=1)')));
  out.push(compareNumeric(sampleCovariance(fx.hand.rows)!.flat(), [5 / 3, 1 / 3, 2 / 3, 1 / 3, 2 / 3, 1 / 3, 2 / 3, 1 / 3, 2 / 3], TOL.hand, m('COR-001', 'Hand-checkable covariance vs closed form (5/3, 1/3, 2/3…)', 'Manual calculation', 'numerical')));
  // Case C — perfect ±1, independent, constant
  const c = (rows: number[][]) => covToCorr(sampleCovariance(rows)!)[0][1]!;
  out.push(compareNumeric([c(fx.perfectPositive.rows)], [fx.perfectPositive.corr], TOL.corr, m('COR-002', 'Perfect positive correlation (y = 2x + c)', 'numpy.corrcoef')));
  out.push(compareNumeric([c(fx.perfectPositive.rows)], [1], TOL.corr, m('COR-002', 'Perfect positive correlation = +1', 'Closed form', 'numerical')));
  out.push(compareNumeric([c(fx.perfectNegative.rows)], [-1], TOL.corr, m('COR-002', 'Perfect negative correlation = −1', 'Closed form', 'numerical')));
  out.push(compareNumeric([c(fx.independent.rows)], [fx.independent.corr], TOL.corr, m('COR-002', 'Independent series (n=5000) vs numpy', 'numpy.corrcoef')));
  out.push(compareNumeric([Math.abs(c(fx.independent.rows)) <= fx.independent.bound ? 1 : 0], [1], 'exact',
    { ...m('COR-002', `Independent series: |ρ| ≤ 4/√n = ${fx.independent.bound.toFixed(4)}`, 'Sampling distribution of ρ under independence (sd ≈ 1/√n)', 'numerical'), notes: 'Statistical tolerance of 4 standard errors' }));
  const cc = covToCorr(sampleCovariance(fx.constant.rows)!);
  out.push(compareNumeric(cc.flat(), [1, null, null, null], 'exact', { ...m('COR-002', 'Zero-variance asset → correlation unavailable (null), no NaN/∞', 'Spec: variance ≤ 1e-18 treated as zero', 'numerical'), notes: `numpy gives variance ${fx.constant.cov[1][1].toExponential(2)} (round-off) for a constant series` }));
  // Structural checks on every rolling estimate
  const all = COV_WINDOWS.flatMap((W) => { const r = rollingCovariance(rets, W); return r.cov.map((S, t) => [S, r.corr[t]] as const).filter(([S]) => S); });
  let asym = 0, diag = 0, bound = 0;
  for (const [S, R] of all) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    asym = Math.max(asym, Math.abs((S as Matrix)[i][j] - (S as Matrix)[j][i]), Math.abs(R![i][j]! - R![j][i]!));
    if (i === j) diag = Math.max(diag, Math.abs(R![i][i]! - 1)); else bound = Math.max(bound, Math.abs(R![i][j]!) - 1);
  }
  out.push(compareNumeric([asym, diag, Math.max(0, bound)], [0, 0, 0], { abs: CORR_BOUND_TOL, rel: 0 }, m('COR-002', `Symmetry, unit diagonal, |ρ| ≤ 1 across ${all.length} rolling matrices`, 'Mathematical properties', 'numerical')));
  // No look-ahead: changing a future return leaves earlier estimates unchanged
  const tamp = { ...rets, values: rets.values.map((r, t) => (t === 150 ? r.map((v) => v + 0.5) : r)) };
  const a = rollingCovariance(rets, 60).cov.slice(0, 150), b = rollingCovariance(tamp, 60).cov.slice(0, 150);
  out.push(compareNumeric(flat(a, N), flat(b, N), 'exact', m('COR-001', 'No look-ahead: shock at t=150 leaves estimates t<150 unchanged', 'Trailing-window property', 'numerical')));
  // Insufficient observations
  out.push(compareExact([sampleCovariance([[1, 2]]) === null, rollingCovariance({ ...rets, dates: rets.dates.slice(0, 10), values: rets.values.slice(0, 10) }, 20).cov.every((x) => x === null)], [true, true],
    m('COR-001', 'Insufficient observations → no estimate (1 obs; 10 obs with W=20)', 'Spec', 'numerical')));
  return out;
}
