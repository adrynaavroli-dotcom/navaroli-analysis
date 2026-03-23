// Macro data types and configuration for FRED API integration

export interface MacroDataPoint {
  date: string;
  value: number;
}

export interface MacroIndicator {
  id: string;
  name: string;
  fredSeriesId: string;
  unit: string;
  description: string;
  data: MacroDataPoint[];
  latestValue: number;
  previousValue: number;
  category: MacroCategory;
  frequency?: string; // FRED frequency param: 'q' for quarterly, etc.
}

export type MacroCategory = 'growth' | 'inflation' | 'liquidity' | 'sentiment';

export interface MacroIndicatorConfig {
  id: string;
  name: string;
  fredSeriesId: string;
  unit: string;
  description: string;
  category: MacroCategory;
  frequency?: string;
}

export const defaultIndicatorConfigs: MacroIndicatorConfig[] = [
  {
    id: 'gdp', name: 'Real GDP', fredSeriesId: 'GDP', unit: '$T',
    description: 'US Real Gross Domestic Product (Quarterly)', category: 'growth', frequency: 'q',
  },
  {
    id: 'payrolls', name: 'Nonfarm Payrolls', fredSeriesId: 'PAYEMS', unit: 'K',
    description: 'Total Nonfarm Employment (Monthly)', category: 'growth',
  },
  {
    id: 'unemployment', name: 'Unemployment Rate', fredSeriesId: 'UNRATE', unit: '%',
    description: 'Civilian Unemployment Rate', category: 'growth',
  },
  {
    id: 'cpi', name: 'CPI YoY', fredSeriesId: 'CPIAUCSL', unit: '%',
    description: 'Consumer Price Index Year-over-Year', category: 'inflation',
  },
  {
    id: 'core-cpi', name: 'Core CPI YoY', fredSeriesId: 'CPILFESL', unit: '%',
    description: 'Core CPI ex Food & Energy', category: 'inflation',
  },
  {
    id: '10y-yield', name: '10Y Treasury Yield', fredSeriesId: 'DGS10', unit: '%',
    description: '10-Year Treasury Constant Maturity Rate', category: 'inflation',
  },
  {
    id: 'reverse-repo', name: 'Reverse Repos', fredSeriesId: 'RRPONTSYD', unit: '$B',
    description: 'Overnight Reverse Repurchase Agreements', category: 'liquidity',
  },
  {
    id: 'tga', name: 'TGA Balance', fredSeriesId: 'WTREGEN', unit: '$B',
    description: 'Treasury General Account Balance', category: 'liquidity',
  },
  {
    id: 'stress', name: 'Financial Stress Index', fredSeriesId: 'STLFSI2', unit: 'Index',
    description: 'St. Louis Fed Financial Stress Index', category: 'liquidity',
  },
  {
    id: 'sentiment', name: 'Consumer Sentiment', fredSeriesId: 'UMCSENT', unit: 'Index',
    description: 'U. Michigan Consumer Sentiment Index', category: 'sentiment',
  },
  {
    id: 'yield-curve', name: '10Y-2Y Spread', fredSeriesId: 'T10Y2Y', unit: 'bps',
    description: '10-Year minus 2-Year Treasury Yield Spread', category: 'sentiment',
  },
];

export const categoryLabels: Record<MacroCategory, string> = {
  growth: 'Growth & Employment',
  inflation: 'Inflation & Rates',
  liquidity: 'Liquidity & Stress',
  sentiment: 'Sentiment & Leading',
};

export const categoryIcons: Record<MacroCategory, string> = {
  growth: 'TrendingUp',
  inflation: 'Flame',
  liquidity: 'Droplets',
  sentiment: 'Gauge',
};

export function isYieldCurveInverted(data: MacroDataPoint[]): { inverted: boolean; spread: number; duration: number } {
  if (!data || data.length === 0) {
    return { inverted: false, spread: 0, duration: 0 };
  }
  const latest = data[data.length - 1]?.value ?? 0;

  let duration = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].value < 0) duration++;
    else break;
  }

  return { inverted: latest < 0, spread: latest, duration };
}

export function filterByPeriod(data: MacroDataPoint[], period: '1Y' | '5Y' | 'Max'): MacroDataPoint[] {
  if (period === 'Max') return data;
  const now = new Date();
  const years = period === '1Y' ? 1 : 5;
  const cutoff = new Date(now.getFullYear() - years, now.getMonth(), 1);
  return data.filter(d => new Date(d.date) >= cutoff);
}
