"""
DAT-001 — independent-source validation.

Downloads the daily split-adjusted close of AAPL for calendar year 2024 from
two FREE sources and writes a reproducible snapshot that the TypeScript suite
compares element-wise:

    * Yahoo Finance   (query1.finance.yahoo.com, used in production)
    * Nasdaq Data     (api.nasdaq.com/api/quote/.../historical, independent)

Both feeds publish SPLIT-ADJUSTED closes (no dividend reinvestment), so the
comparison is like-for-like.  Yahoo *adjclose* and Nasdaq close differ because
Yahoo also reinvests dividends; that series is persisted but NOT compared.

Regenerate:  python validation/python/benchmark_dat001.py
"""
from __future__ import annotations

import json
import pathlib
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "src/lib/validation/fixtures/dat001-snapshot.json"
TICKER = "AAPL"
START = datetime(2024, 1, 1, tzinfo=timezone.utc)
END = datetime(2024, 12, 31, tzinfo=timezone.utc)
UA = "Mozilla/5.0 (quant-matrix validation)"


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,text/plain"})
    with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 - public free endpoints
        return r.read()


def fetch_yahoo(ticker: str, start: datetime, end: datetime) -> dict:
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        f"?period1={int(start.timestamp())}&period2={int(end.timestamp())}&interval=1d"
    )
    data = json.loads(_get(url))["chart"]["result"][0]
    ts = data["timestamp"]
    close = data["indicators"]["quote"][0]["close"]
    adj = data["indicators"]["adjclose"][0]["adjclose"]
    rows = []
    for t, c, a in zip(ts, close, adj):
        if c is None:
            continue
        d = datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%d")
        rows.append({"date": d, "close": float(c), "adjclose": None if a is None else float(a)})
    rows.sort(key=lambda r: r["date"])
    return {"provider": "Yahoo Finance", "endpoint": url, "basis": "split-adjusted close", "rows": rows}


def fetch_nasdaq(ticker: str, start: datetime, end: datetime) -> dict:
    # Nasdaq caps limit at ~250 days per call; one year of US stock = ≤252 trading days.
    url = (
        f"https://api.nasdaq.com/api/quote/{ticker}/historical"
        f"?assetclass=stocks&fromdate={start:%Y-%m-%d}&todate={end:%Y-%m-%d}&limit=400"
    )
    data = json.loads(_get(url))["data"]["tradesTable"]
    rows = []
    for r in data["rows"] or []:
        d = datetime.strptime(r["date"], "%m/%d/%Y").strftime("%Y-%m-%d")
        price = float(r["close"].replace("$", "").replace(",", ""))
        rows.append({"date": d, "close": price})
    rows.sort(key=lambda r: r["date"])
    return {"provider": "Nasdaq (api.nasdaq.com)", "endpoint": url, "basis": "split-adjusted close", "rows": rows}


def compare(a: list[dict], b: list[dict]) -> dict:
    """Element-wise comparison on the intersection of dates (split-adjusted close)."""
    bmap = {r["date"]: r["close"] for r in b}
    overlap, max_abs, max_rel, sum_abs = [], 0.0, 0.0, 0.0
    for r in a:
        if r["date"] not in bmap:
            continue
        y, n = r["close"], bmap[r["date"]]
        e = abs(y - n)
        max_abs = max(max_abs, e)
        max_rel = max(max_rel, e / abs(n) if n else 0.0)
        sum_abs += e
        overlap.append({"date": r["date"], "a": y, "b": n, "absError": e})
    only_a = sorted({r["date"] for r in a} - set(bmap))
    only_b = sorted(set(bmap) - {r["date"] for r in a})
    return {
        "overlap": len(overlap),
        "onlyA": only_a,
        "onlyB": only_b,
        "maxAbsError": max_abs,
        "maxRelError": max_rel,
        "meanAbsError": sum_abs / len(overlap) if overlap else 0.0,
        "rows": overlap,
    }


def main() -> None:
    yahoo = fetch_yahoo(TICKER, START, END)
    nasdaq = fetch_nasdaq(TICKER, START, END)
    diff = compare(yahoo["rows"], nasdaq["rows"])
    snapshot = {
        "version": "dat001-snapshot/1.0.0",
        "ticker": TICKER,
        "range": {"from": START.strftime("%Y-%m-%d"), "to": END.strftime("%Y-%m-%d")},
        "retrievedAt": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
        "currency": "USD",
        "sources": {"yahoo": yahoo, "nasdaq": nasdaq},
        "comparison": {
            "basis": "split-adjusted close (both providers)",
            "excludedBasis": "Yahoo adjclose (dividend-reinvested) stored but NOT compared — Nasdaq exposes no equivalent field",
            **diff,
        },
        "reproducibility": "python validation/python/benchmark_dat001.py (no API key, no auth, free endpoints)",
    }
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps(snapshot, indent=1) + "\n")
    print(
        f"snapshot: Yahoo={len(yahoo['rows'])} rows, Nasdaq={len(nasdaq['rows'])} rows, "
        f"overlap={diff['overlap']}, maxAbs={diff['maxAbsError']:.6g}, "
        f"maxRel={diff['maxRelError']:.3e}, onlyYahoo={len(diff['onlyA'])}, onlyNasdaq={len(diff['onlyB'])}"
    )


if __name__ == "__main__":
    main()
