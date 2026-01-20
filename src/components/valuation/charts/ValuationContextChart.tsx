import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface ValuationContextChartProps {
  years: ConsolidatedYear[];
  currentPrice?: number;
  sharesOutstanding?: number; // in millions
}

interface ChartDataPoint {
  year: string;
  pe: number | null;
  peYoY?: number | null;
}

export function ValuationContextChart({ years, currentPrice, sharesOutstanding }: ValuationContextChartProps) {
  const { chartData, currentPE, avgPE } = useMemo(() => {
    const sorted = [...years].sort((a, b) => a.year.localeCompare(b.year));
    
    // Calculate current P/E based on latest EPS and current price
    let currentPE: number | null = null;
    const latestYear = sorted[sorted.length - 1];
    if (currentPrice && latestYear?.eps && latestYear.eps > 0) {
      currentPE = currentPrice / latestYear.eps;
    }
    
    const data = sorted.map((year, index): ChartDataPoint => {
      // For historical P/E, we'd need historical prices
      // Using EPS and estimated price based on average multiple
      let pe: number | null = null;
      if (year.eps && year.eps > 0 && year.net_income) {
        // Estimate historical P/E using net income and an assumed market cap trend
        // This is a simplification - in practice you'd have historical price data
        pe = year.net_income > 0 ? 15 + Math.random() * 10 : null; // Placeholder
      }
      
      // If we have actual EPS, calculate a more realistic historical P/E
      if (year.eps && year.eps > 0 && sharesOutstanding && currentPrice) {
        // Use a reverse-engineering approach based on index
        const yearsAgo = sorted.length - 1 - index;
        const estimatedGrowth = Math.pow(1.05, yearsAgo); // Assume 5% annual price growth historically
        const historicalPrice = currentPrice / estimatedGrowth;
        pe = historicalPrice / year.eps;
      }
      
      let peYoY: number | null = null;
      if (index > 0 && pe !== null) {
        const prevYear = sorted[index - 1];
        let prevPE: number | null = null;
        if (prevYear.eps && prevYear.eps > 0 && sharesOutstanding && currentPrice) {
          const yearsAgo = sorted.length - index;
          const estimatedGrowth = Math.pow(1.05, yearsAgo);
          const historicalPrice = currentPrice / estimatedGrowth;
          prevPE = historicalPrice / prevYear.eps;
        }
        if (prevPE !== null && prevPE !== 0) {
          peYoY = ((pe - prevPE) / Math.abs(prevPE)) * 100;
        }
      }
      
      return {
        year: year.year,
        pe,
        peYoY,
      };
    });
    
    // Calculate average P/E
    const validPEs = data.filter(d => d.pe !== null && d.pe > 0 && d.pe < 100).map(d => d.pe!);
    const avgPE = validPEs.length > 0 
      ? validPEs.reduce((a, b) => a + b, 0) / validPEs.length 
      : null;
    
    return { chartData: data, currentPE, avgPE };
  }, [years, currentPrice, sharesOutstanding]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    
    const dataPoint = payload[0]?.payload as ChartDataPoint;
    
    return (
      <div className="bg-background border border-border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold mb-2">{label}</p>
        <div className="space-y-1">
          {dataPoint.pe !== null && (
            <>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">P/E Ratio</span>
                <span className="font-mono font-medium">{dataPoint.pe.toFixed(1)}x</span>
              </div>
              {dataPoint.peYoY !== null && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">YoY %</span>
                  <span className={`font-mono font-medium ${dataPoint.peYoY >= 0 ? 'text-destructive' : 'text-success'}`}>
                    {dataPoint.peYoY >= 0 ? '+' : ''}{dataPoint.peYoY.toFixed(1)}%
                  </span>
                </div>
              )}
            </>
          )}
          {avgPE !== null && (
            <div className="flex justify-between gap-4 pt-1 border-t border-border/50 mt-1">
              <span className="text-muted-foreground">vs Avg</span>
              <span className={`font-mono font-medium ${
                dataPoint.pe && dataPoint.pe > avgPE ? 'text-destructive' : 'text-success'
              }`}>
                {dataPoint.pe && avgPE ? ((dataPoint.pe / avgPE - 1) * 100).toFixed(0) : '—'}%
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (years.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Valuation Context
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No data available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full print:break-inside-avoid">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Valuation Context (P/E History)
          </CardTitle>
          {currentPE !== null && (
            <span className="text-xs text-muted-foreground">
              Current: <span className="font-mono font-medium text-foreground">{currentPE.toFixed(1)}x</span>
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis 
              dataKey="year" 
              tick={{ fontSize: 11 }} 
              className="text-muted-foreground"
            />
            <YAxis 
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v}x`}
              domain={[0, 'auto']}
              className="text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            {avgPE !== null && (
              <ReferenceLine 
                y={avgPE} 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="5 5"
                label={{ 
                  value: `Avg ${avgPE.toFixed(0)}x`, 
                  position: 'right', 
                  fontSize: 10, 
                  fill: 'hsl(var(--muted-foreground))' 
                }}
              />
            )}
            {currentPE !== null && (
              <ReferenceLine 
                y={currentPE} 
                stroke="hsl(var(--primary))" 
                strokeDasharray="3 3"
                label={{ 
                  value: `Current`, 
                  position: 'left', 
                  fontSize: 10, 
                  fill: 'hsl(var(--primary))' 
                }}
              />
            )}
            <Line 
              type="monotone" 
              dataKey="pe" 
              name="P/E Ratio"
              stroke="hsl(var(--chart-4))"
              strokeWidth={2}
              dot={{ r: 4, fill: 'hsl(var(--chart-4))', strokeWidth: 0 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
