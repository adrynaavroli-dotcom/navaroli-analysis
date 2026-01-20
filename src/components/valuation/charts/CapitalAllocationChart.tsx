import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart } from 'lucide-react';
import { formatLargeNumber } from '@/lib/valuationUtils';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface CapitalAllocationChartProps {
  years: ConsolidatedYear[];
}

interface ChartDataPoint {
  year: string;
  capex: number;
  dividends: number;
  buybacks: number;
  capexYoY?: number | null;
}

export function CapitalAllocationChart({ years }: CapitalAllocationChartProps) {
  const chartData = useMemo(() => {
    const sorted = [...years].sort((a, b) => a.year.localeCompare(b.year));
    
    return sorted.map((year, index): ChartDataPoint => {
      // CapEx is usually negative, convert to positive for visualization
      const capex = year.capex ? Math.abs(year.capex) : 0;
      
      // These would need to be in ConsolidatedYear - for now use placeholders
      // In a real implementation, add dividends_paid and stock_repurchased to the model
      const dividends = 0; // year.dividends_paid
      const buybacks = 0;  // year.stock_repurchased
      
      let capexYoY: number | null = null;
      if (index > 0 && capex > 0) {
        const prevCapex = sorted[index - 1].capex ? Math.abs(sorted[index - 1].capex!) : 0;
        if (prevCapex > 0) {
          capexYoY = ((capex - prevCapex) / prevCapex) * 100;
        }
      }
      
      return {
        year: year.year,
        capex,
        dividends,
        buybacks,
        capexYoY,
      };
    });
  }, [years]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    
    const dataPoint = payload[0]?.payload as ChartDataPoint;
    const total = dataPoint.capex + dataPoint.dividends + dataPoint.buybacks;
    
    return (
      <div className="bg-background border border-border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold mb-2">{label}</p>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">CapEx</span>
            <span className="font-mono font-medium">{formatLargeNumber(dataPoint.capex)}</span>
          </div>
          {dataPoint.capexYoY !== null && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">YoY %</span>
              <span className={`font-mono font-medium ${dataPoint.capexYoY >= 0 ? 'text-destructive' : 'text-success'}`}>
                {dataPoint.capexYoY >= 0 ? '+' : ''}{dataPoint.capexYoY.toFixed(1)}%
              </span>
            </div>
          )}
          {dataPoint.dividends > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Dividends</span>
              <span className="font-mono font-medium">{formatLargeNumber(dataPoint.dividends)}</span>
            </div>
          )}
          {dataPoint.buybacks > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Buybacks</span>
              <span className="font-mono font-medium">{formatLargeNumber(dataPoint.buybacks)}</span>
            </div>
          )}
          <div className="flex justify-between gap-4 pt-1 border-t border-border/50 mt-1">
            <span className="text-muted-foreground font-medium">Total</span>
            <span className="font-mono font-semibold">{formatLargeNumber(total)}</span>
          </div>
        </div>
      </div>
    );
  };

  if (years.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Capital Allocation
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
          <PieChart className="h-4 w-4" />
          Capital Allocation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis 
              dataKey="year" 
              tick={{ fontSize: 11 }} 
              className="text-muted-foreground"
            />
            <YAxis 
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => formatLargeNumber(v)}
              className="text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
            />
            <Area 
              type="monotone" 
              dataKey="capex" 
              name="CapEx"
              stackId="1"
              stroke="hsl(var(--chart-1))"
              fill="hsl(var(--chart-1))"
              fillOpacity={0.6}
            />
            <Area 
              type="monotone" 
              dataKey="dividends" 
              name="Dividends"
              stackId="1"
              stroke="hsl(var(--chart-2))"
              fill="hsl(var(--chart-2))"
              fillOpacity={0.6}
            />
            <Area 
              type="monotone" 
              dataKey="buybacks" 
              name="Buybacks"
              stackId="1"
              stroke="hsl(var(--chart-3))"
              fill="hsl(var(--chart-3))"
              fillOpacity={0.6}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
