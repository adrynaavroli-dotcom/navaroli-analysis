import { MacroDataPoint, isYieldCurveInverted } from '@/lib/macro-data';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecessionWidgetProps {
  data: MacroDataPoint[];
}

export function RecessionWidget({ data }: RecessionWidgetProps) {
  const { inverted, spread, duration } = isYieldCurveInverted(data);

  if (data.length === 0) {
    return (
      <div className="flex-1 rounded-lg border border-slate-700/30 bg-slate-900/40 p-4">
        <p className="text-xs text-slate-500 font-mono">Loading yield curve data...</p>
      </div>
    );
  }

  return (
    <div className={cn(
      'flex-1 rounded-lg border p-4 backdrop-blur-sm',
      inverted
        ? 'border-red-500/30 bg-red-950/30'
        : 'border-emerald-500/20 bg-emerald-950/20'
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg',
          inverted ? 'bg-red-500/20' : 'bg-emerald-500/20'
        )}>
          {inverted
            ? <AlertTriangle className="h-5 w-5 text-red-400" />
            : <ShieldCheck className="h-5 w-5 text-emerald-400" />
          }
        </div>
        <div>
          <h3 className={cn(
            'text-sm font-semibold',
            inverted ? 'text-red-300' : 'text-emerald-300'
          )}>
            {inverted ? 'RECESSION RISK — YIELD CURVE INVERTED' : 'YIELD CURVE NORMAL'}
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            10Y-2Y Spread: <span className={inverted ? 'text-red-400' : 'text-emerald-400'}>
              {spread.toFixed(0)} bps
            </span>
            {inverted && duration > 0 && (
              <span className="ml-2 text-slate-500">
                Inverted for {duration} month{duration > 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
      </div>

      {inverted && (
        <div className="mt-3 rounded bg-red-950/50 border border-red-500/10 px-3 py-2">
          <p className="text-[11px] text-red-300/80 leading-relaxed font-mono">
            ⚠ Historical pattern: yield curve inversions have preceded every US recession since 1970.
            Average lead time: 12-18 months. Current inversion: {duration} months.
          </p>
        </div>
      )}
    </div>
  );
}
