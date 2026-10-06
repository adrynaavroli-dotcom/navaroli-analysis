/**
 * Generic trailing rolling window: out[t] = fn(x[t-w+1..t]); null until w
 * observations exist. Uses only data up to t (no look-ahead).
 */
export function rollingApply<T>(x: number[], window: number, fn: (w: number[]) => T): (T | null)[] {
  const out: (T | null)[] = new Array(x.length).fill(null);
  if (window < 1) return out;
  for (let t = window - 1; t < x.length; t++) out[t] = fn(x.slice(t - window + 1, t + 1));
  return out;
}
