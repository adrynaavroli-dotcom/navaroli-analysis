import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ParsedFileData } from '@/types/valuation';

interface FileDropzoneProps {
  onFileProcessed: (data: ParsedFileData) => void;
  onClear: () => void;
  currentFile: string | null;
}

export function FileDropzone({ onFileProcessed, onClear, currentFile }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
      ];
      
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!validTypes.includes(file.type) && !['xlsx', 'xls', 'csv'].includes(extension || '')) {
        throw new Error('Please upload an Excel (.xlsx, .xls) or CSV file');
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
        throw new Error('File must contain at least a header row and one data row');
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

      onFileProcessed({
        headers,
        rows,
        fileName: file.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file');
    } finally {
      setIsProcessing(false);
    }
  }, [onFileProcessed]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

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
      processFile(files[0]);
    }
    e.target.value = '';
  }, [processFile]);

  if (currentFile) {
    return (
      <div className="border border-border rounded-lg p-4 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-primary" />
            <div>
              <p className="font-medium text-sm">{currentFile}</p>
              <p className="text-xs text-muted-foreground">File loaded successfully</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
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
        id="file-upload"
        disabled={isProcessing}
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        <Upload className={cn(
          "h-10 w-10 mx-auto mb-4",
          isDragging ? "text-primary" : "text-muted-foreground"
        )} />
        <p className="text-sm font-medium mb-1">
          {isProcessing ? 'Processing...' : 'Drop your Excel or CSV file here'}
        </p>
        <p className="text-xs text-muted-foreground">
          or click to browse • XLSX, XLS, CSV supported
        </p>
      </label>
      {error && (
        <p className="text-xs text-destructive mt-3">{error}</p>
      )}
    </div>
  );
}
