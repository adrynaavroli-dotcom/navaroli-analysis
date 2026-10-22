# VOL-005 — Volatility Forecasting (out-of-sample evaluation)

Engine: `src/lib/volatility/forecast/engine.ts` (`evaluateForecastModels`). UI: `/volatility` → "OOS Forecast Evaluation". Validation: `src/lib/validation/suites/vol005.ts`, runner `bun validation/run-vol005.ts`.

## Scope
Compares daily variance forecasts of GARCH(1,1) (VOL-003), EWMA λ = 0.94 (VOL-002), and trailing 20/60-return sample variance (VOL-001) at horizons H ∈ {1, 5, 10, 20} trading days. VOL-003's in-sample fit statistics are a different thing: they are estimated on the full sample and are not forecasts.

## Protocol (rolling origin, expanding window)
- Input: daily log returns r_0..r_{n−1} from the Returns Engine. `dates[i]` is the date of the price that ends return i.
- Initial training size `train = max(252, floor(0.6·n))`. First origin `t0 = train − 1`, so it uses r_0..r_{t0}.
- Origins t = t0 … n−2. Horizon H keeps the origins with t + H ≤ n − 1. Longer horizons therefore have fewer origins. At least 100 common origins are required at H = 20. Below that, the engine returns `insufficient-history` and never relaxes the rule.
- At origin t every model uses **only r_0..r_t**. A unit test changes a future return and checks that earlier forecasts are bit-identical.
- GARCH: parameters are refit on r_0..r_t at t0, t0+20, t0+40, … Between refits the state follows the frozen parameters, h_{t+1} = ω + α(r_t − μ)² + β h_t. If a refit fails or does not converge, GARCH forecasts are invalidated (null) until the next successful scheduled refit. Those origins are dropped for **all** models and counted in `excludedOrigins`.
- Indexing: `fit.variance[t]` = h_t (information through t−1). The one-step forecast h_{t+1|t} applies r_t exactly once.

## Forecasts
- GARCH, ρ = α + β < 1, h̄ = ω/(1−ρ): h_{t+k|t} = h̄ + ρ^{k−1}(h_{t+1|t} − h̄). If ρ ≥ 1 (or 1 − ρ < 1e−8), the engine uses the direct recursion E[h_{t+k}] = ω + ρ E[h_{t+k−1}]. Accepted refits must have ρ < 1.
- EWMA: v_{t+1} = λ v_t + (1−λ) r_t², seeded with the sample variance of the first 20 returns (VOL-002 timing). The forecast is **flat**: v_{t+1} is used for every day of the horizon.
- Historical 20D/60D: sample variance (n−1) of r_{t−w+1}..r_t. Also **flat**. Hist60 is the baseline.

## Scoring
- v̂(t,H) = mean of the H daily forecast variances. proxy(t,H) = mean of r² over t+1..t+H.
- Future squared returns are a **noisy proxy** for latent variance, not observed variance.
- QLIKE = mean(ln v̂ + proxy/v̂). This robust comparison form omits a term that depends only on realized data, so only differences between models on the same origins mean anything. The engine reports ΔQLIKE = QLIKE_model − QLIKE_hist60 (negative is better), never a relative QLIKE. MSE = mean((v̂ − proxy)²) and RMSE = √MSE, both in daily decimal² units. Relative MSE vs hist60 = 1 − MSE/MSE_hist60.
- All models are scored on exactly the same valid origins per horizon. Ranking is by QLIKE.
- Overlapping multi-day targets are serially dependent. No significance test is implemented, so no superiority is claimed.

## Evidence
- Synthetic (fixed seed 20261020, percent units): `validation/python/benchmark_vol005.py` → `src/lib/validation/fixtures/vol005-benchmark.json`. It checks the one-step and 20-step paths against `arch.forecast` and QLIKE/MSE against numpy. Pinned environment: `validation/python/requirements-vol005.txt` (arch 8.0.0). It validates formulas and metrics only, not the rolling protocol.
- Observed: DAT-001 AAPL Yahoo snapshot (`dat001-snapshot.json`, 701 prices from 2024-01-02 to 2026-10-16, adjclose basis via Returns Engine), 700 log returns, train 420, 14 GARCH fits, 0 failures. Full record: `src/lib/validation/evidence/vol005-observed.json`. Pass/fail rows: `vol005-results.json`. A Vitest test re-runs the evaluation and requires an exact match.

## Limitations
One ticker and about one year of origins, so results are sample-dependent. Gaussian QMLE GARCH. No Diebold–Mariano test. The academic source has not been verified.

## Reproduce
```
python -m pip install -r validation/python/requirements-vol005.txt
python validation/python/benchmark_vol005.py
bun validation/run-vol005.ts
npx vitest run src/lib/volatility/forecast
```
