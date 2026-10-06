import { selectPriceField } from './adjust';
import { cleanPrices, flagAnomalies, type AnomalyOptions } from './clean';
import { resamplePrices } from './resample';
import { computeReturns } from './returns';
import type { CleaningReport, DatasetMetadata, PriceField, PriceSeries, QualityFlag, RawPriceData, ReturnKind, ReturnSeries } from './types';

export interface ReturnsDataset {
  metadata: DatasetMetadata & { priceField: PriceField; firstDate: string | null; lastDate: string | null; observations: number };
  /** Stage 1 — untouched. */
  raw: RawPriceData;
  /** Stage 2+3 — cleaned prices on the selected (adjusted) field. */
  prices: PriceSeries;
  report: CleaningReport;
  /** Stage 4 — returns at the requested frequency. */
  returns: ReturnSeries;
  kind: ReturnKind;
  flags: QualityFlag[];
}

/**
 * Single entry point of the Returns Engine:
 * RAW → select adjusted field → CLEAN → (resample) → RETURNS, with flags.
 * Downstream models (volatility, covariance, VaR…) consume `returns` only.
 */
export function buildReturnsDataset(raw: RawPriceData, metadata: DatasetMetadata, kind: ReturnKind = 'log', anomalies?: AnomalyOptions): ReturnsDataset {
  const sel = selectPriceField(raw.closes, raw.adjcloses);
  const { series, report, flags } = cleanPrices(raw.dates, sel.values);
  const prices = resamplePrices(series, metadata.frequency);
  const returns = computeReturns(prices, kind);
  return {
    metadata: { ...metadata, priceField: sel.field, firstDate: prices.dates[0] ?? null, lastDate: prices.dates.at(-1) ?? null, observations: prices.prices.length },
    raw, prices, report, returns, kind,
    flags: [...sel.flags, ...flags, ...flagAnomalies(prices, anomalies)],
  };
}
