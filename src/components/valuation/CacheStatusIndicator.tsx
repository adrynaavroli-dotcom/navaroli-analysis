import { Wifi, WifiOff, CloudOff, RefreshCw } from 'lucide-react';
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
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function CacheStatusIndicator({
  isOnline,
  hasCachedData,
  cacheAge,
  onRefresh,
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

        {/* Cache status */}
        {hasCachedData && (
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
                disabled={isRefreshing}
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
