/**
 * Global Minimum Variance (GMV) portfolio — POR-001.
 * Spec: docs/quant/minimum-variance.md
 *
 * Mathematical model
 *   Unconstrained (closed form):  min_w wᵀΣw s.t. 1ᵀw = 1
 *     → w* = Σ⁻¹1 / (1ᵀΣ⁻¹1),  σ²_p = 1 / (1ᵀΣ⁻¹1)
 *     Solved as the linear system Σx = 1 via Cholesky — Σ⁻¹ is never formed.
 *   Long-only with per-asset cap:  min_w ½wᵀΣw s.t. 1ᵀw = 1, 0 ≤ w_i ≤ w_max
 *     Convex QP without closed form, solved with a primal active-set method
 *     (Nocedal & Wright, Alg. 16.3) on the KKT system, with Bland's rule
 *     (smallest index on ties) against cycling. Deterministic: no randomness,
 *     no penalty approximations — feasibility and optimality are exact up to
 *     the stated tolerances.
 *
 * Failure behaviour is explicit: a singular / non-PD covariance, an infeasible
 * budget (w_max < 1/N) or a non-converged active-set loop return a status with
 * NO weights — never a silently regularized or half-converged solution.
 * Ill-conditioning is reported (conditionNumber) but not "fixed": estimation-
 * error reduction via shrinkage is COR-004, out of scope here.
 */
import type { Matrix } from '../correlation';

export type MinVarianceStatus = 'OK' | 'SINGULAR' | 'INFEASIBLE' | 'NOT_CONVERGED' | 'INVALID_INPUT';

export interface MinVarianceResult {
  status: MinVarianceStatus;
  method: 'closed-form' | 'active-set';
  /** Optimal weights (sum to 1) — only when status is OK. */
  weights: number[] | null;
  /** Daily portfolio variance wᵀΣw — only when status is OK. */
  variance: number | null;
  /** Diagnostic λmax/λmin of Σ (power / inverse iteration, 200 steps). */
  conditionNumber: number | null;
  /** Active-set iterations (0 for the closed form). */
  iterations: number;
  /** Largest KKT violation at the returned solution (active-set only). */
  kktResidual: number | null;
}

/** Direction-norm tolerance declaring the active-set subproblem solved. */
const DIR_TOL = 1e-12;
/** Multiplier-violation tolerance for the KKT optimality check. */
const KKT_TOL = 1e-10;
/** Pivot below this in the KKT solve is treated as singular. */
const PIVOT_TOL = 1e-14;

function validate(S: Matrix): string | null {
  const n = S.length;
  if (n < 2) return 'Need at least 2 assets';
  for (const row of S) {
    if (row.length !== n) return 'Covariance matrix must be square';
    for (const v of row) if (!Number.isFinite(v)) return 'Covariance matrix contains non-finite values';
  }
  return null;
}

/** Cholesky L of a symmetric PD matrix (L·Lᵀ = S); null if S is not positive definite. */
export function cholesky(S: Matrix): Matrix | null {
  const n = S.length;
  const L: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = S[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (!(s > 0) || !Number.isFinite(s)) return null;
        L[i][j] = Math.sqrt(s);
      } else L[i][j] = s / L[j][j];
    }
  }
  return L;
}

/** Solve S·x = b given L = chol(S): forward L·y = b, then back Lᵀ·x = y. */
function cholSolve(L: Matrix, b: number[]): number[] {
  const n = L.length;
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

/** Condition-number diagnostic: λmax by power iteration, λmin by inverse iteration (Cholesky solves). */
function conditionNumber(L: Matrix, n: number): number {
  const norm = (v: number[]) => Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  let v = new Array(n).fill(1 / Math.sqrt(n));
  let lamMax = 0;
  for (let it = 0; it < 200; it++) {
    const w = v.map((_, i) => L[i].reduce((a, lik, k) => a + lik * (i >= k ? v[k] : 0), 0));
    // (L·v) then (Lᵀ·(L·v)) = Σ·v without forming Σ again
    const Sv = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k <= i; k++) Sv[i] += L[i][k] * v[k];
    const w2 = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = i; k < n; k++) w2[i] += L[k][i] * Sv[k];
    void w;
    const nv = norm(w2);
    if (nv === 0) return Infinity;
    lamMax = w2.reduce((a, x, i) => a + x * v[i], 0) / 1; // Rayleigh quotient vᵀΣv with ‖v‖=1
    v = w2.map((x) => x / nv);
  }
  let u = new Array(n).fill(1 / Math.sqrt(n));
  let lamMin = 0;
  for (let it = 0; it < 200; it++) {
    const x = cholSolve(L, u);
    const nx = norm(x);
    if (!Number.isFinite(nx) || nx === 0) return Infinity;
    lamMin = 1 / (nx * nx) ** 0.5 / nx; // placeholder, replaced below
    u = x.map((z) => z / nx);
  }
  // Rayleigh quotients with unit vectors
  const rayleigh = (vec: number[]) => {
    const Sv = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k <= i; k++) { Sv[i] += L[i][k] * vec[k]; if (k < i) Sv[k] += L[i][k] * vec[i]; }
    return vec.reduce((a, x, i) => a + x * Sv[i], 0);
  };
  lamMax = rayleigh(v);
  lamMin = rayleigh(u);
  return lamMin > 0 ? lamMax / lamMin : Infinity;
}

/** Solve a small dense linear system A·x = b by Gaussian elimination with partial pivoting. */
function denseSolve(A: Matrix, b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < PIVOT_TOL) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f !== 0) for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((r, i) => r[n] / M[i][i]);
}

const fail = (status: MinVarianceStatus, method: MinVarianceResult['method'], conditionNumber: number | null, iterations = 0): MinVarianceResult =>
  ({ status, method, weights: null, variance: null, conditionNumber, iterations, kktResidual: null });

/**
 * Unconstrained GMV: w* = Σ⁻¹1 / (1ᵀΣ⁻¹1) via the Cholesky solve Σx = 1.
 * Short sales are allowed; use gmvLongOnly for the constrained problem.
 */
export function gmvClosedForm(S: Matrix): MinVarianceResult {
  const err = validate(S);
  if (err) return fail('INVALID_INPUT', 'closed-form', null);
  const n = S.length;
  const L = cholesky(S);
  if (!L) return fail('SINGULAR', 'closed-form', null);
  const cond = conditionNumber(L, n);
  const x = cholSolve(L, new Array(n).fill(1));
  const s = x.reduce((a, v) => a + v, 0);
  if (!(s > 0) || !Number.isFinite(s)) return fail('SINGULAR', 'closed-form', cond);
  return { status: 'OK', method: 'closed-form', weights: x.map((v) => v / s), variance: 1 / s, conditionNumber: cond, iterations: 0, kktResidual: 0 };
}

/**
 * Long-only GMV with per-asset cap: min ½wᵀΣw s.t. 1ᵀw = 1, 0 ≤ w_i ≤ maxWeight.
 *
 * Primal active-set method. Invariants: the iterate is always feasible; each
 * iteration either moves to the subproblem minimizer (and then possibly
 * releases a blocking constraint) or hits a new bound. Bland's rule (smallest
 * index) on every tie prevents cycling, so the loop terminates.
 *
 * KKT (L = ½wᵀΣw − λ(1ᵀw−1) − μᵀw + νᵀ(w−u), μ,ν ≥ 0):
 *   free i:        (Σw)_i = λ
 *   at lower bound: (Σw)_i ≥ λ
 *   at upper bound: (Σw)_i ≤ λ
 */
export function gmvLongOnly(S: Matrix, maxWeight = 1): MinVarianceResult {
  const err = validate(S);
  if (err) return fail('INVALID_INPUT', 'active-set', null);
  const n = S.length;
  if (!(maxWeight > 0) || !Number.isFinite(maxWeight)) return fail('INVALID_INPUT', 'active-set', null);
  if (maxWeight < 1 / n) return fail('INFEASIBLE', 'active-set', null); // budget 1 unreachable
  const L = cholesky(S);
  if (!L) return fail('SINGULAR', 'active-set', null);
  const cond = conditionNumber(L, n);

  const grad = (w: number[]) => {
    const g = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) g[i] += S[i][j] * w[j];
    return g;
  };

  // fixed[i]: 0 = free, 1 = at lower bound 0, 2 = at upper bound maxWeight
  const w = new Array(n).fill(1 / n);
  const fixed = new Array(n).fill(0);
  const maxIter = 40 * n;

  for (let iter = 0; iter < maxIter; iter++) {
    const F: number[] = [];
    for (let i = 0; i < n; i++) if (fixed[i] === 0) F.push(i);
    const m = F.length;

    if (m === 0) {
      // All weights fixed: feasible only if the budget is met exactly.
      const budget = w.reduce((a, v) => a + v, 0);
      if (Math.abs(budget - 1) > 1e-9) return fail('INFEASIBLE', 'active-set', cond, iter);
      // KKT at a vertex: need max_{upper} g ≤ min_{lower} g for some λ to exist.
      const g = grad(w);
      let lo = -Infinity, hi = Infinity;
      for (let i = 0; i < n; i++) {
        if (fixed[i] === 1) lo = Math.max(lo, -Infinity), hi = Math.min(hi, g[i]); // lower: g_i ≥ λ
        else hi = Math.min(hi, g[i]), lo = Math.max(lo, g[i]); // upper: g_i ≤ λ
      }
      if (lo <= hi + KKT_TOL) {
        return { status: 'OK', method: 'active-set', weights: w.slice(), variance: quad(w, S), conditionNumber: cond, iterations: iter, kktResidual: Math.max(0, lo - hi) };
      }
      return fail('NOT_CONVERGED', 'active-set', cond, iter);
    }

    // Equality-constrained subproblem over the free set F:
    //   min ½ w_Fᵀ Σ_FF w_F + (Σ_FA w_A)ᵀ w_F  s.t. 1ᵀw_F = 1 − 1ᵀw_A
    // KKT system: [Σ_FF, −1; 1ᵀ, 0] [w_F; λ] = [−Σ_FA w_A; b]
    let b = 1;
    for (let i = 0; i < n; i++) if (fixed[i] !== 0) b -= w[i];
    const A: Matrix = Array.from({ length: m + 1 }, () => new Array(m + 1).fill(0));
    const rhs = new Array(m + 1).fill(0);
    for (let a = 0; a < m; a++) {
      for (let c = 0; c < m; c++) A[a][c] = S[F[a]][F[c]];
      A[a][m] = -1;
      A[m][a] = 1;
      let cross = 0;
      for (let i = 0; i < n; i++) if (fixed[i] !== 0) cross += S[F[a]][i] * w[i];
      rhs[a] = -cross;
    }
    rhs[m] = b;
    const sol = denseSolve(A, rhs);
    if (!sol) return fail('SINGULAR', 'active-set', cond, iter);
    const lambda = sol[m];

    const d = new Array(n).fill(0);
    let dirNorm = 0;
    for (let a = 0; a < m; a++) { d[F[a]] = sol[a] - w[F[a]]; dirNorm = Math.max(dirNorm, Math.abs(d[F[a]])); }

    if (dirNorm <= DIR_TOL) {
      // Subproblem minimizer reached: check multipliers of the fixed constraints.
      const g = grad(w);
      let worst = KKT_TOL, worstIdx = -1;
      for (let i = 0; i < n; i++) {
        if (fixed[i] === 1) { // need g_i ≥ λ
          const viol = lambda - g[i];
          if (viol > worst) { worst = viol; worstIdx = i; }
        } else if (fixed[i] === 2) { // need g_i ≤ λ
          const viol = g[i] - lambda;
          if (viol > worst) { worst = viol; worstIdx = i; }
        }
      }
      if (worstIdx === -1) {
        const budgetErr = Math.abs(w.reduce((a, v) => a + v, 0) - 1);
        return { status: 'OK', method: 'active-set', weights: w.slice(), variance: quad(w, S), conditionNumber: cond, iterations: iter, kktResidual: Math.max(budgetErr, 0) };
      }
      fixed[worstIdx] = 0; // release the most violated constraint
      continue;
    }

    // Line search to the nearest bound (Bland: smallest index wins ties).
    let alpha = 1, blockIdx = -1, blockType = 0;
    for (const i of F) {
      if (d[i] < 0) {
        const ai = -w[i] / d[i];
        if (ai < alpha - 1e-18 || (Math.abs(ai - alpha) <= 1e-18 && (blockIdx === -1 || i < blockIdx))) { alpha = ai; blockIdx = i; blockType = 1; }
      } else if (d[i] > 0) {
        const ai = (maxWeight - w[i]) / d[i];
        if (ai < alpha - 1e-18 || (Math.abs(ai - alpha) <= 1e-18 && (blockIdx === -1 || i < blockIdx))) { alpha = ai; blockIdx = i; blockType = 2; }
      }
    }
    for (const i of F) w[i] += alpha * d[i];
    if (blockIdx !== -1 && alpha < 1) {
      w[blockIdx] = blockType === 1 ? 0 : maxWeight;
      fixed[blockIdx] = blockType;
    }
  }
  return fail('NOT_CONVERGED', 'active-set', cond, maxIter);
}

const quad = (w: number[], S: Matrix) => w.reduce((a, wi, i) => a + wi * S[i].reduce((b, sij, j) => b + sij * w[j], 0), 0);
