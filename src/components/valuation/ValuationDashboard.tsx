import { useState, useMemo, useCallback } from 'react';
import { BarChart3, Calculator, Grid3X3, TrendingUp, FileText, Settings } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { HistoricalDataTable } from './HistoricalDataTable';
import { DCFModelPanel } from './DCFModelPanel';
import { SensitivityHeatmap } from './SensitivityHeatmap';
import { TemplateKPIPanel } from './TemplateKPIPanel';
import { formatLargeNumber } from '@/lib/valuationUtils';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';
import type { AnalysisTemplateType } from '@/types/valuation';

interface ValuationDashboardProps {
  years: ConsolidatedYear[];
  calculatedMetrics: string[];
  templateType: AnalysisTemplateType;
  ticker: string;
  companyName: string;
}

// Map template types to KPI templates
const TEMPLATE_MAP: Record<AnalysisTemplateType, 'quality' | 'financial' | 'growth' | 'dcf'> = {
  dcf: 'dcf',
  comparables: 'quality',
  lbo: 'financial',
  sum_of_parts: 'quality',
  custom: 'dcf',
};

export function ValuationDashboard({
  years,
  calculatedMetrics,
  templateType,
  ticker,
  companyName,
}: ValuationDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [marketCap, setMarketCap] = useState<number | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [sharesOutstanding, setSharesOutstanding] = useState<number | null>(null);

  // Get latest year for quick stats
  const latestYear = useMemo(() => {
    if (years.length === 0) return null;
    const sorted = [...years].sort((a, b) => b.year.localeCompare(a.year));
    return sorted[0];
  }, [years]);

  // Auto-calculate market cap
  const calculatedMarketCap = useMemo(() => {
    if (currentPrice && sharesOutstanding) {
      return currentPrice * sharesOutstanding;
    }
    return marketCap;
  }, [currentPrice, sharesOutstanding, marketCap]);

  const kpiTemplate = TEMPLATE_MAP[templateType] || 'dcf';

  if (years.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No financial data loaded</p>
        <p className="text-sm mt-2">Upload financial statements to begin analysis</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold">{ticker}</h2>
            <Badge variant="outline">{companyName}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {years.length} years of data • {templateType.toUpperCase()} analysis
          </p>
        </div>

        {/* Quick Market Inputs */}
        <Card className="w-auto">
          <CardContent className="flex items-center gap-4 py-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="price" className="text-xs whitespace-nowrap">Price $</Label>
              <Input
                id="price"
                type="number"
                placeholder="65.15"
                value={currentPrice ?? ''}
                onChange={(e) => setCurrentPrice(e.target.value ? parseFloat(e.target.value) : null)}
                className="w-20 h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="shares" className="text-xs whitespace-nowrap">Shares (M)</Label>
              <Input
                id="shares"
                type="number"
                placeholder="1000"
                value={sharesOutstanding ?? ''}
                onChange={(e) => setSharesOutstanding(e.target.value ? parseFloat(e.target.value) : null)}
                className="w-20 h-8 text-sm"
              />
            </div>
            {calculatedMarketCap && (
              <div className="pl-2 border-l">
                <p className="text-xs text-muted-foreground">Market Cap</p>
                <p className="text-sm font-medium">{formatLargeNumber(calculatedMarketCap * 1e6)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      {latestYear && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Revenue ({latestYear.year})</p>
              <p className="text-lg font-semibold font-mono">{formatLargeNumber(latestYear.revenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Net Income</p>
              <p className="text-lg font-semibold font-mono">{formatLargeNumber(latestYear.net_income)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Free Cash Flow</p>
              <p className="text-lg font-semibold font-mono">{formatLargeNumber(latestYear.free_cash_flow)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total Debt</p>
              <p className="text-lg font-semibold font-mono">{formatLargeNumber(latestYear.total_debt)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Cash</p>
              <p className="text-lg font-semibold font-mono">{formatLargeNumber(latestYear.cash)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start bg-muted/50 p-1">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            KPIs
          </TabsTrigger>
          <TabsTrigger value="historical" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Historical
          </TabsTrigger>
          <TabsTrigger value="dcf" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            DCF Model
          </TabsTrigger>
          <TabsTrigger value="sensitivity" className="flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            Sensitivity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <TemplateKPIPanel
            template={kpiTemplate}
            years={years}
            marketCap={calculatedMarketCap ? calculatedMarketCap * 1e6 : undefined}
          />
        </TabsContent>

        <TabsContent value="historical" className="mt-6">
          <HistoricalDataTable years={years} calculatedMetrics={calculatedMetrics} />
        </TabsContent>

        <TabsContent value="dcf" className="mt-6">
          <DCFModelPanel
            years={years}
            currentPrice={currentPrice ?? undefined}
            sharesOutstanding={sharesOutstanding ?? undefined}
          />
        </TabsContent>

        <TabsContent value="sensitivity" className="mt-6">
          <SensitivityHeatmap
            years={years}
            sharesOutstanding={sharesOutstanding ?? undefined}
            currentPrice={currentPrice ?? undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
