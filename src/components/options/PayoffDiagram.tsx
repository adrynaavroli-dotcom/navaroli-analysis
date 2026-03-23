import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';

type Strategy = 'single' | 'straddle' | 'strangle' | 'bull_call_spread' | 'bear_put_spread' | 'iron_condor';

const STRATEGY_LABELS: Record<Strategy, string> = {
  single: 'Single Legs',
  straddle: 'Long Straddle',
  strangle: 'Long Strangle',
  bull_call_spread: 'Bull Call Spread',
  bear_put_spread: 'Bear Put Spread',
  iron_condor: 'Iron Condor',
};

interface PayoffDiagramProps {
  spotPrice: number;
  strikePrice: number;
  callPremium: number;
  putPremium: number;
}

function bsCallPrice(s: number, k: number, premium: number, baseK: number, basePremium: number): number {
  // Scale premium linearly for different strikes (approximation)
  const intrinsicDiff = Math.max(0, basePremium - Math.max(baseK - k, 0));
  const ratio = k > 0 && baseK > 0 ? intrinsicDiff * Math.exp(-0.5 * ((k - baseK) / baseK) * 10) : basePremium;
  return Math.max(ratio, 0.01);
}

export function PayoffDiagram({ spotPrice, strikePrice, callPremium, putPremium }: PayoffDiagramProps) {
  const [strategy, setStrategy] = useState<Strategy>('single');
  const [k2Offset, setK2Offset] = useState('5'); // % offset for second strike

  const offset = parseFloat(k2Offset) || 5;
  const k2Lower = strikePrice * (1 - offset / 100);
  const k2Upper = strikePrice * (1 + offset / 100);

  // Approximate premiums for offset strikes using moneyness scaling
  const approxPremium = (baseP: number, shift: number) => Math.max(baseP * Math.exp(-Math.abs(shift) * 2), 0.01);
  const callPremiumUpper = approxPremium(callPremium, offset / 100);
  const putPremiumLower = approxPremium(putPremium, offset / 100);
  const callPremiumLower = callPremium * Math.exp(offset / 100 * 2); // deeper ITM → more expensive
  const putPremiumUpper = putPremium * Math.exp(offset / 100 * 2);

  const data = useMemo(() => {
    const low = Math.max(strikePrice * 0.4, 0.01);
    const high = strikePrice * 1.6;
    const step = (high - low) / 150;
    const points = [];

    for (let s = low; s <= high; s += step) {
      const entry: Record<string, number> = { price: parseFloat(s.toFixed(2)) };

      switch (strategy) {
        case 'single':
          entry.call = Math.max(s - strikePrice, 0) - callPremium;
          entry.put = Math.max(strikePrice - s, 0) - putPremium;
          break;

        case 'straddle':
          // Long call + long put at same strike
          entry.straddle = (Math.max(s - strikePrice, 0) - callPremium) + (Math.max(strikePrice - s, 0) - putPremium);
          break;

        case 'strangle':
          // Long call at K+offset, long put at K-offset
          entry.strangle = (Math.max(s - k2Upper, 0) - callPremiumUpper) + (Math.max(k2Lower - s, 0) - putPremiumLower);
          break;

        case 'bull_call_spread':
          // Long call at K, short call at K+offset
          entry.spread = (Math.max(s - strikePrice, 0) - callPremium) - (Math.max(s - k2Upper, 0) - callPremiumUpper);
          break;

        case 'bear_put_spread':
          // Long put at K, short put at K-offset
          entry.spread = (Math.max(strikePrice - s, 0) - putPremium) - (Math.max(k2Lower - s, 0) - putPremiumLower);
          break;

        case 'iron_condor':
          // Short put at K-offset, long put at K-2*offset, short call at K+offset, long call at K+2*offset
          const k1 = strikePrice * (1 - offset * 2 / 100);
          const k4 = strikePrice * (1 + offset * 2 / 100);
          const pLongPut = approxPremium(putPremium, offset * 2 / 100);
          const pLongCall = approxPremium(callPremium, offset * 2 / 100);

          entry.condor =
            -(Math.max(k2Lower - s, 0) - putPremiumLower) +  // short put
            (Math.max(k1 - s, 0) - pLongPut) +               // long put (wing)
            -(Math.max(s - k2Upper, 0) - callPremiumUpper) +  // short call
            (Math.max(s - k4, 0) - pLongCall);                // long call (wing)
          break;
      }

      points.push(entry);
    }
    return points;
  }, [strikePrice, callPremium, putPremium, strategy, k2Upper, k2Lower, callPremiumUpper, putPremiumLower, offset]);

  const lineConfig: Record<Strategy, { keys: string[]; colors: string[]; labels: string[] }> = {
    single: {
      keys: ['call', 'put'],
      colors: ['hsl(142, 71%, 45%)', 'hsl(0, 84%, 60%)'],
      labels: ['Long Call', 'Long Put'],
    },
    straddle: {
      keys: ['straddle'],
      colors: ['hsl(262, 83%, 58%)'],
      labels: ['Long Straddle'],
    },
    strangle: {
      keys: ['strangle'],
      colors: ['hsl(200, 80%, 50%)'],
      labels: ['Long Strangle'],
    },
    bull_call_spread: {
      keys: ['spread'],
      colors: ['hsl(142, 71%, 45%)'],
      labels: ['Bull Call Spread'],
    },
    bear_put_spread: {
      keys: ['spread'],
      colors: ['hsl(0, 84%, 60%)'],
      labels: ['Bear Put Spread'],
    },
    iron_condor: {
      keys: ['condor'],
      colors: ['hsl(45, 93%, 47%)'],
      labels: ['Iron Condor'],
    },
  };

  const cfg = lineConfig[strategy];

  const descriptionMap: Record<Strategy, string> = {
    single: `K = ${strikePrice}  |  Call BE = ${(strikePrice + callPremium).toFixed(2)}  |  Put BE = ${(strikePrice - putPremium).toFixed(2)}`,
    straddle: `K = ${strikePrice}  |  Cost = ${(callPremium + putPremium).toFixed(2)}  |  BE = ${(strikePrice - callPremium - putPremium).toFixed(2)} / ${(strikePrice + callPremium + putPremium).toFixed(2)}`,
    strangle: `Put K = ${k2Lower.toFixed(2)}  |  Call K = ${k2Upper.toFixed(2)}`,
    bull_call_spread: `Long K = ${strikePrice}  |  Short K = ${k2Upper.toFixed(2)}  |  Max Profit = ${(k2Upper - strikePrice - callPremium + callPremiumUpper).toFixed(2)}`,
    bear_put_spread: `Long K = ${strikePrice}  |  Short K = ${k2Lower.toFixed(2)}  |  Max Profit = ${(strikePrice - k2Lower - putPremium + putPremiumLower).toFixed(2)}`,
    iron_condor: `Inner: ${k2Lower.toFixed(2)} / ${k2Upper.toFixed(2)}  |  Net Credit Strategy`,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Payoff at Expiry
          </CardTitle>
          <div className="flex items-center gap-3">
            {strategy !== 'single' && strategy !== 'straddle' && (
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Offset %</Label>
                <Input
                  type="number"
                  value={k2Offset}
                  onChange={e => setK2Offset(e.target.value)}
                  className="w-16 h-7 text-xs font-mono"
                  step="1"
                  min="1"
                  max="30"
                />
              </div>
            )}
            <Select value={strategy} onValueChange={v => setStrategy(v as Strategy)}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STRATEGY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k} className="text-xs">{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-1">{descriptionMap[strategy]}</p>
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
              formatter={(value: number, name: string) => {
                const idx = cfg.keys.indexOf(name);
                return [`${value.toFixed(2)}`, cfg.labels[idx] || name];
              }}
              labelFormatter={(label) => `Price: ${label}`}
            />
            <Legend formatter={(value) => {
              const idx = cfg.keys.indexOf(value);
              return cfg.labels[idx] || value;
            }} />
            <ReferenceLine y={0} className="stroke-muted-foreground" strokeDasharray="4 4" />
            <ReferenceLine x={strikePrice} className="stroke-muted-foreground/50" strokeDasharray="2 2" label={{ value: 'K', fontSize: 10 }} />
            <ReferenceLine x={spotPrice} stroke="hsl(var(--accent-foreground))" strokeDasharray="4 2" label={{ value: 'S₀', fontSize: 10 }} />
            {cfg.keys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={cfg.colors[i]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
