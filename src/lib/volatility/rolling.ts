import { TRADING_DAYS, type VolatilityResult } from './types';

/**
 * Trailing rolling volatility: σ_t = √252 · std(r_{t-n+1} … r_t).
 * Uses only data up to and including t (no look-ahead). null until n obs exist.
 */
export function rollingVolatility(returns: number[], dates: string[], window: number, tradingDays = TRADING_DAYS): VolatilityResult {
  const values: (number | null)[] = new Array(returns.length).fill(null);
  if (window >= 2) {
    let sum = 0; let sumSq = 0;
    for (let t = 0; t < returns.length; t++) {
      sum += returns[t]; sumSq += returns[t] ** 2;
      if (t >= window) { sum -= returns[t - window]; sumSq -= returns[t - window] ** 2; }
      if (t >= window - 1) {
        const variance = Math.max(0, (sumSq - (sum * sum) / window) / (window - 1));
        values[t] = Math.sqrt(variance * tradingDays);
      }
    }
  }
  let current: number | null = null;
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== null) { current = values[i]; break; }
  return { dates, values, current };
}
