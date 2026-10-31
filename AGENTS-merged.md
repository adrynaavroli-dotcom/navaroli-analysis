- Quant analytics math lives in pure, unit-tested modules under src/lib/<domain>/ behind a common model interface; pages only compose them — keeps models reusable across future quant layers.
- The Quantitative Project Matrix has a single source of truth in src/lib/quant-matrix/ (items, roadmap, selectors); admin status overrides are stored in page_content and merged at runtime — so every matrix view stays consistent without duplicated data.
- All price/return preparation goes through the Returns Engine in src/lib/returns/ (RAW → CLEANED → ADJUSTED → RETURNS, flags never alter data); models consume its returns only — one definition of returns for every downstream model. File imports (CSV/Excel) are parsed by src/lib/returns/import.ts into the same RawPriceData/DatasetMetadata as live sources; a failed import never replaces a valid dataset — one ingestion contract for every source.
- Model validation uses the reusable framework in src/lib/validation/ (plans + ValidationResult evidence, Python reference fixtures, regenerated via validation/run-*.ts); a matrix item's validation layer may be COMPLETED only if its recorded evidence closes its plan, enforced by tests.
- Technical docs live at /quant/* (QuantDoc) and render from the matrix item's docPath plus validation evidence — no duplicated content.
- Covariance/correlation live in src/lib/correlation/ and consume only aligned return panels from the Returns Engine; undefined correlations are null (never NaN/clipped) — keeps every downstream risk/portfolio model on one consistent estimator. EWMA covariance reuses the VOL-002 conventions (λ, seed, timing) so its diagonal equals univariate EWMA — one EWMA definition.

- Time-series diagnostics live in src/lib/timeseries/ (ACF, Ljung–Box, ADF, own special functions with no new dependencies) and are benchmarked against statsmodels; p-value coefficients are transcribed constants with a cited source — keeps GARCH prerequisites deterministic and auditable.
- GARCH-family models live in src/lib/volatility/ (garch.ts for VOL-003, one file per extension such as gjr-garch.ts, reusing garch.ts helpers without editing validated code), estimate with the in-house deterministic Nelder–Mead (src/lib/optim/) on 100·r with arch-compatible backcast/bounds and constraints, and are benchmarked against Python arch (pinned in validation/python/requirements-*.txt); approved reference fixtures are read-only for runners — no runtime optimizer dependency, one reproducible reference.
- VOL-005 reproduces complete observed records through a shared path-aware comparator with explicitly named volatile metadata and GARCH-only cross-runtime arithmetic bounds; evidence runners must compare before overwriting references — prevents silently blessing changed protocol or scores.
- Explicit TypeScript checks for both app and node configurations, regression tests, VOL-005 reproduction and production compilation run in the read-only Quality checks workflow, independently of Pages deployment — compilation alone does not establish TypeScript correctness.
- Portfolio optimization lives in src/lib/portfolio/ (POR-001 GMV: Cholesky closed form + deterministic active-set QP with Bland anti-cycling and KKT certificate; walk-forward OOS engine). It consumes covariance matrices from src/lib/correlation/ and aligned panels from the Returns Engine, never fetches data itself; singular/infeasible/non-converged cases return explicit statuses with no weights — one optimization contract for every future portfolio model.
# Engineering and collaboration rules

## Think before changing code
- Inspect the relevant files, repository structure, existing tests and project documentation before proposing or implementing a change.
- State assumptions when they materially affect the solution. Ask for clarification if an unresolved ambiguity could change architecture, financial meaning, data integrity or execution behavior.
- For non-trivial tasks, provide a short plan and measurable acceptance criteria. For small, unambiguous tasks, make the change directly.
- Prefer the simplest implementation that satisfies the request. Avoid speculative features, unnecessary dependencies, abstractions and configuration.
- Make surgical changes: preserve existing architecture, interfaces, naming and style. Do not refactor unrelated code or modify validated behavior without a clear requirement.
- Remove only code made unused by the change. Report unrelated issues without silently fixing them.

## Quantitative and data integrity
- Keep calculations deterministic and reproducible wherever practical. Make units, annualization conventions, timestamps, time zones, sampling frequency, return definitions and parameter conventions explicit.
- Prevent look-ahead bias, data leakage and accidental use of future observations. Use chronological train/validation/test splits for time-series work; use walk-forward or out-of-sample evaluation when appropriate.
- Do not silently change missing-value, alignment, adjustment, interpolation or stale-price handling. Preserve the Returns Engine as the single preparation path for prices and returns.
- Make assumptions about transaction costs, spread, slippage, liquidity, financing and execution explicit. If omitted, label results as frictionless or illustrative rather than presenting them as executable performance.
- Compare models against suitable reference implementations or independently calculated examples where practical. Document numerical tolerances and explain any differences rather than widening tolerances without justification.
- Do not treat in-sample performance as evidence of robust strategy performance. Report relevant limitations and out-of-sample evidence.

## Validation and reference evidence
- Treat approved reference fixtures and recorded validation evidence as controlled artifacts. Do not edit or regenerate them merely to make a test pass.
- Before changing a reference fixture, inspect and compare the complete observed output, identify the reason for the difference, and obtain explicit authorization when the change would redefine approved expected behavior.
- A validation status must reflect actual recorded evidence and the applicable validation plan; never mark work as complete based only on implementation or compilation.
- Add or update focused tests for changed behavior, including boundary cases and known numerical examples for financial calculations.
- Run the narrowest relevant checks first, then the repository's applicable regression, type-check and production-build checks. Report the exact checks run and their actual outcomes.
- If a check cannot be run, state why and what remains unverified. Never claim that tests pass without running them.

## Execution and security safeguards
- Keep paper/sandbox and live execution clearly separated if broker execution is implemented. Default to paper/sandbox behavior.
- Never place, amend or cancel a live order unless the user explicitly requests that specific action and the required authorization is available.
- Validate order parameters and applicable risk limits before execution. Handle rejects, partial fills, timeouts and reconciliation explicitly.
- Never hard-code credentials or commit secrets. Use the repository's established secret-management approach and keep secrets out of logs and test fixtures.

## Definition of done
A task is complete when:
1. The requested behavior is implemented within the agreed scope.
2. Relevant tests and quality checks have been run, or unrun checks are clearly identified.
3. Existing validated behavior and approved reference evidence have not been changed unintentionally.
4. Documentation and validation evidence are updated when the change requires them.
5. Remaining assumptions, limitations and risks are stated clearly.

For substantial tasks, summarize: scope and assumptions, files changed, verification performed and results, and anything still unverified. For small tasks, keep the response concise.
