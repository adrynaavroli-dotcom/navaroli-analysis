import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { evaluateForecastModels, FORECAST_MODELS, HORIZONS, GARCH_REFIT_EVERY, type ForecastOutcome, type ForecastEvaluation as Eval } from '@/lib/volatility/forecast';
import observed from '@/lib/validation/evidence/vol005-observed.json';

interface Props { returns: number[]; dates: string[]; provenance: string }

const sci = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toExponential(3));
const fx = (v: number | null | undefined, d = 4) => (v === null || v === undefined ? '—' : v.toFixed(d));

function ScoreTable({ ev, horizon }: { ev: Eval; horizon: number }) {
  const h = ev.horizons.find((x) => x.horizon === horizon);
  if (!h) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{h.origins} common origins · origins {h.originFrom} → {h.originTo} · targets {h.targetFrom} → {h.targetTo}{h.excludedOrigins ? ` · ${h.excludedOrigins} excluded` : ''}</p>
      <Table>
        <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Model</TableHead><TableHead className="text-right">QLIKE</TableHead><TableHead className="text-right">ΔQLIKE vs Hist 60D</TableHead><TableHead className="text-right">MSE</TableHead><TableHead className="text-right">RMSE</TableHead></TableRow></TableHeader>
        <TableBody>{FORECAST_MODELS.filter((m) => h.scores[m.id]).sort((a, b) => (h.scores[a.id]?.rank ?? Infinity) - (h.scores[b.id]?.rank ?? Infinity)).map((m) => {
          const s = h.scores[m.id];
          if (!s) return null;
          return <TableRow key={m.id} data-testid={`oos-row-${m.id}`}><TableCell>{s.rank}</TableCell><TableCell className="font-medium" title={m.convention}>{m.name}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{fx(s.qlike)}</TableCell><TableCell className="text-right font-mono tabular-nums">{fx(s.qlikeDiffVsBaseline)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{sci(s.mse)}</TableCell><TableCell className="text-right font-mono tabular-nums">{sci(s.rmse)}</TableCell></TableRow>;
        })}</TableBody>
      </Table>
      {ev.failedModels.length > 0 && <p className="text-xs text-destructive">Excluded: {ev.failedModels.map((f) => `${f.id} (${f.reason})`).join('; ')}</p>}
      {ev.garchFailures.length > 0 && <p className="text-xs text-destructive">GARCH refit failures: {ev.garchFailures.map((f) => f.date).join(', ')}</p>}
    </div>
  );
}

/** VOL-005 out-of-sample evaluation panel: presentation only; all math lives in src/lib/volatility/forecast. */
export function ForecastEvaluation({ returns, dates, provenance }: Props) {
  const [horizon, setHorizon] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ out: ForecastOutcome; ms: number } | null>(null);
  const runId = useRef(0);
  const busy = useRef(false);

  // A new dataset invalidates any previous result (never show stale scores).
  useEffect(() => {
    runId.current++; busy.current = false; setResult(null); setRunning(false);
    return () => { runId.current++; busy.current = false; };
  }, [returns, dates, provenance]);

  const run = () => {
    if (busy.current) return;
    busy.current = true;
    const id = ++runId.current;
    setRunning(true);
    setTimeout(() => {
      if (id !== runId.current) return;
      const t = performance.now();
      let out: ForecastOutcome;
      try { out = evaluateForecastModels(returns, dates); } catch (e) { out = { status: 'failed', detail: e instanceof Error ? e.message : String(e) }; }
      const ms = Math.round(performance.now() - t);
      if (id !== runId.current) return;
      setResult({ out, ms }); busy.current = false; setRunning(false);
    }, 50);
  };

  const rec = observed.outcome as unknown as Eval;
  const ev = result?.out.status === 'ok' ? (result.out as Eval) : null;

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div><CardTitle className="text-base">OOS Forecast Evaluation (VOL-005)</CardTitle>
          <CardDescription className="max-w-2xl">Rolling-origin, expanding-window test. At each origin, every model uses only the returns known up to that day. These are out-of-sample scores, unlike the in-sample GARCH fit above. Lower QLIKE is better. Future squared returns are a noisy proxy for true variance. Multi-day targets overlap, so no statistical significance is claimed.</CardDescription></div>
        <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Horizon</span>
          <ToggleGroup type="single" size="sm" variant="outline" value={String(horizon)} onValueChange={(v) => v && setHorizon(+v)}>
            {HORIZONS.map((h) => <ToggleGroupItem key={h} value={String(h)} aria-label={`Horizon ${h} days`}>{h}D</ToggleGroupItem>)}
          </ToggleGroup></div>
      </CardHeader>
      <CardContent className="space-y-6 overflow-x-auto">
        <section className="space-y-2" data-testid="oos-current" aria-busy={running}>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={run} disabled={running}>{running ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Running…</> : 'Run evaluation'}</Button>
            <span className="text-xs text-muted-foreground">Current data: {provenance} · {returns.length} returns · GARCH refit every {GARCH_REFIT_EVERY} origins</span>
          </div>
          {result && <p className="text-xs text-muted-foreground" data-testid="oos-runtime">Runtime {result.ms} ms{ev ? ` · train ${ev.trainSize} returns · ${ev.garchFits} GARCH fit attempts` : ''}</p>}
          {result && result.out.status !== 'ok' && (
            <p className="flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {result.out.status === 'insufficient-history' ? `Insufficient history: ${result.out.detail}` : `Evaluation ${result.out.status}: ${result.out.detail}`}</p>)}
          {ev && <ScoreTable ev={ev} horizon={horizon} />}
        </section>
        <section className="space-y-2 border-t pt-4" data-testid="oos-recorded">
          <h4 className="text-sm font-medium">Recorded evidence: observed data</h4>
          <p className="text-xs text-muted-foreground">{observed.snapshot.provider} {observed.snapshot.ticker}, {observed.snapshot.priceBasis}, snapshot {observed.snapshot.version} (retrieved {observed.snapshot.retrievedAt.slice(0, 10)}) · {observed.returns.n} log returns {observed.returns.firstDate} → {observed.returns.lastDate} · train {rec.trainSize} · refit every {rec.refitEvery} · {rec.garchFits} fits, {rec.garchFailures.length} failures. One ticker and one period, so the ranking depends on this sample.</p>
          <ScoreTable ev={rec} horizon={horizon} />
        </section>
      </CardContent>
    </Card>
  );
}
