import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ThesisChartData, ChartDataPoint } from '@/types/thesis';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Plus, Trash2, TrendingUp, Code, LayoutGrid } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

interface ChartDataFormSectionProps {
  chartData: ThesisChartData;
  onChange: (chartData: ThesisChartData) => void;
}

function DataPointEditor({ 
  points, 
  onChange, 
  label 
}: { 
  points: ChartDataPoint[]; 
  onChange: (points: ChartDataPoint[]) => void;
  label: string;
}) {
  const addPoint = () => {
    const currentYear = new Date().getFullYear();
    const lastYear = points.length > 0 
      ? parseInt(points[points.length - 1].year) + 1 
      : currentYear - 4;
    onChange([...points, { year: lastYear.toString(), value: 0 }]);
  };

  const updatePoint = (index: number, field: keyof ChartDataPoint, value: string | number) => {
    const newPoints = [...points];
    newPoints[index] = { ...newPoints[index], [field]: value };
    onChange(newPoints);
  };

  const removePoint = (index: number) => {
    onChange(points.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={addPoint} className="h-7 px-2">
          <Plus className="h-3 w-3 mr-1" />
          Añadir
        </Button>
      </div>
      
      {points.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sin datos. Haz clic en "Añadir" para empezar.</p>
      ) : (
        <div className="space-y-2">
          {points.map((point, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                type="text"
                value={point.year}
                onChange={(e) => updatePoint(index, 'year', e.target.value)}
                placeholder="Año"
                className="h-8 w-20 text-xs"
              />
              <Input
                type="number"
                value={point.value}
                onChange={(e) => updatePoint(index, 'value', parseFloat(e.target.value) || 0)}
                placeholder="Valor"
                className="h-8 flex-1 text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removePoint(index)}
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChartDataFormSection({ chartData, onChange }: ChartDataFormSectionProps) {
  const { toast } = useToast();
  const [jsonValue, setJsonValue] = useState(() => JSON.stringify(chartData, null, 2));

  // Sync jsonValue when chartData changes externally
  useEffect(() => {
    setJsonValue(JSON.stringify(chartData, null, 2));
  }, [chartData]);

  const updateRevenue = (points: ChartDataPoint[]) => {
    const newData = { ...chartData, revenue: points };
    onChange(newData);
    setJsonValue(JSON.stringify(newData, null, 2));
  };

  const updateMargins = (points: ChartDataPoint[]) => {
    const newData = { ...chartData, margins: points };
    onChange(newData);
    setJsonValue(JSON.stringify(newData, null, 2));
  };

  const generateSampleData = () => {
    const currentYear = new Date().getFullYear();
    const sampleRevenue: ChartDataPoint[] = [];
    const sampleMargins: ChartDataPoint[] = [];
    
    for (let i = 4; i >= 0; i--) {
      const year = (currentYear - i).toString();
      sampleRevenue.push({ year, value: Math.round(100 + Math.random() * 50) });
      sampleMargins.push({ year, value: Math.round(20 + Math.random() * 15) });
    }
    
    const newData = { revenue: sampleRevenue, margins: sampleMargins };
    onChange(newData);
    setJsonValue(JSON.stringify(newData, null, 2));
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
      toast({ title: 'JSON aplicado', description: 'Los datos de gráficos han sido actualizados' });
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Añade datos históricos para los gráficos de la tesis
          </p>
          <Button type="button" variant="outline" size="sm" onClick={generateSampleData}>
            Generar ejemplo
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              Ingresos (Revenue)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataPointEditor
              points={chartData.revenue || []}
              onChange={updateRevenue}
              label="Datos anuales de ingresos"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Márgenes (%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataPointEditor
              points={chartData.margins || []}
              onChange={updateMargins}
              label="Datos anuales de márgenes"
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="json" className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm">Datos de gráficos en formato JSON</Label>
          <Textarea
            value={jsonValue}
            onChange={(e) => handleJsonChange(e.target.value)}
            rows={16}
            className="font-mono text-sm"
            placeholder="{}"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Puedes añadir cualquier serie de datos. Estructura: {"{"}"nombre_serie": [{"{"}"year": "2020", "value": 100{"}"}]{"}"}
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
        
        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Ejemplo de JSON flexible:</p>
            <pre className="text-xs overflow-x-auto">
{`{
  "revenue": [{"year": "2021", "value": 100}, {"year": "2022", "value": 120}],
  "margins": [{"year": "2021", "value": 25}, {"year": "2022", "value": 28}],
  "ebitda": [{"year": "2021", "value": 30}, {"year": "2022", "value": 35}],
  "custom_metric": [{"year": "2021", "value": 50}]
}`}
            </pre>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
