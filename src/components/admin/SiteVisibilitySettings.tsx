import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Globe, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useSiteVisibility, useUpdateSiteVisibility } from '@/hooks/useSiteVisibility';

export function SiteVisibilitySettings() {
  const { data: visibility, isLoading } = useSiteVisibility();
  const updateVisibility = useUpdateSiteVisibility();

  const handleToggle = (checked: boolean) => {
    updateVisibility.mutate(
      { credit_public: checked },
      {
        onSuccess: () =>
          toast.success(
            checked ? 'Credit Analysis es ahora público' : 'Credit Analysis vuelve a ser privado'
          ),
        onError: () => toast.error('No se pudo actualizar la visibilidad'),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Visibilidad de secciones
        </CardTitle>
        <CardDescription>
          Decide qué módulos son accesibles para los visitantes de la web.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">Credit Analysis</p>
                <p className="text-sm text-muted-foreground">
                  Muestra la pestaña "Credit" en el menú para todo el mundo.
                </p>
              </div>
            </div>
            <Switch
              checked={!!visibility?.credit_public}
              onCheckedChange={handleToggle}
              disabled={updateVisibility.isPending}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
