import { gmvClosedForm, gmvLongOnly } from '../../portfolio/min-variance';
import { effectiveN, hhi } from '../../portfolio/metrics';
import { compareExact, compareNumeric, type CompareMeta } from '../compare';
import type { ValidationResult } from '../types';

export const POR001_IMPLEMENTATION_VERSION = 'quant-engine/por001-min-variance@1.0.0';

interface ClosedCase { weights: number[]; variance: number }
interface ConstrainedCase extends ClosedCase { kktResidual: number }
interface Case {
  S: number[][]; maxWeight: number;
  closed: ClosedCase; constrained: ConstrainedCase;
  conditionNumber: number; hhi: number; effectiveN: number;
}
export interface Por001Fixture {
  meta: { version: string; seed: number; python: string; numpy: string; scipy: string; updateReason: string };
  cases: Record<string, Case>;
}

/**
 * Tolerances (fixed in the approved design review BEFORE comparing results):
 *  - closed-form weights: same linear solve, only floating-point order differs → 1e-10 absolute;
 *  - closed-form variance: 1e-12 relative;
 *  - constrained weights: different solvers (active-set vs SLSQP), both exact for a convex QP → 1e-8 absolute;
 *  - constrained variance: 1e-10 relative, and ours must satisfy σ²_TS ≤ σ²_ref + 1e-12 (never worse);
 *  - KKT residual of our solution ≤ 1e-10 (optimality certificate);
 *  - condition number: iterative estimate vs exact SVD → 1% relative (diagnostic only);
 *  - metrics (HHI, effective N): 1e-9 relative.
 */
export function runPor001(fx: Por001Fixture, validationDate: string): ValidationResult[] {
  const py = `Python ${fx.meta.python} · numpy ${fx.meta.numpy} · scipy ${fx.meta.scipy}`;
  const ds = `SYNTHETIC TEST DATA — ${fx.meta.version}, seed ${fx.meta.seed}`;
  const m = (testName: string, reference: string, validationType: CompareMeta['validationType'] = 'independent-benchmark', notes?: string): CompareMeta =>
    ({ modelId: 'POR-001', testName, validationType, reference: validationType === 'independent-benchmark' ? `${reference} (${py})` : reference, dataset: ds, validationDate, implementationVersion: POR001_IMPLEMENTATION_VERSION, notes });
  const out: ValidationResult[] = [];

  for (const [name, c] of Object.entries(fx.cases)) {
    const cf = gmvClosedForm(c.S);
    out.push(compareExact([cf.status], ['OK'], m(`Closed-form status OK · ${name}`, 'numpy.linalg.solve', 'numerical')));
    if (cf.status === 'OK') {
      out.push(compareNumeric(cf.weights!, c.closed.weights, { abs: 1e-10, rel: 0 }, m(`Closed-form GMV weights · ${name}`, 'numpy.linalg.solve(Σ, 1)')));
      out.push(compareNumeric([cf.variance!], [c.closed.variance], { abs: 0, rel: 1e-12 }, m(`Closed-form GMV variance · ${name}`, 'numpy 1/(1ᵀΣ⁻¹1)')));
      out.push(compareNumeric([cf.conditionNumber!], [c.conditionNumber], { abs: 0, rel: 0.01 }, m('Condition number diagnostic (power/inverse iteration)', 'numpy.linalg.cond', 'numerical')));
    }

    const lo = gmvLongOnly(c.S, c.maxWeight);
    out.push(compareExact([lo.status], ['OK'], m(`Long-only status OK · ${name}`, 'scipy SLSQP', 'numerical')));
    if (lo.status === 'OK') {
      out.push(compareNumeric(lo.weights!, c.constrained.weights, { abs: 1e-8, rel: 0 }, m(`Long-only GMV weights (cap ${c.maxWeight}) · ${name}`, 'scipy.optimize.minimize SLSQP (ftol 1e-15)')));
      out.push(compareNumeric([lo.variance!], [c.constrained.variance], { abs: 0, rel: 1e-10 }, m(`Long-only GMV variance · ${name}`, 'scipy SLSQP objective')));
      out.push(compareExact([lo.variance! <= c.constrained.variance + 1e-12], [true], m(`Optimality: σ²_TS ≤ σ²_ref + 1e-12 · ${name}`, 'scipy SLSQP objective', 'independent-benchmark', `Δσ² = ${(lo.variance! - c.constrained.variance).toExponential(2)}`)));
      out.push(compareExact([lo.kktResidual! <= 1e-10], [true], m(`KKT residual ≤ 1e-10 · ${name}`, 'KKT conditions (budget, bounds, stationarity)', 'numerical', `residual = ${lo.kktResidual!.toExponential(2)}`)));
      out.push(compareNumeric([hhi(lo.weights!), effectiveN(lo.weights!)], [c.hhi, c.effectiveN], { abs: 0, rel: 1e-9 }, m(`Concentration metrics (HHI, N_eff) · ${name}`, 'numpy on SLSQP weights', 'numerical')));
    }
  }
  return out;
}
