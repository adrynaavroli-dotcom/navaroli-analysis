import { useState } from 'react';
import { CreditInputs } from '@/lib/credit-analysis';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreditInputPanelProps {
  inputs: CreditInputs;
  onChange: (inputs: CreditInputs) => void;
}

interface FieldDef {
  key: keyof CreditInputs;
  label: string;
  tooltip: string;
  placeholder: string;
  optional?: boolean;
}

const balanceFields: FieldDef[] = [
  { key: 'totalAssets', label: 'Activo Total', tooltip: 'Total de activos en balance', placeholder: '50,000' },
  { key: 'currentAssets', label: 'Activo Corriente', tooltip: 'Activos líquidos a corto plazo (<1 año)', placeholder: '18,000' },
  { key: 'totalLiabilities', label: 'Pasivo Total', tooltip: 'Total de deuda y obligaciones', placeholder: '15,000' },
  { key: 'currentLiabilities', label: 'Pasivo Corriente', tooltip: 'Obligaciones a corto plazo (<1 año)', placeholder: '8,000' },
  { key: 'equity', label: 'Patrimonio Neto', tooltip: 'Capital propio de los accionistas', placeholder: '35,000' },
  { key: 'retainedEarnings', label: 'Reservas Retenidas', tooltip: 'Beneficios acumulados no distribuidos (Retained Earnings)', placeholder: '22,000' },
];

const incomeFields: FieldDef[] = [
  { key: 'revenue', label: 'Ventas Totales', tooltip: 'Ingresos totales del ejercicio', placeholder: '40,000' },
  { key: 'ebit', label: 'EBIT', tooltip: 'Beneficio Antes de Intereses e Impuestos', placeholder: '8,000' },
  { key: 'ebitda', label: 'EBITDA', tooltip: 'Si se deja vacío, se estima como EBIT + 10% de Ventas', placeholder: '10,000', optional: true },
  { key: 'interestExpense', label: 'Gastos Financieros', tooltip: 'Intereses pagados sobre la deuda', placeholder: '500' },
];

const marketFields: FieldDef[] = [
  { key: 'marketCap', label: 'Market Cap', tooltip: 'Valor de mercado del patrimonio. Si se deja vacío, se usa el valor contable como proxy', placeholder: '75,000', optional: true },
];

function FieldGroup({ title, fields, inputs, onChange }: {
  title: string;
  fields: FieldDef[];
  inputs: CreditInputs;
  onChange: (key: keyof CreditInputs, value: number | null) => void;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-widest">
        {title}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {fields.map((field) => {
          const rawValue = inputs[field.key];
          const displayValue = rawValue === null ? '' : String(rawValue);
          return (
            <div key={field.key} className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-[11px] font-mono text-slate-400">
                  {field.label}
                  {field.optional && <span className="text-slate-600 ml-1">(opt)</span>}
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-slate-600 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] text-xs">
                    {field.tooltip}
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                type="number"
                value={displayValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' && field.optional) {
                    onChange(field.key, null);
                  } else {
                    onChange(field.key, parseFloat(val) || 0);
                  }
                }}
                placeholder={field.placeholder}
                className={cn(
                  'h-8 text-xs font-mono bg-slate-800/50 border-slate-700/50',
                  'text-slate-200 placeholder:text-slate-600',
                  'focus:border-emerald-500/50 focus:ring-emerald-500/20'
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CreditInputPanel({ inputs, onChange }: CreditInputPanelProps) {
  const handleFieldChange = (key: keyof CreditInputs, value: number | null) => {
    onChange({ ...inputs, [key]: value });
  };

  return (
    <div className="space-y-4">
      <FieldGroup title="Balance" fields={balanceFields} inputs={inputs} onChange={handleFieldChange} />
      <FieldGroup title="Cuenta de Resultados" fields={incomeFields} inputs={inputs} onChange={handleFieldChange} />
      <FieldGroup title="Mercado" fields={marketFields} inputs={inputs} onChange={handleFieldChange} />
    </div>
  );
}
