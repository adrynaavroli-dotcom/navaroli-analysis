import { TRADING_DAYS, type VolatilityResult } from './types';

export const EWMA_SEED_WINDOW = 20;

/**
 * EWMA (RiskMetrics): σ²_t = λ σ²_{t-1} + (1-λ) r²_{t-1}.
 * Initialization: σ²_{seed} = sample variance of the first `seed` returns
 * (assigned at index seed-1). σ_t at index t depends only on returns up to t-1,
 * so the value at t is a genuine ex-ante estimate (no look-ahead).
 * Output is annualized; null before initialization.
 */
export function ewmaVolatility(returns: number[], dates: string[], lambda = 0.94, seed = EWMA_SEED_WINDOW, tradingDays = TRADING_DAYS): VolatilityResult {
  const values: (number | null)[] = new Array(returns.length).fill(null);
  if (returns.length >= seed && seed >= 2) {
    const init = returns.slice(0, seed);
    const m = init.reduce((a, b) => a + b, 0) / seed;
    let variance = init.reduce((s, r) => s + (r - m) ** 2, 0) / (seed - 1);
    values[seed - 1] = Math.sqrt(variance * tradingDays);
    for (let t = seed; t < returns.length; t++) {
      variance = lambda * variance + (1 - lambda) * returns[t - 1] ** 2;
      values[t] = Math.sqrt(variance * tradingDays);
    }
  }
  const last = values.length ? values[values.length - 1] : null;
  return { dates, values, current: last };
}
