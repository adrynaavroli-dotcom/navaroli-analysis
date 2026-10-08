# Returns Engine — specification (DAT-001 → DAT-003)

Code: `src/lib/returns/` · Validation: `src/lib/validation/` · Python reference: `validation/python/benchmark_phase1.py`

## Pipeline (stages never mixed)

```text
RAW MARKET DATA → CLEANED DATA → ADJUSTED PRICES → RETURNS → DERIVED METRICS → MODEL OUTPUTS
 RawPriceData      cleanPrices()   selectPriceField()  log/simple   statistics, vol    VolatilityModel…
```

Single entry point: `buildReturnsDataset(raw, metadata, kind)`.

## Definitions

| Topic | Rule |
|---|---|
| Input price | Daily close from a free source (Yahoo Finance chart API, FRED, CSV, Excel). |
| Adjusted price | Yahoo `adjclose` (splits + dividends) preferred if ≥95% coverage of valid closes; else `close` (split-adjusted only) + flag `UNADJUSTED_DIVIDENDS`. |
| Simple return | R_t = P_t / P_{t−1} − 1 (cross-sectionally additive → portfolios). |
| Log return | r_t = ln(P_t / P_{t−1}) (time-additive → volatility, aggregation). R = eʳ − 1. |
| First observation | Produces no return; return dates are the end-of-period price date. |
| Frequency / calendar | Native trading-day calendar of the source; no synthetic days. |
| Resampling | Weekly (ISO Mon–Sun) and monthly use the LAST price in the period; returns computed after resampling, never by averaging. |
| Multi-asset alignment | Intersection of dates (inner join). No forward fill. Dropped observations reported per ticker. |
| Missing values | Removed and counted (`MISSING`). Never interpolated. |
| Prices ≤ 0 | Removed and counted (`NON_POSITIVE`). |
| Duplicates | First occurrence in source order kept (`DUPLICATE_DATE`). |
| Out-of-order | Stable chronological sort (`OUT_OF_ORDER`). |
| Corporate actions | Handled by the adjusted field; residual jumps > 25% log flagged `LARGE_MOVE`. |
| Quality flags | `LARGE_MOVE`, `CALENDAR_GAP` (> 5 calendar days), `STALE_PRICE` (≥ 5 identical), `UNADJUSTED_DIVIDENDS`. Flags never modify data. |
| Rolling windows | Trailing only (value at t uses data ≤ t), null during warm-up. |
| Metadata | source, ticker, currency, frequency, history, updateMethod, retrievedAt, priceField, first/last date, observations. |

## Dependents

Historical Volatility (VOL-001), EWMA (VOL-002), GARCH (VOL-003), Covariance (COR-001), Correlation (COR-002/003), Portfolio Optimization (POR-001), VaR / ES (RSK-001/002/005).

## Validation

Three levels, recorded in `src/lib/validation/evidence/phase1-results.json` and shown in the matrix detail sheet:

1. **Unit tests** (Vitest): behaviour and edge cases — `src/lib/returns/__tests__`, `src/lib/volatility/__tests__`.
2. **Numerical tests**: closed-form / hand-derived values and identities.
3. **Independent benchmark**: same dirty dataset processed by numpy/pandas/scipy; element-wise tolerance |a−b| ≤ abs + rel·|b|, set near float64 round-off.
4. **Out-of-sample**: not applicable to these deterministic / non-fitted estimators (justified per model in the registry).

Regenerate: `python validation/python/benchmark_phase1.py && bun validation/run-phase1.ts`, then `npx vitest run`.
