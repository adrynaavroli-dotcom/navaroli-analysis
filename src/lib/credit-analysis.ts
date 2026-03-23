// Credit Analysis Engine - Scorecard & Altman Z-Score calculations

export interface CreditInputs {
  // Balance Sheet
  totalAssets: number;
  currentAssets: number;
  totalLiabilities: number;
  currentLiabilities: number;
  equity: number;
  retainedEarnings: number;
  // Income Statement
  revenue: number;
  ebit: number;
  ebitda: number | null; // If null, estimate as EBIT + 10% of Revenue
  interestExpense: number;
  // Market
  marketCap: number | null; // If null, use book equity as proxy
}

export type SignalLevel = 'green' | 'yellow' | 'red';

export interface RatioResult {
  id: string;
  name: string;
  nameEs: string;
  value: number;
  formatted: string;
  signal: SignalLevel;
  interpretation: string;
  interpretationEs: string;
  description: string;
  descriptionEs: string;
}

export interface ZScoreResult {
  x1: number; // Working Capital / Total Assets
  x2: number; // Retained Earnings / Total Assets
  x3: number; // EBIT / Total Assets
  x4: number; // Market Value Equity / Total Liabilities
  x5: number; // Revenue / Total Assets
  zScore: number;
  zone: 'safe' | 'grey' | 'distress';
  zoneLabel: string;
  zoneLabelEs: string;
}

export interface CreditAnalysisResult {
  ratios: RatioResult[];
  zScore: ZScoreResult;
  overallRating: string;
  overallRatingEs: string;
}

function getEbitda(inputs: CreditInputs): number {
  if (inputs.ebitda !== null && inputs.ebitda > 0) return inputs.ebitda;
  return inputs.ebit + inputs.revenue * 0.1;
}

function getMarketCap(inputs: CreditInputs): number {
  return (inputs.marketCap !== null && inputs.marketCap > 0)
    ? inputs.marketCap
    : Math.max(inputs.equity, 0);
}

export function calculateRatios(inputs: CreditInputs): RatioResult[] {
  const ebitda = getEbitda(inputs);
  const totalDebt = inputs.totalLiabilities;

  // 1. Leverage: Total Debt / EBITDA
  const leverageValue = ebitda > 0 ? totalDebt / ebitda : Infinity;
  const leverageSignal: SignalLevel = leverageValue < 2 ? 'green' : leverageValue > 4 ? 'red' : 'yellow';

  // 2. Interest Coverage: EBIT / Interest Expense
  const coverageValue = inputs.interestExpense > 0 ? inputs.ebit / inputs.interestExpense : Infinity;
  const coverageSignal: SignalLevel = coverageValue > 5 ? 'green' : coverageValue < 1.5 ? 'red' : 'yellow';

  // 3. EBIT Margin: EBIT / Revenue
  const marginValue = inputs.revenue > 0 ? (inputs.ebit / inputs.revenue) * 100 : 0;
  const marginSignal: SignalLevel = marginValue > 15 ? 'green' : marginValue < 5 ? 'red' : 'yellow';

  // 4. Current Ratio: Current Assets / Current Liabilities
  const currentRatio = inputs.currentLiabilities > 0
    ? inputs.currentAssets / inputs.currentLiabilities
    : Infinity;
  const currentSignal: SignalLevel = currentRatio > 1.5 ? 'green' : currentRatio < 1 ? 'red' : 'yellow';

  return [
    {
      id: 'leverage',
      name: 'Total Debt / EBITDA',
      nameEs: 'Deuda Total / EBITDA',
      value: leverageValue,
      formatted: isFinite(leverageValue) ? `${leverageValue.toFixed(2)}x` : 'N/A',
      signal: leverageSignal,
      interpretation: leverageSignal === 'green' ? 'Low leverage' : leverageSignal === 'red' ? 'High leverage' : 'Moderate leverage',
      interpretationEs: leverageSignal === 'green' ? 'Apalancamiento bajo' : leverageSignal === 'red' ? 'Apalancamiento alto' : 'Apalancamiento moderado',
      description: 'Measures how many years of EBITDA it would take to pay off all debt',
      descriptionEs: 'Mide cuántos años de EBITDA serían necesarios para pagar toda la deuda',
    },
    {
      id: 'coverage',
      name: 'Interest Coverage',
      nameEs: 'Cobertura de Intereses',
      value: coverageValue,
      formatted: isFinite(coverageValue) ? `${coverageValue.toFixed(2)}x` : 'N/A',
      signal: coverageSignal,
      interpretation: coverageSignal === 'green' ? 'Strong coverage' : coverageSignal === 'red' ? 'Weak coverage' : 'Adequate coverage',
      interpretationEs: coverageSignal === 'green' ? 'Cobertura sólida' : coverageSignal === 'red' ? 'Cobertura débil' : 'Cobertura adecuada',
      description: 'EBIT / Interest Expense — ability to service debt obligations',
      descriptionEs: 'EBIT / Gastos Financieros — capacidad de servir la deuda',
    },
    {
      id: 'margin',
      name: 'EBIT Margin',
      nameEs: 'Margen EBIT',
      value: marginValue,
      formatted: `${marginValue.toFixed(1)}%`,
      signal: marginSignal,
      interpretation: marginSignal === 'green' ? 'High profitability' : marginSignal === 'red' ? 'Low profitability' : 'Moderate profitability',
      interpretationEs: marginSignal === 'green' ? 'Alta rentabilidad' : marginSignal === 'red' ? 'Baja rentabilidad' : 'Rentabilidad moderada',
      description: 'EBIT / Revenue — operating profitability before interest and taxes',
      descriptionEs: 'EBIT / Ingresos — rentabilidad operativa antes de intereses e impuestos',
    },
    {
      id: 'liquidity',
      name: 'Current Ratio',
      nameEs: 'Ratio de Liquidez',
      value: currentRatio,
      formatted: isFinite(currentRatio) ? `${currentRatio.toFixed(2)}x` : 'N/A',
      signal: currentSignal,
      interpretation: currentSignal === 'green' ? 'Good liquidity' : currentSignal === 'red' ? 'Liquidity risk' : 'Adequate liquidity',
      interpretationEs: currentSignal === 'green' ? 'Buena liquidez' : currentSignal === 'red' ? 'Riesgo de liquidez' : 'Liquidez adecuada',
      description: 'Current Assets / Current Liabilities — short-term solvency',
      descriptionEs: 'Activo Corriente / Pasivo Corriente — solvencia a corto plazo',
    },
  ];
}

export function calculateZScore(inputs: CreditInputs): ZScoreResult {
  const workingCapital = inputs.currentAssets - inputs.currentLiabilities;
  const marketCap = getMarketCap(inputs);

  const x1 = inputs.totalAssets > 0 ? workingCapital / inputs.totalAssets : 0;
  const x2 = inputs.totalAssets > 0 ? inputs.retainedEarnings / inputs.totalAssets : 0;
  const x3 = inputs.totalAssets > 0 ? inputs.ebit / inputs.totalAssets : 0;
  const x4 = inputs.totalLiabilities > 0 ? marketCap / inputs.totalLiabilities : 0;
  const x5 = inputs.totalAssets > 0 ? inputs.revenue / inputs.totalAssets : 0;

  const zScore = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;

  let zone: ZScoreResult['zone'];
  let zoneLabel: string;
  let zoneLabelEs: string;

  if (zScore > 2.99) {
    zone = 'safe';
    zoneLabel = 'Safe Zone';
    zoneLabelEs = 'Zona Segura';
  } else if (zScore >= 1.81) {
    zone = 'grey';
    zoneLabel = 'Grey Zone';
    zoneLabelEs = 'Zona Gris';
  } else {
    zone = 'distress';
    zoneLabel = 'Distress Zone';
    zoneLabelEs = 'Zona de Riesgo';
  }

  return { x1, x2, x3, x4, x5, zScore, zone, zoneLabel, zoneLabelEs };
}

export function analyzeCreditRisk(inputs: CreditInputs): CreditAnalysisResult {
  const ratios = calculateRatios(inputs);
  const zScore = calculateZScore(inputs);

  // Overall rating based on ratios + Z-Score
  const redCount = ratios.filter(r => r.signal === 'red').length;
  const greenCount = ratios.filter(r => r.signal === 'green').length;

  let overallRating: string;
  let overallRatingEs: string;

  if (zScore.zone === 'distress' || redCount >= 3) {
    overallRating = 'High Risk (CCC-B)';
    overallRatingEs = 'Riesgo Alto (CCC-B)';
  } else if (zScore.zone === 'grey' || redCount >= 2) {
    overallRating = 'Speculative (BB)';
    overallRatingEs = 'Especulativo (BB)';
  } else if (greenCount >= 3 && zScore.zone === 'safe') {
    overallRating = 'Investment Grade (A-BBB)';
    overallRatingEs = 'Grado de Inversión (A-BBB)';
  } else {
    overallRating = 'Moderate Risk (BBB-BB)';
    overallRatingEs = 'Riesgo Moderado (BBB-BB)';
  }

  return { ratios, zScore, overallRating, overallRatingEs };
}

// Example datasets
export const healthyCompanyExample: CreditInputs = {
  totalAssets: 50000,
  currentAssets: 18000,
  totalLiabilities: 15000,
  currentLiabilities: 8000,
  equity: 35000,
  retainedEarnings: 22000,
  revenue: 40000,
  ebit: 8000,
  ebitda: 10000,
  interestExpense: 500,
  marketCap: 75000,
};

export const riskyCompanyExample: CreditInputs = {
  totalAssets: 30000,
  currentAssets: 5000,
  totalLiabilities: 28000,
  currentLiabilities: 12000,
  equity: 2000,
  retainedEarnings: -3000,
  revenue: 20000,
  ebit: 1500,
  ebitda: null,
  interestExpense: 3000,
  marketCap: null,
};
