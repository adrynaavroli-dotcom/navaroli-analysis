import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp, Target, PieChart, BarChart3, Calculator, ArrowUpRight, ArrowDownRight, Grid3X3, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { formatLargeNumber, formatPercent, formatCurrency } from '@/lib/valuationUtils';
import ReactMarkdown from 'react-markdown';

interface KPIData {
  latestYear?: string;
  revenue?: number;
  netIncome?: number;
  freeCashFlow?: number;
  revenueGrowth?: number | null;
  netIncomeGrowth?: number | null;
  grossMargin?: number | null;
  operatingMargin?: number | null;
  netMargin?: number | null;
  fcfMargin?: number | null;
  roic?: number | null;
  netDebt?: number;
  netDebtToEbitda?: number | null;
  eps?: number | null;
}

interface DCFProjection {
  year: number;
  fcf: number;
  discountedFcf: number;
}

interface SensitivityCell {
  wacc: number;
  terminalGrowth: number;
  fairValue: number;
}

interface PublicThesisData {
  id: string;
  ticker: string;
  company_name: string;
  fair_value: number | null;
  current_price: number | null;
  upside_percent: number | null;
  wacc: number | null;
  terminal_growth: number | null;
  implied_growth_rate: number | null;
  base_fcf: number | null;
  cash: number | null;
  total_debt: number | null;
  shares_outstanding: number | null;
  growth_margins_data: Array<{
    year: string;
    revenue?: number;
    operatingMargin?: number | null;
    fcfMargin?: number | null;
  }>;
  capital_efficiency_data: Array<{
    year: string;
    roic?: number | null;
  }>;
  capital_allocation_data: Array<{
    year: string;
    capex?: number;
  }>;
  valuation_context_data: Array<{
    year: string;
    eps?: number | null;
  }>;
  kpi_data: KPIData;
  sensitivity_matrix: SensitivityCell[][];
  dcf_projections: DCFProjection[];
  export_config: Record<string, boolean>;
  analyst_notes: string | null;
  published_at: string;
}

export default function PublicThesis() {
  const { ticker } = useParams<{ ticker: string }>();
  
  const { data: thesis, isLoading, error } = useQuery({
    queryKey: ['public-thesis', ticker],
    queryFn: async () => {
      const upperTicker = ticker?.toUpperCase() || '';
      
      // Use the secure view that excludes user_id and workspace_id
      let { data, error: exactError } = await supabase
        .from('public_thesis_data_view')
        .select('*')
        .eq('ticker', upperTicker)
        .maybeSingle();
      
      if (!data && !exactError) {
        const { data: ilikeData, error: ilikeError } = await supabase
          .from('public_thesis_data_view')
          .select('*')
          .ilike('ticker', ticker || '')
          .maybeSingle();
        
        if (ilikeError) throw ilikeError;
        data = ilikeData;
      }
      
      if (!data) throw new Error('Thesis not found');
      
      return data as unknown as PublicThesisData;
    },
    enabled: !!ticker,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !thesis) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-16 text-center">
          <h1 className="text-2xl font-semibold mb-2">Thesis Not Found</h1>
          <p className="text-muted-foreground">
            No published analysis found for {ticker?.toUpperCase()}
          </p>
        </div>
      </div>
    );
  }

  const config = thesis.export_config || {};
  const kpi = thesis.kpi_data || {};
  const sensitivityMatrix = thesis.sensitivity_matrix || [];
  const dcfProjections = thesis.dcf_projections || [];

  // Get sensitivity cell color
  const getSensitivityColor = (value: number): string => {
    if (!thesis.current_price) return 'bg-muted/50';
    const ratio = value / thesis.current_price;
    if (ratio >= 1.5) return 'bg-green-500/40 text-green-900';
    if (ratio >= 1.2) return 'bg-green-500/25';
    if (ratio >= 1.0) return 'bg-green-500/10';
    if (ratio >= 0.8) return 'bg-red-500/10';
    if (ratio >= 0.5) return 'bg-red-500/25';
    return 'bg-red-500/40 text-red-900';
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">{thesis.ticker}</h1>
                <Badge variant="secondary">{thesis.company_name}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Published {new Date(thesis.published_at).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
            
            {thesis.fair_value && thesis.current_price && (
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">
                    ${thesis.fair_value.toFixed(2)}
                  </span>
                  {thesis.upside_percent !== null && (
                    <Badge 
                      variant={thesis.upside_percent >= 0 ? 'default' : 'destructive'}
                      className="gap-1"
                    >
                      {thesis.upside_percent >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {Math.abs(thesis.upside_percent).toFixed(1)}%
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Fair Value (vs ${thesis.current_price.toFixed(2)} current)
                </p>
              </div>
            )}
          </div>
          
          {/* DCF Parameters */}
          {config.dcfSummary && thesis.wacc && thesis.terminal_growth && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="gap-1.5">
                <Calculator className="h-3 w-3" />
                WACC: {(thesis.wacc * 100).toFixed(1)}%
              </Badge>
              <Badge variant="outline" className="gap-1.5">
                Terminal Growth: {(thesis.terminal_growth * 100).toFixed(1)}%
              </Badge>
              {config.reverseDcf && thesis.implied_growth_rate !== null && (
                <Badge variant="secondary" className="gap-1.5">
                  <RotateCcw className="h-3 w-3" />
                  Implied Growth: {(thesis.implied_growth_rate * 100).toFixed(1)}%
                </Badge>
              )}
            </div>
          )}
        </div>
        
        <Separator className="my-6" />

        {/* KPI Section */}
        {config.kpiMetrics && kpi.latestYear && (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Key Performance Indicators ({kpi.latestYear})
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {kpi.revenue && (
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Revenue</p>
                      <p className="text-lg font-semibold">{formatLargeNumber(kpi.revenue)}</p>
                      {kpi.revenueGrowth !== null && kpi.revenueGrowth !== undefined && (
                        <Badge variant={kpi.revenueGrowth >= 0 ? 'default' : 'destructive'} className="text-xs mt-1">
                          {kpi.revenueGrowth >= 0 ? '+' : ''}{kpi.revenueGrowth.toFixed(1)}% YoY
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                )}
                {kpi.netIncome && (
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Net Income</p>
                      <p className="text-lg font-semibold">{formatLargeNumber(kpi.netIncome)}</p>
                      {kpi.netMargin !== null && kpi.netMargin !== undefined && (
                        <p className="text-xs text-muted-foreground">{kpi.netMargin.toFixed(1)}% margin</p>
                      )}
                    </CardContent>
                  </Card>
                )}
                {kpi.freeCashFlow && (
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Free Cash Flow</p>
                      <p className="text-lg font-semibold">{formatLargeNumber(kpi.freeCashFlow)}</p>
                      {kpi.fcfMargin !== null && kpi.fcfMargin !== undefined && (
                        <p className="text-xs text-muted-foreground">{kpi.fcfMargin.toFixed(1)}% margin</p>
                      )}
                    </CardContent>
                  </Card>
                )}
                {kpi.roic !== null && kpi.roic !== undefined && (
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">ROIC</p>
                      <p className="text-lg font-semibold">{kpi.roic.toFixed(1)}%</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
            <Separator className="my-6" />
          </>
        )}

        {/* DCF Projections Table */}
        {config.dcfProjections && dcfProjections.length > 0 && (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                DCF Projections
              </h2>
              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">Projected FCF</TableHead>
                        <TableHead className="text-right">Present Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dcfProjections.map((p) => (
                        <TableRow key={p.year}>
                          <TableCell className="font-medium">Year {p.year}</TableCell>
                          <TableCell className="text-right font-mono">{formatLargeNumber(p.fcf)}</TableCell>
                          <TableCell className="text-right font-mono">{formatLargeNumber(p.discountedFcf)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
            <Separator className="my-6" />
          </>
        )}

        {/* Sensitivity Matrix */}
        {config.sensitivityMatrix && sensitivityMatrix.length > 0 && (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Grid3X3 className="h-5 w-5" />
                Sensitivity Analysis (WACC vs Terminal Growth)
              </h2>
              <Card>
                <CardContent className="pt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="p-2 text-left font-medium text-muted-foreground">WACC \ g</th>
                        {sensitivityMatrix[0]?.map((_, colIdx) => (
                          <th key={colIdx} className="p-2 text-center font-medium">
                            {sensitivityMatrix[0][colIdx]?.terminalGrowth !== undefined 
                              ? `${sensitivityMatrix[0][colIdx].terminalGrowth}%` 
                              : '-'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sensitivityMatrix.map((row, rowIdx) => (
                        <tr key={rowIdx}>
                          <td className="p-2 font-medium text-muted-foreground">
                            {row[0]?.wacc !== undefined ? `${row[0].wacc}%` : '-'}
                          </td>
                          {row.map((cell, colIdx) => (
                            <td 
                              key={colIdx} 
                              className={`p-2 text-center font-mono text-sm ${getSensitivityColor(cell.fairValue)}`}
                            >
                              ${cell.fairValue?.toFixed(0) ?? '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {thesis.current_price && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Green = undervalued vs current price (${thesis.current_price.toFixed(2)}), Red = overvalued
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
            <Separator className="my-6" />
          </>
        )}
        
        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Growth & Margins */}
          {config.growthMargins && thesis.growth_margins_data?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Growth & Margins
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={thesis.growth_margins_data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatLargeNumber(v)} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[-20, 60]} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="hsl(var(--muted-foreground))" fillOpacity={0.3} radius={[2, 2, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="operatingMargin" name="Op. Margin %" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line yAxisId="right" type="monotone" dataKey="fcfMargin" name="FCF Margin %" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          
          {/* Capital Efficiency */}
          {config.capitalEfficiency && thesis.capital_efficiency_data?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Capital Efficiency (ROIC)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={thesis.capital_efficiency_data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v?.toFixed(1)}%`} />
                    <Area type="monotone" dataKey="roic" name="ROIC" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          
          {/* Capital Allocation */}
          {config.capitalAllocation && thesis.capital_allocation_data?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <PieChart className="h-4 w-4" />
                  Capital Allocation (CapEx)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={thesis.capital_allocation_data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatLargeNumber(v)} />
                    <Tooltip formatter={(v: number) => formatLargeNumber(v)} />
                    <Bar dataKey="capex" name="CapEx" fill="hsl(var(--accent))" radius={[2, 2, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          
          {/* Valuation Context */}
          {config.valuationContext && thesis.valuation_context_data?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Valuation Context (EPS)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={thesis.valuation_context_data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v: number) => `$${v?.toFixed(2)}`} />
                    <Bar dataKey="eps" name="EPS" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
        
        {/* Analyst Notes */}
        {config.analystNotes && thesis.analyst_notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Analyst Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{thesis.analyst_notes}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Footer */}
        <div className="mt-12 pt-6 border-t text-center text-sm text-muted-foreground">
          <p>This analysis is for educational purposes only. Not financial advice.</p>
        </div>
      </main>
    </div>
  );
}
