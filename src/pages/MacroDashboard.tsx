import { useState } from 'react';
import { MacroCategory, categoryLabels } from '@/lib/macro-data';
import { useMacroData } from '@/hooks/useMacroData';
import { MacroChart } from '@/components/macro/MacroChart';
import { MacroSidebar } from '@/components/macro/MacroSidebar';
import { RecessionWidget } from '@/components/macro/RecessionWidget';
import { MacroHeatmap } from '@/components/macro/MacroHeatmap';
import { Header } from '@/components/layout/Header';
import { ArrowUpRight, ArrowDownRight, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MacroDashboard() {
  const [activeCategory, setActiveCategory] = useState<MacroCategory | 'all'>('all');
  const { indicators, isLoading, error, refetch } = useMacroData();

  const filtered = activeCategory === 'all'
    ? indicators
    : indicators.filter(i => i.category === activeCategory);

  const categories = activeCategory === 'all'
    ? (['growth', 'inflation', 'liquidity', 'sentiment'] as MacroCategory[])
    : [activeCategory as MacroCategory];

  const yieldCurveData = indicators.find(i => i.id === 'yield-curve')?.data ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header />
      <div className="flex flex-col lg:flex-row" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
        <MacroSidebar
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          indicators={indicators}
        />

        <main className="flex-1 overflow-auto p-3 sm:p-6 space-y-4 sm:space-y-6 pb-20 lg:pb-6">
          {/* Status bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:justify-between">
            <RecessionWidget data={yieldCurveData} />
            <button
              onClick={refetch}
              disabled={isLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-mono text-slate-400 hover:text-slate-200 bg-slate-800 rounded-md border border-slate-700/50 transition-colors disabled:opacity-50 shrink-0"
            >
              {isLoading
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RefreshCw className="h-3 w-3" />
              }
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div className="text-xs font-mono text-amber-400/80 bg-amber-950/30 border border-amber-500/20 rounded-md px-3 py-2">
              ⚠ {error}
            </div>
          )}

          {/* Economic Heatmap */}
          {indicators.length > 0 && <MacroHeatmap indicators={indicators} />}

          {/* Summary Ticker */}
          {indicators.length > 0 && (
            <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
              {indicators.slice(0, 6).map((ind) => {
                const change = ind.latestValue - ind.previousValue;
                const isUp = change >= 0;
                return (
                  <div
                    key={ind.id}
                    className="flex items-center gap-1.5 sm:gap-2 bg-slate-900/60 border border-slate-700/30 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 shrink-0"
                  >
                    <span className="text-[9px] sm:text-[10px] font-mono text-slate-500">{ind.fredSeriesId}</span>
                    <span className="text-[10px] sm:text-xs font-mono font-bold text-slate-200">
                      {ind.latestValue >= 1000
                        ? `${(ind.latestValue / 1000).toFixed(1)}K`
                        : ind.latestValue.toFixed(1)}
                    </span>
                    {isUp
                      ? <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                      : <ArrowDownRight className="h-3 w-3 text-red-400" />
                    }
                  </div>
                );
              })}
            </div>
          )}

          {/* Loading skeleton */}
          {isLoading && indicators.length === 0 && (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-slate-700/50 bg-slate-900/80 p-4 h-56 animate-pulse">
                  <div className="h-4 w-32 bg-slate-800 rounded mb-3" />
                  <div className="h-6 w-20 bg-slate-800 rounded mb-4" />
                  <div className="h-32 bg-slate-800/50 rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Charts by Category */}
          {categories.map((cat) => {
            const catIndicators = filtered.filter(i => i.category === cat);
            if (catIndicators.length === 0) return null;
            return (
              <section key={cat}>
                <h2 className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-widest mb-3">
                  {categoryLabels[cat]}
                </h2>
                <div className={cn(
                  'grid gap-3 sm:gap-4',
                  catIndicators.length <= 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
                )}>
                  {catIndicators.map((ind) => (
                    <MacroChart key={ind.id} indicator={ind} />
                  ))}
                </div>
              </section>
            );
          })}
        </main>
      </div>
    </div>
  );
}
