import { describe, it, expect } from 'vitest';
import p4 from '../../validation/fixtures/phase4-benchmark.json';
import fx from '../../validation/fixtures/cor003-benchmark.json';
import { runCor003, type Cor003Fixture } from '../../validation/suites/cor003';
import type { Phase4Fixture } from '../../validation/suites/phase4';
import { VALIDATION_RESULTS } from '../../validation';
import { ewmaCovariance } from '../ewma';

const panel = (vals: number[][]) => ({ dates: vals.map((_, i) => `d${i}`), tickers: ['A', 'B'], values: vals, dropped: {} });

describe('COR-003 EWMA covariance (unit)', () => {
  it('null before seed−1, seed = sample covariance', () => {
    const r = ewmaCovariance(panel([[1, 2], [3, 0], [5, 4]]), 0.5, 2);
    expect(r.cov[0]).toBeNull();
    expect(r.cov[1]).toEqual([[2, -2], [-2, 2]]);
  });
  it('one recursion step matches hand calculation', () => {
    expect(ewmaCovariance(panel([[1, 2], [3, 0], [5, 4]]), 0.5, 2).cov[2]).toEqual([[5.5, -1], [-1, 1]]);
  });
  it('does not mutate previous estimates', () => {
    const r = ewmaCovariance(panel([[1, 2], [3, 0], [5, 4], [1, 1]]), 0.5, 2);
    expect(r.cov[1]).toEqual([[2, -2], [-2, 2]]);
  });
  it('rejects λ outside (0,1)', () => {
    expect(() => ewmaCovariance(panel([[1, 2]]), 1)).toThrow(/λ/);
    expect(() => ewmaCovariance(panel([[1, 2]]), 0)).toThrow(/λ/);
  });
  it('zero-variance asset → correlation null', () => {
    const r = ewmaCovariance(panel([[0.01, 0], [0.02, 0], [0.03, 0]]), 0.9, 2);
    expect(r.corr[2]![0][1]).toBeNull();
  });
});

describe('COR-003 benchmark vs Python', () => {
  const fresh = runCor003(p4 as unknown as Phase4Fixture, fx as unknown as Cor003Fixture, 'test');
  for (const r of fresh) it(`[${r.validationType}] ${r.testName}`, () => expect(r.passed, `maxAbs=${r.maxAbsError}`).toBe(true));
  it('recorded evidence matches a fresh run', () => {
    const rec = VALIDATION_RESULTS.filter((r) => r.modelId === 'COR-003');
    expect(rec.map((r) => [r.testName, r.passed])).toEqual(fresh.map((r) => [r.testName, r.passed]));
  });
});
