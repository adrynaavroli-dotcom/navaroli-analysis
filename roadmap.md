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
- [x] Isolated test environment: ephemeral Supabase stack in CI job `fnd001-db` (D1)
- [x] Single migration chain + CI guards (check-migration-chain.sh)
- [x] T1–T33 DB portion written (db_tests.sql) — local shim run 186/186, mutation check 14/14 detected (not official)
- [x] Real-JWT access check written (access-check.ts) — not run locally
- [x] As-built log: docs/fnd001/m1.1-as-built.md
- [x] Official CI evidence for `fnd001-db`: run 42360647941 on 3d7d106942de4e5e0a212eb9b3d2a75258d7c8ed — 186/186 DB, 29/29 real-JWT (https://github.com/adrynaavroli-dotcom/navaroli-analysis/actions/runs/42360647941)
- [x] D3 production catalog fingerprint (read-only) — identical to CI (906 lines, empty diff); platform roles report in docs/fnd001/d3-catalog-report.md
- [x] Wrapper hardening: access-check.ts uses guard.sh; workflow runs SQL only through guarded wrappers
- [x] Pin CI toolchain (ubuntu-24.04, Bun 1.4.4, setup-cli@1dedf2c…, Supabase CLI 3.0.0) — approved 2026-11-11
- [x] User accepted the 6 as-built deviations (§7) with conditions — 2026-11-11
- [x] CI evidence on the pinned-toolchain SHA 66abcef119c8a631f358ea364442d1f7f6833fe1 — Quality checks run 43034468790, both jobs success (https://github.com/adrynaavroli-dotcom/navaroli-analysis/actions/runs/43034468790)
- [x] D4 merged into D5 (user decision 2026-11-13) — not applied separately
- [ ] M1.2: sec-ingest, atomic supersession RPC, T19/T22/T32 and parser parts

## Security — admin-only requirement (transversal)
- [x] Read-only permissions audit + matrix: docs/security/admin-only-audit.md (evidence docs/security/evidence/)
- [x] Decisions D-a…D-d taken (all public, user_roles off the API, profiles admin-only, order 1–7) — 2026-11-13
- [x] Step 1 design + proposed SQL: docs/security/d5-design.md, validation/security/d5/d5-admin-only-migration.sql
- [x] Identity probe (read-only): migrator = postgres, agent session = sandbox_exec; storage grants issued by postgres; net/cron resolved
- [x] Step 2 local simulation (unofficial): guard 244→0 (pre-state identical to prod), tests 216/216, T1–T33 186/186, 9/9 probes, idempotent
- [x] Step 3 CI job `admin-only-db` + guard/tests in the repo; admin-only rule added to AGENTS.md
- [x] Step 4 (revision 1) CI PASS on dca13189cf5cc87a1ac899eac651b389ab81175e — Quality checks run 43410417697, 3 jobs success
- [x] Revision 2 (user review 2026-11-14): signature-based guard/helper, column privileges + Storage + abort, D-e re-analysis (OPEN, medium), REST harness 72 checks, exact coverage (237/186/19/72), deploy-gating proposal, migrator identity assertion, backups, D-f table
- [ ] Revision 2 CI PASS of quality, fnd001-db and admin-only-db on the final SHA — after sync (next message)
- [ ] Step 5 production migration with preflight/postflight — waits for separate user authorization
- [ ] Step 6 frontend: role-checked admin routes, hidden admin links, no Sign up — after step 5
- [ ] Decisions D-e (pg_net, OPEN medium: accept with controls or ask the platform to revoke) and D-f (default ACL; open until migrations, guards and deploy gating align) — waits for user
- [ ] Deploy gating (docs/security/deploy-gating-proposal.md) and GitHub settings — waits for user approval/action
- [ ] Migrator session_user — NOT VERIFIED (no disposable run of the real Lovable mechanism); asserted at D5 apply time
- [ ] page_content DELETE for admin — deliberately closed; waits for user decision
- [ ] Platform checks (Lovable workspace members, GitHub collaborators/branch protection, 2FA) — user action
