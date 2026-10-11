# Covariance & Correlation Engine — specification (COR-001, COR-002, COR-003)

Code: `src/lib/correlation/` · Validation: `src/lib/validation/suites/phase4.ts` · Python reference: `validation/python/benchmark_phase4.py` · UI: `/correlation`

## Pipeline

```text
RAW → CLEANED → ADJUSTED → RETURNS → ALIGNED MULTI-ASSET RETURNS → ROLLING COVARIANCE → ROLLING CORRELATION → UI
                                      alignPrices() + panelReturns()   rollingCovariance()    covToCorr()
```

Input is always returns, never price levels.

## Definitions

Rolling covariance over a trailing window of W aligned observations ending at t:

Σ̂_t = 1/(W−1) · Σ_{j=t−W+1..t} (r_j − r̄_t)(r_j − r̄_t)ᵀ, with r̄_t the in-window mean vector (two-pass).

Correlation: ρ̂_ij,t = Σ̂_ij,t / √(Σ̂_ii,t Σ̂_jj,t).

| Rule | Value |
|---|---|
| Denominator | W − 1 (sample) |
| Windows | 20, 60, 120 (configurable) |
| Warm-up | null for the first W−1 return dates; null whenever fewer than W returns exist |
| Look-ahead | none — estimate at t uses returns ≤ t |
| Alignment | Prices inner-joined on common dates (Returns Engine), then returns. No forward-fill. All assets share the same W observations. |
| Base output | Daily covariance; annualized = daily × 252 (UI toggle) |
| Zero variance | Daily variance ≤ 1e-18 ⇒ correlation row/column = null ("unavailable"), never NaN/∞ |
| Bounds | |ρ| ≤ 1 + 1e-12; larger breaches throw — no clipping |
| Properties | Symmetric, unit diagonal for positive-variance assets |

## Validation (recorded in `evidence/phase4-results.json`)

Synthetic test data only (seed 20261009). Cases: 4-asset panel with missing dates and unequal histories (rolling 20/60/120 vs pandas `rolling().cov()/corr()` incl. warm-up nulls), hand-checkable 3-asset matrix, perfect ±1, independent series (|ρ| ≤ 4/√n), zero-variance asset, insufficient observations, symmetry/diagonal/bounds over every rolling matrix, no look-ahead (future shock test).

Regenerate: `python validation/python/benchmark_phase4.py && bun validation/run-phase4.ts`.

## EWMA covariance (COR-003)

Code: `src/lib/correlation/ewma.ts` · Validation: `src/lib/validation/suites/cor003.ts` · Python: `validation/python/benchmark_cor003.py` · Evidence: `evidence/cor003-results.json`

Σ_t = λ Σ_{t−1} + (1−λ) r_{t−1} r_{t−1}ᵀ, seed Σ_{s−1} = sample covariance (W−1) of returns 0..s−1.

| Rule | Value |
|---|---|
| λ | 0.94 (RiskMetrics, fixed — same as VOL-002) |
| Seed | s = 20 returns, sample covariance, assigned at index s−1 (same as VOL-002) |
| Timing | estimate at t uses returns ≤ t−1 (ex-ante, no look-ahead) |
| Mean | zero-mean outer product (no demeaning in the recursion) |
| Consistency | √(252·Σ_ii,t) ≡ VOL-002 EWMA volatility of asset i |
| PSD | guaranteed: PSD seed + non-negative rank-1 updates |
| Correlation | covToCorr() — same zero-variance (null) and bound rules as COR-002 |

Validation: numpy closed-form weighted sum Σ_t = λ^{t−s+1}Σ_seed + (1−λ)Σ λ^{t−1−k} r_k r_kᵀ (independent of the recursion), λ = 0.94 and 0.97, univariate diagonal, PD at every date, look-ahead shock test, hand 2×2 case. Synthetic data only (Phase 4 panel). Regenerate: `python validation/python/benchmark_cor003.py && bun validation/run-cor003.ts`.

## Dependencies

Depends on DAT-003 (Returns Engine); COR-002 depends on COR-001. COR-003 depends on DAT-003, COR-001, VOL-002. Required by COR-004, COR-005, POR-001, POR-004, RSK-004.

## Limitations

Sample covariance is singular when W ≤ N and noisy for small W/N; equal weighting causes drop-off effects; Pearson captures linear dependence only; returns spanning a removed date cover a longer interval.
