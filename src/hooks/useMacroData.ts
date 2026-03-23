import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  MacroIndicator,
  MacroDataPoint,
  MacroIndicatorConfig,
  defaultIndicatorConfigs,
} from '@/lib/macro-data';

interface UseMacroDataReturn {
  indicators: MacroIndicator[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

async function fetchSeries(seriesId: string, frequency?: string): Promise<MacroDataPoint[]> {
  const params: Record<string, string> = { series_id: seriesId };
  if (frequency) params.frequency = frequency;

  const queryString = new URLSearchParams(params).toString();
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/fetch-fred-data?${queryString}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${seriesId}: ${response.status}`);
  }

  const result = await response.json();
  return result.data || [];
}

function buildIndicator(config: MacroIndicatorConfig, data: MacroDataPoint[]): MacroIndicator {
  const latestValue = data.length > 0 ? data[data.length - 1].value : 0;
  const previousValue = data.length > 1 ? data[data.length - 2].value : 0;

  return {
    ...config,
    data,
    latestValue,
    previousValue,
  };
}

// Simple in-memory cache to avoid re-fetching on component re-renders
const cache = new Map<string, { data: MacroDataPoint[]; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export function useMacroData(configs: MacroIndicatorConfig[] = defaultIndicatorConfigs): UseMacroDataReturn {
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  const refetch = useCallback(() => {
    cache.clear();
    setTrigger(t => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setIsLoading(true);
      setError(null);

      const results: MacroIndicator[] = [];
      const errors: string[] = [];

      // Fetch all series in parallel with cache
      const promises = configs.map(async (config) => {
        const cacheKey = `${config.fredSeriesId}_${config.frequency || ''}`;
        const cached = cache.get(cacheKey);
        const now = Date.now();

        if (cached && now - cached.timestamp < CACHE_TTL) {
          return { config, data: cached.data };
        }

        try {
          const data = await fetchSeries(config.fredSeriesId, config.frequency);
          cache.set(cacheKey, { data, timestamp: now });
          return { config, data };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`${config.fredSeriesId}: ${msg}`);
          return { config, data: [] as MacroDataPoint[] };
        }
      });

      const settled = await Promise.all(promises);

      if (cancelled) return;

      for (const { config, data } of settled) {
        results.push(buildIndicator(config, data));
      }

      setIndicators(results);
      if (errors.length > 0) {
        setError(`Failed to load: ${errors.join(', ')}`);
      }
      setIsLoading(false);
    }

    loadAll();

    return () => { cancelled = true; };
  }, [trigger, configs]);

  return { indicators, isLoading, error, refetch };
}
