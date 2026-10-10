import { describe, it, expect } from 'vitest';
import fx from '../../validation/fixtures/phase4-benchmark.json';
import { runPhase4, type Phase4Fixture } from '../../validation/suites/phase4';
import { VALIDATION_RESULTS, validationStatusFor } from '../../validation';
import { allMatrixItems } from '../../quant-matrix';
import { alignPrices, panelReturns } from '../../returns';
import { sampleCovariance, covToCorr, rollingCovariance, annualize, pairSeries } from '../index';

const panel = (vals: number[][]) => ({ dates: vals.map((_, i) => `d${i}`), tickers: ['A', 'B'], values: vals, dropped: {} });

describe('COR-001 covariance', () => {
  it('sample covariance with W−1 and symmetry', () => {
    const S = sampleCovariance([[1, 2], [3, 6], [5, 10]])!;
    expect(S[0][0]).toBeCloseTo(4, 14); expect(S[1][1]).toBeCloseTo(16, 14); expect(S[0][1]).toBeCloseTo(8, 14);
    expect(S[0][1]).toBe(S[1][0]);
  });
  it('warm-up is null; first estimate at index W−1', () => {
    const r = rollingCovariance(panel([[1, 1], [2, 3], [3, 2], [4, 5]]), 3);
    expect(r.cov[0]).toBeNull(); expect(r.cov[1]).toBeNull(); expect(r.cov[2]).not.toBeNull();
  });
  it('window uses exactly the trailing W rows', () => {
    const rows = [[9, 9], [1, 2], [2, 1], [3, 3]];
    expect(rollingCovariance(panel(rows), 3).cov[3]).toEqual(sampleCovariance(rows.slice(1)));
  });
  it('annualization ×252', () => expect(annualize([[1]])[0][0]).toBe(252));
  it('unequal histories use only common dates', () => {
    const p = panelReturns(alignPrices({ A: { dates: ['1', '2', '3', '4'], prices: [1, 2, 3, 4] }, B: { dates: ['2', '3', '4'], prices: [5, 6, 7] } }), 'log');
    expect(p.dates).toEqual(['3', '4']);
  });
});

describe('COR-002 correlation', () => {
  it('unit diagonal and ±1 for linear relations', () => {
    const R = covToCorr(sampleCovariance([[1, -2], [2, -4], [4, -8]])!);
    expect(R[0][0]).toBe(1); expect(R[0][1]!).toBeCloseTo(-1, 14);
  });
  it('zero variance → null, never NaN', () => {
    const R = covToCorr(sampleCovariance([[1, 3], [2, 3], [3, 3]])!);
    expect(R[0][1]).toBeNull(); expect(R[1][1]).toBeNull(); expect(R[0][0]).toBe(1);
  });
  it('out-of-bounds values throw instead of being clipped', () => {
    expect(() => covToCorr([[1, 2], [2, 1]])).toThrow(/out of bounds/);
  });
  it('pair series', () => {
    const r = rollingCovariance(panel([[1, 2], [2, 4], [3, 7]]), 2);
    expect(pairSeries(r, 0, 1)[0]).toBeNull(); expect(pairSeries(r, 0, 1)[1]).toBe(1);
  });
});

describe('Phase 4 benchmark vs Python', () => {
  const fresh = runPhase4(fx as unknown as Phase4Fixture, 'test');
  for (const r of fresh) it(`${r.modelId} [${r.validationType}] ${r.testName}`, () => expect(r.passed, `maxAbs=${r.maxAbsError}`).toBe(true));
  it('recorded evidence matches a fresh run', () => {
    const rec = VALIDATION_RESULTS.filter((r) => r.implementationVersion.includes('phase4'));
    expect(rec.map((r) => [r.modelId, r.testName, r.passed])).toEqual(fresh.map((r) => [r.modelId, r.testName, r.passed]));
  });
});

describe('matrix status consistency (regression: DAT-001)', () => {
  // Overall progress = matrix item status; validation layer = recorded evidence. They are different fields.
  const map = { 'NOT STARTED': ['NOT STARTED', 'PLANNED'], 'IN PROGRESS': ['IN PROGRESS', 'VALIDATION'], COMPLETED: ['COMPLETED'], FAILED: ['IN PROGRESS'] } as const;
  it('validation layer in the matrix agrees with evidence for every planned model', () => {
    for (const id of ['DAT-001', 'DAT-002', 'DAT-003', 'STA-001', 'VOL-001', 'VOL-002', 'COR-001', 'COR-002']) {
      const i = allMatrixItems.find((x) => x.id === id)!;
      expect((map[validationStatusFor(id)] as readonly string[]).includes(i.layers.validation), id).toBe(true);
    }
  });
  it('DAT-001 overall status is independent of its validation-layer status', () => {
    const i = allMatrixItems.find((x) => x.id === 'DAT-001')!;
    expect(i.status).toBe('IN PROGRESS'); expect(i.layers.validation).toBe('NOT STARTED');
    expect(validationStatusFor('DAT-001')).toBe('NOT STARTED');
  });
  it('COR-003 stays not started', () => expect(allMatrixItems.find((x) => x.id === 'COR-003')!.status).toBe('NOT STARTED'));
});
