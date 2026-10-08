import { Link, Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/hooks/useAuth';
import { useQuantMatrix } from '@/hooks/useQuantMatrix';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ValidationEvidence } from '@/components/quant/ValidationEvidence';
import { byDocPath, dependents, underDocPath, type MatrixItem } from '@/lib/quant-matrix';

/**
 * Technical documentation skeleton for /quant/*. Content is read from the
 * Quant Matrix (single source of truth) + validation registry — nothing duplicated.
 */
export default function QuantDoc() {
  const { user, loading } = useAuth();
  const { items, isLoading } = useQuantMatrix();
  const path = useLocation().pathname.replace(/\/$/, '');
  if (loading || isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  const item = byDocPath(path, items);
  const children = underDocPath(path, items);
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
        <nav className="text-xs text-muted-foreground"><Link to="/quant-matrix" className="underline">Quant Matrix</Link> · <span className="font-mono">{path}</span></nav>
        {item ? <ItemDoc i={item} items={items} /> : children.length ? (
          <Card><CardHeader><CardTitle>{path}</CardTitle><CardDescription>Technical pages in this section</CardDescription></CardHeader>
            <CardContent className="space-y-1 text-sm">{children.map((c) => (
              <div key={c.id}><Link to={c.docPath} className="underline">{c.submodule}</Link> <span className="font-mono text-xs text-muted-foreground">{c.id} · {c.status}</span></div>
            ))}</CardContent></Card>
        ) : <p className="text-sm text-muted-foreground">No technical page registered for this path.</p>}
      </main>
    </div>
  );
}

function ItemDoc({ i, items }: { i: MatrixItem; items: MatrixItem[] }) {
  const S = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <section className="space-y-1"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t}</h2><div className="text-sm">{children}</div></section>
  );
  return (
    <Card>
      <CardHeader>
        <div className="font-mono text-xs text-muted-foreground">{i.id} · Phase {i.phase} <Badge variant="outline" className="ml-2 font-mono text-[10px]">{i.status}</Badge></div>
        <CardTitle>{i.submodule}</CardTitle>
        <CardDescription>Technical page — in preparation. Generated from the Quant Matrix.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <S t="Objective">{i.concept}</S>
        <S t="Inputs"><ul className="list-disc pl-5 text-xs">{i.requiredData.map((d, k) => <li key={k}>{d.source} — {d.dataset} ({d.frequency}, {d.history}; {d.updateMethod})</li>)}</ul></S>
        <S t="Methodology"><div className="rounded bg-muted px-3 py-2 font-mono text-xs">{i.mathematicalModel}</div><p className="mt-1 text-xs text-muted-foreground">Implementation: <span className="font-mono">{i.implementation}</span></p></S>
        <S t="Outputs">{i.livePath ? <Link to={i.livePath} className="underline">Live module</Link> : 'Not yet exposed in the UI.'}</S>
        <S t="Validation"><ValidationEvidence modelId={i.id} /></S>
        <S t="Limitations">{i.limitations?.length ? <ul className="list-disc pl-5 text-xs">{i.limitations.map((l) => <li key={l}>{l}</li>)}</ul> : 'To be documented.'}</S>
        <S t="Dependencies">
          <p className="text-xs">Depends on: {i.dependencies.join(', ') || 'none'}</p>
          <p className="text-xs">Required by: {dependents(items, i.id).map((d) => d.id).join(', ') || 'none'}</p>
        </S>
      </CardContent>
    </Card>
  );
}
