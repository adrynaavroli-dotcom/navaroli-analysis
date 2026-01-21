import { useState, useEffect, useCallback } from 'react';
import type { AnalysisWorkspace } from '@/types/valuation';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

const CACHE_KEY = 'valuation_workspaces_cache';
const CACHE_TIMESTAMP_KEY = 'valuation_cache_timestamp';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedWorkspace extends AnalysisWorkspace {
  cachedAt: string;
}

interface ValuationCache {
  workspaces: CachedWorkspace[];
  lastSync: string;
}

export function useValuationCache() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasCachedData, setHasCachedData] = useState(false);

  // Track online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check if cache exists on mount
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    setHasCachedData(!!cached);
  }, []);

  const getCachedWorkspaces = useCallback((): AnalysisWorkspace[] => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return [];

      const data: ValuationCache = JSON.parse(cached);
      const timestamp = new Date(data.lastSync).getTime();
      const now = Date.now();

      // Check if cache is expired
      if (now - timestamp > CACHE_EXPIRY_MS) {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIMESTAMP_KEY);
        setHasCachedData(false);
        return [];
      }

      return data.workspaces;
    } catch (error) {
      console.error('Error reading cache:', error);
      return [];
    }
  }, []);

  const cacheWorkspaces = useCallback((workspaces: AnalysisWorkspace[]) => {
    try {
      const now = new Date().toISOString();
      const cachedWorkspaces: CachedWorkspace[] = workspaces.map(ws => ({
        ...ws,
        cachedAt: now,
      }));

      const cache: ValuationCache = {
        workspaces: cachedWorkspaces,
        lastSync: now,
      };

      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, now);
      setHasCachedData(true);
    } catch (error) {
      console.error('Error caching workspaces:', error);
    }
  }, []);

  const cacheWorkspace = useCallback((workspace: AnalysisWorkspace) => {
    try {
      const existingWorkspaces = getCachedWorkspaces();
      const index = existingWorkspaces.findIndex(ws => ws.id === workspace.id);
      
      if (index >= 0) {
        existingWorkspaces[index] = workspace;
      } else {
        existingWorkspaces.push(workspace);
      }

      cacheWorkspaces(existingWorkspaces);
    } catch (error) {
      console.error('Error caching single workspace:', error);
    }
  }, [getCachedWorkspaces, cacheWorkspaces]);

  const getCachedWorkspace = useCallback((id: string): AnalysisWorkspace | null => {
    const workspaces = getCachedWorkspaces();
    return workspaces.find(ws => ws.id === id) || null;
  }, [getCachedWorkspaces]);

  const removeCachedWorkspace = useCallback((id: string) => {
    const workspaces = getCachedWorkspaces();
    const filtered = workspaces.filter(ws => ws.id !== id);
    cacheWorkspaces(filtered);
  }, [getCachedWorkspaces, cacheWorkspaces]);

  const clearCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    setHasCachedData(false);
  }, []);

  const getCacheTimestamp = useCallback((): Date | null => {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    return timestamp ? new Date(timestamp) : null;
  }, []);

  const getCacheAge = useCallback((): string => {
    const timestamp = getCacheTimestamp();
    if (!timestamp) return 'No cache';

    const now = Date.now();
    const diff = now - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }, [getCacheTimestamp]);

  return {
    isOnline,
    hasCachedData,
    getCachedWorkspaces,
    cacheWorkspaces,
    cacheWorkspace,
    getCachedWorkspace,
    removeCachedWorkspace,
    clearCache,
    getCacheTimestamp,
    getCacheAge,
  };
}

// Utility to cache specific financial data for a workspace
export function cacheFinancialData(workspaceId: string, years: ConsolidatedYear[]) {
  try {
    const key = `valuation_financial_${workspaceId}`;
    localStorage.setItem(key, JSON.stringify({
      years,
      cachedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Error caching financial data:', error);
  }
}

export function getCachedFinancialData(workspaceId: string): ConsolidatedYear[] | null {
  try {
    const key = `valuation_financial_${workspaceId}`;
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const data = JSON.parse(cached);
    return data.years;
  } catch (error) {
    console.error('Error reading cached financial data:', error);
    return null;
  }
}
