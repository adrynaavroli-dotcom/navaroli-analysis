import { garchBackcast, garchRecursion, garchVarianceBounds, GARCH_SCALE } from '../../volatility/garch';
import { fitGjrGarch, gjrRecursion, GjrInputError, type GjrParams } from '../../volatility/gjr-garch';
import { compareExact, compareNumeric, type CompareMeta } from '../compare';
import type { ValidationResult } from '../types';

export const VOL004_IMPLEMENTATION_VERSION = 'quant-engine/vol004-gjr-garch111@1.0.0';

type K = 'mu' | 'omega' | 'alpha' | 'gamma' | 'beta';
interface ArchFit extends Record<K, number> { logLik: number; aic: number; bic: number; h: number[]; se: Record<K, number>; convergenceFlag: number }
interface Fixed { params: number[]; h: number[]; logLik: number; boundsActive: number }
interface Case { y: number[]; backcast: number; lower: number[]; upper: number[]; fixed: Fixed[]; fit: ArchFit }
export interface Vol004Fixture {
  meta: { version: string; seed: number; python: string; numpy: string; scipy: string; arch: string; scale: number; updateReason: string };
  true: GjrParams;
  cases: Record<string, Case>;
}

const KEYS: K[] = ['mu', 'omega', 'alpha', 'gamma', 'beta'];
const S2 = GARCH_SCALE ** 2;
const toY = (p: GjrParams): GjrParams => ({ mu: p.mu * GARCH_SCALE, omega: p.omega * S2, alpha: p.alpha, gamma: p.gamma, beta: p.beta });
const P = (a: number[]): GjrParams => ({ mu: a[0], omega: a[1], alpha: a[2], gamma: a[3], beta: a[4] });

/**
 * Tolerances (fixed in the approved design review BEFORE comparing results):
 *  - backcast / variance bounds: same closed-form sums → 1e-9 relative;
 *  - fixed-parameter h path and ℓ: deterministic recursion, only floating-point order differs → 1e-10 relative;
 *  - fitted ℓ: different optimizers (Nelder–Mead vs SLSQP) → ours must satisfy ℓ_TS ≥ ℓ_arch − 1e-4;
 *  - fitted parameters: |Δθ| ≤ 0.05·SE_arch(θ) when the arch optimum is interior
 *    (α, α+γ, β > 1e-6); otherwise likelihood only;
 *  - AIC/BIC: derived from ℓ with k = 5 → 2e-4 absolute (twice the ℓ tolerance);
 *  - recovery (single sample): |θ̂ − θ₀| ≤ 3·SE — sanity check, not accuracy.
 */
export function runVol004(fx: Vol004Fixture, validationDate: string): ValidationResult[] {
  const py = `Python ${fx.meta.python} · arch ${fx.meta.arch} · numpy ${fx.meta.numpy}`;
  const ds = `SYNTHETIC TEST DATA — ${fx.meta.version}, seed ${fx.meta.seed}`;
  const m = (testName: string, reference: string, validationType: CompareMeta['validationType'] = 'independent-benchmark', notes?: string): CompareMeta =>
    ({ modelId: 'VOL-004', testName, validationType, reference: validationType === 'independent-benchmark' ? `${reference} (${py})` : reference, dataset: ds, validationDate, implementationVersion: VOL004_IMPLEMENTATION_VERSION, notes });
  const out: ValidationResult[] = [];

  for (const [name, c] of Object.entries(fx.cases)) {
    const y = c.y, n = y.length, ybar = y.reduce((a, b) => a + b, 0) / n, e0 = y.map((v) => v - ybar);
    const b = garchBackcast(e0), bounds = garchVarianceBounds(e0);
    out.push(compareNumeric([b, ...bounds[0], ...bounds[1]], [c.backcast, ...c.lower, ...c.upper], { abs: 0, rel: 1e-9 }, m(`Backcast and variance bounds · ${name}`, 'arch GARCH(1,1,1).backcast / variance_bounds')));
    c.fixed.forEach((fs, i) => {
      const rec = gjrRecursion(y, P(fs.params), b, bounds), tag = `γ=${fs.params[3]}`;
      out.push(compareNumeric(rec.h, fs.h, { abs: 0, rel: 1e-10 }, m(`Fixed-parameter variance path h_t (${tag}, incl. t=0 term (α+γ/2+β)·b) · ${name}`, 'arch GARCH.compute_variance')));
      out.push(compareNumeric([rec.logLik], [fs.logLik], { abs: 0, rel: 1e-10 }, m(`Fixed-parameter Gaussian log-likelihood (${tag}) · ${name}`, 'numpy on arch variance path')));
      out.push(compareExact([rec.boundHits, fs.boundsActive], [0, 0], m(`Variance bounds inactive at fixed parameters (${tag}) · ${name}`, 'arch variance_bounds', 'numerical')));
      void i;
    });

    const f = fitGjrGarch(y.map((v) => v / GARCH_SCALE));
    const qy = toY(f.params), llY = f.logLik - n * Math.log(GARCH_SCALE), a = c.fit;
    out.push(compareExact([llY >= a.logLik - 1e-4], [true], m(`Maximized ℓ_y ≥ ℓ_arch − 1e-4 · ${name}`, 'arch fit loglikelihood (SLSQP)', 'independent-benchmark', `Δℓ_y = ${(llY - a.logLik).toExponential(2)}`)));
    const interior = a.alpha > 1e-6 && a.alpha + a.gamma > 1e-6 && a.beta > 1e-6;
    if (interior) {
      out.push(compareNumeric(KEYS.map((k) => (qy[k] - a[k]) / a.se[k]), [0, 0, 0, 0, 0], { abs: 0.05, rel: 0 },
        m(`Fitted μ, ω, α, γ, β vs arch (error in SE units) · ${name}`, 'arch_model(p=1,o=1,q=1).fit(backcast=…)', 'independent-benchmark', `ours y-units: ${KEYS.map((k) => `${k}=${qy[k].toPrecision(6)}`).join(', ')}`)));
    }
    out.push(compareNumeric([-2 * llY + 10, -2 * llY + 5 * Math.log(n)], [a.aic, a.bic], { abs: 2e-4, rel: 0 }, m(`AIC / BIC with k = 5 (y units) · ${name}`, 'arch fit aic / bic')));
    out.push(compareExact([f.status, f.diagnostics.boundHits], ['CONVERGED', 0], m(`Converged, interior optimum, bounds inactive · ${name}`, 'Optimizer diagnostics', 'numerical', `iter ${f.diagnostics.iterations}, evals ${f.diagnostics.evaluations}, γ̂=${f.params.gamma.toFixed(5)}`)));
  }

  // Parameter recovery (single asymmetric sample, sanity only).
  const T = fx.true, ca = fx.cases.gjr_asymmetric_n2000, fa = toY(fitGjrGarch(ca.y.map((v) => v / GARCH_SCALE)).params);
  const z = KEYS.map((k) => (fa[k] - T[k]) / ca.fit.se[k]);
  out.push(compareNumeric(z, [0, 0, 0, 0, 0], { abs: 3, rel: 0 }, m(`Parameter recovery within 3 SE of truth (μ=${T.mu}, ω=${T.omega}, α=${T.alpha}, γ=${T.gamma}, β=${T.beta}, y units)`, 'Asymptotic normality of MLE; SE from arch', 'numerical', `z = ${z.map((v) => v.toFixed(2)).join(', ')}`)));

  // γ = 0 reduces exactly to VOL-003 (same backcast, same bounds).
  const y = ca.y, ybar = y.reduce((s, v) => s + v, 0) / y.length, e0 = y.map((v) => v - ybar), b = garchBackcast(e0), bd = garchVarianceBounds(e0);
  const q = { mu: 0.05, omega: 0.02, alpha: 0.08, beta: 0.9 };
  const g = garchRecursion(y, q, b, bd), j = gjrRecursion(y, { ...q, gamma: 0 }, b, bd);
  out.push(compareNumeric([j.logLik, ...j.h], [g.logLik, ...g.h], { abs: 0, rel: 1e-14 }, m('γ = 0 identity: GJR recursion equals VOL-003 GARCH recursion', 'Nested model', 'numerical')));

  // Hand-checkable: y = [1, −1, 2], μ=0, ω=0.1, α=0.1, γ=0.2, β=0.7.
  const w = [1, 0.94, 0.94 ** 2], bH = (w[0] + w[1] + 4 * w[2]) / (w[0] + w[1] + w[2]);
  const h0 = 0.1 + (0.1 + 0.1 + 0.7) * bH, h1 = 0.1 + 0.1 * 1 + 0.7 * h0, h2 = 0.1 + (0.1 + 0.2) * 1 + 0.7 * h1;
  out.push(compareNumeric(gjrRecursion([1, -1, 2], { mu: 0, omega: 0.1, alpha: 0.1, gamma: 0.2, beta: 0.7 }, garchBackcast([1, -1, 2])).h, [h0, h1, h2], { abs: 1e-15, rel: 1e-14 }, m('Hand-checkable h_0..h_2 (asymmetry applied after the negative shock only)', 'Manual calculation', 'numerical')));

  const throws = (fn: () => unknown) => { try { fn(); return false; } catch (e) { return e instanceof GjrInputError; } };
  const r = y.map((v) => v / GARCH_SCALE);
  out.push(compareExact([throws(() => fitGjrGarch(new Array(200).fill(0.01))), throws(() => fitGjrGarch(r.slice(0, 50))), throws(() => fitGjrGarch([...r.slice(0, 200), NaN]))],
    [true, true, true], m('Constant, short (<100) and non-finite inputs rejected', 'Spec', 'numerical')));
  return out;
}
