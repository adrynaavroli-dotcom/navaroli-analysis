import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessedFile, StatementType } from '@/lib/financial-consolidator';

interface ProcessingStatusProps {
  processedFiles: ProcessedFile[];
  isConsolidated: boolean;
  warnings: string[];
}

interface StatusItem {
  label: string;
  type: StatementType;
  detected: boolean;
  fileName?: string;
  metrics?: number;
}

export function ProcessingStatus({ processedFiles, isConsolidated, warnings }: ProcessingStatusProps) {
  const statements: StatusItem[] = [
    {
      label: 'Income Statement',
      type: 'income_statement',
      detected: processedFiles.some(f => f.statementType === 'income_statement'),
      fileName: processedFiles.find(f => f.statementType === 'income_statement')?.fileName,
      metrics: processedFiles.find(f => f.statementType === 'income_statement')?.metrics.size,
    },
    {
      label: 'Balance Sheet',
      type: 'balance_sheet',
      detected: processedFiles.some(f => f.statementType === 'balance_sheet'),
      fileName: processedFiles.find(f => f.statementType === 'balance_sheet')?.fileName,
      metrics: processedFiles.find(f => f.statementType === 'balance_sheet')?.metrics.size,
    },
    {
      label: 'Cash Flow Statement',
      type: 'cash_flow',
      detected: processedFiles.some(f => f.statementType === 'cash_flow'),
      fileName: processedFiles.find(f => f.statementType === 'cash_flow')?.fileName,
      metrics: processedFiles.find(f => f.statementType === 'cash_flow')?.metrics.size,
    },
  ];

  const unknownFiles = processedFiles.filter(f => f.statementType === 'unknown');

  return (
    <div className="border border-border rounded-lg bg-card">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold text-sm">Processing Status</h3>
      </div>
      <div className="p-4 space-y-3">
        {statements.map((item) => (
          <div key={item.type} className="flex items-start gap-3">
            {item.detected ? (
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-medium",
                item.detected ? "text-foreground" : "text-muted-foreground"
              )}>
                {item.label}
              </p>
              {item.detected && item.fileName && (
                <p className="text-xs text-muted-foreground truncate">
                  {item.fileName} • {item.metrics} metrics
                </p>
              )}
            </div>
          </div>
        ))}

        <div className="pt-2 border-t border-border">
          <div className="flex items-start gap-3">
            {isConsolidated ? (
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={cn(
                "text-sm font-medium",
                isConsolidated ? "text-foreground" : "text-muted-foreground"
              )}>
                Consolidation Complete
              </p>
              {isConsolidated && (
                <p className="text-xs text-muted-foreground">
                  Data merged by fiscal year
                </p>
              )}
            </div>
          </div>
        </div>

        {unknownFiles.length > 0 && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-600">
                  {unknownFiles.length} unidentified file(s)
                </p>
                <p className="text-xs text-muted-foreground">
                  {unknownFiles.map(f => f.fileName).join(', ')}
                </p>
              </div>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="pt-2 border-t border-border space-y-1">
            {warnings.map((warning, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-yellow-600">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
