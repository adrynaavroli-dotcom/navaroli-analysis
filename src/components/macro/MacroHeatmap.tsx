import { useMemo } from 'react';
import { MacroIndicator, MacroCategory, categoryLabels } from '@/lib/macro-data';
import { cn } from '@/lib/utils';

interface MacroHeatmapProps {
  indicators: MacroIndicator[];
}

type Signal = 'positive' | 'neutral' | 'negative';

function getSignal(indicator: MacroIndicator): Signal {
  if (indicator.data.length < 2) return 'neutral';

  const change = indicator.latestValue - indicator.previousValue;
  const changePercent = indicator.previousValue !== 0
    ? (change / Math.abs(indicator.previousValue)) * 100
    : 0;

  // For these indicators, lower is better
  const invertedSignal = ['unemployment', 'stress'].includes(indicator.id);
  const threshold = 0.5; // % change threshold for signal

  if (Math.abs(changePercent) < threshold) return 'neutral';

  const improving = invertedSignal ? change < 0 : change > 0;
  return improving ? 'positive' : 'negative';
}

const signalStyles: Record<Signal, { bg: string; dot: string; text: string }> = {
  positive: {
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
  },
  neutral: {
    bg: 'bg-slate-500/10 border-slate-500/20',
    dot: 'bg-slate-400',
    text: 'text-slate-400',
  },
  negative: {
    bg: 'bg-red-500/10 border-red-500/20',
    dot: 'bg-red-400',
    text: 'text-red-400',
  },
};

export function MacroHeatmap({ indicators }: MacroHeatmapProps) {
  const categories = ['growth', 'inflation', 'liquidity', 'sentiment'] as MacroCategory[];

  const signalData = useMemo(() => {
    return indicators.map(ind => ({
      ...ind,
      signal: getSignal(ind),
    }));
  }, [indicators]);

  const overallScore = useMemo(() => {
    const scores = signalData.map(d => d.signal === 'positive' ? 1 : d.signal === 'negative' ? -1 : 0);
    const total = scores.reduce((a, b) => a + b, 0);
    const max = scores.length;
    if (max === 0) return 0;
    return Math.round((total / max) * 100);
  }, [signalData]);

  const overallSignal: Signal = overallScore > 20 ? 'positive' : overallScore < -20 ? 'negative' : 'neutral';

  if (indicators.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/80 backdrop-blur-sm p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
            Economic Heatmap
          </h3>
          <div className={cn(
            'flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono font-medium',
            signalStyles[overallSignal].bg,
            signalStyles[overallSignal].text,
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', signalStyles[overallSignal].dot)} />
            {overallSignal === 'positive' ? 'EXPANSIÓN' : overallSignal === 'negative' ? 'CONTRACCIÓN' : 'MIXTO'}
          </div>
        </div>
        <span className="text-[10px] font-mono text-slate-600">
          Score: {overallScore > 0 ? '+' : ''}{overallScore}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {categories.map((cat) => {
          const catIndicators = signalData.filter(d => d.category === cat);
          if (catIndicators.length === 0) return null;

          return (
            <div key={cat} className="space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">
                {categoryLabels[cat]}
              </span>
              <div className="space-y-0.5">
                {catIndicators.map((ind) => {
                  const styles = signalStyles[ind.signal];
                  const change = ind.latestValue - ind.previousValue;
                  const changePercent = ind.previousValue !== 0
                    ? (change / Math.abs(ind.previousValue)) * 100
                    : 0;

                  return (
                    <div
                      key={ind.id}
                      className={cn(
                        'flex items-center justify-between px-2 py-1 rounded border transition-colors',
                        styles.bg,
                      )}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', styles.dot)} />
                        <span className="text-[10px] sm:text-[11px] font-mono text-slate-300 truncate">
                          {ind.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono text-slate-400">
                          {ind.latestValue >= 1000
                            ? `${(ind.latestValue / 1000).toFixed(1)}K`
                            : ind.latestValue.toFixed(1)}
                        </span>
                        <span className={cn('text-[9px] font-mono font-medium', styles.text)}>
                          {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
