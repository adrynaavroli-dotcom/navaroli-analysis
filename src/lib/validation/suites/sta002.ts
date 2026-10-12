import { acf, adfTest, chiSquareSurvival, ljungBox, mackinnonCritical, mackinnonPValue, normalCdf, schwertMaxLag, TimeSeriesInputError } from '../../timeseries';
import { compareExact, compareNumeric, type CompareMeta } from '../compare';
import type { ValidationResult } from '../types';

export const STA002_IMPLEMENTATION_VERSION = 'quant-engine/sta002-timeseries@1.0.0';

interface SeriesRef {
  x: number[]; acf: number[];
  ljungBox: { lag: number; statistic: number; pValue: number }[];
  adf: { statistic: number; pValue: number; usedLag: number; nobs: number; critical: Record<'1%' | '5%' | '10%', number>; icBest: number };
}
export interface Sta002Fixture {
  meta: { version: string; seed: number; python: string; numpy: string; scipy: string; statsmodels: string; lags: number[]; nlags: number };
  series: Record<string, SeriesRef>;
  mackinnon: { tau: number[]; p: number[]; nobs: number[]; crit: number[][] };
  chi2: { x: number; df: number; sf: number }[];
  normal: { z: number[]; cdf: number[] };
}

/**
 * Tolerances. ACF/LB are closed-form sums → near machine precision. ADF τ goes
 * through a different OLS solver (Householder QR here vs pinv/QR in statsmodels),
 * so 1e-9 relative. p-values inherit the special-function accuracy (≈1e-14).
 */
const TOL = { acf: { abs: 1e-13, rel: 1e-11 }, lb: { abs: 1e-10, rel: 1e-11 }, p: { abs: 1e-12, rel: 1e-9 }, tau: { abs: 1e-10, rel: 1e-9 }, crit: { abs: 1e-12, rel: 1e-12 }, sf: { abs: 1e-14, rel: 1e-11 } };

export function runSta002(fx: Sta002Fixture, validationDate: string): ValidationResult[] {
  const py = `Python ${fx.meta.python} · statsmodels ${fx.meta.statsmodels} · scipy ${fx.meta.scipy}`;
  const ds = `SYNTHETIC TEST DATA — ${fx.meta.version}, seed ${fx.meta.seed}`;
  const m = (testName: string, reference: string, validationType: CompareMeta['validationType'] = 'independent-benchmark'): CompareMeta =>
    ({ modelId: 'STA-002', testName, validationType, reference: validationType === 'independent-benchmark' ? `${reference} (${py})` : reference, dataset: ds, validationDate, implementationVersion: STA002_IMPLEMENTATION_VERSION });
  const out: ValidationResult[] = [];

  for (const [name, s] of Object.entries(fx.series)) {
    out.push(compareNumeric(acf(s.x, fx.meta.nlags)!, s.acf, TOL.acf, m(`ACF lags 0–${fx.meta.nlags} · ${name}`, 'statsmodels acf(adjusted=False, fft=False)')));
    const lb = ljungBox(s.x, fx.meta.lags)!;
    out.push(compareNumeric(lb.map((r) => r.statistic), s.ljungBox.map((r) => r.statistic), TOL.lb, m(`Ljung–Box Q(10), Q(20) · ${name}`, 'statsmodels acorr_ljungbox')));
    out.push(compareNumeric(lb.map((r) => r.pValue), s.ljungBox.map((r) => r.pValue), TOL.p, m(`Ljung–Box p-values · ${name}`, 'statsmodels acorr_ljungbox (scipy chi2.sf)')));
    const a = adfTest(s.x);
    out.push(compareExact([a.usedLag, a.nobs], [s.adf.usedLag, s.adf.nobs], m(`ADF AIC-selected lag and nobs · ${name}`, 'statsmodels adfuller(regression="c", autolag="AIC")')));
    out.push(compareNumeric([a.statistic, a.icBest], [s.adf.statistic, s.adf.icBest], TOL.tau, m(`ADF τ statistic and best AIC · ${name}`, 'statsmodels adfuller(regression="c", autolag="AIC")')));
    out.push(compareNumeric([a.pValue, a.critical['1%'], a.critical['5%'], a.critical['10%']], [s.adf.pValue, s.adf.critical['1%'], s.adf.critical['5%'], s.adf.critical['10%']], TOL.p, m(`ADF p-value and critical values · ${name}`, 'statsmodels mackinnonp / mackinnoncrit')));
  }

  out.push(compareNumeric(fx.mackinnon.tau.map(mackinnonPValue), fx.mackinnon.p, TOL.p, m(`MacKinnon (1994) p-value on ${fx.mackinnon.tau.length} τ values incl. regime boundaries`, 'statsmodels mackinnonp(regression="c", N=1)')));
  out.push(compareNumeric(fx.mackinnon.nobs.flatMap((n) => Object.values(mackinnonCritical(n))), fx.mackinnon.crit.flat(), TOL.crit, m('MacKinnon (2010) critical values, T = 25…1000', 'statsmodels mackinnoncrit(regression="c", N=1)')));
  out.push(compareNumeric(fx.chi2.map((c) => chiSquareSurvival(c.x, c.df)), fx.chi2.map((c) => c.sf), TOL.sf, m(`χ² survival function (${fx.chi2.length} points, df 1–20)`, 'scipy.stats.chi2.sf')));
  out.push(compareNumeric(fx.normal.z.map(normalCdf), fx.normal.cdf, TOL.sf, m('Standard normal CDF on [−8, 8]', 'scipy.stats.norm.cdf')));

  // Numerical / mathematical properties (no external reference).
  const wn = fx.series.iid_normal_500, ar = fx.series.ar1_phi05_500;
  out.push(compareNumeric([acf(ar.x, 1)![1]], [0.5], { abs: 4 / Math.sqrt(ar.x.length), rel: 0 }, { ...m('AR(1) φ=0.5: ρ̂_1 within 4 s.e. of φ', 'Theory: ρ_1 = φ', 'numerical'), notes: 'Statistical tolerance 4/√n' }));
  out.push(compareExact([ljungBox(ar.x)![0].pValue < 0.01, ljungBox(fx.series.arch1_squared_750.x)![0].pValue < 0.01, ljungBox(fx.series.arch1_returns_750.x)![0].pValue > 0.01],
    [true, true, true], m('Ljung–Box detects AR(1) and ARCH effects in r², not in ARCH returns', 'Theory (power check on synthetic DGPs)', 'numerical')));
  out.push(compareExact([adfTest(fx.series.random_walk_logprice_500.x).pValue > 0.05, adfTest(fx.series.ar1_phi07_level_300.x).pValue < 0.01, adfTest(wn.x).pValue < 0.01],
    [true, true, true], m('ADF: random walk not rejected; stationary AR(1) and white noise rejected', 'Theory (size/power on synthetic DGPs)', 'numerical')));
  // Hand-checkable ACF: x = [1,2,3,4] → x̄=2.5, ĉ0=1.25, ĉ1=0.3125 ⇒ ρ̂1=0.25
  out.push(compareNumeric(acf([1, 2, 3, 4], 1)!, [1, 0.25], { abs: 1e-15, rel: 0 }, m('Hand-checkable ACF of [1,2,3,4] (ρ̂1 = 0.25)', 'Manual calculation', 'numerical')));
  out.push(compareNumeric([chiSquareSurvival(4, 2), chiSquareSurvival(10, 10)], [Math.exp(-2), Math.exp(-5) * [0, 1, 2, 3, 4].reduce((s, i) => s + 5 ** i / [1, 1, 2, 6, 24][i], 0)], { abs: 1e-15, rel: 1e-13 }, m('χ² survival closed form for even df', 'Q(k, x) = e^{−x} Σ_{i<k} xⁱ/i!', 'numerical')));
  out.push(compareExact([schwertMaxLag(500), schwertMaxLag(100), schwertMaxLag(20)], [18, 12, 8], m('Schwert max lag ⌈12(n/100)^¼⌉ capped at n/2−2', 'Manual calculation', 'numerical')));
  // Failure behaviour
  const throws = (f: () => unknown) => { try { f(); return false; } catch (e) { return e instanceof TimeSeriesInputError; } };
  out.push(compareExact([acf(new Array(30).fill(0.01), 5) === null, ljungBox(new Array(30).fill(0.01)) === null, throws(() => adfTest(new Array(30).fill(1))), throws(() => acf([1, NaN, 2, 3], 1)), throws(() => ljungBox(new Array(15).fill(0).map((_, i) => i % 3))), throws(() => adfTest([1, 2, 3]))],
    [true, true, true, true, true, true], m('Constant → null ACF/LB, ADF error; NaN and too-short inputs rejected (no NaN outputs)', 'Spec', 'numerical')));
  return out;
}
