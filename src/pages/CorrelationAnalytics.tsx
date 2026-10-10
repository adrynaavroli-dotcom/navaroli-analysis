import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchReturnsDataset } from '@/hooks/useVolatilityData';
import { alignPrices, panelReturns } from '@/lib/returns';
import { annualize, pairSeries, rollingCovariance, COV_WINDOWS } from '@/lib/correlation';

const TICKER = /^[A-Z0-9.\-^=]{1,15}$/;

export default function CorrelationAnalytics() {
  const [input, setInput] = useState('AAPL, MSFT, SPY, TLT');
  const [tickers, setTickers] = useState<string[]>(['AAPL', 'MSFT', 'SPY', 'TLT']);
  const [period, setPeriod] = useState('2y');
  const [window, setWindow] = useState(60);
  const [annual, setAnnual] = useState(false);
  const [pair, setPair] = useState('0-1');
  const [idx, setIdx] = useState<number | null>(null);

  const qs = useQueries({ queries: tickers.map((t) => ({ queryKey: ['volatility-data', t, period], queryFn: () => fetchReturnsDataset(t, period), staleTime: 3600_000, retry: false })) });
  const loading = qs.some((q) => q.isFetching);
  const errors = qs.map((q, i) => (q.error ? `${tickers[i]}: ${(q.error as Error).message}` : null)).filter(Boolean) as string[];
  const ready = qs.length >= 2 && qs.every((q) => q.data);

  const load = () => {
    const t = Array.from(new Set(input.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)));
    if (t.length >= 2 && t.length <= 6 && t.every((x) => TICKER.test(x))) { setTickers(t); setIdx(null); setPair('0-1'); }
  };

  const a = useMemo(() => {
    if (!ready) return null;
    const ds = qs.map((q) => q.data!);
    const prices = alignPrices(Object.fromEntries(ds.map((d) => [d.ticker, d.prices])));
    const rets = panelReturns(prices, 'log');
    const res = rollingCovariance(rets, window);
    const firstValid = res.cov.findIndex((c) => c !== null);
    const flags = ds.flatMap((d) => d.flags.filter((f) => f.code === 'UNADJUSTED_DIVIDENDS' || f.code === 'LARGE_MOVE').map((f) => `${d.ticker}: ${f.code}${f.date ? ` ${f.date}` : ''}`));
    return { ds, prices, rets, res, firstValid, flags };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, window, ...qs.map((q) => q.dataUpdatedAt)]);

  const N = a?.rets.tickers.length ?? 0;
  const t = a ? (idx ?? a.res.dates.length - 1) : 0;
  const S = a?.res.cov[t] ?? null;
  const R = a?.res.corr[t] ?? null;
  const shownCov = S && (annual ? annualize(S) : S);
  const [pi, pj] = pair.split('-').map(Number);
  const pairData = a ? a.res.dates.map((d, k) => ({ date: d, rho: pairSeries(a.res, pi, pj)[k] })) : [];
  const pairs = a ? a.rets.tickers.flatMap((x, i) => a.rets.tickers.slice(i + 1).map((y, k) => ({ v: `${i}-${i + 1 + k}`, l: `${x} / ${y}` }))) : [];
  const fmt = (v: number | null, d = 3) => (v === null ? '—' : v.toFixed(d));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <div className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Quant · Layer 2 · Correlation</div>
          <h1 className="text-3xl font-semibold">Covariance & Correlation</h1>
          <p className="text-muted-foreground">Trailing sample covariance (W−1) and Pearson correlation on aligned daily log returns.</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">1. Assets & window</CardTitle><CardDescription>2–6 tickers (Yahoo Finance, e.g. SAN.MC, AIR.PA). Dates are aligned by intersection — no filling.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} className="w-80 font-mono" aria-label="Tickers" />
              <Select value={period} onValueChange={setPeriod}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{['1y', '2y', '5y'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
              <ToggleGroup type="single" value={String(window)} onValueChange={(v) => v && setWindow(Number(v))}>
                {COV_WINDOWS.map((w) => <ToggleGroupItem key={w} value={String(w)} className="font-mono text-xs">{w}D</ToggleGroupItem>)}
              </ToggleGroup>
              <Button onClick={load} disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Load</Button>
            </div>
            {errors.map((e) => <div key={e} className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4" />{e}</div>)}
            {a && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Common dates: {a.prices.dates.length} ({a.prices.dates[0]} → {a.prices.dates.at(-1)})</span>
                <span>Returns: {a.rets.dates.length}</span>
                <span>Dropped (not common): {Object.entries(a.prices.dropped).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
                <span>Prices: {a.ds.map((d) => `${d.ticker} ${d.priceField}`).join(' · ')}</span>
                {a.firstValid < 0 && <span className="text-destructive">Insufficient observations for a {window}D window</span>}
                {a.flags.length > 0 && <span className="text-destructive" title={a.flags.join('\n')}>Quality flags: {a.flags.length}</span>}
              </div>
            )}
          </CardContent>
        </Card>

        {a && a.firstValid >= 0 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">2. Matrices at {a.res.dates[t]}</CardTitle>
                <CardDescription>Estimate uses the {window} returns ending on this date. Earlier dates have no estimate (warm-up).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Slider min={a.firstValid} max={a.res.dates.length - 1} step={1} value={[t]} onValueChange={([v]) => setIdx(v)} aria-label="Estimation date" />
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correlation</div>
                    <Table className="text-xs"><TableHeader><TableRow><TableHead />{a.rets.tickers.map((x) => <TableHead key={x} className="font-mono">{x}</TableHead>)}</TableRow></TableHeader>
                      <TableBody>{a.rets.tickers.map((x, i) => <TableRow key={x}><TableCell className="font-mono">{x}</TableCell>
                        {R![i].map((v, j) => <TableCell key={j} className="font-mono" style={{ backgroundColor: v === null ? undefined : `hsl(var(${v >= 0 ? '--long' : '--short'}) / ${Math.abs(v) * 0.35})` }} title={v === null ? 'Unavailable: zero variance in window' : undefined}>{fmt(v, 2)}</TableCell>)}
                      </TableRow>)}</TableBody></Table>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Covariance {annual ? '(annualized ×252)' : '(daily)'}
                      <ToggleGroup type="single" size="sm" value={annual ? 'a' : 'd'} onValueChange={(v) => v && setAnnual(v === 'a')}>
                        <ToggleGroupItem value="d" className="text-[10px]">Daily</ToggleGroupItem><ToggleGroupItem value="a" className="text-[10px]">Annual</ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                    <Table className="text-xs"><TableHeader><TableRow><TableHead />{a.rets.tickers.map((x) => <TableHead key={x} className="font-mono">{x}</TableHead>)}</TableRow></TableHeader>
                      <TableBody>{a.rets.tickers.map((x, i) => <TableRow key={x}><TableCell className="font-mono">{x}</TableCell>
                        {shownCov![i].map((v, j) => <TableCell key={j} className="font-mono">{v.toExponential(2)}</TableCell>)}
                      </TableRow>)}</TableBody></Table>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div><CardTitle className="text-base">3. Rolling pairwise correlation ({window}D)</CardTitle><CardDescription>Gaps = no estimate (warm-up or unavailable).</CardDescription></div>
                <Select value={pair} onValueChange={setPair}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>{pairs.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent></Select>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pairData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
                    <YAxis domain={[-1, 1]} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => v?.toFixed(3)} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                    <ReferenceLine x={a.res.dates[t]} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
                    <Line dataKey="rho" dot={false} stroke="hsl(var(--foreground))" strokeWidth={1.5} connectNulls={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            {N > 0 && <p className="text-xs text-muted-foreground">Educational analytics on free, unofficial data. Sample estimates are noisy for short windows; correlation measures linear co-movement only.</p>}
          </>
        )}
      </main>
    </div>
  );
}
