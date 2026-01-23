import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { AlertsList } from './AlertsList';

export function AlertsBadge() {
  const { user } = useAuth();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['unread-alerts-count', user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('thesis_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .eq('acknowledged', false);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 60000, // Check every minute
  });

  if (!user) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <AlertsList />
      </PopoverContent>
    </Popover>
  );
}
