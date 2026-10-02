import { useMemo, useState } from 'react';
import { Loader2, Activity, AlertTriangle, Info } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useVolatilityData } from '@/hooks/useVolatilityData';
import { StatCard, pct, num } from '@/components/volatility/StatCard';
import { Methodology } from '@/components/volatility/Methodology';
import {
  TRADING_DAYS, mean, stdDev, skewness, kurtosis, jarqueBera, histogram,
  historicalVolatility, rollingVolatility, ewmaVolatility, comparisonModels,
} from '@/lib/volatility';

const WINDOWS = [20, 60, 120, 252];
const LAMBDAS = [0.9, 0.94, 0.97];
const C = { price: 'hsl(var(--foreground))', roll: 'hsl(var(--primary))', ewma: 'hsl(var(--short))', realized: 'hsl(var(--muted-foreground))', long: 'hsl(var(--long))' };

export default function VolatilityAnalytics() {
  const [input, setInput] = useState('AAPL');
  const [ticker, setTicker] = useState<string | null>('AAPL');
  const [period, setPeriod] = useState('2y');
  const [window, setWindow] = useState(60);
  const [lambda, setLambda] = useState(0.94);
  const [alpha, setAlpha] = useState(0.05);
  const { data, isFetching, error } = useVolatilityData(ticker, period);

  const load = () => {
    const t = input.trim().toUpperCase();
    if (/^[A-Z0-9.\-^=]{1,15}$/.test(t)) setTicker(t);
  };
  const invalid = input.trim() !== '' && !/^[A-Za-z0-9.\-^=]{1,15}$/.test(input.trim());

  const a = useMemo(() => {
    if (!data) return null;
    const r = data.returns.returns; const d = data.returns.dates;
    const sdDaily = stdDev(r);
    const rolling = rollingVolatility(r, d, window);
    const ewma = ewmaVolatility(r, d, lambda);
    const priceByDate = new Map(data.prices.dates.map((dt, i) => [dt, data.prices.prices[i]]));
    const series = d.map((dt, i) => ({
      date: dt,
      price: priceByDate.get(dt),
      rolling: rolling.values[i] != null ? rolling.values[i]! * 100 : null,
      ewma: ewma.values[i] != null ? ewma.values[i]! * 100 : null,
      realized: Math.abs(r[i]) * Math.sqrt(TRADING_DAYS) * 100,
    }));
    const models = comparisonModels(lambda).map((m) => ({ m, res: m.calculate(r, d) }));
    return {
      n: r.length, meanD: mean(r), sdDaily, annual: historicalVolatility(r),
      min: Math.min(...r), max: Math.max(...r), skew: skewness(r), kurt: kurtosis(r),
      jb: jarqueBera(r), hist: histogram(r, 50).map((b) => ({ ...b, midPct: +(b.mid * 100).toFixed(2) })),
      series, models, windowShort: r.length < window,
    };
  }, [data, window, lambda]);

  const rep = data?.report;
  const removed = rep ? rep.removedMissing + rep.removedNonPositive + rep.removedDuplicateDates + data!.returns.invalidRemoved : 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 md:py-10 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"><Activity className="h-3.5 w-3.5" /> Quant · Layer 1 · Volatility</div>
          <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight">Volatility Analytics</h1>
          <p className="text-muted-foreground">Historical volatility, volatility dynamics and quantitative model comparison</p>
        </div>

        {/* 1. Market data */}
        <Card>
          <CardHeader><CardTitle className="text-base">1. Asset / Market Data</CardTitle>
            <CardDescription>Daily closes from Yahoo Finance. International tickers use suffixes (SAN.MC, MC.PA, VOD.L).</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="AAPL, SPY, SAN.MC…" className="sm:max-w-xs font-mono" />
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="sm:w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{['1y', '2y', '5y'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={load} disabled={isFetching || invalid || !input.trim()}>
                {isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Load
              </Button>
            </div>
            {invalid && <p className="text-sm text-destructive">Invalid ticker format.</p>}
            {error && <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle className="h-4 w-4 mt-0.5" />{(error as Error).message}</div>}
            {data && rep && (
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                <span><b className="text-foreground">{data.ticker}</b>{data.currency ? ` · ${data.currency}` : ''}</span>
                <span>{data.prices.dates[0]} → {data.prices.dates.at(-1)}</span>
                <span>Prices received: {rep.received}</span>
                <span>Kept: {rep.kept}</span>
                <span className={removed > rep.received * 0.05 ? 'text-destructive' : ''}>
                  Removed: {removed} (missing {rep.removedMissing}, non-positive {rep.removedNonPositive}, duplicate dates {rep.removedDuplicateDates}, invalid returns {data.returns.invalidRemoved})
                </span>
                {rep.reordered && <span>Dates re-sorted chronologically</span>}
              </div>
            )}
          </CardContent>
        </Card>

        {a && (<>
          {/* 2. Stats */}
          <Card>
            <CardHeader><CardTitle className="text-base">2. Return Statistics</CardTitle>
              <CardDescription>Daily log returns. Annualized with √{TRADING_DAYS} (trading-day convention). Descriptive, not forecasts.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Observations" value={String(a.n)} />
              <StatCard label="Mean daily return" value={pct(a.meanD, 3)} />
              <StatCard label="Daily volatility" value={pct(a.sdDaily, 3)} />
              <StatCard label="Annualized volatility" value={pct(a.annual)} hint={`σ_daily × √${TRADING_DAYS}`} />
              <StatCard label="Min return" value={pct(a.min)} />
              <StatCard label="Max return" value={pct(a.max)} />
              <StatCard label="Skewness" value={num(a.skew)} />
              <StatCard label="Kurtosis" value={num(a.kurt)} hint="Normal = 3" />
            </CardContent>
          </Card>

          {/* 3. Models */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div><CardTitle className="text-base">3. Volatility Models</CardTitle>
                <CardDescription className="max-w-xl">EWMA gives greater weight to recent observations and therefore responds faster to changes in market volatility than simple rolling volatility.</CardDescription></div>
              <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">EWMA λ</span>
                <ToggleGroup type="single" size="sm" variant="outline" value={String(lambda)} onValueChange={(v) => v && setLambda(+v)}>
                  {LAMBDAS.map((l) => <ToggleGroupItem key={l} value={String(l)}>{l.toFixed(2)}</ToggleGroupItem>)}
                </ToggleGroup></div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Model</TableHead><TableHead className="text-right">Current Volatility</TableHead><TableHead>Method</TableHead></TableRow></TableHeader>
                <TableBody>{a.models.map(({ m, res }) => (
                  <TableRow key={m.id}><TableCell className="font-medium">{m.name}</TableCell><TableCell className="text-right font-mono tabular-nums">{pct(res.current)}</TableCell><TableCell className="text-muted-foreground">{m.method}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 4. Dynamics */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div><CardTitle className="text-base">4. Volatility Dynamics</CardTitle>
                <CardDescription>Annualized, trailing estimates only (no look-ahead).</CardDescription></div>
              <ToggleGroup type="single" size="sm" variant="outline" value={String(window)} onValueChange={(v) => v && setWindow(+v)}>
                {WINDOWS.map((w) => <ToggleGroupItem key={w} value={String(w)}>{w}D</ToggleGroupItem>)}
              </ToggleGroup>
            </CardHeader>
            <CardContent className="space-y-6">
              {a.windowShort && <p className="flex items-center gap-2 text-sm text-destructive"><Info className="h-4 w-4" />Not enough observations for a {window}D window — choose a shorter window or longer period.</p>}
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Price vs Rolling {window}D volatility</div>
                <div className="h-64"><ResponsiveContainer>
                  <ComposedChart data={a.series}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
                    <YAxis yAxisId="p" tick={{ fontSize: 10 }} domain={['auto', 'auto']} width={50} />
                    <YAxis yAxisId="v" orientation="right" tick={{ fontSize: 10 }} unit="%" width={45} />
                    <Tooltip formatter={(v: number, n) => [n === 'Price' ? v?.toFixed(2) : `${v?.toFixed(2)}%`, n]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="p" dataKey="price" name="Price" stroke={C.price} dot={false} strokeWidth={1.2} />
                    <Line yAxisId="v" dataKey="rolling" name={`Rolling ${window}D`} stroke={C.roll} dot={false} strokeWidth={1.5} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer></div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Realized (|r|·√252) vs Rolling {window}D vs EWMA (λ={lambda.toFixed(2)}) — volatility clustering</div>
                <div className="h-64"><ResponsiveContainer>
                  <ComposedChart data={a.series}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
                    <YAxis tick={{ fontSize: 10 }} unit="%" width={45} />
                    <Tooltip formatter={(v: number, n) => [`${v?.toFixed(2)}%`, n]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="realized" name="Realized |r|·√252" fill={C.realized} opacity={0.35} />
                    <Line dataKey="rolling" name={`Rolling ${window}D`} stroke={C.roll} dot={false} strokeWidth={1.5} />
                    <Line dataKey="ewma" name="EWMA" stroke={C.ewma} dot={false} strokeWidth={1.5} />
                  </ComposedChart>
                </ResponsiveContainer></div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* 5. Distribution */}
            <Card className="lg:col-span-3">
              <CardHeader><CardTitle className="text-base">5. Return Distribution</CardTitle>
                <CardDescription>Histogram (density) of daily log returns vs a normal distribution with the same mean and standard deviation.</CardDescription></CardHeader>
              <CardContent>
                <div className="h-64"><ResponsiveContainer>
                  <ComposedChart data={a.hist}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="midPct" tick={{ fontSize: 10 }} unit="%" minTickGap={20} />
                    <YAxis tick={{ fontSize: 10 }} width={40} />
                    <Tooltip formatter={(v: number, n) => [v.toFixed(2), n]} labelFormatter={(l) => `Return ≈ ${l}%`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="density" name="Empirical density" fill={C.roll} opacity={0.6} />
                    <Line dataKey="normal" name="Normal reference" stroke={C.ewma} dot={false} strokeWidth={1.5} />
                  </ComposedChart>
                </ResponsiveContainer></div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <StatCard label="Mean" value={pct(a.meanD, 3)} /><StatCard label="Std dev" value={pct(a.sdDaily, 3)} />
                  <StatCard label="Skewness" value={num(a.skew)} /><StatCard label="Kurtosis" value={num(a.kurt)} />
                </div>
              </CardContent>
            </Card>

            {/* 6. Diagnostics */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div><CardTitle className="text-base">6. Diagnostics</CardTitle><CardDescription>Jarque-Bera normality test</CardDescription></div>
                <Select value={String(alpha)} onValueChange={(v) => setAlpha(+v)}>
                  <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{[0.01, 0.05, 0.1].map((x) => <SelectItem key={x} value={String(x)}>α = {x * 100}%</SelectItem>)}</SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="grid grid-cols-2 gap-y-2">
                  <dt className="text-muted-foreground">Skewness</dt><dd className="text-right font-mono">{num(a.jb.skewness)}</dd>
                  <dt className="text-muted-foreground">Excess kurtosis</dt><dd className="text-right font-mono">{num(a.jb.excessKurtosis)}</dd>
                  <dt className="text-muted-foreground">JB statistic</dt><dd className="text-right font-mono">{num(a.jb.statistic, 2)}</dd>
                  <dt className="text-muted-foreground">p-value (χ², 2 df)</dt><dd className="text-right font-mono">{a.jb.pValue < 1e-4 ? '< 0.0001' : a.jb.pValue.toFixed(4)}</dd>
                  <dt className="text-muted-foreground">n</dt><dd className="text-right font-mono">{a.jb.n}</dd>
                </dl>
                <div className="rounded-md bg-muted p-3 text-xs leading-relaxed">
                  <p><b>H₀:</b> returns are normally distributed (skewness = 0, excess kurtosis = 0).</p>
                  <p className="mt-1"><b>Interpretation (α = {alpha * 100}%):</b>{' '}
                    {a.jb.pValue < alpha
                      ? <>p-value &lt; α → H₀ is rejected. The sample skewness/kurtosis are inconsistent with a normal distribution at this significance level.</>
                      : <>p-value ≥ α → H₀ is not rejected. The sample does not provide sufficient evidence against normality at this level (this does not prove normality).</>}
                  </p>
                  <p className="mt-1 text-muted-foreground">Asymptotic test assuming i.i.d. observations; volatility clustering can affect its size.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>)}

        <Methodology />
      </main>
    </div>
  );
}
