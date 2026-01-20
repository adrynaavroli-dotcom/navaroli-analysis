import { useState } from 'react';
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
import { Upload, Loader2, TrendingUp, Target, PieChart, BarChart3, Calculator, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface ExportThesisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  ticker: string;
  companyName: string;
  years: ConsolidatedYear[];
  dcfResult?: {
    fairValue: number;
    currentPrice?: number;
    upside?: number;
    wacc: number;
    terminalGrowth: number;
  };
  impliedGrowth?: number;
  analystNotes?: string;
  userId: string;
}

interface ExportConfig {
  growthMargins: boolean;
  capitalEfficiency: boolean;
  capitalAllocation: boolean;
  valuationContext: boolean;
  dcfSummary: boolean;
  reverseDcf: boolean;
  analystNotes: boolean;
}

export function ExportThesisModal({
  open,
  onOpenChange,
  workspaceId,
  ticker,
  companyName,
  years,
  dcfResult,
  impliedGrowth,
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
    reverseDcf: true,
    analystNotes: true,
  });

  const toggleConfig = (key: keyof ExportConfig) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const prepareChartData = () => {
    const sorted = [...years].sort((a, b) => a.year.localeCompare(b.year));
    
    // Growth & Margins data
    const growthMarginsData = sorted.map(year => ({
      year: year.year,
      revenue: year.revenue,
      operatingMargin: year.revenue && year.ebit ? (year.ebit / year.revenue) * 100 : null,
      fcfMargin: year.revenue && year.free_cash_flow ? (year.free_cash_flow / year.revenue) * 100 : null,
    }));

    // Capital Efficiency data
    const capitalEfficiencyData = sorted.map(year => {
      const investedCapital = (year.total_equity || 0) + (year.total_debt || 0) - (year.cash || 0);
      const nopat = year.ebit ? year.ebit * 0.79 : null; // 21% tax rate
      const roic = nopat && investedCapital > 0 ? (nopat / investedCapital) * 100 : null;
      return {
        year: year.year,
        roic,
      };
    });

    // Capital Allocation data
    const capitalAllocationData = sorted.map(year => ({
      year: year.year,
      capex: year.capex ? Math.abs(year.capex) : 0,
    }));

    // Valuation Context data
    const valuationContextData = sorted.map(year => ({
      year: year.year,
      eps: year.eps,
    }));

    return {
      growthMarginsData,
      capitalEfficiencyData,
      capitalAllocationData,
      valuationContextData,
    };
  };

  const handleExport = async () => {
    setIsExporting(true);
    
    const chartData = prepareChartData();
    
    const exportData = {
      workspace_id: workspaceId,
      user_id: userId,
      ticker,
      company_name: companyName,
      fair_value: config.dcfSummary ? dcfResult?.fairValue : null,
      current_price: config.dcfSummary ? dcfResult?.currentPrice : null,
      upside_percent: config.dcfSummary ? dcfResult?.upside : null,
      wacc: config.dcfSummary ? dcfResult?.wacc : null,
      terminal_growth: config.dcfSummary ? dcfResult?.terminalGrowth : null,
      implied_growth_rate: config.reverseDcf ? impliedGrowth : null,
      growth_margins_data: config.growthMargins ? chartData.growthMarginsData : [],
      capital_efficiency_data: config.capitalEfficiency ? chartData.capitalEfficiencyData : [],
      capital_allocation_data: config.capitalAllocation ? chartData.capitalAllocationData : [],
      valuation_context_data: config.valuationContext ? chartData.valuationContextData : [],
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
      <DialogContent className="max-w-md">
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
          
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Charts</p>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="growthMargins" 
                  checked={config.growthMargins}
                  onCheckedChange={() => toggleConfig('growthMargins')}
                />
                <Label htmlFor="growthMargins" className="flex items-center gap-2 cursor-pointer">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Growth & Margins
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="capitalEfficiency" 
                  checked={config.capitalEfficiency}
                  onCheckedChange={() => toggleConfig('capitalEfficiency')}
                />
                <Label htmlFor="capitalEfficiency" className="flex items-center gap-2 cursor-pointer">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  Capital Efficiency (ROIC)
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="capitalAllocation" 
                  checked={config.capitalAllocation}
                  onCheckedChange={() => toggleConfig('capitalAllocation')}
                />
                <Label htmlFor="capitalAllocation" className="flex items-center gap-2 cursor-pointer">
                  <PieChart className="h-4 w-4 text-muted-foreground" />
                  Capital Allocation
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="valuationContext" 
                  checked={config.valuationContext}
                  onCheckedChange={() => toggleConfig('valuationContext')}
                />
                <Label htmlFor="valuationContext" className="flex items-center gap-2 cursor-pointer">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Valuation Context (P/E)
                </Label>
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Valuation Data</p>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="dcfSummary" 
                  checked={config.dcfSummary}
                  onCheckedChange={() => toggleConfig('dcfSummary')}
                  disabled={!dcfResult}
                />
                <Label htmlFor="dcfSummary" className="flex items-center gap-2 cursor-pointer">
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                  DCF Summary (Fair Value)
                  {dcfResult && (
                    <Badge variant="secondary" className="text-xs">
                      ${dcfResult.fairValue.toFixed(2)}
                    </Badge>
                  )}
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="reverseDcf" 
                  checked={config.reverseDcf}
                  onCheckedChange={() => toggleConfig('reverseDcf')}
                  disabled={impliedGrowth === undefined}
                />
                <Label htmlFor="reverseDcf" className="flex items-center gap-2 cursor-pointer">
                  <RotateCcw className="h-4 w-4 text-muted-foreground" />
                  Reverse DCF
                  {impliedGrowth !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      {(impliedGrowth * 100).toFixed(1)}% implied
                    </Badge>
                  )}
                </Label>
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center space-x-3">
            <Checkbox 
              id="analystNotes" 
              checked={config.analystNotes}
              onCheckedChange={() => toggleConfig('analystNotes')}
              disabled={!analystNotes}
            />
            <Label htmlFor="analystNotes" className="cursor-pointer">
              Include Analyst Notes
              {!analystNotes && (
                <span className="text-xs text-muted-foreground ml-2">(none written)</span>
              )}
            </Label>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || selectedCount === 0}>
            {isExporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Publish Thesis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
