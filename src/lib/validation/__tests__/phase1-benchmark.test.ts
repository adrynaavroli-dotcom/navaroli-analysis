import { describe, it, expect } from 'vitest';
import fx from '../fixtures/phase1-benchmark.json';
import { runPhase1Benchmark, type Phase1Fixture } from '../suites/phase1';
import { runPhase1Numerical } from '../suites/phase1-numerical';
import { VALIDATION_PLANS, VALIDATION_RESULTS, statusFor, validationStatus, compareNumeric } from '../index';

const F = fx as unknown as Phase1Fixture;
const fresh = [...runPhase1Numerical('test', F.returns.log, F.returns.simple), ...runPhase1Benchmark(F, 'test')];

describe('Phase 1 — Web engine vs independent Python reference', () => {
  for (const r of fresh) it(`${r.modelId} [${r.validationType}] ${r.testName}`, () => {
    expect(r.passed, `maxAbs=${r.maxAbsError} maxRel=${r.maxRelError}`).toBe(true);
  });
  it('recorded evidence matches a fresh run (same tests, same outcome)', () => {
    expect(VALIDATION_RESULTS.map((r) => [r.modelId, r.testName, r.passed])).toEqual(fresh.map((r) => [r.modelId, r.testName, r.passed]));
  });
  it('covers every required check', () => {
    const names = fresh.map((r) => r.testName).join('|');
    for (const k of ['duplicate', 'missing', '≤ 0', 'Temporal order', 'Simple returns', 'Log returns', 'Mean', 'Skewness', 'Kurtosis', 'Jarque-Bera', 'Full-sample', '20D', '60D', 'EWMA', 'Weekly', 'Monthly', 'alignment']) expect(names).toContain(k);
  });
});

describe('validation framework', () => {
  const meta = { modelId: 'X', validationType: 'numerical' as const, testName: 't', reference: 'r', dataset: 'd', validationDate: 'x', implementationVersion: 'v' };
  it('fails outside tolerance and on null mismatch', () => {
    expect(compareNumeric([1.001], [1], { abs: 0, rel: 1e-6 }, meta).passed).toBe(false);
    expect(compareNumeric([null, 1], [0, 1], { abs: 1, rel: 0 }, meta).passed).toBe(false);
    expect(compareNumeric([null, 1 + 1e-13], [null, 1], { abs: 0, rel: 1e-12 }, meta).passed).toBe(true);
  });
  it('status requires every required type and no failures', () => {
    const ok = compareNumeric([1], [1], 'exact', meta);
    expect(validationStatus({ modelId: 'X', required: ['numerical', 'independent-benchmark'] }, [ok])).toBe('IN PROGRESS');
    expect(validationStatus({ modelId: 'X', required: ['numerical'] }, [ok, { ...ok, passed: false }])).toBe('FAILED');
    expect(validationStatus({ modelId: 'X', required: ['numerical'] }, [ok])).toBe('COMPLETED');
  });
  it('phase 1 statuses', () => {
    for (const id of ['DAT-002', 'DAT-003', 'STA-001', 'VOL-001', 'VOL-002']) expect(statusFor(id)).toBe('COMPLETED');
    expect(statusFor('DAT-001')).toBe('NOT STARTED');
    expect(VALIDATION_PLANS.length).toBe(6);
  });
});
