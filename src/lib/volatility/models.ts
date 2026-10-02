import { historicalVolatility } from './historical';
import { rollingVolatility } from './rolling';
import { ewmaVolatility } from './ewma';
import type { VolatilityModel } from './types';

export const historicalModel: VolatilityModel = {
  id: 'historical', name: 'Historical', method: 'Full-sample',
  calculate(returns, dates) {
    const v = historicalVolatility(returns);
    const current = Number.isFinite(v) ? v : null;
    return { dates, values: returns.map(() => current), current };
  },
};

export const rollingModel = (window: number): VolatilityModel => ({
  id: `rolling-${window}`, name: `Rolling ${window}D`, method: 'Rolling window',
  calculate: (r, d) => rollingVolatility(r, d, window),
});

export const ewmaModel = (lambda: number): VolatilityModel => ({
  id: `ewma-${lambda}`, name: `EWMA (λ=${lambda.toFixed(2)})`, method: 'Exponentially weighted',
  calculate: (r, d) => ewmaVolatility(r, d, lambda),
});

/** Default comparison set. Future: GARCH(1,1), EGARCH, GJR-GARCH register here. */
export const comparisonModels = (lambda: number): VolatilityModel[] => [
  historicalModel, rollingModel(20), rollingModel(60), ewmaModel(lambda),
];
