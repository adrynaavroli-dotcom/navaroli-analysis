import { useState, useCallback } from 'react';
import { AlertCircle, Check, FileJson, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface JsonDataInputProps {
  onDataImport: (years: ConsolidatedYear[]) => void;
}

// Template for JSON structure
const JSON_TEMPLATE: Partial<ConsolidatedYear>[] = [
  {
    year: "2023",
    revenue: null,
    cogs: null,
    gross_profit: null,
    operating_expenses: null,
    ebitda: null,
    depreciation: null,
    ebit: null,
    interest_expense: null,
    net_income: null,
    cash: null,
    accounts_receivable: null,
    inventory: null,
    total_assets: null,
    accounts_payable: null,
    total_debt: null,
    short_term_debt: null,
    long_term_debt: null,
    total_equity: null,
    operating_cash_flow: null,
    capex: null,
    free_cash_flow: null,
    shares_outstanding: null,
    eps: null,
    net_debt: null,
  }
];

function validateJsonStructure(data: unknown): { valid: boolean; errors: string[]; years: ConsolidatedYear[] } {
  const errors: string[] = [];
  const years: ConsolidatedYear[] = [];
  
  if (!Array.isArray(data)) {
    errors.push('JSON must be an array of year objects');
    return { valid: false, errors, years };
  }
  
  if (data.length === 0) {
    errors.push('JSON array must contain at least one year');
    return { valid: false, errors, years };
  }
  
  const requiredField = 'year';
  const numericFields = [
    'revenue', 'cogs', 'gross_profit', 'operating_expenses', 'ebitda',
    'depreciation', 'ebit', 'interest_expense', 'net_income', 'cash',
    'accounts_receivable', 'inventory', 'total_assets', 'accounts_payable',
    'total_debt', 'short_term_debt', 'long_term_debt', 'total_equity',
    'operating_cash_flow', 'capex', 'free_cash_flow', 'shares_outstanding',
    'eps', 'net_debt'
  ];
  
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    
    if (typeof item !== 'object' || item === null) {
      errors.push(`Item at index ${i} must be an object`);
      continue;
    }
    
    const record = item as Record<string, unknown>;
    
    // Check required field
    if (!record[requiredField] || typeof record[requiredField] !== 'string') {
      errors.push(`Item at index ${i}: missing or invalid 'year' field (must be a string like "2023")`);
      continue;
    }
    
    // Build year object with defaults
    const yearData: ConsolidatedYear = {
      year: String(record.year),
      revenue: null,
      cogs: null,
      gross_profit: null,
      operating_expenses: null,
      ebitda: null,
      depreciation: null,
      ebit: null,
      interest_expense: null,
      net_income: null,
      cash: null,
      accounts_receivable: null,
      inventory: null,
      total_assets: null,
      accounts_payable: null,
      total_debt: null,
      short_term_debt: null,
      long_term_debt: null,
      total_equity: null,
      operating_cash_flow: null,
      capex: null,
      free_cash_flow: null,
      shares_outstanding: null,
      eps: null,
      net_debt: null,
    };
    
    // Process numeric fields
    for (const field of numericFields) {
      const value = record[field];
      if (value === null || value === undefined || value === '') {
        yearData[field as keyof ConsolidatedYear] = null as never;
      } else if (typeof value === 'number') {
        yearData[field as keyof ConsolidatedYear] = value as never;
      } else if (typeof value === 'string') {
        // Try to parse string as number
        const parsed = parseFloat(value.replace(/[,$]/g, ''));
        yearData[field as keyof ConsolidatedYear] = (isNaN(parsed) ? null : parsed) as never;
      }
    }
    
    years.push(yearData);
  }
  
  if (years.length === 0) {
    errors.push('No valid year records found');
    return { valid: false, errors, years };
  }
  
  // Sort years
  years.sort((a, b) => a.year.localeCompare(b.year));
  
  return { valid: errors.length === 0, errors, years };
}

export function JsonDataInput({ onDataImport }: JsonDataInputProps) {
  const [jsonInput, setJsonInput] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);
  
  const handleValidate = useCallback(() => {
    setErrors([]);
    setSuccess(false);
    
    if (!jsonInput.trim()) {
      setErrors(['Please enter JSON data']);
      return;
    }
    
    try {
      const parsed = JSON.parse(jsonInput);
      const result = validateJsonStructure(parsed);
      
      if (result.valid) {
        setSuccess(true);
        onDataImport(result.years);
      } else {
        setErrors(result.errors);
      }
    } catch (e) {
      setErrors([`Invalid JSON syntax: ${e instanceof Error ? e.message : 'Unknown error'}`]);
    }
  }, [jsonInput, onDataImport]);
  
  const handleCopyTemplate = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(JSON_TEMPLATE, null, 2));
  }, []);
  
  const handleDownloadTemplate = useCallback(() => {
    const blob = new Blob([JSON.stringify(JSON_TEMPLATE, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'financial-data-template.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileJson className="h-5 w-5 text-primary" />
          <h4 className="font-medium">JSON Data Import</h4>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyTemplate}>
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy Template
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Download Template
          </Button>
        </div>
      </div>
      
      <p className="text-sm text-muted-foreground">
        Paste financial data as JSON array. Use the template to see the expected structure.
        This is useful for integrating with AI tools or custom data sources.
      </p>
      
      <Textarea
        value={jsonInput}
        onChange={(e) => {
          setJsonInput(e.target.value);
          setErrors([]);
          setSuccess(false);
        }}
        placeholder={`[
  {
    "year": "2023",
    "revenue": 29771000000,
    "net_income": 4246000000,
    "total_assets": 82166000000,
    "free_cash_flow": 4220000000,
    ...
  },
  {
    "year": "2022",
    ...
  }
]`}
        className="font-mono text-sm min-h-[200px]"
      />
      
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      
      {success && (
        <Alert className="border-green-500 bg-green-500/10">
          <Check className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-green-600">
            JSON data imported successfully!
          </AlertDescription>
        </Alert>
      )}
      
      <Button onClick={handleValidate} className="w-full">
        Validate & Import JSON
      </Button>
    </div>
  );
}