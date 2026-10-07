import type { InputCheck, ModelValidationPlan, Tolerance, ValidationResult, ValidationStatus, ValidationType } from './types';

export const withinTolerance = (a: number, b: number, t: Tolerance) => Math.abs(a - b) <= t.abs + t.rel * Math.abs(b);

export interface CompareMeta {
  modelId: string; validationType: ValidationType; testName: string;
  reference: string; dataset: string; validationDate: string; implementationVersion: string; notes?: string;
}

const fmt = (v: number | null) => (v === null ? 'null' : Number.isFinite(v) ? v.toPrecision(10) : String(v));
const summary = (x: (number | null)[]) => (x.length === 1 ? fmt(x[0]) : `n=${x.length}, first=${fmt(x.find((v) => v !== null) ?? null)}, last=${fmt(x.at(-1) ?? null)}`);

/**
 * Element-wise comparison of numeric vectors (null must match null — e.g.
 * rolling warm-up). `tolerance: 'exact'` requires bitwise equality.
 */
export function compareNumeric(actual: (number | null)[], expected: (number | null)[], tolerance: Tolerance | 'exact', meta: CompareMeta): ValidationResult {
  let maxAbs = 0, maxRel = 0, passed = actual.length === expected.length;
  for (let i = 0; i < Math.min(actual.length, expected.length); i++) {
    const a = actual[i], b = expected[i];
    if (a === null || b === null) { if (a !== b) passed = false; continue; }
    const e = Math.abs(a - b);
    maxAbs = Math.max(maxAbs, e);
    if (b !== 0) maxRel = Math.max(maxRel, e / Math.abs(b));
    if (tolerance === 'exact' ? a !== b : !withinTolerance(a, b, tolerance)) passed = false;
  }
  return {
    modelId: meta.modelId, validationType: meta.validationType, testName: meta.testName,
    expectedResult: summary(expected), actualResult: summary(actual), tolerance,
    maxAbsError: maxAbs, maxRelError: maxRel, n: expected.length, passed,
    evidence: { reference: meta.reference, dataset: meta.dataset },
    validationDate: meta.validationDate, implementationVersion: meta.implementationVersion, notes: meta.notes,
  };
}

/** Exact comparison of discrete outputs (counts, date vectors). */
export function compareExact<T>(actual: T[], expected: T[], meta: CompareMeta): ValidationResult {
  const passed = actual.length === expected.length && actual.every((v, i) => v === expected[i]);
  const s = (x: T[]) => (x.length === 1 ? String(x[0]) : `n=${x.length}, first=${String(x[0])}, last=${String(x.at(-1))}`);
  return {
    modelId: meta.modelId, validationType: meta.validationType, testName: meta.testName,
    expectedResult: s(expected), actualResult: s(actual), tolerance: 'exact',
    maxAbsError: passed ? 0 : NaN, maxRelError: passed ? 0 : NaN, n: expected.length, passed,
    evidence: { reference: meta.reference, dataset: meta.dataset },
    validationDate: meta.validationDate, implementationVersion: meta.implementationVersion, notes: meta.notes,
  };
}

/* ---------- Model input checks ---------- */
export const checkFinite = (x: number[]): InputCheck => ({ name: 'finite', passed: x.every(Number.isFinite), detail: 'All inputs finite' });
export const checkMinLength = (x: unknown[], n: number): InputCheck => ({ name: 'min-length', passed: x.length >= n, detail: `${x.length} ≥ ${n} observations` });
export const checkPositive = (x: number[]): InputCheck => ({ name: 'positive', passed: x.every((v) => v > 0), detail: 'All prices > 0' });
export const checkStrictlyIncreasingDates = (d: string[]): InputCheck =>
  ({ name: 'dates-increasing', passed: d.every((v, i) => i === 0 || v > d[i - 1]), detail: 'Dates strictly increasing (sorted, unique)' });

/** Status of a model given its plan and results: COMPLETED only if every required type has ≥1 result and all pass. */
export function validationStatus(plan: ModelValidationPlan, results: ValidationResult[]): ValidationStatus {
  const mine = results.filter((r) => r.modelId === plan.modelId);
  if (!mine.length) return 'NOT STARTED';
  if (mine.some((r) => !r.passed)) return 'FAILED';
  return plan.required.every((t) => mine.some((r) => r.validationType === t)) ? 'COMPLETED' : 'IN PROGRESS';
}
