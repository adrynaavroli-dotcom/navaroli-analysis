import {
  SOURCE_TO_VERIFY, type DataRequirement, type Layer, type LayerStatus, type MatrixItem, type MasterReference,
} from './types';

/* ---------- Master references (only files present in the Master inventory) ---------- */
const M3 = '3 Optimizacion de Carteras y Riesgo de mercado';
const M4 = '4. Derivados sobre Renta Variable y Volatilidad';
const M1 = '1. Fundamentos de Matematicas';
const M2 = '2. Fundamentos de programación';
const ref = (module: string, topic: string, source = SOURCE_TO_VERIFY, practicalExercise?: string): MasterReference =>
  ({ module, topic, source, practicalExercise });
const VERIFY = (topic: string) => ref(SOURCE_TO_VERIFY, topic);

const R = {
  python: ref(M2, 'Python', '4. Python\\nota_tecnica_-_python.pdf', '4. Python\\Contenido\\clase_python.ipynb'),
  rData: ref(M2, 'R — manipulación de datos', '3. R\\Clase 11-06\\nota_tecnica_-_r.pdf', '_r_-_mfq_ieb_03_manipulacion_de_datos.ipynb'),
  algebra: ref(M1, 'Álgebra lineal aplicada', '1. ALgebra linea aplicada\\mfc_algebra_jgc.pdf'),
  stoch: ref(M1, 'Cálculo estocástico II', '5. Calculo estocastico II\\Calculo estocastico II.docx'),
  mpt: ref(M3, 'Teoría Moderna de Carteras y Construcción', '1. Teoria Moderna de Carteras y Contrucción\\teo.pdf'),
  optim: ref(M3, 'Optimización con restricciones y enfoques robustos',
    '2. Optimizacion con Restricciones y Enfoques\\202606_optimizacion_de_carteras_con_restricciones_y_metodos_robustos.pdf',
    '2026_portfolio_optimization_demo.ipynb'),
  var: ref(M3, 'Métricas de riesgo (VaR, ES), Stress Testing', '3 Métricas de Riesgo (VaR, ES), Stress Testing\\var_ieb_mfc.pdf', 'var_ibe_normal.ipynb · var_ibe_sh.ipynb · var_sh_yf.ipynb'),
  vanilla: ref(M4, 'Opciones Vanilla — payoffs, arbitraje y paridad', '2. Opciones Vanilla - payoffs, arbitraje y paridad\\2-pres_1.pdf'),
  bsm: ref(M4, 'Modelos de valoración (binomial, BSM)', '4. Modelos de valoración (binomial, BSM)\\3-valo_1.pdf'),
  strat: ref(M4, 'Evaluación de estrategias de derivados', '6. Evaluacion de estrategias de derivados\\sensib_1.pdf'),
  exotic: ref(M4, 'Productos estructurados y exóticos', '7. Productos estructurados y exóticos\\estructurados_mfc26.pdf'),
  smile: ref('#Bibliografia', 'The Volatility Smile', 'Derman, Miller, Park — The Volatility Smile (Wiley 2016)'),
  gatheral: ref('#Bibliografia', 'The Volatility Surface', 'Gatheral — The Volatility Surface: A Practitioner\'s Guide (Wiley 2006)'),
  exoticBook: ref('#Bibliografia', 'Exotic option pricing', 'An_Introduction_to_Exotic_Option_Pricing.pdf'),
};

/* ---------- Data requirements (separated from the maths) ---------- */
const D = {
  prices: { source: 'Yahoo Finance', dataset: 'Daily adjusted close prices', frequency: 'Daily', history: '1–5 years', updateMethod: 'On demand via fetch-historical-volatility' },
  multiPrices: { source: 'Yahoo Finance', dataset: 'Daily closes for N assets (aligned)', frequency: 'Daily', history: '2–5 years', updateMethod: 'On demand, batched per ticker' },
  chain: { source: 'Yahoo Finance', dataset: 'Option chain (bid/ask, strikes, expiries)', frequency: 'Snapshot', history: 'Current', updateMethod: 'On demand via fetch-vol-surface / fetch-options-chain' },
  rates: { source: 'FRED', dataset: 'Risk-free rate (DGS3MO / DGS10)', frequency: 'Daily', history: '5+ years', updateMethod: 'fetch-fred-data, 1h cache' },
  curve: { source: 'FRED', dataset: 'Treasury yield curve (DGS1MO…DGS30)', frequency: 'Daily', history: '5+ years', updateMethod: 'fetch-fred-data, 1h cache' },
  financials: { source: 'CSV', dataset: 'Company financial statements', frequency: 'Quarterly', history: '5+ years', updateMethod: 'Manual upload / JSON import' },
  scenarios: { source: 'CSV', dataset: 'Historical / hypothetical shock scenarios', frequency: 'N/A', history: 'Event windows', updateMethod: 'Curated CSV' },
  derived: { source: 'Derived', dataset: 'Outputs of upstream modules', frequency: 'N/A', history: 'Inherited', updateMethod: 'Computed in-browser' },
} satisfies Record<string, DataRequirement>;

/* ---------- Layer presets ---------- */
type L = Record<Layer, LayerStatus>;
const layers = (a: LayerStatus, s: LayerStatus, c: LayerStatus, u: LayerStatus, v: LayerStatus, d: LayerStatus): L =>
  ({ academic: a, specification: s, code: c, ui: u, validation: v, documentation: d });
const NS = 'NOT STARTED', PL = 'PLANNED', IP = 'IN PROGRESS', VA = 'VALIDATION', CO = 'COMPLETED';
const notStarted = (hasSource: boolean) => layers(hasSource ? CO : PL, NS, NS, NS, NS, NS);
const planned = (hasSource: boolean) => layers(hasSource ? CO : PL, PL, NS, NS, NS, NS);

type Input = Omit<MatrixItem, 'layers' | 'tier'> & { layers?: L; tier?: MatrixItem['tier'] };
const item = (i: Input): MatrixItem => {
  const hasSource = i.master.source !== SOURCE_TO_VERIFY;
  return {
    tier: 'CORE',
    ...i,
    layers: i.layers ?? (i.status === 'PLANNED' ? planned(hasSource) : notStarted(hasSource)),
  };
};

const VOL_TS = VERIFY('Series temporales y volatilidad (contexto §3)');

export const quantitativeProjectMatrix: MatrixItem[] = [
  /* ===== Phase 1 — Data & Returns ===== */
  item({ id: 'DAT-001', module: 'Market Data', submodule: 'Ingestion', concept: 'Unified free market-data layer',
    mathematicalModel: 'N/A (data engineering)', mathematicalConcepts: ['Corporate-action adjustment'], requiredData: [D.prices, D.chain, D.rates],
    implementation: 'Edge functions: fetch-historical-volatility, fetch-stock-data, fetch-vol-surface, fetch-fred-data', validation: ['Unit tests', 'Historical comparison'],
    professionalUse: ['Quantitative Research', 'Middle Office / Risk Control'], priority: 'P0', status: 'IN PROGRESS',
    layers: layers(CO, IP, IP, IP, NS, IP), dependencies: [], nextAction: 'Typed RawPriceData/DatasetMetadata contract done (src/lib/returns). Pending: CSV/Excel loader and recorded-snapshot validation vs a second free source',
    portfolioValue: 'MEDIUM', master: R.python, phase: 1, docPath: '/quant/data/market-data', livePath: '/volatility' }),
  item({ id: 'DAT-002', module: 'Market Data', submodule: 'Data Cleaning', concept: 'Missing / non-positive / duplicate handling with audit report',
    mathematicalModel: 'Deterministic filters + cleaning report', mathematicalConcepts: ['Data quality'], requiredData: [D.prices],
    implementation: 'src/lib/returns/clean.ts · cleanPrices(), flagAnomalies()', validation: ['Unit tests', 'Benchmark against independent implementation'],
    professionalUse: ['Model Validation', 'Middle Office / Risk Control'], priority: 'P0', status: 'COMPLETED',
    layers: layers(CO, CO, CO, CO, CO, CO), dependencies: ['DAT-001'], nextAction: 'Closed — validated vs pandas (exact). Revalidate on any change to cleaning rules',
    portfolioValue: 'MEDIUM', master: R.rData, phase: 1, docPath: '/quant/data/cleaning', livePath: '/volatility' }),
  item({ id: 'DAT-003', module: 'Returns', submodule: 'Returns Engine', concept: 'Returns Engine — log/simple returns, resampling, multi-asset alignment',
    mathematicalModel: 'r_t = ln(P_t / P_{t-1})', mathematicalConcepts: ['Log returns', 'Time additivity'], requiredData: [D.prices],
    implementation: 'src/lib/returns/ · buildReturnsDataset(), logReturns(), simpleReturns(), resamplePrices(), alignPrices()', validation: ['Unit tests', 'Benchmark against independent implementation'],
    professionalUse: ['Quantitative Research', 'Market Risk'], priority: 'P0', status: 'COMPLETED',
    layers: layers(CO, CO, CO, CO, CO, CO), dependencies: ['DAT-002'], nextAction: 'Closed — base input for COR-001/COR-002 (multi-asset panel ready)',
    portfolioValue: 'MEDIUM', master: R.python, phase: 1, docPath: '/quant/data/returns', livePath: '/volatility' }),
  item({ id: 'STA-001', module: 'Statistics', submodule: 'Descriptive Statistics', concept: 'Moments and normality diagnostics',
    mathematicalModel: 'Mean, std (n−1), skewness, kurtosis, Jarque-Bera ~ χ²(2)', mathematicalConcepts: ['Moments', 'Hypothesis testing'], requiredData: [D.derived],
    implementation: 'src/lib/volatility/statistics.ts', validation: ['Unit tests', 'Benchmark against independent implementation', 'Statistical diagnostics'],
    professionalUse: ['Quantitative Research', 'Model Validation'], priority: 'P0', status: 'COMPLETED',
    layers: layers(CO, CO, CO, CO, CO, CO), dependencies: ['DAT-003'], nextAction: 'Closed — validated vs scipy.stats',
    portfolioValue: 'MEDIUM', master: R.python, phase: 1, docPath: '/quant/statistics/descriptive', livePath: '/volatility' }),
  item({ id: 'STA-002', module: 'Statistics', submodule: 'Time Series', concept: 'Autocorrelation and stationarity',
    mathematicalModel: 'ACF/PACF, Ljung-Box, ADF', mathematicalConcepts: ['Stationarity', 'Autocorrelation'], requiredData: [D.derived],
    implementation: 'Planned: src/lib/timeseries/', validation: ['Unit tests', 'Benchmark against independent implementation'],
    professionalUse: ['Quantitative Research'], priority: 'P1', status: 'PLANNED', dependencies: ['DAT-003'],
    nextAction: 'Specify ACF + Ljung-Box on returns and squared returns (ARCH effects)', portfolioValue: 'MEDIUM', master: VOL_TS, phase: 1, docPath: '/quant/statistics/time-series' }),

  /* ===== Phase 2 — Volatility ===== */
  item({ id: 'VOL-001', module: 'Volatility', submodule: 'Historical Volatility', concept: 'Realized volatility',
    mathematicalModel: 'σ = √252 · std(r); rolling σ_t over trailing window', mathematicalConcepts: ['Sample variance', 'Square-root-of-time'], requiredData: [D.prices],
    implementation: 'src/lib/volatility/historical.ts · rolling.ts', validation: ['Unit tests', 'Benchmark against independent implementation'],
    professionalUse: ['Market Risk', 'Portfolio Management'], priority: 'P0', status: 'COMPLETED',
    layers: layers(CO, CO, CO, CO, CO, CO), dependencies: ['DAT-003'], nextAction: 'Closed — validated vs pandas rolling std (20D/60D)',
    portfolioValue: 'HIGH', master: VOL_TS, phase: 2, docPath: '/quant/volatility/historical', livePath: '/volatility' }),
  item({ id: 'VOL-002', module: 'Volatility', submodule: 'EWMA Volatility', concept: 'Exponentially weighted variance',
    mathematicalModel: 'σ²_t = λσ²_{t−1} + (1−λ) r²_{t−1}', mathematicalConcepts: ['Exponential smoothing', 'RiskMetrics'], requiredData: [D.prices],
    implementation: 'src/lib/volatility/ewma.ts', validation: ['Unit tests', 'Benchmark against independent implementation'],
    professionalUse: ['Market Risk', 'Risk Analytics'], priority: 'P0', status: 'COMPLETED',
    layers: layers(CO, CO, CO, CO, CO, CO), dependencies: ['DAT-003', 'VOL-001'], nextAction: 'Closed — validated vs numpy loop + pandas ewm. Seed sensitivity documented as limitation',
    portfolioValue: 'HIGH', master: VOL_TS, phase: 2, docPath: '/quant/volatility/ewma', livePath: '/volatility' }),
  item({ id: 'VOL-003', module: 'Volatility', submodule: 'ARCH/GARCH', concept: 'Conditional heteroskedasticity',
    mathematicalModel: 'σ²_t = ω + α ε²_{t−1} + β σ²_{t−1}, MLE', mathematicalConcepts: ['Maximum likelihood', 'Mean reversion of variance'], requiredData: [D.prices],
    implementation: 'Planned: src/lib/volatility/garch.ts (VolatilityModel interface)', validation: ['Unit tests', 'Benchmark against independent implementation', 'Parameter stability'],
    professionalUse: ['Market Risk', 'Quantitative Research'], priority: 'P0', status: 'PLANNED', dependencies: ['DAT-003', 'VOL-002', 'STA-002'],
    nextAction: 'Write GARCH(1,1) spec: likelihood, constraints (ω>0, α+β<1), optimizer', portfolioValue: 'HIGH', master: VOL_TS, phase: 2, docPath: '/quant/volatility/garch' }),
  item({ id: 'VOL-004', module: 'Volatility', submodule: 'Asymmetric GARCH', concept: 'Leverage effect',
    mathematicalModel: 'GJR-GARCH / EGARCH', mathematicalConcepts: ['Asymmetry', 'Leverage effect'], requiredData: [D.prices],
    implementation: 'Planned: src/lib/volatility/garch.ts', validation: ['Benchmark against independent implementation', 'Statistical diagnostics'],
    professionalUse: ['Quantitative Research', 'Market Risk'], priority: 'P1', status: 'NOT STARTED', dependencies: ['VOL-003'],
    nextAction: 'After GARCH(1,1) validated', portfolioValue: 'MEDIUM', master: VOL_TS, phase: 2, docPath: '/quant/volatility/asymmetric-garch' }),
  item({ id: 'VOL-005', module: 'Volatility', submodule: 'Volatility Forecasting', concept: 'Multi-step variance forecasts',
    mathematicalModel: 'GARCH term structure E[σ²_{t+h}]; loss functions (QLIKE, MSE)', mathematicalConcepts: ['Forecast evaluation'], requiredData: [D.prices],
    implementation: 'Planned', validation: ['Out-of-sample testing', 'Backtesting'],
    professionalUse: ['Market Risk', 'Trading'], priority: 'P1', status: 'NOT STARTED', dependencies: ['VOL-003'],
    nextAction: 'Define OOS split and loss functions', portfolioValue: 'HIGH', master: VOL_TS, phase: 2, docPath: '/quant/volatility/forecasting' }),
  item({ id: 'VOL-006', module: 'Volatility', submodule: 'Regime Detection', concept: 'Volatility regimes',
    mathematicalModel: 'Threshold / Markov-switching / HMM on volatility', mathematicalConcepts: ['Hidden Markov models'], requiredData: [D.derived],
    implementation: 'Planned', validation: ['Out-of-sample testing', 'Parameter stability'],
    professionalUse: ['Quantitative Research', 'Portfolio Management'], priority: 'P1', status: 'NOT STARTED', dependencies: ['VOL-003'],
    nextAction: 'Start with transparent threshold regimes before HMM', portfolioValue: 'HIGH', master: VERIFY('Volatility regimes (contexto §3)'), phase: 3, docPath: '/quant/volatility/regimes' }),

  /* ===== Phase 4 — Correlation / Covariance ===== */
  item({ id: 'COR-001', module: 'Correlation', submodule: 'Rolling Covariance', concept: 'Sample covariance matrix',
    mathematicalModel: 'Σ = (1/(n−1)) Rᵀ R (demeaned), trailing window', mathematicalConcepts: ['Covariance matrices'], requiredData: [D.multiPrices],
    implementation: 'Planned: src/lib/covariance/', validation: ['Unit tests', 'Benchmark against independent implementation'],
    professionalUse: ['Portfolio Management', 'Market Risk'], priority: 'P0', status: 'PLANNED', dependencies: ['DAT-003'],
    nextAction: 'Multi-asset aligned returns matrix', portfolioValue: 'HIGH', master: R.mpt, phase: 4, docPath: '/quant/correlation/covariance' }),
  item({ id: 'COR-002', module: 'Correlation', submodule: 'Rolling Correlation', concept: 'Time-varying correlation',
    mathematicalModel: 'ρ = D⁻¹ Σ D⁻¹', mathematicalConcepts: ['Correlation'], requiredData: [D.multiPrices],
    implementation: 'Planned', validation: ['Unit tests'], professionalUse: ['Portfolio Management', 'Risk Analytics'],
    priority: 'P0', status: 'PLANNED', dependencies: ['DAT-003', 'COR-001'], nextAction: 'Heatmap + rolling pairwise chart', portfolioValue: 'HIGH', master: R.mpt, phase: 4, docPath: '/quant/correlation/rolling' }),
  item({ id: 'COR-003', module: 'Correlation', submodule: 'EWMA Covariance', concept: 'Exponentially weighted covariance',
    mathematicalModel: 'Σ_t = λΣ_{t−1} + (1−λ) r_{t−1} r_{t−1}ᵀ', mathematicalConcepts: ['RiskMetrics covariance'], requiredData: [D.multiPrices],
    implementation: 'Planned', validation: ['Unit tests', 'Benchmark against independent implementation'], professionalUse: ['Market Risk'],
    priority: 'P1', status: 'NOT STARTED', dependencies: ['DAT-003', 'COR-001', 'VOL-002'], nextAction: 'Reuse EWMA recursion in matrix form', portfolioValue: 'MEDIUM', master: VERIFY('Correlation and covariance (contexto §4)'), phase: 4, docPath: '/quant/correlation/ewma' }),
  item({ id: 'COR-004', module: 'Correlation', submodule: 'Shrinkage Covariance', concept: 'Estimation-error reduction',
    mathematicalModel: 'Ledoit-Wolf: Σ* = δF + (1−δ)S', mathematicalConcepts: ['Shrinkage', 'Estimation error'], requiredData: [D.multiPrices],
    implementation: 'Planned', validation: ['Benchmark against independent implementation', 'Out-of-sample testing'], professionalUse: ['Portfolio Management', 'Quantitative Research'],
    priority: 'P1', status: 'NOT STARTED', dependencies: ['COR-001'], nextAction: 'Compare OOS portfolio variance vs sample Σ', portfolioValue: 'HIGH', master: R.optim, phase: 4, docPath: '/quant/correlation/shrinkage' }),
  item({ id: 'COR-005', module: 'Correlation', submodule: 'PCA', concept: 'Factor decomposition',
    mathematicalModel: 'Σ = QΛQᵀ, explained variance', mathematicalConcepts: ['Eigen-decomposition'], requiredData: [D.multiPrices],
    implementation: 'Planned', validation: ['Unit tests', 'Parameter stability'], professionalUse: ['Quantitative Research', 'Risk Analytics'],
    priority: 'P2', status: 'NOT STARTED', dependencies: ['COR-001'], nextAction: 'Eigen solver for symmetric matrices', portfolioValue: 'MEDIUM', master: R.algebra, phase: 4, docPath: '/quant/correlation/pca' }),

  /* ===== Phase 5 — Portfolio ===== */
  item({ id: 'POR-001', module: 'Portfolio', submodule: 'Minimum Variance Portfolio', concept: 'Global minimum variance',
    mathematicalModel: 'w = Σ⁻¹1 / (1ᵀΣ⁻¹1)', mathematicalConcepts: ['Quadratic optimization'], requiredData: [D.derived],
    implementation: 'Planned: src/lib/portfolio/', validation: ['Unit tests', 'Benchmark against independent implementation', 'Out-of-sample testing'],
    professionalUse: ['Portfolio Management'], priority: 'P0', status: 'NOT STARTED', dependencies: ['DAT-003', 'COR-001'],
    nextAction: 'Closed form first, then constrained QP', portfolioValue: 'HIGH', master: R.mpt, phase: 5, docPath: '/quant/portfolio/minimum-variance' }),
  item({ id: 'POR-002', module: 'Portfolio', submodule: 'Maximum Sharpe Portfolio', concept: 'Tangency portfolio',
    mathematicalModel: 'w ∝ Σ⁻¹(μ − r_f)', mathematicalConcepts: ['Sharpe ratio', 'Capital market line'], requiredData: [D.derived, D.rates],
    implementation: 'Planned', validation: ['Unit tests', 'Sensitivity analysis', 'Out-of-sample testing'], professionalUse: ['Portfolio Management', 'Investment Research'],
    priority: 'P0', status: 'NOT STARTED', dependencies: ['POR-001'], nextAction: 'Document sensitivity to μ estimation error', portfolioValue: 'HIGH', master: R.mpt, phase: 5, docPath: '/quant/portfolio/max-sharpe' }),
  item({ id: 'POR-003', module: 'Portfolio', submodule: 'Efficient Frontier', concept: 'Mean-variance frontier',
    mathematicalModel: 'min wᵀΣw s.t. wᵀμ = μ*, 1ᵀw = 1', mathematicalConcepts: ['Markowitz'], requiredData: [D.derived],
    implementation: 'Planned', validation: ['Unit tests', 'Numerical convergence'], professionalUse: ['Portfolio Management'],
    priority: 'P0', status: 'NOT STARTED', dependencies: ['POR-001', 'POR-002'], nextAction: 'Frontier chart with asset points', portfolioValue: 'HIGH', master: R.mpt, phase: 5, docPath: '/quant/portfolio/efficient-frontier' }),
  item({ id: 'POR-004', module: 'Portfolio', submodule: 'Risk Parity', concept: 'Equal risk contribution',
    mathematicalModel: 'w_i (Σw)_i = wᵀΣw / N', mathematicalConcepts: ['Risk contribution'], requiredData: [D.derived],
    implementation: 'Planned', validation: ['Unit tests', 'Numerical convergence'], professionalUse: ['Portfolio Management', 'Risk Analytics'],
    priority: 'P1', status: 'NOT STARTED', dependencies: ['COR-001'], nextAction: 'Iterative solver with convergence report', portfolioValue: 'HIGH', master: R.optim, phase: 5, docPath: '/quant/portfolio/risk-parity' }),
  item({ id: 'POR-005', module: 'Portfolio', submodule: 'Portfolio Constraints', concept: 'Long-only, bounds, groups',
    mathematicalModel: 'Constrained QP', mathematicalConcepts: ['KKT conditions'], requiredData: [D.derived],
    implementation: 'Planned', validation: ['Unit tests', 'Numerical convergence'], professionalUse: ['Portfolio Management'],
    priority: 'P1', status: 'NOT STARTED', dependencies: ['POR-001'], nextAction: 'Select a browser-side QP solver', portfolioValue: 'MEDIUM', master: R.optim, phase: 5, docPath: '/quant/portfolio/constraints' }),
  item({ id: 'POR-006', module: 'Portfolio', submodule: 'Portfolio Turnover', concept: 'Rebalancing cost control',
    mathematicalModel: 'Σ|w_t − w_{t−1}| penalty / constraint', mathematicalConcepts: ['Transaction costs'], requiredData: [D.derived],
    implementation: 'Planned', validation: ['Backtesting', 'Sensitivity analysis'], professionalUse: ['Portfolio Management', 'Trading'],
    priority: 'P2', status: 'NOT STARTED', dependencies: ['POR-005'], nextAction: 'After constrained optimizer', portfolioValue: 'MEDIUM', master: R.optim, phase: 5, docPath: '/quant/portfolio/turnover' }),

  /* ===== Phase 6 — Risk ===== */
  item({ id: 'RSK-001', module: 'Risk', submodule: 'Historical VaR', concept: 'Empirical quantile loss',
    mathematicalModel: 'VaR_α = −quantile_α(P&L)', mathematicalConcepts: ['Empirical quantiles'], requiredData: [D.derived],
    implementation: 'Planned: src/lib/risk/', validation: ['Unit tests', 'Backtesting'], professionalUse: ['Market Risk', 'Middle Office / Risk Control'],
    priority: 'P0', status: 'NOT STARTED', dependencies: ['DAT-003'], nextAction: 'Single-asset historical VaR on existing returns engine', portfolioValue: 'HIGH', master: R.var, phase: 6, docPath: '/quant/risk/var' }),
  item({ id: 'RSK-002', module: 'Risk', submodule: 'Parametric VaR', concept: 'Gaussian VaR',
    mathematicalModel: 'VaR = −(μ + z_α σ)', mathematicalConcepts: ['Normal quantiles'], requiredData: [D.derived],
    implementation: 'Planned', validation: ['Unit tests', 'Backtesting'], professionalUse: ['Market Risk'],
    priority: 'P0', status: 'NOT STARTED', dependencies: ['DAT-003', 'VOL-001'], nextAction: 'Plug any VolatilityModel as σ input', portfolioValue: 'HIGH', master: R.var, phase: 6, docPath: '/quant/risk/parametric-var' }),
  item({ id: 'RSK-003', module: 'Risk', submodule: 'Student-t VaR', concept: 'Fat-tailed VaR',
    mathematicalModel: 't_ν quantile scaled by √((ν−2)/ν)', mathematicalConcepts: ['Student-t'], requiredData: [D.derived],
    implementation: 'Planned', validation: ['Backtesting', 'Statistical diagnostics'], professionalUse: ['Market Risk'],
    priority: 'P1', status: 'NOT STARTED', dependencies: ['RSK-002', 'STA-001'], nextAction: 'Estimate ν by MLE or kurtosis matching', portfolioValue: 'MEDIUM', master: VERIFY('VaR — Student-t (contexto §6)'), phase: 6, docPath: '/quant/risk/student-t-var' }),
  item({ id: 'RSK-004', module: 'Risk', submodule: 'Monte Carlo VaR', concept: 'Simulated P&L distribution',
    mathematicalModel: 'Simulate returns ~ model, take α-quantile', mathematicalConcepts: ['Monte Carlo', 'Cholesky'], requiredData: [D.derived],
    implementation: 'Planned (reuse src/lib/options/monte-carlo.ts RNG)', validation: ['Numerical convergence', 'Backtesting'], professionalUse: ['Market Risk', 'Risk Analytics'],
    priority: 'P1', status: 'NOT STARTED', dependencies: ['COR-001', 'RSK-002'], nextAction: 'Convergence chart vs number of paths', portfolioValue: 'HIGH', master: R.var, phase: 6, docPath: '/quant/risk/monte-carlo-var' }),
  item({ id: 'RSK-005', module: 'Risk', submodule: 'Expected Shortfall', concept: 'Tail conditional expectation',
    mathematicalModel: 'ES_α = E[L | L ≥ VaR_α]', mathematicalConcepts: ['Coherent risk measures'], requiredData: [D.derived],
    implementation: 'Planned', validation: ['Unit tests', 'Backtesting'], professionalUse: ['Market Risk', 'Middle Office / Risk Control'],
    priority: 'P0', status: 'NOT STARTED', dependencies: ['DAT-003', 'RSK-001'], nextAction: 'Implement alongside historical VaR', portfolioValue: 'HIGH', master: R.var, phase: 6, docPath: '/quant/risk/expected-shortfall' }),
  item({ id: 'RSK-006', module: 'Risk', submodule: 'VaR Backtesting', concept: 'Exception testing',
    mathematicalModel: 'Kupiec POF, Christoffersen independence', mathematicalConcepts: ['Likelihood ratio tests'], requiredData: [D.derived],
    implementation: 'Planned', validation: ['Backtesting', 'Statistical diagnostics'], professionalUse: ['Model Validation', 'Market Risk'],
    priority: 'P1', status: 'NOT STARTED', dependencies: ['RSK-001', 'RSK-002'], nextAction: 'Traffic-light table + exceptions chart', portfolioValue: 'HIGH', master: VERIFY('VaR backtesting (contexto §6)'), phase: 6, docPath: '/quant/risk/backtesting' }),
  item({ id: 'RSK-007', module: 'Risk', submodule: 'Stress Testing', concept: 'Historical and hypothetical scenarios',
    mathematicalModel: 'Portfolio revaluation under shocks', mathematicalConcepts: ['Scenario analysis'], requiredData: [D.scenarios, D.derived],
    implementation: 'Planned', validation: ['Stress testing', 'Sensitivity analysis'], professionalUse: ['Market Risk', 'Risk Analytics'],
    priority: 'P1', status: 'NOT STARTED', dependencies: ['RSK-001'], nextAction: 'Curate scenario CSV (2008, 2020, 2022)', portfolioValue: 'HIGH', master: R.var, phase: 6, docPath: '/quant/risk/stress-testing' }),

  /* ===== Phase 7 — Derivatives (existing Options Engine) ===== */
  item({ id: 'DER-001', module: 'Derivatives', submodule: 'Option Pricing', concept: 'Black-Scholes, binomial CRR, Monte Carlo',
    mathematicalModel: 'BSM closed form; CRR tree; GBM simulation', mathematicalConcepts: ['No-arbitrage', 'Risk-neutral measure'], requiredData: [D.prices, D.rates],
    implementation: 'src/lib/options/black-scholes.ts · binomial.ts · monte-carlo.ts', validation: ['Unit tests', 'Benchmark against independent implementation', 'Numerical convergence'],
    professionalUse: ['Derivatives', 'Trading'], priority: 'P0', status: 'IN PROGRESS',
    layers: layers(CO, CO, CO, CO, NS, IP), dependencies: ['VOL-001'], nextAction: 'Add unit tests: put-call parity, CRR→BSM convergence',
    portfolioValue: 'HIGH', master: R.bsm, phase: 7, docPath: '/quant/derivatives/black-scholes', livePath: '/options-pricing' }),
  item({ id: 'DER-002', module: 'Derivatives', submodule: 'Greeks', concept: 'Sensitivities',
    mathematicalModel: 'Δ, Γ, ν, Θ, ρ (analytic BSM)', mathematicalConcepts: ['Partial derivatives'], requiredData: [D.derived],
    implementation: 'src/lib/options/black-scholes.ts', validation: ['Unit tests', 'Benchmark against independent implementation'],
    professionalUse: ['Derivatives', 'Trading', 'Risk Analytics'], priority: 'P0', status: 'IN PROGRESS',
    layers: layers(CO, CO, CO, CO, NS, IP), dependencies: ['DER-001'], nextAction: 'Validate analytic Greeks vs finite differences',
    portfolioValue: 'HIGH', master: R.strat, phase: 7, docPath: '/quant/derivatives/greeks', livePath: '/options-pricing' }),
  item({ id: 'DER-003', module: 'Derivatives', submodule: 'Implied Volatility', concept: 'Inverse BSM',
    mathematicalModel: 'Solve C_mkt − C_BS(σ) = 0 (bisection)', mathematicalConcepts: ['Root finding'], requiredData: [D.chain, D.rates],
    implementation: 'src/lib/options/vol-surface.ts · impliedVolatility()', validation: ['Unit tests', 'Numerical convergence'],
    professionalUse: ['Derivatives', 'Trading'], priority: 'P0', status: 'IN PROGRESS',
    layers: layers(CO, CO, CO, CO, NS, IP), dependencies: ['DER-001'], nextAction: 'Round-trip test price→IV→price',
    portfolioValue: 'HIGH', master: R.smile, phase: 7, docPath: '/quant/derivatives/implied-volatility', livePath: '/options-pricing' }),
  item({ id: 'DER-004', module: 'Derivatives', submodule: 'Volatility Smile', concept: 'IV across strikes',
    mathematicalModel: 'σ_impl(K) for fixed T', mathematicalConcepts: ['Skew', 'Smile'], requiredData: [D.chain],
    implementation: 'Options Pricing · smile chart', validation: ['Historical comparison'],
    professionalUse: ['Derivatives', 'Quantitative Research'], priority: 'P1', status: 'IN PROGRESS',
    layers: layers(CO, IP, CO, CO, NS, NS), dependencies: ['DER-003'], nextAction: 'Use market IV from DER-003 instead of modelled smile',
    portfolioValue: 'MEDIUM', master: R.smile, phase: 7, docPath: '/quant/derivatives/smile', livePath: '/options-pricing' }),
  item({ id: 'DER-005', module: 'Derivatives', submodule: 'Volatility Surface', concept: 'IV across strikes and maturities',
    mathematicalModel: 'σ_impl(K,T) grid interpolation + calendar-variance fix', mathematicalConcepts: ['Static arbitrage'], requiredData: [D.chain, D.rates],
    implementation: 'src/lib/options/vol-surface.ts · VolatilitySurface.tsx', validation: ['Unit tests', 'Statistical diagnostics'],
    professionalUse: ['Derivatives', 'Quantitative Research'], priority: 'P1', status: 'IN PROGRESS',
    layers: layers(CO, CO, CO, CO, NS, IP), dependencies: ['DER-003'], nextAction: 'Unit-test arbitrage filter and calendar monotonicity',
    portfolioValue: 'HIGH', master: R.gatheral, phase: 7, docPath: '/quant/derivatives/surface', livePath: '/options-pricing' }),
  item({ id: 'DER-009', module: 'Derivatives', submodule: 'Monte Carlo Derivatives', concept: 'Simulation pricing',
    mathematicalModel: 'E^Q[e^{−rT} payoff] via GBM paths', mathematicalConcepts: ['Monte Carlo', 'Law of large numbers'], requiredData: [D.derived],
    implementation: 'src/lib/options/monte-carlo.ts', validation: ['Numerical convergence', 'Benchmark against independent implementation'],
    professionalUse: ['Derivatives', 'Quantitative Research'], priority: 'P1', status: 'IN PROGRESS',
    layers: layers(CO, CO, CO, CO, NS, IP), dependencies: ['DER-001'], nextAction: 'Report standard error and convergence vs BSM',
    portfolioValue: 'MEDIUM', master: R.stoch, phase: 7, docPath: '/quant/derivatives/monte-carlo', livePath: '/options-pricing' }),
  item({ id: 'DER-010', module: 'Derivatives', submodule: 'Delta Hedging', concept: 'Discrete hedging P&L',
    mathematicalModel: 'Self-financing replication, rebalancing error', mathematicalConcepts: ['Replication', 'Gamma P&L'], requiredData: [D.prices, D.derived],
    implementation: 'Planned', validation: ['Backtesting', 'Sensitivity analysis'], professionalUse: ['Derivatives', 'Trading'],
    priority: 'P1', status: 'NOT STARTED', dependencies: ['DER-002', 'VOL-001'], nextAction: 'Historical hedging simulation on real path', portfolioValue: 'HIGH', master: R.strat, phase: 7, docPath: '/quant/derivatives/delta-hedging' }),
  item({ id: 'DER-011', module: 'Derivatives', submodule: 'Portfolio Hedging', concept: 'Hedging portfolio risk with derivatives',
    mathematicalModel: 'Minimum-variance hedge ratio, Greek neutralization', mathematicalConcepts: ['Hedge ratio'], requiredData: [D.derived],
    implementation: 'Planned', validation: ['Backtesting', 'Stress testing'], professionalUse: ['Portfolio Management', 'Derivatives'],
    priority: 'P2', status: 'NOT STARTED', dependencies: ['DER-010', 'POR-001', 'RSK-001'], nextAction: 'After portfolio and VaR engines', portfolioValue: 'HIGH', master: VERIFY('Portfolio hedging'), phase: 7, docPath: '/quant/derivatives/portfolio-hedging' }),

  /* ===== Core items that are advanced in nature (Phase 8) ===== */
  item({ id: 'DER-006', module: 'Derivatives', submodule: 'SVI', concept: 'Parametric smile calibration',
    mathematicalModel: 'w(k) = a + b(ρ(k−m) + √((k−m)² + σ²))', mathematicalConcepts: ['Calibration', 'No-butterfly arbitrage'], requiredData: [D.chain],
    implementation: 'Planned', validation: ['Parameter stability', 'Statistical diagnostics'], professionalUse: ['Derivatives', 'Quantitative Research'],
    priority: 'P2', status: 'NOT STARTED', dependencies: ['DER-005'], nextAction: 'Replace grid interpolation with per-slice SVI', portfolioValue: 'HIGH', master: R.gatheral, phase: 8, docPath: '/quant/derivatives/svi' }),
  item({ id: 'DER-007', module: 'Derivatives', submodule: 'Local Volatility', concept: 'Dupire local volatility',
    mathematicalModel: 'σ²_loc = ∂_T w / (Dupire denominator in k)', mathematicalConcepts: ['Dupire equation'], requiredData: [D.derived],
    implementation: 'Planned', validation: ['Numerical convergence', 'Benchmark against independent implementation'], professionalUse: ['Derivatives'],
    priority: 'P3', status: 'NOT STARTED', dependencies: ['DER-006'], nextAction: 'Requires smooth arbitrage-free surface', portfolioValue: 'MEDIUM', master: R.gatheral, phase: 8, docPath: '/quant/derivatives/local-vol' }),
  item({ id: 'DER-008', module: 'Derivatives', submodule: 'Heston', concept: 'Stochastic volatility',
    mathematicalModel: 'dv = κ(θ−v)dt + ξ√v dW², corr ρ; Fourier pricing', mathematicalConcepts: ['Stochastic calculus', 'Characteristic functions'], requiredData: [D.chain, D.rates],
    implementation: 'Planned', validation: ['Benchmark against independent implementation', 'Parameter stability', 'Numerical convergence'], professionalUse: ['Derivatives', 'Quantitative Research'],
    priority: 'P3', status: 'NOT STARTED', dependencies: ['DER-005', 'DER-009'], nextAction: 'Deferred to Phase 8', portfolioValue: 'HIGH', master: R.gatheral, phase: 8, docPath: '/quant/derivatives/heston' }),
];

/* ---------- Advanced / complementary modules ---------- */
const adv = (id: string, module: string, submodule: string, model: string, deps: string[], master: MasterReference, use: MatrixItem['professionalUse'], validation: MatrixItem['validation'], livePath?: string, status: MatrixItem['status'] = 'ADVANCED'): MatrixItem =>
  item({ id, tier: 'ADVANCED', module, submodule, concept: submodule, mathematicalModel: model, mathematicalConcepts: [], requiredData: [D.derived],
    implementation: livePath ? 'Partially available in existing module' : 'Deferred', validation, professionalUse: use, priority: 'P3', status, dependencies: deps,
    nextAction: 'Deferred — revisit after core dependencies are validated', portfolioValue: 'MEDIUM', master, phase: 8,
    docPath: `/quant/advanced/${submodule.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, livePath });

export const advancedModules: MatrixItem[] = [
  adv('ADV-001', 'Volatility', 'Stochastic Volatility', 'SV models (Heston, SABR)', ['DER-008'], R.gatheral, ['Derivatives', 'Quantitative Research'], ['Parameter stability']),
  adv('ADV-002', 'Volatility', 'Heston Calibration', 'Least-squares fit to IV surface', ['DER-008', 'DER-005'], R.gatheral, ['Derivatives'], ['Parameter stability', 'Numerical convergence']),
  adv('ADV-003', 'Volatility', 'Local Volatility', 'Dupire PDE / MC pricing', ['DER-007'], R.gatheral, ['Derivatives'], ['Numerical convergence']),
  adv('ADV-004', 'Volatility', 'SVI Calibration', 'SSVI global surface', ['DER-006'], R.gatheral, ['Derivatives'], ['Parameter stability']),
  adv('ADV-005', 'Exotics', 'Exotic Options', 'Path-dependent payoffs', ['DER-009'], R.exoticBook, ['Derivatives'], ['Numerical convergence']),
  adv('ADV-006', 'Exotics', 'Barrier Options', 'Knock-in/out, reflection / MC', ['DER-009'], R.exoticBook, ['Derivatives', 'Trading'], ['Benchmark against independent implementation']),
  adv('ADV-007', 'Exotics', 'Asian Options', 'Average-price payoffs, MC with control variate', ['DER-009'], R.exoticBook, ['Derivatives'], ['Numerical convergence']),
  adv('ADV-008', 'Exotics', 'Digital Options', 'Cash-or-nothing: e^{−rT}N(d₂)', ['DER-001'], R.exoticBook, ['Derivatives'], ['Unit tests']),
  adv('ADV-009', 'Structured Products', 'Autocallables', 'Multi-observation MC with barriers', ['ADV-006'], R.exotic, ['Derivatives', 'Trading'], ['Numerical convergence']),
  adv('ADV-010', 'Structured Products', 'Worst-of Structures', 'Multi-asset correlated MC', ['ADV-009', 'COR-001'], R.exotic, ['Derivatives'], ['Numerical convergence', 'Sensitivity analysis']),
  adv('ADV-011', 'Hedging', 'Dynamic Hedging', 'Continuous rebalancing under SV/costs', ['DER-010'], R.strat, ['Derivatives', 'Trading'], ['Backtesting']),
  adv('ADV-012', 'Monte Carlo', 'Advanced Monte Carlo', 'Correlated paths, Euler/Milstein schemes', ['DER-009'], R.stoch, ['Quantitative Research'], ['Numerical convergence']),
  adv('ADV-013', 'Monte Carlo', 'Variance Reduction', 'Antithetic, control variates, QMC', ['DER-009'], R.stoch, ['Quantitative Research'], ['Numerical convergence']),
  adv('ADV-014', 'Credit Risk', 'Credit Risk', 'Altman Z-Score, ratio scorecard', [], VERIFY('Credit risk (contexto §12)'), ['Credit Risk'], ['Historical comparison'], '/credit-analysis', 'IN PROGRESS'),
  adv('ADV-015', 'Credit Risk', 'Merton Model', 'Equity as call on firm assets', ['DER-001', 'ADV-014'], VERIFY('Credit risk — Merton (contexto §12)'), ['Credit Risk', 'Quantitative Research'], ['Benchmark against independent implementation']),
  adv('ADV-016', 'Credit Risk', 'Distance-to-Default', 'DD = (ln(V/D) + (μ−σ²/2)T) / σ√T', ['ADV-015'], VERIFY('Credit risk — DD (contexto §12)'), ['Credit Risk'], ['Historical comparison']),
  adv('ADV-017', 'Fixed Income', 'Fixed Income Curve Risk', 'Curve shifts, key-rate durations', [], VERIFY('Fixed income (contexto §11)'), ['Fixed Income', 'Market Risk'], ['Sensitivity analysis']),
  adv('ADV-018', 'Fixed Income', 'Duration / Convexity', 'D = −(1/P) dP/dy; C = (1/P) d²P/dy²', [], VERIFY('Fixed income (contexto §11)'), ['Fixed Income'], ['Unit tests']),
  adv('ADV-019', 'Risk', 'Scenario Analysis', 'Multi-factor scenario revaluation', ['RSK-007'], R.var, ['Market Risk', 'Risk Analytics'], ['Stress testing']),
];

export const allMatrixItems: MatrixItem[] = [...quantitativeProjectMatrix, ...advancedModules];
