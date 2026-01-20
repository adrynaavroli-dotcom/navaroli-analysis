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
  'net revenues': 'revenue',
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
  'costofrevenue': 'cogs',
  'cos': 'cogs',
  'costo de ventas': 'cogs',
  
  // Gross Profit synonyms
  'gross profit': 'gross_profit',
  'grossprofit': 'gross_profit',
  'gross income': 'gross_profit',
  'gross margin': 'gross_profit',
  'beneficio bruto': 'gross_profit',
  
  // Operating Expenses
  'operating expenses': 'operating_expenses',
  'operatingexpenses': 'operating_expenses',
  'opex': 'operating_expenses',
  'operating costs': 'operating_expenses',
  'total operating expenses': 'operating_expenses',
  'sg&a': 'operating_expenses',
  'sga': 'operating_expenses',
  'selling general and administrative expenses': 'operating_expenses',
  'sellinggeneralandadministrativeexpenses': 'operating_expenses',
  'gastos operativos': 'operating_expenses',
  
  // EBITDA synonyms
  'ebitda': 'ebitda',
  'operating ebitda': 'ebitda',
  'adjusted ebitda': 'ebitda',
  
  // D&A synonyms
  'depreciation': 'depreciation',
  'depreciation & amortization': 'depreciation',
  'depreciation and amortization': 'depreciation',
  'depreciationandamortization': 'depreciation',
  'd&a': 'depreciation',
  'da': 'depreciation',
  'amortization': 'depreciation',
  
  // EBIT synonyms
  'ebit': 'ebit',
  'operating income': 'ebit',
  'operatingincome': 'ebit',
  'operating profit': 'ebit',
  'income from operations': 'ebit',
  'beneficio operativo': 'ebit',
  
  // Interest Expense
  'interest expense': 'interest_expense',
  'interestexpense': 'interest_expense',
  'interest expenses': 'interest_expense',
  'finance costs': 'interest_expense',
  'financial expenses': 'interest_expense',
  'gastos financieros': 'interest_expense',
  
  // Net Income synonyms
  'net income': 'net_income',
  'netincome': 'net_income',
  'net profit': 'net_income',
  'net earnings': 'net_income',
  'profit': 'net_income',
  'earnings': 'net_income',
  'income after tax': 'net_income',
  'net income to common': 'net_income',
  'net income attributable to common shareholders': 'net_income',
  'beneficio neto': 'net_income',
  'resultado neto': 'net_income',
  
  // Cash synonyms
  'cash': 'cash',
  'cash & equivalents': 'cash',
  'cash and equivalents': 'cash',
  'cash and cash equivalents': 'cash',
  'cash & cash equivalents': 'cash',
  'cashandcashequivalents': 'cash',
  'efectivo': 'cash',
  
  // AR synonyms
  'accounts receivable': 'accounts_receivable',
  'accountsreceivable': 'accounts_receivable',
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
  'totalassets': 'total_assets',
  'assets': 'total_assets',
  'activos totales': 'total_assets',
  
  // AP synonyms
  'accounts payable': 'accounts_payable',
  'accountspayable': 'accounts_payable',
  'payables': 'accounts_payable',
  'trade payables': 'accounts_payable',
  'cuentas por pagar': 'accounts_payable',
  
  // Total Debt synonyms
  'total debt': 'total_debt',
  'totaldebt': 'total_debt',
  'debt': 'total_debt',
  'total borrowings': 'total_debt',
  'long term debt': 'total_debt',
  'long-term debt': 'total_debt',
  'longtermdebt': 'total_debt',
  'deuda total': 'total_debt',
  
  // Total Equity synonyms
  'total equity': 'total_equity',
  'totalequity': 'total_equity',
  'equity': 'total_equity',
  'shareholders equity': 'total_equity',
  "shareholders' equity": 'total_equity',
  'stockholders equity': 'total_equity',
  'stockholdersequity': 'total_equity',
  'total stockholders equity': 'total_equity',
  'patrimonio': 'total_equity',
  
  // CapEx synonyms
  'capex': 'capex',
  'capital expenditures': 'capex',
  'capital expenditure': 'capex',
  'capitalexpenditures': 'capex',
  'purchases of ppe': 'capex',
  'purchase of property': 'capex',
  'purchases of property and equipment': 'capex',
  'purchase of property plant and equipment': 'capex',
  'inversiones': 'capex',
  
  // FCF synonyms
  'free cash flow': 'free_cash_flow',
  'freecashflow': 'free_cash_flow',
  'fcf': 'free_cash_flow',
  'levered free cash flow': 'free_cash_flow',
  'unlevered free cash flow': 'free_cash_flow',
  'free cash flow to firm': 'free_cash_flow',
  'fcff': 'free_cash_flow',
  'flujo de caja libre': 'free_cash_flow',
  
  // Shares Outstanding synonyms
  'shares outstanding': 'shares_outstanding',
  'sharesoutstanding': 'shares_outstanding',
  'shares out': 'shares_outstanding',
  'diluted shares': 'shares_outstanding',
  'diluted shares outstanding': 'shares_outstanding',
  'weighted average shares': 'shares_outstanding',
  'weighted average shs out': 'shares_outstanding',
  'weightedaverageshs out': 'shares_outstanding',
  'weighted average shs out dil': 'shares_outstanding',
  'weightedaverageshs outdil': 'shares_outstanding',
  'weightedaverageshs out dil': 'shares_outstanding',
  'weighted average shares outstanding': 'shares_outstanding',
  'diluted weighted average shares': 'shares_outstanding',
  'common shares outstanding': 'shares_outstanding',
  'acciones en circulación': 'shares_outstanding',
  
  // EPS synonyms
  'eps': 'eps',
  'earnings per share': 'eps',
  'diluted eps': 'eps',
  'epsdiluted': 'eps',
  'basic eps': 'eps',
  'eps diluted': 'eps',
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
  const yearPatterns = [
    /^(19|20)\d{2}$/, // Simple year: 2023
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // MM/DD/YY or MM/DD/YYYY format
    /^(19|20)\d{2}-\d{2}-\d{2}$/, // ISO format: 2023-12-31
    /^FY\s?(19|20)?\d{2,4}$/i, // FY2023 or FY23
  ];
  
  const yearLikeCount = headers.filter(h => {
    const str = String(h).trim();
    return yearPatterns.some(p => p.test(str));
  }).length;
  
  return yearLikeCount >= 2; // At least 2 years detected
}

/**
 * Extract year from various date formats
 * Handles: "2023", "12/31/23", "12/31/2023", "2023-12-31", "FY2023", "FY23"
 */
export function extractYearFromHeader(header: string): string | null {
  const str = String(header).trim();
  
  // Simple year: 2023
  if (/^(19|20)\d{2}$/.test(str)) {
    return str;
  }
  
  // MM/DD/YY format: 12/31/23 → 2023
  const mmddyyMatch = str.match(/^\d{1,2}\/\d{1,2}\/(\d{2})$/);
  if (mmddyyMatch) {
    const yy = parseInt(mmddyyMatch[1]);
    // Assume 00-50 is 2000-2050, 51-99 is 1951-1999
    const fullYear = yy <= 50 ? 2000 + yy : 1900 + yy;
    return String(fullYear);
  }
  
  // MM/DD/YYYY format: 12/31/2023 → 2023
  const mmddyyyyMatch = str.match(/^\d{1,2}\/\d{1,2}\/((?:19|20)\d{2})$/);
  if (mmddyyyyMatch) {
    return mmddyyyyMatch[1];
  }
  
  // ISO format: 2023-12-31 → 2023
  const isoMatch = str.match(/^((?:19|20)\d{2})-\d{2}-\d{2}$/);
  if (isoMatch) {
    return isoMatch[1];
  }
  
  // FY format: FY2023 or FY23
  const fyMatch = str.match(/^FY\s?((?:19|20)?\d{2,4})$/i);
  if (fyMatch) {
    const yearPart = fyMatch[1];
    if (yearPart.length === 2) {
      const yy = parseInt(yearPart);
      const fullYear = yy <= 50 ? 2000 + yy : 1900 + yy;
      return String(fullYear);
    }
    return yearPart;
  }
  
  return null;
}

/**
 * Extract years from headers, normalizing all date formats to YYYY
 */
export function extractYearsFromHeaders(headers: string[]): string[] {
  const years: string[] = [];
  
  for (const header of headers) {
    const year = extractYearFromHeader(header);
    if (year && !years.includes(year)) {
      years.push(year);
    }
  }
  
  return years.sort();
}

/**
 * Create a mapping from original header to normalized year
 */
export function createHeaderToYearMap(headers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  
  for (const header of headers) {
    const year = extractYearFromHeader(header);
    if (year) {
      map.set(header, year);
    }
  }
  
  return map;
}

/**
 * Detect the metric label column (first non-year, non-ticker column)
 */
export function detectMetricColumn(headers: string[], rows: Record<string, unknown>[]): string | null {
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
    
    // Skip year/date columns
    if (extractYearFromHeader(h) !== null) continue;
    
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
  return headers.find(h => extractYearFromHeader(String(h).trim()) === null) || null;
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
  const headerToYearMap = createHeaderToYearMap(headers);
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
      
      // Iterate through all headers that map to years
      for (const [originalHeader, normalizedYear] of headerToYearMap) {
        const rawValue = row[originalHeader];
        if (rawValue === null || rawValue === undefined || rawValue === '') {
          values[normalizedYear] = null;
        } else if (typeof rawValue === 'number') {
          values[normalizedYear] = rawValue;
        } else {
          // Handle formatted numbers with commas, parentheses for negatives
          const strValue = String(rawValue);
          const isNegative = strValue.includes('(') && strValue.includes(')');
          const cleaned = strValue.replace(/[,$()]/g, '').trim();
          const parsed = parseFloat(cleaned);
          values[normalizedYear] = isNaN(parsed) ? null : (isNegative ? -Math.abs(parsed) : parsed);
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
