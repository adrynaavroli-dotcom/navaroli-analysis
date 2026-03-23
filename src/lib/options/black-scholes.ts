/**
 * Black-Scholes Option Pricing Model
 * Ported from Python: pricer/blackscholes.py
 */

function normCdf(x: number): number {
  // Approximation of the cumulative distribution function for a standard normal
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2.0 * Math.PI);
}

function d1(s: number, k: number, r: number, q: number, sigma: number, t: number): number {
  return (Math.log(s / k) + (r - q + 0.5 * sigma ** 2) * t) / (sigma * Math.sqrt(t));
}

function d2(s: number, k: number, r: number, q: number, sigma: number, t: number): number {
  return d1(s, k, r, q, sigma, t) - sigma * Math.sqrt(t);
}

export function bsCallPrice(s: number, k: number, r: number, q: number, sigma: number, t: number): number {
  const d_1 = d1(s, k, r, q, sigma, t);
  const d_2 = d2(s, k, r, q, sigma, t);
  return s * Math.exp(-q * t) * normCdf(d_1) - k * Math.exp(-r * t) * normCdf(d_2);
}

export function bsPutPrice(s: number, k: number, r: number, q: number, sigma: number, t: number): number {
  const d_1 = d1(s, k, r, q, sigma, t);
  const d_2 = d2(s, k, r, q, sigma, t);
  return k * Math.exp(-r * t) * normCdf(-d_2) - s * Math.exp(-q * t) * normCdf(-d_1);
}

export interface OptionGreeks {
  callDelta: number;
  putDelta: number;
  gamma: number;
  vega: number;
  callTheta: number;
  putTheta: number;
  callRho: number;
  putRho: number;
}

export function bsGreeks(s: number, k: number, r: number, q: number, sigma: number, t: number): OptionGreeks {
  const d_1 = d1(s, k, r, q, sigma, t);
  const d_2 = d2(s, k, r, q, sigma, t);
  const sqrtT = Math.sqrt(t);
  const discountedSpot = s * Math.exp(-q * t);
  const discountedStrike = k * Math.exp(-r * t);
  const pdfD1 = normPdf(d_1);

  const callDelta = Math.exp(-q * t) * normCdf(d_1);
  const putDelta = Math.exp(-q * t) * (normCdf(d_1) - 1.0);
  const gamma = Math.exp(-q * t) * pdfD1 / (s * sigma * sqrtT);
  const vega = discountedSpot * pdfD1 * sqrtT / 100.0;
  const callTheta = (
    -(discountedSpot * pdfD1 * sigma) / (2.0 * sqrtT)
    - r * discountedStrike * normCdf(d_2)
    + q * discountedSpot * normCdf(d_1)
  ) / 365.0;
  const putTheta = (
    -(discountedSpot * pdfD1 * sigma) / (2.0 * sqrtT)
    + r * discountedStrike * normCdf(-d_2)
    - q * discountedSpot * normCdf(-d_1)
  ) / 365.0;
  const callRho = discountedStrike * t * normCdf(d_2) / 100.0;
  const putRho = -discountedStrike * t * normCdf(-d_2) / 100.0;

  return { callDelta, putDelta, gamma, vega, callTheta, putTheta, callRho, putRho };
}
