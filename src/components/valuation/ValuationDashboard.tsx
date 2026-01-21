import { useState, useMemo, useCallback } from 'react';
import { BarChart3, Calculator, Grid3X3, TrendingUp, FileText, Printer, Upload, Pencil, RefreshCw, Database, Download, FileJson, Building2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HistoricalDataTable } from './HistoricalDataTable';
import { DCFModelPanel } from './DCFModelPanel';
import { LBOModelPanel } from './LBOModelPanel';
import { SensitivityHeatmap } from './SensitivityHeatmap';
import { TemplateKPIPanel } from './TemplateKPIPanel';
import { AnalystNotebook } from './AnalystNotebook';
import { ExportThesisModal } from './ExportThesisModal';
import { UpdateDataModal } from './UpdateDataModal';
import { AutoFetchPanel } from './AutoFetchPanel';
import { DataFormatHelp } from './DataFormatHelp';
import { ExportImportPanel } from './ExportImportPanel';
import {
  GrowthMarginsChart, 
  CapitalEfficiencyChart, 
  CapitalAllocationChart, 
  ValuationContextChart 
} from './charts';
import { formatLargeNumber } from '@/lib/valuationUtils';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';
import type { AnalysisTemplateType } from '@/types/valuation';

interface ValuationDashboardProps {
  years: ConsolidatedYear[];
  calculatedMetrics: string[];
  templateType: AnalysisTemplateType;
  ticker: string;
  companyName: string;
  workspaceId?: string;
  userId?: string;
  initialNotes?: string;
  onDataUpdated?: () => void;
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
  workspaceId,
  userId,
  initialNotes,
  onDataUpdated,
}: ValuationDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [marketCap, setMarketCap] = useState<number | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [sharesOutstanding, setSharesOutstanding] = useState<number | null>(null);
  const [wacc, setWacc] = useState(8);
  const [terminalGrowth, setTerminalGrowth] = useState(2);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [updateDataModalOpen, setUpdateDataModalOpen] = useState(false);
  const [autoFetchOpen, setAutoFetchOpen] = useState(false);
  const [exportImportOpen, setExportImportOpen] = useState(false);

  // Get latest year for quick stats
  const latestYear = useMemo(() => {
    if (years.length === 0) return null;
    const sorted = [...years].sort((a, b) => b.year.localeCompare(a.year));
    return sorted[0];
  }, [years]);

  // Get year range for display
  const yearRange = useMemo(() => {
    if (years.length === 0) return null;
    const sorted = [...years].sort((a, b) => a.year.localeCompare(b.year));
    return {
      start: sorted[0].year,
      end: sorted[sorted.length - 1].year,
      count: sorted.length,
    };
  }, [years]);

  // Auto-calculate market cap
  const calculatedMarketCap = useMemo(() => {
    if (currentPrice && sharesOutstanding) {
      return currentPrice * sharesOutstanding;
    }
    return marketCap;
  }, [currentPrice, sharesOutstanding, marketCap]);

  const kpiTemplate = TEMPLATE_MAP[templateType] || 'dcf';

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleDataUpdated = useCallback(() => {
    onDataUpdated?.();
    setUpdateDataModalOpen(false);
  }, [onDataUpdated]);

  if (years.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No financial data loaded</p>
        <p className="text-sm mt-2">Upload financial statements to begin analysis</p>
        {workspaceId && (
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => setUpdateDataModalOpen(true)}
          >
            <Database className="h-4 w-4 mr-2" />
            Add Financial Data
          </Button>
        )}
        
        {workspaceId && (
          <UpdateDataModal
            open={updateDataModalOpen}
            onOpenChange={setUpdateDataModalOpen}
            workspaceId={workspaceId}
            ticker={ticker}
            existingYears={years}
            onDataUpdated={handleDataUpdated}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header with Actions */}
      <div className="flex items-start justify-between print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold">{ticker}</h2>
            <Badge variant="outline">{companyName}</Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">
              {years.length} years of data • {templateType.toUpperCase()} analysis
            </p>
            {yearRange && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="text-xs gap-1 cursor-help">
                      <Database className="h-3 w-3" />
                      {yearRange.start} - {yearRange.end}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{yearRange.count} years of historical data</p>
                    <p className="text-xs text-muted-foreground">Click "Update Data" to add more years</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DataFormatHelp templateType={templateType} />
          <Button variant="outline" size="sm" onClick={() => setExportImportOpen(true)}>
            <FileJson className="h-4 w-4 mr-2" />
            JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAutoFetchOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            Auto-Fetch
          </Button>
          {workspaceId && (
            <Button variant="outline" size="sm" onClick={() => setUpdateDataModalOpen(true)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Update Data
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            PDF Report
          </Button>
          {workspaceId && userId && (
            <Button size="sm" onClick={() => setExportModalOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Export to Public
            </Button>
          )}
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block print:mb-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h1 className="text-3xl font-bold">{ticker}</h1>
            <p className="text-lg text-muted-foreground">{companyName}</p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>{templateType.toUpperCase()} Analysis</p>
            <p>{new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Quick Market Inputs */}
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-center gap-4 py-3">
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
          <div className="flex items-center gap-2">
            <Label htmlFor="wacc-input" className="text-xs whitespace-nowrap">WACC %</Label>
            <Input
              id="wacc-input"
              type="number"
              step="0.5"
              value={wacc}
              onChange={(e) => setWacc(parseFloat(e.target.value) || 8)}
              className="w-16 h-8 text-sm"
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

      {/* Quick Stats - Bento Grid */}
      {latestYear && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:grid-cols-5">
          <Card className="bento-card">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Revenue ({latestYear.year})</p>
              <p className="text-lg font-semibold font-mono">{formatLargeNumber(latestYear.revenue)}</p>
            </CardContent>
          </Card>
          <Card className="bento-card">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Net Income</p>
              <p className="text-lg font-semibold font-mono">{formatLargeNumber(latestYear.net_income)}</p>
            </CardContent>
          </Card>
          <Card className="bento-card">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Free Cash Flow</p>
              <p className="text-lg font-semibold font-mono">{formatLargeNumber(latestYear.free_cash_flow)}</p>
            </CardContent>
          </Card>
          <Card className="bento-card">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Total Debt</p>
              <p className="text-lg font-semibold font-mono">{formatLargeNumber(latestYear.total_debt)}</p>
            </CardContent>
          </Card>
          <Card className="bento-card">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Cash</p>
              <p className="text-lg font-semibold font-mono">{formatLargeNumber(latestYear.cash)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Advanced Charts - Bento Grid 2x2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
        <GrowthMarginsChart years={years} />
        <CapitalEfficiencyChart years={years} wacc={wacc} />
        <CapitalAllocationChart years={years} />
        <ValuationContextChart 
          years={years} 
          currentPrice={currentPrice ?? undefined} 
          sharesOutstanding={sharesOutstanding ?? undefined}
        />
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full print:hidden">
        <TabsList className="w-full justify-start bg-muted/50 p-1 flex-wrap">
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
          <TabsTrigger value="lbo" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            LBO Model
          </TabsTrigger>
          <TabsTrigger value="sensitivity" className="flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            Sensitivity
          </TabsTrigger>
          {workspaceId && (
            <TabsTrigger value="notes" className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Notes
            </TabsTrigger>
          )}
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

        <TabsContent value="lbo" className="mt-6">
          <LBOModelPanel
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

        {workspaceId && (
          <TabsContent value="notes" className="mt-6">
            <AnalystNotebook workspaceId={workspaceId} initialNotes={initialNotes} />
          </TabsContent>
        )}
      </Tabs>

      {/* Print-only sections */}
      <div className="hidden print:block print:mt-8">
        <h2 className="text-xl font-semibold mb-4">Key Performance Indicators</h2>
        <TemplateKPIPanel
          template={kpiTemplate}
          years={years}
          marketCap={calculatedMarketCap ? calculatedMarketCap * 1e6 : undefined}
        />
      </div>

      {/* Export Modal */}
      {workspaceId && userId && (
        <ExportThesisModal
          open={exportModalOpen}
          onOpenChange={setExportModalOpen}
          workspaceId={workspaceId}
          ticker={ticker}
          companyName={companyName}
          years={years}
          analystNotes={initialNotes}
          userId={userId}
        />
      )}

      {/* Update Data Modal */}
      {workspaceId && (
        <UpdateDataModal
          open={updateDataModalOpen}
          onOpenChange={setUpdateDataModalOpen}
          workspaceId={workspaceId}
          ticker={ticker}
          existingYears={years}
          onDataUpdated={handleDataUpdated}
        />
      )}

      {/* Auto-Fetch Panel */}
      <AutoFetchPanel
        open={autoFetchOpen}
        onOpenChange={setAutoFetchOpen}
        ticker={ticker}
        onDataFetched={(data) => {
          // Handle fetched data - could merge with existing
          console.log('Fetched data:', data);
          setAutoFetchOpen(false);
        }}
      />

      {/* Export/Import Panel */}
      <ExportImportPanel
        open={exportImportOpen}
        onOpenChange={setExportImportOpen}
        ticker={ticker}
        companyName={companyName}
        templateType={templateType}
        years={years}
        analystNotes={initialNotes}
        marketInputs={{
          currentPrice,
          sharesOutstanding,
          wacc,
          terminalGrowth,
        }}
      />
    </div>
  );
}
