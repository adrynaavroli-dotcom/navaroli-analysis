import { useRef, useState, useCallback, useEffect } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  const [isReady, setIsReady] = useState(false);

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

  const generatePDF = useCallback(() => {
    if (!contentRef.current) {
      onError('Content not ready');
      return;
    }

    try {
      // Create a new window for printing
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (!printWindow) {
        onError('Please allow popups to generate PDF');
        return;
      }

      const content = contentRef.current.innerHTML;
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${ticker} Valuation Report</title>
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
                color: #1a1a1a;
                background: white;
                padding: 20mm;
                font-size: 12px;
                line-height: 1.5;
              }
              h1 { font-size: 24px; font-weight: 700; }
              h2 { font-size: 18px; font-weight: 600; margin-bottom: 12px; border-bottom: 2px solid #e5e5e5; padding-bottom: 8px; }
              .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
              .grid { display: grid; gap: 12px; }
              .grid-2 { grid-template-columns: repeat(2, 1fr); }
              .grid-4 { grid-template-columns: repeat(4, 1fr); }
              .grid-5 { grid-template-columns: repeat(5, 1fr); }
              .card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px; background: #fafafa; }
              .text-sm { font-size: 11px; }
              .text-xs { font-size: 10px; }
              .text-lg { font-size: 16px; }
              .text-xl { font-size: 18px; }
              .font-bold { font-weight: 700; }
              .font-medium { font-weight: 500; }
              .text-gray { color: #6b7280; }
              .text-emerald { color: #059669; }
              .text-red { color: #dc2626; }
              .bg-emerald { background: #d1fae5; border-color: #6ee7b7; }
              .bg-red { background: #fee2e2; border-color: #fca5a5; }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .mb-4 { margin-bottom: 16px; }
              .mb-6 { margin-bottom: 24px; }
              .mt-8 { margin-top: 32px; }
              .pt-4 { padding-top: 16px; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; }
              th, td { border: 1px solid #e5e5e5; padding: 8px; }
              th { background: #f5f5f5; font-weight: 600; text-align: left; }
              .page-break { page-break-before: always; }
              .section { margin-bottom: 24px; }
              @media print {
                body { padding: 15mm; }
                .page-break { page-break-before: always; }
              }
            </style>
          </head>
          <body>
            ${content}
          </body>
        </html>
      `);
      printWindow.document.close();
      
      // Wait for content to load then print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          printWindow.onafterprint = () => {
            printWindow.close();
            onComplete();
          };
        }, 500);
      };
      
      setIsGenerating(false);
      setIsReady(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'PDF generation failed');
    }
  }, [ticker, onComplete, onError]);

  // Trigger PDF generation after mount and charts render
  useEffect(() => {
    const timer = setTimeout(() => {
      generatePDF();
    }, 1500);
    return () => clearTimeout(timer);
  }, [generatePDF]);

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-4 bg-background p-8 rounded-lg shadow-lg border">
        {isGenerating ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-lg font-medium">Generating PDF Report...</p>
            <p className="text-sm text-muted-foreground">A new window will open for printing</p>
          </>
        ) : isReady ? (
          <>
            <CheckCircle className="h-8 w-8 mx-auto text-green-500" />
            <p className="text-lg font-medium">PDF Ready!</p>
            <p className="text-sm text-muted-foreground">Use the print dialog to save as PDF</p>
            <Button onClick={onComplete} variant="outline" className="mt-4">
              Close
            </Button>
          </>
        ) : null}
      </div>

      {/* Hidden content for PDF generation */}
      <div className="fixed left-[-9999px] top-0 w-[210mm]">
        <div 
          ref={contentRef} 
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          {/* Header */}
          <div className="header">
            <div>
              <h1>{ticker}</h1>
              <p className="text-lg text-gray">{companyName}</p>
            </div>
            <div className="text-right text-sm text-gray">
              <p className="font-medium">{templateType.toUpperCase()} Analysis</p>
              <p>{new Date().toLocaleDateString()}</p>
            </div>
          </div>

          {/* Quick Stats */}
          {latestYear && (
            <div className="section">
              <div className="grid grid-5">
                <div className="card">
                  <p className="text-xs text-gray">Revenue ({latestYear.year})</p>
                  <p className="text-lg font-bold">{formatLargeNumber(latestYear.revenue)}</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray">Net Income</p>
                  <p className="text-lg font-bold">{formatLargeNumber(latestYear.net_income)}</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray">Free Cash Flow</p>
                  <p className="text-lg font-bold">{formatLargeNumber(latestYear.free_cash_flow)}</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray">Total Debt</p>
                  <p className="text-lg font-bold">{formatLargeNumber(latestYear.total_debt)}</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray">Cash</p>
                  <p className="text-lg font-bold">{formatLargeNumber(latestYear.cash)}</p>
                </div>
              </div>
            </div>
          )}

          {/* DCF Model Section */}
          {config.dcfModel && dcfResult && (
            <div className="section page-break">
              <h2>DCF Valuation Model</h2>
              
              {/* Assumptions */}
              <div className="grid grid-4 mb-4">
                <div className="card">
                  <p className="text-xs text-gray">Base FCF</p>
                  <p className="text-lg font-bold">{formatLargeNumber(baseFCF)}</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray">WACC</p>
                  <p className="text-lg font-bold">{wacc}%</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray">Terminal Growth</p>
                  <p className="text-lg font-bold">{terminalGrowth}%</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray">Shares (M)</p>
                  <p className="text-lg font-bold">{shares.toLocaleString()}</p>
                </div>
              </div>

              {/* Projections Table */}
              <table className="mb-4">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th className="text-right">Growth</th>
                    <th className="text-right">FCF</th>
                    <th className="text-right">Discount Factor</th>
                    <th className="text-right">Present Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-medium">Base Year</td>
                    <td className="text-right text-gray">—</td>
                    <td className="text-right">{formatCurrency(baseFCF)}</td>
                    <td className="text-right">1.00</td>
                    <td className="text-right">{formatCurrency(baseFCF)}</td>
                  </tr>
                  {dcfResult.projections.map((p, i) => (
                    <tr key={i}>
                      <td className="font-medium">{p.year}</td>
                      <td className="text-right text-emerald">+10.0%</td>
                      <td className="text-right">{formatCurrency(p.fcf)}</td>
                      <td className="text-right">{p.discountFactor.toFixed(4)}</td>
                      <td className="text-right">{formatCurrency(p.presentValue)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f5f5f5', fontWeight: 500 }}>
                    <td>Terminal Value</td>
                    <td className="text-right text-gray">g = {terminalGrowth}%</td>
                    <td className="text-right">{formatCurrency(dcfResult.terminalValue)}</td>
                    <td className="text-right">{dcfResult.projections[dcfResult.projections.length - 1]?.discountFactor.toFixed(4)}</td>
                    <td className="text-right">{formatCurrency(dcfResult.terminalPV)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Results */}
              <div className="grid grid-4">
                <div className="card">
                  <p className="text-xs text-gray">Enterprise Value</p>
                  <p className="text-xl font-bold">{formatCurrency(dcfResult.enterpriseValue)}</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray">Equity Value</p>
                  <p className="text-xl font-bold">{formatCurrency(dcfResult.equityValue)}</p>
                </div>
                <div className="card bg-emerald">
                  <p className="text-xs text-emerald">Fair Value / Share</p>
                  <p className="text-xl font-bold text-emerald">{formatCurrency(dcfResult.pricePerShare)}</p>
                </div>
                {currentPrice && dcfResult.impliedUpside && (
                  <div className={`card ${dcfResult.impliedUpside >= 0 ? 'bg-emerald' : 'bg-red'}`}>
                    <p className="text-xs text-gray">Implied Upside</p>
                    <p className={`text-xl font-bold ${dcfResult.impliedUpside >= 0 ? 'text-emerald' : 'text-red'}`}>
                      {dcfResult.impliedUpside >= 0 ? '+' : ''}{dcfResult.impliedUpside.toFixed(1)}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sensitivity Matrix */}
          {config.sensitivityMatrix && (
            <div className="section page-break">
              <h2>Sensitivity Analysis (WACC vs Terminal Growth)</h2>
              <p className="text-sm text-gray mb-4">
                Values show fair value per share at different WACC and terminal growth rate combinations.
                {currentPrice && ` Current price: $${currentPrice.toFixed(2)}`}
              </p>
              <div className="card">
                <table>
                  <thead>
                    <tr>
                      <th>WACC \ Growth</th>
                      <th className="text-center">0%</th>
                      <th className="text-center">1%</th>
                      <th className="text-center">2%</th>
                      <th className="text-center">3%</th>
                      <th className="text-center">4%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[6, 7, 8, 9, 10, 11, 12].map(waccRate => (
                      <tr key={waccRate}>
                        <td className="font-medium">{waccRate}%</td>
                        {[0, 1, 2, 3, 4].map(tg => {
                          if (baseFCF <= 0 || shares <= 0) return <td key={tg} className="text-center">-</td>;
                          const inputs: DCFInputs = {
                            baseFCF,
                            growthRates: Array(5).fill(10),
                            terminalGrowthRate: tg,
                            wacc: waccRate,
                            sharesOutstanding: shares,
                            cash,
                            totalDebt: debt,
                          };
                          const result = calculateDCF(inputs);
                          const value = result.pricePerShare;
                          const ratio = currentPrice ? value / currentPrice : 1;
                          const bgColor = ratio >= 1.2 ? '#d1fae5' : ratio >= 1 ? '#ecfdf5' : ratio >= 0.8 ? '#fef3c7' : '#fee2e2';
                          return (
                            <td key={tg} className="text-center font-medium" style={{ background: bgColor }}>
                              ${value.toFixed(0)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* KPIs Section */}
          {config.kpiPanel && latestYear && (
            <div className="section page-break">
              <h2>Key Performance Indicators ({latestYear.year})</h2>
              <div className="grid grid-4">
                <div className="card">
                  <p className="text-xs text-gray">Revenue</p>
                  <p className="text-lg font-bold">{formatLargeNumber(latestYear.revenue)}</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray">Operating Margin</p>
                  <p className="text-lg font-bold">
                    {latestYear.revenue && latestYear.ebit 
                      ? ((latestYear.ebit / latestYear.revenue) * 100).toFixed(1) + '%'
                      : '-'}
                  </p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray">FCF Margin</p>
                  <p className="text-lg font-bold">
                    {latestYear.revenue && latestYear.free_cash_flow 
                      ? ((latestYear.free_cash_flow / latestYear.revenue) * 100).toFixed(1) + '%'
                      : '-'}
                  </p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray">Net Debt</p>
                  <p className="text-lg font-bold">{formatLargeNumber(latestYear.net_debt)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Analyst Notes */}
          {config.analystNotes && analystNotes && (
            <div className="section page-break">
              <h2>Analyst Notes</h2>
              <div className="card">
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: 1.6 }}>{analystNotes}</div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-4 text-center text-xs text-gray" style={{ borderTop: '1px solid #e5e5e5' }}>
            <p>Generated on {new Date().toLocaleString()} • Valuation Engine Report</p>
          </div>
        </div>
      </div>
    </div>
  );
}