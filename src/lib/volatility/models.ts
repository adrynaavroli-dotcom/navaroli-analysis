import { historicalVolatility } from './historical';
import { rollingVolatility } from './rolling';
import { ewmaVolatility } from './ewma';
import { garchModel } from './garch';
import { gjrGarchModel } from './gjr-garch';
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

/** Default in-sample comparison set (not the VOL-005 OOS set, which is defined separately). */
export const comparisonModels = (lambda: number): VolatilityModel[] => [
  historicalModel, rollingModel(20), rollingModel(60), ewmaModel(lambda), garchModel, gjrGarchModel,
];
