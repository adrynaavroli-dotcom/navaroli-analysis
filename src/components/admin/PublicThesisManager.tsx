import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Eye, EyeOff, Trash2, ExternalLink, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface PublicThesis {
  id: string;
  ticker: string;
  company_name: string;
  fair_value: number | null;
  current_price: number | null;
  upside_percent: number | null;
  published_at: string | null;
  created_at: string;
}

export function PublicThesisManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Fetch all public thesis data (including unpublished)
  const { data: theses, isLoading } = useQuery({
    queryKey: ['admin-public-theses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_thesis_data')
        .select('id, ticker, company_name, fair_value, current_price, upside_percent, published_at, created_at')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PublicThesis[];
    },
    enabled: !!user,
  });

  // Toggle visibility mutation
  const toggleVisibility = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => {
      const { error } = await supabase
        .from('public_thesis_data')
        .update({ 
          published_at: isPublished ? new Date().toISOString() : null 
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, { isPublished }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-public-theses'] });
      queryClient.invalidateQueries({ queryKey: ['public-theses-list'] });
      toast.success(isPublished ? 'Análisis publicado' : 'Análisis ocultado');
    },
    onError: () => {
      toast.error('Error al actualizar visibilidad');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('public_thesis_data')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-public-theses'] });
      queryClient.invalidateQueries({ queryKey: ['public-theses-list'] });
      toast.success('Análisis eliminado');
      setDeleteId(null);
    },
    onError: () => {
      toast.error('Error al eliminar');
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Gestión de Research
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!theses || theses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay análisis exportados todavía.</p>
              <p className="text-sm mt-2">
                Usa el Valuation Engine para crear y exportar análisis.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {theses.map((thesis) => (
                <div 
                  key={thesis.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <span className="font-bold text-primary text-xs">{thesis.ticker}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{thesis.ticker}</span>
                        <Badge 
                          variant={thesis.published_at ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {thesis.published_at ? 'Visible' : 'Oculto'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{thesis.company_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {thesis.fair_value && (
                      <div className="text-right hidden sm:block">
                        <p className="font-medium">${thesis.fair_value.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Fair Value</p>
                      </div>
                    )}

                    {thesis.upside_percent !== null && (
                      <Badge 
                        variant={thesis.upside_percent >= 0 ? 'default' : 'destructive'}
                        className="gap-1 hidden sm:flex"
                      >
                        {thesis.upside_percent >= 0 ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {Math.abs(thesis.upside_percent).toFixed(1)}%
                      </Badge>
                    )}

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!!thesis.published_at}
                        onCheckedChange={(checked) => 
                          toggleVisibility.mutate({ id: thesis.id, isPublished: checked })
                        }
                        disabled={toggleVisibility.isPending}
                      />
                      {thesis.published_at ? (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>

                    {thesis.published_at && (
                      <Link to={`/public-thesis/${thesis.ticker}`} target="_blank">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(thesis.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar análisis?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El análisis será eliminado permanentemente
              de la biblioteca pública de research.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
