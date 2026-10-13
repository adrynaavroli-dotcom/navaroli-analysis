# Time-Series Diagnostics — specification (STA-002)

Code: `src/lib/timeseries/` · Validation: `src/lib/validation/suites/sta002.ts` · Python reference: `validation/python/benchmark_sta002.py` · Evidence: `src/lib/validation/evidence/sta002-results.json` · UI: `/volatility` (Time-Series Diagnostics card)

Input: Returns Engine output (log returns; log adjusted prices for ADF). Purpose: test for autocorrelation and ARCH effects, and confirm stationarity of returns, before GARCH (VOL-003).

## ACF
ρ̂_k = ĉ_k/ĉ_0, ĉ_k = (1/n) Σ_{t=k+1..n}(x_t − x̄)(x_{t−k} − x̄). Denominator n at every lag (Box–Jenkins; statsmodels `acf` default). This keeps the autocovariance sequence positive semi-definite. UI band ±1.96/√n (white noise). Lags 1–10 shown for r and r².

## Ljung–Box
Q(m) = n(n+2) Σ_{k=1..m} ρ̂_k²/(n−k), H0: no autocorrelation up to lag m. Reference distribution χ²(m), with df = m because the test runs on raw series, not ARMA residuals. Lags m = 10 and 20 (user decision). p = Q_χ²(Q; m) via the regularized incomplete gamma function.

## ADF
Δx_t = α + γx_{t−1} + Σ_{i=1..p} δ_iΔx_{t−i} + ε_t (constant, no trend). H0: γ = 0 (unit root); H1: γ < 0. τ = γ̂/se(γ̂), estimated by OLS with Householder QR.

- Lag selection (user decision: AIC, statsmodels convention): p_max = min(⌈12(n/100)^{1/4}⌉, ⌊n/2⌋ − 2). All p = 0..p_max are fitted on the common sample with the first p_max rows dropped. The lowest AIC wins, with ties going to the smaller p. The chosen p is then refitted on its full sample. AIC = n(ln 2π + ln(SSR/n) + 1) + 2k.
- p-value: MacKinnon (1994) response surface, case "c", N = 1: Φ(Σ c_iτ^i), using the small-τ coefficient set for τ ≤ −1.61 and the large-τ set otherwise. p = 1 if τ > 2.74 and p = 0 if τ < −18.83.
- Critical values: MacKinnon (2010) finite-sample surface c0 + c1/T + c2/T² + c3/T³, where T is the regression nobs.
- Coefficient source: transcribed from statsmodels 0.15.0 `tsa/adfvalues.py`, which cites MacKinnon (1994, JBES 12(2):167–176) and MacKinnon (2010, Queen's Univ. WP 1227). The original papers were not consulted directly.

## Inputs and failure behaviour
| Case | Behaviour |
|---|---|
| Non-finite values | `TimeSeriesInputError` (Returns Engine never emits gaps) |
| Constant series | ACF / Ljung–Box return `null` ("undefined"); ADF throws. Never NaN |
| Minimum sample | ACF n > nlags; Ljung–Box n ≥ max(m)+2; ADF n ≥ 10 and p_max ≥ 0 |
| Singular regression | ADF throws |

## Validation
Synthetic data only (seed 20261012): i.i.d. normal, AR(1) φ=0.5, ARCH(1) returns and squared returns, random-walk log price, stationary AR(1) level, and a short n=60 series. Each is compared with statsmodels `acf`, `acorr_ljungbox` and `adfuller(regression="c", autolag="AIC")`. The selected lag and nobs must match exactly.

The MacKinnon p-value is also checked on 87 τ values, including both regime boundaries, and the critical values for T = 25…1000. The χ² survival function and normal CDF are compared with scipy. Numerical checks cover AR(1) ρ̂_1, power on known data-generating processes, a hand-calculated case, closed-form χ² for even df, the Schwert maximum lag and failure cases.

Tolerances: ACF 1e-13 abs / 1e-11 rel; Q 1e-10 / 1e-11; p-values 1e-12 / 1e-9; τ 1e-10 / 1e-9 (different OLS solver); special functions 1e-14 / 1e-11. Out-of-sample testing is not applicable: these are hypothesis tests with no forecast.

Regenerate: `python validation/python/benchmark_sta002.py && bun validation/run-sta002.ts` (requires statsmodels).

## Limitations
Constant-only ADF; asymptotic MacKinnon p-values; i.i.d.-based ACF band; conditional heteroskedasticity and structural breaks distort test size; AIC lag choice is sensitive near ties.
