import { useState, useMemo, useCallback } from 'react';
import { Calculator, TrendingUp, DollarSign, Target, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  calculateDCF,
  calculateReverseDCF,
  formatCurrency,
  formatPercent,
  formatLargeNumber,
  getValueColorClass,
  type DCFInputs,
  type DCFResult,
} from '@/lib/valuationUtils';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface DCFModelPanelProps {
  years: ConsolidatedYear[];
  currentPrice?: number;
  sharesOutstanding?: number;
}

const DEFAULT_PROJECTION_YEARS = 5;
const DEFAULT_WACC = 8;
const DEFAULT_TERMINAL_GROWTH = 2;
const DEFAULT_GROWTH_RATE = 10;

export function DCFModelPanel({ years, currentPrice, sharesOutstanding }: DCFModelPanelProps) {
  // Get latest year data
  const latestYear = useMemo(() => {
    if (years.length === 0) return null;
    const sorted = [...years].sort((a, b) => b.year.localeCompare(a.year));
    return sorted[0];
  }, [years]);

  // Initialize with data from consolidated years
  const initialFCF = latestYear?.free_cash_flow ?? 0;
  const initialCash = latestYear?.cash ?? 0;
  const initialDebt = latestYear?.total_debt ?? 0;
  const initialShares = sharesOutstanding ?? latestYear?.shares_outstanding ?? 1;

  // DCF Inputs
  const [baseFCF, setBaseFCF] = useState(initialFCF);
  const [growthRates, setGrowthRates] = useState<number[]>(
    Array(DEFAULT_PROJECTION_YEARS).fill(DEFAULT_GROWTH_RATE)
  );
  const [wacc, setWacc] = useState(DEFAULT_WACC);
  const [terminalGrowth, setTerminalGrowth] = useState(DEFAULT_TERMINAL_GROWTH);
  const [shares, setShares] = useState(initialShares);
  const [cash, setCash] = useState(initialCash);
  const [debt, setDebt] = useState(initialDebt);
  const [priceInput, setPriceInput] = useState(currentPrice ?? 0);

  // Calculate DCF
  const dcfResult = useMemo<DCFResult | null>(() => {
    if (baseFCF <= 0 || shares <= 0) return null;
    
    const inputs: DCFInputs = {
      baseFCF,
      growthRates,
      terminalGrowthRate: terminalGrowth,
      wacc,
      sharesOutstanding: shares,
      cash,
      totalDebt: debt,
    };
    
    return calculateDCF(inputs, priceInput);
  }, [baseFCF, growthRates, terminalGrowth, wacc, shares, cash, debt, priceInput]);

  // Calculate Reverse DCF
  const impliedGrowth = useMemo(() => {
    if (priceInput <= 0 || baseFCF <= 0 || shares <= 0) return null;
    return calculateReverseDCF(
      priceInput,
      baseFCF,
      shares,
      cash,
      debt,
      wacc,
      terminalGrowth,
      DEFAULT_PROJECTION_YEARS
    );
  }, [priceInput, baseFCF, shares, cash, debt, wacc, terminalGrowth]);

  // Update individual growth rate
  const handleGrowthRateChange = useCallback((index: number, value: number) => {
    setGrowthRates(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  // Set uniform growth rate
  const handleUniformGrowth = useCallback((value: number) => {
    setGrowthRates(Array(DEFAULT_PROJECTION_YEARS).fill(value));
  }, []);

  // Reset to defaults
  const handleReset = useCallback(() => {
    setBaseFCF(initialFCF);
    setGrowthRates(Array(DEFAULT_PROJECTION_YEARS).fill(DEFAULT_GROWTH_RATE));
    setWacc(DEFAULT_WACC);
    setTerminalGrowth(DEFAULT_TERMINAL_GROWTH);
    setShares(initialShares);
    setCash(initialCash);
    setDebt(initialDebt);
  }, [initialFCF, initialShares, initialCash, initialDebt]);

  if (years.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Upload financial data to build a DCF model
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calculator className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold">2-Stage DCF Model</h3>
            <p className="text-sm text-muted-foreground">
              Interactive discounted cash flow valuation
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs Column */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Base Assumptions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="baseFCF" className="text-xs">Base FCF ($M)</Label>
                <Input
                  id="baseFCF"
                  type="number"
                  value={baseFCF}
                  onChange={(e) => setBaseFCF(parseFloat(e.target.value) || 0)}
                  className="h-9"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wacc" className="text-xs">WACC (%)</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[wacc]}
                    onValueChange={([v]) => setWacc(v)}
                    min={4}
                    max={20}
                    step={0.5}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono w-12 text-right">{wacc}%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="terminalGrowth" className="text-xs">Terminal Growth (%)</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[terminalGrowth]}
                    onValueChange={([v]) => setTerminalGrowth(v)}
                    min={0}
                    max={5}
                    step={0.25}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono w-12 text-right">{terminalGrowth}%</span>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="shares" className="text-xs">Shares (M)</Label>
                  <Input
                    id="shares"
                    type="number"
                    value={shares}
                    onChange={(e) => setShares(parseFloat(e.target.value) || 1)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price" className="text-xs">Current Price ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    value={priceInput}
                    onChange={(e) => setPriceInput(parseFloat(e.target.value) || 0)}
                    className="h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cash" className="text-xs">Cash ($M)</Label>
                  <Input
                    id="cash"
                    type="number"
                    value={cash}
                    onChange={(e) => setCash(parseFloat(e.target.value) || 0)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debt" className="text-xs">Total Debt ($M)</Label>
                  <Input
                    id="debt"
                    type="number"
                    value={debt}
                    onChange={(e) => setDebt(parseFloat(e.target.value) || 0)}
                    className="h-9"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Growth Rates */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Growth Rates (Stage 1)</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => handleUniformGrowth(DEFAULT_GROWTH_RATE)}
                >
                  Reset to {DEFAULT_GROWTH_RATE}%
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {growthRates.map((rate, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-12">Year {idx + 1}</span>
                  <Slider
                    value={[rate]}
                    onValueChange={([v]) => handleGrowthRateChange(idx, v)}
                    min={-20}
                    max={50}
                    step={1}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={rate}
                    onChange={(e) => handleGrowthRateChange(idx, parseFloat(e.target.value) || 0)}
                    className="w-16 h-7 text-xs text-right"
                  />
                  <span className="text-xs">%</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Projections Table */}
        <div className="lg:col-span-2 space-y-4">
          {dcfResult && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Cash Flow Projections
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">Growth</TableHead>
                        <TableHead className="text-right">FCF</TableHead>
                        <TableHead className="text-right">Discount Factor</TableHead>
                        <TableHead className="text-right">Present Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="bg-muted/30">
                        <TableCell className="font-medium">Base Year</TableCell>
                        <TableCell className="text-right">—</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatLargeNumber(baseFCF * 1e6)}
                        </TableCell>
                        <TableCell className="text-right">1.00</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatLargeNumber(baseFCF * 1e6)}
                        </TableCell>
                      </TableRow>
                      {dcfResult.projections.map((p) => (
                        <TableRow key={p.year}>
                          <TableCell className="font-medium">Year {p.year}</TableCell>
                          <TableCell className={`text-right ${getValueColorClass(p.growthRate)}`}>
                            {formatPercent(p.growthRate)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatLargeNumber(p.fcf * 1e6)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {p.discountFactor.toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatLargeNumber(p.presentValue * 1e6)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell>Terminal Value</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          g = {terminalGrowth}%
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatLargeNumber(dcfResult.terminalValue * 1e6)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(1 / Math.pow(1 + wacc / 100, growthRates.length)).toFixed(4)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatLargeNumber(dcfResult.terminalPV * 1e6)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Results Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Enterprise Value</span>
                    </div>
                    <p className="text-xl font-semibold font-mono">
                      {formatLargeNumber(dcfResult.enterpriseValue * 1e6)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Equity Value</span>
                    </div>
                    <p className="text-xl font-semibold font-mono">
                      {formatLargeNumber(dcfResult.equityValue * 1e6)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-primary">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium">Fair Value / Share</span>
                    </div>
                    <p className="text-xl font-semibold font-mono text-primary">
                      {formatCurrency(dcfResult.pricePerShare)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Implied Upside</span>
                    </div>
                    <p className={`text-xl font-semibold font-mono ${getValueColorClass(dcfResult.impliedUpside)}`}>
                      {dcfResult.impliedUpside !== null 
                        ? formatPercent(dcfResult.impliedUpside) 
                        : '—'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Reverse DCF */}
              {priceInput > 0 && (
                <Card className="bg-muted/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Reverse DCF Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          At the current price of <span className="font-medium">{formatCurrency(priceInput)}</span>, 
                          the market is implying a FCF growth rate of:
                        </p>
                      </div>
                      <Badge 
                        variant="outline" 
                        className={`text-lg px-3 py-1 ${getValueColorClass(impliedGrowth)}`}
                      >
                        {impliedGrowth !== null ? formatPercent(impliedGrowth) : '—'}
                      </Badge>
                    </div>
                    {impliedGrowth !== null && (
                      <p className="text-xs text-muted-foreground mt-2">
                        This assumes a {wacc}% WACC and {terminalGrowth}% terminal growth rate over {DEFAULT_PROJECTION_YEARS} years.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!dcfResult && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Enter valid inputs to calculate DCF valuation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
