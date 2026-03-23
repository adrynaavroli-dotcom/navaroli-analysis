import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp, ArrowUpRight, ArrowDownRight, Calendar, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PublicThesisSummary {
  id: string;
  ticker: string;
  company_name: string;
  fair_value: number | null;
  current_price: number | null;
  upside_percent: number | null;
  published_at: string;
}

export default function PublicThesesList() {
  const { data: theses, isLoading } = useQuery({
    queryKey: ['public-theses-list'],
    queryFn: async () => {
      // Use the secure view that excludes user_id and workspace_id
      const { data, error } = await supabase
        .from('public_thesis_data_view')
        .select('id, ticker, company_name, fair_value, current_price, upside_percent, published_at')
        .order('published_at', { ascending: false });
      
      if (error) throw error;
      return data as PublicThesisSummary[];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-12 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Fundamentals</h1>
          <p className="text-muted-foreground">
            Published investment analyses and valuation models
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !theses || theses.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Published Analyses Yet</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Published investment theses will appear here. Use the Valuation Engine to create and publish analyses.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {theses.map((thesis) => (
              <Link key={thesis.id} to={`/public-thesis/${thesis.ticker}`}>
                <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="font-bold text-primary text-sm">{thesis.ticker}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold">{thesis.ticker}</h3>
                        <p className="text-sm text-muted-foreground">{thesis.company_name}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      {thesis.fair_value && (
                        <div className="text-right">
                          <p className="font-semibold">${thesis.fair_value.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">Fair Value</p>
                        </div>
                      )}
                      
                      {thesis.upside_percent !== null && (
                        <Badge 
                          variant={thesis.upside_percent >= 0 ? 'default' : 'destructive'}
                          className="gap-1"
                        >
                          {thesis.upside_percent >= 0 ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {Math.abs(thesis.upside_percent).toFixed(1)}%
                        </Badge>
                      )}
                      
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(thesis.published_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                      
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}