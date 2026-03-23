import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StockQuote {
  ticker: string;
  companyName: string;
  currentPrice: number;
  currency: string;
  previousClose: number;
  changePercent: number;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  enterpriseToEbitda: number | null;
  profitMargins: number | null;
  grossMargins: number | null;
  returnOnEquity: number | null;
  revenueGrowth: number | null;
  sector: string | null;
  industry: string | null;
  earningsDate: string | null;
}

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
    const { data, error: authError } = await supabase.auth.getUser(token);
    if (authError || !data?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { ticker } = await req.json();
    
    // Input validation
    if (!ticker || typeof ticker !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Ticker is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate ticker format
    const tickerRegex = /^[A-Za-z0-9.\-^=]{1,15}$/;
    if (!tickerRegex.test(ticker)) {
      return new Response(
        JSON.stringify({ error: 'Invalid ticker format. Use alphanumeric characters only (max 10)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedTicker = ticker.toUpperCase().trim();
    console.log(`Fetching data for ticker: ${sanitizedTicker}`);

    // Fetch quote data (price info)
    const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sanitizedTicker}?interval=1d&range=5d`;
    const quoteResponse = await fetch(quoteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!quoteResponse.ok) {
      console.error(`Yahoo Finance API error: ${quoteResponse.status}`);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch stock data. Check if ticker is valid.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const quoteData = await quoteResponse.json();
    const chartResult = quoteData.chart?.result?.[0];
    
    if (!chartResult) {
      return new Response(
        JSON.stringify({ error: 'Ticker not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const meta = chartResult.meta;
    const currentPrice = meta.regularMarketPrice;
    const companyName = meta.shortName || meta.longName || sanitizedTicker;
    const currency = meta.currency;
    const previousClose = meta.previousClose;
    const changePercent = ((currentPrice - previousClose) / previousClose * 100);

    // Get sparkline data from the chart
    const closePrices = chartResult.indicators?.quote?.[0]?.close || [];
    const sparklineData = closePrices.filter((p: number | null) => p !== null);

    // Fetch detailed quote data with financial metrics using v7 API
    const quoteDetailsUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${sanitizedTicker}&crumb=`;
    
    let metrics: Partial<StockQuote> = {};
    
    try {
      const detailsResponse = await fetch(quoteDetailsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin': 'https://finance.yahoo.com',
          'Referer': 'https://finance.yahoo.com/',
        },
      });
      
      console.log(`Quote details response status: ${detailsResponse.status}`);
      
      if (detailsResponse.ok) {
        const detailsData = await detailsResponse.json();
        const quote = detailsData.quoteResponse?.result?.[0];
        
        if (quote) {
          console.log(`Found quote data for ${sanitizedTicker}: marketCap=${quote.marketCap}, trailingPE=${quote.trailingPE}`);

          // Get next earnings date
          let earningsDate: string | null = null;
          if (quote.earningsTimestamp) {
            earningsDate = new Date(quote.earningsTimestamp * 1000).toISOString().split('T')[0];
          } else if (quote.earningsTimestampStart) {
            earningsDate = new Date(quote.earningsTimestampStart * 1000).toISOString().split('T')[0];
          }

          metrics = {
            marketCap: quote.marketCap || null,
            trailingPE: quote.trailingPE || null,
            forwardPE: quote.forwardPE || null,
            priceToBook: quote.priceToBook || null,
            enterpriseToEbitda: null, // Not available in v7 quote
            profitMargins: null, // Not available in v7 quote
            grossMargins: null, // Not available in v7 quote
            returnOnEquity: null, // Not available in v7 quote
            revenueGrowth: null, // Not available in v7 quote
            sector: quote.sector || null,
            industry: quote.industry || null,
            earningsDate,
          };
        } else {
          console.warn('No quote data in response:', JSON.stringify(detailsData));
        }
      } else {
        const errorText = await detailsResponse.text();
        console.warn(`Quote details API returned ${detailsResponse.status}: ${errorText.substring(0, 200)}`);
      }
    } catch (metricsError) {
      console.warn('Could not fetch detailed metrics:', metricsError);
      // Continue with basic data
    }

    console.log(`Successfully fetched: ${companyName} - ${currency} ${currentPrice}`);

    const response: StockQuote = {
      ticker: sanitizedTicker,
      companyName,
      currentPrice,
      currency,
      previousClose,
      changePercent: parseFloat(changePercent.toFixed(2)),
      marketCap: metrics.marketCap || null,
      trailingPE: metrics.trailingPE || null,
      forwardPE: metrics.forwardPE || null,
      priceToBook: metrics.priceToBook || null,
      enterpriseToEbitda: metrics.enterpriseToEbitda || null,
      profitMargins: metrics.profitMargins || null,
      grossMargins: metrics.grossMargins || null,
      returnOnEquity: metrics.returnOnEquity || null,
      revenueGrowth: metrics.revenueGrowth || null,
      sector: metrics.sector || null,
      industry: metrics.industry || null,
      earningsDate: metrics.earningsDate || null,
    };

    return new Response(
      JSON.stringify({
        ...response,
        sparklineData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error fetching stock data:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
