import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Upload, Loader2, TrendingUp, Target, PieChart, BarChart3, Calculator, RotateCcw, Grid3X3, LineChart, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { calculateDCF, calculateReverseDCF, generateSensitivityMatrix, type DCFInputs } from '@/lib/valuationUtils';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface ExportThesisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  ticker: string;
  companyName: string;
  years: ConsolidatedYear[];
  currentPrice?: number;
  sharesOutstanding?: number;
  wacc?: number;
  terminalGrowth?: number;
  analystNotes?: string;
  userId: string;
}

interface ExportConfig {
  // Charts
  growthMargins: boolean;
  capitalEfficiency: boolean;
  capitalAllocation: boolean;
  valuationContext: boolean;
  // Valuation
  dcfSummary: boolean;
  dcfProjections: boolean;
  reverseDcf: boolean;
  sensitivityMatrix: boolean;
  // KPIs
  kpiMetrics: boolean;
  // Notes
  analystNotes: boolean;
}

const DEFAULT_WACC_RANGE = [6, 7, 8, 9, 10, 11, 12];
const DEFAULT_TERMINAL_RANGE = [0, 1, 2, 3, 4];

export function ExportThesisModal({
  open,
  onOpenChange,
  workspaceId,
  ticker,
  companyName,
  years,
  currentPrice,
  sharesOutstanding,
  wacc = 8,
  terminalGrowth = 2,
  analystNotes,
  userId,
}: ExportThesisModalProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [config, setConfig] = useState<ExportConfig>({
    growthMargins: true,
    capitalEfficiency: true,
    capitalAllocation: true,
    valuationContext: true,
    dcfSummary: true,
    dcfProjections: true,
    reverseDcf: true,
    sensitivityMatrix: true,
    kpiMetrics: true,
    analystNotes: true,
  });

  // Get latest year data
  const latestYear = useMemo(() => {
    if (years.length === 0) return null;
    const sorted = [...years].sort((a, b) => b.year.localeCompare(a.year));
    return sorted[0];
  }, [years]);

  const baseFCF = latestYear?.free_cash_flow ?? 0;
  const cash = latestYear?.cash ?? 0;
  const debt = latestYear?.total_debt ?? 0;
  const shares = sharesOutstanding ?? latestYear?.shares_outstanding ?? 1;

  // Calculate DCF
  const dcfResult = useMemo(() => {
    if (baseFCF <= 0 || shares <= 0) return null;
    
    const growthRates = Array(5).fill(10);
    const inputs: DCFInputs = {
      baseFCF,
      growthRates,
      terminalGrowthRate: terminalGrowth,
      wacc,
      sharesOutstanding: shares,
      cash,
      totalDebt: debt,
    };
    
    return calculateDCF(inputs, currentPrice);
  }, [baseFCF, wacc, terminalGrowth, shares, cash, debt, currentPrice]);

  // Calculate implied growth
  const impliedGrowth = useMemo(() => {
    if (!currentPrice || baseFCF <= 0 || shares <= 0) return null;
    return calculateReverseDCF(currentPrice, baseFCF, shares, cash, debt, wacc, terminalGrowth, 5);
  }, [currentPrice, baseFCF, shares, cash, debt, wacc, terminalGrowth]);

  // Generate sensitivity matrix
  const sensitivityMatrix = useMemo(() => {
    if (baseFCF <= 0 || shares <= 0) return null;
    return generateSensitivityMatrix(baseFCF, 10, 5, shares, cash, debt, DEFAULT_WACC_RANGE, DEFAULT_TERMINAL_RANGE);
  }, [baseFCF, shares, cash, debt]);

  const toggleConfig = (key: keyof ExportConfig) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const prepareChartData = () => {
    const sorted = [...years].sort((a, b) => a.year.localeCompare(b.year));
    
    const growthMarginsData = sorted.map(year => ({
      year: year.year,
      revenue: year.revenue,
      operatingMargin: year.revenue && year.ebit ? (year.ebit / year.revenue) * 100 : null,
      fcfMargin: year.revenue && year.free_cash_flow ? (year.free_cash_flow / year.revenue) * 100 : null,
    }));

    const capitalEfficiencyData = sorted.map(year => {
      const investedCapital = (year.total_equity || 0) + (year.total_debt || 0) - (year.cash || 0);
      const nopat = year.ebit ? year.ebit * 0.79 : null;
      const roic = nopat && investedCapital > 0 ? (nopat / investedCapital) * 100 : null;
      return { year: year.year, roic };
    });

    const capitalAllocationData = sorted.map(year => ({
      year: year.year,
      capex: year.capex ? Math.abs(year.capex) : 0,
    }));

    const valuationContextData = sorted.map(year => ({
      year: year.year,
      eps: year.eps,
    }));

    return { growthMarginsData, capitalEfficiencyData, capitalAllocationData, valuationContextData };
  };

  const prepareKPIData = () => {
    if (years.length === 0) return {};
    
    const sorted = [...years].sort((a, b) => b.year.localeCompare(a.year));
    const latest = sorted[0];
    const prev = sorted[1];

    // Calculate growth rates
    const revenueGrowth = prev?.revenue && latest.revenue 
      ? ((latest.revenue - prev.revenue) / prev.revenue) * 100 : null;
    const netIncomeGrowth = prev?.net_income && latest.net_income
      ? ((latest.net_income - prev.net_income) / prev.net_income) * 100 : null;
    
    // Calculate margins
    const grossMargin = latest.revenue && latest.gross_profit 
      ? (latest.gross_profit / latest.revenue) * 100 : null;
    const operatingMargin = latest.revenue && latest.ebit 
      ? (latest.ebit / latest.revenue) * 100 : null;
    const netMargin = latest.revenue && latest.net_income 
      ? (latest.net_income / latest.revenue) * 100 : null;
    const fcfMargin = latest.revenue && latest.free_cash_flow
      ? (latest.free_cash_flow / latest.revenue) * 100 : null;

    // Calculate ROIC
    const investedCapital = (latest.total_equity || 0) + (latest.total_debt || 0) - (latest.cash || 0);
    const nopat = latest.ebit ? latest.ebit * 0.79 : null;
    const roic = nopat && investedCapital > 0 ? (nopat / investedCapital) * 100 : null;

    // Net debt to EBITDA
    const netDebt = (latest.total_debt || 0) - (latest.cash || 0);
    const ebitda = latest.ebitda || (latest.ebit && latest.depreciation ? latest.ebit + latest.depreciation : null);
    const netDebtToEbitda = ebitda ? netDebt / ebitda : null;

    return {
      latestYear: latest.year,
      revenue: latest.revenue,
      netIncome: latest.net_income,
      freeCashFlow: latest.free_cash_flow,
      revenueGrowth,
      netIncomeGrowth,
      grossMargin,
      operatingMargin,
      netMargin,
      fcfMargin,
      roic,
      netDebt,
      netDebtToEbitda,
      eps: latest.eps,
    };
  };

  const handleExport = async () => {
    setIsExporting(true);
    
    const chartData = prepareChartData();
    const kpiData = prepareKPIData();
    
    // Prepare DCF projections
    const dcfProjections = dcfResult?.projections?.map(p => ({
      year: p.year,
      fcf: p.fcf,
      discountedFcf: p.presentValue,
    })) ?? [];

    const exportData = {
      workspace_id: workspaceId,
      user_id: userId,
      ticker,
      company_name: companyName,
      // DCF Summary
      fair_value: config.dcfSummary && dcfResult ? dcfResult.pricePerShare : null,
      current_price: config.dcfSummary ? currentPrice : null,
      upside_percent: config.dcfSummary && dcfResult?.impliedUpside ? dcfResult.impliedUpside : null,
      wacc: config.dcfSummary ? wacc / 100 : null,
      terminal_growth: config.dcfSummary ? terminalGrowth / 100 : null,
      implied_growth_rate: config.reverseDcf && impliedGrowth ? impliedGrowth : null,
      // Financial base data
      base_fcf: baseFCF,
      cash,
      total_debt: debt,
      shares_outstanding: shares,
      // Chart data
      growth_margins_data: config.growthMargins ? chartData.growthMarginsData : [],
      capital_efficiency_data: config.capitalEfficiency ? chartData.capitalEfficiencyData : [],
      capital_allocation_data: config.capitalAllocation ? chartData.capitalAllocationData : [],
      valuation_context_data: config.valuationContext ? chartData.valuationContextData : [],
      // Extended data
      kpi_data: config.kpiMetrics ? kpiData : {},
      sensitivity_matrix: config.sensitivityMatrix && sensitivityMatrix ? sensitivityMatrix : [],
      dcf_projections: config.dcfProjections ? dcfProjections : [],
      // Notes & config
      export_config: config,
      analyst_notes: config.analystNotes ? analystNotes : null,
      published_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('public_thesis_data')
      .upsert(exportData as never, { onConflict: 'workspace_id' });

    if (error) {
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Thesis published',
        description: `${ticker} analysis is now available on your public blog.`,
      });
      onOpenChange(false);
    }
    
    setIsExporting(false);
  };

  const selectedCount = Object.values(config).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Export to Public Thesis
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{ticker}</p>
              <p className="text-sm text-muted-foreground">{companyName}</p>
            </div>
            <Badge variant="outline">{selectedCount} items selected</Badge>
          </div>
          
          <Separator />
          
          {/* Charts */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Charts</p>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <Checkbox id="growthMargins" checked={config.growthMargins} onCheckedChange={() => toggleConfig('growthMargins')} />
                <Label htmlFor="growthMargins" className="flex items-center gap-2 cursor-pointer">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Growth & Margins
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox id="capitalEfficiency" checked={config.capitalEfficiency} onCheckedChange={() => toggleConfig('capitalEfficiency')} />
                <Label htmlFor="capitalEfficiency" className="flex items-center gap-2 cursor-pointer">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  Capital Efficiency (ROIC)
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox id="capitalAllocation" checked={config.capitalAllocation} onCheckedChange={() => toggleConfig('capitalAllocation')} />
                <Label htmlFor="capitalAllocation" className="flex items-center gap-2 cursor-pointer">
                  <PieChart className="h-4 w-4 text-muted-foreground" />
                  Capital Allocation
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox id="valuationContext" checked={config.valuationContext} onCheckedChange={() => toggleConfig('valuationContext')} />
                <Label htmlFor="valuationContext" className="flex items-center gap-2 cursor-pointer">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Valuation Context (EPS)
                </Label>
              </div>
            </div>
          </div>
          
          <Separator />
          
          {/* Valuation Models */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Valuation Models</p>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <Checkbox id="dcfSummary" checked={config.dcfSummary} onCheckedChange={() => toggleConfig('dcfSummary')} disabled={!dcfResult} />
                <Label htmlFor="dcfSummary" className="flex items-center gap-2 cursor-pointer">
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                  DCF Summary (Fair Value)
                  {dcfResult && (
                    <Badge variant="secondary" className="text-xs">${dcfResult.pricePerShare.toFixed(2)}</Badge>
                  )}
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox id="dcfProjections" checked={config.dcfProjections} onCheckedChange={() => toggleConfig('dcfProjections')} disabled={!dcfResult} />
                <Label htmlFor="dcfProjections" className="flex items-center gap-2 cursor-pointer">
                  <LineChart className="h-4 w-4 text-muted-foreground" />
                  DCF Projections Table
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox id="reverseDcf" checked={config.reverseDcf} onCheckedChange={() => toggleConfig('reverseDcf')} disabled={impliedGrowth === null} />
                <Label htmlFor="reverseDcf" className="flex items-center gap-2 cursor-pointer">
                  <RotateCcw className="h-4 w-4 text-muted-foreground" />
                  Reverse DCF
                  {impliedGrowth !== null && (
                    <Badge variant="secondary" className="text-xs">{(impliedGrowth * 100).toFixed(1)}% implied</Badge>
                  )}
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox id="sensitivityMatrix" checked={config.sensitivityMatrix} onCheckedChange={() => toggleConfig('sensitivityMatrix')} disabled={!sensitivityMatrix} />
                <Label htmlFor="sensitivityMatrix" className="flex items-center gap-2 cursor-pointer">
                  <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                  Sensitivity Matrix (WACC vs Growth)
                </Label>
              </div>
            </div>
          </div>
          
          <Separator />
          
          {/* KPIs */}
          <div className="flex items-center space-x-3">
            <Checkbox id="kpiMetrics" checked={config.kpiMetrics} onCheckedChange={() => toggleConfig('kpiMetrics')} />
            <Label htmlFor="kpiMetrics" className="flex items-center gap-2 cursor-pointer">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Key Performance Indicators
            </Label>
          </div>
          
          <Separator />
          
          {/* Notes */}
          <div className="flex items-center space-x-3">
            <Checkbox id="analystNotes" checked={config.analystNotes} onCheckedChange={() => toggleConfig('analystNotes')} disabled={!analystNotes} />
            <Label htmlFor="analystNotes" className="flex items-center gap-2 cursor-pointer">
              <Pencil className="h-4 w-4 text-muted-foreground" />
              Analyst Notes
              {!analystNotes && <span className="text-xs text-muted-foreground">(none written)</span>}
            </Label>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleExport} disabled={isExporting || selectedCount === 0}>
            {isExporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Publish Thesis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
