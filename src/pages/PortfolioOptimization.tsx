import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, Cell } from 'recharts';
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
import { rollingCovariance } from '@/lib/correlation';
import { ewmaCovariance } from '@/lib/correlation/ewma';
import { gmvClosedForm, gmvLongOnly } from '@/lib/portfolio/min-variance';
import { annualizedVol, effectiveN, equalWeights, hhi } from '@/lib/portfolio/metrics';
import { walkForward, DEFAULT_WALKFORWARD } from '@/lib/portfolio/walkforward';

const TICKER = /^[A-Z0-9.\-^=]{1,15}$/;
const pct = (v: number | null, d = 1) => (v === null ? '—' : `${(v * 100).toFixed(d)}%`);

export default function PortfolioOptimization() {
  const [input, setInput] = useState('AAPL, MSFT, SPY, TLT');
  const [tickers, setTickers] = useState<string[]>(['AAPL', 'MSFT', 'SPY', 'TLT']);
  const [period, setPeriod] = useState('2y');
  const [window, setWindow] = useState(120);
  const [estimator, setEstimator] = useState<'rolling' | 'ewma'>('rolling');
  const [longOnly, setLongOnly] = useState(true);
  const [maxWeight, setMaxWeight] = useState(1);

  const qs = useQueries({ queries: tickers.map((t) => ({ queryKey: ['volatility-data', t, period], queryFn: () => fetchReturnsDataset(t, period), staleTime: 3600_000, retry: false })) });
  const loading = qs.some((q) => q.isFetching);
  const errors = qs.map((q, i) => (q.error ? `${tickers[i]}: ${(q.error as Error).message}` : null)).filter(Boolean) as string[];
  const ready = qs.length >= 2 && qs.every((q) => q.data);

  const load = () => {
    const t = Array.from(new Set(input.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)));
    if (t.length >= 2 && t.length <= 6 && t.every((x) => TICKER.test(x))) setTickers(t);
  };

  const a = useMemo(() => {
    if (!ready) return null;
    const ds = qs.map((q) => q.data!);
    const prices = alignPrices(Object.fromEntries(ds.map((d) => [d.ticker, d.prices])));
    const rets = panelReturns(prices, 'log');
    const N = rets.tickers.length;
    // In-sample estimate on the latest window (last available date).
    const S = estimator === 'ewma'
      ? ewmaCovariance(rets).cov[rets.dates.length - 1]
      : rollingCovariance(rets, window).cov[rets.dates.length - 1];
    const fit = S ? (longOnly ? gmvLongOnly(S, maxWeight) : gmvClosedForm(S)) : null;
    // Out-of-sample walk-forward on the same panel.
    const wf = walkForward(rets, { ...DEFAULT_WALKFORWARD, window, estimator: estimator === 'ewma' ? 'ewma' : 'sample', maxWeight, longOnly });
    const insufficient = estimator === 'rolling' && window <= N;
    return { ds, rets, S, fit, wf, insufficient, N };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, window, estimator, longOnly, maxWeight, ...qs.map((q) => q.dataUpdatedAt)]);

  const weightsData = a?.fit?.status === 'OK' && a.fit.weights
    ? a.rets.tickers.map((t, i) => ({ ticker: t, gmv: a.fit!.weights![i], ew: 1 / a.N }))
    : [];
  const wfChart = a?.wf.origins.filter((o) => o.status === 'OK').map((o) => ({
    date: o.date,
    gmv: o.realizedVol !== null ? +(o.realizedVol * 100).toFixed(2) : null,
    ew: o.ewRealizedVol !== null ? +(o.ewRealizedVol * 100).toFixed(2) : null,
  })) ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <div className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Quant · Layer 3 · Portfolio</div>
          <h1 className="text-3xl font-semibold">Minimum Variance Portfolio</h1>
          <p className="text-muted-foreground">Global minimum variance weights from aligned daily log returns — closed form or long-only QP — with a walk-forward out-of-sample comparison against equal weight.</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">1. Assets & estimation</CardTitle><CardDescription>2–6 tickers (Yahoo Finance, e.g. SAN.MC, AIR.PA). Dates are aligned by intersection — no filling. GMV uses no expected-return estimates.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} className="w-80 font-mono" aria-label="Tickers" />
              <Select value={period} onValueChange={setPeriod}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{['1y', '2y', '5y'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
              <ToggleGroup type="single" value={estimator} onValueChange={(v) => v && setEstimator(v as 'rolling' | 'ewma')}>
                <ToggleGroupItem value="rolling" className="text-xs">Rolling</ToggleGroupItem>
                <ToggleGroupItem value="ewma" className="text-xs">EWMA</ToggleGroupItem>
              </ToggleGroup>
              {estimator === 'rolling' && (
                <Select value={String(window)} onValueChange={(v) => setWindow(Number(v))}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>{[60, 120, 252].map((w) => <SelectItem key={w} value={String(w)}>{w}d</SelectItem>)}</SelectContent></Select>
              )}
              <ToggleGroup type="single" value={longOnly ? 'long' : 'free'} onValueChange={(v) => v && setLongOnly(v === 'long')}>
                <ToggleGroupItem value="long" className="text-xs">Long-only</ToggleGroupItem>
                <ToggleGroupItem value="free" className="text-xs">Unconstrained</ToggleGroupItem>
              </ToggleGroup>
              <Button onClick={load}>Load</Button>
            </div>
            {longOnly && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="w-36">Max weight per asset: {(maxWeight * 100).toFixed(0)}%</span>
                <Slider value={[maxWeight * 100]} min={20} max={100} step={5} onValueChange={([v]) => setMaxWeight(v / 100)} className="w-56" aria-label="Max weight" />
              </div>
            )}
          </CardContent>
        </Card>

        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading market data…</div>}
        {errors.length > 0 && <Card className="border-destructive"><CardContent className="flex items-center gap-2 py-4 text-sm"><AlertTriangle className="h-4 w-4 text-destructive" /> {errors.join(' · ')}</CardContent></Card>}
        {a?.insufficient && <Card className="border-destructive"><CardContent className="py-4 text-sm">Window ({window}) must exceed the number of assets ({a.N}) for the sample covariance — otherwise Σ is singular by construction.</CardContent></Card>}

        {a && !a.insufficient && a.fit && (
          <Card>
            <CardHeader><CardTitle className="text-base">2. Optimal weights — in-sample estimate</CardTitle>
              <CardDescription>Estimated on the latest {estimator === 'ewma' ? 'EWMA' : `${window}-day`} covariance (last date {a.rets.dates[a.rets.dates.length - 1]}). In-sample: describes the estimation window, not future performance.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {a.fit.status !== 'OK' ? (
                <div className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-destructive" /> Optimization returned {a.fit.status} — no weights are shown (never a partially converged solution).</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div><div className="text-xs text-muted-foreground">Estimated vol (ann.)</div><div className="font-mono text-lg">{pct(annualizedVol(a.fit.weights!, a.S!))}</div></div>
                    <div><div className="text-xs text-muted-foreground">Equal-weight vol (ann.)</div><div className="font-mono text-lg">{pct(annualizedVol(equalWeights(a.N), a.S!))}</div></div>
                    <div><div className="text-xs text-muted-foreground">Concentration (HHI / N_eff)</div><div className="font-mono text-lg">{hhi(a.fit.weights!).toFixed(3)} / {effectiveN(a.fit.weights!).toFixed(1)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Condition number of Σ</div><div className="font-mono text-lg">{a.fit.conditionNumber ? a.fit.conditionNumber.toExponential(1) : '—'}</div></div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Table>
                      <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead className="text-right">GMV weight</TableHead><TableHead className="text-right">Equal weight</TableHead></TableRow></TableHeader>
                      <TableBody>{weightsData.map((r) => (
                        <TableRow key={r.ticker}><TableCell className="font-mono">{r.ticker}</TableCell>
                          <TableCell className="text-right font-mono">{pct(r.gmv)}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{pct(r.ew)}</TableCell></TableRow>
                      ))}</TableBody>
                    </Table>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={weightsData}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="ticker" fontSize={11} /><YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} fontSize={11} /><Tooltip formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
                        <Bar dataKey="gmv" name="GMV" fill="hsl(var(--primary))">{weightsData.map((r) => <Cell key={r.ticker} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {a && !a.insufficient && (
          <Card>
            <CardHeader><CardTitle className="text-base">3. Walk-forward out-of-sample</CardTitle>
              <CardDescription>{estimator === 'ewma' ? 'EWMA' : `Rolling ${window}-day`} estimation, rebalanced every {DEFAULT_WALKFORWARD.rebalance} trading days; each origin uses only past returns. Out-of-sample: realized volatility over each holding block. Descriptive evidence — no superiority claim.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><div className="text-xs text-muted-foreground">Origins (converged)</div><div className="font-mono text-lg">{a.wf.summary.converged}/{a.wf.summary.origins}</div></div>
                <div><div className="text-xs text-muted-foreground">GMV realized vol</div><div className="font-mono text-lg">{pct(a.wf.summary.gmvMeanRealizedVol)}</div></div>
                <div><div className="text-xs text-muted-foreground">Equal-weight realized vol</div><div className="font-mono text-lg">{pct(a.wf.summary.ewMeanRealizedVol)}</div></div>
                <div><div className="text-xs text-muted-foreground">Vol ratio GMV/EW · turnover</div><div className="font-mono text-lg">{a.wf.summary.volRatio?.toFixed(3) ?? '—'} · {a.wf.summary.gmvMeanTurnover?.toFixed(2) ?? '—'}</div></div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={wfChart}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="date" fontSize={10} minTickGap={40} /><YAxis fontSize={11} unit="%" /><Tooltip /><Legend />
                  <Line type="monotone" dataKey="gmv" name="GMV realized vol (%)" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ew" name="Equal weight realized vol (%)" stroke="hsl(var(--muted-foreground))" dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">Educational tool only — not investment advice. GMV minimizes estimated variance using past returns; estimation error can dominate out of sample, and the walk-forward results are descriptive evidence on one universe, not a guarantee of future risk reduction.</p>
      </main>
    </div>
  );
}
