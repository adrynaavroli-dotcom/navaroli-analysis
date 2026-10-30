---
name: quant-model-workflow
description: Use when designing, implementing, changing, validating, benchmarking, documenting or closing a quantitative model of the Navaroli Quantitative Project Matrix (returns, volatility, GARCH, correlation, time series, risk, portfolio), including work referenced by a matrix ID such as VOL-004, COR-004 or RSK-001. A model ID alone does not trigger it; skip purely conceptual explanations and study questions.
---

# Skill: quant-model-workflow

## 1. Purpose

Establish a consistent, rigorous and token-efficient workflow for designing, implementing, validating, documenting and integrating quantitative financial models in Navaroli Analysis.

The objective is to ensure that each model is:
- Mathematically specified before implementation.
- Consistent with the project's existing data and calculation architecture.
- Independently validated where appropriate.
- Reproducible and numerically robust.
- Integrated into the application without duplicating calculations.
- Documented with explicit assumptions and limitations.
- Closed only when its required validation evidence is available.

Prioritize correctness, reproducibility and maintainability over implementation speed.

Token efficiency must never be achieved by skipping essential validation or relying on unsupported assumptions.

## 2. Activation rules

Activate this Skill when the user requests:
- Implementation of a quantitative model.
- Changes to an existing model's mathematical or numerical logic.
- Independent benchmarking or model validation.
- Out-of-sample evaluation or statistical backtesting.
- Integration of a quantitative model into the application.
- Technical documentation or matrix status changes related to model implementation.
- Other project-level work on a matrix item (e.g. VOL-004, COR-004, RSK-001).

Mentioning a model ID alone does not activate the workflow; the request must involve implementation, modification, validation, benchmarking, documentation or other project-level work.

Do not activate it for purely conceptual questions, mathematical explanations, study summaries, exam exercises or general discussions that do not modify the project.

## 3. Core architectural principles

### 3.1 Separation of concerns
- Mathematical and statistical calculations belong in pure, typed modules under `src/lib/<domain>/`.
- React components must not implement or duplicate financial formulas.
- UI components orchestrate inputs, calculation calls and result presentation.
- Agents are assistants for planning and interpretation, not required dependencies for deterministic model execution.
- Model calculations must remain usable independently of the UI or AI agents.

### 3.2 Data consistency
- Price and return transformations must use the existing Returns Engine (`src/lib/returns/`).
- Do not independently recalculate returns or introduce inconsistent adjustment conventions.
- Other data types (rates, option chains, financial statements, etc.) must use their corresponding established data interfaces.
- Document source, frequency, currency, units, corporate-action treatment, missing-data handling and historical coverage.
- Never silently interpolate, forward-fill or alter observations unless explicitly justified by the model specification.
- For models using historical market data, record snapshot-level provenance: source and extraction date, historical period and frequency, currency and timezone, corporate-action adjustment convention, cleaning/exclusion rules, and dataset version or hash when practical. Skip metadata irrelevant to models that use no historical market data.

### 3.3 Reuse and regression protection
- Inspect existing modules before creating new implementations.
- Reuse validated utilities when their mathematical conventions genuinely match.
- Avoid unnecessary dependencies, duplicated functions and architecture changes.
- Never refactor validated models merely to make a new implementation look more uniform.
- Preserve existing outputs and evidence unless a verified defect requires modification.

## 4. Model Design Review

Before Phase 0 ends, write a short design card. Skipping it is what causes later rewrites of validated work.

Require explicit user approval of the card before coding when the task involves a new quantitative model, changes to mathematical definitions or estimation methodology, changes to data conventions, shared architecture or dependencies, or material changes to validation methodology. Clearly scoped, low-risk maintenance, documentation or isolated UI changes with no mathematical impact may proceed without a separate approval round; the regression and evidence requirements still apply where relevant.

| Field | Content |
| --- | --- |
| Objective | Problem solved and expected result. |
| Dependencies | Previous models and reusable modules. |
| Mathematics | Formulas, assumptions, parameters and constraints. |
| Data | Source, frequency, units and minimum quality. |
| Validation | Analytic tests, independent benchmark and tolerances — each justified for this model. |
| Risks | Numerical issues, shared dependencies and possible regressions. |
| Closure criteria | Exact evidence required to mark the model COMPLETED. |

## 5. Proportionality: guide the process, do not impose one template

This Skill sets the quality bar, not an identical implementation for every model. Not every model needs Python, a synthetic-data benchmark, a new UI or an out-of-sample test. In the design card, state which validations apply and which do not, with one-line reasons (e.g. a closed-form formula may need only analytic identities and hand-computed cases; an estimated or forecasting model may need an independent library benchmark and OOS evidence). Omitting a check needs a reason; adding unneeded ones wastes effort and tokens. The phases below apply only to the extent the design card says they do.

## 6. Sequential implementation workflow

### Phase 0 — Scope, dependencies and architecture inspection

Before coding:
1. Identify the matrix item, objective, dependencies and current layer statuses.
2. Inspect the relevant mathematical modules, interfaces, tests, validation utilities, documentation and UI.
3. Identify existing reusable components and potential regression risks.
4. Define what is explicitly in scope and out of scope.
5. Produce the Model Design Review card (section 4), including files expected to change and the justified validation gates.

Do not read or reproduce the entire repository unnecessarily. Inspect only relevant files and expand the scope when a dependency requires it.

Stop and report any blocking ambiguity involving mathematical definitions, data conventions or dependencies rather than silently inventing assumptions.

### Phase 1 — Mathematical specification and acceptance criteria

Before implementation, document:
- Mathematical equations and variable definitions.
- Assumptions and distributional choices.
- Parameter constraints and admissible regions.
- Units, scaling and annualization conventions.
- Initialization and estimation methodology.
- Data requirements and minimum sample size.
- Numerical edge cases, boundary conditions and failure behavior.
- Expected outputs and diagnostics.
- Known limitations.

Define acceptance criteria before coding:
- What constitutes a mathematically correct result?
- Which properties can be checked analytically?
- Which independent implementation can serve as a reference?
- What numerical tolerances are justified?
- Which tests and UI states are required?

When a model extends an existing model, explicitly document the mathematical relationship and identify the cases in which the extension should reduce to the existing specification.

Do not implement a model whose core specification remains undefined.

### Phase 2 — Pure implementation and deterministic testing

Implement calculations in isolated, typed modules.

Requirements:
- Deterministic behavior for identical inputs and configuration.
- Explicit validation of invalid, insufficient and non-finite inputs.
- Clear distinction between successful, boundary and non-converged results.
- No silent fallback to fabricated or stale values.
- Reproducible random number generation for stochastic or simulation-based models.
- Explicit numerical safeguards, with documented justification.

Create mathematical unit tests for:
- Hand-calculated examples.
- Algebraic identities and limiting cases.
- Parameter constraints.
- Units and scaling.
- Boundary conditions.
- Invalid inputs and failure behavior.
- Numerical stability and convergence.
- Timing and absence of look-ahead where relevant.

Run focused tests during development. Do not repeatedly run the entire project suite for unrelated intermediate changes.

### Phase 3 — Independent benchmark and validation

Design the independent reference before accepting implementation results.

Use an appropriate independent tool or library where available, such as:
- Python `arch`.
- `statsmodels`.
- `scipy`.
- `numpy`.
- `pandas`.
- Another suitable independent financial or numerical reference.

The benchmark must not simply reproduce the TypeScript implementation in another language.

Record:
- Library and environment versions.
- Fixed random seed and synthetic data-generating process where applicable.
- Model configuration and parameter mapping.
- Units and initialization conventions.
- Expected outputs.
- Predefined absolute and relative tolerances.
- Benchmark limitations.

Maintain a clear separation between:
1. Synthetic reference fixtures.
2. Observed real-market evidence.
3. Unit and mathematical tests.
4. Out-of-sample forecasting or backtesting evidence.

Do not treat a successful synthetic benchmark as proof of predictive performance.

For cross-runtime comparisons (e.g. V8 versus JavaScriptCore), use exact equality for substantive fields where appropriate and named numerical tolerances only where floating-point differences justify them. Never loosen tolerances solely to make a failing comparison pass.

Benchmark reference lifecycle:
- For a new model, generate the initial reference outputs with the independent implementation and record library/version, configuration, parameter mapping, units, data and environment.
- Have the initial reference reviewed and approved before committing it.
- Normal validation runners are read-only with respect to approved benchmark fixtures; a failed comparison must never overwrite or automatically regenerate them.
- Any later reference update requires an explicit reason, review and a traceable version change.
- Keep generated run evidence separate from approved benchmark fixtures.

### Phase 4 — UI integration

Only integrate the model after its calculation contract and core tests are stable.

- UI components must consume the model interface, not duplicate its calculations.
- Reuse existing charting and diagnostic components where appropriate.
- Provide clear loading, success, error, non-convergence and insufficient-history states.
- Never display stale results after a dataset change or failed calculation.
- Distinguish in-sample estimation, genuine out-of-sample forecasting and observed historical values.
- Do not make claims of model superiority unsupported by statistical evidence.

Test actual data inputs where practical, keeping real-data smoke tests separate from synthetic numerical benchmarks.

### Phase 5 — Documentation and matrix reconciliation

Documentation must include:
- Mathematical formulation.
- Assumptions and parameter interpretation.
- Data requirements and units.
- Estimation and initialization methodology.
- Numerical conventions and constraints.
- Independent benchmark and reproducibility instructions.
- Known limitations and appropriate interpretation of results.

Update the quantitative matrix only when supported by actual implementation and evidence.

Maintain layer-level status independently:
- Academic Knowledge.
- Mathematical Specification.
- Code Implementation.
- User Interface.
- Validation.
- Documentation.

Keep Academic Knowledge as `PLANNED` when primary academic materials have not been verified. Do not invent references or infer that academic validation exists because the technical implementation is complete.

Do not mark a model `COMPLETED` while any required technical layer or validation gate remains unsupported.

### Phase 6 — Final regression and CI verification

Before closing:
1. Run the relevant unit and numerical tests.
2. Run the independent benchmark and model validation runner.
3. Run the full regression test suite.
4. Run TypeScript checks for all relevant configurations.
5. Run production build.
6. Run relevant browser/UI checks.
7. Inspect lint results and the final diff.
8. Confirm that unrelated modules and recorded evidence have not changed unexpectedly.

Use supported automated CI checks whenever available.

A configured workflow is not evidence of a passing check. A passing result from an earlier commit does not automatically validate subsequent changes.

Record the exact commit SHA and actual check results. If a required check cannot run, mark it `UNVERIFIED` and preserve the appropriate `IN PROGRESS` status.

Do not deploy or publish as a substitute for validation.

## 7. Token and execution efficiency

Use a progressive-inspection strategy:

1. Start from the current matrix item, relevant project instructions and existing implementation.
2. Read only the files necessary to understand the requested change.
3. Reuse established conventions, interfaces and validation utilities instead of rediscovering or recreating them.
4. Prepare a concise plan before broad changes.
5. Implement in small, logically grouped changes.
6. Run focused tests during development.
7. Run expensive full-suite and CI checks at meaningful milestones and before closure.
8. Reuse valid, commit-matched evidence; never repeat costly work without a reason.
9. Avoid reproducing large source files, fixtures or logs when a short relevant extract is sufficient.
10. Summarize completed work, blockers and next actions without lengthy progress narration.

Never sacrifice mathematical correctness, independent validation or regression protection to reduce token usage.

## 8. Scope and change control

- Work on one matrix model at a time unless an explicit dependency requires broader changes.
- Do not implement future models opportunistically.
- Do not introduce unrelated features, UI redesigns or speculative refactors.
- Do not alter validated formulas, fixtures, evidence or tolerances without identifying and justifying the reason.
- When a shared module must change, identify every dependent model and test the impact.
- If scope changes materially, explain the reason and update the implementation plan.

## 9. Required completion report

Every model implementation task must finish with a structured report:

1. Model ID and objective.
2. Mathematical specification implemented.
3. Architectural decisions and files created or changed.
4. Independent validation approach and numerical tolerances.
5. Unit, benchmark, regression and UI test results.
6. TypeScript and production-build status.
7. Exact commit SHA used for final verification.
8. Known limitations and unverified checks.
9. Final matrix layer statuses and overall status.
10. Confirmation that unrelated models and evidence were preserved.

Use only verified results. Never report success based solely on an assumption, preview, configured workflow or previous commit.

## 10. Guiding principle

Build each quantitative model as an independently understandable, reproducible and testable financial component.

The objective is not merely to make a model work in the application. It is to ensure that its mathematics, data, implementation, validation and interpretation remain defensible when reviewed, reused or extended in future research.