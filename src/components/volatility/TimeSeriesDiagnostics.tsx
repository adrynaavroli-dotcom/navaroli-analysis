import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { acf, acfWhiteNoiseBand, adfTest, ljungBox, type AdfResult } from '@/lib/timeseries';

const ACF_LAGS = 10;
const p = (v: number) => (v < 1e-4 ? '< 0.0001' : v.toFixed(4));
const safeAdf = (x: number[]): AdfResult | string => { try { return adfTest(x); } catch (e) { return (e as Error).message; } };

/** STA-002 diagnostics on Returns Engine output. Pure composition — all maths in src/lib/timeseries. */
export function TimeSeriesDiagnostics({ returns, prices }: { returns: number[]; prices: number[] }) {
  const d = useMemo(() => {
    const sq = returns.map((r) => r * r);
    return {
      acfR: acf(returns, ACF_LAGS), acfSq: acf(sq, ACF_LAGS), band: acfWhiteNoiseBand(returns.length),
      lbR: ljungBox(returns), lbSq: ljungBox(sq),
      adfP: safeAdf(prices.map(Math.log)), adfR: safeAdf(returns),
    };
  }, [returns, prices]);

  const adfRow = (label: string, a: AdfResult | string) => typeof a === 'string'
    ? <TableRow key={label}><TableCell>{label}</TableCell><TableCell colSpan={5} className="text-destructive">{a}</TableCell></TableRow>
    : <TableRow key={label}><TableCell>{label}</TableCell><TableCell className="font-mono">{a.statistic.toFixed(3)}</TableCell><TableCell className="font-mono">{p(a.pValue)}</TableCell>
        <TableCell className="font-mono">{a.usedLag} / {a.maxLag}</TableCell><TableCell className="font-mono">{a.critical['5%'].toFixed(3)}</TableCell><TableCell>{a.pValue < 0.05 ? 'Reject unit root' : 'Cannot reject unit root'}</TableCell></TableRow>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Time-Series Diagnostics</CardTitle>
        <CardDescription>Autocorrelation of returns and squared returns (ARCH effects), Ljung–Box tests and ADF unit-root test. Prerequisite checks before GARCH.</CardDescription></CardHeader>
      <CardContent className="space-y-4 overflow-x-auto text-xs">
        <Table>
          <TableHeader><TableRow><TableHead>Lag</TableHead>{Array.from({ length: ACF_LAGS }, (_, k) => <TableHead key={k} className="font-mono">{k + 1}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{([['ACF r', d.acfR], ['ACF r²', d.acfSq]] as const).map(([l, r]) => (
            <TableRow key={l}><TableCell>{l}</TableCell>{r ? r.slice(1).map((v, k) => <TableCell key={k} className={`font-mono ${Math.abs(v) > d.band ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{v.toFixed(3)}</TableCell>) : <TableCell colSpan={ACF_LAGS}>Undefined (constant series)</TableCell>}</TableRow>
          ))}</TableBody>
        </Table>
        <p className="text-muted-foreground">Bold = outside ±1.96/√n = ±{d.band.toFixed(3)} (white-noise band).</p>
        <Table>
          <TableHeader><TableRow>{['Series', 'Q(10)', 'p', 'Q(20)', 'p'].map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{([['Returns', d.lbR], ['Squared returns', d.lbSq]] as const).map(([l, r]) => (
            <TableRow key={l}><TableCell>Ljung–Box · {l}</TableCell>{r ? r.flatMap((x) => [<TableCell key={`${x.lag}s`} className="font-mono">{x.statistic.toFixed(2)}</TableCell>, <TableCell key={`${x.lag}p`} className="font-mono">{p(x.pValue)}</TableCell>]) : <TableCell colSpan={4}>Undefined (constant series)</TableCell>}</TableRow>
          ))}</TableBody>
        </Table>
        <Table>
          <TableHeader><TableRow>{['ADF (constant, AIC lags)', 'τ', 'p (MacKinnon)', 'Lag used / max', '5% critical', 'Result at 5%'].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{adfRow('Log price', d.adfP)}{adfRow('Log returns', d.adfR)}</TableBody>
        </Table>
        <p className="text-muted-foreground">H0 Ljung–Box: no autocorrelation up to lag m (χ²(m)). H0 ADF: unit root. Asymptotic tests; volatility clustering and structural breaks affect their size.</p>
      </CardContent>
    </Card>
  );
}
