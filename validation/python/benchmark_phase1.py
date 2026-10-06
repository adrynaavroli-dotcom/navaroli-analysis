"""
Independent Python reference for Navaroli Quant Engine — Phase 1.

Generates a deterministic, deliberately "dirty" raw price dataset and computes
every Phase 1 metric with numpy / pandas / scipy (never with the TypeScript
code). Output: src/lib/validation/fixtures/phase1-benchmark.json, which the
Vitest benchmark suite compares against the TypeScript engine with explicit
numerical tolerances.

Run:  python validation/python/benchmark_phase1.py
"""
import json, sys, datetime, platform
from pathlib import Path
import numpy as np
import pandas as pd
import scipy
from scipy import stats

VERSION = "phase1-benchmark/1.0.0"
SEED = 20261006
N = 600
LAMBDA = 0.94
SEED_WINDOW = 20
TRADING_DAYS = 252
ROLLING = [20, 60]

rng = np.random.default_rng(SEED)

# ---------- 1. Synthetic raw data (GBM with Student-t shocks → fat tails) ----------
dates = pd.bdate_range("2022-01-03", periods=N).strftime("%Y-%m-%d").tolist()
shocks = stats.t.rvs(df=4, size=N - 1, random_state=rng) * 0.012
log_p = np.concatenate([[np.log(100.0)], np.log(100.0) + np.cumsum(shocks + 0.0002)])
clean_prices = np.exp(log_p)

raw_dates = list(dates)
raw_prices = [float(p) for p in clean_prices]
# Inject quality problems (documented, deterministic)
raw_prices[10] = None            # missing
raw_prices[57] = None            # missing
raw_prices[120] = 0.0            # non-positive
raw_prices[121] = -5.0           # non-positive
raw_dates.insert(200, raw_dates[199]); raw_prices.insert(200, raw_prices[199] * 1.01)  # duplicate date (second kept out)
block = list(zip(raw_dates[300:306], raw_prices[300:306]))[::-1]          # out-of-order block
raw_dates[300:306] = [d for d, _ in block]; raw_prices[300:306] = [p for _, p in block]

# ---------- 2. Cleaning (pandas reference) ----------
df = pd.DataFrame({"date": raw_dates, "price": raw_prices})
received = len(df)
missing = int(df["price"].isna().sum())
df = df.dropna()
non_positive = int((df["price"] <= 0).sum())
df = df[df["price"] > 0]
df = df.sort_values("date", kind="mergesort")          # stable → first occurrence preserved
dup = int(df.duplicated("date", keep="first").sum())
df = df.drop_duplicates("date", keep="first").reset_index(drop=True)
s = pd.Series(df["price"].values, index=pd.to_datetime(df["date"]))

# ---------- 3. Returns ----------
log_r = np.log(s / s.shift(1)).dropna()
simple_r = s.pct_change().dropna()
r = log_r.values

# ---------- 4. Descriptive statistics (scipy reference) ----------
jb = stats.jarque_bera(r)
desc = {
    "mean": float(np.mean(r)),
    "std": float(np.std(r, ddof=1)),
    "skewness": float(stats.skew(r, bias=True)),
    "kurtosis": float(stats.kurtosis(r, fisher=False, bias=True)),
    "jbStatistic": float(jb.statistic),
    "jbPValue": float(jb.pvalue),
}

# ---------- 5. Historical & rolling volatility (pandas reference) ----------
hist_vol = float(np.std(r, ddof=1) * np.sqrt(TRADING_DAYS))
rolling = {}
for w in ROLLING:
    v = log_r.rolling(w).std(ddof=1) * np.sqrt(TRADING_DAYS)
    rolling[str(w)] = [None if np.isnan(x) else float(x) for x in v.values]

# ---------- 6. EWMA — two independent references that must agree ----------
def ewma_loop(x, lam, seed):
    out = [None] * len(x)
    var = np.var(x[:seed], ddof=1)
    out[seed - 1] = np.sqrt(var * TRADING_DAYS)
    for t in range(seed, len(x)):
        var = lam * var + (1 - lam) * x[t - 1] ** 2
        out[t] = np.sqrt(var * TRADING_DAYS)
    return out

ewma_a = ewma_loop(r, LAMBDA, SEED_WINDOW)
seq = np.concatenate([[np.var(r[:SEED_WINDOW], ddof=1)], r[SEED_WINDOW - 1:-1] ** 2])
ewm_pd = pd.Series(seq).ewm(alpha=1 - LAMBDA, adjust=False).mean().values
ewma_b = [None] * (SEED_WINDOW - 1) + [float(np.sqrt(v * TRADING_DAYS)) for v in ewm_pd]
diff = max(abs(a - b) for a, b in zip(ewma_a, ewma_b) if a is not None)
assert diff < 1e-12, f"EWMA references disagree: {diff}"

# ---------- 7. Resampling (last observation per period) ----------
weekly = s.resample("W-SUN").last().dropna()
monthly = s.resample("ME").last().dropna()

# ---------- 8. Multi-asset alignment (inner join) ----------
b_dates = [d for i, d in enumerate(dates) if i % 7 != 3][:550]
b_prices = (50 * np.exp(np.cumsum(rng.normal(0, 0.01, len(b_dates))))).tolist()
sb = pd.Series(b_prices, index=pd.to_datetime(b_dates))
panel = pd.concat({"A": s, "B": sb}, axis=1, join="inner")

def iso(idx): return [d.strftime("%Y-%m-%d") for d in idx]

out = {
    "meta": {
        "version": VERSION, "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED, "python": platform.python_version(), "numpy": np.__version__,
        "pandas": pd.__version__, "scipy": scipy.__version__,
        "params": {"lambda": LAMBDA, "seedWindow": SEED_WINDOW, "tradingDays": TRADING_DAYS, "rolling": ROLLING},
    },
    "input": {"dates": raw_dates, "prices": raw_prices},
    "cleaning": {"received": received, "removedMissing": missing, "removedNonPositive": non_positive,
                 "removedDuplicateDates": dup, "kept": len(s), "dates": iso(s.index), "prices": s.values.tolist()},
    "returns": {"dates": iso(log_r.index), "log": log_r.values.tolist(), "simple": simple_r.values.tolist()},
    "statistics": desc,
    "volatility": {"historical": hist_vol, "rolling": rolling, "ewma": ewma_a and [None if v is None else float(v) for v in ewma_a]},
    "resample": {"weekly": {"dates": iso(weekly.index), "prices": weekly.values.tolist()},
                 "monthly": {"dates": iso(monthly.index), "prices": monthly.values.tolist()}},
    "alignment": {"B": {"dates": b_dates, "prices": b_prices}, "dates": iso(panel.index),
                  "A": panel["A"].tolist(), "BAligned": panel["B"].tolist()},
}

target = Path(__file__).resolve().parents[2] / "src/lib/validation/fixtures/phase1-benchmark.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(out, indent=1))
print(f"wrote {target} ({len(s)} clean prices, EWMA cross-check diff={diff:.2e})", file=sys.stderr)
