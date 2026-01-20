import { useMemo, useState } from 'react';
import { Grid3X3, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { generateSensitivityMatrix, formatCurrency, type SensitivityCell } from '@/lib/valuationUtils';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface SensitivityHeatmapProps {
  years: ConsolidatedYear[];
  sharesOutstanding?: number;
  currentPrice?: number;
}

const DEFAULT_WACC_RANGE = [6, 7, 8, 9, 10, 11, 12];
const DEFAULT_TERMINAL_RANGE = [0, 1, 2, 3, 4];
const DEFAULT_PROJECTION_YEARS = 5;

export function SensitivityHeatmap({ years, sharesOutstanding, currentPrice }: SensitivityHeatmapProps) {
  const [baseGrowthRate, setBaseGrowthRate] = useState(10);

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

  // Generate sensitivity matrix
  const matrix = useMemo<SensitivityCell[][] | null>(() => {
    if (baseFCF <= 0 || shares <= 0) return null;

    return generateSensitivityMatrix(
      baseFCF,
      baseGrowthRate,
      DEFAULT_PROJECTION_YEARS,
      shares,
      cash,
      debt,
      DEFAULT_WACC_RANGE,
      DEFAULT_TERMINAL_RANGE
    );
  }, [baseFCF, baseGrowthRate, shares, cash, debt]);

  // Get color intensity based on value relative to current price
  const getCellColor = (value: number): string => {
    if (!isFinite(value) || value <= 0) return 'bg-muted text-muted-foreground';
    
    if (!currentPrice) {
      // No current price - use neutral gradient
      const normalizedValue = Math.min(value / 200, 1);
      if (normalizedValue > 0.7) return 'bg-success/30 text-success-foreground';
      if (normalizedValue > 0.4) return 'bg-success/15 text-foreground';
      return 'bg-muted/50 text-foreground';
    }

    const ratio = value / currentPrice;
    
    // Green = undervalued (fair value > current price)
    // Red = overvalued (fair value < current price)
    if (ratio >= 1.5) return 'bg-success/50 text-success-foreground font-medium';
    if (ratio >= 1.2) return 'bg-success/30 text-foreground';
    if (ratio >= 1.0) return 'bg-success/15 text-foreground';
    if (ratio >= 0.8) return 'bg-destructive/15 text-foreground';
    if (ratio >= 0.5) return 'bg-destructive/30 text-foreground';
    return 'bg-destructive/50 text-destructive-foreground font-medium';
  };

  if (years.length === 0 || !matrix) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Upload financial data with FCF to generate sensitivity analysis
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Grid3X3 className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold">Sensitivity Analysis</h3>
            <p className="text-sm text-muted-foreground">
              WACC vs Terminal Growth Rate impact on fair value
            </p>
          </div>
        </div>
        {currentPrice && (
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Current Price:</span>
            <span className="font-medium">{formatCurrency(currentPrice)}</span>
          </div>
        )}
      </div>

      {/* Growth Rate Control */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Base FCF Growth Rate (Stage 1)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Slider
              value={[baseGrowthRate]}
              onValueChange={([v]) => setBaseGrowthRate(v)}
              min={-10}
              max={40}
              step={1}
              className="flex-1"
            />
            <span className="text-sm font-mono w-16 text-right">{baseGrowthRate}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Applied uniformly for {DEFAULT_PROJECTION_YEARS} projection years
          </p>
        </CardContent>
      </Card>

      {/* Heatmap Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Price Sensitivity Matrix</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-xs text-muted-foreground font-medium text-left border-b">
                  WACC ↓ / g →
                </th>
                {DEFAULT_TERMINAL_RANGE.map((g) => (
                  <th key={g} className="p-2 text-xs text-center font-medium border-b min-w-[80px]">
                    {g}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  <td className="p-2 text-xs font-medium text-muted-foreground border-r bg-muted/30">
                    {DEFAULT_WACC_RANGE[rowIdx]}%
                  </td>
                  {row.map((cell, colIdx) => (
                    <td
                      key={colIdx}
                      className={`p-2 text-center text-sm font-mono transition-colors ${getCellColor(cell.pricePerShare)}`}
                    >
                      {!isFinite(cell.pricePerShare) || cell.pricePerShare <= 0
                        ? '—'
                        : formatCurrency(cell.pricePerShare, 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Legend */}
          {currentPrice && (
            <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-success/50 rounded" />
                <span className="text-xs text-muted-foreground">Undervalued (≥50% upside)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-success/15 rounded" />
                <span className="text-xs text-muted-foreground">Fair Value</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-destructive/30 rounded" />
                <span className="text-xs text-muted-foreground">Overvalued</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Base FCF</p>
            <p className="text-lg font-semibold font-mono">
              ${baseFCF >= 1000 ? `${(baseFCF / 1000).toFixed(1)}B` : `${baseFCF.toFixed(0)}M`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Net Cash/(Debt)</p>
            <p className={`text-lg font-semibold font-mono ${cash - debt >= 0 ? 'text-success' : 'text-destructive'}`}>
              ${((cash - debt) / 1000).toFixed(1)}B
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Shares Outstanding</p>
            <p className="text-lg font-semibold font-mono">
              {shares >= 1000 ? `${(shares / 1000).toFixed(1)}B` : `${shares.toFixed(0)}M`}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
