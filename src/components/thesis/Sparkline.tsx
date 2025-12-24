import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
  data: number[];
  className?: string;
  positive?: boolean;
}

export function Sparkline({ data, className, positive = true }: SparklineProps) {
  const pathData = useMemo(() => {
    if (!data || data.length < 2) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const width = 100;
    const height = 32;
    const padding = 2;

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    });

    return `M${points.join(' L')}`;
  }, [data]);

  const gradientId = useMemo(() => `sparkline-gradient-${Math.random().toString(36).substr(2, 9)}`, []);

  if (!data || data.length < 2) {
    return (
      <div className={cn('h-8 w-full flex items-center justify-center', className)}>
        <span className="text-xs text-muted-foreground">No data</span>
      </div>
    );
  }

  const strokeColor = positive ? 'hsl(var(--long))' : 'hsl(var(--short))';
  const fillColor = positive ? 'hsl(var(--long) / 0.1)' : 'hsl(var(--short) / 0.1)';

  return (
    <svg
      viewBox="0 0 100 32"
      className={cn('h-8 w-full', className)}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillColor} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      
      {/* Fill area */}
      <path
        d={`${pathData} L100,32 L0,32 Z`}
        fill={`url(#${gradientId})`}
      />
      
      {/* Line */}
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-sparkline-draw"
        style={{ strokeDasharray: 200, strokeDashoffset: 0 }}
      />
    </svg>
  );
}
