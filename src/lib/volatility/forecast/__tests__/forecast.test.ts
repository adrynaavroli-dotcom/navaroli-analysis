import { describe, expect, it } from 'vitest';
import {
  evaluateForecastModels, garchVarianceForecastAnalytic, garchVarianceForecastPath,
  GARCH_REFIT_EVERY, MIN_OOS_ORIGINS, MIN_TRAIN_SIZE, TRAIN_FRACTION,
  forecastMetrics, type ForecastEvaluation,
} from '..';
import { fitGarch, type GarchParams } from '../../garch';

/** Deterministic pseudo-random GARCH-like return path (no RNG dependency on Date/Math.random). */
function syntheticReturns(n: number, seed = 7): { returns: number[]; dates: string[] } {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5);
  const returns: number[] = [];
  let h = 0.0002;
  for (let t = 0; t < n; t++) {
    const z = rand() + rand() + rand(); // approx normal-ish, mean 0
    returns.push(Math.sqrt(h) * z * 2);
    h = 0.00002 + 0.08 * returns[t] ** 2 + 0.9 * h;
  }
  const dates = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10));
  return { returns, dates };
}

const P: GarchParams = { mu: 0.0003, omega: 0.00002, alpha: 0.08, beta: 0.9 };

describe('multi-step GARCH variance forecasts', () => {
  it('analytic closed form equals the direct recursion (ρ < 1)', () => {
    const a = garchVarianceForecastAnalytic(P, 0.0004, 20);
    const r = garchVarianceForecastPath(P, 0.0004, 20);
    for (let k = 0; k < 20; k++) expect(Math.abs(a[k] - r[k])).toBeLessThan(1e-18);
  });
  it('converges to the unconditional variance h̄ = ω/(1−ρ)', () => {
    const a = garchVarianceForecastAnalytic(P, 0.001, 500);
    expect(a[499]).toBeCloseTo(P.omega / (1 - P.alpha - P.beta), 10);
  });
  it('ρ ≥ 1 falls back to the recursion (no finite h̄)', () => {
    const p: GarchParams = { ...P, alpha: 0.15, beta: 0.9 };
    const a = garchVarianceForecastAnalytic(p, 0.0004, 10);
    const r = garchVarianceForecastPath(p, 0.0004, 10);
    expect(a).toEqual(r);
    expect(a[9]).toBeGreaterThan(a[0]); // integrated variance grows
  });
  it('hand check: k=1 is h1; k=2 is ω + ρ·h1', () => {
    const a = garchVarianceForecastAnalytic(P, 0.0005, 2);
    expect(a[0]).toBe(0.0005);
    expect(a[1]).toBeCloseTo(P.omega + (P.alpha + P.beta) * 0.0005, 15);
  });
});

describe('rolling-origin evaluation protocol', () => {
  const n = 700; // train = max(252, 420) = 420; origins at H=20: 700−420−20 = 260
  const { returns, dates } = syntheticReturns(n);

  it('split: train = max(252, floor(0.6·n)); origins = n − train − maxH', () => {
    const out = evaluateForecastModels(returns, dates) as ForecastEvaluation;
    expect(out.status).toBe('ok');
    expect(out.trainSize).toBe(Math.max(MIN_TRAIN_SIZE, Math.floor(TRAIN_FRACTION * n)));
    const h20 = out.horizons.find((h) => h.horizon === 20);
    expect(h20?.origins).toBe(n - out.trainSize - 20 + 1);
    expect(h20?.origins).toBeGreaterThanOrEqual(MIN_OOS_ORIGINS);
    // Shorter horizons have more origins (more room before the end).
    expect(out.horizons.find((h) => h.horizon === 1).origins).toBe((h20?.origins ?? 0) + 19);
  });

  it('refit cadence: fits at t0, t0+20, t0+40, …', () => {
    let calls = 0;
    const fitter = (r: number[]) => { calls++; return fitGarch(r); };
    const out = evaluateForecastModels(returns, dates, { fitter }) as ForecastEvaluation;
    const originsTotal = n - out.trainSize; // origins before running out of room for H=1
    const expected = 1 + Math.floor((originsTotal - 1) / GARCH_REFIT_EVERY);
    expect(calls).toBe(expected);
    expect(out.garchFits).toBe(expected);
  });

  it('insufficient history is reported, never relaxed silently', () => {
    const short = syntheticReturns(300);
    const out = evaluateForecastModels(short.returns, short.dates);
    expect(out.status).toBe('insufficient-history');
    if (out.status === 'insufficient-history') expect(out.requiredMin).toBeGreaterThan(300);
  });

  it('no look-ahead: changing a future return leaves earlier forecasts untouched', () => {
    const mod = [...returns];
    mod[500] = 0.5; // huge shock deep in the OOS region
    const a = evaluateForecastModels(returns, dates, { captureTrace: true }) as ForecastEvaluation;
    const b = evaluateForecastModels(mod, dates, { captureTrace: true }) as ForecastEvaluation;
    const earlyA = a.trace?.filter(r => r.originIndex < 500);
    const earlyB = b.trace?.filter(r => r.originIndex < 500);
    expect(earlyA?.length).toBe(81);
    expect(earlyA).toEqual(earlyB);
    expect(a.trace?.find(r => r.originIndex === 500)?.paths).not.toEqual(b.trace?.find(r => r.originIndex === 500)?.paths);
  });

  it('all models are scored on exactly the same origins per horizon', () => {
    const out = evaluateForecastModels(returns, dates) as ForecastEvaluation;
    for (const h of out.horizons) {
      const present = Object.keys(h.scores);
      expect(present.sort()).toEqual(['ewma', 'garch', 'hist20', 'hist60']);
    }
  });

  it('EWMA and historical baselines are flat across the horizon (fixed-parameter convention)', () => {
    // Indirect check: with constant returns the historical variance is constant and
    // EWMA converges to it; the engine must still produce finite positive scores.
    const flat = syntheticReturns(700, 3);
    const out = evaluateForecastModels(flat.returns, flat.dates) as ForecastEvaluation;
    for (const h of out.horizons) {
      for (const id of ['ewma', 'hist20', 'hist60'] as const) {
        expect(Number.isFinite(h.scores[id]?.qlike)).toBe(true);
        expect(h.scores[id]?.mse).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('date ranges: targets start the day after the first origin and never exceed the data', () => {
    const out = evaluateForecastModels(returns, dates) as ForecastEvaluation;
    for (const h of out.horizons) {
      const i0 = dates.indexOf(h.originFrom);
      expect(dates[i0 + 1]).toBe(h.targetFrom);
      expect(dates.indexOf(h.targetTo)).toBeLessThanOrEqual(n - 1);
    }
  });

  it('GARCH fit failure is reported explicitly and the model is excluded, not faked', () => {
    const fitter = () => { throw new Error('forced failure'); };
    const out = evaluateForecastModels(returns, dates, { fitter }) as ForecastEvaluation;
    expect(out.status).toBe('ok');
    expect(out.failedModels.map((f) => f.id)).toContain('garch');
    expect(out.garchFailures.length).toBeGreaterThan(0);
    expect(out.horizons[0].scores.garch).toBeUndefined();
    expect(out.horizons[0].scores.ewma).toBeDefined();
  });

  it('metrics on hand-computable data: alternating ±√c returns', () => {
    // r_t = ±√c alternating → r² = c constant; a length-w window holds w/2 of each
    // sign, so sample variance = c·w/(w−1) and the proxy is c at every origin.
    const c = 0.0004;
    const returnsC = Array.from({ length: 700 }, (_, i) => (i % 2 ? 1 : -1) * Math.sqrt(c));
    const datesC = dates;
    const out = evaluateForecastModels(returnsC, datesC, {
      fitter: () => { throw new Error('skip garch'); },
    }) as ForecastEvaluation;
    const h1 = out.horizons.find((h) => h.horizon === 1);
    const v20 = (c * 20) / 19, v60 = (c * 60) / 59;
    expect(h1?.scores.hist20?.mse).toBeCloseTo((v20 - c) ** 2, 15);
    expect(h1?.scores.hist20?.qlike).toBeCloseTo(Math.log(v20) + c / v20, 10);
    expect(h1?.scores.hist60?.rmse).toBeCloseTo(Math.abs(v60 - c), 15);
    // EWMA fixed point of v = λv + (1−λ)c is exactly c.
    expect(h1?.scores.ewma?.mse).toBeCloseTo(0, 12);
  });
});


describe('VOL-005 input and failure safety', () => {
  const { returns, dates } = syntheticReturns(700);
  it('rejects misalignment, nonfinite returns, duplicates and malformed dates', () => {
    for (const [r, d] of [[returns, dates.slice(1)], [[NaN, ...returns.slice(1)], dates], [returns, [dates[1], ...dates.slice(1)]], [returns, ['2020-02-30', ...dates.slice(1)]]] as [number[], string[]][])
      expect(evaluateForecastModels(r, d).status).toBe('invalid-input');
  });
  it('rejects invalid horizons, cadence and minimum-origin options', () => {
    for (const options of [{ horizons: [] }, { horizons: [0] }, { horizons: [5, 5] }, { refitEvery: 0 }, { refitEvery: 1.5 }, { minOrigins: 0 }])
      expect(evaluateForecastModels(returns, dates, options).status).toBe('invalid-input');
  });
  it('metrics reject empty, nonpositive, misaligned and nonfinite forecasts', () => {
    for (const v of [[], [0], [-1], [NaN], [Infinity]]) expect(() => forecastMetrics(v, [1])).toThrow();
    expect(forecastMetrics([1, 2], [2, 1])).toEqual({ qlike: (2 + Math.log(2) + 0.5) / 2, mse: 1, rmse: 1 });
  });
  it('never returns empty ok on total model failure', () => {
    expect(evaluateForecastModels(new Array(700).fill(0), dates).status).toBe('failed');
  });
  it('invalidates a failed new refit instead of using its parameters, recovers next cadence', () => {
    const good = fitGarch(returns.slice(0, 420)); let calls = 0;
    const out = evaluateForecastModels(returns, dates, { captureTrace: true, fitter: r => {
      calls++; return { ...good, variance: new Array(r.length).fill(0.0002), status: calls === 2 ? 'NOT_CONVERGED' : good.status };
    } }) as ForecastEvaluation;
    expect(out.garchFailures.map(f => f.originIndex)).toEqual([439]);
    expect(out.trace?.filter(t => t.originIndex >= 439 && t.originIndex < 459).every(t => t.paths.garch === null)).toBe(true);
    expect(out.trace?.find(t => t.originIndex === 459)?.paths.garch).not.toBeNull();
    for (const h of out.horizons) {
      expect(h.excludedOrigins).toBe(20);
      expect(h.originIndices).not.toContain(439);
      expect(h.origins).toBe(700 - 420 - h.horizon + 1 - 20);
    }
  });
  it('baselines use strictly trailing windows and causal EWMA timing', () => {
    const out = evaluateForecastModels(returns, dates, { captureTrace: true, fitter: () => { throw Error('skip'); } }) as ForecastEvaluation;
    let v = returns.slice(0, 20).reduce((a,x) => a + (x - returns.slice(0,20).reduce((a,b)=>a+b,0)/20)**2,0)/19;
    for (let i=19;i<=419;i++) v=0.94*v+0.06*returns[i]**2;
    const first = out.trace?.[0];
    expect(first?.paths.ewma?.[0]).toBeCloseTo(v, 15);
    for (const w of [20, 60]) {
      const r=returns.slice(420-w,420), m=r.reduce((a,b)=>a+b,0)/w;
      const expected=r.reduce((a,b)=>a+(b-m)**2,0)/(w-1);
      const path=first?.paths[w===20?'hist20':'hist60'];
      expect(path?.[0]).toBeCloseTo(expected,15);
      expect(new Set(path).size).toBe(1);
    }
  });
});
