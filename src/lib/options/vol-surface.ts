/**
 * Implied Volatility Surface construction
 *
 * 1. Inverse Black-Scholes: solve C_market - C_model(sigma) = 0 for each contract.
 * 2. Parameterize in Strike (K) or log-moneyness k = log(K / F0), F0 = S * e^{(r-q)T}.
 * 3. Interpolate each maturity slice onto a common grid -> smooth 3D mesh.
 * 4. Static arbitrage filters: dC/dK <= 0 (butterfly/vertical sanity) and total
 *    variance w(K,T) = sigma^2 * T non-decreasing in T (calendar spread).
 */

import { bsPrice } from './black-scholes';

export type SurfaceAxis = 'strike' | 'logMoneyness';

export interface SurfaceQuote {
  strike: number;
  expiration: string;
  timeToExpiry: number;
  type: 'call' | 'put';
  price: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  yahooIv: number;
}

export interface SurfacePoint extends SurfaceQuote {
  iv: number;
  logMoneyness: number;
  forward: number;
}

export interface VolSurface {
  x: number[];            // strike or log-moneyness grid
  y: number[];            // time to expiry in years
  z: (number | null)[][]; // implied vol in % ; z[yIndex][xIndex]
  priceGrid: (number | null)[][];
  strikeGrid: (number | null)[][];
  expirations: string[];
  points: SurfacePoint[];
  axis: SurfaceAxis;
  stats: {
    rawQuotes: number;
    solved: number;
    arbitrageRejected: number;
    calendarAdjusted: number;
    atmVol: number | null;
  };
}

const MIN_VOL = 0.005;
const MAX_VOL = 5;

/** Inverse Black-Scholes via bisection (robust, monotone in sigma). */
export function impliedVolatility(
  marketPrice: number,
  s: number,
  k: number,
  r: number,
  q: number,
  t: number,
  type: 'call' | 'put',
  tol = 1e-6,
  maxIter = 100,
): number | null {
  if (!(marketPrice > 0) || !(s > 0) || !(k > 0) || !(t > 0)) return null;

  const intrinsic = type === 'call'
    ? Math.max(s * Math.exp(-q * t) - k * Math.exp(-r * t), 0)
    : Math.max(k * Math.exp(-r * t) - s * Math.exp(-q * t), 0);
  const upperBound = type === 'call' ? s * Math.exp(-q * t) : k * Math.exp(-r * t);
  if (marketPrice < intrinsic - 1e-8 || marketPrice >= upperBound) return null;

  let lo = MIN_VOL;
  let hi = MAX_VOL;
  let fLo = bsPrice(s, k, r, q, lo, t, type) - marketPrice;
  let fHi = bsPrice(s, k, r, q, hi, t, type) - marketPrice;
  if (fLo > 0 || fHi < 0) return null;

  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (lo + hi);
    const fMid = bsPrice(s, k, r, q, mid, t, type) - marketPrice;
    if (Math.abs(fMid) < tol || hi - lo < tol) return mid;
    if (fMid < 0) { lo = mid; fLo = fMid; } else { hi = mid; fHi = fMid; }
  }
  return 0.5 * (lo + hi);
}

function linInterp(xs: number[], ys: number[], x: number): number | null {
  if (xs.length === 0) return null;
  if (x < xs[0] || x > xs[xs.length - 1]) return null; // no extrapolation
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const x0 = xs[i - 1], x1 = xs[i];
      if (x1 === x0) return ys[i];
      const w = (x - x0) / (x1 - x0);
      return ys[i - 1] * (1 - w) + ys[i] * w;
    }
  }
  return ys[ys.length - 1];
}

/** Drop quotes violating dC/dK <= 0 (calls) or dP/dK >= 0 (puts) within a maturity. */
function arbitrageFilter(quotes: SurfaceQuote[]): { kept: SurfaceQuote[]; rejected: number } {
  const kept: SurfaceQuote[] = [];
  let rejected = 0;
  (['call', 'put'] as const).forEach((type) => {
    const slice = quotes.filter((q) => q.type === type).sort((a, b) => a.strike - b.strike);
    let prev: SurfaceQuote | null = null;
    for (const q of slice) {
      if (prev) {
        const dp = q.price - prev.price;
        const dk = q.strike - prev.strike;
        if (dk > 0) {
          const slope = dp / dk;
          // call price must be non-increasing in K, put price non-decreasing
          if ((type === 'call' && slope > 1e-6) || (type === 'put' && slope < -1e-6)) {
            rejected++;
            continue;
          }
        }
      }
      kept.push(q);
      prev = q;
    }
  });
  return { kept, rejected };
}

export interface BuildSurfaceOptions {
  spot: number;
  riskFreeRate: number;    // decimal
  dividendYield: number;   // decimal
  axis: SurfaceAxis;
  gridSize?: number;
  moneynessRange?: number; // keep |k| <= range
}

export function buildVolSurface(quotes: SurfaceQuote[], opts: BuildSurfaceOptions): VolSurface | null {
  const { spot, riskFreeRate: r, dividendYield: q, axis } = opts;
  const gridSize = opts.gridSize ?? 40;
  const moneynessRange = opts.moneynessRange ?? 0.6;

  if (!(spot > 0) || quotes.length === 0) return null;

  // Group by expiration
  const byExpiry = new Map<string, SurfaceQuote[]>();
  for (const quote of quotes) {
    if (!(quote.timeToExpiry > 0) || !(quote.strike > 0) || !(quote.price > 0)) continue;
    const arr = byExpiry.get(quote.expiration) ?? [];
    arr.push(quote);
    byExpiry.set(quote.expiration, arr);
  }

  const expirations = [...byExpiry.keys()].sort();
  if (expirations.length < 2) return null;

  let arbitrageRejected = 0;
  const slices: { expiration: string; t: number; pts: SurfacePoint[] }[] = [];

  for (const exp of expirations) {
    const raw = byExpiry.get(exp)!;
    const t = raw[0].timeToExpiry;
    const forward = spot * Math.exp((r - q) * t);

    const { kept, rejected } = arbitrageFilter(raw);
    arbitrageRejected += rejected;

    const pts: SurfacePoint[] = [];
    for (const quote of kept) {
      const k = Math.log(quote.strike / forward);
      if (Math.abs(k) > moneynessRange) continue;
      // Use OTM wing only (better liquidity / numerical stability)
      if (quote.type === 'call' && quote.strike < forward * 0.98) continue;
      if (quote.type === 'put' && quote.strike > forward * 1.02) continue;

      const iv = impliedVolatility(quote.price, spot, quote.strike, r, q, t, quote.type);
      if (iv === null || iv <= MIN_VOL * 1.5 || iv >= MAX_VOL * 0.98) continue;
      pts.push({ ...quote, iv, logMoneyness: k, forward });
    }

    // Deduplicate by strike (average call/put overlap)
    const merged = new Map<number, SurfacePoint>();
    for (const p of pts) {
      const existing = merged.get(p.strike);
      if (!existing) merged.set(p.strike, p);
      else merged.set(p.strike, { ...existing, iv: (existing.iv + p.iv) / 2 });
    }
    const slicePts = [...merged.values()].sort((a, b) => a.strike - b.strike);
    if (slicePts.length >= 4) slices.push({ expiration: exp, t, pts: slicePts });
  }

  if (slices.length < 2) return null;
  slices.sort((a, b) => a.t - b.t);

  const allPoints = slices.flatMap((s) => s.pts);
  const coord = (p: SurfacePoint) => (axis === 'strike' ? p.strike : p.logMoneyness);

  // Common x-grid: intersection-friendly range (median of slice bounds)
  const lowers = slices.map((s) => Math.min(...s.pts.map(coord)));
  const uppers = slices.map((s) => Math.max(...s.pts.map(coord)));
  const xMin = median(lowers);
  const xMax = median(uppers);
  if (!(xMax > xMin)) return null;

  const x: number[] = Array.from({ length: gridSize }, (_, i) => xMin + ((xMax - xMin) * i) / (gridSize - 1));
  const y: number[] = slices.map((s) => s.t);

  const z: (number | null)[][] = [];
  const priceGrid: (number | null)[][] = [];
  const strikeGrid: (number | null)[][] = [];

  for (const slice of slices) {
    const xs = slice.pts.map(coord);
    const ivs = slice.pts.map((p) => p.iv);
    const prices = slice.pts.map((p) => p.price);
    const strikes = slice.pts.map((p) => p.strike);

    const rowIv = x.map((xi) => {
      const v = linInterp(xs, ivs, xi);
      return v === null ? null : v * 100;
    });
    z.push(smoothRow(rowIv));
    priceGrid.push(x.map((xi) => linInterp(xs, prices, xi)));
    strikeGrid.push(x.map((xi) => linInterp(xs, strikes, xi)));
  }

  // Calendar arbitrage: total variance w = sigma^2 * T must be non-decreasing in T
  let calendarAdjusted = 0;
  for (let col = 0; col < x.length; col++) {
    let prevW: number | null = null;
    for (let row = 0; row < z.length; row++) {
      const iv = z[row][col];
      if (iv === null) continue;
      const sigma = iv / 100;
      let w = sigma * sigma * y[row];
      if (prevW !== null && w < prevW - 1e-9) {
        w = prevW;
        z[row][col] = Math.sqrt(w / y[row]) * 100;
        calendarAdjusted++;
      }
      prevW = w;
    }
  }

  // ATM vol of the nearest maturity
  const first = slices[0];
  const atmPoint = first.pts.reduce<SurfacePoint | null>((best, p) => {
    if (!best) return p;
    return Math.abs(p.logMoneyness) < Math.abs(best.logMoneyness) ? p : best;
  }, null);

  return {
    x, y, z, priceGrid, strikeGrid,
    expirations: slices.map((s) => s.expiration),
    points: allPoints,
    axis,
    stats: {
      rawQuotes: quotes.length,
      solved: allPoints.length,
      arbitrageRejected,
      calendarAdjusted,
      atmVol: atmPoint ? atmPoint.iv * 100 : null,
    },
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Light 3-point moving average, skipping gaps. */
function smoothRow(row: (number | null)[]): (number | null)[] {
  return row.map((v, i) => {
    if (v === null) return null;
    const neighbours = [row[i - 1], v, row[i + 1]].filter((n): n is number => typeof n === 'number');
    return neighbours.reduce((a, b) => a + b, 0) / neighbours.length;
  });
}
