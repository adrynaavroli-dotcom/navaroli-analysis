import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { planFor, resultsFor, validationStatusFor } from '@/lib/validation';

const tol = (t: unknown) => (t === 'exact' ? 'exact' : `abs ${(t as { abs: number }).abs.toExponential(0)} · rel ${(t as { rel: number }).rel.toExponential(0)}`);

/** Recorded validation evidence for one matrix item (shared by matrix sheet and /quant docs). */
export function ValidationEvidence({ modelId }: { modelId: string }) {
  const plan = planFor(modelId);
  const results = resultsFor(modelId);
  if (!plan) return <p className="text-xs text-muted-foreground">No validation plan defined yet.</p>;
  const first = results[0];
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Validation layer:</span> <Badge variant="outline" className="font-mono text-[10px]">{validationStatusFor(modelId)}</Badge>
        <span className="text-muted-foreground">Required: {plan.required.join(', ')}</span>
        {first && <span className="text-muted-foreground">· {first.validationDate} · {first.implementationVersion}</span>}
      </div>
      {plan.notApplicable && Object.entries(plan.notApplicable).map(([k, v]) => <p key={k} className="text-muted-foreground"><b>{k}</b>: not applicable — {v}</p>)}
      {plan.notes?.map((n) => <p key={n} className="text-muted-foreground">{n}</p>)}
      {results.length > 0 && (
        <>
          <Table className="text-[11px]">
            <TableHeader><TableRow>{['Type', 'Test', 'Tolerance', 'Max abs err', 'Result'].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{results.map((r) => (
              <TableRow key={r.testName} title={`Expected: ${r.expectedResult}\nActual: ${r.actualResult}\nReference: ${r.evidence.reference}`}>
                <TableCell className="font-mono">{r.validationType}</TableCell>
                <TableCell>{r.testName}</TableCell>
                <TableCell className="font-mono">{tol(r.tolerance)}</TableCell>
                <TableCell className="font-mono">{r.maxAbsError.toExponential(1)}</TableCell>
                <TableCell className="font-mono">{r.passed ? 'PASS' : 'FAIL'}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          {results.find((r) => r.validationType === 'independent-benchmark') && (
            <p className="text-muted-foreground">Benchmark data: {results.find((r) => r.validationType === 'independent-benchmark')!.evidence.dataset}</p>
          )}
        </>
      )}
    </div>
  );
}
