import { useRef, useState, useCallback, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GrowthMarginsChart, CapitalEfficiencyChart, CapitalAllocationChart, ValuationContextChart } from './charts';
import { TemplateKPIPanel } from './TemplateKPIPanel';
import { HistoricalDataTable } from './HistoricalDataTable';
import { SensitivityHeatmap } from './SensitivityHeatmap';
import { calculateDCF, formatLargeNumber, formatCurrency, type DCFInputs } from '@/lib/valuationUtils';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';
import type { PDFReportConfig } from './PDFReportModal';

interface PDFGeneratorProps {
  ticker: string;
  companyName: string;
  templateType: string;
  years: ConsolidatedYear[];
  config: PDFReportConfig;
  currentPrice?: number | null;
  sharesOutstanding?: number | null;
  wacc?: number;
  terminalGrowth?: number;
  analystNotes?: string;
  marketCap?: number | null;
  onComplete: () => void;
  onError: (error: string) => void;
}

export function PDFGenerator({
  ticker,
  companyName,
  templateType,
  years,
  config,
  currentPrice,
  sharesOutstanding,
  wacc = 8,
  terminalGrowth = 2,
  analystNotes,
  marketCap,
  onComplete,
  onError,
}: PDFGeneratorProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(true);

  // Get latest year data
  const latestYear = years.length > 0 
    ? [...years].sort((a, b) => b.year.localeCompare(a.year))[0] 
    : null;

  const baseFCF = latestYear?.free_cash_flow ?? 0;
  const cash = latestYear?.cash ?? 0;
  const debt = latestYear?.total_debt ?? 0;
  const shares = sharesOutstanding ?? latestYear?.shares_outstanding ?? 1;

  // Calculate DCF for display
  const dcfResult = (() => {
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
    return calculateDCF(inputs, currentPrice ?? undefined);
  })();

  const generatePDF = useCallback(async () => {
    if (!contentRef.current) {
      onError('Content not ready');
      return;
    }

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `${ticker}_valuation_report.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        logging: false,
        letterRendering: true,
      },
      jsPDF: { 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'portrait' 
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    try {
      await html2pdf().set(opt).from(contentRef.current).save();
      onComplete();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'PDF generation failed');
    }
  }, [ticker, onComplete, onError]);

  // Trigger PDF generation after mount and charts render
  useEffect(() => {
    const timer = setTimeout(() => {
      generatePDF();
      setIsGenerating(false);
    }, 2000); // Wait for charts to render
    return () => clearTimeout(timer);
  }, [generatePDF]);

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-lg font-medium">Generating PDF Report...</p>
        <p className="text-sm text-muted-foreground">This may take a few seconds</p>
      </div>

      {/* Hidden content for PDF generation */}
      <div className="fixed left-[-9999px] top-0 w-[210mm]">
        <div 
          ref={contentRef} 
          className="bg-white text-black p-8 space-y-6"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          {/* Header */}
          <div className="border-b-2 border-black pb-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-black">{ticker}</h1>
                <p className="text-lg text-gray-600">{companyName}</p>
              </div>
              <div className="text-right text-sm text-gray-500">
                <p className="font-medium">{templateType.toUpperCase()} Analysis</p>
                <p>{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          {latestYear && (
            <div className="grid grid-cols-5 gap-3 mb-6">
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="text-xs text-gray-500">Revenue ({latestYear.year})</p>
                <p className="text-lg font-bold">{formatLargeNumber(latestYear.revenue)}</p>
              </div>
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="text-xs text-gray-500">Net Income</p>
                <p className="text-lg font-bold">{formatLargeNumber(latestYear.net_income)}</p>
              </div>
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="text-xs text-gray-500">Free Cash Flow</p>
                <p className="text-lg font-bold">{formatLargeNumber(latestYear.free_cash_flow)}</p>
              </div>
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="text-xs text-gray-500">Total Debt</p>
                <p className="text-lg font-bold">{formatLargeNumber(latestYear.total_debt)}</p>
              </div>
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="text-xs text-gray-500">Cash</p>
                <p className="text-lg font-bold">{formatLargeNumber(latestYear.cash)}</p>
              </div>
            </div>
          )}

          {/* Charts Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {config.growthMarginsChart && (
              <div className="border rounded-lg p-4">
                <GrowthMarginsChart years={years} />
              </div>
            )}
            {config.capitalEfficiencyChart && (
              <div className="border rounded-lg p-4">
                <CapitalEfficiencyChart years={years} wacc={wacc} />
              </div>
            )}
            {config.capitalAllocationChart && (
              <div className="border rounded-lg p-4">
                <CapitalAllocationChart years={years} />
              </div>
            )}
            {config.valuationContextChart && (
              <div className="border rounded-lg p-4">
                <ValuationContextChart 
                  years={years} 
                  currentPrice={currentPrice ?? undefined}
                  sharesOutstanding={sharesOutstanding ?? undefined}
                />
              </div>
            )}
          </div>

          {/* KPIs Section */}
          {config.kpiPanel && (
            <div className="mb-6" style={{ pageBreakInside: 'avoid' }}>
              <h2 className="text-xl font-bold mb-4 border-b pb-2 text-black">Key Performance Indicators</h2>
              <TemplateKPIPanel
                template="dcf"
                years={years}
                marketCap={marketCap ? marketCap * 1e6 : undefined}
              />
            </div>
          )}

          {/* DCF Model Section */}
          {config.dcfModel && dcfResult && (
            <div className="mb-6" style={{ pageBreakBefore: 'always' }}>
              <h2 className="text-xl font-bold mb-4 border-b pb-2 text-black">DCF Valuation Model</h2>
              
              {/* Assumptions */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs text-gray-500">Base FCF</p>
                  <p className="text-lg font-bold">{formatLargeNumber(baseFCF)}</p>
                </div>
                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs text-gray-500">WACC</p>
                  <p className="text-lg font-bold">{wacc}%</p>
                </div>
                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs text-gray-500">Terminal Growth</p>
                  <p className="text-lg font-bold">{terminalGrowth}%</p>
                </div>
                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs text-gray-500">Shares (M)</p>
                  <p className="text-lg font-bold">{shares.toLocaleString()}</p>
                </div>
              </div>

              {/* Projections Table */}
              <table className="w-full border-collapse text-sm mb-4">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-left">Year</th>
                    <th className="border p-2 text-right">Growth</th>
                    <th className="border p-2 text-right">FCF</th>
                    <th className="border p-2 text-right">Discount Factor</th>
                    <th className="border p-2 text-right">Present Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border p-2 font-medium">Base Year</td>
                    <td className="border p-2 text-right text-gray-500">—</td>
                    <td className="border p-2 text-right">{formatCurrency(baseFCF)}</td>
                    <td className="border p-2 text-right">1.00</td>
                    <td className="border p-2 text-right">{formatCurrency(baseFCF)}</td>
                  </tr>
                  {dcfResult.projections.map((p, i) => (
                    <tr key={i}>
                      <td className="border p-2 font-medium">{p.year}</td>
                      <td className="border p-2 text-right text-emerald-600">+10.0%</td>
                      <td className="border p-2 text-right">{formatCurrency(p.fcf)}</td>
                      <td className="border p-2 text-right">{p.discountFactor.toFixed(4)}</td>
                      <td className="border p-2 text-right">{formatCurrency(p.presentValue)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-medium">
                    <td className="border p-2">Terminal Value</td>
                    <td className="border p-2 text-right text-gray-500">g = {terminalGrowth}%</td>
                    <td className="border p-2 text-right">{formatCurrency(dcfResult.terminalValue)}</td>
                    <td className="border p-2 text-right">{dcfResult.projections[dcfResult.projections.length - 1]?.discountFactor.toFixed(4)}</td>
                    <td className="border p-2 text-right">{formatCurrency(dcfResult.terminalPV)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Results */}
              <div className="grid grid-cols-4 gap-4">
                <div className="border rounded-lg p-4 bg-gray-50">
                  <p className="text-xs text-gray-500">Enterprise Value</p>
                  <p className="text-xl font-bold">{formatCurrency(dcfResult.enterpriseValue)}</p>
                </div>
                <div className="border rounded-lg p-4 bg-gray-50">
                  <p className="text-xs text-gray-500">Equity Value</p>
                  <p className="text-xl font-bold">{formatCurrency(dcfResult.equityValue)}</p>
                </div>
                <div className="border rounded-lg p-4 bg-emerald-50 border-emerald-200">
                  <p className="text-xs text-emerald-600">Fair Value / Share</p>
                  <p className="text-xl font-bold text-emerald-700">{formatCurrency(dcfResult.pricePerShare)}</p>
                </div>
                {currentPrice && dcfResult.impliedUpside && (
                  <div className={`border rounded-lg p-4 ${dcfResult.impliedUpside >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-xs text-gray-500">Implied Upside</p>
                    <p className={`text-xl font-bold ${dcfResult.impliedUpside >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {dcfResult.impliedUpside >= 0 ? '+' : ''}{dcfResult.impliedUpside.toFixed(1)}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sensitivity Matrix */}
          {config.sensitivityMatrix && (
            <div className="mb-6" style={{ pageBreakBefore: 'always' }}>
              <h2 className="text-xl font-bold mb-4 border-b pb-2 text-black">Sensitivity Analysis</h2>
              <SensitivityHeatmap
                years={years}
                sharesOutstanding={sharesOutstanding ?? undefined}
                currentPrice={currentPrice ?? undefined}
              />
            </div>
          )}

          {/* Historical Table */}
          {config.historicalTable && (
            <div className="mb-6" style={{ pageBreakBefore: 'always' }}>
              <h2 className="text-xl font-bold mb-4 border-b pb-2 text-black">Historical Financial Data</h2>
              <HistoricalDataTable years={years} calculatedMetrics={[]} />
            </div>
          )}

          {/* Analyst Notes */}
          {config.analystNotes && analystNotes && (
            <div className="mb-6" style={{ pageBreakBefore: 'always' }}>
              <h2 className="text-xl font-bold mb-4 border-b pb-2 text-black">Analyst Notes</h2>
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-sm text-gray-700">{analystNotes}</div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="border-t pt-4 mt-8 text-center text-xs text-gray-400">
            <p>Generated on {new Date().toLocaleString()} • Valuation Engine Report</p>
          </div>
        </div>
      </div>
    </div>
  );
}
