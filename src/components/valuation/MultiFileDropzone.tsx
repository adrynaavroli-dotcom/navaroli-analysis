import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ParsedFileData } from '@/types/valuation';
import { processFile, getStatementTypeLabel, type ProcessedFile } from '@/lib/financial-consolidator';

interface MultiFileDropzoneProps {
  onFilesProcessed: (files: ProcessedFile[]) => void;
  onClear: () => void;
  processedFiles: ProcessedFile[];
}

export function MultiFileDropzone({ onFilesProcessed, onClear, processedFiles }: MultiFileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processExcelFile = useCallback(async (file: File): Promise<ParsedFileData | null> => {
    try {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
      ];
      
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!validTypes.includes(file.type) && !['xlsx', 'xls', 'csv'].includes(extension || '')) {
        throw new Error(`${file.name}: Invalid file type`);
      }

      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { 
        header: 1,
        defval: null 
      });

      if (jsonData.length < 2) {
        throw new Error(`${file.name}: Must contain at least header and one data row`);
      }

      const headerRow = jsonData[0] as unknown[];
      const headers = headerRow.map((h, i) => 
        h ? String(h).trim() : `Column_${i + 1}`
      );
      
      const rows = jsonData.slice(1).map((row) => {
        const rowArray = row as unknown[];
        const rowObj: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          rowObj[header] = rowArray[index] ?? null;
        });
        return rowObj;
      }).filter(row => Object.values(row).some(v => v !== null));

      return {
        headers,
        rows,
        fileName: file.name,
      };
    } catch (err) {
      throw err;
    }
  }, []);

  const handleFiles = useCallback(async (files: FileList) => {
    setIsProcessing(true);
    setError(null);

    try {
      const fileArray = Array.from(files).slice(0, 5); // Max 5 files
      const processedResults: ProcessedFile[] = [];

      for (const file of fileArray) {
        const parsed = await processExcelFile(file);
        if (parsed) {
          const processed = processFile(parsed.headers, parsed.rows, parsed.fileName);
          processedResults.push(processed);
        }
      }

      if (processedResults.length === 0) {
        throw new Error('No valid files were processed');
      }

      onFilesProcessed(processedResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process files');
    } finally {
      setIsProcessing(false);
    }
  }, [processExcelFile, onFilesProcessed]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
    e.target.value = '';
  }, [handleFiles]);

  const getStatementIcon = (type: string) => {
    if (type === 'income_statement') return '📊';
    if (type === 'balance_sheet') return '📋';
    if (type === 'cash_flow') return '💵';
    return '📄';
  };

  if (processedFiles.length > 0) {
    return (
      <div className="border border-border rounded-lg bg-card">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span className="font-medium">{processedFiles.length} file(s) loaded</span>
            </div>
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          </div>
        </div>
        <div className="p-4 space-y-2">
          {processedFiles.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-lg">{getStatementIcon(file.statementType)}</span>
                <div>
                  <p className="text-sm font-medium">{file.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.rowCount} rows • {file.years.length} years
                  </p>
                </div>
              </div>
              <Badge variant={file.statementType === 'unknown' ? 'secondary' : 'default'}>
                {getStatementTypeLabel(file.statementType)}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
        isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        isProcessing && "opacity-50 pointer-events-none"
      )}
    >
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileSelect}
        className="hidden"
        id="multi-file-upload"
        disabled={isProcessing}
        multiple
      />
      <label htmlFor="multi-file-upload" className="cursor-pointer">
        <Upload className={cn(
          "h-10 w-10 mx-auto mb-4",
          isDragging ? "text-primary" : "text-muted-foreground"
        )} />
        <p className="text-sm font-medium mb-1">
          {isProcessing ? 'Processing...' : 'Drop your financial statements here'}
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          or click to browse • XLSX, XLS, CSV supported
        </p>
        <div className="flex justify-center gap-2 flex-wrap">
          <Badge variant="outline">Income Statement</Badge>
          <Badge variant="outline">Balance Sheet</Badge>
          <Badge variant="outline">Cash Flow</Badge>
        </div>
      </label>
      {error && (
        <p className="text-xs text-destructive mt-3">{error}</p>
      )}
    </div>
  );
}
