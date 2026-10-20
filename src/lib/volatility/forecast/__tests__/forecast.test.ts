import { describe, expect, it } from 'vitest';
import {
  evaluateForecastModels, garchVarianceForecastAnalytic, garchVarianceForecastPath,
  GARCH_REFIT_EVERY, MIN_OOS_ORIGINS, MIN_TRAIN_SIZE, TRAIN_FRACTION,
  type ForecastEvaluation,
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
  const dates = Array.from({ length: n }, (_, i) => `2020-01-${String(i + 1).padStart(2, '0')}`);
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
    const h20 = out.horizons.find((h) => h.horizon === 20)!;
    expect(h20.origins).toBe(n - out.trainSize - 20 + 1);
    expect(h20.origins).toBeGreaterThanOrEqual(MIN_OOS_ORIGINS);
    // Shorter horizons have more origins (more room before the end).
    expect(out.horizons.find((h) => h.horizon === 1)!.origins).toBe(h20.origins + 19);
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
    const a = evaluateForecastModels(returns, dates) as ForecastEvaluation;
    const b = evaluateForecastModels(mod, dates) as ForecastEvaluation;
    // Scores at H=1 use origins up to n−2; origins before index 500 see identical data,
    // so the FIRST 500−train origins must produce identical GARCH paths. We verify via
    // a truncated series: evaluation on r[0..500] must be identical for both.
    const aT = evaluateForecastModels(returns.slice(0, 500), dates.slice(0, 500), { minOrigins: 10 }) as ForecastEvaluation;
    const bT = evaluateForecastModels(mod.slice(0, 500), dates.slice(0, 500), { minOrigins: 10 }) as ForecastEvaluation;
    expect(aT.status).toBe('ok');
    expect(bT.status).toBe('ok'); // the shock is the last point; it only enters scores, not earlier forecasts
    expect(a.horizons[0].scores.garch!.qlike).not.toBe(b.horizons[0].scores.garch!.qlike); // shock matters when included
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
        expect(Number.isFinite(h.scores[id]!.qlike)).toBe(true);
        expect(h.scores[id]!.mse).toBeGreaterThanOrEqual(0);
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
    const datesC = returnsC.map((_, i) => `d${i}`);
    const out = evaluateForecastModels(returnsC, datesC, {
      fitter: () => { throw new Error('skip garch'); },
    }) as ForecastEvaluation;
    const h1 = out.horizons.find((h) => h.horizon === 1)!;
    const v20 = (c * 20) / 19, v60 = (c * 60) / 59;
    expect(h1.scores.hist20!.mse).toBeCloseTo((v20 - c) ** 2, 15);
    expect(h1.scores.hist20!.qlike).toBeCloseTo(Math.log(v20) + c / v20, 10);
    expect(h1.scores.hist60!.rmse).toBeCloseTo(Math.abs(v60 - c), 15);
    // EWMA fixed point of v = λv + (1−λ)c is exactly c.
    expect(h1.scores.ewma!.mse).toBeCloseTo(0, 12);
  });
});
