import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Rate limiting for unauthenticated users: 10 requests per hour per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_EXPIRATIONS = 8;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

async function getYahooCrumbAndCookie(): Promise<{ crumb: string; cookie: string }> {
  const consentRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual',
  });
  await consentRes.text().catch(() => {});

  const setCookies = consentRes.headers.getSetCookie?.() || [];
  let cookieStr = setCookies.map((c) => c.split(';')[0]).join('; ');

  if (!cookieStr) {
    const q2Res = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'manual',
    });
    const q2Cookies = q2Res.headers.getSetCookie?.() || [];
    cookieStr = q2Cookies.map((c) => c.split(';')[0]).join('; ');
    const crumbText = await q2Res.text();
    if (q2Res.ok && crumbText && !crumbText.includes('Too Many')) {
      return { crumb: crumbText.trim(), cookie: cookieStr };
    }
  }

  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': USER_AGENT, 'Cookie': cookieStr },
  });
  if (!crumbRes.ok) throw new Error(`Failed to get crumb: ${crumbRes.status}`);
  const crumb = await crumbRes.text();
  if (!crumb || crumb.includes('Too Many Requests')) throw new Error('Failed to obtain valid crumb');
  return { crumb: crumb.trim(), cookie: cookieStr };
}

async function fetchChain(
  ticker: string,
  auth: { crumb: string; cookie: string } | null,
  epoch?: number,
): Promise<Record<string, unknown> | null> {
  if (auth) {
    let url = `https://query2.finance.yahoo.com/v7/finance/options/${ticker}?crumb=${encodeURIComponent(auth.crumb)}`;
    if (epoch) url += `&date=${epoch}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Cookie': auth.cookie } });
      if (res.ok) {
        const data = await res.json();
        const result = data.optionChain?.result?.[0];
        if (result) return result;
      }
    } catch (e) {
      console.log(`query2 failed: ${e}`);
    }
  }

  let url = `https://query1.finance.yahoo.com/v7/finance/options/${ticker}`;
  if (epoch) url += `?date=${epoch}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) {
      const data = await res.json();
      return data.optionChain?.result?.[0] ?? null;
    }
  } catch (e) {
    console.log(`query1 failed: ${e}`);
  }
  return null;
}

interface SurfaceQuote {
  strike: number;
  expiration: string;
  timeToExpiry: number;
  type: 'call' | 'put';
  price: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  yahooIv: number;
}

function collectQuotes(chain: Record<string, unknown>, expIso: string, t: number): SurfaceQuote[] {
  const options = ((chain.options as Record<string, unknown>[]) || [])[0] || {};
  const out: SurfaceQuote[] = [];
  (['calls', 'puts'] as const).forEach((side) => {
    const list = ((options as Record<string, unknown>)[side] as Record<string, unknown>[]) || [];
    for (const c of list) {
      const bid = (c.bid as number) || 0;
      const ask = (c.ask as number) || 0;
      const last = (c.lastPrice as number) || 0;
      const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
      if (!mid || mid <= 0) continue;
      out.push({
        strike: c.strike as number,
        expiration: expIso,
        timeToExpiry: t,
        type: side === 'calls' ? 'call' : 'put',
        price: mid,
        bid,
        ask,
        volume: (c.volume as number) || 0,
        openInterest: (c.openInterest as number) || 0,
        yahooIv: (c.impliedVolatility as number) || 0,
      });
    }
  });
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    let isAuthenticated = false;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const token = authHeader.replace('Bearer ', '');
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      if (!authError && userData?.user) isAuthenticated = true;
    }

    if (!isAuthenticated) {
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      if (!checkRateLimit(clientIp)) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later or sign in for unlimited access.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { ticker, maxExpirations } = await req.json();
    if (!ticker || typeof ticker !== 'string') {
      return new Response(JSON.stringify({ error: 'Ticker is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!/^[A-Za-z0-9.\-^=]{1,15}$/.test(ticker)) {
      return new Response(JSON.stringify({ error: 'Invalid ticker format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sanitized = ticker.toUpperCase().trim();
    const limit = Math.min(Math.max(Number(maxExpirations) || MAX_EXPIRATIONS, 2), MAX_EXPIRATIONS);

    let auth: { crumb: string; cookie: string } | null = null;
    try {
      auth = await getYahooCrumbAndCookie();
    } catch (e) {
      console.log(`Crumb failed, falling back: ${e}`);
    }

    const base = await fetchChain(sanitized, auth);
    if (!base) {
      return new Response(JSON.stringify({ error: 'Failed to fetch options data. Yahoo Finance may be blocking server requests. Try again later.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const quote = base.quote as Record<string, unknown> | undefined;
    const underlyingPrice = (quote?.regularMarketPrice as number) || null;
    const dividendYield = ((quote?.trailingAnnualDividendYield as number) || 0);
    const epochs = ((base.expirationDates as number[]) || []).slice(0, limit);
    const now = Date.now();

    const quotes: SurfaceQuote[] = [];
    const expirations: string[] = [];

    for (let i = 0; i < epochs.length; i++) {
      const epoch = epochs[i];
      const iso = new Date(epoch * 1000).toISOString().split('T')[0];
      const t = Math.max((epoch * 1000 - now) / (365 * 24 * 60 * 60 * 1000), 0);
      if (t <= 0) continue;
      const chain = i === 0 ? base : await fetchChain(sanitized, auth, epoch);
      if (!chain) continue;
      const collected = collectQuotes(chain, iso, t);
      if (collected.length === 0) continue;
      expirations.push(iso);
      quotes.push(...collected);
    }

    if (quotes.length === 0) {
      return new Response(JSON.stringify({ error: 'No tradable option quotes available for this ticker' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Surface for ${sanitized}: ${quotes.length} quotes across ${expirations.length} expirations`);

    return new Response(JSON.stringify({
      ticker: sanitized,
      underlyingPrice,
      dividendYield,
      expirations,
      quotes,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Error building volatility surface:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
