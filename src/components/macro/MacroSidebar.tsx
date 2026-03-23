import { TrendingUp, Flame, Droplets, Gauge, BarChart3 } from 'lucide-react';
import { MacroCategory, categoryLabels, macroIndicators } from '@/lib/macro-data';
import { cn } from '@/lib/utils';

const categoryIcons: Record<MacroCategory, React.ReactNode> = {
  growth: <TrendingUp className="h-4 w-4" />,
  inflation: <Flame className="h-4 w-4" />,
  liquidity: <Droplets className="h-4 w-4" />,
  sentiment: <Gauge className="h-4 w-4" />,
};

interface MacroSidebarProps {
  activeCategory: MacroCategory | 'all';
  onCategoryChange: (cat: MacroCategory | 'all') => void;
}

export function MacroSidebar({ activeCategory, onCategoryChange }: MacroSidebarProps) {
  const categories = Object.keys(categoryLabels) as MacroCategory[];

  return (
    <aside className="w-56 shrink-0 border-r border-slate-700/50 bg-slate-950/60 backdrop-blur-sm">
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-200 tracking-wide">MACRO PANEL</h2>
        </div>
        <p className="text-[10px] text-slate-500 font-mono mt-1">Economic Indicators</p>
      </div>

      <nav className="p-2 space-y-0.5">
        <button
          onClick={() => onCategoryChange('all')}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors',
            activeCategory === 'all'
              ? 'bg-slate-800 text-slate-100'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          )}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Overview
        </button>

        {categories.map((cat) => {
          const count = macroIndicators.filter(i => i.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors',
                activeCategory === cat
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              )}
            >
              {categoryIcons[cat]}
              <span className="flex-1 text-left">{categoryLabels[cat]}</span>
              <span className="text-[10px] font-mono text-slate-500">{count}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto p-4 border-t border-slate-700/50">
        <div className="text-[10px] font-mono text-slate-600 space-y-1">
          <p>Data: FRED (Mock)</p>
          <p>Updated: {new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </aside>
  );
}
