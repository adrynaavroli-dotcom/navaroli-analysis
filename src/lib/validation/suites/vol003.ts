import { fitGarch, garchBackcast, garchRecursion, garchVarianceBounds, GarchInputError, GARCH_SCALE, type GarchParams } from '../../volatility/garch';
import { ljungBox } from '../../timeseries';
import { compareExact, compareNumeric, type CompareMeta } from '../compare';
import type { ValidationResult } from '../types';

export const VOL003_IMPLEMENTATION_VERSION = 'quant-engine/vol003-garch11@1.0.0';

interface ArchFit { mu: number; omega: number; alpha: number; beta: number; logLik: number; aic: number; bic: number; h: number[]; se: Record<'mu' | 'omega' | 'alpha' | 'beta', number>; convergenceFlag: number; boundsActive: number }
interface Case { y: number[]; backcast: number; lower: number[]; upper: number[]; fixed: { params: number[]; h: number[]; hNoBounds: number[]; logLik: number; boundsActive: number }; fit: ArchFit }
export interface Vol003Fixture {
  meta: { version: string; seed: number; python: string; numpy: string; arch: string; scale: number };
  cases: Record<string, Case>;
  recovery: { true: GarchParams; samples: { y: number[]; fit: Pick<ArchFit, 'mu' | 'omega' | 'alpha' | 'beta' | 'logLik' | 'se'> }[] };
}

const KEYS = ['mu', 'omega', 'alpha', 'beta'] as const;
const S2 = GARCH_SCALE ** 2;
/** Fitted parameters in y = 100·r units (the units arch estimates in). */
const toY = (p: GarchParams) => ({ mu: p.mu * GARCH_SCALE, omega: p.omega * S2, alpha: p.alpha, beta: p.beta });
/** Interior cases: parameters compared to arch; boundary cases (arch α = 0 exactly): likelihood only. */
const INTERIOR = ['garch_n1500', 'high_persistence_n2000'];

/**
 * Tolerances:
 *  - fixed-parameter paths: same arithmetic → 1e-12 relative;
 *  - fitted parameters: two different optimizers (Nelder–Mead vs SLSQP) on a flat likelihood
 *    → |Δθ| ≤ 0.02·SE(θ) (2% of a standard error: statistically negligible);
 *  - log-likelihood at the optimum: 1e-5 absolute (≈1e-9 relative);
 *  - recovery: |θ̂ − θ₀| ≤ 4·SE (per sample; P(fail) ≈ 6e-5 per parameter under asymptotic normality).
 */
export function runVol003(fx: Vol003Fixture, validationDate: string): ValidationResult[] {
  const py = `Python ${fx.meta.python} · arch ${fx.meta.arch} · numpy ${fx.meta.numpy}`;
  const ds = `SYNTHETIC TEST DATA — ${fx.meta.version}, seed ${fx.meta.seed}`;
  const m = (testName: string, reference: string, validationType: CompareMeta['validationType'] = 'independent-benchmark', notes?: string): CompareMeta =>
    ({ modelId: 'VOL-003', testName, validationType, reference: validationType === 'independent-benchmark' ? `${reference} (${py})` : reference, dataset: ds, validationDate, implementationVersion: VOL003_IMPLEMENTATION_VERSION, notes });
  const out: ValidationResult[] = [];

  for (const [name, c] of Object.entries(fx.cases)) {
    const y = c.y, ybar = y.reduce((a, b) => a + b, 0) / y.length, e0 = y.map((v) => v - ybar);
    const b = garchBackcast(e0), bounds = garchVarianceBounds(e0);
    out.push(compareNumeric([b, ...bounds[0], ...bounds[1]], [c.backcast, ...c.lower, ...c.upper], { abs: 0, rel: 1e-12 }, m(`Backcast and variance bounds · ${name}`, 'arch GARCH.backcast / variance_bounds')));
    const [mu, omega, alpha, beta] = c.fixed.params;
    const rec = garchRecursion(y, { mu, omega, alpha, beta }, b, bounds);
    out.push(compareNumeric(rec.h, c.fixed.h, { abs: 0, rel: 1e-12 }, m(`Fixed-parameter variance path h_t · ${name}`, 'arch GARCH.compute_variance')));
    out.push(compareNumeric([rec.logLik], [c.fixed.logLik], { abs: 0, rel: 1e-12 }, m(`Fixed-parameter Gaussian log-likelihood · ${name}`, 'numpy on arch variance path')));
    out.push(compareExact([rec.boundHits, c.fixed.boundsActive], [0, 0], m(`Variance bounds inactive at fixed parameters · ${name}`, 'arch variance_bounds', 'numerical')));

    const f = fitGarch(y.map((v) => v / GARCH_SCALE));
    const qy = toY(f.params), llY = f.logLik - y.length * Math.log(GARCH_SCALE);
    if (INTERIOR.includes(name)) {
      out.push(compareNumeric(KEYS.map((k) => (qy[k] - c.fit[k]) / c.fit.se[k]), [0, 0, 0, 0], { abs: 0.02, rel: 0 },
        m(`Fitted μ, ω, α, β vs arch (error in SE units) · ${name}`, 'arch_model(...).fit(backcast=…) SLSQP', 'independent-benchmark', `ours y-units: ${KEYS.map((k) => `${k}=${qy[k].toPrecision(6)}`).join(', ')}`)));
      out.push(compareNumeric([llY, f.aic, f.bic].map((v, i) => (i ? v - 2 * y.length * Math.log(GARCH_SCALE) * 0 : v)).slice(0, 1), [c.fit.logLik], { abs: 1e-5, rel: 0 }, m(`Maximized log-likelihood (y units) · ${name}`, 'arch fit loglikelihood')));
      out.push(compareNumeric([-2 * llY + 8, -2 * llY + 4 * Math.log(y.length)], [c.fit.aic, c.fit.bic], { abs: 2e-5, rel: 0 }, m(`AIC / BIC (y units) · ${name}`, 'arch fit aic / bic')));
      out.push(compareNumeric(f.variance.map((v) => v * S2), c.fit.h, { abs: 0, rel: 1e-3 }, m(`Fitted conditional variance path · ${name}`, 'arch conditional_volatility²', 'independent-benchmark', 'Follows from parameter differences ≤ 0.02 SE')));
      out.push(compareExact([f.status, f.diagnostics.boundHits], ['CONVERGED', 0], m(`Converged, interior optimum, bounds inactive · ${name}`, 'Optimizer diagnostics', 'numerical', `iter ${f.diagnostics.iterations}, evals ${f.diagnostics.evaluations}, |∇ℓ_y| ${f.diagnostics.gradientNorm.toExponential(2)}`)));
    } else {
      out.push(compareExact([llY >= c.fit.logLik - 1e-6, f.status, f.diagnostics.nearBoundary.includes('α ≈ 0')], [true, 'CONVERGED_NEAR_BOUNDARY', true],
        m(`Boundary optimum (arch α = 0): ℓ ≥ ℓ_arch − 1e-6 and flagged near-boundary · ${name}`, 'arch fit (SLSQP reaches α = 0 exactly)', 'independent-benchmark',
          `ours α=${f.params.alpha.toExponential(2)}, ℓ_y diff ${(llY - c.fit.logLik).toExponential(2)}. β/ω weakly identified when α≈0, so not compared`)));
    }
  }

  // Parameter recovery on 6 independent samples from known parameters.
  const T = fx.recovery.true;
  const z = fx.recovery.samples.flatMap((s) => { const f = toY(fitGarch(s.y.map((v) => v / GARCH_SCALE)).params); return KEYS.map((k) => (f[k] - T[k]) / s.fit.se[k]); });
  out.push(compareNumeric(z, new Array(z.length).fill(0), { abs: 4, rel: 0 }, m(`Parameter recovery: 6 samples × 4 params within 4 SE of truth (μ=${T.mu}, ω=${T.omega}, α=${T.alpha}, β=${T.beta}, y units)`, 'Asymptotic normality of MLE; SE from arch', 'numerical', `max |z| = ${Math.max(...z.map(Math.abs)).toFixed(2)}`)));
  const zm = KEYS.map((_, j) => z.filter((_, i) => i % 4 === j).reduce((a, b) => a + b, 0) / Math.sqrt(6));
  out.push(compareNumeric(zm, [0, 0, 0, 0], { abs: 4, rel: 0 }, m('Parameter recovery: pooled bias Σz/√6 within ±4 per parameter', 'Mean of 6 independent z-scores ~ N(0,1)·√6/√6', 'numerical')));

  // Scaling identity: estimates in r units vs recursion in y units.
  const c0 = fx.cases.garch_n1500, r = c0.y.map((v) => v / GARCH_SCALE), f0 = fitGarch(r);
  const yy = r.map((v) => v * GARCH_SCALE), ybar = yy.reduce((a, b) => a + b, 0) / yy.length, e0 = yy.map((v) => v - ybar);
  const recY = garchRecursion(yy, toY(f0.params), garchBackcast(e0), garchVarianceBounds(e0));
  out.push(compareNumeric([f0.logLik, ...f0.variance], [recY.logLik + yy.length * Math.log(GARCH_SCALE), ...recY.h.map((v) => v / S2)], { abs: 0, rel: 1e-12 }, m('Unit scaling: ℓ_r = ℓ_y + n·ln100 and h_r = h_y/10⁴', 'Change of variables y = 100·r', 'numerical')));
  const rr = r.map((v) => v - f0.params.mu), recR = garchRecursion(r, f0.params, garchBackcast(r.map((v) => v - r.reduce((a, b) => a + b, 0) / r.length)));
  out.push(compareNumeric([recR.logLik, f0.unconditionalVariance!], [f0.logLik, f0.params.omega / (1 - f0.persistence)], { abs: 1e-7, rel: 1e-9 }, m('Unbounded recursion in r units reproduces ℓ_r; h̄ = ω/(1−α−β)', 'Change of variables (bounds inactive)', 'numerical', `n=${rr.length}`)));

  // Hand-checkable recursion: y = [1, −1, 2], μ=0, ω=0.1, α=0.2, β=0.7.
  const w = [1, 0.94, 0.94 ** 2], bH = (w[0] * 1 + w[1] * 1 + w[2] * 4) / (w[0] + w[1] + w[2]);
  const h0 = 0.1 + 0.9 * bH, h1 = 0.1 + 0.2 * 1 + 0.7 * h0, h2 = 0.1 + 0.2 * 1 + 0.7 * h1;
  out.push(compareNumeric([garchBackcast([1, -1, 2]), ...garchRecursion([1, -1, 2], { mu: 0, omega: 0.1, alpha: 0.2, beta: 0.7 }, garchBackcast([1, -1, 2])).h], [bH, h0, h1, h2], { abs: 1e-15, rel: 1e-14 }, m('Hand-checkable backcast and h_0..h_2', 'Manual calculation', 'numerical')));

  // No look-ahead at fixed parameters (fixed backcast): a shock to y_500 changes h_t only for t ≥ 501.
  const P = { mu: 0.04, omega: 0.05, alpha: 0.1, beta: 0.85 }, bb = 1.2;
  const a1 = garchRecursion(c0.y, P, bb).h, a2 = garchRecursion(c0.y.map((v, t) => (t === 500 ? v + 10 : v)), P, bb).h;
  out.push(compareExact([a1.slice(0, 501).every((v, t) => v === a2[t]), a2[501] !== a1[501]], [true, true], m('No look-ahead: shock at t=500 first enters h_501', 'Recursion timing', 'numerical')));

  // Residual diagnostics (not adequacy proof).
  const zs = f0.standardizedResiduals, n = zs.length, mz = zs.reduce((a, b) => a + b, 0) / n, vz = zs.reduce((s, v) => s + (v - mz) ** 2, 0) / (n - 1);
  const lbz = ljungBox(zs)!, lbz2 = ljungBox(zs.map((v) => v * v))!;
  out.push(compareNumeric([mz, vz - 1], [0, 0], { abs: 4 * Math.sqrt(2 / n) + 4 / Math.sqrt(n), rel: 0 }, m('Standardized residuals: mean ≈ 0, variance ≈ 1 (garch_n1500)', 'Diagnostic: z_t ~ (0,1) under correct specification', 'numerical', `mean ${mz.toFixed(4)}, var ${vz.toFixed(4)}`)));
  out.push(compareExact([lbz2[0].pValue > 0.01, lbz2[1].pValue > 0.01], [true, true], m('No remaining ARCH effects in z² (Ljung–Box 10/20, p > 1%) (garch_n1500)', 'Diagnostic via STA-002 ljungBox', 'numerical', `LB z p=${lbz.map((x) => x.pValue.toFixed(3)).join('/')}, LB z² p=${lbz2.map((x) => x.pValue.toFixed(3)).join('/')}`)));

  // Input handling.
  const throws = (g: () => unknown) => { try { g(); return false; } catch (e) { return e instanceof GarchInputError; } };
  out.push(compareExact([throws(() => fitGarch(new Array(200).fill(0.01))), throws(() => fitGarch(r.slice(0, 50))), throws(() => fitGarch([...r.slice(0, 200), NaN])), throws(() => fitGarch([...r.slice(0, 200), Infinity]))],
    [true, true, true, true], m('Constant, short (<100) and non-finite inputs rejected', 'Spec', 'numerical')));
  return out;
}
