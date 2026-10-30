# VOL-004 — Model Design Review: GJR-GARCH(1,1,1)

Design card only. No files changed, no implementation started. Approval required (new model, shared module `garch.ts`).

## Main finding before approval
The pinned reference does not use the brief's restriction `γ ≥ 0`. In `arch==8.0.0`, `GARCH.constraints()` imposes `ω>0, α≥0, α+γ≥0, β≥0, α+γ/2+β<1`, and `bounds()` gives `γ ∈ [−1, 2]`. So **arch allows a negative γ** (source read: `arch/univariate/volatility.py` v8.0.0, lines 1091–1124). This must be decided (see Open decision D1). Everything else maps cleanly.

## 1. Objective and scope
- Estimate an asymmetric (leverage-effect) conditional variance in-sample on daily log returns, as the nested extension of VOL-003.
- In scope: estimator, fitted variance path, persistence, unconditional variance, news-impact coefficients, one-step-ahead variance, nested comparison with VOL-003 shown for information.
- Out of scope: EGARCH, Student-t errors, adding GJR to VOL-005, multi-step forecasts, OOS evaluation, significance tests or standard errors.

## 2. Dependencies and reuse
- VOL-003 `src/lib/volatility/garch.ts`: reuse `GARCH_SCALE`, `garchBackcast`, `garchVarianceBounds`, the bound-handling rule, `NEAR_BOUNDARY`, the input checks and the fitting pattern. These are unchanged because arch shares the backcast and variance-bound code for `o=1` with `power=2`.
- `src/lib/optim/nelder-mead.ts`: reuse unchanged.
- `src/lib/volatility/types.ts` `VolatilityModel` and `models.ts` (in-sample comparison list only).
- Returns Engine `src/lib/returns/` is the only source of returns. `src/lib/validation/` provides plans, `compareNumeric` and evidence.
- Benchmark template: `validation/python/benchmark_vol003.py`, `validation/run-vol003.ts`, `requirements-vol003.txt`.

## 3. Mathematical specification
```text
r_t = μ + ε_t,  ε_t = √h_t · z_t,  z_t ~ N(0,1)
h_t = ω + (α + γ·I[ε_{t−1} < 0]) ε²_{t−1} + β h_{t−1}
```
- The indicator applies to the innovation `ε_{t−1} = r_{t−1} − μ`, evaluated at the current μ. It does not apply to the raw return. `ε = 0` counts as non-negative, the same as arch's `sign(ε) < 0`.
- The coefficient on `ε²` is α for a non-negative shock and α+γ for a negative one.
- Persistence is `ρ = α + β + γ/2`, because `E[I·z²] = 1/2` for symmetric z.
- Covariance-stationary when ρ < 1. Unconditional variance is `h̄ = ω/(1−ρ)`, otherwise null.
- Admissible region (under D1-A, arch-compatible): `ω>0, α≥0, α+γ≥0, β≥0, ρ<1`.
- When γ=0 the model reduces exactly to VOL-003.
- No sign or significance of γ is assumed.

## 4. Optimizer parameterization (5 parameters, feasible, no clipping)
The VOL-003 transform cannot simply be extended by adding γ, because the persistence budget changes to α+β+γ/2. Proposal for D1-A:
```text
ω = e^{θ1};  ρ = logistic(θ2)
share weights: wα = e^{θ3}, wδ = e^{θ4}, wβ = 1   (softmax over 3 components)
a = ρ·wα/Σw,  d = ρ·wδ/Σw,  β = ρ·1/Σw
δ := α+γ ≥ 0  →  α + β + γ/2 = α/2 + δ/2 + β  → set α = 2a·..., see below
```
Simpler exact form: write `ρ = α/2 + (α+γ)/2 + β`, which has three non-negative parts. A softmax over these parts times ρ gives `α = 2·s1·ρ`, `α+γ = 2·s2·ρ` and `β = s3·ρ`. All constraints then hold for every real θ. Under D1-B (γ ≥ 0), use instead the parts `α, γ/2, β` with softmax shares.
- Boundary γ=0 (under D1-B) and the arch boundary α+γ=0 (under D1-A) cannot be reached exactly. The fit is flagged `CONVERGED_NEAR_BOUNDARY` when |γ| < 1e-6, α < 1e-6, α+γ < 1e-6, β < 1e-6 or ρ > 0.999. γ is never forced to be positive.
- Start grid: arch's own grid (α, γ ∈ {0.01, 0.05, 0.1, 0.2}, total ∈ {0.5, 0.7, 0.9, 0.98}, ω = (1−total)·mean ε²). Keep the best 3 starts, then restart Nelder–Mead the same way as VOL-003.
- Extra starts at γ≈0 come from the converged VOL-003 parameters. This guarantees `ℓ_GJR ≥ ℓ_GARCH − tolerance`, and a failure to meet it is reported as an estimation defect.
- `NOT_CONVERGED` produces no forecast and no UI values, the same as VOL-003.

## 5. Units and counts
- Estimation runs on `y = 100·r`. Conversion back: μ/100, ω/1e4, h/1e4, `ℓ_r = ℓ_y + n·ln100`. α, β, γ and ρ have no units.
- k = 5 (μ, ω, α, γ, β). `AIC = −2ℓ + 10`, `BIC = −2ℓ + 5·ln n`.
- Annualization is √252, display only.

## 6. Initialization, backcast and bounds (arch 8.0.0 checks)
- Backcast b: the same weighted mean of the first min(75, n) values of ε̂² (weights 0.94^i, residuals from the sample mean). It is held fixed during estimation. Reuse it.
- **t = 0 differs from VOL-003:** arch uses `h_0 = ω + (α + γ/2 + β)·b` (the asymmetric term takes `0.5·backcast`; source: `garch_recursion_python`, `recursions_python.py` v8.0.0). Copying the VOL-003 `h_0` would be wrong whenever γ≠0.
- Variance bounds are identical (`variance_bounds` is shared). Reuse them, with the same lower clamp and log-upper rule.
- The likelihood includes every t, as in VOL-003.
- arch uses `rescale=False`, so its scaling matches ours when the benchmark is fed `y = 100·r`.
- Parameter order in arch: `[mu, omega, alpha[1], gamma[1], beta[1]]`. The mapping is explicit in the fixture.
- Convergence: arch uses SLSQP, we use Nelder–Mead. Only optimum-level agreement is compared, not the path.

## 7. Input contract
- Input is a finite `number[]` of log returns from the Returns Engine (decimal), with at least 100 observations, the same as GARCH_MIN_OBS.
- Non-finite, too-short or constant input raises a typed `GjrInputError`. No imputation.
- The UI reuses the existing dataset (live or imported) and its provenance.

## 8. Independent benchmark
- Synthetic process with fixed seed (numpy `default_rng(20261030)`), n = 2000.
- True parameters, scaled ×100: μ=0.05, ω=0.02, α=0.03, γ=0.12, β=0.88, giving ρ=0.97.
- Stated plainly: these are values chosen by me so the shocks are clearly asymmetric. They are not calibrated to any market.
- A second, short fixture uses true γ=0 to test the boundary.
- Reference generation: `benchmark_vol004.py` uses `arch_model(y, mean="Constant", vol="GARCH", p=1, o=1, q=1, power=2, dist="normal", rescale=False)` and is pinned in `requirements-vol004.txt` (arch 8.0.0, numpy, scipy).
- It records backcast, variance bounds, the variance path and ℓ at fixed parameters, the fitted parameters with standard errors, ℓ, AIC/BIC and the environment.
- You review the initial fixture before it is committed. The runner reads it only, compares before writing run evidence, and never regenerates the reference.

Tolerances, fixed now and justified by the operation:

| Quantity | Tolerance | Reason |
| --- | --- | --- |
| backcast, bounds | 1e-9 rel | same closed-form sums |
| h path and ℓ at **fixed** params | 1e-10 rel | deterministic recursion; only the order of floating-point operations differs |
| fitted ℓ | ℓ_TS ≥ ℓ_arch − 1e-4 | different optimizers; ours must be as good as arch's or better |
| fitted params | within 0.05·SE (arch SE) | these differences come from the optimizer, not the formula; VOL-003 achieved 3e-6 SE |
| AIC/BIC | follows from ℓ with the exact k | — |
| parameter recovery | within 3 SE of true | a sanity check, not accuracy |

The synthetic fixture is kept separate from the observed AAPL data. AAPL is used only for a UI smoke test, with no reference claim.

## 9. Tests (Vitest, deterministic)
- Hand-computed recursion over 3 steps with mixed-sign ε, checking the t=0 term `(α+γ/2+β)·b`.
- Identity: with γ=0 the variance path and ℓ equal VOL-003's `garchRecursion` exactly (at most 1e-14).
- Transform round-trip, feasibility for random θ, and the near-boundary flags.
- Persistence and h̄ formulas; h̄ is null when ρ ≥ 1.
- Indicator on ε (not on r), and ε = 0 counts as non-negative.
- Unit conversion: the fit scaled ×100 gives the same result as the fit at ×1.
- Errors for non-finite, short and constant input; the not-converged path gives no values.
- The nested check ℓ_GJR ≥ ℓ_GARCH.
- Regression: the VOL-003 tests and the run-vol003 37/37 checks stay unchanged. The VOL-005 reproduction (28 checks) and its evidence files stay byte-identical.

Not applicable (reasons):
- OOS or forecast gate: belongs to VOL-005.
- Ljung–Box significance as a gate: residual diagnostics are informational only, as in VOL-003.
- Recovery on real data: there are no true parameters to recover.

## 10. UI
- A GJR card in `/volatility` next to the GARCH card, plus a row in the in-sample comparison table.
- It shows μ, ω, α, γ, β (annotated as α for good news and α+γ for bad news), ρ, h̄, ℓ, AIC/BIC, convergence status and near-boundary flags.
- It also shows ΔAIC versus GARCH, labelled "in-sample information only — no significance test".
- Section headings read "In-sample fitted variance" and "Next-period (one-step) variance". No multi-step or OOS figures.
- Clear empty, error and not-converged states. Results are cleared when the dataset changes.

## 11. Documentation, matrix and closure
- New doc `docs/quant/volatility-asymmetric-garch.md` (rendered at `/quant/volatility/asymmetric-garch`), covering formulas, arch mapping, t=0 convention, transform, tolerances, reproduction commands and limitations.
- Layers: Academic Knowledge stays PLANNED; the other five are set as evidence supports them.
- Close as COMPLETED only when all of the following hold:
  - every unit test passes
  - the runner passes against the approved fixture
  - the VOL-003 and VOL-005 regressions are unchanged
  - Quality checks pass (TypeScript, Vitest, build) on the recorded commit SHA
  - a browser smoke test on AAPL passes
- The matrix text says "GJR-GARCH" (EGARCH stays planned under a separate note).

## 12. Expected files
- Create:
  - `src/lib/volatility/gjr-garch.ts` (keeps validated `garch.ts` untouched; imports its exported helpers)
  - `src/lib/volatility/__tests__/gjr-garch.test.ts`
  - `src/lib/validation/suites/vol004.ts`
  - `validation/python/benchmark_vol004.py`
  - `validation/python/requirements-vol004.txt`
  - `validation/run-vol004.ts`
  - fixture and evidence JSON
  - the doc, and `src/components/volatility/GjrPanel.tsx`
- Edit:
  - `models.ts` (comparison row)
  - `VolatilityAnalytics.tsx` (card)
  - `registry.ts`, the matrix `data.ts` entry
  - `quality-checks.yml` (add the run-vol004 step)
  - `AGENTS.md` (one rule)
- Regression risks: imports from `garch.ts` must stay read-only, the plan-count tests change, and `/volatility` gets slower (target under 300 ms for 1,260 observations, to be measured).

## 13. Open decisions (need your approval)
- **D1 — γ constraint.**
  - (A) arch-compatible: α+γ ≥ 0, γ may be negative. The benchmark is exact and the fit is not biased toward a leverage effect. My recommendation.
  - (B) Your stated γ ≥ 0. arch cannot impose this, so when the arch estimate has γ<0 the parameter benchmark only applies to fixtures where the unconstrained optimum is positive. The fixed-parameter recursion is still fully comparable.
- **D2 — module placement.** Separate file `gjr-garch.ts`, which differs from the AGENTS.md wording "GARCH-family in garch.ts". The alternative is extending `garch.ts`, which touches validated code. I recommend the separate file and updating the AGENTS.md rule.
- **D3 — synthetic true parameters** and tolerances in section 8. Confirm them or give your own.
- **D4 — UI ΔAIC display.** Include it or omit it.

## Sources inspected
- `src/lib/volatility/garch.ts` (header conventions, `fitGarch`, transform, k=4)
- `src/lib/quant-matrix/data.ts` (VOL-004/VOL-005 entries)
- `validation/python/requirements-vol003.txt`, the `validation/` runner list
- `AGENTS.md`
- arch 8.0.0 source, `arch/univariate/volatility.py` (`GARCH.bounds`, `constraints`, `backcast`, `starting_values`) [1](https://github.com/bashtage/arch/blob/main/arch/univariate/volatility.py)
- arch 8.0.0 source, `recursions_python.py` (`garch_recursion_python`) [2](https://github.com/bashtage/arch/blob/master/arch/univariate/recursions_python.py)

**No files changed and no implementation started.**
