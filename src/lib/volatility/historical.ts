import { stdDev } from './statistics';
import { TRADING_DAYS } from './types';

/** Full-sample annualized volatility: σ = √252 · std(r) (sample std, n-1). */
export function historicalVolatility(returns: number[], tradingDays = TRADING_DAYS): number {
  return stdDev(returns) * Math.sqrt(tradingDays);
}
