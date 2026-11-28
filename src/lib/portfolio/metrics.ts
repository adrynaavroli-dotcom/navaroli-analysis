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
/** Conservative product floor; exactness is additionally checked against binary64 integers. */
export const MIN_PRODUCT = 2 ** -969;
const SPLITTER = 134217729; // 2^27 + 1 (Veltkamp)
/** Stability threshold on ρ = |G_p| / C_abs. */
export const RHO_MIN = 1e-12;
/** Max |Σw − 1| accepted as a fully invested input before normalisation. */
export const BUDGET_TOL = 1e-9;

// Every finite binary64 is an integer multiple of 2^-1074. These integers
// certify EFT identities and provide exact rounding of expansion quotients;
// they do not replace the Dekker/Shewchuk product and sum construction.
const UNIT = 1n << 1074n;
const bits = new DataView(new ArrayBuffer(8));
function units(x: number): bigint {
  if (!Number.isFinite(x)) throw new RangeError('non-finite binary64');
  bits.setFloat64(0, x);
  const raw = bits.getBigUint64(0);
  const exponent = Number((raw >> 52n) & 2047n);
  const fraction = raw & ((1n << 52n) - 1n);
  const magnitude = exponent === 0 ? fraction : ((1n << 52n) | fraction) << BigInt(exponent - 1);
  return raw >> 63n ? -magnitude : magnitude;
}
const absInt = (x: bigint): bigint => x < 0n ? -x : x;
const sumUnits = (xs: number[]): bigint => xs.reduce((a, x) => a + units(x), 0n);
const normalOrZero = (x: number): boolean => Number.isFinite(x) && (x === 0 || Math.abs(x) >= MIN_NORMAL);

/** Correct rounding of an exact rational: integer division with ties to even.
 * The binade is obtained by exact integer comparison. The quotient contains
 * at most 53 bits (54 only on a binade carry), so conversion and power-of-two
 * scaling are exact. Returns null on overflow; callers reject subnormal or
 * rounded-zero nonzero outputs. No iteration or floating intermediate ratio.
 */
function roundRatio(numerator: bigint, denominator: bigint): number | null {
  if (denominator <= 0n) throw new RangeError('positive denominator required');
  if (numerator === 0n) return 0;
  const negative = numerator < 0n;
  const n = absInt(numerator);
  let exponent = n.toString(2).length - denominator.toString(2).length;
  if (exponent >= 0 ? n < (denominator << BigInt(exponent)) : (n << BigInt(-exponent)) < denominator) exponent--;
  if (exponent > 1023) return null;
  const quantum = Math.max(exponent - 52, -1074);
  const a = quantum < 0 ? n << BigInt(-quantum) : n;
  const b = quantum > 0 ? denominator << BigInt(quantum) : denominator;
  let q = a / b;
  const remainder = a % b;
  if (2n * remainder > b || (2n * remainder === b && (q & 1n) === 1n)) q++;
  const magnitude = Number(q) * 2 ** quantum;
  return Number.isFinite(magnitude) ? (negative ? -magnitude : magnitude) : null;
}

/** Dekker's original subtraction ordering. Throws if any guard or exact
 * binary64 identity fails. The integer certificate proves hi+lo=a*b for
 * EACH accepted call, including zeros in rounded intermediate products.
 * Nonzero subnormal split components/intermediates are conservatively refused.
 */
export function twoProduct(a: number, b: number): [number, number] {
  if (![a, b].every((x) => Number.isFinite(x) && Math.abs(x) >= MIN_NORMAL && Math.abs(x) <= MAX_OPERAND))
    throw new RangeError('TwoProduct operands outside normal bounds');
  const hi = a * b;
  const ca = SPLITTER * a, cb = SPLITTER * b;
  const ta = ca - a, tb = cb - b;
  const ah = ca - ta, al = a - ah, bh = cb - tb, bl = b - bh;
  if (![hi, ca, cb, ta, tb, ah, al, bh, bl].every(normalOrZero) || Math.abs(hi) < MIN_PRODUCT)
    throw new RangeError('TwoProduct split/product outside safe range');
  if (units(ah) + units(al) !== units(a) || units(bh) + units(bl) !== units(b))
    throw new RangeError('inexact operand split');
  const products = [[ah, bh], [al, bh], [ah, bl], [al, bl]];
  const pp = products.map(([x, y]) => {
    const p = x * y;
    if (!normalOrZero(p) || (p === 0 && units(x) * units(y) !== 0n))
      throw new RangeError('TwoProduct intermediate overflow/underflow');
    return p;
  });
  const err1 = hi - pp[0], err2 = err1 - pp[1], err3 = err2 - pp[2];
  const lo = pp[3] - err3;
  if (![err1, err2, err3, lo].every(normalOrZero) ||
      (units(hi) + units(lo)) * UNIT !== units(a) * units(b))
    throw new RangeError('TwoProduct residual not exactly representable');
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
  if (!Number.isFinite(b) || !e.every(Number.isFinite)) return null;
  const out: number[] = [];
  let q = b;
  for (const ei of e) {
    const [s, h] = twoSum(q, ei);
    if (!Number.isFinite(s) || !Number.isFinite(h) || units(s) + units(h) !== units(q) + units(ei)) return null;
    if (h !== 0) out.push(h);
    q = s;
  }
  if (!Number.isFinite(q)) return null;
  if (q !== 0) out.push(q);
  // Grow-expansion preserves non-overlap for valid inputs. Verify its exact
  // value and half-ulp separation rather than trusting a rounded sum/sign.
  if (sumUnits(out) !== sumUnits(e) + units(b)) return null;
  for (let i = 1; i < out.length; i++) {
    const hiBits = absInt(units(out[i])).toString(2).length;
    if ((absInt(units(out[i - 1])) << 54n) > (1n << BigInt(hiBits))) return null;
  }
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
export function expansionSign(e: number[]): -1 | 0 | 1 {
  const exact = sumUnits(e);
  const sign = exact === 0n ? 0 : exact > 0n ? 1 : -1;
  const lastSign = e.length === 0 ? 0 : Math.sign(e[e.length - 1]);
  if (sign !== lastSign) throw new RangeError('invalid expansion sign ordering');
  return sign;
}

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
 * correctly rounded exact integer value and take at most ONE nextUp step.
 * Round-to-nearest lies between the two enclosing floats, so its successor
 * bounds the exact value if and only if the integer remainder is positive.
 * This proof is independent of expansion length and cancellation.
 */
export function expansionUpper(e: number[]): number | null {
  if (!e.every(Number.isFinite)) return null;
  const exact = sumUnits(e);
  const c = roundRatio(exact, UNIT);
  if (c === null) return null;
  const upper = units(c) < exact ? nextUp(c) : c;
  return Number.isFinite(upper) && units(upper) >= exact ? upper : null;
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
  const s = sumUnits(w);
  if (absInt(s - UNIT) > units(BUDGET_TOL)) throw new RangeError(`net weight is not fully invested (|Σw − 1| > ${BUDGET_TOL})`);
  // Keep nonzero unrepresentable operands for driftCore to classify rather
  // than silently rounding them away during budget normalisation.
  return w.map((v) => roundRatio(units(v), s) ?? NaN);
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
    let hi: number, lo: number;
    try { [hi, lo] = twoProduct(wi, g); }
    catch { return unstable(`product ${i} failed exactness/range guards`); }
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
  const exactG = sumUnits(E);
  const G = roundRatio(exactG, UNIT);
  if (G === null || !normalOrZero(G) || G === 0) return unstable('gross factor not finite/normal');
  const diagnostic = roundRatio(absInt(exactG), units(cUp));
  const rho = diagnostic !== null && diagnostic >= MIN_NORMAL ? diagnostic : null;
  // Evaluate the approved inflated threshold exactly, without division or
  // floating product rounding. Also refuse an unrepresentable threshold.
  const threshold = units(RHO_MIN) * units(cUp) * units(1 + 2 ** -52);
  const thresholdFloat = roundRatio(threshold, UNIT * UNIT * UNIT);
  if (thresholdFloat === null || thresholdFloat < MIN_NORMAL) return unstable('threshold outside normal range', rho);
  if (units(gDown) * UNIT * UNIT < threshold) return unstable('cancellation: ρ below threshold', rho);
  if (sign < 0) return { status: 'INSOLVENT', grossFactor: G, portfolioReturn: null, weights: null, rho, reason: 'stable negative gross factor' };
  const Em1 = growExpansion(E, -1);
  if (!Em1) return unstable('non-finite G_p − 1');
  const exactReturn = sumUnits(Em1);
  const portfolioReturn = roundRatio(exactReturn, UNIT);
  if (portfolioReturn === null || !normalOrZero(portfolioReturn) || (portfolioReturn === 0 && exactReturn !== 0n))
    return unstable('portfolio return not representable reliably', rho);
  // Divide the WHOLE product expansion by the WHOLE gross expansion.
  // Integer quotient rounding gives <= 0.5 ulp error for each normal weight
  // (relative error <= 2^-53); no low term is rounded away before division.
  const weights: number[] = [];
  for (let i = 0; i < wn.length; i++) {
    const product = units(his[i]) + units(los[i]);
    const wi = roundRatio(product, exactG);
    if (wi === null || !normalOrZero(wi) || (wi === 0 && product !== 0n)) return unstable('drifted weight not representable reliably', rho);
    weights.push(wi);
  }
  if (absInt(sumUnits(weights) - UNIT) > units(BUDGET_TOL)) return unstable('rounded drifted budget unreliable', rho);
  return { status: 'OK', grossFactor: G, portfolioReturn, weights, rho };
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
  if (!Number.isFinite(tol) || tol < 0 || tol > BUDGET_TOL) return bad('invalid residue tolerance');
  // Exact feasibility check avoids n*maxWeight rounding a deficient cap to 1.
  if (BigInt(w.length) * units(maxWeight) < UNIT) return bad('infeasible cap: n * maxWeight < 1');
  if (w.some((v) => v < -tol)) return bad('material negative weight');
  if (w.some((v) => v > maxWeight + tol)) return bad('material maxWeight violation');
  if (absInt(sumUnits(w) - UNIT) > units(tol)) return bad('material budget violation');
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
