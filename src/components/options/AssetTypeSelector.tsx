import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

export type AssetType = 'stock' | 'index' | 'etf' | 'commodity' | 'fx';

interface AssetTypeConfig {
  label: string;
  defaultExercise: 'european' | 'american';
  examples: string[];
}

export const ASSET_CONFIGS: Record<AssetType, AssetTypeConfig> = {
  stock: {
    label: 'Stocks',
    defaultExercise: 'american',
    examples: ['AAPL', 'MSFT', 'MC.PA', 'SAN.MC'],
  },
  index: {
    label: 'Indices',
    defaultExercise: 'european',
    examples: ['^SPX', '^STOXX50E', '^FTSE', '^N225'],
  },
  etf: {
    label: 'ETFs',
    defaultExercise: 'american',
    examples: ['SPY', 'QQQ', 'IWM', 'EEM'],
  },
  commodity: {
    label: 'Commodities',
    defaultExercise: 'american',
    examples: ['GC=F', 'CL=F', 'SI=F', 'NG=F'],
  },
  fx: {
    label: 'FX',
    defaultExercise: 'european',
    examples: ['EURUSD=X', 'GBPUSD=X', 'USDJPY=X'],
  },
};

/**
 * Infers exercise style from ticker suffix.
 * European markets (indices, FX, certain European exchanges) → European
 * US equities, ETFs → American
 */
export function inferExerciseStyle(ticker: string, assetType: AssetType): 'european' | 'american' {
  const t = ticker.toUpperCase().trim();

  // Indices are always European
  if (t.startsWith('^') || assetType === 'index') return 'european';

  // FX is European
  if (t.includes('=X') || assetType === 'fx') return 'european';

  // European exchange suffixes → European style options are common
  const europeanSuffixes = ['.PA', '.MC', '.MI', '.AS', '.BR', '.DE', '.L', '.SW', '.HK', '.T', '.SS', '.SZ'];
  if (europeanSuffixes.some(s => t.endsWith(s))) return 'european';

  // Default from asset type config
  return ASSET_CONFIGS[assetType].defaultExercise;
}

interface Props {
  value: AssetType;
  onChange: (type: AssetType, defaultExercise: 'european' | 'american') => void;
  onTickerSelect: (ticker: string) => void;
}

export function AssetTypeSelector({ value, onChange, onTickerSelect }: Props) {
  const config = ASSET_CONFIGS[value];

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Asset Type</Label>
      <Select
        value={value}
        onValueChange={(v: AssetType) => {
          const cfg = ASSET_CONFIGS[v];
          onChange(v, cfg.defaultExercise);
        }}
      >
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.entries(ASSET_CONFIGS) as [AssetType, AssetTypeConfig][]).map(([key, cfg]) => (
            <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex flex-wrap gap-1">
        {config.examples.map(t => (
          <Badge
            key={t}
            variant="outline"
            className="text-[10px] cursor-pointer hover:bg-accent transition-colors"
            onClick={() => onTickerSelect(t)}
          >
            {t}
          </Badge>
        ))}
      </div>
    </div>
  );
}
