import { useMemo } from 'react';
import { TrendingUp, Shield, Building2, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  calculateRevenueCAGR,
  calculateDerivedMetrics,
  formatPercent,
  formatLargeNumber,
  getValueColorClass,
  TEMPLATE_KPI_CONFIG,
  type ValuationTemplate,
} from '@/lib/valuationUtils';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface KPICardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: number | null;
  icon?: React.ReactNode;
  highlighted?: boolean;
}

function KPICard({ label, value, subValue, trend, icon, highlighted }: KPICardProps) {
  return (
    <Card className={highlighted ? 'border-primary bg-primary/5' : ''}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-xl font-semibold font-mono">{value}</p>
            {subValue && (
              <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {icon && <div className="text-muted-foreground">{icon}</div>}
            {trend !== undefined && trend !== null && (
              <Badge 
                variant="outline" 
                className={`text-xs ${getValueColorClass(trend)}`}
              >
                {formatPercent(trend)}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface TemplateKPIPanelProps {
  template: ValuationTemplate;
  years: ConsolidatedYear[];
  marketCap?: number;
}

export function TemplateKPIPanel({ template, years, marketCap }: TemplateKPIPanelProps) {
  const config = TEMPLATE_KPI_CONFIG[template] || TEMPLATE_KPI_CONFIG.dcf;

  // Get latest and previous year
  const { latestYear, previousYear, sortedYears } = useMemo(() => {
    if (years.length === 0) return { latestYear: null, previousYear: null, sortedYears: [] };
    const sorted = [...years].sort((a, b) => b.year.localeCompare(a.year));
    return {
      latestYear: sorted[0],
      previousYear: sorted[1] || null,
      sortedYears: sorted,
    };
  }, [years]);

  // Calculate all metrics
  const metrics = useMemo(() => {
    if (!latestYear) return null;

    const derived = calculateDerivedMetrics(latestYear, marketCap);
    const previousDerived = previousYear ? calculateDerivedMetrics(previousYear, marketCap) : null;

    // Revenue CAGR
    const revenueCAGR = calculateRevenueCAGR(years);

    // Gross margin stability (std dev over time)
    const grossMargins = sortedYears
      .map(y => y.gross_profit && y.revenue ? (y.gross_profit / y.revenue) * 100 : null)
      .filter((m): m is number => m !== null);
    
    const grossMarginStability = grossMargins.length > 1
      ? Math.sqrt(grossMargins.reduce((sum, m) => sum + Math.pow(m - (grossMargins.reduce((a, b) => a + b, 0) / grossMargins.length), 2), 0) / grossMargins.length)
      : null;

    // EPS growth YoY
    const epsGrowth = latestYear.eps && previousYear?.eps
      ? ((latestYear.eps - previousYear.eps) / Math.abs(previousYear.eps)) * 100
      : null;

    // FCF growth YoY
    const fcfGrowth = latestYear.free_cash_flow && previousYear?.free_cash_flow
      ? ((latestYear.free_cash_flow - previousYear.free_cash_flow) / Math.abs(previousYear.free_cash_flow)) * 100
      : null;

    // Leverage ratio (Debt / Equity)
    const leverageRatio = latestYear.total_debt && latestYear.total_equity
      ? latestYear.total_debt / latestYear.total_equity
      : null;

    return {
      ...derived,
      revenueCAGR,
      grossMarginStability,
      epsGrowth,
      fcfGrowth,
      leverageRatio,
      latestYear,
    };
  }, [latestYear, previousYear, years, sortedYears, marketCap]);

  if (!metrics || !latestYear) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Upload financial data to view KPIs
      </div>
    );
  }

  // Template-specific rendering
  const renderTemplateKPIs = () => {
    switch (template) {
      case 'quality':
        return (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Quality Analysis</h3>
              <Badge variant="outline" className="ml-auto">
                {config.description}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard
                label="Gross Margin"
                value={metrics.grossMargin ? formatPercent(metrics.grossMargin) : '—'}
                subValue={metrics.grossMarginStability ? `±${metrics.grossMarginStability.toFixed(1)}pp volatility` : undefined}
                highlighted
              />
              <KPICard
                label="ROIC"
                value={metrics.roic ? formatPercent(metrics.roic) : '—'}
                subValue="Return on Invested Capital"
                highlighted
              />
              <KPICard
                label="FCF Margin"
                value={metrics.fcfMargin ? formatPercent(metrics.fcfMargin) : '—'}
                trend={metrics.fcfGrowth}
                highlighted
              />
              <KPICard
                label="Revenue CAGR"
                value={metrics.revenueCAGR ? formatPercent(metrics.revenueCAGR) : '—'}
                subValue={`${sortedYears.length} year period`}
              />
            </div>
            {/* Margin Stability Chart */}
            {metrics.grossMarginStability !== null && (
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Gross Margin Stability Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Progress 
                      value={Math.max(0, 100 - metrics.grossMarginStability * 10)} 
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-16 text-right">
                      {(100 - metrics.grossMarginStability * 10).toFixed(0)}/100
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Lower volatility indicates more stable competitive positioning
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        );

      case 'financial':
        return (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Financial Services Analysis</h3>
              <Badge variant="outline" className="ml-auto">
                {config.description}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard
                label="EPS Growth"
                value={metrics.epsGrowth ? formatPercent(metrics.epsGrowth) : '—'}
                subValue={latestYear.eps ? `EPS: $${latestYear.eps.toFixed(2)}` : undefined}
                highlighted
              />
              <KPICard
                label="Leverage Ratio"
                value={metrics.leverageRatio ? `${metrics.leverageRatio.toFixed(2)}x` : '—'}
                subValue="Debt / Equity"
                highlighted
              />
              <KPICard
                label="Net Income"
                value={formatLargeNumber(latestYear.net_income)}
                trend={previousYear?.net_income && latestYear.net_income 
                  ? ((latestYear.net_income - previousYear.net_income) / Math.abs(previousYear.net_income)) * 100 
                  : null}
              />
              <KPICard
                label="Total Equity"
                value={formatLargeNumber(latestYear.total_equity)}
              />
            </div>
          </>
        );

      case 'growth':
        return (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Growth Analysis</h3>
              <Badge variant="outline" className="ml-auto">
                {config.description}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard
                label="Revenue CAGR"
                value={metrics.revenueCAGR ? formatPercent(metrics.revenueCAGR) : '—'}
                subValue={`${sortedYears.length} year period`}
                highlighted
              />
              <KPICard
                label="FCF Yield"
                value={metrics.fcfYield ? formatPercent(metrics.fcfYield) : '—'}
                subValue={marketCap ? `vs ${formatLargeNumber(marketCap)} mkt cap` : undefined}
                highlighted
              />
              <KPICard
                label="Free Cash Flow"
                value={formatLargeNumber(latestYear.free_cash_flow)}
                trend={metrics.fcfGrowth}
                highlighted
              />
              <KPICard
                label="Gross Margin"
                value={metrics.grossMargin ? formatPercent(metrics.grossMargin) : '—'}
              />
            </div>
            {/* Cash Burn Analysis for unprofitable companies */}
            {latestYear.free_cash_flow && latestYear.free_cash_flow < 0 && latestYear.cash && (
              <Card className="mt-4 border-destructive/50 bg-destructive/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-destructive">Cash Burn Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">Monthly Burn Rate</p>
                      <p className="text-xl font-semibold font-mono text-destructive">
                        {formatLargeNumber(Math.abs(latestYear.free_cash_flow) / 12)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">Runway</p>
                      <p className="text-xl font-semibold font-mono">
                        {Math.round(latestYear.cash / (Math.abs(latestYear.free_cash_flow) / 12))} months
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        );

      default:
        return (
          <>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Key Performance Indicators</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard
                label="Revenue"
                value={formatLargeNumber(latestYear.revenue)}
                trend={metrics.revenueCAGR}
              />
              <KPICard
                label="Net Income"
                value={formatLargeNumber(latestYear.net_income)}
                trend={metrics.netMargin}
              />
              <KPICard
                label="Free Cash Flow"
                value={formatLargeNumber(latestYear.free_cash_flow)}
                trend={metrics.fcfGrowth}
              />
              <KPICard
                label="ROIC"
                value={metrics.roic ? formatPercent(metrics.roic) : '—'}
              />
            </div>
          </>
        );
    }
  };

  return (
    <div className="space-y-4">
      {renderTemplateKPIs()}
    </div>
  );
}
