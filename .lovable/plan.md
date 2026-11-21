# POR-001 — F0: buy-and-hold returns and actual turnover

The evaluation is wrong in two places, and both need fixing before any POR-001 result is published:
- Realized volatility uses weighted log returns. The fix is buy-and-hold simple portfolio returns inside each 21-session block.
- Turnover uses Σ|Δw| between target weights. The fix is actual one-way turnover measured against drifted weights.

The optimizer, the Python reference fixtures and other models (VOL-003/004/005) are not touched.

## Mathematics (approved)
- Simple asset return: r_s = exp(r_log) − 1, so log returns keep coming from the Returns Engine.
- Buy-and-hold block:
  - daily portfolio return r_p,t = Σ w_drift,i,t · r_s,i,t;
  - weights drift as w_drift,i,t+1 = w_drift,i,t · (1 + r_s,i,t) / (1 + r_p,t);
  - realized volatility = sample std (n−1) of the 21 daily returns × √252.
- Actual one-way turnover = 0.5 · Σ |w_new_target − w_old_drifted_end_of_block|.
- The old metric is kept only as "target weight change", explicitly labelled as such.

## Changes
1. `src/lib/portfolio/walkforward.ts`:
   - `realizedVol` switches to buy-and-hold simple returns and also returns the drifted weights at the end of the block;
   - the summary gains the GMV and EW actual turnover (mean, median, min, max);
   - `gmvMeanTurnover` is renamed to `gmvMeanTargetWeightChange`.
2. `src/lib/portfolio/metrics.ts`:
   - `turnover()` becomes a true one-way metric (0.5 · Σ|Δ|) with a corrected comment;
   - add `driftWeights()`.
3. Regression tests (`walkforward.test.ts`, `metrics.test.ts`):
   - a hand-computed 2-asset, 3-day case;
   - drift identity: weights sum to 1;
   - turnover: buys equal sells;
   - observed-snapshot values from the independent recalculation, tolerance 1e-12:
     - GMV mean vol 0.0887169870602708 and EW mean vol 0.1208663441134454;
     - GMV actual turnover mean 0.0620066745264357 and EW actual turnover mean 0.0168712087132582.
4. Controlled evidence regeneration with `validation/run-por001.ts`:
   - `implementationVersion` is bumped to `@1.1.0`;
   - the change from the old values is recorded in the documentation (historical provenance is kept).
5. Documentation: `docs/quant/minimum-variance.md`. It records the return convention, actual turnover, and the limitation that prices are not dividend-adjusted.
6. `/portfolio` page: labels only ("Actual one-way turnover", "Target weight change"). No new formulas in the UI.

## Validation
- Focused Vitest run on the portfolio module.
- POR-001 runner (synthetic benchmark 40/40 unchanged) and the evidence reproduction check.
- Full Vitest suite.
- Build/TypeScript checked through the harness.

POR-001 stays IN PROGRESS until CI passes on the final SHA, which is authorised separately.

## Out of scope
F1 (`/projects`), LinkedIn, security (D5, D-e, D-f), FND-001, workflows, the database and deployments.
