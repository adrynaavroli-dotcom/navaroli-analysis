import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LogOut, Pencil, Trash2, Eye, EyeOff, Loader2, FileText, TrendingUp, BarChart3 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Thesis } from '@/types/thesis';
import { ThesisFormDialog } from '@/components/admin/ThesisFormDialog';
import { PageContentEditor } from '@/components/admin/PageContentEditor';
import { PublicThesisManager } from '@/components/admin/PublicThesisManager';
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

export default function Admin() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingThesis, setEditingThesis] = useState<Thesis | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Fetch user's theses
  const fetchTheses = async () => {
    if (!user) return;
    
    setIsLoading(true);
    const { data, error } = await supabase
      .from('theses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to load theses',
        variant: 'destructive',
      });
    } else {
      setTheses(
        (data || []).map((item) => ({
          ...item,
          current_price: Number(item.current_price),
          target_price: item.target_price ? Number(item.target_price) : null,
          metrics: item.metrics as unknown as Thesis['metrics'],
          sparkline_data: item.sparkline_data as unknown as number[],
          chart_data: item.chart_data as Thesis['chart_data'],
        })) as Thesis[]
      );
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (user) {
      fetchTheses();
    }
  }, [user]);

  const handleDelete = async () => {
    if (!deletingId) return;

    const { error } = await supabase
      .from('theses')
      .delete()
      .eq('id', deletingId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete thesis',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Deleted',
        description: 'Thesis has been deleted',
      });
      fetchTheses();
    }
    setDeleteDialogOpen(false);
    setDeletingId(null);
  };

  const togglePublished = async (thesis: Thesis) => {
    const { error } = await supabase
      .from('theses')
      .update({ is_published: !thesis.is_published })
      .eq('id', thesis.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update thesis',
        variant: 'destructive',
      });
    } else {
      fetchTheses();
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gestiona tus tesis y contenido de la web
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="theses" className="space-y-6">
          <TabsList>
            <TabsTrigger value="theses" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Tesis
            </TabsTrigger>
            <TabsTrigger value="research" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Research
            </TabsTrigger>
            <TabsTrigger value="pages" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Páginas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="theses">
            {/* Theses Section Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium">Tesis de Inversión</h2>
              <Button
                onClick={() => {
                  setEditingThesis(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Nueva Tesis
              </Button>
            </div>

            {/* Theses Table */}
            {isLoading ? (
              <div className="bento-card p-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
              </div>
            ) : theses.length === 0 ? (
              <div className="bento-card p-12 text-center">
                <p className="text-muted-foreground mb-4">No hay tesis todavía</p>
                <Button
                  onClick={() => {
                    setEditingThesis(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Crear tu primera tesis
                </Button>
              </div>
            ) : (
              <div className="bento-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-4 font-medium text-sm">Ticker</th>
                        <th className="text-left p-4 font-medium text-sm">Empresa</th>
                        <th className="text-left p-4 font-medium text-sm hidden sm:table-cell">Sector</th>
                        <th className="text-left p-4 font-medium text-sm hidden md:table-cell">Dirección</th>
                        <th className="text-left p-4 font-medium text-sm">Estado</th>
                        <th className="text-right p-4 font-medium text-sm">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {theses.map((thesis) => (
                        <tr key={thesis.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="p-4">
                            <span className="font-mono font-semibold">${thesis.ticker}</span>
                          </td>
                          <td className="p-4 text-muted-foreground">{thesis.company_name}</td>
                          <td className="p-4 hidden sm:table-cell">
                            <Badge variant="outline" className="font-normal">
                              {thesis.sector}
                            </Badge>
                          </td>
                          <td className="p-4 hidden md:table-cell">
                            <Badge 
                              className={thesis.direction === 'long' 
                                ? 'bg-success/10 text-success border-success/20' 
                                : 'bg-destructive/10 text-destructive border-destructive/20'
                              }
                              variant="outline"
                            >
                              {thesis.direction.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <Badge 
                              variant={thesis.is_published ? 'default' : 'secondary'}
                              className="cursor-pointer"
                              onClick={() => togglePublished(thesis)}
                            >
                              {thesis.is_published ? 'Publicado' : 'Borrador'}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => togglePublished(thesis)}
                                title={thesis.is_published ? 'Despublicar' : 'Publicar'}
                              >
                                {thesis.is_published ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingThesis(thesis);
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setDeletingId(thesis.id);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="research">
            <PublicThesisManager />
          </TabsContent>

          <TabsContent value="pages">
            <PageContentEditor />
          </TabsContent>
        </Tabs>
      </main>

      {/* Form Dialog */}
      <ThesisFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        thesis={editingThesis}
        onSuccess={fetchTheses}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete thesis?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the thesis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
