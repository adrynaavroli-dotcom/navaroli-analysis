import { useState } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePurchases, usePurchaseSummary, useAddPurchase, useDeletePurchase } from '@/hooks/usePurchases';
import { cn } from '@/lib/utils';

interface PurchaseTrackerProps {
  thesisId: string;
  currentPrice: number;
  currency: string;
}

export function PurchaseTracker({ thesisId, currentPrice, currency }: PurchaseTrackerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: purchases, isLoading } = usePurchases(thesisId);
  const summary = usePurchaseSummary(purchases, currentPrice);
  const addPurchase = useAddPurchase();
  const deletePurchase = useDeletePurchase();

  const [isOpen, setIsOpen] = useState(false);
  const [shares, setShares] = useState('');
  const [pricePerShare, setPricePerShare] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: 'Error',
        description: 'Debes iniciar sesión para añadir compras',
        variant: 'destructive',
      });
      return;
    }

    try {
      await addPurchase.mutateAsync({
        thesis_id: thesisId,
        user_id: user.id,
        purchase_date: purchaseDate,
        shares: parseFloat(shares),
        price_per_share: parseFloat(pricePerShare),
      });

      toast({
        title: 'Compra añadida',
        description: `${shares} acciones a ${currency} ${pricePerShare}`,
      });

      setShares('');
      setPricePerShare('');
      setIsOpen(false);
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo añadir la compra',
        variant: 'destructive',
      });
    }
  };

  const handleDeletePurchase = async (id: string) => {
    try {
      await deletePurchase.mutateAsync({ id, thesisId });
      toast({
        title: 'Compra eliminada',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la compra',
        variant: 'destructive',
      });
    }
  };

  if (!user) return null;

  const isPositive = summary.gainLoss >= 0;

  return (
    <div className="bento-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          Mi Posición
        </h3>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Añadir
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Añadir Compra</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddPurchase} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="purchaseDate">Fecha de compra</Label>
                <Input
                  id="purchaseDate"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shares">Número de acciones</Label>
                  <Input
                    id="shares"
                    type="number"
                    step="0.0001"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    placeholder="100"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pricePerShare">Precio por acción ({currency})</Label>
                  <Input
                    id="pricePerShare"
                    type="number"
                    step="0.01"
                    value={pricePerShare}
                    onChange={(e) => setPricePerShare(e.target.value)}
                    placeholder="150.00"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={addPurchase.isPending}>
                  Añadir Compra
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-4 bg-muted rounded w-3/4" />
        </div>
      ) : summary.totalShares > 0 ? (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Acciones</p>
              <p className="text-lg font-semibold">{summary.totalShares.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Precio Medio</p>
              <p className="text-lg font-semibold">
                {currency} {summary.averagePrice.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Coste Total</span>
              <span className="text-sm font-medium">
                {currency} {summary.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Valor Actual</span>
              <span className="text-sm font-medium">
                {currency} {summary.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-medium">Ganancia/Pérdida</span>
              <div className={cn('flex items-center gap-1', isPositive ? 'text-success' : 'text-destructive')}>
                {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span className="font-semibold">
                  {isPositive ? '+' : ''}{currency} {summary.gainLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-sm">
                  ({isPositive ? '+' : ''}{summary.gainLossPercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Purchase List */}
          {purchases && purchases.length > 0 && (
            <div className="pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-2">Historial de Compras</p>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {purchases.map((purchase) => (
                  <div
                    key={purchase.id}
                    className="flex items-center justify-between text-sm py-1.5 px-2 bg-muted/50 rounded"
                  >
                    <div>
                      <span className="font-medium">{purchase.shares}</span>
                      <span className="text-muted-foreground"> × {currency} {purchase.price_per_share.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(purchase.purchase_date).toLocaleDateString('es-ES')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeletePurchase(purchase.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No tienes compras registradas. Añade tu primera compra para hacer seguimiento de tu posición.
        </p>
      )}
    </div>
  );
}
