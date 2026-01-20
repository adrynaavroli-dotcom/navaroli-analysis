import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import { formatLargeNumber, formatPercent } from '@/lib/valuationUtils';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface GrowthMarginsChartProps {
  years: ConsolidatedYear[];
}

interface ChartDataPoint {
  year: string;
  revenue: number;
  operatingMargin: number | null;
  fcfMargin: number | null;
  revenueYoY?: number | null;
}

export function GrowthMarginsChart({ years }: GrowthMarginsChartProps) {
  const chartData = useMemo(() => {
    const sorted = [...years].sort((a, b) => a.year.localeCompare(b.year));
    
    return sorted.map((year, index): ChartDataPoint => {
      const operatingMargin = year.revenue && year.ebit 
        ? (year.ebit / year.revenue) * 100 
        : null;
      const fcfMargin = year.revenue && year.free_cash_flow 
        ? (year.free_cash_flow / year.revenue) * 100 
        : null;
      
      let revenueYoY: number | null = null;
      if (index > 0 && sorted[index - 1].revenue && year.revenue) {
        revenueYoY = ((year.revenue - sorted[index - 1].revenue!) / Math.abs(sorted[index - 1].revenue!)) * 100;
      }
      
      return {
        year: year.year,
        revenue: year.revenue || 0,
        operatingMargin,
        fcfMargin,
        revenueYoY,
      };
    });
  }, [years]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    
    const dataPoint = payload[0]?.payload as ChartDataPoint;
    
    return (
      <div className="bg-background border border-border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold mb-2">{label}</p>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Revenue</span>
            <span className="font-mono font-medium">{formatLargeNumber(dataPoint.revenue)}</span>
          </div>
          {dataPoint.revenueYoY !== null && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">YoY %</span>
              <span className={`font-mono font-medium ${dataPoint.revenueYoY >= 0 ? 'text-success' : 'text-destructive'}`}>
                {dataPoint.revenueYoY >= 0 ? '+' : ''}{dataPoint.revenueYoY.toFixed(1)}%
              </span>
            </div>
          )}
          {dataPoint.operatingMargin !== null && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Op. Margin</span>
              <span className="font-mono font-medium text-primary">{formatPercent(dataPoint.operatingMargin / 100)}</span>
            </div>
          )}
          {dataPoint.fcfMargin !== null && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">FCF Margin</span>
              <span className="font-mono font-medium text-success">{formatPercent(dataPoint.fcfMargin / 100)}</span>
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
            <TrendingUp className="h-4 w-4" />
            Growth & Margins
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
          <TrendingUp className="h-4 w-4" />
          Growth & Margins
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis 
              dataKey="year" 
              tick={{ fontSize: 11 }} 
              className="text-muted-foreground"
            />
            <YAxis 
              yAxisId="left"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => formatLargeNumber(v)}
              className="text-muted-foreground"
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
              domain={[-20, 60]}
              className="text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
            />
            <Bar 
              yAxisId="left"
              dataKey="revenue" 
              name="Revenue"
              fill="hsl(var(--muted-foreground))"
              fillOpacity={0.3}
              radius={[2, 2, 0, 0]}
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="operatingMargin" 
              name="Op. Margin %"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3, fill: 'hsl(var(--primary))' }}
              connectNulls
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="fcfMargin" 
              name="FCF Margin %"
              stroke="hsl(var(--success))"
              strokeWidth={2}
              dot={{ r: 3, fill: 'hsl(var(--success))' }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
