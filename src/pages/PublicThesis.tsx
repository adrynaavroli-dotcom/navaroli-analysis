import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp, Target, PieChart, BarChart3, Calculator, ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import { formatLargeNumber, formatPercent } from '@/lib/valuationUtils';
import ReactMarkdown from 'react-markdown';

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
  export_config: Record<string, boolean>;
  analyst_notes: string | null;
  published_at: string;
}

export default function PublicThesis() {
  const { ticker } = useParams<{ ticker: string }>();
  
  const { data: thesis, isLoading, error } = useQuery({
    queryKey: ['public-thesis', ticker],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_thesis_data')
        .select('*')
        .ilike('ticker', ticker || '')
        .not('published_at', 'is', null)
        .single();
      
      if (error) throw error;
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
            <div className="flex gap-4">
              <Badge variant="outline" className="gap-1.5">
                <Calculator className="h-3 w-3" />
                WACC: {(thesis.wacc * 100).toFixed(1)}%
              </Badge>
              <Badge variant="outline" className="gap-1.5">
                Terminal Growth: {(thesis.terminal_growth * 100).toFixed(1)}%
              </Badge>
              {config.reverseDcf && thesis.implied_growth_rate !== null && (
                <Badge variant="secondary" className="gap-1.5">
                  Implied Growth: {(thesis.implied_growth_rate * 100).toFixed(1)}%
                </Badge>
              )}
            </div>
          )}
        </div>
        
        <Separator className="my-6" />
        
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
                    <YAxis 
                      yAxisId="left"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatLargeNumber(v)}
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                      domain={[-20, 60]}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar 
                      yAxisId="left"
                      dataKey="revenue" 
                      name="Revenue"
                      fill="hsl(var(--muted-foreground))"
                      fillOpacity={0.3}
                      radius={[2, 2, 0, 0]}
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="operatingMargin" 
                      name="Op. Margin %"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="fcfMargin" 
                      name="FCF Margin %"
                      stroke="hsl(var(--success))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
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
                    <Area 
                      type="monotone" 
                      dataKey="roic" 
                      name="ROIC"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.2}
                      strokeWidth={2}
                      connectNulls
                    />
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
                    <Bar 
                      dataKey="capex" 
                      name="CapEx"
                      fill="hsl(var(--accent))"
                      radius={[2, 2, 0, 0]}
                    />
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
                    <Bar 
                      dataKey="eps" 
                      name="EPS"
                      fill="hsl(var(--primary))"
                      radius={[2, 2, 0, 0]}
                    />
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
