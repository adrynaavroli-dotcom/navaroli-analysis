import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatFinancialNumber } from '@/lib/financial-parser';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface HistoricalDataTableProps {
  years: ConsolidatedYear[];
  calculatedMetrics: string[];
}

interface MetricConfig {
  key: keyof ConsolidatedYear;
  label: string;
  category: 'Income Statement' | 'Balance Sheet' | 'Cash Flow' | 'Calculated';
}

const METRIC_CONFIG: MetricConfig[] = [
  // Income Statement
  { key: 'revenue', label: 'Revenue', category: 'Income Statement' },
  { key: 'gross_profit', label: 'Gross Profit', category: 'Income Statement' },
  { key: 'ebitda', label: 'EBITDA', category: 'Income Statement' },
  { key: 'ebit', label: 'EBIT', category: 'Income Statement' },
  { key: 'net_income', label: 'Net Income', category: 'Income Statement' },
  { key: 'eps', label: 'EPS', category: 'Income Statement' },
  // Balance Sheet
  { key: 'cash', label: 'Cash & Equivalents', category: 'Balance Sheet' },
  { key: 'total_assets', label: 'Total Assets', category: 'Balance Sheet' },
  { key: 'total_debt', label: 'Total Debt', category: 'Balance Sheet' },
  { key: 'total_equity', label: 'Total Equity', category: 'Balance Sheet' },
  { key: 'net_debt', label: 'Net Debt', category: 'Calculated' },
  // Cash Flow
  { key: 'operating_cash_flow', label: 'Operating Cash Flow', category: 'Cash Flow' },
  { key: 'capex', label: 'CapEx', category: 'Cash Flow' },
  { key: 'free_cash_flow', label: 'Free Cash Flow', category: 'Cash Flow' },
];

const CATEGORY_COLORS: Record<string, string> = {
  'Income Statement': 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  'Balance Sheet': 'bg-green-500/10 text-green-700 border-green-500/20',
  'Cash Flow': 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  'Calculated': 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
};

export function HistoricalDataTable({ years, calculatedMetrics }: HistoricalDataTableProps) {
  const sortedYears = useMemo(() => 
    [...years].sort((a, b) => b.year.localeCompare(a.year)),
    [years]
  );

  const metricsWithData = useMemo(() => {
    return METRIC_CONFIG.filter(config => {
      return years.some(year => year[config.key] !== null);
    });
  }, [years]);

  const groupedMetrics = useMemo(() => {
    const groups: Record<string, MetricConfig[]> = {};
    for (const metric of metricsWithData) {
      if (!groups[metric.category]) {
        groups[metric.category] = [];
      }
      groups[metric.category].push(metric);
    }
    return groups;
  }, [metricsWithData]);

  if (years.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No historical data available
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Historical Financial Data</h3>
            <p className="text-sm text-muted-foreground">
              {sortedYears[sortedYears.length - 1]?.year} - {sortedYears[0]?.year} • {metricsWithData.length} metrics
            </p>
          </div>
          {calculatedMetrics.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Calculated:</span>
              {calculatedMetrics.map(m => (
                <Badge key={m} variant="outline" className="text-xs">
                  {m.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="sticky left-0 bg-muted/50 min-w-[200px]">Metric</TableHead>
              {sortedYears.map(year => (
                <TableHead key={year.year} className="text-right min-w-[100px]">
                  {year.year}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(groupedMetrics).map(([category, metrics]) => (
              <>
                <TableRow key={`header-${category}`} className="bg-muted/20">
                  <TableCell colSpan={sortedYears.length + 1} className="py-2">
                    <Badge variant="outline" className={CATEGORY_COLORS[category]}>
                      {category}
                    </Badge>
                  </TableCell>
                </TableRow>
                {metrics.map(metric => (
                  <TableRow key={metric.key}>
                    <TableCell className="sticky left-0 bg-background font-medium">
                      <div className="flex items-center gap-2">
                        {metric.label}
                        {calculatedMetrics.includes(metric.key) && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            calc
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {sortedYears.map(year => (
                      <TableCell key={year.year} className="text-right tabular-nums">
                        {formatFinancialNumber(year[metric.key] as number | null)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
