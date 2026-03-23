import { useState, useMemo, useId } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine,
} from 'recharts';
import { MacroIndicator, filterByPeriod } from '@/lib/macro-data';
import { cn } from '@/lib/utils';

type Period = '1Y' | '5Y' | 'Max';
type Scale = 'linear' | 'log';

interface MacroChartProps {
  indicator: MacroIndicator;
  className?: string;
}

export function MacroChart({ indicator, className }: MacroChartProps) {
  const uniqueId = useId();
  const gradientId = `gradient-${uniqueId.replace(/:/g, '')}`;
  const [period, setPeriod] = useState<Period>('5Y');
  const [scale, setScale] = useState<Scale>('linear');

  const filteredData = useMemo(
    () => filterByPeriod(indicator.data, period),
    [indicator.data, period]
  );

  const change = indicator.latestValue - indicator.previousValue;
  const changePercent = indicator.previousValue !== 0
    ? (change / Math.abs(indicator.previousValue)) * 100
    : 0;
  const isPositive = change >= 0;

  const invertedColor = ['unemployment', 'stress'].includes(indicator.id);
  const trendColor = (isPositive && !invertedColor) || (!isPositive && invertedColor)
    ? 'hsl(142, 71%, 45%)'
    : 'hsl(0, 84%, 60%)';

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  const formatValue = (val: number) => {
    if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toFixed(indicator.unit === '%' ? 1 : 2);
  };

  const hasData = filteredData.length > 0;

  return (
    <div className={cn(
      'rounded-lg border border-slate-700/50 bg-slate-900/80 backdrop-blur-sm p-3 sm:p-4',
      className
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-xs sm:text-sm font-medium text-slate-300 truncate">{indicator.name}</h3>
            <span className="text-[9px] sm:text-[10px] font-mono text-slate-500 bg-slate-800 px-1 sm:px-1.5 py-0.5 rounded shrink-0">
              {indicator.fredSeriesId}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2 mt-1">
            <span className="text-lg sm:text-xl font-mono font-bold text-slate-100">
              {hasData ? formatValue(indicator.latestValue) : '—'}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-400">{indicator.unit}</span>
            {hasData && (
              <span
                className="text-[10px] sm:text-xs font-mono font-medium"
                style={{ color: trendColor }}
              >
                {isPositive ? '▲' : '▼'} {Math.abs(changePercent).toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-1 shrink-0">
          <div className="flex bg-slate-800 rounded p-0.5">
            {(['1Y', '5Y', 'Max'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-mono rounded transition-colors',
                  period === p
                    ? 'bg-slate-600 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={() => setScale(s => s === 'linear' ? 'log' : 'linear')}
            className={cn(
              'px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-mono rounded transition-colors bg-slate-800',
              scale === 'log'
                ? 'text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            LOG
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-32 sm:h-40">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={trendColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={trendColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 20%, 20%)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: 'hsl(215, 15%, 50%)' }}
                axisLine={{ stroke: 'hsl(215, 20%, 25%)' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                scale={scale}
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: 'hsl(215, 15%, 50%)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatValue(v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(222, 47%, 11%)',
                  border: '1px solid hsl(215, 20%, 25%)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: 'hsl(215, 15%, 80%)',
                }}
                labelFormatter={formatDate}
                formatter={(value: number) => [formatValue(value), indicator.name]}
              />
              {indicator.id === 'yield-curve' && (
                <ReferenceLine y={0} stroke="hsl(0, 84%, 60%)" strokeDasharray="4 4" strokeOpacity={0.6} />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke={trendColor}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={false}
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center">
            <span className="text-xs text-slate-600 font-mono">No data available</span>
          </div>
        )}
      </div>
    </div>
  );
}
