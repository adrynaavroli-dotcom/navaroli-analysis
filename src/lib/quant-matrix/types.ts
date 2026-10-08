export const STATUSES = ['NOT STARTED', 'PLANNED', 'IN PROGRESS', 'VALIDATION', 'COMPLETED', 'ADVANCED'] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { P0: 'P0 — Core', P1: 'P1 — High', P2: 'P2 — Medium', P3: 'P3 — Advanced' };

export type PortfolioValue = 'HIGH' | 'MEDIUM' | 'LOW';

export const PROFESSIONAL_AREAS = [
  'Market Risk', 'Portfolio Management', 'Quantitative Research', 'Derivatives', 'Risk Analytics',
  'Model Validation', 'Investment Research', 'Fixed Income', 'Credit Risk', 'Trading', 'Middle Office / Risk Control',
] as const;
export type ProfessionalArea = (typeof PROFESSIONAL_AREAS)[number];

export const VALIDATION_METHODS = [
  'Unit tests', 'Benchmark against independent implementation', 'Historical comparison', 'Out-of-sample testing',
  'Statistical diagnostics', 'Backtesting', 'Sensitivity analysis', 'Parameter stability', 'Stress testing', 'Numerical convergence',
] as const;
export type ValidationMethod = (typeof VALIDATION_METHODS)[number];

/** Separate progress layers: code existing does not mean a model is complete. */
export const LAYERS = ['academic', 'specification', 'code', 'ui', 'validation', 'documentation'] as const;
export type Layer = (typeof LAYERS)[number];
export const LAYER_LABEL: Record<Layer, string> = {
  academic: 'Academic Knowledge', specification: 'Model Specification', code: 'Code Implementation',
  ui: 'User Interface', validation: 'Validation', documentation: 'Documentation',
};
export type LayerStatus = Exclude<Status, 'ADVANCED'>;

/** Data layer kept separate from the maths. Free/public sources only. */
export type DataSource = 'Yahoo Finance' | 'FRED' | 'CSV' | 'Excel' | 'Public API' | 'Derived';
export interface DataRequirement {
  source: DataSource;
  dataset: string;
  frequency: 'Intraday' | 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Snapshot' | 'N/A';
  history: string;
  updateMethod: string;
}

export interface MasterReference {
  module: string;
  topic: string;
  /** Concrete file in the Master inventory, or 'Source to verify'. */
  source: string;
  practicalExercise?: string;
}
export const SOURCE_TO_VERIFY = 'Source to verify';

export type Tier = 'CORE' | 'ADVANCED';

export interface MatrixItem {
  id: string;
  tier: Tier;
  module: string;
  submodule: string;
  concept: string;
  mathematicalModel: string;
  mathematicalConcepts: string[];
  requiredData: DataRequirement[];
  /** Planned or existing implementation stack/location. */
  implementation: string;
  validation: ValidationMethod[];
  professionalUse: ProfessionalArea[];
  priority: Priority;
  status: Status;
  layers: Record<Layer, LayerStatus>;
  dependencies: string[];
  nextAction: string;
  portfolioValue: PortfolioValue;
  master: MasterReference;
  phase: number;
  /** Future technical documentation page (master index). */
  docPath: string;
  /** Existing page where the model is already usable, if any. */
  livePath?: string;
  /** Known limitations, shown in the technical page. */
  limitations?: string[];
}

export interface RoadmapPhase {
  phase: number;
  name: string;
  objective: string;
  status: Status;
}

/** Persisted admin overrides (page_content 'quant_matrix_state'). */
export interface MatrixState {
  items: Record<string, { status?: Status; nextAction?: string }>;
  phases: Record<string, Status>;
}
