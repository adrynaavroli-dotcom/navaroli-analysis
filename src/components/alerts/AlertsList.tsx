import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bell, TrendingUp, TrendingDown, Clock, Check, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Alert {
  id: string;
  thesis_id: string;
  alert_type: string;
  ticker: string;
  message: string;
  triggered_at: string;
  acknowledged: boolean;
}

const alertIcons = {
  fair_value_reached: TrendingUp,
  price_drop: TrendingDown,
  needs_review: Clock,
};

const alertColors = {
  fair_value_reached: 'text-green-600 bg-green-100',
  price_drop: 'text-red-600 bg-red-100',
  needs_review: 'text-amber-600 bg-amber-100',
};

const alertLabels = {
  fair_value_reached: 'Fair Value alcanzado',
  price_drop: 'Caída significativa',
  needs_review: 'Pendiente de revisión',
};

export function AlertsList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['thesis-alerts', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('thesis_alerts')
        .select('*')
        .eq('user_id', user?.id)
        .order('triggered_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as Alert[];
    },
    enabled: !!user,
  });

  const acknowledgeAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('thesis_alerts')
        .update({ acknowledged: true })
        .eq('id', alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thesis-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['unread-alerts-count'] });
    },
  });

  const deleteAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('thesis_alerts')
        .delete()
        .eq('id', alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thesis-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['unread-alerts-count'] });
    },
  });

  const acknowledgeAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('thesis_alerts')
        .update({ acknowledged: true })
        .eq('user_id', user?.id)
        .eq('acknowledged', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thesis-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['unread-alerts-count'] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className="p-8 text-center">
        <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No hay alertas</p>
      </div>
    );
  }

  const unreadCount = alerts.filter(a => !a.acknowledged).length;

  return (
    <div className="flex flex-col">
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="font-semibold">Alertas</h3>
        {unreadCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => acknowledgeAll.mutate()}
            disabled={acknowledgeAll.isPending}
          >
            <Check className="h-4 w-4 mr-1" />
            Marcar todas
          </Button>
        )}
      </div>
      
      <ScrollArea className="h-[400px]">
        <div className="divide-y">
          {alerts.map((alert) => {
            const Icon = alertIcons[alert.alert_type as keyof typeof alertIcons] || Bell;
            const colorClass = alertColors[alert.alert_type as keyof typeof alertColors] || 'text-muted-foreground bg-muted';
            const label = alertLabels[alert.alert_type as keyof typeof alertLabels] || alert.alert_type;

            return (
              <div 
                key={alert.id}
                className={cn(
                  "p-3 hover:bg-muted/50 transition-colors",
                  !alert.acknowledged && "bg-muted/30"
                )}
              >
                <div className="flex gap-3">
                  <div className={cn("p-2 rounded-lg shrink-0", colorClass)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{alert.ticker}</span>
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        colorClass
                      )}>
                        {label}
                      </span>
                      {!alert.acknowledged && (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {alert.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(alert.triggered_at), { 
                        addSuffix: true, 
                        locale: es 
                      })}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {!alert.acknowledged && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => acknowledgeAlert.mutate(alert.id)}
                        disabled={acknowledgeAlert.isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteAlert.mutate(alert.id)}
                      disabled={deleteAlert.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
