import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Rate limiting for unauthenticated users
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function calculateRealizedVolatility(prices: number[], tradingDays: number): number {
  if (prices.length < 2) return 0;
  
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  
  if (returns.length < 2) return 0;
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  
  // Annualize: multiply std dev by sqrt(trading days per year)
  return Math.sqrt(variance * tradingDays) * 100;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Optional auth: authenticated users get unlimited access, anonymous users are rate-limited
    let isAuthenticated = false;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace('Bearer ', '');
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      if (!authError && userData?.user) {
        isAuthenticated = true;
      }
    }

    if (!isAuthenticated) {
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      if (!checkRateLimit(clientIp)) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later or sign in for unlimited access.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { ticker, period = '1y' } = await req.json();

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

    const validPeriods = ['1mo', '3mo', '6mo', '1y', '2y'];
    const safePeriod = validPeriods.includes(period) ? period : '1y';

    const sanitizedTicker = ticker.toUpperCase().trim();
    console.log(`Fetching historical data for: ${sanitizedTicker}, period: ${safePeriod}`);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sanitizedTicker}?interval=1d&range=${safePeriod}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch historical data' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const chartResult = data.chart?.result?.[0];

    if (!chartResult) {
      return new Response(JSON.stringify({ error: 'No historical data found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const timestamps = chartResult.timestamp || [];
    const closePrices: number[] = (chartResult.indicators?.quote?.[0]?.close || [])
      .filter((p: number | null) => p !== null && p > 0);

    const tradingDaysPerYear = 252;

    // Calculate volatility for multiple windows
    const vol1m = calculateRealizedVolatility(closePrices.slice(-21), tradingDaysPerYear);
    const vol3m = calculateRealizedVolatility(closePrices.slice(-63), tradingDaysPerYear);
    const vol6m = calculateRealizedVolatility(closePrices.slice(-126), tradingDaysPerYear);
    const vol1y = calculateRealizedVolatility(closePrices, tradingDaysPerYear);

    // Build price history for chart (downsample to ~50 points)
    const step = Math.max(1, Math.floor(timestamps.length / 50));
    const priceHistory = [];
    for (let i = 0; i < timestamps.length; i += step) {
      const price = chartResult.indicators?.quote?.[0]?.close?.[i];
      if (price != null) {
        priceHistory.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          price: parseFloat(price.toFixed(2)),
        });
      }
    }

    // Calculate daily returns for distribution chart
    const dailyReturns: number[] = [];
    for (let i = 1; i < closePrices.length; i++) {
      dailyReturns.push(((closePrices[i] - closePrices[i - 1]) / closePrices[i - 1]) * 100);
    }

    console.log(`Volatility: 1m=${vol1m.toFixed(1)}%, 3m=${vol3m.toFixed(1)}%, 6m=${vol6m.toFixed(1)}%, 1y=${vol1y.toFixed(1)}%`);

    return new Response(JSON.stringify({
      ticker: sanitizedTicker,
      period: safePeriod,
      dataPoints: closePrices.length,
      volatility: {
        '1m': parseFloat(vol1m.toFixed(2)),
        '3m': parseFloat(vol3m.toFixed(2)),
        '6m': parseFloat(vol6m.toFixed(2)),
        '1y': parseFloat(vol1y.toFixed(2)),
      },
      currentPrice: closePrices[closePrices.length - 1] || null,
      priceHistory,
      dailyReturns: dailyReturns.slice(-60), // last 60 daily returns
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error fetching historical volatility:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
