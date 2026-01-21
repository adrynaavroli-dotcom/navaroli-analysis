import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Check for authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - No valid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user using getClaims
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log('Authenticated user:', userId);

    // Check if user has admin role
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData, error: roleError } = await supabaseService
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError) {
      console.error('Role check error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Error checking user permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role key to bypass RLS for updates
    const supabase = supabaseService;

    // Get all published theses
    const { data: theses, error: fetchError } = await supabase
      .from('theses')
      .select('id, ticker, current_price, sparkline_data')
      .eq('is_published', true);

    if (fetchError) {
      console.error('Error fetching theses:', fetchError);
      throw fetchError;
    }

    if (!theses || theses.length === 0) {
      console.log('No published theses to update');
      return new Response(
        JSON.stringify({ message: 'No theses to update', updated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${theses.length} theses to update`);

    const results = {
      updated: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const thesis of theses) {
      try {
        // Fetch current price from Yahoo Finance
        const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${thesis.ticker}?interval=1d&range=5d`;
        const quoteResponse = await fetch(quoteUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        if (!quoteResponse.ok) {
          console.warn(`Failed to fetch ${thesis.ticker}: ${quoteResponse.status}`);
          results.failed++;
          results.errors.push(`${thesis.ticker}: HTTP ${quoteResponse.status}`);
          continue;
        }

        const quoteData = await quoteResponse.json();
        const chartResult = quoteData.chart?.result?.[0];

        if (!chartResult) {
          console.warn(`No data for ${thesis.ticker}`);
          results.failed++;
          results.errors.push(`${thesis.ticker}: No data`);
          continue;
        }

        const newPrice = chartResult.meta?.regularMarketPrice;
        const closePrices = chartResult.indicators?.quote?.[0]?.close || [];
        const sparklineData = closePrices.filter((p: number | null) => p !== null);

        if (!newPrice) {
          console.warn(`No price for ${thesis.ticker}`);
          results.failed++;
          results.errors.push(`${thesis.ticker}: No price`);
          continue;
        }

        // Update thesis with new price
        const { error: updateError } = await supabase
          .from('theses')
          .update({
            current_price: newPrice,
            sparkline_data: sparklineData.length > 0 ? sparklineData : thesis.sparkline_data,
          })
          .eq('id', thesis.id);

        if (updateError) {
          console.error(`Error updating ${thesis.ticker}:`, updateError);
          results.failed++;
          results.errors.push(`${thesis.ticker}: ${updateError.message}`);
          continue;
        }

        console.log(`Updated ${thesis.ticker}: ${thesis.current_price} -> ${newPrice}`);
        results.updated++;

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (tickerError) {
        console.error(`Error processing ${thesis.ticker}:`, tickerError);
        results.failed++;
        results.errors.push(`${thesis.ticker}: ${tickerError instanceof Error ? tickerError.message : 'Unknown error'}`);
      }
    }

    console.log(`Price update complete: ${results.updated} updated, ${results.failed} failed`);

    return new Response(
      JSON.stringify({
        message: 'Price update complete',
        ...results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in update-prices:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
