import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fredApiKey = Deno.env.get('FRED_API_KEY')?.trim();
    if (!fredApiKey) {
      return new Response(
        JSON.stringify({ error: 'FRED_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const seriesId = url.searchParams.get('series_id');
    const observationStart = url.searchParams.get('observation_start') || '2015-01-01';
    const frequency = url.searchParams.get('frequency') || '';

    if (!seriesId) {
      return new Response(
        JSON.stringify({ error: 'series_id parameter required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate series_id format (alphanumeric + underscores, max 20 chars)
    if (!/^[A-Z0-9_]{1,20}$/i.test(seriesId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid series_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fredUrl = new URL('https://api.stlouisfed.org/fred/series/observations');
    fredUrl.searchParams.set('series_id', seriesId.toUpperCase());
    fredUrl.searchParams.set('api_key', fredApiKey);
    fredUrl.searchParams.set('file_type', 'json');
    fredUrl.searchParams.set('observation_start', observationStart);
    fredUrl.searchParams.set('sort_order', 'asc');
    if (frequency) {
      fredUrl.searchParams.set('frequency', frequency);
    }

    const fredResponse = await fetch(fredUrl.toString());

    if (!fredResponse.ok) {
      const errorText = await fredResponse.text();
      console.error('FRED API error:', fredResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `FRED API error: ${fredResponse.status}` }),
        { status: fredResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fredData = await fredResponse.json();

    // Transform to simplified format
    const observations = (fredData.observations || [])
      .filter((obs: { value: string }) => obs.value !== '.')
      .map((obs: { date: string; value: string }) => ({
        date: obs.date,
        value: parseFloat(obs.value),
      }));

    return new Response(
      JSON.stringify({
        series_id: seriesId.toUpperCase(),
        count: observations.length,
        data: observations,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // Cache 1 hour
        },
      }
    );
  } catch (error: unknown) {
    console.error('Error in fetch-fred-data:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
