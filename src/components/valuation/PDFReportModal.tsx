import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Printer, 
  TrendingUp, 
  BarChart3, 
  Calculator, 
  Building2, 
  Grid3X3, 
  Pencil,
  PieChart,
  Target,
  LineChart,
} from 'lucide-react';

export interface PDFReportConfig {
  // Charts
  growthMarginsChart: boolean;
  capitalEfficiencyChart: boolean;
  capitalAllocationChart: boolean;
  valuationContextChart: boolean;
  // Tabs/Sections
  kpiPanel: boolean;
  historicalTable: boolean;
  dcfModel: boolean;
  lboModel: boolean;
  sensitivityMatrix: boolean;
  analystNotes: boolean;
}

interface PDFReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: PDFReportConfig;
  onConfigChange: (config: PDFReportConfig) => void;
  onPrint: () => void;
  hasNotes: boolean;
}

const DEFAULT_CONFIG: PDFReportConfig = {
  growthMarginsChart: true,
  capitalEfficiencyChart: true,
  capitalAllocationChart: true,
  valuationContextChart: true,
  kpiPanel: true,
  historicalTable: true,
  dcfModel: true,
  lboModel: false,
  sensitivityMatrix: true,
  analystNotes: true,
};

export function getDefaultPDFConfig(): PDFReportConfig {
  return { ...DEFAULT_CONFIG };
}

export function PDFReportModal({
  open,
  onOpenChange,
  config,
  onConfigChange,
  onPrint,
  hasNotes,
}: PDFReportModalProps) {
  const toggleConfig = (key: keyof PDFReportConfig) => {
    onConfigChange({ ...config, [key]: !config[key] });
  };

  const selectAll = () => {
    onConfigChange({
      growthMarginsChart: true,
      capitalEfficiencyChart: true,
      capitalAllocationChart: true,
      valuationContextChart: true,
      kpiPanel: true,
      historicalTable: true,
      dcfModel: true,
      lboModel: true,
      sensitivityMatrix: true,
      analystNotes: hasNotes,
    });
  };

  const selectNone = () => {
    onConfigChange({
      growthMarginsChart: false,
      capitalEfficiencyChart: false,
      capitalAllocationChart: false,
      valuationContextChart: false,
      kpiPanel: false,
      historicalTable: false,
      dcfModel: false,
      lboModel: false,
      sensitivityMatrix: false,
      analystNotes: false,
    });
  };

  const selectedCount = Object.values(config).filter(Boolean).length;

  const handlePrint = () => {
    onPrint();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Configure PDF Report
          </DialogTitle>
          <DialogDescription>
            Select which sections to include in your PDF report
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline">{selectedCount} sections selected</Badge>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                All
              </Button>
              <Button variant="ghost" size="sm" onClick={selectNone}>
                None
              </Button>
            </div>
          </div>

          <Separator />

          {/* Charts Section */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Charts</p>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="growthMarginsChart" 
                  checked={config.growthMarginsChart}
                  onCheckedChange={() => toggleConfig('growthMarginsChart')}
                />
                <Label htmlFor="growthMarginsChart" className="flex items-center gap-2 cursor-pointer">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Growth & Margins
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="capitalEfficiencyChart" 
                  checked={config.capitalEfficiencyChart}
                  onCheckedChange={() => toggleConfig('capitalEfficiencyChart')}
                />
                <Label htmlFor="capitalEfficiencyChart" className="flex items-center gap-2 cursor-pointer">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  Capital Efficiency (ROIC)
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="capitalAllocationChart" 
                  checked={config.capitalAllocationChart}
                  onCheckedChange={() => toggleConfig('capitalAllocationChart')}
                />
                <Label htmlFor="capitalAllocationChart" className="flex items-center gap-2 cursor-pointer">
                  <PieChart className="h-4 w-4 text-muted-foreground" />
                  Capital Allocation
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="valuationContextChart" 
                  checked={config.valuationContextChart}
                  onCheckedChange={() => toggleConfig('valuationContextChart')}
                />
                <Label htmlFor="valuationContextChart" className="flex items-center gap-2 cursor-pointer">
                  <LineChart className="h-4 w-4 text-muted-foreground" />
                  Valuation Context (P/E)
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Analysis Sections */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Analysis Sections</p>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="kpiPanel" 
                  checked={config.kpiPanel}
                  onCheckedChange={() => toggleConfig('kpiPanel')}
                />
                <Label htmlFor="kpiPanel" className="flex items-center gap-2 cursor-pointer">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Key Performance Indicators
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="historicalTable" 
                  checked={config.historicalTable}
                  onCheckedChange={() => toggleConfig('historicalTable')}
                />
                <Label htmlFor="historicalTable" className="flex items-center gap-2 cursor-pointer">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Historical Data Table
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="dcfModel" 
                  checked={config.dcfModel}
                  onCheckedChange={() => toggleConfig('dcfModel')}
                />
                <Label htmlFor="dcfModel" className="flex items-center gap-2 cursor-pointer">
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                  DCF Model & Projections
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="lboModel" 
                  checked={config.lboModel}
                  onCheckedChange={() => toggleConfig('lboModel')}
                />
                <Label htmlFor="lboModel" className="flex items-center gap-2 cursor-pointer">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  LBO Model
                  <Badge variant="secondary" className="text-xs">Optional</Badge>
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="sensitivityMatrix" 
                  checked={config.sensitivityMatrix}
                  onCheckedChange={() => toggleConfig('sensitivityMatrix')}
                />
                <Label htmlFor="sensitivityMatrix" className="flex items-center gap-2 cursor-pointer">
                  <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                  Sensitivity Analysis
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="flex items-center space-x-3">
            <Checkbox 
              id="analystNotes" 
              checked={config.analystNotes}
              onCheckedChange={() => toggleConfig('analystNotes')}
              disabled={!hasNotes}
            />
            <Label htmlFor="analystNotes" className="flex items-center gap-2 cursor-pointer">
              <Pencil className="h-4 w-4 text-muted-foreground" />
              Analyst Notes
              {!hasNotes && (
                <span className="text-xs text-muted-foreground">(none written)</span>
              )}
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handlePrint} disabled={selectedCount === 0}>
            <Printer className="h-4 w-4 mr-2" />
            Generate PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
