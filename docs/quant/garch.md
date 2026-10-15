# GARCH(1,1) — specification (VOL-003)

Code: `src/lib/volatility/garch.ts`, `src/lib/optim/nelder-mead.ts` · Tests: `src/lib/volatility/__tests__/garch.test.ts` · Validation: `src/lib/validation/suites/vol003.ts` (run `bun validation/run-vol003.ts`) · Python reference: `validation/python/benchmark_vol003.py` (env: `validation/python/requirements-vol003.txt`) · Evidence: `src/lib/validation/evidence/vol003-results.json` · UI: `/volatility` (GARCH(1,1) card + comparison table)

## Mathematical model
Input r_t: Returns Engine daily log returns (decimal).

r_t = μ + ε_t, ε_t = √h_t·z_t, z_t ~ N(0,1)
h_t = ω + α ε²_{t−1} + β h_{t−1}, with ω > 0, α ≥ 0, β ≥ 0, α + β < 1.

Log-likelihood: ℓ = −½ Σ_{t=0}^{n−1} (ln 2π + ln h_t + ε_t²/h_t). If z_t is not normal the estimator is QMLE (consistent for the variance parameters, but Gaussian standard errors are not robust). Unconditional variance h̄ = ω/(1−α−β), defined only when α+β < 1. AIC = −2ℓ + 2k, BIC = −2ℓ + k ln n, k = 4.

## Implementation conventions (chosen to match Python `arch` 8.0.0)
- Estimation on y = 100·r for conditioning. Converted back: μ_r = μ_y/100, ω_r = ω_y/10⁴, h_r = h_y/10⁴, ℓ_r = ℓ_y + n ln 100.
- Backcast b = Σ_{i<τ} w_i ê_i² / Σ w_i, τ = min(75, n), w_i = 0.94^i, ê = y − ȳ. Fixed during optimization. h_0 = ω + (α+β)·b.
- Variance bounds (arch `variance_bounds`): numerical safeguards only; the number of active hits is reported (expected 0).
- Feasible parameterization: ω = e^a, α+β = logistic(b), α = (α+β)·logistic(c). No clipping. Exact boundaries are unattainable, so α or β < 10⁻⁶ or α+β > 0.999 → status `CONVERGED_NEAR_BOUNDARY`.
- Optimizer: Nelder–Mead (Lagarias et al. coefficients), deterministic start grid (5 persistence × 4 α-share levels), best 3 starts each followed by one restart. Convergence requires both the f-spread and x-spread criteria. Optimizer failure → `NOT_CONVERGED`; the UI then shows no parameters.
- Inputs: non-finite, constant or fewer than 100 returns → `GarchInputError`.

## In-sample vs next-period volatility
- In-sample path h_0..h_{n−1}: each h_t uses only returns before t, but the parameters are estimated on the full sample. It is a smoothed description, not a real-time forecast.
- Next-period h_n = ω + α ε²_{n−1} + β h_{n−1}: this is what the comparison table shows as "Current". It is a one-step model estimate; its forecast accuracy is **not validated** (VOL-005).

## Validation (synthetic data, seed 20261014)
37 checks against arch 8.0.0: backcast/bounds and fixed-parameter paths/likelihood (rel 1e-12); fitted μ, ω, α, β for interior optima within 0.02 SE; ℓ within 1e-5; AIC/BIC; boundary cases (arch reaches α = 0 exactly): our ℓ ≥ ℓ_arch − 1e-6 and the near-boundary flag is set; parameter recovery over 6 samples within 4 SE; scaling identities; hand-calculated case; no look-ahead. Residual checks (mean/variance of z, Ljung–Box on z²) are **diagnostics**, not proof of model adequacy.

## Limitations
No in-app standard errors; Gaussian innovations only; constant mean; no Student-t, asymmetric (VOL-004) or multi-step forecasts (VOL-005). Academic source not yet verified against the Máster material.
