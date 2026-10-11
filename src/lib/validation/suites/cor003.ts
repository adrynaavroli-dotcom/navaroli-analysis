import { alignPrices, panelReturns } from '../../returns';
import { ewmaCovariance } from '../../correlation/ewma';
import { ewmaVolatility } from '../../volatility/ewma';
import { TRADING_DAYS } from '../../volatility/types';
import { CORR_BOUND_TOL, type Matrix } from '../../correlation';
import { compareExact, compareNumeric, type CompareMeta } from '../compare';
import type { ValidationResult } from '../types';
import type { Phase4Fixture } from './phase4';

export const COR003_IMPLEMENTATION_VERSION = 'quant-engine/cor003-ewma-cov@1.0.0';

type M = (number | null)[][];
export interface Cor003Fixture {
  meta: { version: string; lambda: number; seed: number; source: string; python: string; numpy: string };
  cov: (M | null)[]; corr: (M | null)[]; covLambda097: (M | null)[];
  minEigenvalue: number; univariateVar0: (number | null)[];
}

const flat = (xs: (M | null)[], n: number) => xs.flatMap((m) => (m ? m.flat() : new Array(n * n).fill(null)));
const TOL = { cov: { abs: 1e-18, rel: 1e-10 }, corr: { abs: 1e-12, rel: 1e-10 } };

/** Smallest LDLᵀ pivot (≥ 0 ⇔ PSD for symmetric matrices without zero pivots). */
function minPivot(S: Matrix): number {
  const n = S.length, A = S.map((r) => [...r]);
  let min = Infinity;
  for (let k = 0; k < n; k++) {
    min = Math.min(min, A[k][k]);
    for (let i = k + 1; i < n; i++) { const f = A[i][k] / A[k][k]; for (let j = k; j < n; j++) A[i][j] -= f * A[k][j]; }
  }
  return min;
}

export function runCor003(p4: Phase4Fixture, fx: Cor003Fixture, validationDate: string): ValidationResult[] {
  const py = `Python ${fx.meta.python} · numpy ${fx.meta.numpy}`;
  const ds = `SYNTHETIC TEST DATA — ${fx.meta.version} on ${fx.meta.source} returns panel`;
  const m = (testName: string, reference: string, validationType: CompareMeta['validationType'] = 'independent-benchmark'): CompareMeta =>
    ({ modelId: 'COR-003', testName, validationType, reference: validationType === 'independent-benchmark' ? `${reference} (${py})` : reference, dataset: ds, validationDate, implementationVersion: COR003_IMPLEMENTATION_VERSION });
  const rets = panelReturns(alignPrices(p4.panel.input), 'log');
  const N = rets.tickers.length;
  const res = ewmaCovariance(rets, fx.meta.lambda, fx.meta.seed);
  const out: ValidationResult[] = [];

  out.push(compareNumeric(flat(res.cov, N), flat(fx.cov, N), TOL.cov, m(`EWMA covariance λ=${fx.meta.lambda}, seed ${fx.meta.seed} (incl. warm-up nulls)`, 'numpy closed-form weighted sum')));
  out.push(compareNumeric(flat(res.corr, N), flat(fx.corr, N), TOL.corr, m('EWMA correlation (D⁻¹ΣD⁻¹)', 'numpy closed-form')));
  out.push(compareNumeric(flat(ewmaCovariance(rets, 0.97, fx.meta.seed).cov, N), flat(fx.covLambda097, N), TOL.cov, m('EWMA covariance λ=0.97 (parameter not hard-coded)', 'numpy closed-form weighted sum')));
  out.push(compareNumeric(res.cov.map((S) => (S ? S[0][0] : null)), fx.univariateVar0, TOL.cov, m('Diagonal = univariate EWMA variance (asset 0)', 'numpy univariate loop')));

  // Consistency with VOL-002: √(252·Σ_ii,t) equals ewmaVolatility() for every asset.
  const diag = rets.tickers.flatMap((_, i) => res.cov.map((S) => (S ? Math.sqrt(S[i][i] * TRADING_DAYS) : null)));
  const vol = rets.tickers.flatMap((_, i) => ewmaVolatility(rets.values.map((r) => r[i]), rets.dates, fx.meta.lambda, fx.meta.seed).values);
  out.push(compareNumeric(diag, vol, { abs: 1e-15, rel: 1e-12 }, m('Diagonal ≡ VOL-002 EWMA volatility for all assets', 'VOL-002 ewmaVolatility() (validated)', 'numerical')));

  const est = res.cov.map((S, t) => [S, res.corr[t]] as const).filter(([S]) => S) as [Matrix, M][];
  let asym = 0, diagErr = 0, bound = 0, pivot = Infinity;
  for (const [S, R] of est) {
    pivot = Math.min(pivot, minPivot(S));
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      asym = Math.max(asym, Math.abs(S[i][j] - S[j][i]), Math.abs(R[i][j]! - R[j][i]!));
      if (i === j) diagErr = Math.max(diagErr, Math.abs(R[i][i]! - 1)); else bound = Math.max(bound, Math.abs(R[i][j]!) - 1);
    }
  }
  out.push(compareNumeric([asym, diagErr, Math.max(0, bound)], [0, 0, 0], { abs: CORR_BOUND_TOL, rel: 0 }, m(`Symmetry, unit diagonal, |ρ| ≤ 1 across ${est.length} EWMA matrices`, 'Mathematical properties', 'numerical')));
  out.push(compareExact([pivot > 0, fx.minEigenvalue > 0], [true, true], { ...m('Positive definite at every date (LDLᵀ pivots > 0; numpy min eigenvalue > 0)', 'PSD by construction: PSD seed + rank-1 PSD updates', 'numerical'), notes: `min pivot ${pivot.toExponential(3)}, numpy min eigenvalue ${fx.minEigenvalue.toExponential(3)}` }));

  // Ex-ante timing: a shock to r_150 first affects Σ_151, never Σ_≤150.
  const tamp = { ...rets, values: rets.values.map((r, t) => (t === 150 ? r.map((v) => v + 0.5) : r)) };
  const b = ewmaCovariance(tamp, fx.meta.lambda, fx.meta.seed).cov;
  out.push(compareNumeric(flat(res.cov.slice(0, 151), N), flat(b.slice(0, 151), N), 'exact', m('No look-ahead: shock at r_150 leaves Σ_t for t ≤ 150 unchanged', 'Ex-ante recursion property', 'numerical')));
  out.push(compareExact([b[151]![0][0] !== res.cov[151]![0][0]], [true], m('Shock at r_150 enters Σ_151', 'Recursion timing', 'numerical')));

  // Hand-checkable 2×2: seed 2 obs, one update.
  const hand = ewmaCovariance({ dates: ['a', 'b', 'c'], tickers: ['X', 'Y'], values: [[1, 2], [3, 0], [5, 4]], dropped: {} }, 0.5, 2).cov[2]!;
  // seed = cov([[1,2],[3,0]]) = [[2,-2],[-2,2]]; Σ = 0.5·seed + 0.5·[3,0][3,0]ᵀ = [[5.5,-1],[-1,1]]
  out.push(compareNumeric(hand.flat(), [5.5, -1, -1, 1], { abs: 1e-15, rel: 0 }, m('Hand-checkable 2×2 (λ=0.5, seed 2)', 'Manual calculation', 'numerical')));
  out.push(compareExact([ewmaCovariance({ ...rets, dates: rets.dates.slice(0, 10), values: rets.values.slice(0, 10) }).cov.every((x) => x === null)], [true], m('Insufficient observations (< seed) → all null', 'Spec', 'numerical')));
  return out;
}
