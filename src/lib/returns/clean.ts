import type { CleaningReport, PriceSeries, QualityFlag } from './types';

/**
 * Stage RAW → CLEANED. Sort by date (stable), drop missing / non-finite /
 * non-positive prices and duplicated dates (first occurrence in the source
 * kept). Every removal is counted; nothing is interpolated or filled.
 */
export function cleanPrices(dates: string[], raw: (number | null | undefined)[]): { series: PriceSeries; report: CleaningReport; flags: QualityFlag[] } {
  const flags: QualityFlag[] = [];
  const report: CleaningReport = {
    received: Math.min(dates.length, raw.length),
    kept: 0, removedMissing: 0, removedNonPositive: 0, removedDuplicateDates: 0, reordered: false,
  };
  const rows: { d: string; p: number }[] = [];
  for (let i = 0; i < report.received; i++) {
    const p = raw[i];
    if (p === null || p === undefined || !Number.isFinite(p)) { report.removedMissing++; flags.push({ code: 'MISSING', date: dates[i], detail: 'Missing or non-finite price removed' }); continue; }
    if (p <= 0) { report.removedNonPositive++; flags.push({ code: 'NON_POSITIVE', date: dates[i], detail: `Non-positive price ${p} removed` }); continue; }
    rows.push({ d: dates[i], p });
  }
  for (let i = 1; i < rows.length; i++) if (rows[i].d < rows[i - 1].d) { report.reordered = true; break; }
  if (report.reordered) {
    flags.push({ code: 'OUT_OF_ORDER', detail: 'Source rows were not chronological; sorted (stable)' });
    rows.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  }
  const seen = new Set<string>();
  const out: { d: string; p: number }[] = [];
  for (const r of rows) {
    if (seen.has(r.d)) { report.removedDuplicateDates++; flags.push({ code: 'DUPLICATE_DATE', date: r.d, detail: 'Duplicate date removed (first occurrence kept)' }); continue; }
    seen.add(r.d); out.push(r);
  }
  report.kept = out.length;
  return { series: { dates: out.map((r) => r.d), prices: out.map((r) => r.p) }, report, flags };
}

export interface AnomalyOptions {
  /** |ln(P_t/P_{t-1})| above this is flagged (default 0.25 ≈ ±28%). */
  largeMove?: number;
  /** Calendar-day gap between consecutive observations above this is flagged (default 5). */
  gapDays?: number;
  /** Run of identical consecutive prices of this length or more is flagged (default 5). */
  staleRun?: number;
}

const dayDiff = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/** Non-destructive diagnostics on a cleaned series. Flags only — data unchanged. */
export function flagAnomalies(s: PriceSeries, o: AnomalyOptions = {}): QualityFlag[] {
  const { largeMove = 0.25, gapDays = 5, staleRun = 5 } = o;
  const flags: QualityFlag[] = [];
  let run = 1;
  for (let i = 1; i < s.prices.length; i++) {
    const r = Math.log(s.prices[i] / s.prices[i - 1]);
    if (Math.abs(r) > largeMove) flags.push({ code: 'LARGE_MOVE', date: s.dates[i], detail: `Log move ${(r * 100).toFixed(1)}% — check corporate actions` });
    const g = dayDiff(s.dates[i - 1], s.dates[i]);
    if (g > gapDays) flags.push({ code: 'CALENDAR_GAP', date: s.dates[i], detail: `${g} calendar days since previous observation` });
    run = s.prices[i] === s.prices[i - 1] ? run + 1 : 1;
    if (run === staleRun) flags.push({ code: 'STALE_PRICE', date: s.dates[i], detail: `${staleRun} identical consecutive prices` });
  }
  return flags;
}
