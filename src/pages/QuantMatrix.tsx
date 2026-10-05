import { Fragment, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Search } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/hooks/useAuth';
import { useQuantMatrix } from '@/hooks/useQuantMatrix';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  STATUSES, PRIORITIES, PRIORITY_LABEL, PROFESSIONAL_AREAS, LAYERS, LAYER_LABEL, CURRENT_PRIORITY, SOURCE_TO_VERIFY,
  byId, dependents, countBy, layerProgress, needsValidation, withoutData, withoutDocs, sourceUnverified,
  type MatrixItem, type Status,
} from '@/lib/quant-matrix';

const ALL = '__all';
type SortKey = 'id' | 'priority' | 'status' | 'module' | 'phase';

function StatusBadge({ s }: { s: string }) {
  return <Badge variant="outline" className="font-mono text-[10px] whitespace-nowrap">{s}</Badge>;
}

export default function QuantMatrix() {
  const { user, loading } = useAuth();
  const { items, phases, isLoading, saving, setItemStatus, setPhaseStatus } = useQuantMatrix();
  const [selected, setSelected] = useState<string | null>(null);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const map = byId(items);
  const sel = selected ? map.get(selected) ?? null : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 md:py-10 space-y-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Internal · Technical planning</div>
          <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight">Quantitative Project Matrix</h1>
          <p className="text-muted-foreground">Concept → Mathematical model → Data → Implementation → Validation → Professional use</p>
        </div>
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <Tabs defaultValue="dashboard">
            <TabsList>
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="matrix">Matrix</TabsTrigger>
              <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
            </TabsList>
            <TabsContent value="dashboard"><Dashboard items={items} onSelect={setSelected} /></TabsContent>
            <TabsContent value="matrix"><Matrix items={items} onSelect={setSelected} /></TabsContent>
            <TabsContent value="roadmap"><Roadmap items={items} phases={phases} saving={saving} onPhase={setPhaseStatus} onSelect={setSelected} /></TabsContent>
          </Tabs>
        )}
      </main>
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {sel && <Detail item={sel} items={items} saving={saving} onStatus={(s) => setItemStatus(sel.id, s)} onSelect={setSelected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ items, onSelect }: { items: MatrixItem[]; onSelect: (id: string) => void }) {
  const core = items.filter((i) => i.tier === 'CORE');
  const st = countBy(items, (i) => i.status);
  const byArea = PROFESSIONAL_AREAS.map((a) => ({ name: a, value: items.filter((i) => i.professionalUse.includes(a)).length }));
  const byModule = Object.entries(countBy(items, (i) => i.module)).map(([name, value]) => ({ name, value }));
  const kpis: [string, number][] = [
    ['Total models', items.length], ['Completed', st.COMPLETED ?? 0], ['In progress', st['IN PROGRESS'] ?? 0],
    ['Validation', st.VALIDATION ?? 0], ['Planned', st.PLANNED ?? 0], ['Advanced', items.filter((i) => i.tier === 'ADVANCED').length],
  ];
  const lists: [string, MatrixItem[]][] = [
    ['Requiring validation', items.filter(needsValidation)],
    ['Without documentation', items.filter(withoutDocs)],
    ['Without data definition', items.filter(withoutData)],
    ['Master source to verify', items.filter(sourceUnverified)],
  ];
  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {kpis.map(([l, v]) => (
          <div key={l} className="rounded-lg border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</div>
            <div className="mt-1 font-mono text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Core Quant Engine progress</CardTitle>
          <CardDescription>Share of completed layers (academic, specification, code, UI, validation, documentation) across {core.length} core items.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3"><Progress value={layerProgress(core) * 100} className="flex-1" /><span className="font-mono text-sm">{(layerProgress(core) * 100).toFixed(0)}%</span></div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
            {LAYERS.map((l) => {
              const done = core.filter((i) => i.layers[l] === 'COMPLETED').length;
              return <div key={l} className="rounded border p-2"><div className="text-muted-foreground">{LAYER_LABEL[l]}</div><div className="font-mono">{done}/{core.length}</div></div>;
            })}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        {([['Models by module', byModule], ['Models by professional area', byArea]] as const).map(([t, d]) => (
          <Card key={t}><CardHeader><CardTitle className="text-base">{t}</CardTitle></CardHeader>
            <CardContent><div className="h-72"><ResponsiveContainer>
              <BarChart data={d} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer></div></CardContent></Card>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {lists.map(([t, l]) => (
          <Card key={t}><CardHeader className="pb-2"><CardTitle className="text-sm">{t} <span className="font-mono text-muted-foreground">({l.length})</span></CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1">
              {l.map((i) => <button key={i.id} onClick={() => onSelect(i.id)} className="rounded border px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent">{i.id}</button>)}
              {!l.length && <span className="text-xs text-muted-foreground">None</span>}
            </CardContent></Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Matrix ---------------- */
function Matrix({ items, onSelect }: { items: MatrixItem[]; onSelect: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [tier, setTier] = useState(ALL);
  const [area, setArea] = useState(ALL);
  const [module, setModule] = useState(ALL);
  const [sort, setSort] = useState<SortKey>('id');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const modules = useMemo(() => [...new Set(items.map((i) => i.module))], [items]);

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    const f = items.filter((i) =>
      (status === ALL || i.status === status) && (priority === ALL || i.priority === priority) && (tier === ALL || i.tier === tier) &&
      (area === ALL || i.professionalUse.includes(area as never)) && (module === ALL || i.module === module) &&
      (!s || [i.id, i.module, i.submodule, i.concept, i.mathematicalModel, i.master.topic].join(' ').toLowerCase().includes(s)));
    const key: Record<SortKey, (i: MatrixItem) => string | number> = {
      id: (i) => i.id, priority: (i) => i.priority, status: (i) => STATUSES.indexOf(i.status), module: (i) => i.module, phase: (i) => i.phase,
    };
    return [...f].sort((a, b) => (key[sort](a) < key[sort](b) ? -1 : key[sort](a) > key[sort](b) ? 1 : 0));
  }, [items, q, status, priority, tier, area, module, sort]);

  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const F = ({ v, set, opts, label }: { v: string; set: (s: string) => void; opts: readonly string[]; label: string }) => (
    <Select value={v} onValueChange={set}>
      <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent><SelectItem value={ALL}>All · {label}</SelectItem>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <Card className="mt-4">
      <CardHeader className="space-y-3">
        <div className="flex flex-col lg:flex-row gap-2 flex-wrap">
          <div className="relative lg:w-64"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models…" className="pl-8 h-9" /></div>
          <F v={tier} set={setTier} opts={['CORE', 'ADVANCED']} label="Tier" />
          <F v={module} set={setModule} opts={modules} label="Module" />
          <F v={status} set={setStatus} opts={STATUSES} label="Status" />
          <F v={priority} set={setPriority} opts={PRIORITIES} label="Priority" />
          <F v={area} set={setArea} opts={PROFESSIONAL_AREAS} label="Area" />
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-9 w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{(['id', 'priority', 'status', 'module', 'phase'] as SortKey[]).map((k) => <SelectItem key={k} value={k}>Sort: {k}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <CardDescription>{rows.length} of {items.length} models</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table className="text-xs">
          <TableHeader><TableRow>
            {['', 'ID', 'Module', 'Submodule', 'Concept', 'Mathematical Model', 'Master Topic', 'Required Data', 'Implementation', 'Validation', 'Professional Use', 'Priority', 'Status', 'Dependencies', 'Next Action', 'Portfolio Value']
              .map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>{rows.map((i) => (
            <Fragment key={i.id}>
              <TableRow className="cursor-pointer" onClick={() => onSelect(i.id)}>
                <TableCell onClick={(e) => { e.stopPropagation(); toggle(i.id); }}>{open.has(i.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</TableCell>
                <TableCell className="font-mono whitespace-nowrap">{i.id}{i.tier === 'CORE' && <span className="ml-1 text-[9px] text-muted-foreground">CORE</span>}</TableCell>
                <TableCell>{i.module}</TableCell>
                <TableCell className="font-medium">{i.submodule}</TableCell>
                <TableCell className="min-w-40">{i.concept}</TableCell>
                <TableCell className="font-mono min-w-48">{i.mathematicalModel}</TableCell>
                <TableCell className="min-w-40">{i.master.topic}{sourceUnverified(i) && <div className="text-[10px] text-muted-foreground">{SOURCE_TO_VERIFY}</div>}</TableCell>
                <TableCell className="min-w-32">{[...new Set(i.requiredData.map((d) => d.source))].join(', ')}</TableCell>
                <TableCell className="min-w-48 font-mono text-[10px]">{i.implementation}</TableCell>
                <TableCell className="min-w-40">{i.validation.join(', ')}</TableCell>
                <TableCell className="min-w-40"><div className="flex flex-wrap gap-1">{i.professionalUse.map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>)}</div></TableCell>
                <TableCell className="font-mono">{i.priority}</TableCell>
                <TableCell><StatusBadge s={i.status} /></TableCell>
                <TableCell className="font-mono text-[10px] min-w-24">{i.dependencies.join(', ') || '—'}</TableCell>
                <TableCell className="min-w-56">{i.nextAction}</TableCell>
                <TableCell className="font-mono">{i.portfolioValue}</TableCell>
              </TableRow>
              {open.has(i.id) && (
                <TableRow className="bg-muted/40"><TableCell colSpan={16}>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    {LAYERS.map((l) => <div key={l}><div className="text-[10px] text-muted-foreground">{LAYER_LABEL[l]}</div><StatusBadge s={i.layers[l]} /></div>)}
                  </div>
                </TableCell></TableRow>
              )}
            </Fragment>
          ))}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------------- Roadmap ---------------- */
function Roadmap({ items, phases, saving, onPhase, onSelect }: {
  items: MatrixItem[]; phases: ReturnType<typeof useQuantMatrix>['phases']; saving: boolean;
  onPhase: (p: number, s: Status) => void; onSelect: (id: string) => void;
}) {
  const map = byId(items);
  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-3">
        {phases.map((p) => {
          const ph = items.filter((i) => i.phase === p.phase);
          return (
            <Card key={p.phase}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                <div><CardTitle className="text-sm">Phase {p.phase} — {p.name}</CardTitle><CardDescription className="text-xs">{p.objective}</CardDescription></div>
                <Select value={p.status} onValueChange={(v) => onPhase(p.phase, v as Status)} disabled={saving}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={layerProgress(ph) * 100} className="h-1.5" />
                <div className="flex flex-wrap gap-1">
                  {ph.map((i) => (
                    <button key={i.id} onClick={() => onSelect(i.id)} className="rounded border px-2 py-1 text-left text-[11px] hover:bg-accent">
                      <span className="font-mono">{i.id}</span> {i.submodule} <span className="text-muted-foreground">· {i.status}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Current project priority</CardTitle></CardHeader>
          <CardContent><ol className="space-y-1.5 text-xs">
            {CURRENT_PRIORITY.map((c, n) => (
              <li key={c.label} className="flex gap-2"><span className="font-mono text-muted-foreground w-5">{n + 1}.</span>
                <span className="flex-1">{c.label}</span>
                <span className="text-muted-foreground font-mono">{c.ids.filter((id) => map.get(id)?.status === 'VALIDATION' || map.get(id)?.status === 'COMPLETED').length}/{c.ids.length}</span></li>
            ))}
          </ol></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Dependency chains</CardTitle></CardHeader>
          <CardContent className="space-y-2 font-mono text-[11px]">
            {[
              ['DAT-003', 'VOL-001', 'VOL-003', 'VOL-006'],
              ['DAT-003', 'COR-001', 'COR-002', 'POR-001'],
              ['VOL-001', 'DER-001', 'DER-003', 'DER-005', 'DER-006', 'DER-007'],
              ['POR-001', 'RSK-001', 'RSK-005', 'RSK-007', 'DER-011'],
              ['DER-009', 'RSK-004', 'DER-008', 'ADV-005'],
            ].map((chain) => (
              <div key={chain.join()} className="flex flex-wrap items-center gap-1">
                {chain.map((id, k) => (
                  <Fragment key={id}>{k > 0 && <span className="text-muted-foreground">→</span>}
                    <button onClick={() => onSelect(id)} className="rounded border px-1 hover:bg-accent" title={map.get(id)?.submodule}>{map.get(id)?.submodule ?? id}</button>
                  </Fragment>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ---------------- Detail ---------------- */
function Detail({ item: i, items, saving, onStatus, onSelect }: {
  item: MatrixItem; items: MatrixItem[]; saving: boolean; onStatus: (s: Status) => void; onSelect: (id: string) => void;
}) {
  const map = byId(items);
  const downstream = dependents(items, i.id);
  const S = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <section className="space-y-1.5"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t}</h4><div className="text-sm">{children}</div></section>
  );
  const chip = (id: string) => (
    <button key={id} onClick={() => onSelect(id)} className="rounded border px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent">{id} · {map.get(id)?.submodule ?? '?'}</button>
  );
  return (
    <div className="space-y-5">
      <SheetHeader>
        <div className="font-mono text-xs text-muted-foreground">{i.id} · {i.tier} · Phase {i.phase} · {PRIORITY_LABEL[i.priority]}</div>
        <SheetTitle>{i.submodule}</SheetTitle>
        <SheetDescription>{i.module} — {i.concept}</SheetDescription>
      </SheetHeader>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Status</span>
        <Select value={i.status} onValueChange={(v) => onStatus(v as Status)} disabled={saving}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground">COMPLETED requires a completed validation layer.</span>
      </div>
      <S t="Model overview">
        <div className="grid grid-cols-3 gap-2">
          {LAYERS.map((l) => <div key={l}><div className="text-[10px] text-muted-foreground">{LAYER_LABEL[l]}</div><StatusBadge s={i.layers[l]} /></div>)}
        </div>
        <div className="mt-2 text-xs">Portfolio value: <b className="font-mono">{i.portfolioValue}</b></div>
      </S>
      <S t="Mathematical framework">
        <div className="rounded bg-muted px-3 py-2 font-mono text-xs">{i.mathematicalModel}</div>
        {i.mathematicalConcepts.length > 0 && <div className="mt-1 text-xs text-muted-foreground">{i.mathematicalConcepts.join(' · ')}</div>}
      </S>
      <S t="Required data">
        <Table className="text-[11px]"><TableHeader><TableRow>{['Source', 'Dataset', 'Freq.', 'History', 'Update'].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{i.requiredData.map((d, k) => <TableRow key={k}><TableCell>{d.source}</TableCell><TableCell>{d.dataset}</TableCell><TableCell>{d.frequency}</TableCell><TableCell>{d.history}</TableCell><TableCell>{d.updateMethod}</TableCell></TableRow>)}</TableBody>
        </Table>
      </S>
      <S t="Implementation">
        <div className="font-mono text-xs">{i.implementation}</div>
        <div className="mt-1 flex flex-wrap gap-3 text-xs">
          {i.livePath && <Link to={i.livePath} className="inline-flex items-center gap-1 underline">Open live module <ExternalLink className="h-3 w-3" /></Link>}
          <span className="text-muted-foreground">Doc page (planned): <span className="font-mono">{i.docPath}</span></span>
        </div>
      </S>
      <S t="Validation"><div className="flex flex-wrap gap-1">{i.validation.map((v) => <Badge key={v} variant="outline" className="text-[10px]">{v}</Badge>)}</div></S>
      <S t="Professional applications"><div className="flex flex-wrap gap-1">{i.professionalUse.map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>)}</div></S>
      <S t="Master references">
        <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-xs">
          <dt className="text-muted-foreground">Module</dt><dd>{i.master.module}</dd>
          <dt className="text-muted-foreground">Topic</dt><dd>{i.master.topic}</dd>
          <dt className="text-muted-foreground">Source</dt><dd className="font-mono text-[11px] break-all">{i.master.source}</dd>
          <dt className="text-muted-foreground">Exercise</dt><dd className="font-mono text-[11px] break-all">{i.master.practicalExercise ?? '—'}</dd>
          <dt className="text-muted-foreground">Source available</dt><dd>{sourceUnverified(i) ? 'No — to verify' : 'Yes'}</dd>
        </dl>
      </S>
      <S t="Dependencies">
        <div className="text-[11px] text-muted-foreground">Depends on</div>
        <div className="flex flex-wrap gap-1">{i.dependencies.length ? i.dependencies.map(chip) : <span className="text-xs">None</span>}</div>
        <div className="mt-2 text-[11px] text-muted-foreground">Required by</div>
        <div className="flex flex-wrap gap-1">{downstream.length ? downstream.map((d) => chip(d.id)) : <span className="text-xs">None</span>}</div>
      </S>
      <S t="Next action">{i.nextAction}</S>
    </div>
  );
}
