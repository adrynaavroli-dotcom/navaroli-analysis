import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STANDARD_VARIABLES } from '@/types/valuation';
import type { ParsedFinancialData } from '@/lib/financial-parser';

interface UnmappedRowsPanelProps {
  data: ParsedFinancialData;
  manualMappings: Record<string, string>;
  onMappingChange: (originalLabel: string, variableKey: string | null) => void;
  onManualValueChange: (metric: string, year: string, value: number | null) => void;
  manualValues: Record<string, Record<string, number | null>>;
}

export function UnmappedRowsPanel({
  data,
  manualMappings,
  onMappingChange,
  onManualValueChange,
  manualValues,
}: UnmappedRowsPanelProps) {
  const groupedVariables = useMemo(() => {
    const groups: Record<string, typeof STANDARD_VARIABLES[number][]> = {};
    STANDARD_VARIABLES.forEach(v => {
      if (!groups[v.category]) groups[v.category] = [];
      groups[v.category].push(v);
    });
    return groups;
  }, []);

  // Get already used variables (from auto-mapped and manual)
  const usedVariables = useMemo(() => {
    const autoMapped = new Set(data.metrics.map(m => m.metric));
    const manuallyMapped = new Set(Object.values(manualMappings).filter(Boolean));
    return new Set([...autoMapped, ...manuallyMapped]);
  }, [data.metrics, manualMappings]);

  // Find metrics that are missing (not in auto-mapped or manual)
  const missingMetrics = useMemo(() => {
    return STANDARD_VARIABLES.filter(v => !usedVariables.has(v.key));
  }, [usedVariables]);

  const unmappedRows = data.unmappedRows.filter(
    row => !manualMappings[row.originalLabel]
  );

  if (unmappedRows.length === 0 && missingMetrics.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Unmapped rows from file */}
      {unmappedRows.length > 0 && (
        <div className="border border-border rounded-lg bg-card">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h4 className="font-medium">Unmapped Rows ({unmappedRows.length})</h4>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              These rows couldn't be auto-mapped. Assign them to variables or leave unmapped.
            </p>
          </div>
          
          <ScrollArea className="max-h-[250px]">
            <div className="p-4 space-y-3">
              {unmappedRows.slice(0, 20).map((row) => (
                <div
                  key={row.originalLabel}
                  className="flex items-center gap-4 p-3 rounded-lg border border-border bg-background"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{row.originalLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {Object.entries(row.values)
                        .filter(([k]) => /^(19|20)\d{2}$/.test(k))
                        .slice(0, 3)
                        .map(([k, v]) => `${k}: ${v ?? '—'}`)
                        .join(' • ')}
                    </p>
                  </div>
                  
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  
                  <div className="w-[200px] shrink-0">
                    <Select
                      value={manualMappings[row.originalLabel] || 'unmapped'}
                      onValueChange={(value) => 
                        onMappingChange(row.originalLabel, value === 'unmapped' ? null : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select variable..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unmapped">
                          <span className="text-muted-foreground">— Skip —</span>
                        </SelectItem>
                        {Object.entries(groupedVariables).map(([category, variables]) => (
                          <SelectGroup key={category}>
                            <SelectLabel>{category}</SelectLabel>
                            {variables.map((variable) => (
                              <SelectItem
                                key={variable.key}
                                value={variable.key}
                                disabled={usedVariables.has(variable.key)}
                              >
                                {variable.label}
                                {usedVariables.has(variable.key) && (
                                  <span className="text-xs text-muted-foreground ml-2">(used)</span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
              {unmappedRows.length > 20 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  And {unmappedRows.length - 20} more rows...
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Missing metrics - manual entry */}
      {missingMetrics.length > 0 && data.years.length > 0 && (
        <div className="border border-border rounded-lg bg-card">
          <div className="p-4 border-b border-border">
            <h4 className="font-medium">Missing Metrics (Optional)</h4>
            <p className="text-sm text-muted-foreground mt-1">
              These metrics weren't found in your file. Enter values manually or leave blank.
            </p>
          </div>
          
          <ScrollArea className="max-h-[300px]">
            <div className="p-4 space-y-4">
              {missingMetrics.slice(0, 10).map((metric) => (
                <div key={metric.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{metric.label}</span>
                      <Badge variant="outline" className="text-xs">{metric.category}</Badge>
                    </div>
                    {manualValues[metric.key] && Object.values(manualValues[metric.key]).some(v => v !== null) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          data.years.forEach(year => {
                            onManualValueChange(metric.key, year, null);
                          });
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {data.years.map(year => (
                      <div key={year} className="flex flex-col gap-1 min-w-[80px]">
                        <label className="text-xs text-muted-foreground">{year}</label>
                        <Input
                          type="number"
                          placeholder="—"
                          className="h-8 text-sm"
                          value={manualValues[metric.key]?.[year] ?? ''}
                          onChange={(e) => {
                            const value = e.target.value === '' ? null : parseFloat(e.target.value);
                            onManualValueChange(metric.key, year, value);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {missingMetrics.length > 10 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  And {missingMetrics.length - 10} more metrics...
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
