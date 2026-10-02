import type { CleaningReport, PriceSeries, ReturnSeries } from './types';

/**
 * Clean a raw price series: sort by date, drop missing / non-positive prices
 * and duplicated dates (first occurrence kept). Every removal is counted.
 */
export function cleanPrices(dates: string[], raw: (number | null | undefined)[]): { series: PriceSeries; report: CleaningReport } {
  const report: CleaningReport = {
    received: Math.min(dates.length, raw.length),
    kept: 0, removedMissing: 0, removedNonPositive: 0, removedDuplicateDates: 0, reordered: false,
  };
  const rows: { d: string; p: number }[] = [];
  for (let i = 0; i < report.received; i++) {
    const p = raw[i];
    if (p === null || p === undefined || !Number.isFinite(p)) { report.removedMissing++; continue; }
    if (p <= 0) { report.removedNonPositive++; continue; }
    rows.push({ d: dates[i], p });
  }
  for (let i = 1; i < rows.length; i++) if (rows[i].d < rows[i - 1].d) { report.reordered = true; break; }
  if (report.reordered) rows.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const seen = new Set<string>();
  const out: { d: string; p: number }[] = [];
  for (const r of rows) {
    if (seen.has(r.d)) { report.removedDuplicateDates++; continue; }
    seen.add(r.d); out.push(r);
  }
  report.kept = out.length;
  return { series: { dates: out.map((r) => r.d), prices: out.map((r) => r.p) }, report };
}

/** Log returns r_t = ln(P_t / P_{t-1}). */
export function logReturns(series: PriceSeries): ReturnSeries {
  const dates: string[] = []; const returns: number[] = []; let invalidRemoved = 0;
  for (let i = 1; i < series.prices.length; i++) {
    const r = Math.log(series.prices[i] / series.prices[i - 1]);
    if (!Number.isFinite(r)) { invalidRemoved++; continue; }
    dates.push(series.dates[i]); returns.push(r);
  }
  return { dates, returns, invalidRemoved };
}
