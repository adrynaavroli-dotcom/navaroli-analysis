/** Cross-runtime comparison of the complete observed record, excluding only run metadata. */
export interface ReproductionDifference { path: string; expected: unknown; actual: unknown }

/**
 * Bun (JavaScriptCore) and Vitest/browser (V8) differ in log/exp rounding. The
 * deterministic GARCH optimizer amplifies this at near-tied simplex steps.
 * Bounds cover measured AAPL differences (QLIKE <9e-10, MSE <8e-17,
 * RMSE <3e-13, relative MSE <3e-9), not statistical/model error tolerances.
 * Only GARCH score leaves receive tolerances; every other leaf is exact.
 */
export const GARCH_REPRODUCTION_TOLERANCES = {
  qlike: { abs: 2e-9, rel: 0 },
  qlikeDiffVsBaseline: { abs: 2e-9, rel: 0 },
  mse: { abs: 1e-16, rel: 1e-8 },
  rmse: { abs: 1e-12, rel: 1e-8 },
  relMseVsBaseline: { abs: 5e-9, rel: 0 },
} as const;

/** Return named JSON-path differences; preserve all protocol, provenance and failure fields. */
export function observedRecordDifferences(actual: unknown, expected: unknown): ReproductionDifference[] {
  const differences: ReproductionDifference[] = [];
  const visit = (a: unknown, e: unknown, path: string) => {
    if (path === '$.runtimeMs' || path === '$.evaluatedAt') return;
    if (a !== null && e !== null && typeof a === 'object' && typeof e === 'object') {
      if (Array.isArray(a) !== Array.isArray(e)) { differences.push({ path, expected: e, actual: a }); return; }
      const aa = a as Record<string, unknown>, ee = e as Record<string, unknown>;
      if (Array.isArray(a) && Array.isArray(e) && a.length !== e.length)
        differences.push({ path: `${path}.length`, expected: e.length, actual: a.length });
      for (const k of new Set([...Object.keys(aa), ...Object.keys(ee)])) visit(aa[k], ee[k], `${path}.${k}`);
      return;
    }
    const metric = path.match(/^\$\.outcome\.horizons\.\d+\.scores\.garch\.(qlike|qlikeDiffVsBaseline|mse|rmse|relMseVsBaseline)$/)?.[1];
    if (metric && typeof a === 'number' && typeof e === 'number' && Number.isFinite(a) && Number.isFinite(e)) {
      const t = GARCH_REPRODUCTION_TOLERANCES[metric as keyof typeof GARCH_REPRODUCTION_TOLERANCES];
      if (Math.abs(a - e) <= t.abs + t.rel * Math.abs(e)) return;
    } else if (Object.is(a, e)) return;
    differences.push({ path, expected: e, actual: a });
  };
  visit(actual, expected, '$');
  return differences;
}