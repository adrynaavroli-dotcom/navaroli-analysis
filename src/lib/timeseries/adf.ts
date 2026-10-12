/**
 * Augmented Dickey–Fuller test, constant-only regression (STA-002).
 * Spec: docs/quant/time-series-diagnostics.md
 *
 * Regression:  Δx_t = α + γ x_{t−1} + Σ_{i=1..p} δ_i Δx_{t−i} + ε_t
 * H0: γ = 0 (unit root) · H1: γ < 0 (stationary). Statistic τ = γ̂ / se(γ̂).
 *
 * Lag selection (statsmodels `adfuller(regression="c", autolag="AIC")` convention,
 * chosen by the user): p_max = ⌈12·(n/100)^{1/4}⌉ (Schwert 1989) capped at n/2 − 2;
 * every p = 0..p_max is fitted on the SAME sample (first p_max rows dropped) so AICs
 * are comparable; ties → smaller p; the chosen p is refitted on its full sample.
 * AIC = −2·ℓ + 2k with Gaussian ℓ = −(n/2)(ln 2π + ln(SSR/n) + 1).
 *
 * p-value: MacKinnon (1994) response surface, N=1, case "c":
 *   p = Φ(c0 + c1 τ + c2 τ² [+ c3 τ³]), small/large-τ coefficient sets.
 * Critical values: MacKinnon (2010) finite-sample surface c0 + c1/T + c2/T² + c3/T³,
 * T = regression nobs. Coefficients transcribed from statsmodels 0.15.0
 * (statsmodels/tsa/adfvalues.py), which cites both papers; benchmarked against it.
 */
import { normalCdf } from './special';
import { assertFiniteSeries, isConstant, TimeSeriesInputError } from './acf';

const TAU_MAX_C = 2.74, TAU_MIN_C = -18.83, TAU_STAR_C = -1.61;
const TAU_SMALLP_C = [2.1659, 1.4412, 0.038269];
const TAU_LARGEP_C = [1.7339, 0.93202, -0.12745, -0.010368];
/** MacKinnon 2010, N=1, constant: rows 1%, 5%, 10%; columns c0..c3 (powers of 1/T). */
const CRIT_2010_C = [[-3.43035, -6.5393, -16.786, -79.433], [-2.86154, -2.8903, -4.234, -40.04], [-2.56677, -1.5384, -2.809, 0]];

const poly = (c: number[], x: number) => c.reduceRight((acc, v) => acc * x + v, 0);

/** MacKinnon (1994) approximate p-value for the ADF τ statistic (case "c", N=1). */
export function mackinnonPValue(tau: number): number {
  if (tau > TAU_MAX_C) return 1;
  if (tau < TAU_MIN_C) return 0;
  return normalCdf(poly(tau <= TAU_STAR_C ? TAU_SMALLP_C : TAU_LARGEP_C, tau));
}

export const mackinnonCritical = (nobs: number) => {
  const [c1, c5, c10] = CRIT_2010_C.map((c) => poly(c, 1 / nobs));
  return { '1%': c1, '5%': c5, '10%': c10 };
};

interface OlsFit { ssr: number; nobs: number; k: number; beta0: number; se0: number }

/**
 * OLS by Householder QR (numerically stable; no normal equations). Column 0 is the
 * coefficient of interest; returns its estimate and standard error σ̂·√[(XᵀX)⁻¹]_00.
 */
function ols(y: number[], X: number[][]): OlsFit {
  const n = y.length, k = X[0].length;
  const A = X.map((r) => [...r]), b = [...y];
  for (let j = 0; j < k; j++) {
    let norm = 0; for (let i = j; i < n; i++) norm += A[i][j] ** 2;
    norm = Math.sqrt(norm);
    if (norm === 0) throw new TimeSeriesInputError('ADF: singular regression (collinear regressors)');
    const alpha = A[j][j] > 0 ? -norm : norm;
    const v = new Array(n).fill(0); v[j] = A[j][j] - alpha; for (let i = j + 1; i < n; i++) v[i] = A[i][j];
    const vv = v.reduce((s, x, i) => (i >= j ? s + x * x : s), 0);
    if (vv === 0) continue;
    for (let c = j; c < k; c++) { let s = 0; for (let i = j; i < n; i++) s += v[i] * A[i][c]; s = (2 * s) / vv; for (let i = j; i < n; i++) A[i][c] -= s * v[i]; }
    let s = 0; for (let i = j; i < n; i++) s += v[i] * b[i]; s = (2 * s) / vv; for (let i = j; i < n; i++) b[i] -= s * v[i];
  }
  const R = A.slice(0, k).map((r) => r.slice(0, k));
  if (R.some((r, i) => Math.abs(r[i]) < 1e-12 * Math.abs(R[0][0]))) throw new TimeSeriesInputError('ADF: singular regression (collinear regressors)');
  const beta = new Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < k; j++) s -= R[i][j] * beta[j]; beta[i] = s / R[i][i]; }
  let ssr = 0; for (let i = k; i < n; i++) ssr += b[i] ** 2;
  // Row 0 of R⁻¹ (upper-triangular inverse) gives [(XᵀX)⁻¹]_00 = ‖e_0ᵀ R⁻¹‖².
  const rinv0 = new Array(k).fill(0); rinv0[0] = 1 / R[0][0];
  for (let j = 1; j < k; j++) { let s = 0; for (let i = 0; i < j; i++) s += rinv0[i] * R[i][j]; rinv0[j] = -s / R[j][j]; }
  const sigma2 = ssr / (n - k);
  return { ssr, nobs: n, k, beta0: beta[0], se0: Math.sqrt(sigma2 * rinv0.reduce((s, v) => s + v * v, 0)) };
}

const aic = (f: OlsFit) => f.nobs * (Math.log(2 * Math.PI) + Math.log(f.ssr / f.nobs) + 1) + 2 * f.k;

/** Rows of the ADF regression for p lags, dropping the first `drop` usable rows. Columns: [x_{t−1}, Δx_{t−1..t−p}, 1]. */
function design(x: number[], p: number, drop: number) {
  const dx = x.slice(1).map((v, i) => v - x[i]);
  const y: number[] = [], X: number[][] = [];
  for (let t = drop; t < dx.length; t++) {
    y.push(dx[t]);
    X.push([x[t], ...Array.from({ length: p }, (_, i) => dx[t - 1 - i]), 1]);
  }
  return { y, X };
}

export interface AdfResult {
  statistic: number; pValue: number; usedLag: number; maxLag: number; nobs: number;
  critical: { '1%': number; '5%': number; '10%': number }; icBest: number;
  regression: 'c'; nullHypothesis: 'unit root (γ = 0)';
}

export const schwertMaxLag = (n: number) => Math.min(Math.floor(n / 2) - 2, Math.ceil(12 * (n / 100) ** 0.25));

/** ADF with constant and AIC lag selection. Throws on non-finite, constant or too-short input. */
export function adfTest(x: number[]): AdfResult {
  assertFiniteSeries(x, 10, 'ADF');
  if (isConstant(x)) throw new TimeSeriesInputError('ADF: series is constant');
  const maxLag = schwertMaxLag(x.length);
  if (maxLag < 0) throw new TimeSeriesInputError('ADF: sample too short');
  let best = { ic: Infinity, p: 0 };
  for (let p = 0; p <= maxLag; p++) {
    const { y, X } = design(x, p, maxLag);
    const ic = aic(ols(y, X));
    if (ic < best.ic) best = { ic, p };
  }
  const { y, X } = design(x, best.p, best.p);
  const f = ols(y, X);
  const statistic = f.beta0 / f.se0;
  return { statistic, pValue: mackinnonPValue(statistic), usedLag: best.p, maxLag, nobs: f.nobs, critical: mackinnonCritical(f.nobs), icBest: best.ic, regression: 'c', nullHypothesis: 'unit root (γ = 0)' };
}
