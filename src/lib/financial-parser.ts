/**
 * Financial Data Parser
 * Handles QuickFS/Tikr style formats with smart detection and normalization
 */

import type { StandardVariableKey } from '@/types/valuation';

// Synonym dictionary for metric normalization
export const METRIC_SYNONYMS: Record<string, StandardVariableKey> = {
  // Revenue synonyms
  'revenue': 'revenue',
  'total revenue': 'revenue',
  'net revenue': 'revenue',
  'sales': 'revenue',
  'net sales': 'revenue',
  'total sales': 'revenue',
  'turnover': 'revenue',
  'total turnover': 'revenue',
  'ingresos': 'revenue',
  'ventas': 'revenue',
  
  // COGS synonyms
  'cost of goods sold': 'cogs',
  'cogs': 'cogs',
  'cost of sales': 'cogs',
  'cost of revenue': 'cogs',
  'cos': 'cogs',
  'costo de ventas': 'cogs',
  
  // Gross Profit synonyms
  'gross profit': 'gross_profit',
  'gross income': 'gross_profit',
  'gross margin': 'gross_profit',
  'beneficio bruto': 'gross_profit',
  
  // Operating Expenses
  'operating expenses': 'operating_expenses',
  'opex': 'operating_expenses',
  'operating costs': 'operating_expenses',
  'total operating expenses': 'operating_expenses',
  'sg&a': 'operating_expenses',
  'sga': 'operating_expenses',
  'gastos operativos': 'operating_expenses',
  
  // EBITDA synonyms
  'ebitda': 'ebitda',
  'operating ebitda': 'ebitda',
  'adjusted ebitda': 'ebitda',
  
  // D&A synonyms
  'depreciation': 'depreciation',
  'depreciation & amortization': 'depreciation',
  'depreciation and amortization': 'depreciation',
  'd&a': 'depreciation',
  'da': 'depreciation',
  'amortization': 'depreciation',
  
  // EBIT synonyms
  'ebit': 'ebit',
  'operating income': 'ebit',
  'operating profit': 'ebit',
  'income from operations': 'ebit',
  'beneficio operativo': 'ebit',
  
  // Interest Expense
  'interest expense': 'interest_expense',
  'interest expenses': 'interest_expense',
  'finance costs': 'interest_expense',
  'financial expenses': 'interest_expense',
  'gastos financieros': 'interest_expense',
  
  // Net Income synonyms
  'net income': 'net_income',
  'net profit': 'net_income',
  'net earnings': 'net_income',
  'profit': 'net_income',
  'earnings': 'net_income',
  'income after tax': 'net_income',
  'beneficio neto': 'net_income',
  'resultado neto': 'net_income',
  
  // Cash synonyms
  'cash': 'cash',
  'cash & equivalents': 'cash',
  'cash and equivalents': 'cash',
  'cash and cash equivalents': 'cash',
  'cash & cash equivalents': 'cash',
  'efectivo': 'cash',
  
  // AR synonyms
  'accounts receivable': 'accounts_receivable',
  'receivables': 'accounts_receivable',
  'trade receivables': 'accounts_receivable',
  'cuentas por cobrar': 'accounts_receivable',
  
  // Inventory synonyms
  'inventory': 'inventory',
  'inventories': 'inventory',
  'stock': 'inventory',
  'inventario': 'inventory',
  
  // Total Assets synonyms
  'total assets': 'total_assets',
  'assets': 'total_assets',
  'activos totales': 'total_assets',
  
  // AP synonyms
  'accounts payable': 'accounts_payable',
  'payables': 'accounts_payable',
  'trade payables': 'accounts_payable',
  'cuentas por pagar': 'accounts_payable',
  
  // Total Debt synonyms
  'total debt': 'total_debt',
  'debt': 'total_debt',
  'total borrowings': 'total_debt',
  'long term debt': 'total_debt',
  'long-term debt': 'total_debt',
  'deuda total': 'total_debt',
  
  // Total Equity synonyms
  'total equity': 'total_equity',
  'equity': 'total_equity',
  'shareholders equity': 'total_equity',
  "shareholders' equity": 'total_equity',
  'stockholders equity': 'total_equity',
  'patrimonio': 'total_equity',
  
  // CapEx synonyms
  'capex': 'capex',
  'capital expenditures': 'capex',
  'capital expenditure': 'capex',
  'purchases of ppe': 'capex',
  'purchase of property': 'capex',
  'inversiones': 'capex',
  
  // FCF synonyms
  'free cash flow': 'free_cash_flow',
  'fcf': 'free_cash_flow',
  'levered free cash flow': 'free_cash_flow',
  'unlevered free cash flow': 'free_cash_flow',
  'flujo de caja libre': 'free_cash_flow',
  
  // Shares Outstanding synonyms
  'shares outstanding': 'shares_outstanding',
  'shares out': 'shares_outstanding',
  'diluted shares': 'shares_outstanding',
  'diluted shares outstanding': 'shares_outstanding',
  'weighted average shares': 'shares_outstanding',
  'acciones en circulación': 'shares_outstanding',
  
  // EPS synonyms
  'eps': 'eps',
  'earnings per share': 'eps',
  'diluted eps': 'eps',
  'basic eps': 'eps',
  'beneficio por acción': 'eps',
};

/**
 * Normalize a metric name to a standard variable key
 */
export function normalizeMetricName(rawName: string): StandardVariableKey | null {
  const cleaned = rawName
    .toLowerCase()
    .trim()
    .replace(/[^\w\s&']/g, '') // Remove special chars except & and '
    .replace(/\s+/g, ' '); // Normalize whitespace
  
  return METRIC_SYNONYMS[cleaned] || null;
}

/**
 * Detect if the data contains years in columns (needs unpivot)
 * Returns true if first row contains year-like values
 */
export function detectYearsInColumns(headers: string[]): boolean {
  const yearPattern = /^(19|20)\d{2}$/;
  const yearLikeCount = headers.filter(h => yearPattern.test(String(h).trim())).length;
  return yearLikeCount >= 2; // At least 2 years detected
}

/**
 * Extract years from headers
 */
export function extractYearsFromHeaders(headers: string[]): string[] {
  const yearPattern = /^(19|20)\d{2}$/;
  return headers.filter(h => yearPattern.test(String(h).trim()));
}

/**
 * Detect the metric label column (first non-year, non-ticker column)
 */
export function detectMetricColumn(headers: string[], rows: Record<string, unknown>[]): string | null {
  const yearPattern = /^(19|20)\d{2}$/;
  
  // Common ticker/metadata column names to skip
  const skipPatterns = [
    /^ticker$/i,
    /^symbol$/i,
    /^company$/i,
    /^currency$/i,
    /^units$/i,
    /^id$/i,
  ];
  
  for (const header of headers) {
    const h = String(header).trim();
    
    // Skip year columns
    if (yearPattern.test(h)) continue;
    
    // Skip ticker/metadata columns
    if (skipPatterns.some(p => p.test(h))) continue;
    
    // Check if this column has text values that look like metric names
    const values = rows.slice(0, 10).map(r => r[header]);
    const textValues = values.filter(v => typeof v === 'string' && v.trim().length > 0);
    
    if (textValues.length > 0) {
      // Check if any values match known metrics
      const hasMetricMatch = textValues.some(v => 
        normalizeMetricName(String(v)) !== null
      );
      if (hasMetricMatch) {
        return header;
      }
    }
  }
  
  // Fallback: return first non-year column
  return headers.find(h => !yearPattern.test(String(h).trim())) || null;
}

/**
 * Check if a value looks like ticker metadata to filter out
 */
export function isTickerMetadata(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim().toUpperCase();
  
  // Common ticker patterns (1-5 uppercase letters)
  if (/^[A-Z]{1,5}$/.test(v)) return true;
  
  // Common metadata patterns
  const metadataPatterns = [
    /^USD$/i,
    /^EUR$/i,
    /^GBP$/i,
    /^millions?$/i,
    /^thousands?$/i,
    /^billions?$/i,
    /^annual$/i,
    /^quarterly$/i,
    /^ttm$/i,
    /^fy\d{2,4}$/i,
  ];
  
  return metadataPatterns.some(p => p.test(v));
}

export interface NormalizedDataRow {
  metric: StandardVariableKey;
  originalLabel: string;
  values: Record<string, number | null>;
  autoMapped: boolean;
}

export interface ParsedFinancialData {
  years: string[];
  metrics: NormalizedDataRow[];
  unmappedRows: Array<{
    originalLabel: string;
    values: Record<string, unknown>;
  }>;
  orientation: 'years-in-columns' | 'years-in-rows' | 'unknown';
}

/**
 * Parse and normalize financial data from raw Excel/CSV data
 */
export function parseFinancialData(
  headers: string[],
  rows: Record<string, unknown>[]
): ParsedFinancialData {
  const hasYearsInColumns = detectYearsInColumns(headers);
  const years = extractYearsFromHeaders(headers);
  const metricColumn = detectMetricColumn(headers, rows);
  
  const metrics: NormalizedDataRow[] = [];
  const unmappedRows: ParsedFinancialData['unmappedRows'] = [];
  
  if (hasYearsInColumns && metricColumn && years.length > 0) {
    // Data format: metrics in rows, years in columns (QuickFS/Tikr style)
    for (const row of rows) {
      const rawLabel = row[metricColumn];
      
      // Skip rows with ticker metadata or empty labels
      if (!rawLabel || isTickerMetadata(rawLabel)) continue;
      
      const originalLabel = String(rawLabel).trim();
      const normalizedKey = normalizeMetricName(originalLabel);
      
      const values: Record<string, number | null> = {};
      for (const year of years) {
        const rawValue = row[year];
        if (rawValue === null || rawValue === undefined || rawValue === '') {
          values[year] = null;
        } else if (typeof rawValue === 'number') {
          values[year] = rawValue;
        } else {
          const parsed = parseFloat(String(rawValue).replace(/[,$]/g, ''));
          values[year] = isNaN(parsed) ? null : parsed;
        }
      }
      
      // Skip rows with all null values
      if (Object.values(values).every(v => v === null)) continue;
      
      if (normalizedKey) {
        // Check if we already have this metric (avoid duplicates)
        if (!metrics.find(m => m.metric === normalizedKey)) {
          metrics.push({
            metric: normalizedKey,
            originalLabel,
            values,
            autoMapped: true,
          });
        }
      } else {
        unmappedRows.push({
          originalLabel,
          values,
        });
      }
    }
    
    return {
      years,
      metrics,
      unmappedRows,
      orientation: 'years-in-columns',
    };
  }
  
  // Fallback: unknown orientation, return raw data for manual mapping
  return {
    years: [],
    metrics: [],
    unmappedRows: rows.map(row => ({
      originalLabel: String(Object.values(row)[0] || 'Unknown'),
      values: row,
    })),
    orientation: 'unknown',
  };
}

/**
 * Format a number for display
 */
export function formatFinancialNumber(value: number | null): string {
  if (value === null) return '—';
  
  const absValue = Math.abs(value);
  
  if (absValue >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (absValue >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  
  return value.toFixed(2);
}
