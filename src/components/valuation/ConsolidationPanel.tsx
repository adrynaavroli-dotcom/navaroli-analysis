import { useState, useMemo, useCallback, useEffect } from 'react';
import { Check, X, Loader2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MultiFileDropzone } from './MultiFileDropzone';
import { ProcessingStatus } from './ProcessingStatus';
import { HistoricalDataTable } from './HistoricalDataTable';
import { JsonDataInput } from './JsonDataInput';
import { DataFormatHelp } from './DataFormatHelp';
import { consolidateFiles, type ProcessedFile, type ConsolidationResult, type ConsolidatedYear } from '@/lib/financial-consolidator';
import type { AnalysisTemplateType } from '@/types/valuation';

interface ConsolidationPanelProps {
  onConfirm: (result: ConsolidationResult) => void;
  onCancel: () => void;
  templateType?: AnalysisTemplateType;
}

export function ConsolidationPanel({ onConfirm, onCancel, templateType = 'dcf' }: ConsolidationPanelProps) {
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [consolidationResult, setConsolidationResult] = useState<ConsolidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');

  const handleFilesProcessed = useCallback((files: ProcessedFile[]) => {
    setProcessedFiles(files);
    setConsolidationResult(null);
  }, []);

  const handleClear = useCallback(() => {
    setProcessedFiles([]);
    setConsolidationResult(null);
    setActiveTab('upload');
  }, []);

  // Auto-consolidate when files change
  useEffect(() => {
    if (processedFiles.length > 0) {
      setIsProcessing(true);
      // Small delay to show loading state
      const timer = setTimeout(() => {
        const result = consolidateFiles(processedFiles);
        setConsolidationResult(result);
        setIsProcessing(false);
        setActiveTab('preview');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [processedFiles]);

  // Handle JSON import
  const handleJsonImport = useCallback((years: ConsolidatedYear[]) => {
    const result: ConsolidationResult = {
      years,
      processedFiles: [],
      calculatedMetrics: [],
      warnings: [],
    };
    setConsolidationResult(result);
    setActiveTab('preview');
  }, []);

  const handleConfirm = useCallback(() => {
    if (consolidationResult) {
      onConfirm(consolidationResult);
    }
  }, [consolidationResult, onConfirm]);

  const stats = useMemo(() => {
    if (!consolidationResult) return null;
    
    const totalMetrics = consolidationResult.years.length > 0 
      ? Object.keys(consolidationResult.years[0]).filter(k => k !== 'year').length
      : 0;
    
    const populatedMetrics = consolidationResult.years.length > 0
      ? Object.entries(consolidationResult.years[0])
          .filter(([k, v]) => k !== 'year' && v !== null).length
      : 0;
    
    return {
      years: consolidationResult.years.length,
      files: consolidationResult.processedFiles.length,
      metrics: populatedMetrics,
      totalMetrics,
      calculated: consolidationResult.calculatedMetrics.length,
      warnings: consolidationResult.warnings.length,
    };
  }, [consolidationResult]);

  return (
    <div className="border border-border rounded-lg bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Financial Data Consolidation</h3>
              <DataFormatHelp templateType={templateType} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Upload Income Statement, Balance Sheet, and Cash Flow files
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={handleConfirm} 
              disabled={!consolidationResult || consolidationResult.years.length === 0}
            >
              <Check className="h-4 w-4 mr-1" />
              Save Consolidated Data
            </Button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Files:</span>{' '}
              <span className="font-medium">{stats.files}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Years:</span>{' '}
              <span className="font-medium">{stats.years}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Metrics:</span>{' '}
              <span className="font-medium">{stats.metrics}/{stats.totalMetrics}</span>
            </div>
            {stats.calculated > 0 && (
              <div>
                <span className="text-muted-foreground">Calculated:</span>{' '}
                <span className="font-medium text-primary">{stats.calculated}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b border-border px-4">
          <TabsList className="h-12 w-full justify-start bg-transparent">
            <TabsTrigger value="upload" className="data-[state=active]:bg-muted">
              Upload Files
            </TabsTrigger>
            <TabsTrigger 
              value="preview" 
              className="data-[state=active]:bg-muted"
              disabled={!consolidationResult}
            >
              Historical View
            </TabsTrigger>
            <TabsTrigger 
              value="status" 
              className="data-[state=active]:bg-muted"
              disabled={processedFiles.length === 0}
            >
              Status
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="upload" className="p-4 mt-0">
          <Tabs defaultValue="files" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="files">Upload Files</TabsTrigger>
              <TabsTrigger value="json">JSON Import</TabsTrigger>
            </TabsList>
            
            <TabsContent value="files">
              <MultiFileDropzone
                onFilesProcessed={handleFilesProcessed}
                onClear={handleClear}
                processedFiles={processedFiles}
              />
            </TabsContent>
            
            <TabsContent value="json">
              <JsonDataInput onDataImport={handleJsonImport} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="preview" className="p-4 mt-0">
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Consolidating financial data...</p>
            </div>
          ) : consolidationResult ? (
            <HistoricalDataTable 
              years={consolidationResult.years} 
              calculatedMetrics={consolidationResult.calculatedMetrics}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Upload files to preview consolidated data
            </div>
          )}
        </TabsContent>

        <TabsContent value="status" className="p-4 mt-0">
          <ProcessingStatus
            processedFiles={processedFiles}
            isConsolidated={!!consolidationResult}
            warnings={consolidationResult?.warnings || []}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
