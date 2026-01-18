import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ThesisChartData, ChartDataPoint } from '@/types/thesis';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Plus, Trash2, TrendingUp } from 'lucide-react';

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
  const updateRevenue = (points: ChartDataPoint[]) => {
    onChange({ ...chartData, revenue: points });
  };

  const updateMargins = (points: ChartDataPoint[]) => {
    onChange({ ...chartData, margins: points });
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
    
    onChange({ revenue: sampleRevenue, margins: sampleMargins });
  };

  return (
    <div className="space-y-6">
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
    </div>
  );
}
