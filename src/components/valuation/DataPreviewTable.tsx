import { useMemo } from 'react';
import { Check, AlertCircle, HelpCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { STANDARD_VARIABLES } from '@/types/valuation';
import type { ParsedFinancialData } from '@/lib/financial-parser';
import { formatFinancialNumber } from '@/lib/financial-parser';

interface DataPreviewTableProps {
  data: ParsedFinancialData;
  manualMappings: Record<string, string>;
}

export function DataPreviewTable({ data, manualMappings }: DataPreviewTableProps) {
  const allMetrics = useMemo(() => {
    const mapped = data.metrics.map(m => ({
      key: m.metric,
      label: STANDARD_VARIABLES.find(v => v.key === m.metric)?.label || m.metric,
      originalLabel: m.originalLabel,
      values: m.values,
      status: 'auto' as const,
    }));
    
    // Add manually mapped unmapped rows
    const manuallyMapped = data.unmappedRows
      .filter(row => manualMappings[row.originalLabel])
      .map(row => ({
        key: manualMappings[row.originalLabel],
        label: STANDARD_VARIABLES.find(v => v.key === manualMappings[row.originalLabel])?.label || manualMappings[row.originalLabel],
        originalLabel: row.originalLabel,
        values: row.values as Record<string, number | null>,
        status: 'manual' as const,
      }));
    
    return [...mapped, ...manuallyMapped];
  }, [data, manualMappings]);

  const unmappedCount = data.unmappedRows.filter(
    row => !manualMappings[row.originalLabel]
  ).length;

  if (data.years.length === 0) {
    return (
      <div className="border border-border rounded-lg p-6 bg-card text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Could not detect year columns. Please check your file format.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Normalized Data Preview</h3>
            <p className="text-sm text-muted-foreground">
              {allMetrics.length} metrics mapped across {data.years.length} years
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="gap-1">
              <Check className="h-3 w-3" />
              {data.metrics.length} Auto-mapped
            </Badge>
            {unmappedCount > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="gap-1 cursor-help">
                      <HelpCircle className="h-3 w-3" />
                      {unmappedCount} Unmapped
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      Some rows couldn't be auto-mapped. You can map them manually below.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>

      <ScrollArea className="max-h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px] sticky left-0 bg-background z-10">
                Metric
              </TableHead>
              <TableHead className="w-[180px]">
                Original Label
              </TableHead>
              {data.years.map(year => (
                <TableHead key={year} className="text-right min-w-[100px]">
                  {year}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {allMetrics.map((metric, idx) => (
              <TableRow key={`${metric.key}-${idx}`}>
                <TableCell className="font-medium sticky left-0 bg-background z-10">
                  <div className="flex items-center gap-2">
                    {metric.status === 'auto' ? (
                      <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    ) : (
                      <Badge variant="secondary" className="text-xs px-1.5">
                        Manual
                      </Badge>
                    )}
                    <span className="truncate">{metric.label}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm truncate max-w-[180px]">
                  {metric.originalLabel}
                </TableCell>
                {data.years.map(year => (
                  <TableCell key={year} className="text-right font-mono text-sm">
                    {formatFinancialNumber(metric.values[year])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            
            {allMetrics.length === 0 && (
              <TableRow>
                <TableCell colSpan={data.years.length + 2} className="text-center py-8">
                  <p className="text-muted-foreground">No metrics mapped yet</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
