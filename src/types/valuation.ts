export type AnalysisTemplateType = 'dcf' | 'comparables' | 'lbo' | 'sum_of_parts' | 'custom';

export interface AnalysisWorkspace {
  id: string;
  user_id: string;
  ticker: string;
  company_name: string;
  industry: string | null;
  template_type: AnalysisTemplateType;
  raw_data: Record<string, unknown>;
  column_mappings: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface ParsedFileData {
  headers: string[];
  rows: Record<string, unknown>[];
  fileName: string;
}

export const STANDARD_VARIABLES = [
  { key: 'revenue', label: 'Revenue', category: 'Income Statement' },
  { key: 'cogs', label: 'Cost of Goods Sold', category: 'Income Statement' },
  { key: 'gross_profit', label: 'Gross Profit', category: 'Income Statement' },
  { key: 'operating_expenses', label: 'Operating Expenses', category: 'Income Statement' },
  { key: 'ebitda', label: 'EBITDA', category: 'Income Statement' },
  { key: 'depreciation', label: 'Depreciation & Amortization', category: 'Income Statement' },
  { key: 'ebit', label: 'EBIT', category: 'Income Statement' },
  { key: 'interest_expense', label: 'Interest Expense', category: 'Income Statement' },
  { key: 'net_income', label: 'Net Income', category: 'Income Statement' },
  { key: 'cash', label: 'Cash & Equivalents', category: 'Balance Sheet' },
  { key: 'accounts_receivable', label: 'Accounts Receivable', category: 'Balance Sheet' },
  { key: 'inventory', label: 'Inventory', category: 'Balance Sheet' },
  { key: 'total_assets', label: 'Total Assets', category: 'Balance Sheet' },
  { key: 'accounts_payable', label: 'Accounts Payable', category: 'Balance Sheet' },
  { key: 'total_debt', label: 'Total Debt', category: 'Balance Sheet' },
  { key: 'total_equity', label: 'Total Equity', category: 'Balance Sheet' },
  { key: 'capex', label: 'Capital Expenditures', category: 'Cash Flow' },
  { key: 'free_cash_flow', label: 'Free Cash Flow', category: 'Cash Flow' },
  { key: 'shares_outstanding', label: 'Shares Outstanding', category: 'Other' },
  { key: 'eps', label: 'Earnings Per Share', category: 'Other' },
] as const;

export type StandardVariableKey = typeof STANDARD_VARIABLES[number]['key'];

// Enhanced parsed data with normalized financials
export interface NormalizedFinancialData {
  years: string[];
  metrics: Array<{
    metric: StandardVariableKey;
    originalLabel: string;
    values: Record<string, number | null>;
    autoMapped: boolean;
  }>;
  unmappedRows: Array<{
    originalLabel: string;
    values: Record<string, unknown>;
  }>;
  orientation: 'years-in-columns' | 'years-in-rows' | 'unknown';
}
