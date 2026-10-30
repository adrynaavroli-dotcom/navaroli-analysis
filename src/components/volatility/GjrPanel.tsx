import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard, pct, num } from '@/components/volatility/StatCard';
import { cachedFitGjrGarch, gjrNextVariance, TRADING_DAYS } from '@/lib/volatility';

/** GJR-GARCH(1,1,1) diagnostics (VOL-004). Composes src/lib/volatility/gjr-garch.ts only; no math here. */
export function GjrPanel({ returns }: { returns: number[] }) {
  const r = useMemo(() => cachedFitGjrGarch(returns), [returns]);
  const f = r.fit;
  const failed = !f || f.status === 'NOT_CONVERGED';
  const sci = (v: number) => v.toExponential(3);
  const last = f ? f.annualizedVolatility[f.annualizedVolatility.length - 1] : null;
  const next = f && !failed ? Math.sqrt(gjrNextVariance(f, returns) * TRADING_DAYS) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">GJR-GARCH(1,1,1) — asymmetric volatility</CardTitle>
        <CardDescription>h_t = ω + (α + γ·I[ε_(t−1) &lt; 0]) ε²_(t−1) + β h_(t−1). γ measures how much more variance reacts to negative innovations; it may be negative or ≈ 0. Estimated on the full sample; validated against Python arch on synthetic data. Forecast quality is not evaluated.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {failed ? (
          <p className="flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 mt-0.5" />
            {r.error ?? `Estimation did not converge (${f?.diagnostics.reason}). No parameters are shown.`}</p>
        ) : (<>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">In-sample fitted variance</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Mean (daily)" value={pct(f!.params.mu, 4)} />
            <StatCard label="Omega (daily, decimal²)" value={sci(f!.params.omega)} />
            <StatCard label="Alpha (good news, ε ≥ 0)" value={num(f!.newsImpact.positive, 4)} />
            <StatCard label="Alpha+Gamma (bad news, ε < 0)" value={num(f!.newsImpact.negative, 4)} />
            <StatCard label="Gamma (asymmetry)" value={num(f!.params.gamma, 4)} hint={f!.nestedGarch ? '≈ 0: same as GARCH(1,1)' : 'No significance test'} />
            <StatCard label="Beta" value={num(f!.params.beta, 4)} />
            <StatCard label="Persistence (α+β+γ/2)" value={num(f!.persistence, 4)} />
            <StatCard label="Unconditional vol (annualized)" value={f!.unconditionalVariance != null ? pct(Math.sqrt(f!.unconditionalVariance * TRADING_DAYS)) : 'undefined'} />
            <StatCard label="In-sample vol, last day" value={pct(last)} hint="Annualized, full-sample parameters" />
            <StatCard label="Log-likelihood" value={num(f!.logLik, 2)} />
            <StatCard label="AIC" value={num(f!.aic, 2)} />
            <StatCard label="ΔAIC vs GARCH(1,1)" value={f!.nested ? num(f!.nested.deltaAic, 2) : 'n/a'} hint="Negative = lower AIC. In-sample information only — no significance test" />
          </div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Next-period (one-step) variance</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Next-period vol estimate" value={pct(next)} hint="Annualized · not validated as a forecast" />
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Status: <b className={f!.status === 'CONVERGED' ? 'text-foreground' : 'text-destructive'}>{f!.status}</b></span>
            <span>Observations {f!.nobs} · iterations {f!.diagnostics.iterations} · evaluations {f!.diagnostics.evaluations}</span>
            <span>Variance-bound hits: {f!.diagnostics.boundHits}</span>
            <span>Fit time: {r.elapsedMs.toFixed(0)} ms</span>
            {f!.diagnostics.nearBoundary.length > 0 && <span className="text-destructive">Near boundary: {f!.diagnostics.nearBoundary.join(', ')} — interpret with care</span>}
          </div>
        </>)}
      </CardContent>
    </Card>
  );
}
