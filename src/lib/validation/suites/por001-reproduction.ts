/** Cross-runtime comparison of the complete POR-001 observed record, excluding only run metadata. */
export interface ReproductionDifference { path: string; expected: unknown; actual: unknown }

/**
 * The GMV engine uses only IEEE arithmetic (+−×÷, √) with fixed summation
 * order, so results are expected to be bit-identical across JavaScriptCore and
 * V8: every leaf is compared exactly. Only run metadata ($.evaluatedAt,
 * $.runtimeMs) is volatile. If a future engine change introduces libm calls,
 * name explicit tolerances here instead of weakening the comparison.
 */
export function por001ObservedDifferences(actual: unknown, expected: unknown): ReproductionDifference[] {
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
    if (Object.is(a, e)) return;
    differences.push({ path, expected: e, actual: a });
  };
  visit(actual, expected, '$');
  return differences;
}
