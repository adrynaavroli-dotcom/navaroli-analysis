# DAT-001 — Market Data Ingestion

Code: `src/lib/returns/import.ts` · Edge functions: `fetch-historical-volatility`, `fetch-stock-data`, `fetch-fred-data`, `fetch-vol-surface`
Validation: `validation/python/benchmark_dat001.py` · `validation/run-dat001.ts`

## Data sources

| Source | Endpoint | Auth | Fields | Adjustment |
|---|---|---|---|---|
| Yahoo Finance | `query1.finance.yahoo.com/v8/finance/chart` | None (unofficial) | date, close, adjclose, volume | `close`: split-adjusted; `adjclose`: split + dividend |
| FRED | `api.stlouisfed.org/fred/series/observations` | Free API key (edge function) | date, value | N/A |
| CSV / Excel | Local file import | N/A | Date, Close, Adj Close (optional) | User-provided |
| Nasdaq Data | `api.nasdaq.com/api/quote/.../historical` | None (free) | date, close | Split-adjusted |

## CSV / Excel import

The importer (`importCSV`, `importXLSX`) auto-detects columns by alias matching and produces the same typed `RawPriceData` + `DatasetMetadata` that the live Yahoo path uses, so the imported dataset flows unchanged through `buildReturnsDataset` and every downstream model.

### Accepted columns

| Role | Aliases (case-insensitive) |
|---|---|
| Date | date, fecha, timestamp, tradedate, day, datetime |
| Close | close, closelast, closingprice, price, precio, lastprice, last |
| Adj Close | adjclose, adjustedclose, adjustedclosingprice, adjprice |
| Ticker | ticker, symbol, symb, security, instrument |

### Date formats

- **ISO (preferred):** `YYYY-MM-DD`, `YYYY/MM/DD`
- **Unambiguous:** `DD/MM/YYYY` (day > 12) or `MM/DD/YYYY` (month > 12)
- **Ambiguous:** Both components ≤ 12 → flagged `AMBIGUOUS_DATE`, row rejected. Provide ISO dates.
- **Excel serial numbers:** Interpreted as days since 1899-12-30.

### Validation rules

- Missing / non-finite / non-positive prices → rejected and counted.
- Duplicate dates → first kept, rest rejected.
- Out-of-order → stable sort, flagged `OUT_OF_ORDER`.
- Multiple tickers in one file → import rejected.
- No interpolation, no forward-fill, no invented observations.

## Independent-source validation

The recorded snapshot (`src/lib/validation/fixtures/dat001-snapshot.json`) compares AAPL daily split-adjusted closes from Yahoo Finance and Nasdaq Data (api.nasdaq.com) over 400+ overlapping trading days.

### Comparison basis

Both providers publish **split-adjusted closes** (no dividend reinvestment). Yahoo's `adjclose` field (dividend-reinvested) is stored but intentionally not compared — Nasdaq has no equivalent.

### Results (snapshot `dat001-snapshot/1.0.0`)

| Metric | Value |
|---|---|
| Overlapping dates | 400 |
| Max absolute error | ≈ 1.5e-5 |
| Max relative error | ≈ 5.7e-8 |
| Only in Yahoo | ~300 (older history beyond Nasdaq's ~2y window) |
| Only in Nasdaq | 0 |

### Reproducibility

```bash
python validation/python/benchmark_dat001.py   # re-download snapshot
bun validation/run-dat001.ts                    # re-run comparison
```

**Limitation:** Nasdaq's free endpoint serves approximately the last two years of history. Re-running the benchmark with identical overlap requires running it within that window.

## Dependents

All downstream models consume data through the Returns Engine (`buildReturnsDataset`), which is agnostic to the ingestion path (live Yahoo, CSV, Excel).
