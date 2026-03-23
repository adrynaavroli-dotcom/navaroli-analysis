import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { ticker, expirationDate } = await req.json();

    if (!ticker || typeof ticker !== 'string') {
      return new Response(JSON.stringify({ error: 'Ticker is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tickerRegex = /^[A-Za-z0-9.\-^=]{1,15}$/;
    if (!tickerRegex.test(ticker)) {
      return new Response(JSON.stringify({ error: 'Invalid ticker format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sanitizedTicker = ticker.toUpperCase().trim();
    console.log(`Fetching options chain for: ${sanitizedTicker}`);

    // Fetch options chain from Yahoo Finance
    let url = `https://query1.finance.yahoo.com/v7/finance/options/${sanitizedTicker}`;
    if (expirationDate) {
      // Yahoo expects epoch timestamp
      const epoch = Math.floor(new Date(expirationDate).getTime() / 1000);
      url += `?date=${epoch}`;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(`Yahoo options API error: ${response.status}`);
      return new Response(JSON.stringify({ error: 'Failed to fetch options data. Check if ticker has listed options.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const optionChain = data.optionChain?.result?.[0];

    if (!optionChain) {
      return new Response(JSON.stringify({ error: 'No options data found for this ticker' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract expiration dates (as ISO strings)
    const expirationDates = (optionChain.expirationDates || []).map((epoch: number) =>
      new Date(epoch * 1000).toISOString().split('T')[0]
    );

    // Extract underlying price
    const quote = optionChain.quote;
    const underlyingPrice = quote?.regularMarketPrice || null;

    // Extract calls and puts
    const options = optionChain.options?.[0] || {};
    
    const mapContract = (c: Record<string, unknown>) => ({
      strike: c.strike as number,
      lastPrice: c.lastPrice as number,
      bid: c.bid as number || 0,
      ask: c.ask as number || 0,
      volume: c.volume as number || 0,
      openInterest: c.openInterest as number || 0,
      impliedVolatility: c.impliedVolatility as number || 0,
      inTheMoney: c.inTheMoney as boolean || false,
      contractSymbol: c.contractSymbol as string || '',
      expiration: c.expiration ? new Date((c.expiration as number) * 1000).toISOString().split('T')[0] : '',
      change: c.change as number || 0,
      percentChange: c.percentChange as number || 0,
    });

    const calls = (options.calls || []).map(mapContract);
    const puts = (options.puts || []).map(mapContract);

    console.log(`Found ${calls.length} calls, ${puts.length} puts, ${expirationDates.length} expirations`);

    return new Response(JSON.stringify({
      ticker: sanitizedTicker,
      underlyingPrice,
      expirationDates,
      selectedExpiration: expirationDates[0] || null,
      calls,
      puts,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error fetching options chain:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
