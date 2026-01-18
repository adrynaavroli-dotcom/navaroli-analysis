import { useState, useEffect } from 'react';
import { Loader2, Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownTextarea } from './MarkdownTextarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Thesis, ThesisDirection, InvestmentStrategy, MarketCapCategory } from '@/types/thesis';

interface ThesisFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thesis: Thesis | null;
  onSuccess: () => void;
}

const defaultMetrics = {
  per: 0,
  ev_ebitda: 0,
  roic: 0,
  revenue_growth: 0,
  gross_margin: 0,
  fcf_yield: 0,
  market_cap: '',
};

export function ThesisFormDialog({ open, onOpenChange, thesis, onSuccess }: ThesisFormDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  
  // Form state
  const [ticker, setTicker] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [sector, setSector] = useState('');
  const [direction, setDirection] = useState<ThesisDirection>('long');
  const [strategy, setStrategy] = useState<InvestmentStrategy>('growth');
  const [marketCapCategory, setMarketCapCategory] = useState<MarketCapCategory>('large');
  const [currentPrice, setCurrentPrice] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [investmentCase, setInvestmentCase] = useState('');
  const [valuation, setValuation] = useState('');
  const [risks, setRisks] = useState('');
  const [metricsJson, setMetricsJson] = useState(JSON.stringify(defaultMetrics, null, 2));
  const [chartDataJson, setChartDataJson] = useState('{}');
  const [isPublished, setIsPublished] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (thesis) {
      setTicker(thesis.ticker);
      setCompanyName(thesis.company_name);
      setSector(thesis.sector);
      setDirection(thesis.direction);
      setStrategy(thesis.strategy);
      setMarketCapCategory(thesis.market_cap_category);
      setCurrentPrice(thesis.current_price.toString());
      setTargetPrice(thesis.target_price?.toString() || '');
      setCurrency(thesis.currency);
      setExecutiveSummary(thesis.executive_summary || '');
      setInvestmentCase(thesis.investment_case || '');
      setValuation(thesis.valuation || '');
      setRisks(thesis.risks || '');
      setMetricsJson(JSON.stringify(thesis.metrics || defaultMetrics, null, 2));
      setChartDataJson(JSON.stringify(thesis.chart_data || {}, null, 2));
      setIsPublished(thesis.is_published);
    } else {
      // Reset form for new thesis
      setTicker('');
      setCompanyName('');
      setSector('');
      setDirection('long');
      setStrategy('growth');
      setMarketCapCategory('large');
      setCurrentPrice('');
      setTargetPrice('');
      setCurrency('USD');
      setExecutiveSummary('');
      setInvestmentCase('');
      setValuation('');
      setRisks('');
      setMetricsJson(JSON.stringify(defaultMetrics, null, 2));
      setChartDataJson('{}');
      setIsPublished(false);
    }
  }, [thesis, open]);

  const formatMarketCap = (value: number | null): string => {
    if (!value) return '';
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    return value.toString();
  };

  const fetchStockData = async (autoFillMetrics: boolean = false) => {
    if (!ticker.trim()) {
      toast({
        title: 'Error',
        description: 'Introduce un ticker primero',
        variant: 'destructive',
      });
      return;
    }

    setIsFetchingPrice(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-stock-data', {
        body: { ticker: ticker.trim() },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Update price info
      setCurrentPrice(data.currentPrice.toString());
      if (!companyName) {
        setCompanyName(data.companyName);
      }
      setCurrency(data.currency);
      
      // Auto-fill sector if empty
      if (!sector && data.sector) {
        setSector(data.sector);
      }

      // Auto-fill metrics if requested
      if (autoFillMetrics) {
        const newMetrics = {
          per: data.trailingPE ? parseFloat(data.trailingPE.toFixed(2)) : 0,
          ev_ebitda: data.enterpriseToEbitda ? parseFloat(data.enterpriseToEbitda.toFixed(2)) : 0,
          roic: data.returnOnEquity ? parseFloat((data.returnOnEquity * 100).toFixed(2)) : 0,
          revenue_growth: data.revenueGrowth ? parseFloat((data.revenueGrowth * 100).toFixed(2)) : 0,
          gross_margin: data.grossMargins ? parseFloat((data.grossMargins * 100).toFixed(2)) : 0,
          fcf_yield: 0, // Not available from Yahoo Finance
          market_cap: formatMarketCap(data.marketCap),
          forward_pe: data.forwardPE ? parseFloat(data.forwardPE.toFixed(2)) : 0,
          price_to_book: data.priceToBook ? parseFloat(data.priceToBook.toFixed(2)) : 0,
          profit_margin: data.profitMargins ? parseFloat((data.profitMargins * 100).toFixed(2)) : 0,
          earnings_date: data.earningsDate || undefined,
        };
        setMetricsJson(JSON.stringify(newMetrics, null, 2));
        
        toast({
          title: 'Datos actualizados',
          description: `Precio y métricas cargadas para ${data.companyName}`,
        });
      } else {
        toast({
          title: 'Precio actualizado',
          description: `${data.companyName}: ${data.currency} ${data.currentPrice} (${data.changePercent > 0 ? '+' : ''}${data.changePercent}%)`,
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al obtener los datos';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsFetchingPrice(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);

    try {
      // Parse JSON fields
      let metrics = defaultMetrics;
      let chartData = {};
      
      try {
        metrics = JSON.parse(metricsJson);
      } catch {
        toast({
          title: 'Invalid JSON',
          description: 'Metrics JSON is invalid',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      try {
        chartData = JSON.parse(chartDataJson);
      } catch {
        toast({
          title: 'Invalid JSON',
          description: 'Chart Data JSON is invalid',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      const thesisData = {
        ticker: ticker.toUpperCase(),
        company_name: companyName,
        sector,
        direction,
        strategy,
        market_cap_category: marketCapCategory,
        current_price: parseFloat(currentPrice),
        target_price: targetPrice ? parseFloat(targetPrice) : null,
        currency,
        executive_summary: executiveSummary || null,
        investment_case: investmentCase || null,
        valuation: valuation || null,
        risks: risks || null,
        metrics,
        chart_data: chartData,
        sparkline_data: thesis?.sparkline_data || [],
        is_published: isPublished,
        user_id: user.id,
      };

      if (thesis) {
        // Update
        const { error } = await supabase
          .from('theses')
          .update(thesisData)
          .eq('id', thesis.id);

        if (error) throw error;

        toast({
          title: 'Updated',
          description: 'Thesis has been updated',
        });
      } else {
        // Create
        const { error } = await supabase
          .from('theses')
          .insert(thesisData);

        if (error) throw error;

        toast({
          title: 'Created',
          description: 'Thesis has been created',
        });
      }

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{thesis ? 'Edit Thesis' : 'New Thesis'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
              <TabsTrigger value="charts">Charts</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ticker">Ticker *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="ticker"
                      value={ticker}
                      onChange={(e) => setTicker(e.target.value)}
                      placeholder="AAPL"
                      required
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fetchStockData(false)}
                      disabled={isFetchingPrice}
                      title="Buscar precio actual"
                    >
                      {isFetchingPrice ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company Name *</Label>
                  <Input
                    id="company"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Apple Inc."
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sector">Sector *</Label>
                  <Input
                    id="sector"
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    placeholder="Technology"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Direction *</Label>
                  <Select value={direction} onValueChange={(v) => setDirection(v as ThesisDirection)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="long">Long</SelectItem>
                      <SelectItem value="short">Short</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Strategy *</Label>
                  <Select value={strategy} onValueChange={(v) => setStrategy(v as InvestmentStrategy)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="value">Value</SelectItem>
                      <SelectItem value="growth">Growth</SelectItem>
                      <SelectItem value="compounder">Compounder</SelectItem>
                      <SelectItem value="turnaround">Turnaround</SelectItem>
                      <SelectItem value="dividend">Dividend</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Market Cap *</Label>
                  <Select value={marketCapCategory} onValueChange={(v) => setMarketCapCategory(v as MarketCapCategory)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mega">Mega Cap</SelectItem>
                      <SelectItem value="large">Large Cap</SelectItem>
                      <SelectItem value="mid">Mid Cap</SelectItem>
                      <SelectItem value="small">Small Cap</SelectItem>
                      <SelectItem value="micro">Micro Cap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPrice">Current Price *</Label>
                  <Input
                    id="currentPrice"
                    type="number"
                    step="0.01"
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(e.target.value)}
                    placeholder="150.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetPrice">Target Price</Label>
                  <Input
                    id="targetPrice"
                    type="number"
                    step="0.01"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="200.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    placeholder="USD"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="published"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="published" className="cursor-pointer">
                  Publish immediately
                </Label>
              </div>
            </TabsContent>

            <TabsContent value="content" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="summary">Executive Summary (Markdown)</Label>
                <MarkdownTextarea
                  id="summary"
                  value={executiveSummary}
                  onChange={setExecutiveSummary}
                  placeholder="Brief overview of the investment thesis..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="case">Investment Case (Markdown)</Label>
                <MarkdownTextarea
                  id="case"
                  value={investmentCase}
                  onChange={setInvestmentCase}
                  placeholder="Detailed investment case..."
                  rows={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valuation">Valuation (Markdown)</Label>
                <MarkdownTextarea
                  id="valuation"
                  value={valuation}
                  onChange={setValuation}
                  placeholder="Valuation methodology and analysis..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="risks">Risks (Markdown)</Label>
                <MarkdownTextarea
                  id="risks"
                  value={risks}
                  onChange={setRisks}
                  placeholder="Key risks to the investment thesis..."
                  rows={4}
                />
              </div>
            </TabsContent>

            <TabsContent value="metrics" className="space-y-4 mt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="metrics">Metrics (JSON)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fetchStockData(true)}
                    disabled={isFetchingPrice || !ticker.trim()}
                    title="Auto-completar métricas desde Yahoo Finance"
                  >
                    {isFetchingPrice ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Auto-completar
                  </Button>
                </div>
                <Textarea
                  id="metrics"
                  value={metricsJson}
                  onChange={(e) => setMetricsJson(e.target.value)}
                  placeholder="{}"
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Campos: per, ev_ebitda, roic, revenue_growth, gross_margin, fcf_yield, market_cap, forward_pe, price_to_book, profit_margin
                </p>
              </div>
            </TabsContent>

            <TabsContent value="charts" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="chartData">Chart Data (JSON)</Label>
                <Textarea
                  id="chartData"
                  value={chartDataJson}
                  onChange={(e) => setChartDataJson(e.target.value)}
                  placeholder="{}"
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Example: {"{"}"revenue": [{"{"}"year": "2020", "value": 100{"}"}], "margins": [{"{"}"year": "2020", "value": 25{"}"}]{"}"}
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                thesis ? 'Update Thesis' : 'Create Thesis'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
