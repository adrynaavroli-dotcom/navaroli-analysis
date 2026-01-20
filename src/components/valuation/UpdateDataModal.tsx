import { useState, useCallback, useMemo } from 'react';
import { RefreshCw, Merge, Plus, Calendar, AlertTriangle, Check, Loader2, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ConsolidationPanel } from './ConsolidationPanel';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ConsolidatedYear, ConsolidationResult } from '@/lib/financial-consolidator';

interface UpdateDataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  ticker: string;
  existingYears: ConsolidatedYear[];
  onDataUpdated: () => void;
}

type MergeStrategy = 'replace' | 'merge_newer' | 'merge_all';

interface MergePreview {
  existingYears: string[];
  newYears: string[];
  overlappingYears: string[];
  resultYears: string[];
}

export function UpdateDataModal({
  open,
  onOpenChange,
  workspaceId,
  ticker,
  existingYears,
  onDataUpdated,
}: UpdateDataModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'upload' | 'preview'>('upload');
  const [newData, setNewData] = useState<ConsolidationResult | null>(null);
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('merge_newer');
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Calculate merge preview
  const mergePreview = useMemo((): MergePreview | null => {
    if (!newData) return null;

    const existingSet = new Set(existingYears.map(y => y.year));
    const newSet = new Set(newData.years.map(y => y.year));
    const overlapping = [...existingSet].filter(y => newSet.has(y));

    let resultYears: string[];
    switch (mergeStrategy) {
      case 'replace':
        resultYears = [...newSet];
        break;
      case 'merge_newer':
        // Keep existing, add new years, replace overlapping with new data
        resultYears = [...new Set([...existingSet, ...newSet])];
        break;
      case 'merge_all':
        // Keep existing for overlapping years, only add truly new years
        resultYears = [...new Set([...existingSet, ...newSet])];
        break;
      default:
        resultYears = [];
    }

    return {
      existingYears: [...existingSet].sort(),
      newYears: [...newSet].sort(),
      overlappingYears: overlapping.sort(),
      resultYears: resultYears.sort(),
    };
  }, [existingYears, newData, mergeStrategy]);

  // Initialize selected years when new data arrives
  const handleConsolidationConfirm = useCallback((result: ConsolidationResult) => {
    setNewData(result);
    setSelectedYears(new Set(result.years.map(y => y.year)));
    setActiveTab('preview');
  }, []);

  const handleCancelConsolidation = useCallback(() => {
    // Don't close the modal, just go back to upload tab
    setActiveTab('upload');
  }, []);

  // Merge data based on strategy
  const mergeData = useCallback((): ConsolidatedYear[] => {
    if (!newData) return existingYears;

    const existingMap = new Map(existingYears.map(y => [y.year, y]));
    const newMap = new Map(
      newData.years
        .filter(y => selectedYears.has(y.year))
        .map(y => [y.year, y])
    );

    const merged: ConsolidatedYear[] = [];

    // Get all unique years
    const allYears = new Set([...existingMap.keys(), ...newMap.keys()]);

    for (const year of [...allYears].sort()) {
      const existingYear = existingMap.get(year);
      const newYear = newMap.get(year);

      if (mergeStrategy === 'replace') {
        // Only use new data
        if (newYear) merged.push(newYear);
      } else if (mergeStrategy === 'merge_newer') {
        // Prefer new data for overlapping years
        merged.push(newYear || existingYear!);
      } else {
        // merge_all: Prefer existing data for overlapping years
        merged.push(existingYear || newYear!);
      }
    }

    return merged.sort((a, b) => a.year.localeCompare(b.year));
  }, [existingYears, newData, mergeStrategy, selectedYears]);

  const handleSave = async () => {
    setIsSaving(true);
    
    const mergedYears = mergeData();
    
    // Build updated raw_data
    const rawData = {
      consolidated: {
        years: mergedYears,
        calculatedMetrics: newData?.calculatedMetrics || [],
        warnings: newData?.warnings || [],
      },
      processedFiles: newData?.processedFiles.map(f => ({
        fileName: f.fileName,
        statementType: f.statementType,
        years: f.years,
        rowCount: f.rowCount,
      })) || [],
      lastUpdated: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('analysis_workspaces')
      .update({ raw_data: rawData as never })
      .eq('id', workspaceId);

    if (error) {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Data updated',
        description: `${mergedYears.length} years of data saved for ${ticker}`,
      });
      onDataUpdated();
      onOpenChange(false);
    }
    
    setIsSaving(false);
  };

  const toggleYear = (year: string) => {
    setSelectedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Update Financial Data - {ticker}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'upload' | 'preview')} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="upload" className="gap-2">
              <Plus className="h-4 w-4" />
              Add New Data
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-2" disabled={!newData}>
              <Merge className="h-4 w-4" />
              Merge Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="flex-1 overflow-auto mt-4">
            {/* Current data summary */}
            <Alert className="mb-4">
              <Calendar className="h-4 w-4" />
              <AlertDescription>
                <span className="font-medium">Current data:</span>{' '}
                {existingYears.length > 0 ? (
                  <>
                    {existingYears.length} years ({existingYears[0]?.year} - {existingYears[existingYears.length - 1]?.year})
                  </>
                ) : (
                  'No data loaded'
                )}
              </AlertDescription>
            </Alert>

            {/* AI Tips */}
            <div className="mb-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Tips for updating data</span>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Upload new quarterly/annual results to extend the series</li>
                <li>• Use JSON import for quick AI-assisted data entry</li>
                <li>• Select "Merge (Prefer New)" to update with latest results</li>
                <li>• Only selected years will be imported</li>
              </ul>
            </div>

            <ConsolidationPanel
              onConfirm={handleConsolidationConfirm}
              onCancel={handleCancelConsolidation}
            />
          </TabsContent>

          <TabsContent value="preview" className="flex-1 overflow-hidden mt-4 flex flex-col">
            {newData && mergePreview && (
              <>
                {/* Merge Strategy Selection */}
                <div className="mb-4 p-4 border border-border rounded-lg bg-muted/30">
                  <Label className="text-sm font-medium mb-3 block">Merge Strategy</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <Button
                      variant={mergeStrategy === 'replace' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setMergeStrategy('replace')}
                      className="h-auto py-2 flex-col"
                    >
                      <span className="font-medium">Replace All</span>
                      <span className="text-xs opacity-70">Discard existing data</span>
                    </Button>
                    <Button
                      variant={mergeStrategy === 'merge_newer' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setMergeStrategy('merge_newer')}
                      className="h-auto py-2 flex-col"
                    >
                      <span className="font-medium">Merge (Prefer New)</span>
                      <span className="text-xs opacity-70">Update overlapping years</span>
                    </Button>
                    <Button
                      variant={mergeStrategy === 'merge_all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setMergeStrategy('merge_all')}
                      className="h-auto py-2 flex-col"
                    >
                      <span className="font-medium">Merge (Preserve)</span>
                      <span className="text-xs opacity-70">Keep existing values</span>
                    </Button>
                  </div>
                </div>

                {/* Year Selection */}
                <div className="mb-4">
                  <Label className="text-sm font-medium mb-2 block">Select Years to Import</Label>
                  <ScrollArea className="h-32 border border-border rounded-lg p-3">
                    <div className="flex flex-wrap gap-2">
                      {newData.years.map(year => {
                        const isOverlapping = mergePreview.overlappingYears.includes(year.year);
                        const isSelected = selectedYears.has(year.year);
                        
                        return (
                          <div
                            key={year.year}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors ${
                              isSelected 
                                ? 'bg-primary text-primary-foreground border-primary' 
                                : 'bg-muted/50 border-border hover:bg-muted'
                            }`}
                            onClick={() => toggleYear(year.year)}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleYear(year.year)}
                              className="pointer-events-none"
                            />
                            <span className="text-sm font-mono">{year.year}</span>
                            {isOverlapping && (
                              <Badge variant="secondary" className="text-xs py-0">
                                overlap
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Merge Summary */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="p-3 border border-border rounded-lg text-center">
                    <p className="text-2xl font-semibold">{mergePreview.existingYears.length}</p>
                    <p className="text-xs text-muted-foreground">Existing Years</p>
                  </div>
                  <div className="p-3 border border-border rounded-lg text-center">
                    <p className="text-2xl font-semibold text-primary">{selectedYears.size}</p>
                    <p className="text-xs text-muted-foreground">Importing</p>
                  </div>
                  <div className="p-3 border border-border rounded-lg text-center">
                    <p className="text-2xl font-semibold text-amber-500">{mergePreview.overlappingYears.length}</p>
                    <p className="text-xs text-muted-foreground">Overlapping</p>
                  </div>
                  <div className="p-3 border border-border rounded-lg text-center bg-success/10">
                    <p className="text-2xl font-semibold text-success">{mergePreview.resultYears.length}</p>
                    <p className="text-xs text-muted-foreground">Final Result</p>
                  </div>
                </div>

                {/* Warnings */}
                {mergePreview.overlappingYears.length > 0 && mergeStrategy !== 'merge_all' && (
                  <Alert variant="default" className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {mergePreview.overlappingYears.length} year(s) will be {mergeStrategy === 'replace' ? 'replaced' : 'updated'}: {mergePreview.overlappingYears.join(', ')}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!newData || selectedYears.size === 0 || isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Save {selectedYears.size} Years
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
