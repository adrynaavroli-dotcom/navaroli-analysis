import { useState, useCallback, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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
import { FileDropzone } from '@/components/valuation/FileDropzone';
import { DataMappingPanel } from '@/components/valuation/DataMappingPanel';
import type { AnalysisTemplateType, AnalysisWorkspace, ParsedFileData, NormalizedFinancialData } from '@/types/valuation';
import type { ParsedFinancialData } from '@/lib/financial-parser';

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

  const [workspaces, setWorkspaces] = useState<AnalysisWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // New workspace form
  const [ticker, setTicker] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [templateType, setTemplateType] = useState<AnalysisTemplateType>('dcf');

  // File upload state
  const [parsedData, setParsedData] = useState<ParsedFileData | null>(null);
  const [normalizedData, setNormalizedData] = useState<ParsedFinancialData | null>(null);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [manualValues, setManualValues] = useState<Record<string, Record<string, number | null>>>({});
  const [showMapping, setShowMapping] = useState(false);

  const fetchWorkspaces = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('analysis_workspaces')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setWorkspaces((data || []) as AnalysisWorkspace[]);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    if (user) fetchWorkspaces();
  }, [user, fetchWorkspaces]);

  const handleFileProcessed = useCallback((data: ParsedFileData) => {
    setParsedData(data);
    setColumnMappings({});
    setShowMapping(true);
  }, []);

  const handleClearFile = useCallback(() => {
    setParsedData(null);
    setNormalizedData(null);
    setColumnMappings({});
    setManualValues({});
    setShowMapping(false);
  }, []);

  const handleConfirmMapping = useCallback((data: {
    normalizedData: ParsedFinancialData;
    manualMappings: Record<string, string>;
    manualValues: Record<string, Record<string, number | null>>;
  }) => {
    setNormalizedData(data.normalizedData);
    setColumnMappings(data.manualMappings);
    setManualValues(data.manualValues);
    setShowMapping(false);
    toast({ title: 'Mapping saved', description: 'Financial data has been normalized and configured.' });
  }, [toast]);

  const handleCreateWorkspace = async () => {
    if (!user || !ticker || !companyName) return;

    setSaving(true);
    
    // Build the raw_data with both original and normalized data
    const rawData: Record<string, unknown> = {};
    if (parsedData) {
      rawData.original = { headers: parsedData.headers, rows: parsedData.rows };
    }
    if (normalizedData) {
      rawData.normalized = {
        years: normalizedData.years,
        metrics: normalizedData.metrics,
        orientation: normalizedData.orientation,
      };
      rawData.manualValues = manualValues;
    }
    
    const insertData = {
      user_id: user.id,
      ticker: ticker.toUpperCase(),
      company_name: companyName,
      industry: industry || null,
      template_type: templateType,
      raw_data: rawData,
      column_mappings: columnMappings,
    };
    const { error } = await supabase.from('analysis_workspaces').insert(insertData as never);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Workspace created', description: `${ticker} workspace is ready.` });
      setDialogOpen(false);
      resetForm();
      fetchWorkspaces();
    }
    setSaving(false);
  };

  const resetForm = () => {
    setTicker('');
    setCompanyName('');
    setIndustry('');
    setTemplateType('dcf');
    setParsedData(null);
    setNormalizedData(null);
    setColumnMappings({});
    setManualValues({});
    setShowMapping(false);
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
              <p className="text-sm text-muted-foreground">
                Manage your analysis workspaces
              </p>
            </div>

            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Workspace
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

                  <div className="space-y-2">
                    <Label>Upload Financial Data</Label>
                    <FileDropzone
                      onFileProcessed={handleFileProcessed}
                      onClear={handleClearFile}
                      currentFile={parsedData?.fileName || null}
                    />
                  </div>

                  {showMapping && parsedData && (
                    <DataMappingPanel
                      parsedData={parsedData}
                      onConfirm={handleConfirmMapping}
                      onCancel={handleClearFile}
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
                  className="flex items-center justify-between p-4 border border-border rounded-lg bg-card hover:bg-muted/30 transition-colors"
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
        </div>
      </main>
    </div>
  );
}
