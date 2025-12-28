import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Calendar, Target, DollarSign, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useThesis } from '@/hooks/useTheses';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function ThesisDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: thesis, isLoading, error } = useThesis(id || '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !thesis) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-12">
          <div className="bento-card p-12 text-center">
            <p className="text-muted-foreground mb-4">Thesis not found</p>
            <Button asChild>
              <Link to="/">← Back to Home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const upsidePercent = thesis.target_price
    ? (((thesis.target_price - thesis.current_price) / thesis.current_price) * 100).toFixed(1)
    : null;

  const isPositive = thesis.direction === 'long';

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Link>
              </Button>
              <div className="hidden sm:flex items-center gap-3">
                <span className="text-2xl font-bold font-mono">${thesis.ticker}</span>
                <Badge 
                  className={isPositive 
                    ? 'bg-success/10 text-success border-success/20' 
                    : 'bg-destructive/10 text-destructive border-destructive/20'
                  }
                  variant="outline"
                >
                  {thesis.direction.toUpperCase()}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Current Price</p>
                <p className="text-lg font-semibold">
                  {thesis.currency} {thesis.current_price.toLocaleString()}
                </p>
              </div>
              {thesis.target_price && (
                <div className="text-right hidden sm:block">
                  <p className="text-sm text-muted-foreground">Target</p>
                  <p className={`text-lg font-semibold ${isPositive ? 'text-success' : 'text-destructive'}`}>
                    {thesis.currency} {thesis.target_price.toLocaleString()}
                    <span className="text-sm ml-1">({upsidePercent}%)</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Header />

      <main className="container py-8">
        {/* Mobile Title */}
        <div className="sm:hidden mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-bold font-mono">${thesis.ticker}</span>
            <Badge 
              className={isPositive 
                ? 'bg-success/10 text-success border-success/20' 
                : 'bg-destructive/10 text-destructive border-destructive/20'
              }
              variant="outline"
            >
              {thesis.direction.toUpperCase()}
            </Badge>
          </div>
          <p className="text-muted-foreground">{thesis.company_name}</p>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column - Fact Sheet (30%) */}
          <aside className="lg:col-span-4 space-y-6">
            {/* Company Info */}
            <div className="bento-card p-6">
              <h2 className="text-lg font-semibold mb-4 hidden sm:block">{thesis.company_name}</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-muted-foreground">Sector</span>
                  <Badge variant="outline">{thesis.sector}</Badge>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-muted-foreground">Strategy</span>
                  <span className="text-sm font-medium capitalize">{thesis.strategy}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-muted-foreground">Market Cap</span>
                  <span className="text-sm font-medium capitalize">{thesis.market_cap_category} Cap</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Analysis Date
                  </span>
                  <span className="text-sm font-medium">
                    {new Date(thesis.analysis_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Price Target */}
            {thesis.target_price && (
              <div className="bento-card p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Price Target
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">
                    {thesis.currency} {thesis.target_price.toLocaleString()}
                  </span>
                  <span className={`text-lg font-semibold ${isPositive ? 'text-success' : 'text-destructive'}`}>
                    {isPositive ? <TrendingUp className="inline h-4 w-4" /> : <TrendingDown className="inline h-4 w-4" />}
                    {upsidePercent}%
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  From {thesis.currency} {thesis.current_price.toLocaleString()}
                </p>
              </div>
            )}

            {/* Key Metrics */}
            {thesis.metrics && (
              <div className="bento-card p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Key Metrics
                </h3>
                <div className="space-y-3">
                  {thesis.metrics.market_cap && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">Market Cap</span>
                      <span className="text-sm font-medium">{thesis.metrics.market_cap}</span>
                    </div>
                  )}
                  {thesis.metrics.per > 0 && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">P/E Ratio</span>
                      <span className="text-sm font-medium">{thesis.metrics.per.toFixed(1)}x</span>
                    </div>
                  )}
                  {thesis.metrics.ev_ebitda > 0 && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">EV/EBITDA</span>
                      <span className="text-sm font-medium">{thesis.metrics.ev_ebitda.toFixed(1)}x</span>
                    </div>
                  )}
                  {thesis.metrics.roic > 0 && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">ROIC</span>
                      <span className="text-sm font-medium">{thesis.metrics.roic.toFixed(1)}%</span>
                    </div>
                  )}
                  {thesis.metrics.revenue_growth > 0 && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">Revenue Growth</span>
                      <span className="text-sm font-medium">{thesis.metrics.revenue_growth.toFixed(1)}%</span>
                    </div>
                  )}
                  {thesis.metrics.gross_margin > 0 && (
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">Gross Margin</span>
                      <span className="text-sm font-medium">{thesis.metrics.gross_margin.toFixed(1)}%</span>
                    </div>
                  )}
                  {thesis.metrics.fcf_yield > 0 && (
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-muted-foreground">FCF Yield</span>
                      <span className="text-sm font-medium">{thesis.metrics.fcf_yield.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>

          {/* Right Column - Deep Analysis (70%) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Charts */}
            {thesis.chart_data && (thesis.chart_data.revenue?.length || thesis.chart_data.margins?.length) && (
              <div className="bento-card p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Financial Trends</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {thesis.chart_data.revenue && thesis.chart_data.revenue.length > 0 && (
                    <div>
                      <h4 className="text-xs text-muted-foreground mb-2">Revenue ($B)</h4>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={thesis.chart_data.revenue}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {thesis.chart_data.margins && thesis.chart_data.margins.length > 0 && (
                    <div>
                      <h4 className="text-xs text-muted-foreground mb-2">Gross Margin (%)</h4>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={thesis.chart_data.margins}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Line 
                              type="monotone" 
                              dataKey="value" 
                              stroke="hsl(var(--success))" 
                              strokeWidth={2}
                              dot={{ fill: 'hsl(var(--success))' }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Content Tabs */}
            <div className="bento-card p-6">
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="case">Investment Case</TabsTrigger>
                  <TabsTrigger value="valuation">Valuation</TabsTrigger>
                  <TabsTrigger value="risks">Risks</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="mt-6">
                  {thesis.executive_summary ? (
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      <ReactMarkdown>{thesis.executive_summary}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic">No executive summary available.</p>
                  )}
                </TabsContent>

                <TabsContent value="case" className="mt-6">
                  {thesis.investment_case ? (
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      <ReactMarkdown>{thesis.investment_case}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic">No investment case available.</p>
                  )}
                </TabsContent>

                <TabsContent value="valuation" className="mt-6">
                  {thesis.valuation ? (
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      <ReactMarkdown>{thesis.valuation}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic">No valuation analysis available.</p>
                  )}
                </TabsContent>

                <TabsContent value="risks" className="mt-6">
                  {thesis.risks ? (
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      <ReactMarkdown>{thesis.risks}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic">No risk analysis available.</p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
