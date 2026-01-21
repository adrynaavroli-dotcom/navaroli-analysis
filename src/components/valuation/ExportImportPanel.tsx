import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, Copy, Check, FileJson, AlertCircle, FileUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';
import type { AnalysisTemplateType } from '@/types/valuation';

interface ExportImportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: string;
  companyName: string;
  templateType: AnalysisTemplateType;
  years: ConsolidatedYear[];
  analystNotes?: string;
  marketInputs?: {
    currentPrice?: number | null;
    sharesOutstanding?: number | null;
    wacc?: number;
    terminalGrowth?: number;
  };
  onImport?: (data: ImportedData) => void;
}

export interface ExportedValuationData {
  version: string;
  exportedAt: string;
  metadata: {
    ticker: string;
    companyName: string;
    templateType: AnalysisTemplateType;
  };
  financialData: ConsolidatedYear[];
  analystNotes?: string;
  marketInputs?: {
    currentPrice?: number | null;
    sharesOutstanding?: number | null;
    wacc?: number;
    terminalGrowth?: number;
  };
}

export interface ImportedData {
  years: ConsolidatedYear[];
  analystNotes?: string;
  marketInputs?: {
    currentPrice?: number | null;
    sharesOutstanding?: number | null;
    wacc?: number;
    terminalGrowth?: number;
  };
}

export function ExportImportPanel({
  open,
  onOpenChange,
  ticker,
  companyName,
  templateType,
  years,
  analystNotes,
  marketInputs,
  onImport,
}: ExportImportPanelProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importPreview, setImportPreview] = useState<ExportedValuationData | null>(null);

  // Generate export data
  const exportData: ExportedValuationData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    metadata: {
      ticker,
      companyName,
      templateType,
    },
    financialData: years,
    analystNotes,
    marketInputs,
  };

  const exportJson = JSON.stringify(exportData, null, 2);

  const handleCopyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: 'Copied to clipboard',
        description: 'Valuation data copied successfully',
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      });
    }
  }, [exportJson, toast]);

  const handleDownloadJson = useCallback(() => {
    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker}_valuation_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Downloaded',
      description: `${ticker} valuation saved as JSON`,
    });
  }, [exportJson, ticker, toast]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportText(text);
      validateImport(text);
    };
    reader.readAsText(file);
  }, []);

  const validateImport = useCallback((text: string) => {
    setImportError(null);
    setImportPreview(null);

    if (!text.trim()) {
      return;
    }

    try {
      const data = JSON.parse(text) as ExportedValuationData;

      // Validate structure
      if (!data.version || !data.metadata || !data.financialData) {
        setImportError('Invalid file format. Missing required fields (version, metadata, financialData).');
        return;
      }

      if (!Array.isArray(data.financialData) || data.financialData.length === 0) {
        setImportError('No financial data found in file.');
        return;
      }

      // Validate each year has required fields
      for (const year of data.financialData) {
        if (!year.year) {
          setImportError('Invalid data: each record must have a "year" field.');
          return;
        }
      }

      setImportPreview(data);
    } catch {
      setImportError('Invalid JSON format. Please check the file contents.');
    }
  }, []);

  const handleImport = useCallback(() => {
    if (!importPreview || !onImport) return;

    onImport({
      years: importPreview.financialData,
      analystNotes: importPreview.analystNotes,
      marketInputs: importPreview.marketInputs,
    });

    toast({
      title: 'Import successful',
      description: `Loaded ${importPreview.financialData.length} years of data for ${importPreview.metadata.ticker}`,
    });

    onOpenChange(false);
    setImportText('');
    setImportPreview(null);
  }, [importPreview, onImport, toast, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Export / Import Valuation Data
          </DialogTitle>
          <DialogDescription>
            Save your analysis as JSON for backup or import previous analyses
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'export' | 'import')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{ticker}</p>
                <p className="text-sm text-muted-foreground">{companyName}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{years.length} years</Badge>
                <Badge variant="secondary">{templateType}</Badge>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Included data:</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">Financial Statements</Badge>
                {analystNotes && <Badge variant="outline" className="text-xs">Analyst Notes</Badge>}
                {marketInputs?.currentPrice && <Badge variant="outline" className="text-xs">Market Inputs</Badge>}
              </div>
            </div>

            <div className="relative">
              <Textarea
                value={exportJson}
                readOnly
                className="h-48 font-mono text-xs"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCopyToClipboard} variant="outline" className="flex-1">
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </Button>
              <Button onClick={handleDownloadJson} className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Download JSON
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" asChild className="flex-1">
                  <label className="cursor-pointer">
                    <FileUp className="h-4 w-4 mr-2" />
                    Select JSON File
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </Button>
              </div>

              <div className="text-center text-sm text-muted-foreground">or paste JSON below</div>

              <Textarea
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  validateImport(e.target.value);
                }}
                placeholder='{"version": "1.0", "metadata": {...}, "financialData": [...]}'
                className="h-40 font-mono text-xs"
              />

              {importError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{importError}</AlertDescription>
                </Alert>
              )}

              {importPreview && (
                <Alert>
                  <Check className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p className="font-medium">Valid file detected</p>
                      <p className="text-sm">
                        {importPreview.metadata.ticker} - {importPreview.metadata.companyName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {importPreview.financialData.length} years of data • 
                        Exported {new Date(importPreview.exportedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Button 
                onClick={handleImport} 
                disabled={!importPreview || !onImport}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Data
              </Button>

              {!onImport && (
                <p className="text-xs text-center text-muted-foreground">
                  Import is only available when creating a new workspace
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
