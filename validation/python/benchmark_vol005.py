"""
Independent Python reference — VOL-005 multi-step GARCH(1,1) variance forecasts
and forecast-evaluation metrics (QLIKE / MSE).
Reference: arch (Kevin Sheppard) — benchmark only, never a runtime dependency.
SYNTHETIC TEST DATA ONLY (fixed seed); never presented as market observations.

What is pinned here:
  1. arch `forecast(horizon=20, start=t, reindex=False)` variance paths at fixed
     origins, using full-sample fitted parameters — the reference for the
     analytic multi-step formula h_{t+k|t} = h̄ + ρ^{k−1}(h_{t+1|t} − h̄).
  2. The one-step state h_{t+1|t} = ω + α(y_t − μ)² + β h_t from arch's
     conditional variance path.
  3. QLIKE (robust comparison form: mean(ln v̂ + proxy/v̂)) and MSE between
     mean forecast variance and the mean squared-return proxy, computed with
     numpy from stored v̂/proxy arrays — the reference for the metric code.

Output: src/lib/validation/fixtures/vol005-benchmark.json
Run:  python validation/python/benchmark_vol005.py
"""
import json, sys, datetime, platform, warnings
from pathlib import Path
import numpy as np, arch
from arch import arch_model

warnings.filterwarnings("ignore")
VERSION = "vol005-benchmark/1.0.0"
SEED = 20261020
rng = np.random.default_rng(SEED)
root = Path(__file__).resolve().parents[2]
H = 20
ORIGINS = [1000, 1200, 1400]

def simulate(n, mu, omega, alpha, beta, burn=500):
    h = omega / (1 - alpha - beta); e_prev = 0.0; out = []
    for t in range(n + burn):
        h = omega + alpha * e_prev ** 2 + beta * h if t else h
        e = np.sqrt(h) * rng.standard_normal(); e_prev = e
        out.append(mu + e)
    return np.array(out[burn:])          # percent units (y = 100·r)

y = simulate(1500, 0.04, 0.05, 0.10, 0.85)
res = arch_model(y, mean="Constant", vol="GARCH", p=1, q=1, dist="normal", rescale=False).fit(
    disp="off", options={"ftol": 1e-12, "maxiter": 2000})
p = res.params
mu, om, al, be = float(p["mu"]), float(p["omega"]), float(p["alpha[1]"]), float(p["beta[1]"])
h_path = np.asarray(res.conditional_volatility) ** 2

f = res.forecast(horizon=H, start=ORIGINS[0], reindex=False)
cases = {}
for t in ORIGINS:
    fcast = np.asarray(f.residual_variance.iloc[t - ORIGINS[0]].values, dtype=float)  # h_{t+1..t+20|t}
    h1_state = om + al * (y[t] - mu) ** 2 + be * h_path[t]  # one-step from arch state
    # Sanity: arch's first forecast equals the one-step recursion from its own state.
    assert abs(fcast[0] - h1_state) < 1e-8 * h1_state, (t, fcast[0], h1_state)
    # Sanity: closed form matches arch's recursion.
    rho = al + be; hbar = om / (1 - rho)
    closed = hbar + rho ** np.arange(H) * (fcast[0] - hbar)
    assert np.max(np.abs(closed - fcast)) < 1e-8 * np.max(fcast), t
    cases[str(t)] = {
        "h_t": float(h_path[t]),
        "h1": float(h1_state),
        "forecast": fcast.tolist(),
        # Realized proxy for metric checks: squared future returns y²_{t+1..t+20}.
        "proxy": (y[t + 1: t + 1 + H] ** 2).tolist(),
    }

# Metric reference (numpy): per horizon, mean forecast variance vs mean proxy.
metrics = {}
for t in ORIGINS:
    vhat = np.array(cases[str(t)]["forecast"]); proxy = np.array(cases[str(t)]["proxy"])
    per_h = {}
    for h in (1, 5, 10, 20):
        v = float(vhat[:h].mean()); rv = float(proxy[:h].mean())
        per_h[str(h)] = {"vhat": v, "proxy": rv, "qlike": float(np.log(v) + rv / v), "mse": float((v - rv) ** 2)}
    metrics[str(t)] = per_h

out = {
    "meta": {"version": VERSION, "seed": SEED, "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
             "python": platform.python_version(), "numpy": np.__version__, "arch": arch.__version__,
             "dataType": "SYNTHETIC TEST DATA (percent units y = 100·r)", "scale": 100, "horizon": H, "origins": ORIGINS},
    "y": y.tolist(),
    "fit": {"mu": mu, "omega": om, "alpha": al, "beta": be,
            "se": {"mu": float(res.std_err["mu"]), "omega": float(res.std_err["omega"]),
                   "alpha": float(res.std_err["alpha[1]"]), "beta": float(res.std_err["beta[1]"])},
            "convergenceFlag": int(res.convergence_flag)},
    "cases": cases,
    "metrics": metrics,
}
(root / "src/lib/validation/fixtures/vol005-benchmark.json").write_text(json.dumps(out))
print(f"mu={mu:.4f} omega={om:.4f} alpha={al:.4f} beta={be:.4f} flag={res.convergence_flag}", file=sys.stderr)
for t in ORIGINS:
    print(f"origin {t}: h1={cases[str(t)]['h1']:.6f} fcast20={cases[str(t)]['forecast'][-1]:.6f}", file=sys.stderr)
