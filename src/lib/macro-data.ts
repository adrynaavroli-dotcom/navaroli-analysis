// Mock macroeconomic data prepared for FRED API integration
// FRED Series IDs: GDP, PAYEMS, UNRATE, CPIAUCSL, CPILFESL, DGS10, RRPONTSYD, WTREGEN, STLFSI2, MANEMP/ISM, T10Y2Y

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
}

export type MacroCategory = 'growth' | 'inflation' | 'liquidity' | 'sentiment';

function generateTimeSeries(
  startYear: number,
  endYear: number,
  baseFn: (i: number, total: number) => number,
  monthly = true
): MacroDataPoint[] {
  const points: MacroDataPoint[] = [];
  const step = monthly ? 1 : 3;
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m += step) {
      const total = (endYear - startYear) * (12 / step);
      const i = ((y - startYear) * (12 / step)) + Math.floor((m - 1) / step);
      points.push({
        date: `${y}-${String(m).padStart(2, '0')}-01`,
        value: Number(baseFn(i, total).toFixed(2)),
      });
    }
  }
  return points;
}

// GDP (quarterly, trillions)
const gdpData = generateTimeSeries(2015, 2025, (i, t) => {
  const base = 18 + (i / t) * 9;
  const cycle = Math.sin(i * 0.15) * 0.3;
  const covid = (i > t * 0.5 && i < t * 0.55) ? -2.5 : 0;
  return base + cycle + covid;
}, false);

// Nonfarm Payrolls (monthly, thousands)
const payrollsData = generateTimeSeries(2015, 2025, (i, t) => {
  const base = 143000 + (i / t) * 15000;
  const cycle = Math.sin(i * 0.1) * 500;
  const covid = (i > t * 0.5 && i < t * 0.55) ? -22000 : 0;
  return base + cycle + covid;
});

// Unemployment Rate (%)
const unemploymentData = generateTimeSeries(2015, 2025, (i, t) => {
  const base = 5.0 - (i / t) * 1.5;
  const cycle = Math.sin(i * 0.08) * 0.3;
  const covid = (i > t * 0.5 && i < t * 0.55) ? 10 : (i > t * 0.55 && i < t * 0.65) ? 3 : 0;
  return Math.max(3.4, base + cycle + covid);
});

// CPI YoY (%)
const cpiData = generateTimeSeries(2015, 2025, (i, t) => {
  const base = 1.8;
  const inflation = (i > t * 0.6 && i < t * 0.8) ? 4.5 * Math.sin((i - t * 0.6) / (t * 0.2) * Math.PI) : 0;
  return base + inflation + Math.sin(i * 0.2) * 0.3;
});

// Core CPI YoY (%)
const coreCpiData = generateTimeSeries(2015, 2025, (i, t) => {
  const base = 2.0;
  const inflation = (i > t * 0.62 && i < t * 0.82) ? 3.5 * Math.sin((i - t * 0.62) / (t * 0.2) * Math.PI) : 0;
  return base + inflation + Math.sin(i * 0.15) * 0.2;
});

// 10Y Treasury Yield (%)
const yield10yData = generateTimeSeries(2015, 2025, (i, t) => {
  const base = 2.5 - (i / t) * 0.5;
  const cycle = Math.sin(i * 0.12) * 0.5;
  const hike = (i > t * 0.7) ? 2.0 : 0;
  const covid = (i > t * 0.5 && i < t * 0.55) ? -1.5 : 0;
  return Math.max(0.5, base + cycle + hike + covid);
});

// Reverse Repos (billions)
const reverseRepoData = generateTimeSeries(2015, 2025, (i, t) => {
  const pre = (i < t * 0.5) ? 50 + Math.random() * 100 : 0;
  const spike = (i >= t * 0.5 && i < t * 0.8) ? 500 + (i - t * 0.5) / (t * 0.3) * 2000 : 0;
  const decline = (i >= t * 0.8) ? 2500 - (i - t * 0.8) / (t * 0.2) * 2200 : 0;
  return Math.max(0, pre + spike + decline);
});

// TGA Balance (billions)
const tgaData = generateTimeSeries(2015, 2025, (i, t) => {
  const base = 350;
  const cycle = Math.sin(i * 0.25) * 200;
  const spike = (i > t * 0.5 && i < t * 0.6) ? 1200 : 0;
  return Math.max(30, base + cycle + spike);
});

// St. Louis Financial Stress Index
const stressData = generateTimeSeries(2015, 2025, (i, t) => {
  const base = -0.5;
  const cycle = Math.sin(i * 0.1) * 0.3;
  const covid = (i > t * 0.5 && i < t * 0.55) ? 5.5 : 0;
  return base + cycle + covid;
});

// ISM Manufacturing PMI
const ismData = generateTimeSeries(2015, 2025, (i, t) => {
  const base = 52;
  const cycle = Math.sin(i * 0.08) * 5;
  const covid = (i > t * 0.5 && i < t * 0.53) ? -12 : (i > t * 0.53 && i < t * 0.6) ? 8 : 0;
  return base + cycle + covid;
});

// 10Y-2Y Yield Curve Spread (bps)
const yieldCurveData = generateTimeSeries(2015, 2025, (i, t) => {
  const base = 100 - (i / t) * 150;
  const cycle = Math.sin(i * 0.1) * 30;
  const inversion = (i > t * 0.7 && i < t * 0.85) ? -80 : 0;
  return base + cycle + inversion;
});

const last = (data: MacroDataPoint[]) => data[data.length - 1]?.value ?? 0;
const prev = (data: MacroDataPoint[]) => data[data.length - 2]?.value ?? 0;

export const macroIndicators: MacroIndicator[] = [
  {
    id: 'gdp', name: 'Real GDP', fredSeriesId: 'GDP', unit: '$T',
    description: 'US Real Gross Domestic Product (Quarterly)',
    data: gdpData, latestValue: last(gdpData), previousValue: prev(gdpData), category: 'growth',
  },
  {
    id: 'payrolls', name: 'Nonfarm Payrolls', fredSeriesId: 'PAYEMS', unit: 'K',
    description: 'Total Nonfarm Employment (Monthly)',
    data: payrollsData, latestValue: last(payrollsData), previousValue: prev(payrollsData), category: 'growth',
  },
  {
    id: 'unemployment', name: 'Unemployment Rate', fredSeriesId: 'UNRATE', unit: '%',
    description: 'Civilian Unemployment Rate',
    data: unemploymentData, latestValue: last(unemploymentData), previousValue: prev(unemploymentData), category: 'growth',
  },
  {
    id: 'cpi', name: 'CPI YoY', fredSeriesId: 'CPIAUCSL', unit: '%',
    description: 'Consumer Price Index Year-over-Year',
    data: cpiData, latestValue: last(cpiData), previousValue: prev(cpiData), category: 'inflation',
  },
  {
    id: 'core-cpi', name: 'Core CPI YoY', fredSeriesId: 'CPILFESL', unit: '%',
    description: 'Core CPI ex Food & Energy',
    data: coreCpiData, latestValue: last(coreCpiData), previousValue: prev(coreCpiData), category: 'inflation',
  },
  {
    id: '10y-yield', name: '10Y Treasury Yield', fredSeriesId: 'DGS10', unit: '%',
    description: '10-Year Treasury Constant Maturity Rate',
    data: yield10yData, latestValue: last(yield10yData), previousValue: prev(yield10yData), category: 'inflation',
  },
  {
    id: 'reverse-repo', name: 'Reverse Repos', fredSeriesId: 'RRPONTSYD', unit: '$B',
    description: 'Overnight Reverse Repurchase Agreements',
    data: reverseRepoData, latestValue: last(reverseRepoData), previousValue: prev(reverseRepoData), category: 'liquidity',
  },
  {
    id: 'tga', name: 'TGA Balance', fredSeriesId: 'WTREGEN', unit: '$B',
    description: 'Treasury General Account Balance',
    data: tgaData, latestValue: last(tgaData), previousValue: prev(tgaData), category: 'liquidity',
  },
  {
    id: 'stress', name: 'Financial Stress Index', fredSeriesId: 'STLFSI2', unit: 'Index',
    description: 'St. Louis Fed Financial Stress Index',
    data: stressData, latestValue: last(stressData), previousValue: prev(stressData), category: 'liquidity',
  },
  {
    id: 'ism', name: 'ISM Manufacturing PMI', fredSeriesId: 'MANEMP', unit: 'Index',
    description: 'ISM Manufacturing Purchasing Managers Index',
    data: ismData, latestValue: last(ismData), previousValue: prev(ismData), category: 'sentiment',
  },
  {
    id: 'yield-curve', name: '10Y-2Y Spread', fredSeriesId: 'T10Y2Y', unit: 'bps',
    description: '10-Year minus 2-Year Treasury Yield Spread',
    data: yieldCurveData, latestValue: last(yieldCurveData), previousValue: prev(yieldCurveData), category: 'sentiment',
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

export function isYieldCurveInverted(): { inverted: boolean; spread: number; duration: number } {
  const curveData = macroIndicators.find(i => i.id === 'yield-curve')?.data ?? [];
  const latest = curveData[curveData.length - 1]?.value ?? 0;
  
  // Count consecutive months of inversion
  let duration = 0;
  for (let i = curveData.length - 1; i >= 0; i--) {
    if (curveData[i].value < 0) duration++;
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
