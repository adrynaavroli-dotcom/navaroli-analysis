import { computeReturns } from './returns';
import type { AlignedPanel, PriceSeries, ReturnKind } from './types';

/**
 * Multi-asset calendar alignment by INTERSECTION of dates (inner join).
 * No forward-filling: a date enters the panel only if every asset traded.
 * Each input must already be cleaned (sorted, unique, positive).
 */
export function alignPrices(series: Record<string, PriceSeries>): AlignedPanel {
  const tickers = Object.keys(series);
  if (!tickers.length) return { dates: [], tickers: [], values: [], dropped: {} };
  const maps = tickers.map((t) => new Map(series[t].dates.map((d, i) => [d, series[t].prices[i]])));
  const dates = series[tickers[0]].dates.filter((d) => maps.every((m) => m.has(d)));
  const values = dates.map((d) => maps.map((m) => m.get(d)!));
  const dropped = Object.fromEntries(tickers.map((t) => [t, series[t].dates.length - dates.length]));
  return { dates, tickers, values, dropped };
}

/** Returns panel from an aligned price panel: row t = return from dates[t-1] to dates[t]. */
export function panelReturns(panel: AlignedPanel, kind: ReturnKind): AlignedPanel {
  const cols = panel.tickers.map((_, j) => computeReturns({ dates: panel.dates, prices: panel.values.map((r) => r[j]) }, kind).returns);
  const dates = panel.dates.slice(1);
  return { dates, tickers: panel.tickers, values: dates.map((_, t) => cols.map((c) => c[t])), dropped: panel.dropped };
}
