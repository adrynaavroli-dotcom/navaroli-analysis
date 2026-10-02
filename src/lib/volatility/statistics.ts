export function mean(x: number[]): number {
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN;
}

/** Sample standard deviation (n-1). */
export function stdDev(x: number[]): number {
  if (x.length < 2) return NaN;
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
}

function centralMoment(x: number[], k: number): number {
  const m = mean(x);
  return x.reduce((s, v) => s + (v - m) ** k, 0) / x.length;
}

/** Population (moment-based) skewness g1 = m3 / m2^1.5 — the form used by Jarque-Bera. */
export function skewness(x: number[]): number {
  if (x.length < 3) return NaN;
  const m2 = centralMoment(x, 2);
  return m2 === 0 ? 0 : centralMoment(x, 3) / m2 ** 1.5;
}

/** Kurtosis m4 / m2^2 (normal = 3). */
export function kurtosis(x: number[]): number {
  if (x.length < 4) return NaN;
  const m2 = centralMoment(x, 2);
  return m2 === 0 ? 3 : centralMoment(x, 4) / m2 ** 2;
}

export const excessKurtosis = (x: number[]) => kurtosis(x) - 3;

export interface JarqueBeraResult {
  statistic: number;
  pValue: number;
  n: number;
  skewness: number;
  excessKurtosis: number;
}

/** JB = n/6 · (S² + (K-3)²/4) ~ χ²(2) under H0; χ²(2) survival = exp(-JB/2). */
export function jarqueBera(x: number[]): JarqueBeraResult {
  const n = x.length;
  const S = skewness(x); const EK = excessKurtosis(x);
  const statistic = (n / 6) * (S ** 2 + EK ** 2 / 4);
  return { statistic, pValue: Math.exp(-statistic / 2), n, skewness: S, excessKurtosis: EK };
}

export function normalPdf(x: number, mu: number, sigma: number): number {
  return Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
}

export interface HistogramBin { x0: number; x1: number; mid: number; count: number; density: number; normal: number }

export function histogram(x: number[], bins = 40): HistogramBin[] {
  if (x.length < 2) return [];
  const min = Math.min(...x); const max = Math.max(...x);
  const width = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of x) counts[Math.min(bins - 1, Math.floor((v - min) / width))]++;
  const mu = mean(x); const sd = stdDev(x);
  return counts.map((c, i) => {
    const x0 = min + i * width; const mid = x0 + width / 2;
    return { x0, x1: x0 + width, mid, count: c, density: c / (x.length * width), normal: normalPdf(mid, mu, sd) };
  });
}
