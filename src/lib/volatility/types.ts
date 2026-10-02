/** Annualization convention: trading days per year. */
export const TRADING_DAYS = 252;

export interface PriceSeries {
  dates: string[];
  prices: number[];
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

/** Annualized volatility time series; null where the model is not yet defined. */
export interface VolatilityResult {
  dates: string[];
  values: (number | null)[];
  /** Latest defined annualized volatility (decimal, e.g. 0.25 = 25%). */
  current: number | null;
}

/** Common interface so future models (GARCH, EGARCH...) plug in uniformly. */
export interface VolatilityModel {
  id: string;
  name: string;
  method: string;
  calculate(returns: number[], dates: string[]): VolatilityResult;
}
