import { describe, it, expect } from 'vitest';
import { cleanPrices, logReturns, historicalVolatility, rollingVolatility, ewmaVolatility, skewness, kurtosis, jarqueBera, stdDev } from '../index';

describe('returns', () => {
  it('computes log returns', () => {
    const r = logReturns({ dates: ['a', 'b', 'c'], prices: [100, 110, 99] });
    expect(r.returns[0]).toBeCloseTo(Math.log(1.1), 12);
    expect(r.returns[1]).toBeCloseTo(Math.log(0.9), 12);
    expect(r.dates).toEqual(['b', 'c']);
  });
  it('cleans and reports', () => {
    const { series, report } = cleanPrices(['2024-01-03', '2024-01-01', '2024-01-02', '2024-01-02', '2024-01-04'], [3, 1, 2, 2.5, null]);
    expect(series.prices).toEqual([1, 2, 3]);
    expect(report.removedMissing).toBe(1);
    expect(report.removedDuplicateDates).toBe(1);
    expect(report.reordered).toBe(true);
  });
});

describe('volatility', () => {
  it('annualizes with sqrt(252)', () => {
    const r = [0.01, -0.01, 0.01, -0.01];
    expect(historicalVolatility(r)).toBeCloseTo(stdDev(r) * Math.sqrt(252), 12);
    expect(stdDev(r)).toBeCloseTo(Math.sqrt(0.0004 / 3), 12);
  });
  it('rolling is trailing-aligned', () => {
    const r = [0.01, 0.02, 0.03, 0.04];
    const res = rollingVolatility(r, ['a', 'b', 'c', 'd'], 3);
    expect(res.values[0]).toBeNull();
    expect(res.values[1]).toBeNull();
    expect(res.values[2]).toBeCloseTo(stdDev([0.01, 0.02, 0.03]) * Math.sqrt(252), 10);
    expect(res.values[3]).toBeCloseTo(stdDev([0.02, 0.03, 0.04]) * Math.sqrt(252), 10);
  });
  it('rolling has no look-ahead', () => {
    const base = [0.01, -0.02, 0.015, 0.005, -0.01];
    const a = rollingVolatility(base, base.map(String), 3).values[3];
    const b = rollingVolatility([...base.slice(0, 4), 0.5], base.map(String), 3).values[3];
    expect(a).toBe(b);
  });
  it('EWMA init and recursion, no look-ahead', () => {
    const r = [0.01, -0.01, 0.02, -0.02, 0.03];
    const res = ewmaVolatility(r, r.map(String), 0.94, 2);
    const v0 = stdDev([0.01, -0.01]) ** 2;
    expect(res.values[0]).toBeNull();
    expect(res.values[1]).toBeCloseTo(Math.sqrt(v0 * 252), 12);
    const v2 = 0.94 * v0 + 0.06 * 0.01 ** 2; // uses r_{t-1} = r[1]
    expect(res.values[2]).toBeCloseTo(Math.sqrt(v2 * 252), 12);
    const changed = ewmaVolatility([0.01, -0.01, 0.9, -0.02, 0.03], r.map(String), 0.94, 2);
    expect(changed.values[2]).toBe(res.values[2]);
  });
});

describe('statistics', () => {
  it('symmetric data has zero skew', () => {
    expect(skewness([-2, -1, 0, 1, 2])).toBeCloseTo(0, 12);
  });
  it('kurtosis by hand', () => {
    // x = [-2,-1,0,1,2]: m2 = 2, m4 = 34/5 = 6.8 → K = 1.7
    expect(kurtosis([-2, -1, 0, 1, 2])).toBeCloseTo(1.7, 12);
  });
  it('Jarque-Bera', () => {
    const jb = jarqueBera([-2, -1, 0, 1, 2]);
    expect(jb.statistic).toBeCloseTo((5 / 6) * (1.3 ** 2 / 4), 12);
    expect(jb.pValue).toBeCloseTo(Math.exp(-jb.statistic / 2), 12);
  });
});
