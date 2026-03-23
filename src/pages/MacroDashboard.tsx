import { useState } from 'react';
import { MacroCategory, macroIndicators, categoryLabels } from '@/lib/macro-data';
import { MacroChart } from '@/components/macro/MacroChart';
import { MacroSidebar } from '@/components/macro/MacroSidebar';
import { RecessionWidget } from '@/components/macro/RecessionWidget';
import { Header } from '@/components/layout/Header';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MacroDashboard() {
  const [activeCategory, setActiveCategory] = useState<MacroCategory | 'all'>('all');

  const filtered = activeCategory === 'all'
    ? macroIndicators
    : macroIndicators.filter(i => i.category === activeCategory);

  const categories = activeCategory === 'all'
    ? (['growth', 'inflation', 'liquidity', 'sentiment'] as MacroCategory[])
    : [activeCategory as MacroCategory];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header />
      <div className="flex" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
        <MacroSidebar activeCategory={activeCategory} onCategoryChange={setActiveCategory} />

        <main className="flex-1 overflow-auto p-6 space-y-6">
          {/* Recession Widget */}
          <RecessionWidget />

          {/* Summary Ticker */}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {macroIndicators.slice(0, 6).map((ind) => {
              const change = ind.latestValue - ind.previousValue;
              const isUp = change >= 0;
              return (
                <div
                  key={ind.id}
                  className="flex items-center gap-2 bg-slate-900/60 border border-slate-700/30 rounded-md px-3 py-2 shrink-0"
                >
                  <span className="text-[10px] font-mono text-slate-500">{ind.fredSeriesId}</span>
                  <span className="text-xs font-mono font-bold text-slate-200">
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

          {/* Charts by Category */}
          {categories.map((cat) => {
            const indicators = macroIndicators.filter(i => i.category === cat);
            return (
              <section key={cat}>
                <h2 className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-widest mb-3">
                  {categoryLabels[cat]}
                </h2>
                <div className={cn(
                  'grid gap-4',
                  indicators.length <= 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
                )}>
                  {indicators.map((ind) => (
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
