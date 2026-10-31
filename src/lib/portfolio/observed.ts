/**
 * Observed-data walk-forward evaluation for POR-001 — builds the aligned return
 * panel from the recorded multi-asset snapshot (Returns Engine only) and runs
 * the walk-forward protocol. Kept separate from the engine so the engine never
 * touches data loading.
 */
import { alignPrices, panelReturns, type PriceSeries } from '../returns';
import { DEFAULT_WALKFORWARD, walkForward, type WalkForwardResult } from './walkforward';

export interface Por001Snapshot {
  meta: {
    source: string; extractedAt: string; period: string; frequency: string;
    currency: string; timezone: string; adjustment: string; tickers: string[];
  };
  series: Record<string, { dates: string[]; closes: number[] }>;
}

export interface Por001ObservedRecord {
  dataType: 'OBSERVED MARKET DATA';
  snapshot: {
    path: string; extractedAt: string; provider: string; tickers: string[];
    currency: string; priceBasis: string; priceRows: number; firstPriceDate: string; lastPriceDate: string;
  };
  returns: { kind: 'log'; n: number; firstDate: string; lastDate: string; droppedPerTicker: Record<string, number> };
  protocol: typeof DEFAULT_WALKFORWARD & { minOrigins: number };
  outcome: WalkForwardResult;
  implementationVersion: string;
  evaluatedAt: string;
  runtimeMs: number;
}

export const POR001_SNAPSHOT_PATH = 'src/lib/validation/fixtures/por001-snapshot.json';
const MIN_ORIGINS = 5;

export function runObservedWalkForward(snap: Por001Snapshot, implementationVersion: string): Por001ObservedRecord {
  const t0 = performance.now();
  const prices = alignPrices(
    Object.fromEntries(snap.meta.tickers.map((t) => [t, { dates: snap.series[t].dates, prices: snap.series[t].closes } as PriceSeries])),
  );
  const rets = panelReturns(prices, 'log');
  const outcome = walkForward(rets, DEFAULT_WALKFORWARD);
  const first = snap.series[snap.meta.tickers[0]];
  return {
    dataType: 'OBSERVED MARKET DATA',
    snapshot: {
      path: POR001_SNAPSHOT_PATH,
      extractedAt: snap.meta.extractedAt,
      provider: snap.meta.source,
      tickers: snap.meta.tickers,
      currency: snap.meta.currency,
      priceBasis: snap.meta.adjustment,
      priceRows: first.dates.length,
      firstPriceDate: first.dates[0],
      lastPriceDate: first.dates[first.dates.length - 1],
    },
    returns: {
      kind: 'log',
      n: rets.dates.length,
      firstDate: rets.dates[0],
      lastDate: rets.dates[rets.dates.length - 1],
      droppedPerTicker: rets.dropped,
    },
    protocol: { ...DEFAULT_WALKFORWARD, minOrigins: MIN_ORIGINS },
    outcome,
    implementationVersion,
    evaluatedAt: new Date().toISOString(),
    runtimeMs: performance.now() - t0,
  };
}
