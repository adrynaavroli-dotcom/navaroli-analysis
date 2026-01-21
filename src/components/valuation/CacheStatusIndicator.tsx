import { Wifi, WifiOff, CloudOff, RefreshCw, CloudUpload, AlertCircle, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CacheStatusIndicatorProps {
  isOnline: boolean;
  hasCachedData: boolean;
  cacheAge: string;
  pendingCount?: number;
  isSyncing?: boolean;
  onRefresh?: () => void;
  onSync?: () => void;
  isRefreshing?: boolean;
}

export function CacheStatusIndicator({
  isOnline,
  hasCachedData,
  cacheAge,
  pendingCount = 0,
  isSyncing = false,
  onRefresh,
  onSync,
  isRefreshing = false,
}: CacheStatusIndicatorProps) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        {/* Connection status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={isOnline ? 'default' : 'secondary'}
              className={`gap-1.5 ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
              }`}
            >
              {isOnline ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {isOnline
              ? 'Connected - data syncs automatically'
              : 'Offline - using cached data'}
          </TooltipContent>
        </Tooltip>

        {/* Pending changes indicator */}
        {pendingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant="outline" 
                className={`gap-1.5 cursor-pointer transition-colors ${
                  isSyncing
                    ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                    : 'bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-orange-500/20'
                }`}
                onClick={isOnline && onSync ? onSync : undefined}
              >
                {isSyncing ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <CloudUpload className="h-3 w-3" />
                )}
                {isSyncing ? 'Syncing...' : `${pendingCount} pending`}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {isSyncing ? (
                <p>Syncing changes to server...</p>
              ) : isOnline ? (
                <div>
                  <p className="font-medium">{pendingCount} unsaved change{pendingCount > 1 ? 's' : ''}</p>
                  <p className="text-xs text-muted-foreground mt-1">Click to sync now</p>
                </div>
              ) : (
                <div>
                  <p className="font-medium flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {pendingCount} change{pendingCount > 1 ? 's' : ''} waiting
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Will sync when connection is restored
                  </p>
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        )}

        {/* All synced indicator */}
        {pendingCount === 0 && hasCachedData && isOnline && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant="outline" 
                className="gap-1.5 bg-emerald-500/5 text-emerald-600 border-emerald-500/20"
              >
                <Check className="h-3 w-3" />
                Synced
              </Badge>
            </TooltipTrigger>
            <TooltipContent>All changes saved to server</TooltipContent>
          </Tooltip>
        )}

        {/* Cache status (only show when offline or no pending) */}
        {hasCachedData && !isOnline && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                <CloudOff className="h-3 w-3" />
                Cache: {cacheAge}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Local cache available for offline use</p>
              <p className="text-xs text-muted-foreground mt-1">
                Last synced: {cacheAge}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Refresh button when online */}
        {isOnline && onRefresh && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onRefresh}
                disabled={isRefreshing || isSyncing}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh & sync data</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
