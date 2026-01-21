import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AnalysisWorkspace } from '@/types/valuation';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

const CACHE_KEY = 'valuation_workspaces_cache';
const CACHE_TIMESTAMP_KEY = 'valuation_cache_timestamp';
const PENDING_CHANGES_KEY = 'valuation_pending_changes';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedWorkspace extends AnalysisWorkspace {
  cachedAt: string;
}

interface ValuationCache {
  workspaces: CachedWorkspace[];
  lastSync: string;
}

export interface PendingChange {
  id: string;
  workspaceId: string;
  type: 'create' | 'update' | 'delete';
  data?: Partial<AnalysisWorkspace>;
  timestamp: string;
  retryCount: number;
}

export function useValuationCache() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasCachedData, setHasCachedData] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

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

  // Check if cache exists on mount and load pending changes
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    setHasCachedData(!!cached);

    const pending = localStorage.getItem(PENDING_CHANGES_KEY);
    if (pending) {
      try {
        setPendingChanges(JSON.parse(pending));
      } catch {
        setPendingChanges([]);
      }
    }
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingChanges.length > 0) {
      syncPendingChanges();
    }
  }, [isOnline]);

  const savePendingChanges = useCallback((changes: PendingChange[]) => {
    localStorage.setItem(PENDING_CHANGES_KEY, JSON.stringify(changes));
    setPendingChanges(changes);
  }, []);

  const addPendingChange = useCallback((change: Omit<PendingChange, 'id' | 'timestamp' | 'retryCount'>) => {
    const newChange: PendingChange = {
      ...change,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };

    const existingChanges = [...pendingChanges];
    
    // If it's an update, replace any existing pending update for the same workspace
    if (change.type === 'update') {
      const existingIndex = existingChanges.findIndex(
        c => c.workspaceId === change.workspaceId && c.type === 'update'
      );
      if (existingIndex >= 0) {
        existingChanges[existingIndex] = newChange;
        savePendingChanges(existingChanges);
        return;
      }
    }

    savePendingChanges([...existingChanges, newChange]);
  }, [pendingChanges, savePendingChanges]);

  const removePendingChange = useCallback((changeId: string) => {
    const updated = pendingChanges.filter(c => c.id !== changeId);
    savePendingChanges(updated);
  }, [pendingChanges, savePendingChanges]);

  const syncPendingChanges = useCallback(async () => {
    if (pendingChanges.length === 0 || isSyncing || !isOnline) return;

    setIsSyncing(true);
    const failedChanges: PendingChange[] = [];

    for (const change of pendingChanges) {
      try {
        if (change.type === 'update' && change.data) {
          const { error } = await supabase
            .from('analysis_workspaces')
            .update(change.data as never)
            .eq('id', change.workspaceId);

          if (error) throw error;
        } else if (change.type === 'delete') {
          const { error } = await supabase
            .from('analysis_workspaces')
            .delete()
            .eq('id', change.workspaceId);

          if (error) throw error;
        }
        // Note: 'create' type is handled directly in the component
      } catch (error) {
        console.error('Sync failed for change:', change.id, error);
        if (change.retryCount < 3) {
          failedChanges.push({ ...change, retryCount: change.retryCount + 1 });
        }
      }
    }

    savePendingChanges(failedChanges);
    setIsSyncing(false);

    return failedChanges.length === 0;
  }, [pendingChanges, isSyncing, isOnline, savePendingChanges]);

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

  const clearPendingChanges = useCallback(() => {
    localStorage.removeItem(PENDING_CHANGES_KEY);
    setPendingChanges([]);
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
    pendingChanges,
    pendingCount: pendingChanges.length,
    isSyncing,
    getCachedWorkspaces,
    cacheWorkspaces,
    cacheWorkspace,
    getCachedWorkspace,
    removeCachedWorkspace,
    clearCache,
    clearPendingChanges,
    getCacheTimestamp,
    getCacheAge,
    addPendingChange,
    removePendingChange,
    syncPendingChanges,
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
