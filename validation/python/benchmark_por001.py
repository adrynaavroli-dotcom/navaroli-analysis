#!/usr/bin/env python3
"""Independent reference for POR-001 — Global Minimum Variance portfolio.

Generates SYNTHETIC covariance matrices (fixed seed) and computes:
  - unconstrained GMV via numpy.linalg.solve (never an explicit inverse);
  - long-only capped GMV via scipy.optimize.minimize (SLSQP, tight tolerances);
  - KKT residuals of the constrained solution;
  - derived metrics (HHI, effective N, turnover).

This script is the ONLY writer of the approved fixture
src/lib/validation/fixtures/por001-benchmark.json. Regenerating it requires an
explicit reason:  python3 benchmark_por001.py --update "<reason>"
The TypeScript runner (validation/run-por001.ts) is read-only against it.

Usage: python3 benchmark_por001.py [--update "<reason>"]
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

SEED = 20261031
FIXTURE = Path(__file__).resolve().parents[2] / "src/lib/validation/fixtures/por001-benchmark.json"
VERSION = "por001-benchmark@1.0.0"


def spd_case(rng: np.random.Generator, n: int, cond_target: float) -> np.ndarray:
    """SPD matrix with approximately the target condition number: QΛQᵀ."""
    q, _ = np.linalg.qr(rng.standard_normal((n, n)))
    lam = np.linspace(1.0, cond_target, n) * 1e-4
    return q @ np.diag(lam) @ q.T


def gmv_closed(S: np.ndarray):
    x = np.linalg.solve(S, np.ones(S.shape[0]))
    s = x.sum()
    w = x / s
    return w, float(1.0 / s)


def gmv_constrained(S: np.ndarray, w_max: float):
    n = S.shape[0]
    f = lambda w: 0.5 * w @ S @ w
    jac = lambda w: S @ w
    cons = [{"type": "eq", "fun": lambda w: w.sum() - 1.0, "jac": lambda w: np.ones(n)}]
    bounds = [(0.0, w_max)] * n
    res = minimize(f, np.full(n, 1.0 / n), jac=jac, bounds=bounds, constraints=cons,
                   method="SLSQP", options={"ftol": 1e-15, "maxiter": 1000})
    assert res.success, f"SLSQP failed: {res.message}"
    w = res.x
    # KKT residuals: budget, bounds, and stationarity with a single λ.
    g = S @ w
    free = (w > 1e-9) & (w < w_max - 1e-9)
    lam = float(np.mean(g[free])) if free.any() else float(np.mean(g))
    lower_viol = max(0.0, float(np.max(lam - g[w <= 1e-9])) if (w <= 1e-9).any() else 0.0)
    upper_viol = max(0.0, float(np.max(g[w >= w_max - 1e-9] - lam)) if (w >= w_max - 1e-9).any() else 0.0)
    kkt = max(abs(float(w.sum()) - 1.0), lower_viol, upper_viol,
              float(np.max(np.abs(g[free] - lam))) if free.any() else 0.0)
    return w, float(w @ S @ w), kkt


def main() -> None:
    update_reason = None
    if len(sys.argv) >= 3 and sys.argv[1] == "--update":
        update_reason = sys.argv[2]
    if FIXTURE.exists() and update_reason is None:
        raise SystemExit(
            f"Refusing to overwrite approved fixture {FIXTURE.name}. "
            'Pass --update "<reason>" to regenerate with a traceable reason.'
        )

    rng = np.random.default_rng(SEED)
    cases = {}
    specs = [
        ("well_conditioned_3", 3, 10.0, 1.0),
        ("correlated_4", 4, 200.0, 0.5),
        ("cap_binds_5", 5, 50.0, 0.24),
        ("near_singular_3", 3, 1e6, 1.0),
    ]
    for name, n, cond, w_max in specs:
        S = spd_case(rng, n, cond)
        wu, vu = gmv_closed(S)
        wc, vc, kkt = gmv_constrained(S, w_max)
        cases[name] = {
            "S": S.tolist(),
            "maxWeight": w_max,
            "closed": {"weights": wu.tolist(), "variance": vu},
            "constrained": {"weights": wc.tolist(), "variance": vc, "kktResidual": kkt},
            "conditionNumber": float(np.linalg.cond(S)),
            "hhi": float(wc @ wc),
            "effectiveN": float(1.0 / (wc @ wc)),
        }

    fixture = {
        "meta": {
            "version": VERSION,
            "seed": SEED,
            "python": sys.version.split()[0],
            "numpy": np.__version__,
            "scipy": __import__("scipy").__version__,
            "updateReason": update_reason or "initial generation",
        },
        "cases": cases,
    }
    FIXTURE.write_text(json.dumps(fixture, indent=2))
    print(f"wrote {FIXTURE} ({len(cases)} cases)")


if __name__ == "__main__":
    main()
