import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buildReturnsDataset, type CleaningReport, type PriceField, type PriceSeries, type QualityFlag, type ReturnSeries } from '@/lib/returns';

export const MIN_OBSERVATIONS = 30;

export interface VolatilityDataset {
  ticker: string;
  currency: string | null;
  prices: PriceSeries;
  returns: ReturnSeries;
  report: CleaningReport;
  priceField: PriceField;
  flags: QualityFlag[];
}

export function useVolatilityData(ticker: string | null, period: string) {
  return useQuery({
    queryKey: ['volatility-data', ticker, period],
    enabled: !!ticker,
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<VolatilityDataset> => {
      const { data, error } = await supabase.functions.invoke('fetch-historical-volatility', {
        body: { ticker, period, full: true },
      });
      if (error) {
        let msg = error.message;
        try { const ctx = await (error as { context?: Response }).context?.json(); if (ctx?.error) msg = ctx.error; } catch { /* ignore */ }
        throw new Error(msg || 'Market data request failed');
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.dates?.length) throw new Error('No price data returned for this ticker');
      const ds = buildReturnsDataset(
        { dates: data.dates, closes: data.closes, adjcloses: data.adjcloses ?? undefined },
        { source: 'Yahoo Finance', ticker: data.ticker, currency: data.currency, frequency: 'daily', history: period, updateMethod: 'On demand via fetch-historical-volatility', retrievedAt: new Date().toISOString() },
        'log',
      );
      if (ds.returns.returns.length < MIN_OBSERVATIONS) {
        throw new Error(`Insufficient observations: ${ds.returns.returns.length} returns (minimum ${MIN_OBSERVATIONS})`);
      }
      return { ticker: data.ticker, currency: data.currency, prices: ds.prices, returns: ds.returns, report: ds.report, priceField: ds.metadata.priceField, flags: ds.flags };
    },
  });
}
