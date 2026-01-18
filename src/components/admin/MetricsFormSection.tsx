import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ThesisMetrics } from '@/types/thesis';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, Percent, CalendarDays, Code, LayoutGrid } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

interface MetricsFormSectionProps {
  metrics: ThesisMetrics;
  onChange: (metrics: ThesisMetrics) => void;
}

export function MetricsFormSection({ metrics, onChange }: MetricsFormSectionProps) {
  const { toast } = useToast();
  const [jsonValue, setJsonValue] = useState(() => JSON.stringify(metrics, null, 2));

  const updateField = <K extends keyof ThesisMetrics>(field: K, value: ThesisMetrics[K]) => {
    const newMetrics = { ...metrics, [field]: value };
    onChange(newMetrics);
    setJsonValue(JSON.stringify(newMetrics, null, 2));
  };

  const parseNumber = (value: string): number => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  const handleJsonChange = (value: string) => {
    setJsonValue(value);
    try {
      const parsed = JSON.parse(value);
      onChange(parsed);
    } catch {
      // Invalid JSON, don't update
    }
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonValue);
      onChange(parsed);
      toast({ title: 'JSON aplicado', description: 'Las métricas han sido actualizadas' });
    } catch {
      toast({ title: 'JSON inválido', description: 'Revisa el formato del JSON', variant: 'destructive' });
    }
  };

  return (
    <Tabs defaultValue="visual" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="visual" className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4" />
          Visual
        </TabsTrigger>
        <TabsTrigger value="json" className="flex items-center gap-2">
          <Code className="h-4 w-4" />
          JSON
        </TabsTrigger>
      </TabsList>

      <TabsContent value="visual" className="space-y-6">
        {/* Valuation Metrics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Valoración
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="per" className="text-xs text-muted-foreground">PER</Label>
              <Input
                id="per"
                type="number"
                step="0.01"
                value={metrics.per || ''}
                onChange={(e) => updateField('per', parseNumber(e.target.value))}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="forward_pe" className="text-xs text-muted-foreground">Forward P/E</Label>
              <Input
                id="forward_pe"
                type="number"
                step="0.01"
                value={metrics.forward_pe || ''}
                onChange={(e) => updateField('forward_pe', parseNumber(e.target.value))}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev_ebitda" className="text-xs text-muted-foreground">EV/EBITDA</Label>
              <Input
                id="ev_ebitda"
                type="number"
                step="0.01"
                value={metrics.ev_ebitda || ''}
                onChange={(e) => updateField('ev_ebitda', parseNumber(e.target.value))}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price_to_book" className="text-xs text-muted-foreground">Price/Book</Label>
              <Input
                id="price_to_book"
                type="number"
                step="0.01"
                value={metrics.price_to_book || ''}
                onChange={(e) => updateField('price_to_book', parseNumber(e.target.value))}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fcf_yield" className="text-xs text-muted-foreground">FCF Yield %</Label>
              <Input
                id="fcf_yield"
                type="number"
                step="0.01"
                value={metrics.fcf_yield || ''}
                onChange={(e) => updateField('fcf_yield', parseNumber(e.target.value))}
                placeholder="0.00"
                className="h-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Profitability Metrics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Percent className="h-4 w-4 text-green-500" />
              Rentabilidad
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="roic" className="text-xs text-muted-foreground">ROIC %</Label>
              <Input
                id="roic"
                type="number"
                step="0.01"
                value={metrics.roic || ''}
                onChange={(e) => updateField('roic', parseNumber(e.target.value))}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gross_margin" className="text-xs text-muted-foreground">Margen Bruto %</Label>
              <Input
                id="gross_margin"
                type="number"
                step="0.01"
                value={metrics.gross_margin || ''}
                onChange={(e) => updateField('gross_margin', parseNumber(e.target.value))}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profit_margin" className="text-xs text-muted-foreground">Margen Neto %</Label>
              <Input
                id="profit_margin"
                type="number"
                step="0.01"
                value={metrics.profit_margin || ''}
                onChange={(e) => updateField('profit_margin', parseNumber(e.target.value))}
                placeholder="0.00"
                className="h-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Growth & Size */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Crecimiento y Tamaño
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="revenue_growth" className="text-xs text-muted-foreground">Crecimiento Ingresos %</Label>
              <Input
                id="revenue_growth"
                type="number"
                step="0.01"
                value={metrics.revenue_growth || ''}
                onChange={(e) => updateField('revenue_growth', parseNumber(e.target.value))}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="market_cap" className="text-xs text-muted-foreground">Market Cap</Label>
              <Input
                id="market_cap"
                type="text"
                value={metrics.market_cap || ''}
                onChange={(e) => updateField('market_cap', e.target.value)}
                placeholder="50B"
                className="h-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Events */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-orange-500" />
              Eventos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="earnings_date" className="text-xs text-muted-foreground">Próximo Earnings</Label>
              <Input
                id="earnings_date"
                type="date"
                value={metrics.earnings_date || ''}
                onChange={(e) => updateField('earnings_date', e.target.value)}
                className="h-9"
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="json" className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm">Métricas en formato JSON</Label>
          <Textarea
            value={jsonValue}
            onChange={(e) => handleJsonChange(e.target.value)}
            rows={16}
            className="font-mono text-sm"
            placeholder="{}"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Pega aquí el JSON generado por IA. Campos: per, ev_ebitda, roic, revenue_growth, gross_margin, fcf_yield, market_cap, forward_pe, price_to_book, profit_margin, earnings_date
            </p>
            <button
              type="button"
              onClick={applyJson}
              className="text-xs text-primary hover:underline"
            >
              Aplicar JSON
            </button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
