import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ThesisPurchase, PurchaseSummary } from '@/types/purchase';

export function usePurchases(thesisId: string) {
  return useQuery({
    queryKey: ['purchases', thesisId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('thesis_purchases')
        .select('*')
        .eq('thesis_id', thesisId)
        .order('purchase_date', { ascending: false });

      if (error) throw error;

      return (data || []).map((item) => ({
        ...item,
        shares: Number(item.shares),
        price_per_share: Number(item.price_per_share),
      })) as ThesisPurchase[];
    },
    enabled: !!thesisId,
  });
}

export function usePurchaseSummary(purchases: ThesisPurchase[] | undefined, currentPrice: number): PurchaseSummary {
  if (!purchases || purchases.length === 0) {
    return {
      totalShares: 0,
      totalCost: 0,
      averagePrice: 0,
      currentValue: 0,
      gainLoss: 0,
      gainLossPercent: 0,
    };
  }

  const totalShares = purchases.reduce((sum, p) => sum + p.shares, 0);
  const totalCost = purchases.reduce((sum, p) => sum + p.shares * p.price_per_share, 0);
  const averagePrice = totalCost / totalShares;
  const currentValue = totalShares * currentPrice;
  const gainLoss = currentValue - totalCost;
  const gainLossPercent = (gainLoss / totalCost) * 100;

  return {
    totalShares,
    totalCost,
    averagePrice,
    currentValue,
    gainLoss,
    gainLossPercent,
  };
}

export function useAddPurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (purchase: {
      thesis_id: string;
      user_id: string;
      purchase_date: string;
      shares: number;
      price_per_share: number;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('thesis_purchases')
        .insert(purchase)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchases', variables.thesis_id] });
    },
  });
}

export function useDeletePurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, thesisId }: { id: string; thesisId: string }) => {
      const { error } = await supabase
        .from('thesis_purchases')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return thesisId;
    },
    onSuccess: (thesisId) => {
      queryClient.invalidateQueries({ queryKey: ['purchases', thesisId] });
    },
  });
}
