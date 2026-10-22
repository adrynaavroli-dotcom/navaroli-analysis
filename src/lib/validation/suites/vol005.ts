/**
 * VOL-005 validation suite.
 *  - independent-benchmark: multi-step GARCH(1,1) variance paths and QLIKE/MSE vs
 *    Python arch 8.0.0 / numpy on a SYNTHETIC fixed-seed fixture (formula check only;
 *    the reference uses one full-sample fit, so it does NOT validate the rolling protocol).
 *  - numerical: hand-computable engine cases (closed form vs recursion, constant-|r| series).
 *  - out-of-sample: the genuine rolling-origin evaluation on the OBSERVED DAT-001
 *    AAPL Yahoo snapshot. "passed" means the protocol was satisfied (≥100 common origins
 *    at H=20, all four models scored, no refit failure hidden) — NOT that a model forecasts well.
 */
import { buildReturnsDataset } from '../../returns';
import {
  evaluateForecastModels, forecastMetrics, garchVarianceForecastAnalytic, garchVarianceForecastPath,
  FORECAST_MODELS, BASELINE_MODEL, GARCH_REFIT_EVERY, MIN_OOS_ORIGINS, type ForecastEvaluation, type ForecastOutcome,
} from '../../volatility/forecast';
import type { GarchParams } from '../../volatility/garch';
import { compareExact, compareNumeric, type CompareMeta } from '../compare';
import type { ValidationResult } from '../types';

export const VOL005_IMPLEMENTATION_VERSION = 'quant-engine/vol005-forecast-eval@1.0.0';

export interface Vol005Fixture {
  meta: { version: string; seed: number; python: string; numpy: string; arch: string; scale: number; horizon: number; origins: number[] };
  y: number[];
  fit: GarchParams;
  cases: Record<string, { h_t: number; h1: number; forecast: number[]; proxy: number[] }>;
  metrics: Record<string, Record<string, { vhat: number; proxy: number; qlike: number; mse: number }>>;
}
interface SnapshotRow { date: string; close: number; adjclose: number }
export interface Dat001Snapshot { version: string; ticker: string; retrievedAt: string; currency: string | null; sources: { yahoo: { provider: string; basis: string; rows: number; data?: SnapshotRow[]; prices?: SnapshotRow[] } } }

export interface ObservedEvaluationRecord {
  dataType: 'OBSERVED MARKET DATA';
  snapshot: { path: string; version: string; retrievedAt: string; provider: string; ticker: string; currency: string | null; priceBasis: string; priceRows: number; firstPriceDate: string; lastPriceDate: string };
  returns: { kind: 'log'; n: number; firstDate: string; lastDate: string };
  protocol: { trainSize: number; refitEvery: number; minOrigins: number; baseline: string; horizons: number[]; proxy: string; qlike: string };
  outcome: ForecastOutcome;
  runtimeMs: number;
  implementationVersion: string;
  evaluatedAt: string;
}

const rowsOf = (s: Dat001Snapshot) => {
  const y = s.sources.yahoo as unknown as Record<string, unknown>;
  const arr = Object.values(y).find(Array.isArray) as SnapshotRow[] | undefined;
  if (!arr?.length) throw new Error('DAT-001 snapshot has no Yahoo price rows');
  return arr;
};

/** Snapshot → Returns Engine (same pipeline as live data: adjclose preferred, log returns). */
export function snapshotReturns(s: Dat001Snapshot) {
  const rows = rowsOf(s);
  const ds = buildReturnsDataset(
    { dates: rows.map(r => r.date), closes: rows.map(r => r.close), adjcloses: rows.map(r => r.adjclose) },
    { source: 'Yahoo Finance', ticker: s.ticker, currency: s.currency, frequency: 'daily', history: 'DAT-001 snapshot', updateMethod: `Persisted snapshot ${s.version}`, retrievedAt: s.retrievedAt },
    'log',
  );
  return { ds, rows };
}

export function runObservedEvaluation(s: Dat001Snapshot, now = () => performance.now()): ObservedEvaluationRecord {
  const { ds, rows } = snapshotReturns(s);
  const t = now();
  const outcome = evaluateForecastModels(ds.returns.returns, ds.returns.dates);
  const runtimeMs = Math.round(now() - t);
  return {
    dataType: 'OBSERVED MARKET DATA',
    snapshot: { path: 'src/lib/validation/fixtures/dat001-snapshot.json', version: s.version, retrievedAt: s.retrievedAt, provider: s.sources.yahoo.provider, ticker: s.ticker, currency: s.currency,
      priceBasis: ds.metadata.priceField === 'adjclose' ? 'adjclose (split + dividend adjusted)' : 'close (split-adjusted)', priceRows: rows.length, firstPriceDate: rows[0].date, lastPriceDate: rows.at(-1)!.date },
    returns: { kind: 'log', n: ds.returns.returns.length, firstDate: ds.returns.dates[0], lastDate: ds.returns.dates.at(-1)! },
    protocol: { trainSize: outcome.status === 'ok' ? outcome.trainSize : NaN, refitEvery: GARCH_REFIT_EVERY, minOrigins: MIN_OOS_ORIGINS, baseline: BASELINE_MODEL, horizons: [1, 5, 10, 20],
      proxy: 'mean of future squared daily log returns over the horizon (noisy proxy for latent variance)', qlike: 'mean(ln v̂ + proxy/v̂), realized-only term omitted' },
    outcome, runtimeMs, implementationVersion: VOL005_IMPLEMENTATION_VERSION, evaluatedAt: new Date().toISOString(),
  };
}

export function runVol005(fx: Vol005Fixture, observed: ObservedEvaluationRecord, validationDate: string): ValidationResult[] {
  const py = `Python ${fx.meta.python} · arch ${fx.meta.arch} · numpy ${fx.meta.numpy}`;
  const syn = `SYNTHETIC TEST DATA — ${fx.meta.version}, seed ${fx.meta.seed} (percent units)`;
  const m = (testName: string, validationType: CompareMeta['validationType'], reference: string, dataset = syn, notes?: string): CompareMeta =>
    ({ modelId: 'VOL-005', testName, validationType, reference, dataset, validationDate, implementationVersion: VOL005_IMPLEMENTATION_VERSION, notes });
  const out: ValidationResult[] = [];
  const p: GarchParams = { mu: fx.fit.mu, omega: fx.fit.omega, alpha: fx.fit.alpha, beta: fx.fit.beta };
  const tol = { abs: 1e-12, rel: 1e-9 };

  for (const t of fx.meta.origins) {
    const c = fx.cases[String(t)];
    // One-step from the arch state h_t, then the analytic path; both compared to arch.forecast.
    const h1 = p.omega + p.alpha * (fx.y[t] - p.mu) ** 2 + p.beta * c.h_t;
    out.push(compareNumeric([h1], [c.h1], tol, m(`One-step h_{t+1|t} from arch state, origin ${t}`, 'independent-benchmark', `arch.forecast horizon 1 (${py})`)));
    out.push(compareNumeric(garchVarianceForecastAnalytic(p, c.h1, fx.meta.horizon), c.forecast, tol,
      m(`Analytic multi-step path h_{t+k|t}, k=1..20, origin ${t}`, 'independent-benchmark', `arch.forecast(horizon=20, reindex=False) (${py})`)));
    out.push(compareNumeric(garchVarianceForecastPath(p, c.h1, fx.meta.horizon), c.forecast, tol,
      m(`Recursive multi-step path, k=1..20, origin ${t}`, 'independent-benchmark', `arch.forecast(horizon=20) (${py})`)));
    for (const [H, ref] of Object.entries(fx.metrics[String(t)])) {
      const h = +H;
      const vhat = c.forecast.slice(0, h).reduce((a, b) => a + b, 0) / h;
      const proxy = c.proxy.slice(0, h).reduce((a, b) => a + b, 0) / h;
      const r = forecastMetrics([vhat], [proxy]);
      out.push(compareNumeric([vhat, proxy, r.qlike, r.mse], [ref.vhat, ref.proxy, ref.qlike, ref.mse], tol,
        m(`v̂, proxy, QLIKE, MSE at H=${h}, origin ${t}`, 'independent-benchmark', `numpy (${py})`)));
    }
  }

  // Numerical: closed form vs recursion on the fitted parameters, long horizon.
  out.push(compareNumeric(garchVarianceForecastAnalytic(p, 2.5, 250), garchVarianceForecastPath(p, 2.5, 250), { abs: 1e-12, rel: 1e-12 },
    m('Closed form ≡ direct recursion, 250 steps', 'numerical', 'garchVarianceForecastPath (recursion)')));
  // Numerical: alternating ±√c returns → proxy = c, hist-w variance = c·w/(w−1), EWMA fixed point = c.
  const cc = 0.0004, n = 700;
  const rc = Array.from({ length: n }, (_, i) => (i % 2 ? 1 : -1) * Math.sqrt(cc));
  const dc = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10));
  const ev = evaluateForecastModels(rc, dc, { fitter: () => { throw new Error('excluded in hand case'); } });
  const h1 = ev.status === 'ok' ? ev.horizons[0].scores : {};
  const v20 = cc * 20 / 19, v60 = cc * 60 / 59;
  out.push(compareNumeric([h1.hist20?.qlike ?? NaN, h1.hist20?.mse ?? NaN, h1.hist60?.rmse ?? NaN, h1.ewma?.mse ?? NaN],
    [Math.log(v20) + cc / v20, (v20 - cc) ** 2, v60 - cc, 0], { abs: 1e-15, rel: 1e-10 },
    m('Hand-computable metrics: alternating ±√c returns (H=1)', 'numerical', 'closed-form values', 'DETERMINISTIC CONSTRUCTED SERIES')));

  // Out-of-sample on observed data: protocol satisfaction per horizon (not a performance claim).
  const o = observed.outcome;
  const obsDs = `OBSERVED — ${observed.snapshot.provider} ${observed.snapshot.ticker} ${observed.snapshot.priceBasis}, ${observed.snapshot.version}, returns ${observed.returns.firstDate}→${observed.returns.lastDate} (n=${observed.returns.n})`;
  if (o.status !== 'ok') {
    out.push(compareExact([o.status], ['ok'], m('Observed rolling-origin evaluation ran', 'out-of-sample', 'VOL-005 protocol', obsDs, 'detail' in o ? o.detail : undefined)));
    return out;
  }
  const ev2 = o as ForecastEvaluation;
  for (const h of ev2.horizons) {
    const models = FORECAST_MODELS.map(x => x.id).filter(id => h.scores[id]);
    const fmt = (id: string) => { const s = h.scores[id as keyof typeof h.scores]!; return `${id}: QLIKE ${s.qlike.toFixed(4)} (Δ vs hist60 ${s.qlikeDiffVsBaseline === null ? '—' : s.qlikeDiffVsBaseline.toFixed(4)}), RMSE ${s.rmse.toExponential(3)}, rank ${s.rank}`; };
    out.push(compareExact([models.length === 4 && h.origins >= MIN_OOS_ORIGINS && ev2.garchFailures.length === 0],
      [true], m(`Observed OOS evaluation H=${h.horizon}: ${h.origins} common origins (${h.originFrom}→${h.originTo}; targets ${h.targetFrom}→${h.targetTo})`, 'out-of-sample',
        'VOL-005 rolling-origin protocol (expanding window, refit every 20)', obsDs, models.map(fmt).join(' · '))));
  }
  return out;
}
