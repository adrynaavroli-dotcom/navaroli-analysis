import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';

interface PayoffDiagramProps {
  spotPrice: number;
  strikePrice: number;
  callPremium: number;
  putPremium: number;
}

export function PayoffDiagram({ spotPrice, strikePrice, callPremium, putPremium }: PayoffDiagramProps) {
  const data = useMemo(() => {
    const low = Math.max(strikePrice * 0.5, 0.01);
    const high = strikePrice * 1.5;
    const step = (high - low) / 100;
    const points = [];

    for (let s = low; s <= high; s += step) {
      const callPayoff = Math.max(s - strikePrice, 0) - callPremium;
      const putPayoff = Math.max(strikePrice - s, 0) - putPremium;
      points.push({
        price: parseFloat(s.toFixed(2)),
        call: parseFloat(callPayoff.toFixed(4)),
        put: parseFloat(putPayoff.toFixed(4)),
      });
    }
    return points;
  }, [strikePrice, callPremium, putPremium]);

  const callBE = strikePrice + callPremium;
  const putBE = strikePrice - putPremium;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Payoff at Expiry
        </CardTitle>
        <div className="flex gap-4 text-xs text-muted-foreground font-mono">
          <span>K = {strikePrice}</span>
          <span>Call BE = {callBE.toFixed(2)}</span>
          <span>Put BE = {putBE.toFixed(2)}</span>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="price"
              tick={{ fontSize: 11 }}
              label={{ value: 'Underlying Price', position: 'insideBottom', offset: -2, fontSize: 11 }}
              className="fill-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              label={{ value: 'P&L', angle: -90, position: 'insideLeft', fontSize: 11 }}
              className="fill-muted-foreground"
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(value: number, name: string) => [`${value.toFixed(2)}`, name === 'call' ? 'Long Call' : 'Long Put']}
              labelFormatter={(label) => `Price: ${label}`}
            />
            <Legend formatter={(value) => (value === 'call' ? 'Long Call' : 'Long Put')} />
            <ReferenceLine y={0} className="stroke-muted-foreground" strokeDasharray="4 4" />
            <ReferenceLine x={strikePrice} className="stroke-muted-foreground/50" strokeDasharray="2 2" label={{ value: 'K', fontSize: 10 }} />
            <ReferenceLine x={spotPrice} stroke="hsl(var(--accent-foreground))" strokeDasharray="4 2" label={{ value: 'S₀', fontSize: 10 }} />
            <Line type="monotone" dataKey="call" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="put" stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
