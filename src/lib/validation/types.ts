/**
 * Reusable quantitative validation framework — model-agnostic.
 * Usable by any model in the Quant Matrix (returns, volatility, GARCH, VaR,
 * ES, Monte Carlo, Heston, portfolio optimization…).
 */

/** Distinguishes the four kinds of evidence. */
export type ValidationType = 'unit' | 'numerical' | 'independent-benchmark' | 'out-of-sample';

export interface Tolerance {
  /** Pass if |actual − expected| ≤ abs + rel·|expected| (element-wise). */
  abs: number;
  rel: number;
}

export interface ValidationResult {
  modelId: string;
  validationType: ValidationType;
  testName: string;
  /** Short description of the reference value(s) (scalar or summary of a vector). */
  expectedResult: string;
  actualResult: string;
  tolerance: Tolerance | 'exact';
  /** Observed worst-case errors (vectors) or single-value errors. */
  maxAbsError: number;
  maxRelError: number;
  n: number;
  passed: boolean;
  /** Reference implementation and dataset. */
  evidence: { reference: string; dataset: string };
  validationDate: string;
  implementationVersion: string;
  notes?: string;
}

export interface InputCheck { name: string; passed: boolean; detail: string }

/** Validation state of a model, derived from its results. */
export type ValidationStatus = 'COMPLETED' | 'IN PROGRESS' | 'FAILED' | 'NOT STARTED';

export interface ModelValidationPlan {
  modelId: string;
  /** Evidence types required to close validation for this model. */
  required: ValidationType[];
  /** Types explicitly out of scope, with justification (e.g. OOS for a non-fitted estimator). */
  notApplicable?: Partial<Record<ValidationType, string>>;
  notes?: string[];
}
