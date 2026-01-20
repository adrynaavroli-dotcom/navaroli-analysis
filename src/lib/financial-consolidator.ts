/**
 * Financial Data Consolidator
 * Handles multi-file processing for Markets.sh style exports
 * Consolidates Income Statement, Balance Sheet, and Cash Flow into unified model
 */

import type { StandardVariableKey } from '@/types/valuation';
import { normalizeMetricName, extractYearsFromHeaders, detectMetricColumn, isTickerMetadata } from './financial-parser';

export type StatementType = 'income_statement' | 'balance_sheet' | 'cash_flow' | 'unknown';

export interface ProcessedFile {
  fileName: string;
  statementType: StatementType;
  years: string[];
  metrics: Map<StandardVariableKey, Record<string, number | null>>;
  rawMetrics: Map<string, Record<string, number | null>>;
  rowCount: number;
}

export interface ConsolidatedYear {
  year: string;
  // Income Statement
  revenue: number | null;
  cogs: number | null;
  gross_profit: number | null;
  operating_expenses: number | null;
  ebitda: number | null;
  depreciation: number | null;
  ebit: number | null;
  interest_expense: number | null;
  net_income: number | null;
  // Balance Sheet
  cash: number | null;
  accounts_receivable: number | null;
  inventory: number | null;
  total_assets: number | null;
  accounts_payable: number | null;
  total_debt: number | null;
  short_term_debt: number | null;
  long_term_debt: number | null;
  total_equity: number | null;
  // Cash Flow
  operating_cash_flow: number | null;
  capex: number | null;
  free_cash_flow: number | null;
  // Other
  shares_outstanding: number | null;
  eps: number | null;
  // Calculated
  net_debt: number | null;
}

export interface ConsolidationResult {
  years: ConsolidatedYear[];
  processedFiles: ProcessedFile[];
  calculatedMetrics: string[];
  warnings: string[];
}

// Extended synonyms for Markets.sh specific labels
const EXTENDED_SYNONYMS: Record<string, StandardVariableKey | 'operating_cash_flow' | 'short_term_debt' | 'long_term_debt' | 'net_debt'> = {
  // Operating Cash Flow (not in base STANDARD_VARIABLES)
  'operating cash flow': 'operating_cash_flow' as StandardVariableKey,
  'cash from operations': 'operating_cash_flow' as StandardVariableKey,
  'cash flow from operations': 'operating_cash_flow' as StandardVariableKey,
  'cash flow from operating activities': 'operating_cash_flow' as StandardVariableKey,
  'net cash from operating activities': 'operating_cash_flow' as StandardVariableKey,
  'cfo': 'operating_cash_flow' as StandardVariableKey,
  
  // Short/Long term debt
  'short term debt': 'short_term_debt' as StandardVariableKey,
  'short-term debt': 'short_term_debt' as StandardVariableKey,
  'current debt': 'short_term_debt' as StandardVariableKey,
  'current portion of long term debt': 'short_term_debt' as StandardVariableKey,
  'long term debt': 'long_term_debt' as StandardVariableKey,
  'long-term debt': 'long_term_debt' as StandardVariableKey,
  'lt debt': 'long_term_debt' as StandardVariableKey,
  
  // Net Debt
  'net debt': 'net_debt' as StandardVariableKey,
  
  // Additional Markets.sh specific labels
  'total revenue': 'revenue',
  'net revenues': 'revenue',
  'net income to common': 'net_income',
  'net income attributable to common shareholders': 'net_income',
  'comprehensive income': 'net_income',
  
  // Total Assets/Liabilities
  'total liabilities and equity': 'total_assets',
  'total liabilities & equity': 'total_assets',
  'total liabilities and stockholders equity': 'total_assets',
  
  // FCF variations
  'free cash flow to firm': 'free_cash_flow',
  'fcff': 'free_cash_flow',
  'free cash flow to equity': 'free_cash_flow',
  'fcfe': 'free_cash_flow',
  
  // CapEx variations
  'capital expenditure': 'capex',
  'purchases of property and equipment': 'capex',
  'purchase of property plant and equipment': 'capex',
  'additions to property and equipment': 'capex',
  'property plant and equipment additions': 'capex',
};

/**
 * Detect statement type from filename and content
 */
export function detectStatementType(fileName: string, metrics: string[]): StatementType {
  const lowerName = fileName.toLowerCase();
  const metricsJoined = metrics.join(' ').toLowerCase();
  
  // Check filename first
  if (lowerName.includes('income') || lowerName.includes('p&l') || lowerName.includes('profit')) {
    return 'income_statement';
  }
  if (lowerName.includes('balance') || lowerName.includes('financial position')) {
    return 'balance_sheet';
  }
  if (lowerName.includes('cash flow') || lowerName.includes('cashflow') || lowerName.includes('cash-flow')) {
    return 'cash_flow';
  }
  
  // Fallback: check content
  const incomeKeywords = ['revenue', 'net income', 'operating income', 'gross profit', 'ebitda'];
  const balanceKeywords = ['total assets', 'total liabilities', 'total equity', 'accounts receivable', 'inventory'];
  const cashFlowKeywords = ['operating cash flow', 'cash from operations', 'capital expenditure', 'free cash flow'];
  
  const incomeScore = incomeKeywords.filter(k => metricsJoined.includes(k)).length;
  const balanceScore = balanceKeywords.filter(k => metricsJoined.includes(k)).length;
  const cashFlowScore = cashFlowKeywords.filter(k => metricsJoined.includes(k)).length;
  
  const maxScore = Math.max(incomeScore, balanceScore, cashFlowScore);
  
  if (maxScore === 0) return 'unknown';
  if (maxScore === incomeScore) return 'income_statement';
  if (maxScore === balanceScore) return 'balance_sheet';
  return 'cash_flow';
}

/**
 * Extended metric normalization including Markets.sh specific labels
 */
function normalizeExtendedMetric(rawName: string): string | null {
  const cleaned = rawName
    .toLowerCase()
    .trim()
    .replace(/[^\w\s&'()-]/g, '')
    .replace(/\s+/g, ' ');
  
  // Check extended synonyms first
  if (cleaned in EXTENDED_SYNONYMS) {
    return EXTENDED_SYNONYMS[cleaned];
  }
  
  // Fall back to base normalizer
  return normalizeMetricName(rawName);
}

/**
 * Process a single file into structured data
 */
export function processFile(
  headers: string[],
  rows: Record<string, unknown>[],
  fileName: string
): ProcessedFile {
  const years = extractYearsFromHeaders(headers);
  const metricColumn = detectMetricColumn(headers, rows);
  
  const metrics = new Map<StandardVariableKey, Record<string, number | null>>();
  const rawMetrics = new Map<string, Record<string, number | null>>();
  const metricLabels: string[] = [];
  
  if (metricColumn && years.length > 0) {
    for (const row of rows) {
      const rawLabel = row[metricColumn];
      if (!rawLabel || isTickerMetadata(rawLabel)) continue;
      
      const originalLabel = String(rawLabel).trim();
      metricLabels.push(originalLabel);
      
      const values: Record<string, number | null> = {};
      for (const year of years) {
        const rawValue = row[year];
        if (rawValue === null || rawValue === undefined || rawValue === '') {
          values[year] = null;
        } else if (typeof rawValue === 'number') {
          values[year] = rawValue;
        } else {
          const cleaned = String(rawValue).replace(/[,$()]/g, '').trim();
          // Handle negative numbers in parentheses
          const isNegative = String(rawValue).includes('(') && String(rawValue).includes(')');
          const parsed = parseFloat(cleaned);
          values[year] = isNaN(parsed) ? null : (isNegative ? -Math.abs(parsed) : parsed);
        }
      }
      
      // Skip rows with all null values
      if (Object.values(values).every(v => v === null)) continue;
      
      const normalizedKey = normalizeExtendedMetric(originalLabel);
      if (normalizedKey) {
        metrics.set(normalizedKey as StandardVariableKey, values);
      }
      rawMetrics.set(originalLabel, values);
    }
  }
  
  const statementType = detectStatementType(fileName, metricLabels);
  
  return {
    fileName,
    statementType,
    years,
    metrics,
    rawMetrics,
    rowCount: rows.length,
  };
}

/**
 * Consolidate multiple processed files into unified year-based records
 */
export function consolidateFiles(processedFiles: ProcessedFile[]): ConsolidationResult {
  // Collect all unique years
  const allYears = new Set<string>();
  for (const file of processedFiles) {
    file.years.forEach(y => allYears.add(y));
  }
  
  const sortedYears = Array.from(allYears).sort();
  const warnings: string[] = [];
  const calculatedMetrics: string[] = [];
  
  // Initialize consolidated data
  const years: ConsolidatedYear[] = sortedYears.map(year => ({
    year,
    revenue: null,
    cogs: null,
    gross_profit: null,
    operating_expenses: null,
    ebitda: null,
    depreciation: null,
    ebit: null,
    interest_expense: null,
    net_income: null,
    cash: null,
    accounts_receivable: null,
    inventory: null,
    total_assets: null,
    accounts_payable: null,
    total_debt: null,
    short_term_debt: null,
    long_term_debt: null,
    total_equity: null,
    operating_cash_flow: null,
    capex: null,
    free_cash_flow: null,
    shares_outstanding: null,
    eps: null,
    net_debt: null,
  }));
  
  // Merge metrics from all files
  for (const file of processedFiles) {
    for (const [metric, values] of file.metrics) {
      for (const yearData of years) {
        const value = values[yearData.year];
      if (value !== null && metric in yearData) {
        (yearData as unknown as Record<string, number | null>)[metric] = value;
      }
    }
  }
  }
  
  // Calculate derived metrics
  for (const yearData of years) {
    // Calculate Net Debt if not provided
    if (yearData.net_debt === null) {
      const shortTerm = yearData.short_term_debt ?? 0;
      const longTerm = yearData.long_term_debt ?? yearData.total_debt ?? 0;
      const cash = yearData.cash ?? 0;
      
      if (shortTerm !== 0 || longTerm !== 0) {
        yearData.net_debt = shortTerm + longTerm - cash;
        if (!calculatedMetrics.includes('net_debt')) {
          calculatedMetrics.push('net_debt');
        }
      }
    }
    
    // Calculate Free Cash Flow if not provided
    if (yearData.free_cash_flow === null && yearData.operating_cash_flow !== null && yearData.capex !== null) {
      // CapEx is usually negative in cash flow statements
      const capexValue = yearData.capex < 0 ? yearData.capex : -yearData.capex;
      yearData.free_cash_flow = yearData.operating_cash_flow + capexValue;
      if (!calculatedMetrics.includes('free_cash_flow')) {
        calculatedMetrics.push('free_cash_flow');
      }
    }
    
    // Calculate Gross Profit if not provided
    if (yearData.gross_profit === null && yearData.revenue !== null && yearData.cogs !== null) {
      yearData.gross_profit = yearData.revenue - Math.abs(yearData.cogs);
      if (!calculatedMetrics.includes('gross_profit')) {
        calculatedMetrics.push('gross_profit');
      }
    }
  }
  
  // Check for missing critical metrics
  const criticalMetrics: (keyof ConsolidatedYear)[] = ['revenue', 'net_income', 'total_assets', 'free_cash_flow'];
  for (const metric of criticalMetrics) {
    const hasValues = years.some(y => y[metric] !== null);
    if (!hasValues) {
      warnings.push(`${metric.replace(/_/g, ' ')} not found in any uploaded file`);
    }
  }
  
  return {
    years,
    processedFiles,
    calculatedMetrics,
    warnings,
  };
}

/**
 * Get statement type display label
 */
export function getStatementTypeLabel(type: StatementType): string {
  switch (type) {
    case 'income_statement': return 'Income Statement';
    case 'balance_sheet': return 'Balance Sheet';
    case 'cash_flow': return 'Cash Flow Statement';
    default: return 'Unknown';
  }
}
