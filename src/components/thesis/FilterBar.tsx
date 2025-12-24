import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThesisFilters, ThesisDirection, InvestmentStrategy, MarketCapCategory } from '@/types/thesis';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  filters: ThesisFilters;
  onFilterChange: (filters: ThesisFilters) => void;
  availableSectors: string[];
}

const strategies: { value: InvestmentStrategy; label: string }[] = [
  { value: 'value', label: 'Value' },
  { value: 'growth', label: 'Growth' },
  { value: 'compounder', label: 'Compounder' },
  { value: 'turnaround', label: 'Turnaround' },
  { value: 'dividend', label: 'Dividend' },
];

const directions: { value: ThesisDirection; label: string }[] = [
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
];

const marketCaps: { value: MarketCapCategory; label: string }[] = [
  { value: 'mega', label: 'Mega Cap' },
  { value: 'large', label: 'Large Cap' },
  { value: 'mid', label: 'Mid Cap' },
  { value: 'small', label: 'Small Cap' },
  { value: 'micro', label: 'Micro Cap' },
];

export function FilterBar({ filters, onFilterChange, availableSectors }: FilterBarProps) {
  const hasActiveFilters = Object.values(filters).some((v) => v !== null);

  const toggleFilter = <K extends keyof ThesisFilters>(
    key: K,
    value: ThesisFilters[K]
  ) => {
    onFilterChange({
      ...filters,
      [key]: filters[key] === value ? null : value,
    });
  };

  const clearFilters = () => {
    onFilterChange({
      sector: null,
      direction: null,
      strategy: null,
      marketCap: null,
    });
  };

  return (
    <div className="space-y-4">
      {/* Direction */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Direction
        </p>
        <div className="flex flex-wrap gap-2">
          {directions.map((dir) => (
            <button
              key={dir.value}
              onClick={() => toggleFilter('direction', dir.value)}
              className={cn(
                'filter-pill',
                filters.direction === dir.value && 'filter-pill-active'
              )}
            >
              {dir.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sector */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Sector
        </p>
        <div className="flex flex-wrap gap-2">
          {availableSectors.map((sector) => (
            <button
              key={sector}
              onClick={() => toggleFilter('sector', sector)}
              className={cn(
                'filter-pill',
                filters.sector === sector && 'filter-pill-active'
              )}
            >
              {sector}
            </button>
          ))}
        </div>
      </div>

      {/* Strategy */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Strategy
        </p>
        <div className="flex flex-wrap gap-2">
          {strategies.map((strat) => (
            <button
              key={strat.value}
              onClick={() => toggleFilter('strategy', strat.value)}
              className={cn(
                'filter-pill',
                filters.strategy === strat.value && 'filter-pill-active'
              )}
            >
              {strat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Market Cap */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Market Cap
        </p>
        <div className="flex flex-wrap gap-2">
          {marketCaps.map((cap) => (
            <button
              key={cap.value}
              onClick={() => toggleFilter('marketCap', cap.value)}
              className={cn(
                'filter-pill',
                filters.marketCap === cap.value && 'filter-pill-active'
              )}
            >
              {cap.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3 mr-1" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
