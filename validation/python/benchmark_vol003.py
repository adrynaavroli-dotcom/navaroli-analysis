"""
Independent Python reference — VOL-003 GARCH(1,1), constant mean, Gaussian MLE.
Reference: arch (Kevin Sheppard) — benchmark only, never a runtime dependency.
SYNTHETIC TEST DATA ONLY (fixed seeds); never presented as market observations.

Comparable conventions: estimation on y = 100·r with rescale=False; Constant mean;
GARCH(1,1); dist="normal"; backcast = arch GARCH.backcast(ê) with ê = y − ȳ (passed
explicitly to fit); variance bounds = arch variance_bounds(ê) (what fit uses internally
because its starting mean is ȳ).
Output: src/lib/validation/fixtures/vol003-benchmark.json
Run:  python validation/python/benchmark_vol003.py
"""
import json, sys, datetime, platform, warnings
from pathlib import Path
import numpy as np, arch, scipy
from arch import arch_model
from arch.univariate import GARCH

warnings.filterwarnings("ignore")
VERSION = "vol003-benchmark/1.0.0"
SEED = 20261014
rng = np.random.default_rng(SEED)
root = Path(__file__).resolve().parents[2]

def simulate(n, mu, omega, alpha, beta, burn=500):
    h = omega / (1 - alpha - beta); e_prev = 0.0; out = []
    for t in range(n + burn):
        h = omega + alpha * e_prev ** 2 + beta * h if t else h
        e = np.sqrt(h) * rng.standard_normal(); e_prev = e
        out.append(mu + e)
    return np.array(out[burn:])          # percent units (y)

def reference(y, fixed):
    vol = GARCH(1, 0, 1)
    e0 = y - y.mean()
    bc = float(vol.backcast(e0)); vb = vol.variance_bounds(e0)
    # Fixed-parameter path (arch recursion, with and without bounds)
    mu, om, al, be = fixed
    s2 = np.zeros_like(y); vol.compute_variance(np.array([om, al, be]), y - mu, s2, bc, vb)
    loose = np.column_stack([np.full(len(y), 1e-300), np.full(len(y), 1e300)])
    s2n = np.zeros_like(y); vol.compute_variance(np.array([om, al, be]), y - mu, s2n, bc, loose)
    ll_fixed = float(-0.5 * np.sum(np.log(2 * np.pi) + np.log(s2) + (y - mu) ** 2 / s2))
    res = arch_model(y, mean="Constant", vol="GARCH", p=1, q=1, dist="normal", rescale=False).fit(disp="off", backcast=bc, options={"ftol": 1e-12, "maxiter": 2000})
    p = res.params
    s2fit = np.asarray(res.conditional_volatility) ** 2
    lo, hi = vb[:, 0], vb[:, 1]
    return {
        "y": y.tolist(), "backcast": bc, "lower": lo.tolist(), "upper": hi.tolist(),
        "fixed": {"params": list(fixed), "h": s2.tolist(), "hNoBounds": s2n.tolist(), "logLik": ll_fixed,
                  "boundsActive": int(np.sum((s2n < lo) | (s2n > hi)))},
        "fit": {"mu": float(p["mu"]), "omega": float(p["omega"]), "alpha": float(p["alpha[1]"]), "beta": float(p["beta[1]"]),
                "logLik": float(res.loglikelihood), "aic": float(res.aic), "bic": float(res.bic), "h": s2fit.tolist(),
                "se": {"mu": float(res.std_err["mu"]), "omega": float(res.std_err["omega"]), "alpha": float(res.std_err["alpha[1]"]), "beta": float(res.std_err["beta[1]"])},
                "convergenceFlag": int(res.convergence_flag),
                "boundsActive": int(np.sum((s2fit < lo * (1 - 1e-12)) | (s2fit > hi * (1 + 1e-12))))},
    }

cases = {
    "garch_n1500": (simulate(1500, 0.04, 0.05, 0.10, 0.85), (0.04, 0.05, 0.10, 0.85)),
    "high_persistence_n2000": (simulate(2000, 0.02, 0.01, 0.05, 0.94), (0.02, 0.01, 0.05, 0.94)),
    "iid_normal_n1000": (rng.standard_normal(1000) * 1.2, (0.0, 1.0, 0.05, 0.5)),
}
p1 = json.loads((root / "src/lib/validation/fixtures/phase1-benchmark.json").read_text())
cases["phase1_synthetic_logreturns"] = (100 * np.array(p1["returns"]["log"]), (0.0, 0.05, 0.08, 0.9))

TRUE = {"mu": 0.05, "omega": 0.02, "alpha": 0.08, "beta": 0.90}
recovery = []
for k in range(6):
    y = simulate(2500, TRUE["mu"], TRUE["omega"], TRUE["alpha"], TRUE["beta"])
    r = reference(y, tuple(TRUE.values()))
    recovery.append({"y": y.tolist(), "fit": {k2: r["fit"][k2] for k2 in ("mu", "omega", "alpha", "beta", "logLik", "se")}})

out = {
    "meta": {"version": VERSION, "seed": SEED, "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
             "python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__, "arch": arch.__version__,
             "dataType": "SYNTHETIC TEST DATA (percent units y = 100·r)", "scale": 100},
    "cases": {k: reference(y, f) for k, (y, f) in cases.items()},
    "recovery": {"true": TRUE, "samples": recovery},
}
(root / "src/lib/validation/fixtures/vol003-benchmark.json").write_text(json.dumps(out))
for k, v in out["cases"].items():
    f = v["fit"]; print(f"{k}: mu={f['mu']:.4f} omega={f['omega']:.4f} alpha={f['alpha']:.4f} beta={f['beta']:.4f} ll={f['logLik']:.4f} flag={f['convergenceFlag']} boundsFixed={v['fixed']['boundsActive']} boundsFit={f['boundsActive']}", file=sys.stderr)
