# FND-001 — SEC Fundamental Data Ingestion & Normalization — Model Design Review

Status: DESIGN REVIEW ONLY. Not implemented, not validated. No code, schema, function, matrix or dependency changes were made.

## 1. Objective and scope
Build a reproducible, provenance-preserving fundamentals foundation (US SEC registrants, 10-K/10-Q, target 5 fiscal years) for future company analysis, valuation (DCF reuse) and screening.

In scope: SEC acquisition via backend functions, raw XBRL fact storage (append-only), deterministic normalization to a canonical statement set, quarterly derivation from YTD, quality flags, market-data snapshot linkage, tests and evidence.
Out of scope: valuation models, screening, ratios beyond basic reconciliation identities, non-US filers (20-F/40-F/IFRS), segment/dimension normalization (raw capture only), UI beyond a minimal admin ingestion/inspection view, matrix status changes.

## 2. Current architecture audit (observed)
- `src/lib/financial-parser.ts` (505 l) and `financial-consolidator.ts` (386 l): label-synonym mapping (`METRIC_SYNONYMS`) to annual `year` keys; no fiscal period, form, accession, tag, unit, dimension or restatement metadata. Not suitable as canonical store; reusable only as a downstream adapter target.
- `src/types/valuation.ts`: `STANDARD_VARIABLES` (20 keys) — a useful initial canonical vocabulary.
- `src/lib/valuationUtils.ts` `calculateDCF`: no guard for `wacc <= g` (line 164 divides by `wacc - g`), returns price 0 when shares = 0, terminal discounted at year N (end-of-year convention, undocumented), cash/debt inputs not date-aligned. Must NOT be treated as validated; out of scope for FND-001 but flagged for a later VAL item.
- `AutoFetchPanel.tsx`: FMP/Alpha Vantage with user keys in localStorage, browser-side; inconsistent with "SEC requests server-side" — keep, do not extend.
- Backend functions in repo: check-thesis-alerts, fetch-fred-data, fetch-historical-volatility, fetch-options-chain, fetch-stock-data, fetch-vol-surface, update-prices. All functions invoked by the frontend have source in the repo. The deployed function list was not queried in this review → "deployed-but-not-in-repo" status is UNVERIFIED (check with the function list before implementation).
- Market data: Returns Engine (`src/lib/returns/`) and DAT-001 snapshot provenance conventions exist; FRED via `fetch-fred-data` (1h cache).
- Matrix: no FND item exists yet; adding FND-001 as NOT STARTED is a future, approval-gated change.
- Validation framework `src/lib/validation/` (plans, tolerances, evidence) and Quality checks CI are reusable.

## 3. Dependencies and reuse
Reuse: Returns Engine (prices/returns only), DAT-001 provenance format, validation framework/evidence runners, Quality checks workflow, `STANDARD_VARIABLES` vocabulary, existing rate limiting pattern, `user_roles`/`has_role` for admin gating.
New: SEC backend function(s), canonical tables, pure normalizer module. No new npm/Python production dependency. EdgarTools (or plain `requests`) only as an offline independent reference.

## 4. Data source and backend design
- SEC endpoints: `data.sec.gov/submissions/CIK##########.json` (filings, form, accession, filed/report dates, amendments), `data.sec.gov/api/xbrl/companyfacts/CIK##########.json` (all facts with `accn, fy, fp, form, filed, frame, start, end, val, unit`). Ticker→CIK from `www.sec.gov/files/company_tickers.json`. Filing-level `Archives/edgar/data/{cik}/{accn}/` (FilingSummary / instance XBRL) only for custom tags or dimensions, deferred.
- SEC fair-access: declared `User-Agent` with contact (stored as backend secret), ≤ 10 req/s (we target ≤ 2 req/s), exponential backoff on 429/403, no browser calls.
- Functions: `sec-ingest-company` (admin-only JWT + `has_role`): resolve CIK → fetch submissions + companyfacts → store raw payload hash + facts append-only → run normalizer → write normalized rows + quality flags. Optional cron refresh later with `x-cron-secret`.
- Frontend reads only from the database (consistent with "public data is DB-only"). Normalizer lives in a pure TS module shared by the function (Deno import) and tests.

## 5. Canonical data model (proposed tables, all RLS + grants)
- `sec_companies`: cik (PK, 10-digit text), ticker(s), name, sic, fiscal_year_end (MMDD), exchange, last_ingested_at.
- `sec_filings`: accession (PK), cik, form (10-K, 10-K/A, 10-Q, 10-Q/A), filing_date, report_date, fy, fp, is_amendment, amends_accession (nullable), source_payload_sha256, ingested_at.
- `sec_raw_facts` (append-only, never updated): id, cik, accession, taxonomy (us-gaap/dei/ifrs-full/custom), tag, unit, value (numeric), period_start (null for instant), period_end, fy, fp, form, filed, frame, ingestion_run_id. Unique (cik, taxonomy, tag, unit, period_start, period_end, accession).
- `sec_normalized_facts`: cik, canonical_key, period_type (instant|FY|Q|YTD), period_start, period_end, fiscal_year, fiscal_quarter, value, unit, currency, source_fact_ids[], source_tag, derivation (reported|derived_q4|derived_ytd_diff|sum_of_tags), as_of_filing (accession chosen), version_rank, quality_flags[].
- `market_snapshots`: cik/ticker, price_date, close, adj convention, currency, source, fetched_at, payload_sha256 (links to existing Yahoo path; no new returns logic).
- `ingestion_runs`: id, cik, started/finished, status, sec_endpoints, http stats, errors, normalizer_version.

## 6. Period and normalization conventions
- Instant (balance sheet, shares): `end` only. Duration (IS, CF): `start`/`end`; classify by length: 80–100 days = Q, 350–380 = FY, otherwise YTD (H1 ≈ 180, 9M ≈ 270).
- Fiscal labels from SEC `fy`/`fp` are filing-relative, not the fact's own period; canonical fiscal_year/quarter are derived from `period_end` and the company fiscal_year_end (handles 52/53-week years with ±7-day tolerance).
- Cash flow: 10-Q CF is YTD. Q2 = YTD6M − Q1; Q3 = YTD9M − YTD6M; Q4 = FY − YTD9M (or FY − ΣQ1..Q3 for IS). Derived values flagged `derived_*` with source ids; never derived across different `start` dates.
- Units: keep SEC unit strings (USD, shares, USD/shares, pure); values stored unscaled. Non-USD reporting kept with currency, no FX conversion in FND-001.
- Amendments/restatements: all versions retained. "Latest-known" view = most recent `filed` for identical (tag, unit, start, end); "point-in-time" view = latest filed ≤ as-of date (prevents look-ahead for future backtests).
- Tag mapping: ordered priority lists per canonical key (e.g. revenue: `RevenueFromContractWithCustomerExcludingAssessedTax` → `Revenues` → `SalesRevenueNet`), versioned in code; first available per period, recorded in `source_tag`. No silent sums; summed derivations explicitly flagged.
- Quality flags: missing_period, tag_fallback, derived_value, amended, unit_mismatch, duplicate_conflict (same period, different values in same filing), identity_violation (e.g. Assets ≠ Liabilities + Equity beyond tolerance), negative_unexpected.

## 7. Validation plan and acceptance criteria
Applicable:
- Unit tests (pure normalizer): period classification incl. 52/53-week, YTD→Q derivation, Q4 derivation, amendment selection latest vs point-in-time, unit handling, tag priority/fallback, duplicate conflict, invalid input rejection.
- Fixture tests on frozen, hashed companyfacts snapshots for 3–5 companies with different profiles (e.g. AAPL non-calendar FY, MSFT June FY, JPM financial, a company with 10-K/A). Snapshots stored with extraction date and SHA-256 (approved before commit; runners read-only).
- Independent reconciliation: offline Python reference (EdgarTools or direct JSON parsing, not a port of the TS normalizer) for selected keys/periods; tolerance: exact equality for reported values (integers), 0 for derived differences; any mismatch must be explained, never tolerance-loosened.
- Accounting identities: Assets = Liabilities + Equity (incl. NCI) |diff| ≤ 0.5% of assets; ΣQ = FY for flow items where all four exist.
- Integration test: function against a mocked SEC client (no live calls in CI); one manual live smoke run per fixture company recorded as evidence.
- Regression: full Vitest, typecheck, build, existing runners (VOL-003/004/005, POR-001) unchanged.
Not applicable: synthetic statistical benchmark, OOS evaluation (no forecasting), optimizer tests.

Acceptance criteria (COMPLETED requires all):
1. ≥ 5 fiscal years of 10-K + available 10-Q ingested for each fixture company; raw facts immutable across re-ingestion (row counts/hashes stable).
2. 100% of the ~20 canonical keys resolved or flagged for each fixture period.
3. Python reconciliation 100% match on the agreed key set.
4. Identity checks pass or are flagged with reasons.
5. Point-in-time query never returns a fact filed after the as-of date (test).
6. No SEC call from the browser (network check).
7. RLS/security scan clean for new tables.
8. Quality checks CI green on the closing SHA; docs `docs/quant/sec-fundamentals.md`.
Academic Knowledge stays PLANNED unless primary material is verified.

## 8. Risks and unresolved decisions
- R1 Tag heterogeneity / custom tags → coverage gaps (flag, not guess).
- R2 Financial companies (banks/insurers) lack gross profit/FCF semantics → separate template later.
- R3 companyfacts payload size (tens of MB for large filers) vs function memory/time → stream-parse or filter by taxonomy/tags.
- R4 SEC rate limits / blocking without proper User-Agent.
- R5 Storage growth of raw facts (store only us-gaap + dei initially?).
- R6 Existing DCF safeguards (wacc ≤ g) are a separate defect, not fixed here.
Decisions for you:
- D1 Raw fact scope: (a) all us-gaap+dei facts [recommended for provenance] or (b) only tags in the mapping.
- D2 Access: admin-only ingestion with public read of normalized data for published companies, or fully admin-only.
- D3 SEC contact for User-Agent (email/name to store as secret).
- D4 Fixture companies (proposed AAPL, MSFT, JPM, plus one with 10-K/A).
- D5 Register FND-001 in the matrix as NOT STARTED now, or at implementation start.

## 9. Expected files and DB objects (future phase)
- `supabase/functions/sec-ingest-company/index.ts`, `supabase/functions/_shared/sec-client.ts`
- `src/lib/fundamentals/{periods,tag-map,normalize,quality,types}.ts` + `__tests__/`
- `validation/fnd001/` Python reference, frozen fixtures, `run-fnd001.ts`; CI step in `quality-checks.yml`
- Migration: 6 tables above, indexes, RLS, grants, point-in-time SQL view
- Minimal admin page/panel to trigger ingestion and inspect flags; adapter from normalized facts to `ConsolidatedYear` for the existing valuation engine
- `docs/quant/sec-fundamentals.md`, matrix entry FND-001

## 10. Approval checklist
- [ ] Scope and out-of-scope accepted
- [ ] Canonical tables and append-only raw policy accepted
- [ ] Period/YTD/amendment conventions accepted
- [ ] Validation plan, tolerances and acceptance criteria accepted
- [ ] D1–D5 decided
- [ ] Authorization to implement granted
