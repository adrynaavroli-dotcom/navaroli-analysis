/**
 * Black-Scholes Option Pricing Model
 * Ported from Python: pricer/blackscholes.py
 */

function normCdf(x: number): number {
  // Abramowitz & Stegun 26.2.17 approximation for the normal CDF
  if (x >= 0) {
    const k = 1.0 / (1.0 + 0.2316419 * x);
    const poly = k * (0.319381530 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))));
    return 1.0 - (1.0 / Math.sqrt(2.0 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
  }
  return 1.0 - normCdf(-x);
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
