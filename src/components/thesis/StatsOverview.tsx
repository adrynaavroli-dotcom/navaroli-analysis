import { TrendingUp, TrendingDown, BarChart3, Target } from 'lucide-react';
import { Thesis } from '@/types/thesis';
import { cn } from '@/lib/utils';

interface StatsOverviewProps {
  theses: Thesis[];
}

export function StatsOverview({ theses }: StatsOverviewProps) {
  const longCount = theses.filter((t) => t.direction === 'long').length;
  const shortCount = theses.filter((t) => t.direction === 'short').length;
  const sectorsCount = new Set(theses.map((t) => t.sector)).size;
  
  const avgUpside = theses
    .filter((t) => t.target_price && t.direction === 'long')
    .reduce((acc, t) => {
      const upside = ((t.target_price! - t.current_price) / t.current_price) * 100;
      return acc + upside;
    }, 0) / Math.max(longCount, 1);

  const stats = [
    {
      label: 'Long Positions',
      value: longCount,
      icon: TrendingUp,
      color: 'text-long',
      bgColor: 'bg-long/10',
    },
    {
      label: 'Short Positions',
      value: shortCount,
      icon: TrendingDown,
      color: 'text-short',
      bgColor: 'bg-short/10',
    },
    {
      label: 'Sectors Covered',
      value: sectorsCount,
      icon: BarChart3,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'Avg. Upside (Long)',
      value: `${avgUpside.toFixed(0)}%`,
      icon: Target,
      color: 'text-long',
      bgColor: 'bg-long/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className="bento-card animate-fade-in"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', stat.bgColor)}>
              <stat.icon className={cn('h-4 w-4', stat.color)} />
            </div>
            <div>
              <p className="metric-value">{stat.value}</p>
              <p className="metric-label">{stat.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
