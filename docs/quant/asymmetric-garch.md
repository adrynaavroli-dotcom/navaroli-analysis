# VOL-004 — GJR-GARCH(1,1,1) (asymmetric volatility, in-sample estimation)

Implementation: `src/lib/volatility/gjr-garch.ts` · Tests: `src/lib/volatility/__tests__/gjr-garch.test.ts` ·
Benchmark: `validation/python/benchmark_vol004.py` → `src/lib/validation/fixtures/vol004-benchmark.json` ·
Runner: `bun validation/run-vol004.ts` → `src/lib/validation/evidence/vol004-results.json`.

## Mathematical specification
```text
r_t = μ + ε_t,   ε_t = √h_t z_t,   z_t ~ N(0,1)
h_t = ω + (α + γ·I[ε_{t−1} < 0]) ε²_{t−1} + β h_{t−1}
```
- The indicator acts on the innovation ε_{t−1} = r_{t−1} − μ, not the raw return; ε = 0 is non-negative.
- News impact: α for ε ≥ 0, α+γ for ε < 0.
- Persistence ρ = α + β + γ/2 (E[I·z²] = ½ for symmetric z); h̄ = ω/(1−ρ) if ρ < 1, else undefined.
- Admissible region (arch 8.0.0 `GARCH.constraints()`): ω > 0, α ≥ 0, α+γ ≥ 0, β ≥ 0, ρ < 1.
  **γ may be negative** (design decision D1-A): the estimator is not biased toward a leverage effect.
- γ = 0 reduces to VOL-003 (tested: recursion equal within 1e-14 relative).

## Software conventions (match arch 8.0.0)
| Item | Convention |
| --- | --- |
| arch call | `arch_model(y, mean="Constant", vol="GARCH", p=1, o=1, q=1, power=2, dist="normal", rescale=False)` |
| Parameter order | `[mu, omega, alpha[1], gamma[1], beta[1]]` |
| Backcast b | Same as VOL-003 (reused): Σ w_i ê_i², i < min(75,n), w ∝ 0.94^i, ê = y − ȳ; fixed during estimation |
| t = 0 | **h_0 = ω + (α + γ/2 + β)·b** — differs from VOL-003; arch uses 0.5·backcast for the asymmetric term |
| Variance bounds | Same as VOL-003 (reused); reported hits expected 0 |
| Units | Estimation on y = 100·r; μ/100, ω/10⁴, h/10⁴, ℓ_r = ℓ_y + n·ln100 |
| k | 5 → AIC = −2ℓ + 10, BIC = −2ℓ + 5 ln n |

## Optimizer
Deterministic Nelder–Mead (`src/lib/optim/`) on a feasible transform: ρ = logistic(θ2), ω = e^{θ1},
shares s = softmax(θ3, θ4, 0) of the three non-negative parts ρ = α/2 + (α+γ)/2 + β, so α = 2s1ρ,
α+γ = 2s2ρ, β = s3ρ. Starts: the project's deterministic multi-start grid, which uses the grid VALUES of
arch v8.0.0 `GARCH.starting_values` (α, γ ∈ {0.01,0.05,0.1,0.2}, ρ ∈ {0.5,0.7,0.9,0.98}) but is not
identical to it: β ≤ 0 points are skipped, the best 3 (arch: best 1) are refined, and the VOL-003 optimum
(γ = 1e-6) is an extra seed. Source: https://github.com/bashtage/arch/blob/v8.0.0/arch/univariate/volatility.py.

Nested-likelihood safeguard: starts alone do not guarantee ℓ_GJR ≥ ℓ_GARCH. After optimization the converged
VOL-003 solution is evaluated exactly as a GJR candidate with γ = 0 (same returns, backcast, bounds, units and
Gaussian likelihood; with γ = 0 the GJR recursion equals VOL-003's, including t = 0). The valid candidate with
the higher likelihood is selected (ties keep the optimizer); `selectedCandidate` records which. If the optimizer
fails but the nested candidate is valid, the nested candidate is reported; if neither is valid the status is
NOT_CONVERGED. This is a numerical safeguard, not a statistical claim.
Exact α = 0, α+γ = 0, β = 0, ρ = 1 are unattainable → flagged near-boundary; γ = 0 alone is not a boundary.
|γ| < 1e-6 is reported as "same as GARCH(1,1)" (an interior point, never forced positive).
Non-convergence → no values displayed.

## Validation (synthetic data only)
Seed 20261030; values chosen to produce clearly asymmetric shocks, not calibrated to any market:
`gjr_asymmetric_n2000` (μ=0.05, ω=0.02, α=0.03, γ=0.12, β=0.88, y units) and `gjr_true_gamma0_n800` (γ = 0).
Fixed-parameter sets include γ = −0.05 to pin the indicator convention.

| Check | Tolerance (fixed before comparison) | Result 2026-10-30 |
| --- | --- | --- |
| Backcast / bounds | 1e-9 rel | ≤ 7.6e-16 rel |
| Fixed-parameter h path, ℓ | 1e-10 rel | ≤ 7.2e-16 rel |
| Fitted ℓ | ℓ_TS ≥ ℓ_arch − 1e-4 | Δℓ_y = +3.6e-11, +6.1e-12 |
| Fitted parameters (interior arch optimum) | 0.05·SE | ≤ 6.8e-6 SE |
| AIC / BIC | 2e-4 abs | ≤ 7.3e-11 |
| Recovery (single sample) | 3 SE | max 1.56 SE |

The runner passed 23/23 checks. On the γ = 0 sample both arch and this engine estimate γ̂ = −0.041, which is
negative; this illustrates why γ ≥ 0 was not imposed.

Reference lifecycle: the fixture is the approved reference. The Python script refuses to overwrite it without
`--update "<reason>"`. The runner only reads the fixture, and writes evidence only when every check passes.

Not applicable: out-of-sample or forecast evaluation (VOL-005 is separate and does not include GJR);
significance tests for γ (no standard errors in-app); parameter recovery on observed data (no true values).

## UI (`/volatility`)
The GJR card is split into an "In-sample fitted variance" section and a "Next-period (one-step) variance"
section. It also shows ΔAIC vs GARCH(1,1), labelled as in-sample information only. The fitted model also
appears as a row in the in-sample comparison table.

## Limitations
- Gaussian QMLE under fat tails.
- No standard errors.
- Parameters are fitted on the full sample.
- Synthetic benchmark only.
- No claim of forecasting or statistical superiority.
- Academic source not yet verified.

## Reproduce
```bash
python -m pip install -r validation/python/requirements-vol004.txt
python validation/python/benchmark_vol004.py --update "<reason>"   # only to deliberately replace the approved reference
bun validation/run-vol004.ts
bunx vitest run src/lib/volatility/__tests__/gjr-garch.test.ts
```
