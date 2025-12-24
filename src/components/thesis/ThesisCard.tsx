import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, Calendar } from 'lucide-react';
import { Thesis } from '@/types/thesis';
import { Sparkline } from './Sparkline';
import { cn } from '@/lib/utils';

interface ThesisCardProps {
  thesis: Thesis;
  index?: number;
}

const sectorColors: Record<string, string> = {
  Technology: 'bg-sector-technology/10 text-sector-technology',
  Healthcare: 'bg-sector-healthcare/10 text-sector-healthcare',
  Finance: 'bg-sector-finance/10 text-sector-finance',
  Energy: 'bg-sector-energy/10 text-sector-energy',
  Consumer: 'bg-sector-consumer/10 text-sector-consumer',
  Industrial: 'bg-sector-industrial/10 text-sector-industrial',
};

export function ThesisCard({ thesis, index = 0 }: ThesisCardProps) {
  const isLong = thesis.direction === 'long';
  const upside = thesis.target_price
    ? ((thesis.target_price - thesis.current_price) / thesis.current_price) * 100
    : null;

  return (
    <Link
      to={`/thesis/${thesis.id}`}
      className="bento-card group block"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-semibold tabular-nums">
              ${thesis.ticker}
            </span>
            <span
              className={cn(
                'thesis-tag',
                isLong ? 'thesis-tag-long' : 'thesis-tag-short'
              )}
            >
              {isLong ? 'Long' : 'Short'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {thesis.company_name}
          </p>
        </div>
        
        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>

      {/* Sparkline */}
      <div className="sparkline-container mb-4">
        <Sparkline data={thesis.sparkline_data} positive={isLong} />
      </div>

      {/* Price Info */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Current</p>
          <p className="text-xl font-semibold tabular-nums">
            ${thesis.current_price.toLocaleString()}
          </p>
        </div>
        
        {thesis.target_price && upside !== null && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-0.5">Target</p>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-medium tabular-nums">
                ${thesis.target_price.toLocaleString()}
              </span>
              <span
                className={cn(
                  'flex items-center text-xs font-medium',
                  upside >= 0 ? 'text-long' : 'text-short'
                )}
              >
                {upside >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {Math.abs(upside).toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <span
          className={cn(
            'sector-tag text-xs',
            sectorColors[thesis.sector] || 'bg-secondary text-secondary-foreground'
          )}
        >
          {thesis.sector}
        </span>
        
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {new Date(thesis.analysis_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
      </div>
    </Link>
  );
}
