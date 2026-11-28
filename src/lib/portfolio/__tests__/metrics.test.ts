import { describe, expect, it } from 'vitest';
import { annualizedVol, driftGross, driftFromGross, effectiveN, equalWeights, hhi, portfolioVariance, turnover,
  twoProduct, expansionOf, expansionSign, expansionUpper, expansionLower, nextUp, nextDown,
  MIN_NORMAL, MIN_PRODUCT, MAX_OPERAND, sanitizeLongOnly } from '../metrics';

// Independent Fraction-style oracle: decompose via EXACT power-of-two
// scaling, not the production bit decoder, expansion or rounding routine.
type Fraction = { n: bigint; d: bigint };
function fraction(x: number): Fraction {
  if (!Number.isFinite(x)) throw new RangeError('finite oracle input required');
  if (x === 0) return { n: 0n, d: 1n };
  const sign = x < 0 ? -1n : 1n;
  let y = Math.abs(x), exponent = 0;
  while (y >= 2) { y /= 2; exponent++; }
  while (y < 1) { y *= 2; exponent--; }
  const n = sign * BigInt(y * 2 ** 52);
  const shift = exponent - 52;
  return shift >= 0 ? { n: n << BigInt(shift), d: 1n } : { n, d: 1n << BigInt(-shift) };
}
const add = (a: Fraction, b: Fraction): Fraction => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const mul = (a: Fraction, b: Fraction): Fraction => ({ n: a.n * b.n, d: a.d * b.d });
const compare = (a: Fraction, b: Fraction): number => {
  const delta = a.n * b.d - b.n * a.d;
  return delta === 0n ? 0 : delta > 0n ? 1 : -1;
};
const sum = (xs: number[]): Fraction => xs.map(fraction).reduce(add, fraction(0));
function expansion(terms: number[]): number[] {
  const result = expansionOf(terms);
  if (result === null) throw new Error('unexpected expansion failure');
  return result;
}

describe('portfolio metrics', () => {
  const S = [[0.04, 0.006], [0.006, 0.01]];

  it('portfolioVariance matches the hand computation', () => {
    // w = [0.5, 0.5]: 0.25·0.04 + 2·0.25·0.006 + 0.25·0.01 = 0.0155
    expect(portfolioVariance([0.5, 0.5], S)).toBeCloseTo(0.0155, 15);
  });

  it('annualizedVol uses √252', () => {
    expect(annualizedVol([1, 0], S)).toBeCloseTo(Math.sqrt(0.04 * 252), 12);
  });

  it('hhi and effectiveN: equal weights → 1/N and N; single asset → 1 and 1', () => {
    expect(hhi([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.25, 15);
    expect(effectiveN([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(4, 12);
    expect(hhi([1, 0, 0])).toBe(1);
    expect(effectiveN([1, 0, 0])).toBe(1);
  });

  it('turnover is one-way: ½·Σ|Δw| (buys = sells)', () => {
    expect(turnover([0.5, 0.5], [0.7, 0.3])).toBeCloseTo(0.2, 15);
    expect(turnover([1, 0, 0], [0, 0, 1])).toBeCloseTo(1, 15);
    expect(turnover([0.5, 0.5], [0.5, 0.5])).toBe(0);
  });

  it('driftWeights: hand case and weights still sum to 1', () => {
    // w=[0.5,0.5], r=[0.1,−0.1] → r_p=0, w'=[0.55,0.45]
    const d = driftGross([0.5, 0.5], [Math.log(1.1), Math.log(0.9)]);
    expect(d.portfolioReturn).toBeCloseTo(0, 15);
    if (d.weights === null) throw new Error(d.reason);
    expect(d.weights[0]).toBeCloseTo(0.55, 15);
    const e = driftGross([0.2, 0.3, 0.5], [0.05, -0.02, 0.01]);
    if (e.weights === null) throw new Error(e.reason);
    expect(e.weights.reduce((a, v) => a + v, 0)).toBeCloseTo(1, 15);
    expect(driftGross([1], [-800]).status).toBe('NUMERICALLY_UNSTABLE');
  });

  it('equalWeights sums to 1', () => {
    const w = equalWeights(5);
    expect(w).toHaveLength(5);
    expect(w.reduce((a, v) => a + v, 0)).toBeCloseTo(1, 15);
  });
});

describe('certified TwoProduct and exact expansions', () => {
  it('matches independent exact rational products on deterministic normal and boundary operands', () => {
    const vectors: [number, number][] = [
      [1, 1], [0.7, 1.5], [-0.7, 1.5], [1 + 2 ** -52, 1 - 2 ** -53],
      [MIN_PRODUCT, 1], [MAX_OPERAND, 2 ** -996],
      [MIN_NORMAL, 2 ** 100], [2 ** 500, 2 ** 400],
    ];
    let seed = 12345;
    for (let i = 0; i < 128; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const a = (1 + seed / 2 ** 32) * 2 ** ((i % 21) - 10);
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const b = (1 + seed / 2 ** 32) * 2 ** ((i % 17) - 8);
      vectors.push([i % 2 ? -a : a, b]);
    }
    let nonzeroResiduals = 0;
    for (const [a, b] of vectors) {
      const [hi, lo] = twoProduct(a, b);
      expect(compare(add(fraction(hi), fraction(lo)), mul(fraction(a), fraction(b)))).toBe(0);
      if (lo !== 0) nonzeroResiduals++;
    }
    expect(nonzeroResiduals).toBeGreaterThan(100);
  });

  it.each([
    [0, 1], [Number.MIN_VALUE, 2 ** 996], [Infinity, 1], [NaN, 1],
    [nextUp(MAX_OPERAND), 1], [1, Number.MIN_VALUE],
    [MAX_OPERAND, MAX_OPERAND], [MIN_NORMAL, 1],
    [nextDown(MIN_PRODUCT), 1],
    // Normal operands, safe hi, but nonzero subnormal split component.
    [nextUp(MIN_NORMAL), 2 ** 100],
  ])('refuses uncertified operand/intermediate/product pair %s × %s', (a, b) => {
    expect(() => twoProduct(a, b)).toThrow(RangeError);
  });

  it('retains every high/low contribution and gets exact cancellation sign', () => {
    const pairs = [[0.7, 1.5], [-0.7, 1.5], [1 + 2 ** -52, 1 + 2 ** -52]];
    const terms = pairs.flatMap(([a, b]) => twoProduct(a, b));
    const e = expansion(terms);
    const expected = pairs.reduce((a, [x, y]) => add(a, mul(fraction(x), fraction(y))), fraction(0));
    expect(compare(sum(e), expected)).toBe(0);
    expect(expansionSign(e)).toBe(1);
    expect(expansionSign(expansion([1, 2 ** -100, -1]))).toBe(1);
    expect(expansionSign(expansion([1, -(2 ** -100), -1]))).toBe(-1);
    expect(expansionSign(expansion([1, -1]))).toBe(0);
    // Residual at 2^-104 survives even when nearest product rounds to hi.
    expect(compare(sum(expansion(twoProduct(1 + 2 ** -52, 1 + 2 ** -52))),
      mul(fraction(1 + 2 ** -52), fraction(1 + 2 ** -52)))).toBe(0);
  });

  it('directed bounds enclose exact sums and are the tight enclosing floats', () => {
    const termSets = [[1, 2 ** -54], [-1, -(2 ** -54)], [1, 2 ** -53],
      [nextUp(1), 2 ** -53], [1, -1, Number.MIN_VALUE],
      Array.from({ length: 512 }, (_, i) => i % 2 ? 2 ** -100 : 2 ** -60)];
    for (const terms of termSets) {
      const e = expansion(terms), exact = sum(terms);
      const upper = expansionUpper(e), lower = expansionLower(e);
      if (upper === null || lower === null) throw new Error('missing directed bound');
      expect(compare(fraction(upper), exact)).toBeGreaterThanOrEqual(0);
      expect(compare(fraction(lower), exact)).toBeLessThanOrEqual(0);
      expect(compare(fraction(nextDown(upper)), exact)).toBeLessThan(0);
      expect(compare(fraction(nextUp(lower)), exact)).toBeGreaterThan(0);
    }
    expect(expansionUpper(expansion([1, 2 ** -54]))).toBe(nextUp(1));
    expect(expansionLower(expansion([1, 2 ** -54]))).toBe(1);
  });

  it('C_abs includes absolute low residues and is never below the exact magnitude', () => {
    const products = [[0.7, 1.5], [-0.3, 1.1]].flatMap(([a, b]) => twoProduct(a, b));
    const absolute = products.map(Math.abs);
    const cUp = expansionUpper(expansion(absolute));
    if (cUp === null) throw new Error('missing C_abs');
    expect(compare(fraction(cUp), sum(absolute))).toBeGreaterThanOrEqual(0);
    expect(compare(sum(absolute), { ...sum(products), n: sum(products).n < 0n ? -sum(products).n : sum(products).n })).toBeGreaterThanOrEqual(0);
  });

  it('refuses nonfinite expansion partials and bounds beyond finite range', () => {
    expect(expansionOf([Infinity])).toBeNull();
    expect(expansionOf([Number.MAX_VALUE, Number.MAX_VALUE])).toBeNull();
    expect(expansionUpper([Number.MAX_VALUE, 2 ** 970])).toBeNull();
    expect(() => expansionSign([1, -(2 ** -100)])).toThrow(RangeError);
  });
});

describe('gross-factor classification and correctly rounded drift', () => {
  it.each([
    [[0.500000000000005, 1], 'NUMERICALLY_UNSTABLE'],
    [[0.499999999999995, 1], 'NUMERICALLY_UNSTABLE'],
    [[0.7, 1.5], 'INSOLVENT'],
    [[0.75, 1.5], 'INSOLVENT'],
  ] as const)('classifies the agreed signed vector %s as %s', (gross, expected) => {
    const result = driftFromGross([2, -1], [...gross]);
    expect(result.status).toBe(expected);
    const exact = add(mul(fraction(2), fraction(gross[0])), fraction(-gross[1]));
    if (gross[0] === 0.75) {
      expect(exact.n).toBe(0n);
      expect(result.exactZero).toBe(true);
      expect(result.grossFactor).toBe(0);
    } else expect(result.exactZero).not.toBe(true);
    if (gross[0] === 0.7) expect(result.grossFactor).toBe(-0.10000000000000009);
  });

  it('production exact cancellation remains unstable, not exact-zero insolvency', () => {
    const result = driftGross([2, -1], [0, 1], (x) => x === 0 ? 0.75 : 1.5);
    expect(result.status).toBe('NUMERICALLY_UNSTABLE');
    expect(result.exactZero).not.toBe(true);
  });

  it('skips only an exactly zero weight before exp overflow', () => {
    const calls: number[] = [];
    const result = driftGross([1, 0], [0, 710], (x) => { calls.push(x); return Math.exp(x); });
    expect(calls).toEqual([0]);
    expect(result.status).toBe('OK');
    expect(result.weights).toEqual([1, 0]);
    expect(result.portfolioReturn).toBe(0);
  });

  it('rejects nonzero subnormal weights even paired with a large factor', () => {
    expect(driftGross([1, Number.MIN_VALUE], [0, 690]).status).toBe('NUMERICALLY_UNSTABLE');
  });

  it.each([-740, -800, 710])('rejects exp subnormal/underflow/overflow at %s', (r) => {
    expect(driftGross([0.5, 0.5], [0, r]).status).toBe('NUMERICALLY_UNSTABLE');
  });

  it('rejects subnormal supplied factors and cap violations', () => {
    expect(driftFromGross([0.5, 0.5], [1, Number.MIN_VALUE]).status).toBe('NUMERICALLY_UNSTABLE');
    expect(driftFromGross([1], [nextUp(MAX_OPERAND)]).status).toBe('NUMERICALLY_UNSTABLE');
  });

  it('uses conservative bounds rather than diagnostic rho at the threshold', () => {
    // rho rounds to the threshold but inflated directed comparison rejects it.
    const result = driftFromGross([1, 1, -1], [2e-12, 1, 1]);
    expect(result.rho).toBe(1e-12);
    expect(result.status).toBe('NUMERICALLY_UNSTABLE');
  });

  it('does not report a diagnostic ratio that underflows to zero', () => {
    const result = driftFromGross([1, 1, -1], [MIN_PRODUCT, MAX_OPERAND, MAX_OPERAND]);
    expect(result.status).toBe('NUMERICALLY_UNSTABLE');
    expect(result.rho).toBeNull();
  });

  it('refuses a subnormal derived weight despite normal accepted products', () => {
    expect(driftFromGross([0.5, 0.5], [2 ** -900, 2 ** 900]).status).toBe('NUMERICALLY_UNSTABLE');
  });

  it('rounds each entire product quotient to nearest, retaining low residues', () => {
    let oldFormulaDifferences = 0;
    for (let i = 1; i <= 40; i++) {
      const g = [1 + i * 2 ** -52, 1 + (41 - i) * 2 ** -52];
      const result = driftFromGross([0.25, 0.75], g);
      expect(result.status).toBe('OK');
      if (result.weights === null || result.grossFactor === null) throw new Error(result.reason);
      const p = [mul(fraction(0.25), fraction(g[0])), mul(fraction(0.75), fraction(g[1]))];
      const total = add(p[0], p[1]);
      for (let j = 0; j < 2; j++) {
        const exact = { n: p[j].n * total.d, d: p[j].d * total.n };
        const actual = fraction(result.weights[j]);
        // Exact quotient must lie between the adjacent midpoints: <=0.5 ulp.
        const lowerMid = mul(add(fraction(nextDown(result.weights[j])), actual), fraction(0.5));
        const upperMid = mul(add(fraction(nextUp(result.weights[j])), actual), fraction(0.5));
        expect(compare(exact, lowerMid)).toBeGreaterThanOrEqual(0);
        expect(compare(exact, upperMid)).toBeLessThanOrEqual(0);
        const [hi, lo] = twoProduct(j ? 0.75 : 0.25, g[j]);
        if ((hi + lo) / result.grossFactor !== result.weights[j]) oldFormulaDifferences++;
      }
    }
    expect(oldFormulaDifferences).toBeGreaterThan(0);
  });

  it('validates caller dimensions, finiteness and exact net budget', () => {
    expect(() => driftGross([], [])).toThrow(RangeError);
    expect(() => driftGross([1], [0, 0])).toThrow(RangeError);
    expect(() => driftGross([NaN], [0])).toThrow(RangeError);
    expect(() => driftFromGross([1], [Infinity])).toThrow(RangeError);
    expect(() => driftGross([0.5], [0])).toThrow(RangeError);
  });
});

describe('long-only caller sanitation', () => {
  it('preserves a feasible binding cap without changing valid weights', () => {
    expect(sanitizeLongOnly([0.5, 0.5], 0.5)).toEqual({ status: 'OK', weights: [0.5, 0.5], corrected: false });
  });
  it('removes a tiny negative residue while keeping binding caps intact', () => {
    const result = sanitizeLongOnly([0.5, 0.50000000000001, -1e-14], 0.5);
    expect(result.status).toBe('OK');
    if (result.weights === null) throw new Error(result.reason);
    expect(result.corrected).toBe(true);
    expect(result.weights.every((w) => w >= 0 && w <= 0.5)).toBe(true);
    expect(result.weights.reduce((a, x) => a + x, 0)).toBe(1);
    expect(result.weights).toEqual([0.5, 0.5, 0]);
  });
  it('adds a small budget deficit only into actual cap slack', () => {
    const result = sanitizeLongOnly([0.5, 0.25, 0.25 - 1e-12], 0.5);
    expect(result.status).toBe('OK');
    if (result.weights === null) throw new Error(result.reason);
    expect(result.weights[0]).toBe(0.5);
    expect(result.weights.every((w) => w >= 0 && w <= 0.5)).toBe(true);
    expect(Math.abs(result.weights.reduce((a, x) => a + x, 0) - 1)).toBeLessThanOrEqual(12 * Number.EPSILON);
  });
  it.each([
    [[0.5, 0.5], 0.49], [[0.5, 0.5], nextDown(0.5)],
    [[0.7, 0.3], 0.5], [[1.001, -0.001], 1], [[0.4, 0.4], 1],
    [[NaN, 1], 1], [[], 1], [[1], Infinity],
  ] as [number[], number][])('rejects infeasible caps or material invalid output %s cap=%s', (w, cap) => {
    expect(sanitizeLongOnly(w, cap).status).toBe('INVALID_SOLVER_OUTPUT');
  });
  it('rejects invalid or overly permissive residue tolerance', () => {
    expect(sanitizeLongOnly([1], 1, NaN).status).toBe('INVALID_SOLVER_OUTPUT');
    expect(sanitizeLongOnly([1], 1, 0.1).status).toBe('INVALID_SOLVER_OUTPUT');
  });
});
