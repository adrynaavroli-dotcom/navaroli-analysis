/**
 * Options Pricing Engine
 * Orchestrates Black-Scholes, Binomial CRR, and Monte Carlo models
 */

import { bsCallPrice, bsPutPrice } from './black-scholes';
import { binomialOptionPrices } from './binomial';
import { mcEuropeanPrices } from './monte-carlo';

export { bsCallPrice, bsPutPrice, bsGreeks, type OptionGreeks } from './black-scholes';
export { binomialOptionPrices, buildTreeLevels, type TreeNode } from './binomial';
export { mcEuropeanPrices } from './monte-carlo';

export type ExerciseStyle = 'european' | 'american';

export interface ModelResult {
  label: string;
  call: number | null;
  put: number | null;
}

export interface OptionInputs {
  spotPrice: number;
  strikePrice: number;
  riskFreeRate: number;
  dividendYield: number;
  volatility: number;
  timeToExpiry: number;
  exerciseStyle: ExerciseStyle;
  binomialSteps: number;
  monteCarloSims: number;
}

export interface ValuationOutput {
  effectiveMethod: string;
  effectiveLabel: string;
  models: Record<string, ModelResult>;
}

export function computeValuations(inputs: OptionInputs): ValuationOutput {
  const { spotPrice: s, strikePrice: k, riskFreeRate: r, dividendYield: q, volatility: sigma, timeToExpiry: t, exerciseStyle, binomialSteps, monteCarloSims } = inputs;

  const isAmerican = exerciseStyle === 'american';
  const models: Record<string, ModelResult> = {};

  models['Black-Scholes'] = {
    label: isAmerican ? 'Black-Scholes European (proxy)' : 'Black-Scholes European',
    call: bsCallPrice(s, k, r, q, sigma, t),
    put: bsPutPrice(s, k, r, q, sigma, t),
  };

  const mc = mcEuropeanPrices(s, k, r, q, sigma, t, monteCarloSims);
  models['Monte Carlo'] = {
    label: isAmerican ? 'Monte Carlo European (proxy)' : 'Monte Carlo European',
    call: mc.call,
    put: mc.put,
  };

  const bin = binomialOptionPrices(s, k, r, q, sigma, t, binomialSteps, isAmerican);
  models['Binomial'] = {
    label: `Binomial CRR (${binomialSteps} steps)`,
    call: bin.call,
    put: bin.put,
  };

  const effectiveMethod = isAmerican ? 'Binomial' : 'Black-Scholes';

  return {
    effectiveMethod,
    effectiveLabel: models[effectiveMethod].label,
    models,
  };
}

export const DEFAULT_BINOMIAL_STEPS = 500;
export const DEFAULT_MC_SIMULATIONS = 25000;
