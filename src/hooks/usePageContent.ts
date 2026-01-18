import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

export interface PageContent {
  id: string;
  page_key: string;
  content: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
}

export function usePageContent(pageKey: string) {
  return useQuery({
    queryKey: ['page-content', pageKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('page_content')
        .select('*')
        .eq('page_key', pageKey)
        .maybeSingle();

      if (error) throw error;
      return data as PageContent | null;
    },
  });
}

export function useUpdatePageContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pageKey, content }: { pageKey: string; content: Record<string, unknown> }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase
        .from('page_content')
        .update({ 
          content: content as Json,
          updated_by: user.id,
        })
        .eq('page_key', pageKey)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { pageKey }) => {
      queryClient.invalidateQueries({ queryKey: ['page-content', pageKey] });
    },
  });
}
