import { alignPrices, cleanPrices, logReturns, resamplePrices, simpleReturns, type PriceSeries } from '../../returns';
import { ewmaVolatility, historicalVolatility, jarqueBera, kurtosis, mean, rollingVolatility, skewness, stdDev } from '../../volatility';
import { compareExact, compareNumeric, type CompareMeta } from '../compare';
import type { Tolerance, ValidationResult } from '../types';

/** Bump when any Phase 1 engine code changes; the evidence must then be regenerated. */
export const PHASE1_IMPLEMENTATION_VERSION = 'quant-engine/phase1@1.0.0';

export interface Phase1Fixture {
  meta: { version: string; generatedAt: string; seed: number; python: string; numpy: string; pandas: string; scipy: string };
  input: { dates: string[]; prices: (number | null)[] };
  cleaning: { received: number; removedMissing: number; removedNonPositive: number; removedDuplicateDates: number; kept: number; dates: string[]; prices: number[] };
  returns: { dates: string[]; log: number[]; simple: number[] };
  statistics: { mean: number; std: number; skewness: number; kurtosis: number; jbStatistic: number; jbPValue: number };
  volatility: { historical: number; rolling: Record<string, (number | null)[]>; ewma: (number | null)[] };
  resample: Record<'weekly' | 'monthly', PriceSeries>;
  alignment: { B: PriceSeries; dates: string[]; A: number[]; BAligned: number[] };
}

/** Explicit tolerances per metric family (set close to float64 round-off, not loose). */
export const PHASE1_TOLERANCES = {
  prices: 'exact', returns: { abs: 1e-15, rel: 1e-12 }, moments: { abs: 1e-15, rel: 1e-10 },
  shape: { abs: 1e-12, rel: 1e-9 }, jbP: { abs: 1e-20, rel: 1e-6 },
  vol: { abs: 1e-14, rel: 1e-10 }, rolling: { abs: 1e-12, rel: 1e-9 },
} as const satisfies Record<string, Tolerance | 'exact'>;

/** Runs the Web engine on the fixture input and compares every output with the Python reference. */
export function runPhase1Benchmark(fx: Phase1Fixture, validationDate: string): ValidationResult[] {
  const dataset = `Synthetic Student-t GBM, seed ${fx.meta.seed}, ${fx.cleaning.received} raw rows with injected defects (phase1-benchmark.json, ${fx.meta.version})`;
  const py = `Python ${fx.meta.python} · numpy ${fx.meta.numpy} · pandas ${fx.meta.pandas} · scipy ${fx.meta.scipy}`;
  const m = (modelId: string, testName: string, ref: string): CompareMeta => ({
    modelId, testName, validationType: 'independent-benchmark', reference: `${ref} (${py})`, dataset, validationDate, implementationVersion: PHASE1_IMPLEMENTATION_VERSION,
  });
  const T = PHASE1_TOLERANCES;
  const { series, report } = cleanPrices(fx.input.dates, fx.input.prices);
  const lr = logReturns(series); const r = lr.returns; const jb = jarqueBera(r);
  const c = fx.cleaning, s = fx.statistics;
  const B = 'Cleaning: dropna, >0 filter, stable sort, drop_duplicates(keep=first)';
  return [
    compareExact([report.received, report.kept], [c.received, c.kept], m('DAT-002', 'Observation counts (received, kept)', `pandas — ${B}`)),
    compareExact([report.removedMissing], [c.removedMissing], m('DAT-002', 'Removed missing values', 'pandas DataFrame.dropna')),
    compareExact([report.removedNonPositive], [c.removedNonPositive], m('DAT-002', 'Removed prices ≤ 0', 'pandas boolean filter')),
    compareExact([report.removedDuplicateDates], [c.removedDuplicateDates], m('DAT-002', 'Removed duplicate dates', 'pandas drop_duplicates(keep=first)')),
    compareExact(series.dates, c.dates, m('DAT-002', 'Temporal order of cleaned dates', 'pandas sort_values(kind=mergesort)')),
    compareNumeric(series.prices, c.prices, T.prices, m('DAT-002', 'Cleaned price vector', `pandas — ${B}`)),
    compareExact(lr.dates, fx.returns.dates, m('DAT-003', 'Return dates (first observation dropped)', 'pandas shift(1).dropna')),
    compareNumeric(r, fx.returns.log, T.returns, m('DAT-003', 'Log returns', 'numpy log(P/P.shift(1))')),
    compareNumeric(simpleReturns(series).returns, fx.returns.simple, T.returns, m('DAT-003', 'Simple returns', 'pandas pct_change')),
    compareNumeric(resamplePrices(series, 'weekly').prices, fx.resample.weekly.prices, T.prices, m('DAT-003', 'Weekly resampling (last price, ISO Mon–Sun)', 'pandas resample("W-SUN").last')),
    compareNumeric(resamplePrices(series, 'monthly').prices, fx.resample.monthly.prices, T.prices, m('DAT-003', 'Monthly resampling (last price)', 'pandas resample("ME").last')),
    compareExact(alignPrices({ A: series, B: fx.alignment.B }).dates, fx.alignment.dates, m('DAT-003', 'Multi-asset alignment — common dates', 'pandas concat(join="inner")')),
    compareNumeric(alignPrices({ A: series, B: fx.alignment.B }).values.map((x) => x[1]), fx.alignment.BAligned, T.prices, m('DAT-003', 'Multi-asset alignment — aligned values', 'pandas concat(join="inner")')),
    compareNumeric([mean(r)], [s.mean], T.moments, m('STA-001', 'Mean', 'numpy.mean')),
    compareNumeric([stdDev(r)], [s.std], T.moments, m('STA-001', 'Sample std (n−1)', 'numpy.std(ddof=1)')),
    compareNumeric([skewness(r)], [s.skewness], T.shape, m('STA-001', 'Skewness (moment, biased)', 'scipy.stats.skew(bias=True)')),
    compareNumeric([kurtosis(r)], [s.kurtosis], T.shape, m('STA-001', 'Kurtosis (non-excess, biased)', 'scipy.stats.kurtosis(fisher=False, bias=True)')),
    compareNumeric([jb.statistic], [s.jbStatistic], T.shape, m('STA-001', 'Jarque-Bera statistic', 'scipy.stats.jarque_bera')),
    compareNumeric([jb.pValue], [s.jbPValue], T.jbP, m('STA-001', 'Jarque-Bera p-value', 'scipy.stats.jarque_bera (χ²₂ survival)')),
    compareNumeric([historicalVolatility(r)], [fx.volatility.historical], T.vol, m('VOL-001', 'Full-sample annualized volatility', 'numpy.std(ddof=1)·√252')),
    compareNumeric(rollingVolatility(r, lr.dates, 20).values, fx.volatility.rolling['20'], T.rolling, m('VOL-001', 'Rolling volatility 20D', 'pandas rolling(20).std(ddof=1)·√252')),
    compareNumeric(rollingVolatility(r, lr.dates, 60).values, fx.volatility.rolling['60'], T.rolling, m('VOL-001', 'Rolling volatility 60D', 'pandas rolling(60).std(ddof=1)·√252')),
    compareNumeric(ewmaVolatility(r, lr.dates, 0.94, 20).values, fx.volatility.ewma, T.vol, { ...m('VOL-002', 'EWMA λ=0.94, seed 20', 'numpy recursion loop, cross-checked with pandas ewm(alpha=0.06, adjust=False); refs agree to 8e-17'), notes: 'Seed = sample variance of first 20 returns at index 19' }),
  ];
}
