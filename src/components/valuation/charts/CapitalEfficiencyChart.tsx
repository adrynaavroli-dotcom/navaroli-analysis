import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target } from 'lucide-react';
import { formatPercent, calculateROIC } from '@/lib/valuationUtils';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface CapitalEfficiencyChartProps {
  years: ConsolidatedYear[];
  wacc?: number; // User-defined WACC from DCF model
}

interface ChartDataPoint {
  year: string;
  roic: number | null;
  wacc: number;
  roicYoY?: number | null;
  spread?: number | null;
}

export function CapitalEfficiencyChart({ years, wacc = 8 }: CapitalEfficiencyChartProps) {
  const chartData = useMemo(() => {
    const sorted = [...years].sort((a, b) => a.year.localeCompare(b.year));
    
    return sorted.map((year, index): ChartDataPoint => {
      const roic = calculateROIC(year.ebit, 0.21, year.total_equity, year.total_debt, year.cash);
      const roicPercent = roic !== null ? roic * 100 : null;
      
      let roicYoY: number | null = null;
      if (index > 0 && roicPercent !== null) {
        const prevRoic = calculateROIC(
          sorted[index - 1].ebit, 
          0.21, 
          sorted[index - 1].total_equity, 
          sorted[index - 1].total_debt, 
          sorted[index - 1].cash
        );
        if (prevRoic !== null) {
          roicYoY = (roicPercent - prevRoic * 100);
        }
      }
      
      return {
        year: year.year,
        roic: roicPercent,
        wacc: wacc,
        roicYoY,
        spread: roicPercent !== null ? roicPercent - wacc : null,
      };
    });
  }, [years, wacc]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    
    const dataPoint = payload[0]?.payload as ChartDataPoint;
    
    return (
      <div className="bg-background border border-border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold mb-2">{label}</p>
        <div className="space-y-1">
          {dataPoint.roic !== null && (
            <>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">ROIC</span>
                <span className="font-mono font-medium text-primary">{formatPercent(dataPoint.roic / 100)}</span>
              </div>
              {dataPoint.roicYoY !== null && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">YoY Δ</span>
                  <span className={`font-mono font-medium ${dataPoint.roicYoY >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {dataPoint.roicYoY >= 0 ? '+' : ''}{dataPoint.roicYoY.toFixed(1)}pp
                  </span>
                </div>
              )}
            </>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">WACC</span>
            <span className="font-mono font-medium text-destructive">{formatPercent(dataPoint.wacc / 100)}</span>
          </div>
          {dataPoint.spread !== null && (
            <div className="flex justify-between gap-4 pt-1 border-t border-border/50 mt-1">
              <span className="text-muted-foreground">Spread</span>
              <span className={`font-mono font-medium ${dataPoint.spread >= 0 ? 'text-success' : 'text-destructive'}`}>
                {dataPoint.spread >= 0 ? '+' : ''}{dataPoint.spread.toFixed(1)}%
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
            <Target className="h-4 w-4" />
            Capital Efficiency
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
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4" />
          Capital Efficiency (ROIC vs WACC)
        </CardTitle>
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
              tickFormatter={(v) => `${v}%`}
              domain={[0, 'auto']}
              className="text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
            />
            <ReferenceLine 
              y={wacc} 
              stroke="hsl(var(--destructive))" 
              strokeDasharray="5 5"
              label={{ value: `WACC ${wacc}%`, position: 'right', fontSize: 10, fill: 'hsl(var(--destructive))' }}
            />
            <Line 
              type="monotone" 
              dataKey="roic" 
              name="ROIC %"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
