import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

export interface SiteVisibility {
  credit_public: boolean;
}

const DEFAULTS: SiteVisibility = { credit_public: false };

export function useSiteVisibility() {
  return useQuery({
    queryKey: ['site-visibility'],
    queryFn: async (): Promise<SiteVisibility> => {
      const { data, error } = await supabase
        .from('page_content')
        .select('content')
        .eq('page_key', 'site_visibility')
        .maybeSingle();

      if (error) throw error;
      const content = (data?.content ?? {}) as Partial<SiteVisibility>;
      return { ...DEFAULTS, ...content };
    },
    staleTime: 60_000,
  });
}

export function useUpdateSiteVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (visibility: SiteVisibility) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('page_content')
        .update({ content: visibility as unknown as Json, updated_by: user.id })
        .eq('page_key', 'site_visibility');

      if (error) throw error;
      return visibility;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-visibility'] });
    },
  });
}
