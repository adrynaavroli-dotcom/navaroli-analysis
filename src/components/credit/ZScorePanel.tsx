import { ZScoreResult } from '@/lib/credit-analysis';
import { cn } from '@/lib/utils';

interface ZScorePanelProps {
  result: ZScoreResult;
}

const zoneConfig = {
  safe: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    barColor: 'bg-emerald-400',
  },
  grey: {
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    barColor: 'bg-amber-400',
  },
  distress: {
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    barColor: 'bg-red-400',
  },
};

function ZScoreGauge({ zScore }: { zScore: number }) {
  // Map Z-Score to 0-100% for the gauge (range: -1 to 5)
  const minZ = -1;
  const maxZ = 5;
  const clampedZ = Math.max(minZ, Math.min(maxZ, zScore));
  const percentage = ((clampedZ - minZ) / (maxZ - minZ)) * 100;

  // Zone boundaries as percentages
  const distressEnd = ((1.81 - minZ) / (maxZ - minZ)) * 100;
  const greyEnd = ((2.99 - minZ) / (maxZ - minZ)) * 100;

  return (
    <div className="space-y-2">
      {/* Gauge bar */}
      <div className="relative h-4 rounded-full overflow-hidden bg-slate-800 border border-slate-700/50">
        {/* Zone backgrounds */}
        <div
          className="absolute inset-y-0 left-0 bg-red-500/20"
          style={{ width: `${distressEnd}%` }}
        />
        <div
          className="absolute inset-y-0 bg-amber-500/15"
          style={{ left: `${distressEnd}%`, width: `${greyEnd - distressEnd}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-emerald-500/15"
          style={{ left: `${greyEnd}%` }}
        />

        {/* Score indicator */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)] transition-all duration-700"
          style={{ left: `${Math.max(0.5, Math.min(99.5, percentage))}%` }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[9px] font-mono">
        <span className="text-red-400/70">Distress (&lt;1.81)</span>
        <span className="text-amber-400/70">Grey (1.81–2.99)</span>
        <span className="text-emerald-400/70">Safe (&gt;2.99)</span>
      </div>
    </div>
  );
}

export function ZScorePanel({ result }: ZScorePanelProps) {
  const config = zoneConfig[result.zone];

  const components = [
    { label: 'X1', formula: 'Working Capital / Total Assets', value: result.x1, coeff: 1.2 },
    { label: 'X2', formula: 'Retained Earnings / Total Assets', value: result.x2, coeff: 1.4 },
    { label: 'X3', formula: 'EBIT / Total Assets', value: result.x3, coeff: 3.3 },
    { label: 'X4', formula: 'Market Cap / Total Liabilities', value: result.x4, coeff: 0.6 },
    { label: 'X5', formula: 'Revenue / Total Assets', value: result.x5, coeff: 1.0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
          Altman Z-Score
        </h3>
        <span className="text-[9px] font-mono text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
          Modelo 1968
        </span>
      </div>

      {/* Main score display */}
      <div className={cn(
        'rounded-lg border p-4 text-center',
        config.bg,
        config.border,
      )}>
        <div className="mb-1">
          <span className={cn('text-4xl font-mono font-black tracking-tight', config.color)}>
            {result.zScore.toFixed(2)}
          </span>
        </div>
        <div className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold',
          config.bg, config.border, config.color, 'border'
        )}>
          <span className={cn('h-1.5 w-1.5 rounded-full', config.barColor)} />
          {result.zoneLabelEs}
        </div>
      </div>

      {/* Gauge */}
      <ZScoreGauge zScore={result.zScore} />

      {/* Component breakdown */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-mono text-slate-500 uppercase">Desglose de componentes</span>
        {components.map((comp) => {
          const contribution = comp.coeff * comp.value;
          const isNegative = contribution < 0;
          return (
            <div
              key={comp.label}
              className="flex items-center justify-between px-2.5 py-1.5 rounded border border-slate-700/30 bg-slate-800/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono font-bold text-slate-300 w-5">{comp.label}</span>
                <span className="text-[9px] font-mono text-slate-500 truncate">{comp.formula}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[10px] font-mono text-slate-400">
                  {comp.value.toFixed(3)}
                </span>
                <span className="text-[10px] font-mono text-slate-600">×{comp.coeff}</span>
                <span className={cn(
                  'text-[10px] font-mono font-bold w-12 text-right',
                  isNegative ? 'text-red-400' : 'text-emerald-400'
                )}>
                  {contribution >= 0 ? '+' : ''}{contribution.toFixed(3)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
