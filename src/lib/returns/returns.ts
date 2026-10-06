import type { PriceSeries, ReturnKind, ReturnSeries } from './types';

function transform(series: PriceSeries, f: (p1: number, p0: number) => number): ReturnSeries {
  const dates: string[] = []; const returns: number[] = []; let invalidRemoved = 0;
  for (let i = 1; i < series.prices.length; i++) {
    const r = f(series.prices[i], series.prices[i - 1]);
    if (!Number.isFinite(r)) { invalidRemoved++; continue; }
    dates.push(series.dates[i]); returns.push(r);
  }
  return { dates, returns, invalidRemoved };
}

/** Log returns r_t = ln(P_t / P_{t-1}). Time-additive. */
export const logReturns = (s: PriceSeries) => transform(s, (p1, p0) => Math.log(p1 / p0));
/** Simple returns R_t = P_t / P_{t-1} − 1. Cross-sectionally additive (portfolio). */
export const simpleReturns = (s: PriceSeries) => transform(s, (p1, p0) => p1 / p0 - 1);
export const computeReturns = (s: PriceSeries, kind: ReturnKind) => (kind === 'log' ? logReturns(s) : simpleReturns(s));

/** R = e^r − 1 */
export const logToSimple = (r: number) => Math.expm1(r);
/** r = ln(1 + R) */
export const simpleToLog = (R: number) => Math.log1p(R);
