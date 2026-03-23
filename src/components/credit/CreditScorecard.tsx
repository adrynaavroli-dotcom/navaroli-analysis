import { RatioResult } from '@/lib/credit-analysis';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface CreditScorecardProps {
  ratios: RatioResult[];
}

const signalColors: Record<string, { bg: string; border: string; dot: string; text: string }> = {
  green: {
    bg: 'bg-emerald-500/8',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
  },
  yellow: {
    bg: 'bg-amber-500/8',
    border: 'border-amber-500/20',
    dot: 'bg-amber-400',
    text: 'text-amber-400',
  },
  red: {
    bg: 'bg-red-500/8',
    border: 'border-red-500/20',
    dot: 'bg-red-400',
    text: 'text-red-400',
  },
};

export function CreditScorecard({ ratios }: CreditScorecardProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
          Scorecard de Ratios
        </h3>
        <span className="text-[9px] font-mono text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
          S&P / Moody's
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {ratios.map((ratio) => {
          const colors = signalColors[ratio.signal];
          return (
            <div
              key={ratio.id}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                colors.bg,
                colors.border,
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full shrink-0', colors.dot)} />
                  <span className="text-[11px] font-mono font-medium text-slate-300">
                    {ratio.nameEs}
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-slate-600 cursor-help shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs">
                    {ratio.descriptionEs}
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-lg font-mono font-bold text-slate-100">
                  {ratio.formatted}
                </span>
                <span className={cn('text-[10px] font-mono font-medium', colors.text)}>
                  {ratio.interpretationEs}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
