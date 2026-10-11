"""
Independent Python reference — COR-003 EWMA covariance.
SYNTHETIC TEST DATA ONLY: reuses the aligned returns panel of the Phase 4 fixture
(already validated vs pandas) so that only the EWMA estimator is under test.

Independence: the web engine uses the recursion; here Σ_t is computed in CLOSED FORM
    Σ_t = λ^{t−s+1} Σ_seed + (1−λ) Σ_{k=s−1}^{t−1} λ^{t−1−k} r_k r_kᵀ
with numpy matrix products (seed = np.cov(ddof=1) of the first s returns).
Output: src/lib/validation/fixtures/cor003-benchmark.json
Run:  python validation/python/benchmark_cor003.py
"""
import json, sys, datetime, platform
from pathlib import Path
import numpy as np

VERSION = "cor003-benchmark/1.0.0"
LAMBDA, SEED_W = 0.94, 20
root = Path(__file__).resolve().parents[2]
p4 = json.loads((root / "src/lib/validation/fixtures/phase4-benchmark.json").read_text())
R = np.array(p4["panel"]["returns"])
T, N = R.shape

def ewma_closed_form(R, lam, s):
    seed = np.cov(R[:s], rowvar=False, ddof=1)
    out = [None] * len(R)
    out[s - 1] = seed
    for t in range(s, len(R)):
        k = np.arange(s - 1, t)                      # returns r_{s-1} .. r_{t-1}
        w = (1 - lam) * lam ** (t - 1 - k)
        out[t] = lam ** (t - s + 1) * seed + (R[k].T * w) @ R[k]
    return out

cov = ewma_closed_form(R, LAMBDA, SEED_W)
corr = [None if S is None else (S / np.sqrt(np.outer(np.diag(S), np.diag(S)))) for S in cov]
min_eig = min(float(np.linalg.eigvalsh(S).min()) for S in cov if S is not None)
lam2 = ewma_closed_form(R, 0.97, SEED_W)            # second λ to guard against hard-coded constants

# Univariate reference for diagonal consistency with VOL-002: σ²_t loop on asset 0.
x = R[:, 0]; v = np.var(x[:SEED_W], ddof=1); uni = [None] * T; uni[SEED_W - 1] = v
for t in range(SEED_W, T): v = LAMBDA * v + (1 - LAMBDA) * x[t - 1] ** 2; uni[t] = v

L = lambda xs: [None if S is None else S.tolist() for S in xs]
out = {
    "meta": {"version": VERSION, "lambda": LAMBDA, "seed": SEED_W, "source": p4["meta"]["version"],
             "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
             "python": platform.python_version(), "numpy": np.__version__, "dataType": "SYNTHETIC TEST DATA"},
    "cov": L(cov), "corr": L(corr), "covLambda097": L(lam2), "minEigenvalue": min_eig, "univariateVar0": uni,
}
target = root / "src/lib/validation/fixtures/cor003-benchmark.json"
target.write_text(json.dumps(out))
print(f"wrote {target}: T={T} N={N} min eigenvalue={min_eig:.3e}", file=sys.stderr)
