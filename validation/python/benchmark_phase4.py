"""
Independent Python reference — Phase 4 Covariance & Correlation (COR-001/002).
SYNTHETIC TEST DATA ONLY (deterministic), never presented as market data.
Output: src/lib/validation/fixtures/phase4-benchmark.json
Run:  python validation/python/benchmark_phase4.py
"""
import json, sys, datetime, platform
from pathlib import Path
import numpy as np, pandas as pd

VERSION = "phase4-benchmark/1.0.0"
SEED = 20261009
rng = np.random.default_rng(SEED)
nan_to_none = lambda a: [[None if np.isnan(v) else float(v) for v in row] for row in np.asarray(a)]

def iso(idx): return [d.strftime("%Y-%m-%d") for d in idx]

# --- Case A: rolling panel with missing dates & unequal histories (prices) ---
dates = pd.bdate_range("2023-01-02", periods=320)
L = np.linalg.cholesky(np.array([[1, .6, -.3, .1], [.6, 1, -.2, .2], [-.3, -.2, 1, 0], [.1, .2, 0, 1]]))
shocks = rng.standard_normal((len(dates), 4)) @ L.T * np.array([.010, .015, .008, .020])
prices = 100 * np.exp(np.cumsum(shocks, axis=0))
series = {}
for j, t in enumerate(["AAA", "BBB", "CCC", "DDD"]):
    s = pd.Series(prices[:, j], index=dates)
    if t == "BBB": s = s.drop(s.index[[15, 16, 140, 200]])          # missing dates
    if t == "CCC": s = s.iloc[30:]                                    # shorter history
    if t == "DDD": s = s.drop(s.index[[50, 51, 52]])
    series[t] = s
panel = pd.concat(series, axis=1, join="inner")                     # Returns Engine rule: inner join on prices
rets = np.log(panel / panel.shift(1)).dropna()
rolling = {}
for W in (20, 60, 120):
    cov = rets.rolling(W).cov(); corr = rets.rolling(W).corr()
    rolling[str(W)] = {
        "cov": [None if i < W - 1 else nan_to_none(cov.loc[d].values) for i, d in enumerate(rets.index)],
        "corr": [None if i < W - 1 else nan_to_none(corr.loc[d].values) for i, d in enumerate(rets.index)],
    }

# --- Case B: hand-checkable 3-asset sample covariance ---
hand = np.array([[1., 2., 0.], [2., 1., 1.], [3., 3., 2.], [4., 2., 1.]])  # cols x, y, z
hand_cov = np.cov(hand, rowvar=False, ddof=1)

# --- Case C: perfect +/− correlation, independent, constant ---
a = rng.normal(0, .01, 200)
pos = np.column_stack([a, 2 * a + 0.001])
neg = np.column_stack([a, -3 * a + 0.002])
indep = rng.standard_normal((5000, 2)) * 0.01
const = np.column_stack([a[:30], np.full(30, 0.0005)])

out = {
    "meta": {"version": VERSION, "seed": SEED, "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
             "python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__, "dataType": "SYNTHETIC TEST DATA"},
    "panel": {"input": {t: {"dates": iso(s.index), "prices": s.values.tolist()} for t, s in series.items()},
              "alignedDates": iso(panel.index), "returnDates": iso(rets.index), "returns": rets.values.tolist(), "rolling": rolling},
    "hand": {"rows": hand.tolist(), "cov": hand_cov.tolist()},
    "perfectPositive": {"rows": pos.tolist(), "corr": float(np.corrcoef(pos, rowvar=False)[0, 1])},
    "perfectNegative": {"rows": neg.tolist(), "corr": float(np.corrcoef(neg, rowvar=False)[0, 1])},
    "independent": {"rows": indep.tolist(), "corr": float(np.corrcoef(indep, rowvar=False)[0, 1]), "bound": 4 / np.sqrt(len(indep))},
    "constant": {"rows": const.tolist(), "cov": np.cov(const, rowvar=False, ddof=1).tolist()},
}
target = Path(__file__).resolve().parents[2] / "src/lib/validation/fixtures/phase4-benchmark.json"
target.write_text(json.dumps(out))
print(f"wrote {target}: {len(panel)} aligned prices, {len(rets)} returns, indep rho={out['independent']['corr']:.4f}", file=sys.stderr)
