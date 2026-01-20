import { useState, useMemo, useCallback, useEffect } from 'react';
import { Check, X, Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ParsedFileData, StandardVariableKey } from '@/types/valuation';
import { parseFinancialData, type ParsedFinancialData } from '@/lib/financial-parser';
import { DataPreviewTable } from './DataPreviewTable';
import { UnmappedRowsPanel } from './UnmappedRowsPanel';

interface DataMappingPanelProps {
  parsedData: ParsedFileData;
  onConfirm: (data: {
    normalizedData: ParsedFinancialData;
    manualMappings: Record<string, string>;
    manualValues: Record<string, Record<string, number | null>>;
  }) => void;
  onCancel: () => void;
}

export function DataMappingPanel({
  parsedData,
  onConfirm,
  onCancel,
}: DataMappingPanelProps) {
  const [isProcessing, setIsProcessing] = useState(true);
  const [normalizedData, setNormalizedData] = useState<ParsedFinancialData | null>(null);
  const [manualMappings, setManualMappings] = useState<Record<string, string>>({});
  const [manualValues, setManualValues] = useState<Record<string, Record<string, number | null>>>({});
  const [activeTab, setActiveTab] = useState('preview');

  // Parse and normalize data on mount
  useEffect(() => {
    setIsProcessing(true);
    
    // Use setTimeout to allow UI to update
    const timer = setTimeout(() => {
      const result = parseFinancialData(parsedData.headers, parsedData.rows);
      setNormalizedData(result);
      setIsProcessing(false);
      
      // If there are unmapped rows, switch to mapping tab
      if (result.unmappedRows.length > 0 && result.metrics.length === 0) {
        setActiveTab('mapping');
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [parsedData]);

  const handleMappingChange = useCallback((originalLabel: string, variableKey: string | null) => {
    setManualMappings(prev => {
      const next = { ...prev };
      if (variableKey === null) {
        delete next[originalLabel];
      } else {
        next[originalLabel] = variableKey;
      }
      return next;
    });
  }, []);

  const handleManualValueChange = useCallback((metric: string, year: string, value: number | null) => {
    setManualValues(prev => ({
      ...prev,
      [metric]: {
        ...(prev[metric] || {}),
        [year]: value,
      },
    }));
  }, []);

  const handleConfirm = useCallback(() => {
    if (!normalizedData) return;
    onConfirm({
      normalizedData,
      manualMappings,
      manualValues,
    });
  }, [normalizedData, manualMappings, manualValues, onConfirm]);

  const stats = useMemo(() => {
    if (!normalizedData) return { autoMapped: 0, manualMapped: 0, unmapped: 0 };
    
    const autoMapped = normalizedData.metrics.length;
    const manualMapped = Object.keys(manualMappings).length;
    const unmapped = normalizedData.unmappedRows.length - manualMapped;
    
    return { autoMapped, manualMapped, unmapped };
  }, [normalizedData, manualMappings]);

  if (isProcessing) {
    return (
      <div className="border border-border rounded-lg bg-card p-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center">
            <p className="font-medium">Analyzing Financial Data...</p>
            <p className="text-sm text-muted-foreground">
              Detecting format and normalizing metrics
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!normalizedData) {
    return (
      <div className="border border-border rounded-lg bg-card p-6 text-center">
        <p className="text-destructive">Failed to parse financial data</p>
        <Button variant="outline" size="sm" onClick={onCancel} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Smart Data Mapping</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {normalizedData.orientation === 'years-in-columns' 
                ? `Detected ${normalizedData.years.length} years of data`
                : 'Manual mapping required'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={stats.autoMapped + stats.manualMapped === 0}>
              <Check className="h-4 w-4 mr-1" />
              Confirm Mapping
            </Button>
          </div>
        </div>

        {/* Stats badges */}
        <div className="flex gap-2">
          <Badge variant="default" className="gap-1">
            <Check className="h-3 w-3" />
            {stats.autoMapped} Auto-mapped
          </Badge>
          {stats.manualMapped > 0 && (
            <Badge variant="secondary" className="gap-1">
              {stats.manualMapped} Manual
            </Badge>
          )}
          {stats.unmapped > 0 && (
            <Badge variant="outline" className="gap-1">
              {stats.unmapped} Unmapped
            </Badge>
          )}
          {normalizedData.years.length > 0 && (
            <Badge variant="outline">
              {normalizedData.years[0]} - {normalizedData.years[normalizedData.years.length - 1]}
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b border-border px-4">
          <TabsList className="h-12 w-full justify-start bg-transparent">
            <TabsTrigger value="preview" className="data-[state=active]:bg-muted">
              Preview Table
            </TabsTrigger>
            <TabsTrigger value="mapping" className="data-[state=active]:bg-muted">
              Map & Fill Missing
              {stats.unmapped > 0 && (
                <Badge variant="secondary" className="ml-2 h-5">
                  {stats.unmapped}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="preview" className="p-4 mt-0">
          <DataPreviewTable 
            data={normalizedData} 
            manualMappings={manualMappings}
          />
        </TabsContent>

        <TabsContent value="mapping" className="p-4 mt-0">
          <UnmappedRowsPanel
            data={normalizedData}
            manualMappings={manualMappings}
            onMappingChange={handleMappingChange}
            onManualValueChange={handleManualValueChange}
            manualValues={manualValues}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
