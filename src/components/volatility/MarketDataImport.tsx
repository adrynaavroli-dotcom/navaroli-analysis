import { useCallback, useState, useRef } from 'react';
import { Upload, FileSpreadsheet, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { importCSV, importXLSX, type ImportResult } from '@/lib/returns/import';
import { buildReturnsDataset } from '@/lib/returns/pipeline';
import type { VolatilityDataset } from '@/hooks/useVolatilityData';

interface MarketDataImportProps {
  onImported: (dataset: VolatilityDataset) => void;
}

export function MarketDataImport({ onImported }: MarketDataImportProps) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let r: ImportResult;
      if (ext === 'csv' || ext === 'txt') {
        const text = await file.text();
        r = importCSV(text, { fileName: file.name });
      } else {
        const buf = await file.arrayBuffer();
        r = importXLSX(buf, { fileName: file.name });
      }
      setResult(r);
      if (r.ok && r.raw && r.metadata) {
        const ds = buildReturnsDataset(r.raw, r.metadata, 'log');
        onImported({
          ticker: r.metadata.ticker,
          currency: r.metadata.currency,
          prices: ds.prices,
          returns: ds.returns,
          report: ds.report,
          priceField: ds.metadata.priceField,
          flags: ds.flags,
        });
      }
    } finally {
      setIsProcessing(false);
    }
  }, [onImported]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  }, [processFile]);

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
    e.target.value = '';
  }, [processFile]);

  const clear = () => { setResult(null); };

  const rep = result?.report;
  const issues = rep?.issues ?? [];
  const errors = issues.filter((i) => ['MISSING_DATE_COLUMN', 'MISSING_PRICE_COLUMN', 'EMPTY_FILE', 'MULTIPLE_TICKERS'].includes(i.code));
  const warnings = issues.filter((i) => !errors.includes(i));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import CSV / Excel</CardTitle>
        <CardDescription>
          Upload a file with columns <code className="text-xs bg-muted px-1 rounded">Date</code> and{' '}
          <code className="text-xs bg-muted px-1 rounded">Close</code> (optionally{' '}
          <code className="text-xs bg-muted px-1 rounded">Adj Close</code> and{' '}
          <code className="text-xs bg-muted px-1 rounded">Ticker</code>).
          Dates in ISO format (YYYY-MM-DD) are best; unambiguous DD/MM/YYYY or MM/DD/YYYY are accepted.
          One ticker per file.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
              isProcessing && 'opacity-50 pointer-events-none',
            )}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleSelect} className="hidden" disabled={isProcessing} />
            <Upload className={cn('h-8 w-8 mx-auto mb-3', isDragging ? 'text-primary' : 'text-muted-foreground')} />
            <p className="text-sm font-medium">{isProcessing ? 'Processing…' : 'Drop a CSV or Excel file here'}</p>
            <p className="text-xs text-muted-foreground mt-1">or click to browse • .csv .xlsx .xls</p>
          </div>
        )}

        {rep && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {result!.ok ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <AlertTriangle className="h-5 w-5 text-destructive" />}
                <span className="font-medium text-sm">{rep.fileName}</span>
                {result!.ok && <Badge variant="default">{rep.rowsAccepted} prices imported</Badge>}
              </div>
              <Button variant="ghost" size="sm" onClick={clear}><X className="h-4 w-4" /></Button>
            </div>

            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
              <span>Rows read: {rep.rowsRead}</span>
              <span>Accepted: {rep.rowsAccepted}</span>
              <span className={rep.rowsRejected > 0 ? 'text-destructive' : ''}>Rejected: {rep.rowsRejected}</span>
              <span>Date format: {rep.dateFormat}</span>
              {rep.columns.date && <span>Date col: {rep.columns.date}</span>}
              {rep.columns.close && <span>Price col: {rep.columns.close}</span>}
              {rep.columns.adjclose && <span>Adj close col: {rep.columns.adjclose}</span>}
              {rep.tickers.length > 0 && <span>Ticker: {rep.tickers.join(', ')}</span>}
            </div>

            {errors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive space-y-1">
                {errors.map((e, i) => <p key={i}>• {e.detail}</p>)}
              </div>
            )}

            {warnings.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  {warnings.length} warning{warnings.length > 1 ? 's' : ''} (click to expand)
                </summary>
                <ul className="mt-1 space-y-0.5 text-muted-foreground max-h-40 overflow-y-auto">
                  {warnings.slice(0, 50).map((w, i) => (
                    <li key={i}>{w.row ? `Row ${w.row}: ` : ''}{w.code} — {w.detail}</li>
                  ))}
                  {warnings.length > 50 && <li>… and {warnings.length - 50} more</li>}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
