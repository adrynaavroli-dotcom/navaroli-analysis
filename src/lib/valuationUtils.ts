/**
 * Valuation Utilities
 * Centralized financial formulas for DCF modeling and analysis
 */

import type { ConsolidatedYear } from './financial-consolidator';

// ============ DERIVED METRICS ============

/**
 * Calculate Free Cash Flow Yield
 * FCF Yield = Free Cash Flow / Market Cap
 */
export function calculateFCFYield(fcf: number | null, marketCap: number | null): number | null {
  if (fcf === null || marketCap === null || marketCap === 0) return null;
  return (fcf / marketCap) * 100;
}

/**
 * Calculate Return on Invested Capital (ROIC)
 * ROIC = NOPAT / Invested Capital
 * NOPAT = Operating Income * (1 - Tax Rate)
 * Invested Capital = Total Equity + Total Debt - Cash
 */
export function calculateROIC(
  ebit: number | null,
  taxRate: number = 0.21, // Default US corporate tax rate
  totalEquity: number | null,
  totalDebt: number | null,
  cash: number | null
): number | null {
  if (ebit === null || totalEquity === null) return null;
  
  const nopat = ebit * (1 - taxRate);
  const investedCapital = (totalEquity ?? 0) + (totalDebt ?? 0) - (cash ?? 0);
  
  if (investedCapital <= 0) return null;
  return (nopat / investedCapital) * 100;
}

/**
 * Calculate Compound Annual Growth Rate (CAGR)
 * CAGR = (Ending Value / Beginning Value)^(1/n) - 1
 */
export function calculateCAGR(
  beginningValue: number | null,
  endingValue: number | null,
  years: number
): number | null {
  if (beginningValue === null || endingValue === null || years === 0) return null;
  if (beginningValue <= 0 || endingValue <= 0) return null;
  
  return (Math.pow(endingValue / beginningValue, 1 / years) - 1) * 100;
}

/**
 * Calculate Revenue CAGR from historical data
 */
export function calculateRevenueCAGR(years: ConsolidatedYear[]): number | null {
  if (years.length < 2) return null;
  
  const sorted = [...years].sort((a, b) => a.year.localeCompare(b.year));
  const firstWithRevenue = sorted.find(y => y.revenue !== null);
  const lastWithRevenue = sorted.filter(y => y.revenue !== null).pop();
  
  if (!firstWithRevenue || !lastWithRevenue || firstWithRevenue === lastWithRevenue) return null;
  
  const numYears = parseInt(lastWithRevenue.year) - parseInt(firstWithRevenue.year);
  return calculateCAGR(firstWithRevenue.revenue, lastWithRevenue.revenue, numYears);
}

/**
 * Calculate FCF Margin
 * FCF Margin = Free Cash Flow / Revenue
 */
export function calculateFCFMargin(fcf: number | null, revenue: number | null): number | null {
  if (fcf === null || revenue === null || revenue === 0) return null;
  return (fcf / revenue) * 100;
}

/**
 * Calculate Gross Margin
 */
export function calculateGrossMargin(grossProfit: number | null, revenue: number | null): number | null {
  if (grossProfit === null || revenue === null || revenue === 0) return null;
  return (grossProfit / revenue) * 100;
}

/**
 * Calculate Operating Margin (EBIT Margin)
 */
export function calculateOperatingMargin(ebit: number | null, revenue: number | null): number | null {
  if (ebit === null || revenue === null || revenue === 0) return null;
  return (ebit / revenue) * 100;
}

/**
 * Calculate Net Margin
 */
export function calculateNetMargin(netIncome: number | null, revenue: number | null): number | null {
  if (netIncome === null || revenue === null || revenue === 0) return null;
  return (netIncome / revenue) * 100;
}

// ============ DCF MODEL ============

export interface DCFInputs {
  baseFCF: number;
  growthRates: number[]; // Array of growth rates for projection years
  terminalGrowthRate: number; // g
  wacc: number;
  sharesOutstanding: number;
  cash: number;
  totalDebt: number;
}

export interface DCFProjection {
  year: number;
  fcf: number;
  growthRate: number;
  discountFactor: number;
  presentValue: number;
}

export interface DCFResult {
  projections: DCFProjection[];
  terminalValue: number;
  terminalPV: number;
  enterpriseValue: number;
  equityValue: number;
  pricePerShare: number;
  impliedUpside: number | null;
}

/**
 * Calculate 2-Stage DCF Model
 */
export function calculateDCF(inputs: DCFInputs, currentPrice?: number): DCFResult {
  const { baseFCF, growthRates, terminalGrowthRate, wacc, sharesOutstanding, cash, totalDebt } = inputs;
  
  // Stage 1: Explicit Projections
  const projections: DCFProjection[] = [];
  let currentFCF = baseFCF;
  
  for (let i = 0; i < growthRates.length; i++) {
    const year = i + 1;
    const growthRate = growthRates[i];
    currentFCF = currentFCF * (1 + growthRate / 100);
    const discountFactor = 1 / Math.pow(1 + wacc / 100, year);
    const presentValue = currentFCF * discountFactor;
    
    projections.push({
      year,
      fcf: currentFCF,
      growthRate,
      discountFactor,
      presentValue,
    });
  }
  
  // Stage 2: Terminal Value (Gordon Growth Model)
  const lastYear = growthRates.length;
  const terminalFCF = currentFCF * (1 + terminalGrowthRate / 100);
  const terminalValue = terminalFCF / ((wacc - terminalGrowthRate) / 100);
  const terminalDiscountFactor = 1 / Math.pow(1 + wacc / 100, lastYear);
  const terminalPV = terminalValue * terminalDiscountFactor;
  
  // Sum of PVs
  const sumOfProjectionPVs = projections.reduce((sum, p) => sum + p.presentValue, 0);
  const enterpriseValue = sumOfProjectionPVs + terminalPV;
  
  // Equity Value = EV + Cash - Debt
  const equityValue = enterpriseValue + cash - totalDebt;
  
  // Price per Share
  const pricePerShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;
  
  // Implied Upside
  const impliedUpside = currentPrice && currentPrice > 0 
    ? ((pricePerShare - currentPrice) / currentPrice) * 100 
    : null;
  
  return {
    projections,
    terminalValue,
    terminalPV,
    enterpriseValue,
    equityValue,
    pricePerShare,
    impliedUpside,
  };
}

// ============ REVERSE DCF ============

/**
 * Reverse DCF: Find implied FCF growth rate given current price
 * Uses binary search to solve for the growth rate
 */
export function calculateReverseDCF(
  currentPrice: number,
  baseFCF: number,
  sharesOutstanding: number,
  cash: number,
  totalDebt: number,
  wacc: number,
  terminalGrowthRate: number,
  projectionYears: number = 5
): number | null {
  if (currentPrice <= 0 || baseFCF <= 0 || sharesOutstanding <= 0) return null;
  
  const targetEquityValue = currentPrice * sharesOutstanding;
  
  // Binary search for implied growth rate
  let low = -50; // -50% growth
  let high = 100; // 100% growth
  let tolerance = 0.01;
  let maxIterations = 100;
  
  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const growthRates = Array(projectionYears).fill(mid);
    
    const result = calculateDCF({
      baseFCF,
      growthRates,
      terminalGrowthRate,
      wacc,
      sharesOutstanding,
      cash,
      totalDebt,
    });
    
    const diff = result.equityValue - targetEquityValue;
    
    if (Math.abs(diff / targetEquityValue) < tolerance) {
      return mid;
    }
    
    if (diff > 0) {
      high = mid;
    } else {
      low = mid;
    }
  }
  
  return (low + high) / 2;
}

// ============ SENSITIVITY ANALYSIS ============

export interface SensitivityCell {
  wacc: number;
  terminalGrowth: number;
  pricePerShare: number;
}

/**
 * Generate sensitivity matrix for WACC vs Terminal Growth
 */
export function generateSensitivityMatrix(
  baseFCF: number,
  baseGrowthRate: number,
  projectionYears: number,
  sharesOutstanding: number,
  cash: number,
  totalDebt: number,
  waccRange: number[], // e.g., [6, 7, 8, 9, 10, 11, 12]
  terminalGrowthRange: number[] // e.g., [0, 1, 2, 3, 4]
): SensitivityCell[][] {
  const matrix: SensitivityCell[][] = [];
  
  for (const wacc of waccRange) {
    const row: SensitivityCell[] = [];
    for (const terminalGrowth of terminalGrowthRange) {
      // Skip invalid combinations where terminal growth >= wacc
      if (terminalGrowth >= wacc) {
        row.push({ wacc, terminalGrowth, pricePerShare: Infinity });
        continue;
      }
      
      const growthRates = Array(projectionYears).fill(baseGrowthRate);
      const result = calculateDCF({
        baseFCF,
        growthRates,
        terminalGrowthRate: terminalGrowth,
        wacc,
        sharesOutstanding,
        cash,
        totalDebt,
      });
      
      row.push({
        wacc,
        terminalGrowth,
        pricePerShare: result.pricePerShare,
      });
    }
    matrix.push(row);
  }
  
  return matrix;
}

// ============ TEMPLATE-SPECIFIC KPIs ============

export type ValuationTemplate = 'quality' | 'financial' | 'growth' | 'dcf' | 'comparables' | 'lbo' | 'sum_of_parts' | 'custom';

export interface TemplateKPIs {
  primary: string[];
  secondary: string[];
  description: string;
}

export const TEMPLATE_KPI_CONFIG: Record<ValuationTemplate, TemplateKPIs> = {
  quality: {
    primary: ['gross_margin', 'roic', 'fcf_margin'],
    secondary: ['gross_margin_stability', 'revenue_cagr'],
    description: 'Focus on margin stability and return on capital',
  },
  financial: {
    primary: ['eps_growth', 'roe', 'leverage_ratio'],
    secondary: ['net_interest_margin', 'efficiency_ratio'],
    description: 'Focus on EPS growth and financial leverage',
  },
  growth: {
    primary: ['revenue_cagr', 'fcf_yield', 'cash_burn'],
    secondary: ['gross_margin', 'customer_acquisition'],
    description: 'Focus on revenue growth and path to profitability',
  },
  dcf: {
    primary: ['fcf', 'wacc', 'terminal_value'],
    secondary: ['enterprise_value', 'equity_value'],
    description: 'Discounted cash flow valuation',
  },
  comparables: {
    primary: ['ev_ebitda', 'pe_ratio', 'ps_ratio'],
    secondary: ['peg_ratio', 'ev_revenue'],
    description: 'Relative valuation using peer multiples',
  },
  lbo: {
    primary: ['entry_multiple', 'exit_multiple', 'irr'],
    secondary: ['debt_paydown', 'ebitda_growth'],
    description: 'Leveraged buyout analysis',
  },
  sum_of_parts: {
    primary: ['segment_values', 'holdco_discount', 'nav'],
    secondary: ['implied_multiple', 'hidden_assets'],
    description: 'Sum of the parts valuation',
  },
  custom: {
    primary: [],
    secondary: [],
    description: 'Custom analysis template',
  },
};

// ============ HELPER FUNCTIONS ============

/**
 * Format number as currency
 */
export function formatCurrency(value: number | null, decimals: number = 2): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format number as percentage
 */
export function formatPercent(value: number | null, decimals: number = 1): string {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

/**
 * Format large numbers with abbreviations (B, M, K)
 */
export function formatLargeNumber(value: number | null): string {
  if (value === null) return '—';
  
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

/**
 * Get color class based on value positivity
 */
export function getValueColorClass(value: number | null, invertColors: boolean = false): string {
  if (value === null) return 'text-muted-foreground';
  if (invertColors) {
    return value > 0 ? 'text-destructive' : value < 0 ? 'text-success' : 'text-foreground';
  }
  return value > 0 ? 'text-success' : value < 0 ? 'text-destructive' : 'text-foreground';
}

/**
 * Calculate all derived metrics for a single year
 */
export function calculateDerivedMetrics(year: ConsolidatedYear, marketCap?: number) {
  return {
    grossMargin: calculateGrossMargin(year.gross_profit, year.revenue),
    operatingMargin: calculateOperatingMargin(year.ebit, year.revenue),
    netMargin: calculateNetMargin(year.net_income, year.revenue),
    fcfMargin: calculateFCFMargin(year.free_cash_flow, year.revenue),
    roic: calculateROIC(year.ebit, 0.21, year.total_equity, year.total_debt, year.cash),
    fcfYield: marketCap ? calculateFCFYield(year.free_cash_flow, marketCap) : null,
  };
}
