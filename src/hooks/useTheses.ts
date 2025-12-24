import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Thesis, ThesisFilters } from '@/types/thesis';

export function useTheses(filters?: ThesisFilters) {
  return useQuery({
    queryKey: ['theses', filters],
    queryFn: async () => {
      let query = supabase
        .from('theses')
        .select('*')
        .eq('is_published', true)
        .order('analysis_date', { ascending: false });

      if (filters?.sector) {
        query = query.eq('sector', filters.sector);
      }
      if (filters?.direction) {
        query = query.eq('direction', filters.direction);
      }
      if (filters?.strategy) {
        query = query.eq('strategy', filters.strategy);
      }
      if (filters?.marketCap) {
        query = query.eq('market_cap_category', filters.marketCap);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((item) => ({
        ...item,
        current_price: Number(item.current_price),
        target_price: item.target_price ? Number(item.target_price) : null,
        metrics: item.metrics as unknown as Thesis['metrics'],
        sparkline_data: item.sparkline_data as unknown as number[],
        chart_data: item.chart_data as Thesis['chart_data'],
      })) as Thesis[];
    },
  });
}

export function useThesis(id: string) {
  return useQuery({
    queryKey: ['thesis', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('theses')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        current_price: Number(data.current_price),
        target_price: data.target_price ? Number(data.target_price) : null,
        metrics: data.metrics as unknown as Thesis['metrics'],
        sparkline_data: data.sparkline_data as unknown as number[],
        chart_data: data.chart_data as Thesis['chart_data'],
      } as Thesis;
    },
    enabled: !!id,
  });
}
