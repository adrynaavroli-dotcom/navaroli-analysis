import { useState, useMemo } from 'react';
import { TrendingUp, Flame, Droplets, Gauge, BarChart3, Menu, X } from 'lucide-react';
import { MacroCategory, MacroIndicator, categoryLabels } from '@/lib/macro-data';
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
  indicators: MacroIndicator[];
}

export function MacroSidebar({ activeCategory, onCategoryChange, indicators }: MacroSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const categories = Object.keys(categoryLabels) as MacroCategory[];

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cat of categories) {
      map[cat] = indicators.filter(i => i.category === cat).length;
    }
    return map;
  }, [indicators]);

  const handleCategoryChange = (cat: MacroCategory | 'all') => {
    onCategoryChange(cat);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <>
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-200 tracking-wide">MACRO PANEL</h2>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[10px] text-slate-500 font-mono mt-1">FRED Live Data</p>
      </div>

      <nav className="p-2 space-y-0.5">
        <button
          onClick={() => handleCategoryChange('all')}
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

        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategoryChange(cat)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors',
              activeCategory === cat
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            )}
          >
            {categoryIcons[cat]}
            <span className="flex-1 text-left">{categoryLabels[cat]}</span>
            <span className="text-[10px] font-mono text-slate-500">{counts[cat] || 0}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto p-4 border-t border-slate-700/50">
        <div className="text-[10px] font-mono text-slate-600 space-y-1">
          <p>Source: FRED API</p>
          <p>Cache: 30 min</p>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700/50 rounded-lg text-xs font-mono text-slate-300 hover:text-slate-100 shadow-lg backdrop-blur-sm transition-colors"
      >
        <Menu className="h-4 w-4" />
        <span>{activeCategory === 'all' ? 'Overview' : categoryLabels[activeCategory as MacroCategory]}</span>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - desktop always visible, mobile as overlay */}
      <aside className={cn(
        'shrink-0 border-r border-slate-700/50 bg-slate-950/95 backdrop-blur-sm flex flex-col',
        // Desktop
        'hidden lg:flex lg:w-56',
        // Mobile overlay
        mobileOpen && 'fixed inset-y-0 left-0 z-50 flex w-64 lg:relative lg:w-56'
      )}>
        {sidebarContent}
      </aside>
    </>
  );
}
