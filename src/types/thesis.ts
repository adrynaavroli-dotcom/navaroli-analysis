export type ThesisDirection = 'long' | 'short';
export type InvestmentStrategy = 'value' | 'growth' | 'compounder' | 'turnaround' | 'dividend';
export type MarketCapCategory = 'mega' | 'large' | 'mid' | 'small' | 'micro';

export interface ThesisMetrics {
  per: number;
  ev_ebitda: number;
  roic: number;
  revenue_growth: number;
  gross_margin: number;
  fcf_yield: number;
  market_cap: string;
  earnings_date?: string;
  forward_pe?: number;
  price_to_book?: number;
  profit_margin?: number;
}

export interface ChartDataPoint {
  year: string;
  value: number;
}

export interface ThesisChartData {
  revenue?: ChartDataPoint[];
  margins?: ChartDataPoint[];
}

export interface Thesis {
  id: string;
  ticker: string;
  company_name: string;
  sector: string;
  direction: ThesisDirection;
  strategy: InvestmentStrategy;
  market_cap_category: MarketCapCategory;
  current_price: number;
  target_price: number | null;
  currency: string;
  metrics: ThesisMetrics;
  sparkline_data: number[];
  executive_summary: string | null;
  investment_case: string | null;
  valuation: string | null;
  risks: string | null;
  chart_data: ThesisChartData;
  analysis_date: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  user_id: string | null;
}

export interface ThesisFilters {
  sector: string | null;
  direction: ThesisDirection | null;
  strategy: InvestmentStrategy | null;
  marketCap: MarketCapCategory | null;
}
