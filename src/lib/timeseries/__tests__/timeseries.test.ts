import { describe, it, expect } from 'vitest';
import fx from '../../validation/fixtures/sta002-benchmark.json';
import { runSta002, type Sta002Fixture } from '../../validation/suites/sta002';
import { VALIDATION_RESULTS, validationStatusFor } from '../../validation';
import { allMatrixItems } from '../../quant-matrix';
import { acf, adfTest, chiSquareSurvival, ljungBox, mackinnonPValue, normalCdf, TimeSeriesInputError } from '../index';

describe('STA-002 unit', () => {
  it('ACF lag 0 = 1 and hand case', () => expect(acf([1, 2, 3, 4], 1)).toEqual([1, 0.25]));
  it('constant series → null, never NaN', () => { expect(acf([2, 2, 2, 2], 2)).toBeNull(); expect(ljungBox(new Array(30).fill(1))).toBeNull(); });
  it('rejects NaN and short inputs', () => {
    expect(() => acf([1, NaN, 3], 1)).toThrow(TimeSeriesInputError);
    expect(() => ljungBox([1, 2, 3, 4, 5])).toThrow(TimeSeriesInputError);
    expect(() => adfTest([1, 2, 3])).toThrow(TimeSeriesInputError);
    expect(() => adfTest(new Array(40).fill(3))).toThrow(/constant/);
  });
  it('special functions', () => {
    expect(normalCdf(0)).toBe(0.5);
    expect(normalCdf(1.959963984540054)).toBeCloseTo(0.975, 14);
    expect(chiSquareSurvival(0, 5)).toBe(1);
    expect(chiSquareSurvival(4, 2)).toBeCloseTo(Math.exp(-2), 15);
  });
  it('MacKinnon p-value boundaries', () => { expect(mackinnonPValue(3)).toBe(1); expect(mackinnonPValue(-19)).toBe(0); });
});

describe('STA-002 benchmark vs statsmodels', () => {
  const fresh = runSta002(fx as unknown as Sta002Fixture, 'test');
  for (const r of fresh) it(`[${r.validationType}] ${r.testName}`, () => expect(r.passed, `maxAbs=${r.maxAbsError} maxRel=${r.maxRelError}`).toBe(true));
  it('recorded evidence matches a fresh run', () => {
    expect(VALIDATION_RESULTS.filter((r) => r.modelId === 'STA-002').map((r) => [r.testName, r.passed])).toEqual(fresh.map((r) => [r.testName, r.passed]));
  });
  it('validation layer closed and VOL-003 dependency now satisfied', () => {
    expect(validationStatusFor('STA-002')).toBe('COMPLETED');
    const garch = allMatrixItems.find((i) => i.id === 'VOL-003')!;
    expect(garch.dependencies.every((d) => allMatrixItems.find((i) => i.id === d)!.status === 'COMPLETED')).toBe(true);
  });
});
