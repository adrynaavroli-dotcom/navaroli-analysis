# VOL-005 close-out
- [x] Reproduction diagnosis and strict evidence comparison
- [x] Registry/matrix reconciliation
- [x] Regression, lint and automatic preview build verification
- [x] Browser AAPL agreement and state checks
- [x] Configure explicit app/node TypeScript and non-deploying quality CI gates
- [x] Verify Quality checks run 40079914183 on e936bdd35b5cfe4673388c5c603f73294538c256: explicit TypeScript PASS, 245/245 tests, 28/28 VOL-005 checks and production build PASS
- [x] Final diff and factual report
# Skill quant-model-workflow
- [x] Add improved skill with Model Design Review and proportional validation
- [x] Apply targeted review: activation, benchmark lifecycle, approval gate, provenance

# VOL-004 GJR-GARCH
- [x] Engine, unit tests, arch benchmark (23/23), registry/matrix, UI panel, docs, CI step
- [x] Browser check /volatility (AAPL 2y, no page errors)
- [x] Final diff inspection: garch.ts untouched, VOL-003/005 evidence identical to base 95f65f38, VOL-004 fixture sha256 dff28362 unchanged
- [x] Add VOL-003 runner step to Quality checks (37/37 verified locally, evidence restored byte-for-byte)
- [x] Browser smoke after nested-candidate change: GJR card + comparison row, γ=0.1414 asymmetric, ΔAIC −16.10, 2y→1y recalculation, no console errors
- [x] Full Vitest 265/265, preview build OK
- [x] Quality checks green on 8a6dcd5c706b4d3a6030aa54532af7c2525831f9 (includes 3251f81 VOL-003 step): https://github.com/adrynaavroli-dotcom/navaroli-analysis/actions/runs/41236797590 → COMPLETED

# POR-001 Minimum Variance Portfolio
- [x] Model Design Review approved (active-set QP, reject ill-conditioned Σ, observed 4-asset snapshot, /portfolio page)
- [x] Engine src/lib/portfolio/ (closed form + active-set QP + metrics + walk-forward) with 24 unit tests
- [x] Independent numpy/scipy benchmark: 40/40, fixture approved read-only
- [x] Observed walk-forward (AAPL/MSFT/SPY/TLT 2y): 17 origins, 0 failed, GMV 8.89% vs EW 12.08% realized vol; reproduction exact
- [x] Registry plan, matrix IN PROGRESS (5 layers COMPLETED, Academic PLANNED), /portfolio page, docs, CI step
- [x] Quality checks green on 8a6dcd5c706b4d3a6030aa54532af7c2525831f9: https://github.com/adrynaavroli-dotcom/navaroli-analysis/actions/runs/41236797590 → COMPLETED

## FND-001 M1.1
- [x] Schema applied (8 sec_* tables, guards, RPCs, RLS) — 2026-11-06
- [x] Hash vectors TH-F/TH-J saved and in CI
- [ ] DB/RLS tests T1–T33 — blocked: need an isolated test database
