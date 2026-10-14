/**
 * Deterministic Nelder–Mead simplex minimizer (Lagarias et al. 1998 coefficients:
 * reflection 1, expansion 2, contraction ½, shrink ½). Derivative-free, so it is
 * robust for likelihoods whose analytic gradients we do not maintain.
 *
 * Convergence (native NM criteria, both required):
 *   f-spread: max f − min f ≤ fTol·(|f_best| + 1e-12)
 *   x-spread: max_i ‖x_i − x_best‖_∞ ≤ xTol
 * Non-finite objective values are treated as +∞ (rejected points) and counted.
 * Stops with converged=false when maxIter or maxEval is reached.
 */
export interface NelderMeadOptions { step?: number; fTol?: number; xTol?: number; maxIter?: number; maxEval?: number }
export interface NelderMeadResult { x: number[]; f: number; iterations: number; evaluations: number; converged: boolean; nonFinite: number; reason: string }

export function nelderMead(f: (x: number[]) => number, x0: number[], o: NelderMeadOptions = {}): NelderMeadResult {
  const { step = 0.1, fTol = 1e-12, xTol = 1e-9, maxIter = 20000, maxEval = 40000 } = o;
  const n = x0.length;
  let evals = 0, nonFinite = 0;
  const F = (x: number[]) => { evals++; const v = f(x); if (!Number.isFinite(v)) { nonFinite++; return Infinity; } return v; };
  let S = [x0.slice(), ...x0.map((_, i) => x0.map((v, j) => (j === i ? v + (v !== 0 ? step * Math.abs(v) : step) : v)))];
  let fs = S.map(F);
  if (!Number.isFinite(fs[0])) return { x: x0, f: Infinity, iterations: 0, evaluations: evals, converged: false, nonFinite, reason: 'Objective not finite at starting point' };
  let it = 0;
  const comb = (a: number[], b: number[], t: number) => a.map((v, i) => v + t * (b[i] - v));
  while (it < maxIter && evals < maxEval) {
    const idx = fs.map((_, i) => i).sort((a, b) => fs[a] - fs[b]);
    S = idx.map((i) => S[i]); fs = idx.map((i) => fs[i]);
    const fSpread = fs[n] - fs[0];
    const xSpread = Math.max(...S.slice(1).map((p) => Math.max(...p.map((v, j) => Math.abs(v - S[0][j])))));
    if (Number.isFinite(fSpread) && fSpread <= fTol * (Math.abs(fs[0]) + 1e-12) && xSpread <= xTol)
      return { x: S[0], f: fs[0], iterations: it, evaluations: evals, converged: true, nonFinite, reason: 'Simplex f- and x-spread below tolerance' };
    it++;
    const c = S.slice(0, n).reduce((acc, p) => acc.map((v, j) => v + p[j] / n), new Array(n).fill(0));
    const xr = comb(c, S[n], -1), fr = F(xr);
    if (fr < fs[0]) {
      const xe = comb(c, S[n], -2), fe = F(xe);
      if (fe < fr) { S[n] = xe; fs[n] = fe; } else { S[n] = xr; fs[n] = fr; }
    } else if (fr < fs[n - 1]) { S[n] = xr; fs[n] = fr; }
    else {
      const outside = fr < fs[n];
      const xc = comb(c, outside ? xr : S[n], 0.5), fc = F(xc);
      if (fc < (outside ? fr : fs[n])) { S[n] = xc; fs[n] = fc; }
      else { for (let i = 1; i <= n; i++) { S[i] = comb(S[0], S[i], 0.5); fs[i] = F(S[i]); } }
    }
  }
  const b = fs.indexOf(Math.min(...fs));
  return { x: S[b], f: fs[b], iterations: it, evaluations: evals, converged: false, nonFinite, reason: evals >= maxEval ? 'Maximum evaluations reached' : 'Maximum iterations reached' };
}
