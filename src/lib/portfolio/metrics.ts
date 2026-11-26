/**
 * Portfolio metrics — POR-001. Pure functions on weight vectors and covariance
 * matrices; no estimation logic lives here.
 *
 * Since @1.2.0 (F0.1) buy-and-hold drift is computed from GROSS asset factors
 * with an error-free product/sum (Dekker TwoProduct + Shewchuk expansion) so
 * the SIGN of the portfolio gross factor is exact for the binary64 inputs and
 * economic insolvency can be separated from numerical cancellation.
 * Spec: docs/quant/minimum-variance.md §Gross-factor drift.
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
 * Pass the drifted pre-trade weights as `prev` to obtain actual turnover.
 */
export const turnover = (prev: number[], next: number[]): number =>
  0.5 * prev.reduce((a, v, i) => a + Math.abs(next[i] - v), 0);

/** Equal-weight benchmark 1/N. */
export const equalWeights = (n: number): number[] => new Array(n).fill(1 / n);

// ───────────────────────── Error-free arithmetic ─────────────────────────

/** Smallest positive normal binary64, 2^-1022. */
export const MIN_NORMAL = 2 ** -1022;
/** Operand cap for Dekker's split: SPLITTER·x must not overflow (2^27·2^996 ≪ 2^1024). */
export const MAX_OPERAND = 2 ** 996;
/** Lower bound on |hi| so the product residual lo cannot underflow (Boldo–Muller condition). */
export const MIN_PRODUCT = 2 ** -969;
const SPLITTER = 134217729; // 2^27 + 1 (Veltkamp)
/** Stability threshold on ρ = |G_p| / C_abs. */
export const RHO_MIN = 1e-12;
/** Max |Σw − 1| accepted as a fully invested input before normalisation. */
export const BUDGET_TOL = 1e-9;

/** Dekker TwoProduct: a·b = hi + lo exactly, given the operand guards enforced by the caller. */
export function twoProduct(a: number, b: number): [number, number] {
  const hi = a * b;
  let c = SPLITTER * a;
  const ah = c - (c - a), al = a - ah;
  c = SPLITTER * b;
  const bh = c - (c - b), bl = b - bh;
  const lo = ((ah * bh - hi) + ah * bl + al * bh) + al * bl;
  return [hi, lo];
}

/** Knuth TwoSum: a + b = s + e exactly (no branch, valid for any finite a, b without overflow). */
function twoSum(a: number, b: number): [number, number] {
  const s = a + b;
  const bv = s - a;
  const e = (a - (s - bv)) + (b - bv);
  return [s, e];
}

/**
 * Shewchuk Grow-Expansion with zero elimination: adds b to a non-overlapping
 * expansion (increasing magnitude). Returns null if any partial is non-finite.
 */
export function growExpansion(e: number[], b: number): number[] | null {
  const out: number[] = [];
  let q = b;
  for (const ei of e) {
    const [s, h] = twoSum(q, ei);
    if (!Number.isFinite(s) || !Number.isFinite(h)) return null;
    if (h !== 0) out.push(h);
    q = s;
  }
  if (!Number.isFinite(q)) return null;
  if (q !== 0) out.push(q);
  return out;
}

/** Exact expansion of a list of floats; null on non-finite partials. */
export function expansionOf(terms: number[]): number[] | null {
  let e: number[] = [];
  for (const t of terms) {
    const g = growExpansion(e, t);
    if (!g) return null;
    e = g;
  }
  return e;
}

/** Sign of the exact expansion = sign of its largest-magnitude (last) non-zero component. */
export const expansionSign = (e: number[]): -1 | 0 | 1 => (e.length === 0 ? 0 : e[e.length - 1] > 0 ? 1 : -1);

/** Float approximation of an expansion (summed small → large). */
const approx = (e: number[]): number => e.reduce((a, v) => a + v, 0);

const f64 = new Float64Array(1);
const i64 = new BigInt64Array(f64.buffer);
/** Next binary64 towards +∞ (x finite). */
export function nextUp(x: number): number {
  if (x === 0) return Number.MIN_VALUE;
  f64[0] = x;
  i64[0] += x > 0 ? 1n : -1n;
  return f64[0];
}
/** Next binary64 towards −∞ (x finite). */
export const nextDown = (x: number): number => -nextUp(-x);

/**
 * Binary64 c with c ≥ value(E) (rounding towards +∞): start from the nearest
 * approximation and step nextUp while the EXACT remainder E − c is positive.
 */
export function expansionUpper(e: number[]): number | null {
  let c = approx(e);
  for (let k = 0; k < 8; k++) {
    if (!Number.isFinite(c)) return null;
    const r = growExpansion(e, -c);
    if (!r) return null;
    if (expansionSign(r) <= 0) return c;
    c = nextUp(c);
  }
  return null;
}
/** Binary64 c with c ≤ value(E) (rounding towards −∞). */
export function expansionLower(e: number[]): number | null {
  const u = expansionUpper(e.map((x) => -x));
  return u === null ? null : -u;
}

// ───────────────────────── Gross-factor drift ─────────────────────────

export type DriftStatus = 'OK' | 'INSOLVENT' | 'NUMERICALLY_UNSTABLE';

export interface DriftResult {
  status: DriftStatus;
  /** Portfolio gross factor G_p = Σ w̃_i g_i (rounded from the exact expansion); null unless OK. */
  grossFactor: number | null;
  /** Simple portfolio return G_p − 1 (from the expansion, so no extra cancellation); null unless OK. */
  portfolioReturn: number | null;
  /** Post-period weights w̃_i g_i / G_p; null unless OK. */
  weights: number[] | null;
  /** Diagnostic ρ ≈ |G_p| / C_abs (classification uses the directed bounds, not this ratio). */
  rho: number | null;
  /** True only for an exact-zero expansion in the driftFromGross test seam. */
  exactZero?: boolean;
  reason?: string;
}

const unstable = (reason: string, rho: number | null = null): DriftResult =>
  ({ status: 'NUMERICALLY_UNSTABLE', grossFactor: null, portfolioReturn: null, weights: null, rho, reason });

/** Validates dimensions/finiteness/budget and returns weights normalised by their net sum. Throws on caller errors. */
function normaliseSigned(w: number[], other: number[], otherName: string): number[] {
  if (!Array.isArray(w) || w.length === 0) throw new RangeError('weights must be a non-empty array');
  if (other.length !== w.length) throw new RangeError(`weights (${w.length}) and ${otherName} (${other.length}) differ in length`);
  if (!w.every(Number.isFinite) || !other.every(Number.isFinite)) throw new RangeError('weights and factors must be finite');
  const s = w.reduce((a, v) => a + v, 0);
  if (!(Math.abs(s - 1) <= BUDGET_TOL)) throw new RangeError(`net weight ${s} is not fully invested (|Σw − 1| > ${BUDGET_TOL})`);
  return w.map((v) => v / s);
}

/**
 * Core classification on supplied gross factors (both paths). `zeroIsExact`
 * selects the test-seam meaning of an exactly zero expansion.
 */
function driftCore(wn: number[], factor: (i: number) => number, zeroIsExact: boolean): DriftResult {
  const his: number[] = new Array(wn.length).fill(0);
  const los: number[] = new Array(wn.length).fill(0);
  const terms: number[] = [];
  const absTerms: number[] = [];
  for (let i = 0; i < wn.length; i++) {
    const wi = wn[i];
    if (wi === 0) continue; // guard 1: skip before evaluating the factor (no 0·∞)
    const aw = Math.abs(wi);
    if (!(aw >= MIN_NORMAL && aw <= MAX_OPERAND)) return unstable(`weight ${i} not a normal operand`);
    const g = factor(i);
    if (!(g >= MIN_NORMAL && g <= MAX_OPERAND)) return unstable(`gross factor ${i} out of normal range (${g})`);
    const [hi, lo] = twoProduct(wi, g);
    if (!Number.isFinite(hi) || !Number.isFinite(lo) || !(Math.abs(hi) >= MIN_PRODUCT)) return unstable(`product ${i} out of range`);
    his[i] = hi; los[i] = lo;
    terms.push(hi, lo);
    absTerms.push(Math.abs(hi), Math.abs(lo));
  }
  const E = expansionOf(terms);
  if (!E) return unstable('non-finite expansion partial');
  const sign = expansionSign(E);
  if (sign === 0) {
    return zeroIsExact
      ? { status: 'INSOLVENT', grossFactor: 0, portfolioReturn: null, weights: null, rho: 0, exactZero: true, reason: 'exact zero in the selected binary64 arithmetic' }
      : unstable('zero gross factor from exp-derived inputs');
  }
  const EC = expansionOf(absTerms);
  const cUp = EC ? expansionUpper(EC) : null;
  if (cUp === null || !Number.isFinite(cUp) || !(cUp >= MIN_NORMAL)) return unstable('C_abs not a finite normal upper bound');
  const absE = sign > 0 ? E : E.map((x) => -x);
  const gDown = expansionLower(absE);
  if (gDown === null || !(gDown >= MIN_NORMAL)) return unstable('|G_p| below the normal range');
  const G = approx(E);
  const rho = Math.abs(G) / cUp;
  // Division-free conservative test: |G|_down ≥ 1e-12 · C_up · (1 + 2^-52).
  if (!(gDown >= RHO_MIN * cUp * (1 + 2 ** -52))) return unstable('cancellation: ρ below threshold', rho);
  if (sign < 0) return { status: 'INSOLVENT', grossFactor: G, portfolioReturn: null, weights: null, rho, reason: 'stable negative gross factor' };
  const Em1 = growExpansion(E, -1);
  if (!Em1) return unstable('non-finite G_p − 1');
  const weights = wn.map((wi, i) => (wi === 0 ? 0 : (his[i] + los[i]) / G));
  if (!weights.every(Number.isFinite)) return unstable('non-finite drifted weight');
  return { status: 'OK', grossFactor: G, portfolioReturn: approx(Em1), weights, rho };
}

/**
 * Drift with SUPPLIED gross factors g_i (test seam). Signed weights allowed;
 * an exactly zero expansion is INSOLVENT, labelled exact in binary64.
 */
export function driftFromGross(w: number[], gross: number[]): DriftResult {
  const wn = normaliseSigned(w, gross, 'gross factors');
  return driftCore(wn, (i) => gross[i], true);
}

/**
 * Production drift from LOG returns: g_i = exp(r_i), evaluated only for
 * non-zero weights. Overflow (∞), underflow (0/subnormal) and a zero gross
 * factor are NUMERICALLY_UNSTABLE, never insolvency. `exp` is injectable for tests.
 */
export function driftGross(w: number[], logReturns: number[], exp: (x: number) => number = Math.exp): DriftResult {
  const wn = normaliseSigned(w, logReturns, 'log returns');
  return driftCore(wn, (i) => exp(logReturns[i]), false);
}

// ───────────────────────── Long-only solver output ─────────────────────────

export type SanitizeResult = { status: 'OK'; weights: number[]; corrected: boolean } | { status: 'INVALID_SOLVER_OUTPUT'; weights: null; reason: string };

/**
 * Validates long-only solver output against 1ᵀw = 1, 0 ≤ w ≤ maxWeight.
 * Material violations (> tol) are rejected. Tiny residues are clipped to the
 * bounds and the budget gap is redistributed over the available slack (upper
 * slack when adding, lower slack when removing) — never by whole-vector
 * renormalisation, which could push a capped asset above maxWeight.
 */
export function sanitizeLongOnly(w: number[], maxWeight: number, tol = 1e-10): SanitizeResult {
  const bad = (reason: string): SanitizeResult => ({ status: 'INVALID_SOLVER_OUTPUT', weights: null, reason });
  if (!w.length || !w.every(Number.isFinite)) return bad('non-finite or empty weights');
  if (!(maxWeight > 0) || !Number.isFinite(maxWeight)) return bad('invalid maxWeight');
  if (w.some((v) => v < -tol)) return bad('material negative weight');
  if (w.some((v) => v > maxWeight + tol)) return bad('material maxWeight violation');
  const s0 = w.reduce((a, v) => a + v, 0);
  if (!(Math.abs(s0 - 1) <= tol)) return bad('material budget violation');
  const x = w.map((v) => Math.min(Math.max(v, 0), maxWeight));
  let corrected = x.some((v, i) => v !== w[i]);
  const gap = 1 - x.reduce((a, v) => a + v, 0);
  if (gap !== 0) {
    const slack = x.map((v) => (gap > 0 ? maxWeight - v : v));
    const total = slack.reduce((a, v) => a + v, 0);
    if (!(total >= Math.abs(gap))) return bad('budget cannot be met within bounds');
    for (let i = 0; i < x.length; i++) x[i] = Math.min(Math.max(x[i] + gap * (slack[i] / total), 0), maxWeight);
    corrected = true;
  }
  const s1 = x.reduce((a, v) => a + v, 0);
  if (x.some((v) => v < 0 || v > maxWeight) || !(Math.abs(s1 - 1) <= 4 * x.length * Number.EPSILON))
    return bad('constraints cannot be met simultaneously after correction');
  return { status: 'OK', weights: x, corrected };
}
