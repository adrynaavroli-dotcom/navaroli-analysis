import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Save, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function NotificationSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile-notification', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_email')
        .eq('user_id', user?.id)
        .single();

      if (error) throw error;
      setEmail(data?.notification_email || '');
      return data;
    },
    enabled: !!user,
  });

  const updateEmail = useMutation({
    mutationFn: async (newEmail: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ notification_email: newEmail || null })
        .eq('user_id', user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-notification'] });
      toast.success('Email de notificaciones actualizado');
    },
    onError: () => {
      toast.error('Error al actualizar email');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateEmail.mutate(email);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Notificaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Notificaciones por Email
        </CardTitle>
        <CardDescription>
          Recibe alertas cuando tus tesis alcancen el fair value, caigan significativamente, 
          o necesiten revisión (más de 6 meses sin actualizar).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notification-email">Email para alertas</Label>
            <div className="flex gap-2">
              <Input
                id="notification-email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={updateEmail.isPending}>
                {updateEmail.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            </div>
            {profile?.notification_email && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                Alertas activas para: {profile.notification_email}
              </p>
            )}
          </div>
          
          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-2">
            <p className="font-medium">Recibirás alertas cuando:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>🎯 Un ticker alcance tu fair value estimado</li>
              <li>📉 El precio caiga más del 10% desde tu última revisión</li>
              <li>⏰ Una tesis lleve 6+ meses sin actualizar</li>
            </ul>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
