/**
 * Special functions needed for p-values (STA-002).
 *
 * Why not the Abramowitz–Stegun normal CDF used in the options engine: its ~1e-7
 * error is fine for pricing but too coarse to benchmark p-values at 1e-10. Both
 * Φ and the χ² survival function are expressed through the regularized incomplete
 * gamma function, evaluated by series (x < a+1) or Lentz continued fraction
 * (Numerical Recipes §6.2), converged to machine precision.
 */

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

/** ln Γ(z), z > 0 (Lanczos g=7, n=9; relative error ≈ 1e-15). */
export function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = LANCZOS[0];
  for (let i = 1; i < 9; i++) x += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

const EPS = 1e-16, MAX_ITER = 10000, TINY = 1e-300;

function gammaPSeries(a: number, x: number): number {
  let sum = 1 / a, term = sum;
  for (let n = 1; n < MAX_ITER; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * EPS) break; }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function gammaQContinuedFraction(a: number, x: number): number {
  let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
  for (let i = 1; i < MAX_ITER; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Regularized upper incomplete gamma Q(a, x) = Γ(a, x)/Γ(a). */
export function gammaQ(a: number, x: number): number {
  if (!(a > 0) || x < 0) throw new Error(`gammaQ: invalid arguments a=${a}, x=${x}`);
  if (x === 0) return 1;
  return x < a + 1 ? 1 - gammaPSeries(a, x) : gammaQContinuedFraction(a, x);
}
export const gammaP = (a: number, x: number) => (x === 0 ? 0 : x < a + 1 ? gammaPSeries(a, x) : 1 - gammaQContinuedFraction(a, x));

/** P(χ²_df > x). */
export const chiSquareSurvival = (x: number, df: number) => (x <= 0 ? 1 : gammaQ(df / 2, x / 2));

/** Standard normal CDF Φ(z) = ½·erfc(−z/√2), via the incomplete gamma (erf(u) = P(½, u²)). */
export function normalCdf(z: number): number {
  const u = (z * z) / 2;
  // Use the tail function on the small side to avoid cancellation (1 − ~1).
  return z < 0 ? 0.5 * gammaQ(0.5, u) : 1 - 0.5 * gammaQ(0.5, u);
}
