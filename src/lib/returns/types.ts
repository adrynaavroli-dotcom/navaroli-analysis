/**
 * Returns Engine — data contracts.
 *
 * Pipeline stages are kept separate and each has its own type:
 *   RAW MARKET DATA → CLEANED DATA → ADJUSTED PRICES → RETURNS → DERIVED METRICS → MODEL OUTPUTS
 * Specification: docs/quant/returns-engine.md
 */

/** Free/public sources only. */
export type MarketDataSource = 'Yahoo Finance' | 'FRED' | 'CSV' | 'Excel';
export type Frequency = 'daily' | 'weekly' | 'monthly';
/** close = split-adjusted close; adjclose = split + dividend adjusted (total-return proxy). */
export type PriceField = 'close' | 'adjclose';
export type ReturnKind = 'log' | 'simple';

export interface DatasetMetadata {
  source: MarketDataSource;
  ticker: string;
  currency: string | null;
  frequency: Frequency;
  /** Requested history window, e.g. '2y'. */
  history: string;
  updateMethod: string;
  /** ISO timestamp of retrieval. */
  retrievedAt: string;
}

/** Stage 1 — raw, untouched values as delivered by the source. */
export interface RawPriceData {
  dates: string[];
  closes: (number | null | undefined)[];
  adjcloses?: (number | null | undefined)[];
}

/** A clean, strictly increasing, positive price series (ISO YYYY-MM-DD dates). */
export interface PriceSeries {
  dates: string[];
  prices: number[];
}

export type QualityFlagCode =
  | 'MISSING' | 'NON_POSITIVE' | 'DUPLICATE_DATE' | 'OUT_OF_ORDER'
  | 'LARGE_MOVE' | 'CALENDAR_GAP' | 'STALE_PRICE' | 'UNADJUSTED_DIVIDENDS';

/** Flags never alter data; removals are reported separately in CleaningReport. */
export interface QualityFlag {
  code: QualityFlagCode;
  date?: string;
  detail: string;
}

export interface CleaningReport {
  received: number;
  kept: number;
  removedMissing: number;
  removedNonPositive: number;
  removedDuplicateDates: number;
  reordered: boolean;
}

export interface ReturnSeries {
  /** dates[i] is the date of the closing price that ends return i. */
  dates: string[];
  returns: number[];
  invalidRemoved: number;
}

/** T×N aligned panel (rows = common dates, columns = tickers). */
export interface AlignedPanel {
  dates: string[];
  tickers: string[];
  /** values[t][j] = price (or return) of tickers[j] at dates[t]. */
  values: number[][];
  /** Observations dropped per ticker because the date was not common to all. */
  dropped: Record<string, number>;
}
