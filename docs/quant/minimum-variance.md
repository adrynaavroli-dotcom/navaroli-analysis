# POR-001 — Global Minimum Variance Portfolio

Technical specification for the minimum-variance engine in `src/lib/portfolio/`.
Live module: `/portfolio`. Validation evidence: `/quant/portfolio/minimum-variance`.

## Mathematical model

**Unconstrained (closed form).** min_w wᵀΣw subject to 1ᵀw = 1 has the solution

  w\* = Σ⁻¹1 / (1ᵀΣ⁻¹1),   σ²_p = 1 / (1ᵀΣ⁻¹1)

implemented as the linear system Σx = 1 solved by Cholesky factorization —
the inverse is never formed. If Σ is not positive definite, the factorization
fails and the engine returns `SINGULAR` with no weights.

**Long-only with per-asset cap.** min_w ½wᵀΣw s.t. 1ᵀw = 1, 0 ≤ w_i ≤ w_max is a
convex QP without closed form, solved with a primal active-set method
(Nocedal & Wright, Algorithm 16.3) on the KKT system. The iterate is always
feasible; Bland's rule (smallest index on ties) prevents cycling; the final
solution carries a KKT residual certificate (≤ 1e-10). Feasibility requires
w_max ≥ 1/N, checked up front (`INFEASIBLE` otherwise). Non-convergence within
40·N iterations returns `NOT_CONVERGED` — never a partially converged portfolio.

KKT conditions (L = ½wᵀΣw − λ(1ᵀw−1) − μᵀw + νᵀ(w−u)): free weights satisfy
(Σw)_i = λ; weights at 0 satisfy (Σw)_i ≥ λ; weights at the cap satisfy
(Σw)_i ≤ λ.

**Why minimum variance:** the GMV portfolio is the only mean-variance-optimal
portfolio that does not require expected-return estimates μ, whose estimation
error dominates classical Markowitz allocations. This is a deliberate scope
choice, not an omission.

## Data and conventions

- Input: aligned daily **log returns** from the Returns Engine (DAT-003) only;
  dates are inner-joined across assets, never filled.
- Covariance: sample (COR-001, denominator W−1, trailing window) or EWMA
  (COR-003, λ = 0.94, 20-return seed). The engine accepts any daily covariance
  matrix, so COR-004 shrinkage plugs in later without changes here.
- The sample estimator requires **window > N** (otherwise Σ is singular by
  construction); the UI and engine both enforce this.
- Annualization: variance ×252, volatility ×√252 (`TRADING_DAYS`).
- Ill-conditioned Σ is **reported** (condition number via power/inverse
  iteration, diagnostic only) but never silently regularized — shrinkage is
  COR-004.

## Walk-forward out-of-sample protocol

Non-overlapping blocks of 21 trading days. At origin t the covariance uses
returns ≤ t only (sample: trailing W returns ending at t; EWMA: the ex-ante
estimate at t+1, which uses returns ≤ t). Weights are held over returns
t+1..t+21 and the realized annualized volatility (sample std, n−1, √252) is
measured on that block. Failed origins are recorded with their status and
excluded from the summary means. Turnover is reported (Σ|Δw| between
rebalances) but transaction costs are out of scope (POR-006). Exact
rebalancing to target weights is assumed.

## Validation

- **Unit tests** (`src/lib/portfolio/__tests__/`): hand-computed 2-asset case,
  σ²I → equal weights, cap binding, infeasibility, singularity, KKT residuals,
  determinism, walk-forward timing (no look-ahead) and failure recording.
- **Independent benchmark** (`validation/python/benchmark_por001.py`, numpy
  2.4.3 / scipy 1.18.0, seed 20261031, synthetic SPD matrices incl. a
  near-singular case): closed form vs `numpy.linalg.solve` (weights 1e-10 abs,
  variance 1e-12 rel, condition-aware max(1e-12, κ·1e-15) for ill-conditioned
  cases); constrained vs SLSQP ftol 1e-15 (weights 1e-8 abs, variance 1e-10
  rel, and σ²_TS ≤ σ²_ref + 1e-12). The approved fixture is read-only for the
  runner; regenerating requires `--update "<reason>"`.
- **Observed evidence**: walk-forward on the recorded 4-asset snapshot
  (AAPL/MSFT/SPY/TLT, 501 split-adjusted closes each, 2024-10-31 → 2026-10-30,
  Yahoo Finance, USD; `fixtures/por001-snapshot.json`). The full record lives
  in `evidence/por001-observed.json` and must reproduce exactly (only
  `runtimeMs`/`evaluatedAt` excluded). Passing means the protocol ran
  correctly — it is **not** evidence that GMV beats equal weight.

## Limitations

- GMV minimizes estimated variance only; it ignores expected returns.
- Sample covariance is noisy for small W relative to N; the condition number
  is shown as a diagnostic.
- OOS evidence is descriptive: one 4-asset universe, ~2 years, no significance
  test.
- Correlations are Pearson/linear; EWMA uses a fixed λ.

## Reproducibility

```
python3 validation/python/benchmark_por001.py   # regenerates fixture only with --update "<reason>"
bun validation/run-por001.ts                    # benchmark + observed walk-forward + reproduction
bunx vitest run src/lib/portfolio               # unit tests
```
