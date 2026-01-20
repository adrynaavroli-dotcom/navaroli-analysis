import { useState, useMemo } from 'react';
import { ArrowRight, Check, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { STANDARD_VARIABLES, type ParsedFileData } from '@/types/valuation';

interface DataMappingPanelProps {
  parsedData: ParsedFileData;
  mappings: Record<string, string>;
  onMappingChange: (columnName: string, variableKey: string | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DataMappingPanel({
  parsedData,
  mappings,
  onMappingChange,
  onConfirm,
  onCancel,
}: DataMappingPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredHeaders = useMemo(() => {
    if (!searchTerm) return parsedData.headers;
    return parsedData.headers.filter(h => 
      h.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [parsedData.headers, searchTerm]);

  const groupedVariables = useMemo(() => {
    const groups: Record<string, typeof STANDARD_VARIABLES[number][]> = {};
    STANDARD_VARIABLES.forEach(v => {
      if (!groups[v.category]) groups[v.category] = [];
      groups[v.category].push(v);
    });
    return groups;
  }, []);

  const usedVariables = useMemo(() => {
    return new Set(Object.values(mappings).filter(Boolean));
  }, [mappings]);

  const mappedCount = Object.values(mappings).filter(Boolean).length;

  const getSampleValue = (header: string) => {
    for (const row of parsedData.rows.slice(0, 3)) {
      const value = row[header];
      if (value !== null && value !== undefined && value !== '') {
        return String(value);
      }
    }
    return '—';
  };

  return (
    <div className="border border-border rounded-lg bg-card">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold">Map Columns to Variables</h3>
            <p className="text-sm text-muted-foreground">
              {parsedData.headers.length} columns detected • {mappedCount} mapped
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={onConfirm} disabled={mappedCount === 0}>
              <Check className="h-4 w-4 mr-1" />
              Confirm Mapping
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search columns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="p-4 space-y-3">
          {filteredHeaders.map((header) => (
            <div
              key={header}
              className="flex items-center gap-4 p-3 rounded-lg border border-border bg-background hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{header}</p>
                <p className="text-xs text-muted-foreground truncate">
                  Sample: {getSampleValue(header)}
                </p>
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

              <div className="w-[220px] shrink-0">
                <Select
                  value={mappings[header] || 'unmapped'}
                  onValueChange={(value) => 
                    onMappingChange(header, value === 'unmapped' ? null : value)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select variable..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unmapped">
                      <span className="text-muted-foreground">— Not mapped —</span>
                    </SelectItem>
                    {Object.entries(groupedVariables).map(([category, variables]) => (
                      <SelectGroup key={category}>
                        <SelectLabel>{category}</SelectLabel>
                        {variables.map((variable) => (
                          <SelectItem
                            key={variable.key}
                            value={variable.key}
                            disabled={usedVariables.has(variable.key) && mappings[header] !== variable.key}
                          >
                            {variable.label}
                            {usedVariables.has(variable.key) && mappings[header] !== variable.key && (
                              <span className="text-xs text-muted-foreground ml-2">(used)</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {mappings[header] && (
                <Badge variant="secondary" className="shrink-0">
                  Mapped
                </Badge>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
