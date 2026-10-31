import { describe, expect, it } from 'vitest';
import { gmvClosedForm, gmvLongOnly } from '../min-variance';

const sum = (w: number[]) => w.reduce((a, v) => a + v, 0);

describe('gmvClosedForm', () => {
  it('matches the hand-computed 2-asset solution', () => {
    // Σ = [[0.04, 0.006], [0.006, 0.01]]; det = 0.000364
    // Σ⁻¹1 = [0.004, 0.034]/det → w = [0.004, 0.034]/0.038, σ² = det/0.038
    const r = gmvClosedForm([[0.04, 0.006], [0.006, 0.01]]);
    expect(r.status).toBe('OK');
    expect(r.weights![0]).toBeCloseTo(0.004 / 0.038, 12);
    expect(r.weights![1]).toBeCloseTo(0.034 / 0.038, 12);
    expect(r.variance!).toBeCloseTo(0.000364 / 0.038, 15);
  });

  it('gives equal weights for σ²I', () => {
    const r = gmvClosedForm([[0.02, 0, 0], [0, 0.02, 0], [0, 0, 0.02]]);
    expect(r.weights!.every((w) => Math.abs(w - 1 / 3) < 1e-14)).toBe(true);
    expect(r.variance!).toBeCloseTo(0.02 / 3, 15);
  });

  it('gives equal weights for equal variances with equal covariances', () => {
    const r = gmvClosedForm([[0.02, 0.005, 0.005], [0.005, 0.02, 0.005], [0.005, 0.005, 0.02]]);
    expect(r.weights!.every((w) => Math.abs(w - 1 / 3) < 1e-12)).toBe(true);
  });

  it('reports SINGULAR for a collinear matrix and returns no weights', () => {
    const r = gmvClosedForm([[1e-4, 1e-4], [1e-4, 1e-4]]);
    expect(r.status).toBe('SINGULAR');
    expect(r.weights).toBeNull();
  });

  it('rejects invalid input', () => {
    expect(gmvClosedForm([[0.01, 0], [0]] as number[][]).status).toBe('INVALID_INPUT');
    expect(gmvClosedForm([[0.01, NaN], [NaN, 0.01]]).status).toBe('INVALID_INPUT');
    expect(gmvClosedForm([[0.01]]).status).toBe('INVALID_INPUT');
  });

  it('reports a condition number close to the exact eigenvalue ratio', () => {
    const r = gmvClosedForm([[1, 0], [0, 100]]);
    expect(r.conditionNumber!).toBeGreaterThan(99);
    expect(r.conditionNumber!).toBeLessThan(101);
  });
});

describe('gmvLongOnly', () => {
  it('sets a shorted asset to zero (closed form would give w = [−0.3, 1.3])', () => {
    const r = gmvLongOnly([[0.04, 0.019], [0.019, 0.01]]);
    expect(r.status).toBe('OK');
    expect(r.weights![0]).toBeCloseTo(0, 10);
    expect(r.weights![1]).toBeCloseTo(1, 10);
    expect(r.variance!).toBeCloseTo(0.01, 12);
  });

  it('enforces the per-asset cap (diag([0.01, 0.01, 0.09]), w_max = 0.4 → [0.4, 0.4, 0.2])', () => {
    // Closed form would be [0.474, 0.474, 0.053]; the cap binds on the two low-variance assets.
    const S = [[0.01, 0, 0], [0, 0.01, 0], [0, 0, 0.09]];
    const r = gmvLongOnly(S, 0.4);
    expect(r.status).toBe('OK');
    expect(r.weights![0]).toBeCloseTo(0.4, 10);
    expect(r.weights![1]).toBeCloseTo(0.4, 10);
    expect(r.weights![2]).toBeCloseTo(0.2, 10);
  });

  it('reports INFEASIBLE when w_max < 1/N', () => {
    const S = [[0.01, 0, 0, 0], [0, 0.01, 0, 0], [0, 0, 0.01, 0], [0, 0, 0, 0.01]];
    expect(gmvLongOnly(S, 0.2).status).toBe('INFEASIBLE');
  });

  it('reduces to the closed form when no bound binds', () => {
    const S = [[0.04, 0.006, 0.002], [0.006, 0.01, 0.001], [0.002, 0.001, 0.03]];
    const cf = gmvClosedForm(S);
    const lo = gmvLongOnly(S, 1);
    expect(lo.status).toBe('OK');
    if (cf.weights!.every((w) => w > 0)) {
      lo.weights!.forEach((w, i) => expect(w).toBeCloseTo(cf.weights![i], 10));
    }
  });

  it('satisfies the budget and KKT conditions on correlated cases', () => {
    const cases = [
      [[0.04, 0.006, 0.002], [0.006, 0.01, 0.001], [0.002, 0.001, 0.03]],
      [[0.05, 0.04, 0.001], [0.04, 0.05, 0.001], [0.001, 0.001, 0.02]],
      [[0.09, -0.02, 0.01], [-0.02, 0.04, 0.005], [0.01, 0.005, 0.01]],
    ];
    for (const S of cases) {
      const r = gmvLongOnly(S, 0.8);
      expect(r.status).toBe('OK');
      expect(Math.abs(sum(r.weights!) - 1)).toBeLessThanOrEqual(1e-12);
      expect(r.weights!.every((w) => w >= -1e-12 && w <= 0.8 + 1e-12)).toBe(true);
      expect(r.kktResidual!).toBeLessThanOrEqual(1e-10);
    }
  });

  it('is deterministic (bit-identical on repeated runs)', () => {
    const S = [[0.04, 0.006, 0.002], [0.006, 0.01, 0.001], [0.002, 0.001, 0.03]];
    const a = gmvLongOnly(S, 0.6);
    const b = gmvLongOnly(S, 0.6);
    expect(a.weights).toEqual(b.weights);
    expect(a.iterations).toBe(b.iterations);
  });

  it('reports SINGULAR for a collinear matrix', () => {
    expect(gmvLongOnly([[1e-4, 1e-4], [1e-4, 1e-4]]).status).toBe('SINGULAR');
  });
});
