import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RotateCcw, TrendingUp, TrendingDown, DollarSign, Percent, Building2 } from 'lucide-react';
import { formatLargeNumber, formatPercent, formatCurrency } from '@/lib/valuationUtils';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface LBOModelPanelProps {
  years: ConsolidatedYear[];
  currentPrice?: number;
  sharesOutstanding?: number;
}

interface LBOProjection {
  year: number;
  ebitda: number;
  revenue: number;
  debtBalance: number;
  interestExpense: number;
  principalPaydown: number;
  fcf: number;
  cumulativeDebtPaid: number;
}

interface LBOResult {
  entryEV: number;
  exitEV: number;
  entryEquity: number;
  exitEquity: number;
  moic: number;
  irr: number;
  projections: LBOProjection[];
}

function calculateIRR(cashFlows: number[], maxIterations = 100, tolerance = 0.0001): number {
  // Simple IRR calculation using Newton-Raphson method
  let rate = 0.1;
  
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let npvDerivative = 0;
    
    for (let j = 0; j < cashFlows.length; j++) {
      npv += cashFlows[j] / Math.pow(1 + rate, j);
      npvDerivative -= j * cashFlows[j] / Math.pow(1 + rate, j + 1);
    }
    
    if (Math.abs(npv) < tolerance) return rate;
    if (npvDerivative === 0) return rate;
    
    rate = rate - npv / npvDerivative;
    
    // Bound the rate to reasonable values
    if (rate < -0.99) rate = -0.99;
    if (rate > 10) rate = 10;
  }
  
  return rate;
}

export function LBOModelPanel({ years, currentPrice, sharesOutstanding }: LBOModelPanelProps) {
  // Get latest year data
  const latestYear = useMemo(() => {
    if (years.length === 0) return null;
    const sorted = [...years].sort((a, b) => b.year.localeCompare(a.year));
    return sorted[0];
  }, [years]);

  // LBO Inputs
  const [entryMultiple, setEntryMultiple] = useState(8);
  const [exitMultiple, setExitMultiple] = useState(8);
  const [holdingPeriod, setHoldingPeriod] = useState(5);
  const [leverageRatio, setLeverageRatio] = useState(5); // Debt / EBITDA
  const [interestRate, setInterestRate] = useState(8);
  const [ebitdaGrowth, setEbitdaGrowth] = useState(5);
  const [revenueGrowth, setRevenueGrowth] = useState(5);
  const [fcfConversion, setFcfConversion] = useState(50); // FCF as % of EBITDA

  // Calculate base values from financials
  const baseEbitda = latestYear?.ebitda || 0;
  const baseRevenue = latestYear?.revenue || 0;

  const handleReset = useCallback(() => {
    setEntryMultiple(8);
    setExitMultiple(8);
    setHoldingPeriod(5);
    setLeverageRatio(5);
    setInterestRate(8);
    setEbitdaGrowth(5);
    setRevenueGrowth(5);
    setFcfConversion(50);
  }, []);

  // Calculate LBO returns
  const lboResult = useMemo((): LBOResult | null => {
    if (baseEbitda <= 0) return null;

    const entryEV = baseEbitda * entryMultiple;
    const initialDebt = baseEbitda * leverageRatio;
    const entryEquity = entryEV - initialDebt;

    const projections: LBOProjection[] = [];
    let cumulativeDebtPaid = 0;
    let currentDebt = initialDebt;

    for (let i = 1; i <= holdingPeriod; i++) {
      const projectedEbitda = baseEbitda * Math.pow(1 + ebitdaGrowth / 100, i);
      const projectedRevenue = baseRevenue * Math.pow(1 + revenueGrowth / 100, i);
      const interestExpense = currentDebt * (interestRate / 100);
      const fcf = projectedEbitda * (fcfConversion / 100) - interestExpense;
      const principalPaydown = Math.max(0, Math.min(fcf, currentDebt));
      
      cumulativeDebtPaid += principalPaydown;
      currentDebt = Math.max(0, currentDebt - principalPaydown);

      projections.push({
        year: i,
        ebitda: projectedEbitda,
        revenue: projectedRevenue,
        debtBalance: currentDebt,
        interestExpense,
        principalPaydown,
        fcf,
        cumulativeDebtPaid,
      });
    }

    const exitEbitda = baseEbitda * Math.pow(1 + ebitdaGrowth / 100, holdingPeriod);
    const exitEV = exitEbitda * exitMultiple;
    const remainingDebt = projections[projections.length - 1]?.debtBalance || 0;
    const exitEquity = exitEV - remainingDebt;

    const moic = entryEquity > 0 ? exitEquity / entryEquity : 0;

    // Calculate IRR using cash flows
    const cashFlows = [-entryEquity, ...projections.slice(0, -1).map(() => 0), exitEquity];
    const irr = calculateIRR(cashFlows);

    return {
      entryEV,
      exitEV,
      entryEquity,
      exitEquity,
      moic,
      irr,
      projections,
    };
  }, [baseEbitda, baseRevenue, entryMultiple, exitMultiple, holdingPeriod, leverageRatio, interestRate, ebitdaGrowth, revenueGrowth, fcfConversion]);

  if (!latestYear || baseEbitda <= 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>LBO analysis requires EBITDA data.</p>
          <p className="text-sm mt-2">Please ensure your financial data includes EBITDA values.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Results Summary */}
      {lboResult && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className={lboResult.irr >= 0.2 ? 'border-emerald-500/30 bg-emerald-500/5' : ''}>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">IRR</div>
              <div className={`text-2xl font-bold ${lboResult.irr >= 0.2 ? 'text-emerald-600' : lboResult.irr >= 0.15 ? 'text-amber-600' : 'text-rose-600'}`}>
                {formatPercent(lboResult.irr * 100)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {lboResult.irr >= 0.25 ? 'Excellent' : lboResult.irr >= 0.2 ? 'Strong' : lboResult.irr >= 0.15 ? 'Acceptable' : 'Weak'}
              </div>
            </CardContent>
          </Card>
          
          <Card className={lboResult.moic >= 2.5 ? 'border-emerald-500/30 bg-emerald-500/5' : ''}>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">MOIC</div>
              <div className={`text-2xl font-bold ${lboResult.moic >= 2.5 ? 'text-emerald-600' : lboResult.moic >= 2 ? 'text-amber-600' : 'text-rose-600'}`}>
                {lboResult.moic.toFixed(2)}x
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Multiple on Invested Capital
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Entry Equity</div>
              <div className="text-2xl font-bold">{formatLargeNumber(lboResult.entryEquity)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Sponsor check size
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Exit Equity</div>
              <div className="text-2xl font-bold">{formatLargeNumber(lboResult.exitEquity)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                After {holdingPeriod} years
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* LBO Inputs */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Transaction Inputs
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Base Metrics */}
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
              <div>
                <Label className="text-xs text-muted-foreground">Base EBITDA</Label>
                <div className="font-semibold">{formatLargeNumber(baseEbitda)}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Base Revenue</Label>
                <div className="font-semibold">{formatLargeNumber(baseRevenue)}</div>
              </div>
            </div>

            <Separator />

            {/* Entry/Exit Multiples */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Entry EV/EBITDA</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[entryMultiple]}
                    onValueChange={([v]) => setEntryMultiple(v)}
                    min={4}
                    max={15}
                    step={0.5}
                    className="flex-1"
                  />
                  <span className="w-12 text-right font-mono text-sm">{entryMultiple}x</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Entry EV: {formatLargeNumber(baseEbitda * entryMultiple)}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Exit EV/EBITDA</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[exitMultiple]}
                    onValueChange={([v]) => setExitMultiple(v)}
                    min={4}
                    max={15}
                    step={0.5}
                    className="flex-1"
                  />
                  <span className="w-12 text-right font-mono text-sm">{exitMultiple}x</span>
                </div>
                <Badge variant={exitMultiple > entryMultiple ? 'default' : exitMultiple < entryMultiple ? 'destructive' : 'secondary'} className="text-xs">
                  {exitMultiple > entryMultiple ? 'Multiple Expansion' : exitMultiple < entryMultiple ? 'Contraction' : 'Flat'}
                </Badge>
              </div>
            </div>

            {/* Leverage */}
            <div className="space-y-2">
              <Label className="text-sm">Leverage (Debt/EBITDA)</Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[leverageRatio]}
                  onValueChange={([v]) => setLeverageRatio(v)}
                  min={2}
                  max={8}
                  step={0.5}
                  className="flex-1"
                />
                <span className="w-12 text-right font-mono text-sm">{leverageRatio}x</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Initial Debt: {formatLargeNumber(baseEbitda * leverageRatio)}
              </div>
            </div>

            {/* Interest Rate & Holding Period */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Interest Rate</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[interestRate]}
                    onValueChange={([v]) => setInterestRate(v)}
                    min={4}
                    max={15}
                    step={0.5}
                    className="flex-1"
                  />
                  <span className="w-12 text-right font-mono text-sm">{interestRate}%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Holding Period</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[holdingPeriod]}
                    onValueChange={([v]) => setHoldingPeriod(v)}
                    min={3}
                    max={7}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-12 text-right font-mono text-sm">{holdingPeriod} yrs</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Growth & Cash Assumptions */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Operating Assumptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm">EBITDA Growth Rate</Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[ebitdaGrowth]}
                  onValueChange={([v]) => setEbitdaGrowth(v)}
                  min={-5}
                  max={20}
                  step={1}
                  className="flex-1"
                />
                <span className="w-12 text-right font-mono text-sm">{ebitdaGrowth}%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Revenue Growth Rate</Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[revenueGrowth]}
                  onValueChange={([v]) => setRevenueGrowth(v)}
                  min={-5}
                  max={20}
                  step={1}
                  className="flex-1"
                />
                <span className="w-12 text-right font-mono text-sm">{revenueGrowth}%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">FCF Conversion (% of EBITDA)</Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[fcfConversion]}
                  onValueChange={([v]) => setFcfConversion(v)}
                  min={20}
                  max={80}
                  step={5}
                  className="flex-1"
                />
                <span className="w-12 text-right font-mono text-sm">{fcfConversion}%</span>
              </div>
              <div className="text-xs text-muted-foreground">
                After CapEx, taxes, and working capital
              </div>
            </div>

            <Separator />

            {/* Value Creation Breakdown */}
            {lboResult && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Value Creation Drivers</Label>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entry EV</span>
                    <span>{formatLargeNumber(lboResult.entryEV)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Exit EV</span>
                    <span>{formatLargeNumber(lboResult.exitEV)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>EV Growth</span>
                    <span>+{formatLargeNumber(lboResult.exitEV - lboResult.entryEV)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Debt Paid Down</span>
                    <span>{formatLargeNumber(lboResult.projections[holdingPeriod - 1]?.cumulativeDebtPaid || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Remaining Debt</span>
                    <span>{formatLargeNumber(lboResult.projections[holdingPeriod - 1]?.debtBalance || 0)}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Projections Table */}
      {lboResult && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Projection Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Year</th>
                    <th className="text-right py-2 px-3 font-medium">EBITDA</th>
                    <th className="text-right py-2 px-3 font-medium">Interest</th>
                    <th className="text-right py-2 px-3 font-medium">FCF</th>
                    <th className="text-right py-2 px-3 font-medium">Debt Paydown</th>
                    <th className="text-right py-2 px-3 font-medium">Debt Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-muted/30">
                    <td className="py-2 px-3 font-medium">Entry</td>
                    <td className="text-right py-2 px-3">{formatLargeNumber(baseEbitda)}</td>
                    <td className="text-right py-2 px-3">—</td>
                    <td className="text-right py-2 px-3">—</td>
                    <td className="text-right py-2 px-3">—</td>
                    <td className="text-right py-2 px-3">{formatLargeNumber(baseEbitda * leverageRatio)}</td>
                  </tr>
                  {lboResult.projections.map((proj) => (
                    <tr key={proj.year} className="border-b hover:bg-muted/20">
                      <td className="py-2 px-3 font-medium">Year {proj.year}</td>
                      <td className="text-right py-2 px-3">{formatLargeNumber(proj.ebitda)}</td>
                      <td className="text-right py-2 px-3 text-rose-600">({formatLargeNumber(proj.interestExpense)})</td>
                      <td className="text-right py-2 px-3">{formatLargeNumber(proj.fcf)}</td>
                      <td className="text-right py-2 px-3 text-emerald-600">{formatLargeNumber(proj.principalPaydown)}</td>
                      <td className="text-right py-2 px-3">{formatLargeNumber(proj.debtBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
