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
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !data?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { ticker } = await req.json();
    
    // Input validation: check if ticker exists and is a string
    if (!ticker || typeof ticker !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Ticker is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate ticker format: alphanumeric, dots, dashes only; max 10 chars
    const tickerRegex = /^[A-Za-z0-9.-]{1,10}$/;
    if (!tickerRegex.test(ticker)) {
      return new Response(
        JSON.stringify({ error: 'Invalid ticker format. Use alphanumeric characters only (max 10)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedTicker = ticker.toUpperCase().trim();
    console.log(`Fetching price for ticker: ${sanitizedTicker}`);

    // Use Yahoo Finance API (unofficial)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sanitizedTicker}?interval=1d&range=1d`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(`Yahoo Finance API error: ${response.status}`);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch stock data. Check if ticker is valid.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const responseData = await response.json();
    
    const result = responseData.chart?.result?.[0];
    if (!result) {
      return new Response(
        JSON.stringify({ error: 'Ticker not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice;
    const companyName = meta.shortName || meta.longName || sanitizedTicker;
    const currency = meta.currency;
    const previousClose = meta.previousClose;
    const changePercent = ((currentPrice - previousClose) / previousClose * 100).toFixed(2);

    console.log(`Successfully fetched: ${companyName} - $${currentPrice}`);

    return new Response(
      JSON.stringify({
        ticker: sanitizedTicker,
        companyName,
        currentPrice,
        currency,
        previousClose,
        changePercent: parseFloat(changePercent),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error fetching stock price:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
