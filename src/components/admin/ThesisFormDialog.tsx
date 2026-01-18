import { useState, useEffect } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MarkdownTextarea } from './MarkdownTextarea';
import { MetricsFormSection } from './MetricsFormSection';
import { ChartDataFormSection } from './ChartDataFormSection';
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
import type { Json } from '@/integrations/supabase/types';
import { Thesis, ThesisDirection, InvestmentStrategy, MarketCapCategory, ThesisMetrics, ThesisChartData } from '@/types/thesis';
import { Switch } from '@/components/ui/switch';

interface ThesisFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thesis: Thesis | null;
  onSuccess: () => void;
}

const defaultMetrics: ThesisMetrics = {
  per: 0,
  ev_ebitda: 0,
  roic: 0,
  revenue_growth: 0,
  gross_margin: 0,
  fcf_yield: 0,
  market_cap: '',
};

const defaultChartData: ThesisChartData = {
  revenue: [],
  margins: [],
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
  const [metrics, setMetrics] = useState<ThesisMetrics>(defaultMetrics);
  const [chartData, setChartData] = useState<ThesisChartData>(defaultChartData);
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
      setMetrics(thesis.metrics || defaultMetrics);
      setChartData(thesis.chart_data || defaultChartData);
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
      setMetrics(defaultMetrics);
      setChartData(defaultChartData);
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

  const fetchStockData = async () => {
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

      // Update metrics with available data
      setMetrics(prev => ({
        ...prev,
        per: data.trailingPE ? parseFloat(data.trailingPE.toFixed(2)) : prev.per,
        forward_pe: data.forwardPE ? parseFloat(data.forwardPE.toFixed(2)) : prev.forward_pe,
        price_to_book: data.priceToBook ? parseFloat(data.priceToBook.toFixed(2)) : prev.price_to_book,
        market_cap: formatMarketCap(data.marketCap) || prev.market_cap,
        earnings_date: data.earningsDate || prev.earnings_date,
      }));

      toast({
        title: 'Datos actualizados',
        description: `${data.companyName}: ${data.currency} ${data.currentPrice}`,
      });
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
        metrics: JSON.parse(JSON.stringify(metrics)) as Json,
        chart_data: JSON.parse(JSON.stringify(chartData)) as Json,
        sparkline_data: (thesis?.sparkline_data || []) as unknown as Json,
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
          title: 'Actualizado',
          description: 'La tesis ha sido actualizada',
        });
      } else {
        // Create
        const { error } = await supabase
          .from('theses')
          .insert(thesisData);

        if (error) throw error;

        toast({
          title: 'Creada',
          description: 'La tesis ha sido creada',
        });
      }

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Algo ha fallado',
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
          <DialogTitle>{thesis ? 'Editar Tesis' : 'Nueva Tesis'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Básico</TabsTrigger>
              <TabsTrigger value="content">Contenido</TabsTrigger>
              <TabsTrigger value="metrics">Métricas</TabsTrigger>
              <TabsTrigger value="charts">Gráficos</TabsTrigger>
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
                      onClick={fetchStockData}
                      disabled={isFetchingPrice}
                      title="Buscar precio y datos básicos"
                    >
                      {isFetchingPrice ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Busca para obtener precio, nombre y sector automáticamente
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Nombre de la Empresa *</Label>
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
                  <Label>Dirección *</Label>
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
                  <Label>Estrategia *</Label>
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
                  <Label htmlFor="currentPrice">Precio Actual *</Label>
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
                  <Label htmlFor="targetPrice">Precio Objetivo</Label>
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
                  <Label htmlFor="currency">Moneda</Label>
                  <Input
                    id="currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    placeholder="USD"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div className="space-y-0.5">
                  <Label htmlFor="published" className="cursor-pointer font-medium">
                    Publicar tesis
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Las tesis publicadas son visibles para todos los usuarios
                  </p>
                </div>
                <Switch
                  id="published"
                  checked={isPublished}
                  onCheckedChange={setIsPublished}
                />
              </div>
            </TabsContent>

            <TabsContent value="content" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="summary">Resumen Ejecutivo (Markdown)</Label>
                <MarkdownTextarea
                  id="summary"
                  value={executiveSummary}
                  onChange={setExecutiveSummary}
                  placeholder="Breve resumen de la tesis de inversión..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="case">Caso de Inversión (Markdown)</Label>
                <MarkdownTextarea
                  id="case"
                  value={investmentCase}
                  onChange={setInvestmentCase}
                  placeholder="Caso de inversión detallado..."
                  rows={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valuation">Valoración (Markdown)</Label>
                <MarkdownTextarea
                  id="valuation"
                  value={valuation}
                  onChange={setValuation}
                  placeholder="Metodología y análisis de valoración..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="risks">Riesgos (Markdown)</Label>
                <MarkdownTextarea
                  id="risks"
                  value={risks}
                  onChange={setRisks}
                  placeholder="Principales riesgos de la tesis..."
                  rows={4}
                />
              </div>
            </TabsContent>

            <TabsContent value="metrics" className="mt-4">
              <MetricsFormSection metrics={metrics} onChange={setMetrics} />
            </TabsContent>

            <TabsContent value="charts" className="mt-4">
              <ChartDataFormSection chartData={chartData} onChange={setChartData} />
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                thesis ? 'Actualizar Tesis' : 'Crear Tesis'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
