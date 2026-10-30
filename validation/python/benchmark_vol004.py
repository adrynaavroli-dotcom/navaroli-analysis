"""
Independent Python reference — VOL-004 GJR-GARCH(1,1,1), constant mean, Gaussian MLE.
Reference: arch 8.0.0 (Kevin Sheppard) — benchmark only, never a runtime dependency.
SYNTHETIC TEST DATA ONLY (fixed seed); never presented as market observations.

arch mapping: arch_model(y, mean="Constant", vol="GARCH", p=1, o=1, q=1, power=2,
dist="normal", rescale=False); parameter order [mu, omega, alpha[1], gamma[1], beta[1]];
constraints alpha>=0, alpha+gamma>=0, beta>=0, alpha+gamma/2+beta<1 (gamma may be negative).
Backcast = GARCH.backcast(ê), ê = y − ȳ, passed explicitly to fit. Units: y = 100·r.

The approved reference is written ONCE to src/lib/validation/fixtures/vol004-benchmark.json.
This script refuses to overwrite an existing fixture unless --update "<reason>" is given;
the TypeScript runner only reads it.
Run:  python validation/python/benchmark_vol004.py [--update "reason"]
"""
import json, sys, datetime, platform, warnings
from pathlib import Path
import numpy as np, arch, scipy
from arch import arch_model
from arch.univariate import GARCH

warnings.filterwarnings("ignore")
VERSION = "vol004-benchmark/1.0.0"
SEED = 20261030
root = Path(__file__).resolve().parents[2]
target = root / "src/lib/validation/fixtures/vol004-benchmark.json"
if target.exists() and "--update" not in sys.argv:
    sys.exit(f"{target} exists (approved reference). Re-run with --update \"<reason>\" to replace it deliberately.")
rng = np.random.default_rng(SEED)

def simulate(n, mu, omega, alpha, gamma, beta, burn=500):
    h = omega / (1 - alpha - gamma / 2 - beta); e_prev = 0.0; out = []
    for t in range(n + burn):
        if t:
            h = omega + (alpha + gamma * (e_prev < 0)) * e_prev ** 2 + beta * h
        e = np.sqrt(h) * rng.standard_normal(); e_prev = e
        out.append(mu + e)
    return np.array(out[burn:])  # percent units (y)

NAMES = ["mu", "omega", "alpha[1]", "gamma[1]", "beta[1]"]
KEYS = ["mu", "omega", "alpha", "gamma", "beta"]

def fixed_path(vol, y, prm, bc, vb):
    mu, om, al, ga, be = prm
    s2 = np.zeros_like(y); vol.compute_variance(np.array([om, al, ga, be]), y - mu, s2, bc, vb)
    ll = float(-0.5 * np.sum(np.log(2 * np.pi) + np.log(s2) + (y - mu) ** 2 / s2))
    act = int(np.sum((s2 <= vb[:, 0]) | (s2 >= vb[:, 1])))
    return {"params": list(prm), "h": s2.tolist(), "logLik": ll, "boundsActive": act}

def reference(y, fixed_sets):
    vol = GARCH(1, 1, 1)
    e0 = y - y.mean()
    bc = float(vol.backcast(e0)); vb = vol.variance_bounds(e0)
    res = arch_model(y, mean="Constant", vol="GARCH", p=1, o=1, q=1, power=2, dist="normal", rescale=False).fit(
        disp="off", backcast=bc, options={"ftol": 1e-12, "maxiter": 2000})
    p, se = res.params, res.std_err
    fit = {k: float(p[n]) for k, n in zip(KEYS, NAMES)}
    fit.update({"logLik": float(res.loglikelihood), "aic": float(res.aic), "bic": float(res.bic),
                "h": (np.asarray(res.conditional_volatility) ** 2).tolist(),
                "se": {k: float(se[n]) for k, n in zip(KEYS, NAMES)}, "convergenceFlag": int(res.convergence_flag)})
    return {"y": y.tolist(), "backcast": bc, "lower": vb[:, 0].tolist(), "upper": vb[:, 1].tolist(),
            "fixed": [fixed_path(vol, y, f, bc, vb) for f in fixed_sets], "fit": fit}

TRUE = {"mu": 0.05, "omega": 0.02, "alpha": 0.03, "gamma": 0.12, "beta": 0.88}
y_asym = simulate(2000, *TRUE.values())
y_sym = simulate(800, 0.04, 0.05, 0.10, 0.0, 0.85)
cases = {
    # Fixed sets: true params; and a NEGATIVE-gamma admissible point (alpha+gamma>=0) to pin the indicator convention.
    "gjr_asymmetric_n2000": reference(y_asym, [tuple(TRUE.values()), (0.05, 0.02, 0.08, -0.05, 0.88)]),
    "gjr_true_gamma0_n800": reference(y_sym, [(0.04, 0.05, 0.10, 0.0, 0.85)]),
}
out = {"meta": {"version": VERSION, "seed": SEED, "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                "python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__, "arch": arch.__version__,
                "dataType": "SYNTHETIC TEST DATA (percent units y = 100·r)", "scale": 100,
                "updateReason": sys.argv[sys.argv.index("--update") + 1] if "--update" in sys.argv else "initial reference"},
       "true": TRUE, "cases": cases}
target.write_text(json.dumps(out))
for k, v in cases.items():
    f = v["fit"]
    print(k, {kk: round(f[kk], 5) for kk in KEYS}, "ll", round(f["logLik"], 4), "flag", f["convergenceFlag"],
          "se", {kk: round(f["se"][kk], 4) for kk in KEYS}, "boundsFixed", [x["boundsActive"] for x in v["fixed"]], file=sys.stderr)
