import { describe, it, expect } from 'vitest';
import fx from '../fixtures/phase1-benchmark.json';
import { cleanPrices, logReturns, simpleReturns, resamplePrices, alignPrices } from '../../returns';
import { mean, stdDev, skewness, kurtosis, jarqueBera, historicalVolatility, rollingVolatility, ewmaVolatility } from '../../volatility';

/** Independent benchmark vs Python (numpy/pandas/scipy). Tolerance: |a−b| ≤ abs + rel·|b|. */
const close = (a: number | null, b: number | null, abs = 1e-12, rel = 1e-9) =>
  a === null || b === null ? a === b : Math.abs(a - b) <= abs + rel * Math.abs(b);
const all = (a: (number | null)[], b: (number | null)[], abs?: number, rel?: number) =>
  a.length === b.length && a.every((v, i) => close(v, b[i], abs, rel));

const { series, report } = cleanPrices(fx.input.dates, fx.input.prices);
const lr = logReturns(series);

describe('Phase 1 independent benchmark (Python reference)', () => {
  it('cleaning matches pandas', () => {
    expect(report.removedMissing).toBe(fx.cleaning.removedMissing);
    expect(report.removedNonPositive).toBe(fx.cleaning.removedNonPositive);
    expect(report.removedDuplicateDates).toBe(fx.cleaning.removedDuplicateDates);
    expect(series.dates).toEqual(fx.cleaning.dates);
    expect(all(series.prices, fx.cleaning.prices, 0, 0)).toBe(true);
  });
  it('log and simple returns match', () => {
    expect(all(lr.returns, fx.returns.log, 1e-15, 1e-12)).toBe(true);
    expect(all(simpleReturns(series).returns, fx.returns.simple, 1e-15, 1e-12)).toBe(true);
  });
  it('descriptive statistics match scipy', () => {
    const r = lr.returns, s = fx.statistics, jb = jarqueBera(r);
    expect(close(mean(r), s.mean, 1e-15, 1e-10)).toBe(true);
    expect(close(stdDev(r), s.std, 1e-15, 1e-10)).toBe(true);
    expect(close(skewness(r), s.skewness, 1e-12, 1e-8)).toBe(true);
    expect(close(kurtosis(r), s.kurtosis, 1e-12, 1e-10)).toBe(true);
    expect(close(jb.statistic, s.jbStatistic, 1e-10, 1e-9)).toBe(true);
    expect(close(jb.pValue, s.jbPValue, 1e-20, 1e-6)).toBe(true);
  });
  it('historical & rolling volatility match pandas', () => {
    expect(close(historicalVolatility(lr.returns), fx.volatility.historical, 1e-14, 1e-10)).toBe(true);
    for (const w of [20, 60]) expect(all(rollingVolatility(lr.returns, lr.dates, w).values, fx.volatility.rolling[String(w) as '20' | '60'], 1e-12, 1e-9)).toBe(true);
  });
  it('EWMA matches numpy loop and pandas ewm', () => {
    expect(all(ewmaVolatility(lr.returns, lr.dates, 0.94, 20).values, fx.volatility.ewma, 1e-14, 1e-10)).toBe(true);
  });
  it('resampling and alignment match pandas', () => {
    expect(resamplePrices(series, 'weekly').prices).toEqual(fx.resample.weekly.prices);
    expect(resamplePrices(series, 'monthly').prices).toEqual(fx.resample.monthly.prices);
    const p = alignPrices({ A: series, B: fx.alignment.B });
    expect(p.dates).toEqual(fx.alignment.dates);
    expect(p.values.map((r) => r[1])).toEqual(fx.alignment.BAligned);
  });
});
