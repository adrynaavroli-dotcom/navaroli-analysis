import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { bsPrice } from '@/lib/options/black-scholes';
import { Grid3x3, TrendingUp } from 'lucide-react';

interface SensitivityChartProps {
  spotPrice: number;
  strikePrice: number;
  riskFreeRate: number;
  dividendYield: number;
  volatility: number;
  timeToExpiry: number;
}

type OptionType = 'call' | 'put';

function generateRange(center: number, steps: number, pctRange: number): number[] {
  const min = center * (1 - pctRange);
  const max = center * (1 + pctRange);
  const step = (max - min) / (steps - 1);
  return Array.from({ length: steps }, (_, i) => parseFloat((min + i * step).toFixed(2)));
}

function volRange(center: number, steps: number): number[] {
  const min = Math.max(0.01, center * 0.4);
  const max = center * 1.8;
  const step = (max - min) / (steps - 1);
  return Array.from({ length: steps }, (_, i) => parseFloat((min + i * step).toFixed(4)));
}

function getHeatColor(value: number, min: number, max: number): string {
  if (max === min) return 'hsl(var(--muted))';
  const ratio = (value - min) / (max - min);
  // Cool blue → warm orange/red
  if (ratio < 0.25) return `hsl(210, 70%, ${75 - ratio * 60}%)`;
  if (ratio < 0.5) return `hsl(${210 - (ratio - 0.25) * 400}, 65%, ${60 - ratio * 20}%)`;
  if (ratio < 0.75) return `hsl(${110 - (ratio - 0.5) * 400}, 60%, ${55 - ratio * 15}%)`;
  return `hsl(${10 - (ratio - 0.75) * 40}, 70%, ${50 - (ratio - 0.75) * 30}%)`;
}

export function SensitivityChart({
  spotPrice, strikePrice, riskFreeRate, dividendYield, volatility, timeToExpiry,
}: SensitivityChartProps) {
  const [optionType, setOptionType] = useState<OptionType>('call');

  const STRIKE_STEPS = 11;
  const VOL_STEPS = 9;

  const strikes = useMemo(() => generateRange(strikePrice, STRIKE_STEPS, 0.3), [strikePrice]);
  const vols = useMemo(() => volRange(volatility, VOL_STEPS), [volatility]);

  // Heatmap data: vol × strike matrix
  const heatmapData = useMemo(() => {
    const matrix: { vol: number; strike: number; price: number }[] = [];
    for (const v of vols) {
      for (const k of strikes) {
        const price = bsPrice(spotPrice, k, riskFreeRate, dividendYield, v, timeToExpiry, optionType);
        matrix.push({ vol: v, strike: k, price });
      }
    }
    return matrix;
  }, [spotPrice, strikes, vols, riskFreeRate, dividendYield, timeToExpiry, optionType]);

  const allPrices = heatmapData.map(d => d.price);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);

  // Line chart: price vs strike at different volatilities
  const strikeLineData = useMemo(() => {
    return strikes.map(k => {
      const row: Record<string, number> = { strike: k };
      for (const v of vols) {
        const price = bsPrice(spotPrice, k, riskFreeRate, dividendYield, v, timeToExpiry, optionType);
        row[`σ=${(v * 100).toFixed(0)}%`] = parseFloat(price.toFixed(4));
      }
      return row;
    });
  }, [spotPrice, strikes, vols, riskFreeRate, dividendYield, timeToExpiry, optionType]);

  // Line chart: price vs vol at different strikes
  const volLineData = useMemo(() => {
    return vols.map(v => {
      const row: Record<string, number> = { vol: parseFloat((v * 100).toFixed(1)) };
      // Pick 5 representative strikes
      const selectedStrikes = [strikes[0], strikes[2], strikes[5], strikes[8], strikes[10]].filter(Boolean);
      for (const k of selectedStrikes) {
        const price = bsPrice(spotPrice, k, riskFreeRate, dividendYield, v, timeToExpiry, optionType);
        row[`K=${k.toFixed(0)}`] = parseFloat(price.toFixed(4));
      }
      return row;
    });
  }, [spotPrice, strikes, vols, riskFreeRate, dividendYield, timeToExpiry, optionType]);

  const lineColors = ['hsl(var(--primary))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1', '#14b8a6'];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <Select value={optionType} onValueChange={(v) => setOptionType(v as OptionType)}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="call">Call</SelectItem>
            <SelectItem value="put">Put</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          S={spotPrice} | K₀={strikePrice} | r={((riskFreeRate) * 100).toFixed(1)}% | σ₀={(volatility * 100).toFixed(1)}% | T={timeToExpiry.toFixed(3)}y
        </p>
      </div>

      <Tabs defaultValue="heatmap">
        <TabsList className="grid grid-cols-3 w-full max-w-sm">
          <TabsTrigger value="heatmap">
            <Grid3x3 className="h-3.5 w-3.5 mr-1.5" />
            Heatmap
          </TabsTrigger>
          <TabsTrigger value="vol-curve">σ Curve</TabsTrigger>
          <TabsTrigger value="strike-curve">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
            K Curve
          </TabsTrigger>
        </TabsList>

        {/* Heatmap */}
        <TabsContent value="heatmap">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {optionType === 'call' ? 'Call' : 'Put'} Price — Volatility × Strike
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr>
                    <th className="py-1.5 px-2 text-left text-muted-foreground font-medium sticky left-0 bg-background z-10">σ \ K</th>
                    {strikes.map(k => (
                      <th
                        key={k}
                        className={`py-1.5 px-2 text-center font-mono font-medium ${Math.abs(k - strikePrice) < 0.01 ? 'text-primary underline' : 'text-muted-foreground'}`}
                      >
                        {k.toFixed(0)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vols.map(v => (
                    <tr key={v} className="border-t border-border/30">
                      <td className={`py-1.5 px-2 font-mono font-medium sticky left-0 bg-background z-10 ${Math.abs(v - volatility) < 0.001 ? 'text-primary underline' : 'text-muted-foreground'}`}>
                        {(v * 100).toFixed(0)}%
                      </td>
                      {strikes.map(k => {
                        const entry = heatmapData.find(d => d.vol === v && d.strike === k);
                        const price = entry?.price ?? 0;
                        const isCenter = Math.abs(k - strikePrice) < 0.01 && Math.abs(v - volatility) < 0.001;
                        return (
                          <td
                            key={`${v}-${k}`}
                            className={`py-1.5 px-2 text-center font-mono ${isCenter ? 'ring-2 ring-primary ring-inset font-bold' : ''}`}
                            style={{ backgroundColor: getHeatColor(price, minPrice, maxPrice), color: price > (minPrice + maxPrice) / 2 ? '#fff' : '#1a1a1a' }}
                          >
                            {price.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground mt-2">
                Current parameters highlighted. Blue = low value, Red = high value.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Price vs Volatility */}
        <TabsContent value="vol-curve">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {optionType === 'call' ? 'Call' : 'Put'} Price vs Volatility (by Strike)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={volLineData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="vol" tick={{ fontSize: 11 }} label={{ value: 'Volatility (%)', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} label={{ value: 'Price', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: 11 }}
                    labelFormatter={(v) => `σ = ${v}%`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {Object.keys(volLineData[0] || {}).filter(k => k !== 'vol').map((key, i) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={lineColors[i % lineColors.length]} strokeWidth={1.5} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Price vs Strike */}
        <TabsContent value="strike-curve">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {optionType === 'call' ? 'Call' : 'Put'} Price vs Strike (by Volatility)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={strikeLineData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="strike" tick={{ fontSize: 11 }} label={{ value: 'Strike', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} label={{ value: 'Price', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: 11 }}
                    labelFormatter={(v) => `K = ${v}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {Object.keys(strikeLineData[0] || {}).filter(k => k !== 'strike').map((key, i) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={lineColors[i % lineColors.length]} strokeWidth={1.5} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
