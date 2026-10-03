import type { RoadmapPhase } from './types';

export const ROADMAP: RoadmapPhase[] = [
  { phase: 1, name: 'Data & Returns', objective: 'Consolidated market data, cleaning and returns engine', status: 'IN PROGRESS' },
  { phase: 2, name: 'Volatility Analytics', objective: 'Historical, EWMA, GARCH family and forecasting', status: 'IN PROGRESS' },
  { phase: 3, name: 'Volatility Regimes', objective: 'Regime detection on volatility series', status: 'PLANNED' },
  { phase: 4, name: 'Correlation / Covariance', objective: 'Rolling, EWMA and shrinkage covariance; PCA', status: 'PLANNED' },
  { phase: 5, name: 'Portfolio Optimization', objective: 'Min-variance, max-Sharpe, frontier, risk parity, constraints', status: 'NOT STARTED' },
  { phase: 6, name: 'VaR / ES / Stress Testing', objective: 'Historical, parametric, MC VaR, ES, backtesting, stress', status: 'NOT STARTED' },
  { phase: 7, name: 'Derivatives & Hedging', objective: 'Integrate existing pricing engine with Greeks and hedging', status: 'IN PROGRESS' },
  { phase: 8, name: 'Advanced Quant Models', objective: 'SVI, local vol, Heston, exotics, variance reduction', status: 'NOT STARTED' },
  { phase: 9, name: 'Model Validation & OOS', objective: 'Out-of-sample evaluation and validation reports', status: 'NOT STARTED' },
];

/** Initial development priority order (item IDs). */
export const CURRENT_PRIORITY: { label: string; ids: string[] }[] = [
  { label: 'Consolidate Market Data', ids: ['DAT-001'] },
  { label: 'Returns Engine', ids: ['DAT-002', 'DAT-003'] },
  { label: 'Historical Volatility', ids: ['VOL-001'] },
  { label: 'EWMA', ids: ['VOL-002'] },
  { label: 'GARCH', ids: ['VOL-003', 'VOL-004'] },
  { label: 'Volatility Forecasting', ids: ['VOL-005'] },
  { label: 'Regime Detection', ids: ['VOL-006'] },
  { label: 'Covariance / Correlation Engine', ids: ['COR-001', 'COR-002', 'COR-003', 'COR-004'] },
  { label: 'Portfolio Optimization', ids: ['POR-001', 'POR-002', 'POR-003'] },
  { label: 'VaR / ES', ids: ['RSK-001', 'RSK-002', 'RSK-005'] },
  { label: 'Stress Testing', ids: ['RSK-007'] },
  { label: 'Derivatives', ids: ['DER-001', 'DER-002', 'DER-003'] },
  { label: 'Hedging', ids: ['DER-010', 'DER-011'] },
  { label: 'Advanced Volatility Models', ids: ['DER-006', 'DER-007', 'DER-008'] },
];
