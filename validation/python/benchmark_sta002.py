"""
Independent Python reference — STA-002 time-series diagnostics (ACF, Ljung–Box, ADF).
SYNTHETIC TEST DATA ONLY (deterministic seed), never presented as market data.
References: statsmodels (acf, acorr_ljungbox, adfuller regression="c" autolag="AIC",
mackinnonp, mackinnoncrit) and scipy.stats (chi2, norm).
Output: src/lib/validation/fixtures/sta002-benchmark.json
Run:  python validation/python/benchmark_sta002.py
"""
import json, sys, datetime, platform, warnings
from pathlib import Path
import numpy as np, scipy, statsmodels
from scipy import stats
from statsmodels.tsa.stattools import acf, adfuller
from statsmodels.stats.diagnostic import acorr_ljungbox
from statsmodels.tsa.adfvalues import mackinnonp, mackinnoncrit

warnings.filterwarnings("ignore", category=FutureWarning)
VERSION = "sta002-benchmark/1.0.0"
SEED = 20261012
rng = np.random.default_rng(SEED)
LAGS = [10, 20]
NLAGS = 20

def ar1(phi, n, scale=0.01):
    e = rng.standard_normal(n) * scale; x = np.zeros(n)
    for t in range(1, n): x[t] = phi * x[t - 1] + e[t]
    return x

def arch1(n, w=2e-5, a=0.6):
    r = np.zeros(n); s2 = w / (1 - a)
    for t in range(n):
        r[t] = np.sqrt(s2) * rng.standard_normal(); s2 = w + a * r[t] ** 2
    return r

series = {
    "iid_normal_500": rng.standard_normal(500) * 0.01,
    "ar1_phi05_500": ar1(0.5, 500),
    "arch1_returns_750": arch1(750),
    "random_walk_logprice_500": np.log(100) + np.cumsum(rng.standard_normal(500) * 0.01),
    "ar1_phi07_level_300": 1.0 + ar1(0.7, 300, 0.05),
    "short_iid_60": rng.standard_normal(60),
}
series["arch1_squared_750"] = series["arch1_returns_750"] ** 2

out_series = {}
for name, x in series.items():
    lb = acorr_ljungbox(x, lags=LAGS)
    adf = adfuller(x, regression="c", autolag="AIC", result_object=False)
    out_series[name] = {
        "x": x.tolist(),
        "acf": acf(x, nlags=NLAGS, fft=False).tolist(),
        "ljungBox": [{"lag": int(l), "statistic": float(lb.loc[l, "lb_stat"]), "pValue": float(lb.loc[l, "lb_pvalue"])} for l in LAGS],
        "adf": {"statistic": float(adf[0]), "pValue": float(adf[1]), "usedLag": int(adf[2]), "nobs": int(adf[3]),
                "critical": {k: float(v) for k, v in adf[4].items()}, "icBest": float(adf[5])},
    }

taus = np.linspace(-18, 2.5, 83).tolist() + [-1.61, -1.6100001, 3.0, -19.0]
xs = [0.01, 0.5, 1, 3, 9.34, 18.3, 25, 31.4, 40, 60, 120]
zs = np.linspace(-8, 8, 65).tolist()
out = {
    "meta": {"version": VERSION, "seed": SEED, "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
             "python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__, "statsmodels": statsmodels.__version__,
             "dataType": "SYNTHETIC TEST DATA", "lags": LAGS, "nlags": NLAGS},
    "series": out_series,
    "mackinnon": {"tau": taus, "p": [float(mackinnonp(t, regression="c", N=1)) for t in taus],
                  "nobs": [25, 50, 100, 250, 500, 1000], "crit": [mackinnoncrit(N=1, regression="c", nobs=n).tolist() for n in [25, 50, 100, 250, 500, 1000]]},
    "chi2": [{"x": x, "df": df, "sf": float(stats.chi2.sf(x, df))} for x in xs for df in (1, 2, 5, 10, 20)],
    "normal": {"z": zs, "cdf": stats.norm.cdf(zs).tolist()},
}
target = Path(__file__).resolve().parents[2] / "src/lib/validation/fixtures/sta002-benchmark.json"
target.write_text(json.dumps(out))
for k, v in out_series.items(): print(f"{k}: LB10 p={v['ljungBox'][0]['pValue']:.3g} ADF tau={v['adf']['statistic']:.3f} p={v['adf']['pValue']:.3g} lag={v['adf']['usedLag']}", file=sys.stderr)
