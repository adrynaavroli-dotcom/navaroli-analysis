import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard, pct, num } from '@/components/volatility/StatCard';
import { cachedFitGarch, garchNextVariance, TRADING_DAYS } from '@/lib/volatility';

/** GARCH(1,1) diagnostics. Composes src/lib/volatility/garch.ts only; no math here. */
export function GarchPanel({ returns }: { returns: number[] }) {
  const r = useMemo(() => cachedFitGarch(returns), [returns]);
  const f = r.fit;
  const failed = !f || f.status === 'NOT_CONVERGED';
  const sci = (v: number) => v.toExponential(3);
  const last = f ? f.annualizedVolatility[f.annualizedVolatility.length - 1] : null;
  const next = f && !failed ? Math.sqrt(garchNextVariance(f, returns) * TRADING_DAYS) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">GARCH(1,1) — Gaussian maximum likelihood</CardTitle>
        <CardDescription>h_t = ω + α ε²_(t−1) + β h_(t−1), constant mean μ. Parameters in daily decimal-return units, estimated on the full sample. Validated against Python arch on synthetic data; forecast accuracy is not validated.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {failed ? (
          <p className="flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 mt-0.5" />
            {r.error ?? `Estimation did not converge (${f?.diagnostics.reason}). No parameters are shown.`}</p>
        ) : (<>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Mean (daily)" value={pct(f!.params.mu, 4)} />
            <StatCard label="Omega (daily, decimal²)" value={sci(f!.params.omega)} />
            <StatCard label="Alpha (ARCH)" value={num(f!.params.alpha, 4)} />
            <StatCard label="Beta (GARCH)" value={num(f!.params.beta, 4)} />
            <StatCard label="Persistence (alpha+beta)" value={num(f!.persistence, 4)} />
            <StatCard label="Unconditional vol (annualized)" value={f!.unconditionalVariance != null ? pct(Math.sqrt(f!.unconditionalVariance * TRADING_DAYS)) : 'undefined'} hint="√(252·ω/(1−α−β))" />
            <StatCard label="In-sample vol, last day" value={pct(last)} hint="Annualized, full-sample parameters" />
            <StatCard label="Next-period vol estimate" value={pct(next)} hint="One step ahead, annualized · not validated as forecast" />
            <StatCard label="Log-likelihood" value={num(f!.logLik, 2)} />
            <StatCard label="AIC" value={num(f!.aic, 2)} />
            <StatCard label="BIC" value={num(f!.bic, 2)} />
            <StatCard label="Observations" value={String(f!.nobs)} />
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Status: <b className={f!.status === 'CONVERGED' ? 'text-foreground' : 'text-destructive'}>{f!.status}</b></span>
            <span>Iterations {f!.diagnostics.iterations} · evaluations {f!.diagnostics.evaluations}</span>
            <span>Variance-bound hits: {f!.diagnostics.boundHits}</span>
            <span>Fit time: {r.elapsedMs.toFixed(0)} ms</span>
            {f!.diagnostics.nearBoundary.length > 0 && <span className="text-destructive">Near boundary: {f!.diagnostics.nearBoundary.join(', ')} — possible boundary optimum, interpret with care</span>}
          </div>
        </>)}
      </CardContent>
    </Card>
  );
}
