import { useState, useCallback, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useValuationCache } from '@/hooks/useValuationCache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ValuationNav } from '@/components/valuation/ValuationNav';
import { ConsolidationPanel } from '@/components/valuation/ConsolidationPanel';
import { ValuationDashboard } from '@/components/valuation/ValuationDashboard';
import { CacheStatusIndicator } from '@/components/valuation/CacheStatusIndicator';
import type { AnalysisTemplateType, AnalysisWorkspace } from '@/types/valuation';
import type { ConsolidationResult, ConsolidatedYear } from '@/lib/financial-consolidator';

const TEMPLATE_OPTIONS: { value: AnalysisTemplateType; label: string }[] = [
  { value: 'dcf', label: 'DCF Model' },
  { value: 'comparables', label: 'Comparable Analysis' },
  { value: 'lbo', label: 'LBO Model' },
  { value: 'sum_of_parts', label: 'Sum of Parts' },
  { value: 'custom', label: 'Custom Analysis' },
];

export default function ValuationEngine() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const {
    isOnline,
    hasCachedData,
    pendingCount,
    isSyncing,
    getCachedWorkspaces,
    cacheWorkspaces,
    cacheWorkspace,
    getCacheAge,
    syncPendingChanges,
  } = useValuationCache();

  const [workspaces, setWorkspaces] = useState<AnalysisWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // New workspace form
  const [ticker, setTicker] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [templateType, setTemplateType] = useState<AnalysisTemplateType>('dcf');

  // Consolidation state
  const [consolidationResult, setConsolidationResult] = useState<ConsolidationResult | null>(null);
  const [showConsolidation, setShowConsolidation] = useState(false);

  // Selected workspace for viewing
  const [selectedWorkspace, setSelectedWorkspace] = useState<AnalysisWorkspace | null>(null);

  const fetchWorkspaces = useCallback(async (showRefreshToast = false) => {
    if (!user) return;
    
    // If offline, use cached data
    if (!navigator.onLine) {
      const cached = getCachedWorkspaces();
      if (cached.length > 0) {
        setWorkspaces(cached);
        setLoading(false);
        toast({ 
          title: 'Modo offline', 
          description: 'Mostrando datos en caché local.',
        });
        return;
      }
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('analysis_workspaces')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      // On error, try to use cached data
      const cached = getCachedWorkspaces();
      if (cached.length > 0) {
        setWorkspaces(cached);
        toast({ 
          title: 'Error de conexión', 
          description: 'Mostrando datos en caché.',
          variant: 'destructive' 
        });
      } else {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    } else {
      const fetchedWorkspaces = (data || []) as AnalysisWorkspace[];
      setWorkspaces(fetchedWorkspaces);
      // Cache the fetched data
      cacheWorkspaces(fetchedWorkspaces);
      if (showRefreshToast) {
        toast({ title: 'Sincronizado', description: 'Datos actualizados y guardados en caché.' });
      }
    }
    setLoading(false);
  }, [user, toast, getCachedWorkspaces, cacheWorkspaces]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchWorkspaces(true);
    setIsRefreshing(false);
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (user) fetchWorkspaces();
  }, [user, fetchWorkspaces]);

  const handleConsolidationConfirm = useCallback((result: ConsolidationResult) => {
    setConsolidationResult(result);
    setShowConsolidation(false);
    toast({ 
      title: 'Data consolidated', 
      description: `${result.years.length} years of financial data ready.` 
    });
  }, [toast]);

  const handleClearConsolidation = useCallback(() => {
    setConsolidationResult(null);
    setShowConsolidation(false);
  }, []);

  const handleCreateWorkspace = async () => {
    if (!user || !ticker || !companyName) return;

    setSaving(true);
    
    // Build the raw_data with consolidated financial data
    const rawData: Record<string, unknown> = {};
    
    if (consolidationResult) {
      rawData.consolidated = {
        years: consolidationResult.years,
        calculatedMetrics: consolidationResult.calculatedMetrics,
        warnings: consolidationResult.warnings,
      };
      rawData.processedFiles = consolidationResult.processedFiles.map(f => ({
        fileName: f.fileName,
        statementType: f.statementType,
        years: f.years,
        rowCount: f.rowCount,
      }));
    }
    
    const insertData = {
      user_id: user.id,
      ticker: ticker.toUpperCase(),
      company_name: companyName,
      industry: industry || null,
      template_type: templateType,
      raw_data: rawData,
      column_mappings: {},
    };
    const { error } = await supabase.from('analysis_workspaces').insert(insertData as never);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Workspace created', description: `${ticker} workspace is ready.` });
      setDialogOpen(false);
      resetForm();
      // Fetch and cache the updated workspaces
      const { data } = await supabase
        .from('analysis_workspaces')
        .select('*')
        .order('updated_at', { ascending: false });
      if (data) {
        const newWorkspaces = data as AnalysisWorkspace[];
        setWorkspaces(newWorkspaces);
        cacheWorkspaces(newWorkspaces);
      }
    }
    setSaving(false);
  };

  const resetForm = () => {
    setTicker('');
    setCompanyName('');
    setIndustry('');
    setTemplateType('dcf');
    setConsolidationResult(null);
    setShowConsolidation(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <ValuationNav />

      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm text-muted-foreground">
                  Manage your analysis workspaces
                </p>
                <CacheStatusIndicator
                  isOnline={isOnline}
                  hasCachedData={hasCachedData}
                  cacheAge={getCacheAge()}
                  pendingCount={pendingCount}
                  isSyncing={isSyncing}
                  onRefresh={handleRefresh}
                  onSync={syncPendingChanges}
                  isRefreshing={isRefreshing}
                />
              </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Workspace
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Workspace</DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ticker">Ticker *</Label>
                      <Input
                        id="ticker"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value)}
                        placeholder="AAPL"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company">Company Name *</Label>
                      <Input
                        id="company"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Apple Inc."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="industry">Industry</Label>
                      <Input
                        id="industry"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        placeholder="Technology"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="template">Template Type</Label>
                      <Select value={templateType} onValueChange={(v) => setTemplateType(v as AnalysisTemplateType)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEMPLATE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Consolidation Panel */}
                  <div className="space-y-2">
                    <Label>Financial Statements</Label>
                    {!showConsolidation && !consolidationResult ? (
                      <Button 
                        variant="outline" 
                        className="w-full h-20"
                        onClick={() => setShowConsolidation(true)}
                      >
                        <div className="text-center">
                          <p className="font-medium">Upload Financial Statements</p>
                          <p className="text-xs text-muted-foreground">
                            Income Statement, Balance Sheet, Cash Flow
                          </p>
                        </div>
                      </Button>
                    ) : consolidationResult && !showConsolidation ? (
                      <div className="border border-border rounded-lg p-4 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">
                              {consolidationResult.years.length} years of data consolidated
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {consolidationResult.processedFiles.length} files • 
                              {consolidationResult.calculatedMetrics.length > 0 && 
                                ` ${consolidationResult.calculatedMetrics.length} calculated metrics`}
                            </p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={handleClearConsolidation}>
                            Clear
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {showConsolidation && (
                    <ConsolidationPanel
                      onConfirm={handleConsolidationConfirm}
                      onCancel={handleClearConsolidation}
                    />
                  )}

                  <div className="flex justify-end gap-3 pt-4">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateWorkspace}
                      disabled={!ticker || !companyName || saving}
                    >
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create Workspace
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : workspaces.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-lg">
              <p className="text-muted-foreground mb-4">No workspaces yet</p>
              <Button variant="outline" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create your first workspace
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg bg-card hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedWorkspace(ws)}
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{ws.ticker}</span>
                      <span className="text-muted-foreground">{ws.company_name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ws.industry || 'No industry'} • {TEMPLATE_OPTIONS.find(t => t.value === ws.template_type)?.label}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Updated {new Date(ws.updated_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Workspace Dashboard View */}
          {selectedWorkspace && (
            <Dialog open={!!selectedWorkspace} onOpenChange={(open) => !open && setSelectedWorkspace(null)}>
              <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedWorkspace(null)}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <DialogTitle>{selectedWorkspace.ticker} - {selectedWorkspace.company_name}</DialogTitle>
                  </div>
                </DialogHeader>
                <ValuationDashboard
                  years={((selectedWorkspace.raw_data as Record<string, unknown>)?.consolidated as { years?: ConsolidatedYear[] })?.years ?? []}
                  calculatedMetrics={((selectedWorkspace.raw_data as Record<string, unknown>)?.consolidated as { calculatedMetrics?: string[] })?.calculatedMetrics ?? []}
                  templateType={selectedWorkspace.template_type}
                  ticker={selectedWorkspace.ticker}
                  companyName={selectedWorkspace.company_name}
                  workspaceId={selectedWorkspace.id}
                  userId={user?.id}
                  initialNotes={(selectedWorkspace as unknown as { analyst_notes?: string }).analyst_notes}
                  onDataUpdated={() => {
                    fetchWorkspaces();
                    // Refresh the selected workspace
                    supabase
                      .from('analysis_workspaces')
                      .select('*')
                      .eq('id', selectedWorkspace.id)
                      .single()
                      .then(({ data }) => {
                        if (data) setSelectedWorkspace(data as AnalysisWorkspace);
                      });
                  }}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </main>
    </div>
  );
}
