import { cleanPrices, logReturns, logToSimple, simpleReturns } from '../../returns';
import { ewmaVolatility, historicalVolatility, jarqueBera, kurtosis, skewness, stdDev } from '../../volatility';
import { compareExact, compareNumeric, type CompareMeta } from '../compare';
import type { ValidationResult } from '../types';
import { PHASE1_IMPLEMENTATION_VERSION } from './phase1';

/**
 * Numerical tests against closed-form / hand-derived references and
 * mathematical identities (no external implementation involved).
 */
export function runPhase1Numerical(validationDate: string, fixtureLog?: number[], fixtureSimple?: number[]): ValidationResult[] {
  const m = (modelId: string, testName: string, reference: string): CompareMeta => ({
    modelId, testName, validationType: 'numerical', reference, dataset: 'Hand-constructed inputs', validationDate, implementationVersion: PHASE1_IMPLEMENTATION_VERSION,
  });
  const tol = { abs: 1e-15, rel: 1e-12 };
  const c = cleanPrices(['2024-01-03', '2024-01-01', '2024-01-02', '2024-01-02', '2024-01-04', '2024-01-05'], [3, 1, 2, 2.5, null, -1]);
  const x = [-2, -1, 0, 1, 2];
  const alt = [0.01, -0.01, 0.01, -0.01];
  const r = [0.01, -0.01, 0.02, -0.02, 0.03];
  const v0 = stdDev(r.slice(0, 2)) ** 2;
  const out: ValidationResult[] = [
    compareExact([c.report.removedMissing, c.report.removedNonPositive, c.report.removedDuplicateDates, c.report.kept], [1, 1, 1, 3], m('DAT-002', 'Hand example: 1 missing, 1 negative, 1 duplicate → 3 kept', 'Manual count')),
    compareExact(c.series.prices, [1, 2, 3], m('DAT-002', 'Hand example: sorted output, first duplicate kept', 'Manual sort')),
    compareNumeric(logReturns({ dates: ['a', 'b', 'c'], prices: [100, 110, 99] }).returns, [Math.log(1.1), Math.log(0.9)], tol, m('DAT-003', 'Log returns 100→110→99', 'ln(1.1), ln(0.9)')),
    compareNumeric(simpleReturns({ dates: ['a', 'b', 'c'], prices: [100, 110, 99] }).returns, [0.1, -0.1], tol, m('DAT-003', 'Simple returns 100→110→99', '+10%, −10%')),
    compareNumeric(x.map(() => skewness(x)), x.map(() => 0), { abs: 1e-15, rel: 0 }, m('STA-001', 'Skewness of symmetric sample = 0', 'Symmetry')),
    compareNumeric([kurtosis(x)], [1.7], tol, m('STA-001', 'Kurtosis of [−2..2] = m4/m2² = 6.8/4', 'Hand calculation')),
    compareNumeric([jarqueBera(x).statistic], [(5 / 6) * (1.3 ** 2 / 4)], tol, m('STA-001', 'Jarque-Bera of [−2..2]', 'n/6·(S² + (K−3)²/4)')),
    compareNumeric([historicalVolatility(alt)], [Math.sqrt(0.0004 / 3) * Math.sqrt(252)], tol, m('VOL-001', 'Alternating ±1% → √(0.0004/3)·√252', 'Hand calculation')),
    compareNumeric([historicalVolatility(r.map((v) => 2 * v))], [2 * historicalVolatility(r)], tol, m('VOL-001', 'Positive homogeneity σ(2r) = 2σ(r)', 'Identity')),
    compareNumeric([ewmaVolatility(r, r, 0.94, 2).values[2]!], [Math.sqrt((0.94 * v0 + 0.06 * 0.01 ** 2) * 252)], tol, m('VOL-002', 'One recursion step uses r_{t−1}', 'σ²₂ = λσ²₁ + (1−λ)r₁²')),
    compareNumeric(ewmaVolatility(r, r, 1, 2).values.slice(1), r.slice(1).map(() => Math.sqrt(v0 * 252)), tol, m('VOL-002', 'λ = 1 keeps the seed variance constant', 'Limit case')),
  ];
  if (fixtureLog && fixtureSimple) out.push(compareNumeric(fixtureLog.map(logToSimple), fixtureSimple, { abs: 1e-15, rel: 1e-12 }, { ...m('DAT-003', 'Identity R = eʳ − 1 on 595 benchmark returns', 'Mathematical identity'), dataset: 'phase1-benchmark.json' }));
  return out;
}
