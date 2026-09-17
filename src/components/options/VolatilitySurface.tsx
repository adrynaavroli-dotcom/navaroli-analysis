import { useCallback, useMemo, useState } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Box, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { buildVolSurface, type SurfaceAxis, type SurfaceQuote, type VolSurface } from '@/lib/options/vol-surface';

const Plot = createPlotlyComponent(Plotly);

interface VolatilitySurfaceProps {
  defaultTicker?: string;
  riskFreeRate: number;   // decimal
  dividendYield: number;  // decimal
}

type ColorScale = 'Viridis' | 'Jet';

export function VolatilitySurface({ defaultTicker = '', riskFreeRate, dividendYield }: VolatilitySurfaceProps) {
  const [ticker, setTicker] = useState(defaultTicker);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [axis, setAxis] = useState<SurfaceAxis>('logMoneyness');
  const [colorscale, setColorscale] = useState<ColorScale>('Viridis');
  const [raw, setRaw] = useState<{ quotes: SurfaceQuote[]; spot: number; ticker: string } | null>(null);

  const fetchSurface = useCallback(async () => {
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) {
      setError('Enter a ticker symbol first');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('fetch-vol-surface', {
        body: { ticker: symbol },
      });
      if (fnError || data?.error) {
        setError(data?.error || 'Failed to fetch option chains');
        setRaw(null);
      } else if (!data?.underlyingPrice) {
        setError('No underlying price returned for this ticker');
        setRaw(null);
      } else {
        setRaw({ quotes: data.quotes as SurfaceQuote[], spot: data.underlyingPrice as number, ticker: symbol });
      }
    } catch (e) {
      console.error('Volatility surface error:', e);
      setError('Connection error while fetching option chains');
      setRaw(null);
    }
    setLoading(false);
  }, [ticker]);

  const surface: VolSurface | null = useMemo(() => {
    if (!raw) return null;
    return buildVolSurface(raw.quotes, {
      spot: raw.spot,
      riskFreeRate,
      dividendYield,
      axis,
    });
  }, [raw, axis, riskFreeRate, dividendYield]);

  const plotData = useMemo(() => {
    if (!surface) return [];
    const hover = surface.z.map((row, i) =>
      row.map((iv, j) => {
        const strike = surface.strikeGrid[i][j];
        const price = surface.priceGrid[i][j];
        return [
          `Expiry: ${surface.expirations[i]} (${surface.y[i].toFixed(2)}y)`,
          `Strike: ${strike !== null ? strike.toFixed(2) : '—'}`,
          surface.axis === 'logMoneyness' ? `Log-moneyness: ${surface.x[j].toFixed(3)}` : '',
          `Implied Vol: ${iv !== null ? iv.toFixed(2) + '%' : '—'}`,
          `Option Price: ${price !== null ? price.toFixed(2) : '—'}`,
        ].filter(Boolean).join('<br>');
      }),
    );

    return [{
      type: 'surface',
      x: surface.x,
      y: surface.y,
      z: surface.z,
      colorscale,
      connectgaps: true,
      showscale: true,
      colorbar: { title: { text: 'IV %' }, thickness: 14 },
      contours: { z: { show: true, usecolormap: true, project: { z: true } } },
      hoverinfo: 'text',
      text: hover,
    }];
  }, [surface, colorscale]);

  const layout = useMemo(() => ({
    autosize: true,
    height: 560,
    margin: { l: 0, r: 0, t: 10, b: 0 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    scene: {
      xaxis: { title: { text: axis === 'strike' ? 'Strike (K)' : 'Log-Moneyness k = ln(K/F₀)' } },
      yaxis: { title: { text: 'Time to Expiry (years)' } },
      zaxis: { title: { text: 'Implied Volatility (%)' } },
      camera: { eye: { x: 1.6, y: -1.6, z: 0.9 } },
    },
  }), [axis]);

  const config = useMemo(() => ({
    displaylogo: false,
    responsive: true,
    toImageButtonOptions: {
      format: 'png' as const,
      filename: `vol-surface-${raw?.ticker ?? 'asset'}`,
      height: 900,
      width: 1400,
      scale: 2,
    },
  }), [raw?.ticker]);

  const exportPng = useCallback(() => {
    const gd = document.querySelector('#vol-surface-plot .js-plotly-plot');
    if (gd) {
      (Plotly as { downloadImage: (gd: Element, opts: Record<string, unknown>) => void }).downloadImage(gd, {
        format: 'png', width: 1400, height: 900, scale: 2,
        filename: `vol-surface-${raw?.ticker ?? 'asset'}`,
      });
    }
  }, [raw?.ticker]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Box className="h-4 w-4" /> 3D Volatility Surface
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Ticker</Label>
              <Input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchSurface()}
                placeholder="AAPL, SPY, MC.PA..."
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">X-Axis</Label>
              <Select value={axis} onValueChange={(v) => setAxis(v as SurfaceAxis)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="logMoneyness">Log-Moneyness (k)</SelectItem>
                  <SelectItem value="strike">Strike (K)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Color Scale</Label>
              <Select value={colorscale} onValueChange={(v) => setColorscale(v as ColorScale)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Viridis">Viridis</SelectItem>
                  <SelectItem value="Jet">Jet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={fetchSurface} disabled={loading} className="flex-1">
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Building...</>
                  : <><RefreshCw className="h-4 w-4 mr-2" /> Build Surface</>}
              </Button>
              {surface && (
                <Button variant="outline" size="icon" onClick={exportPng} title="Export PNG">
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {raw && !surface && !loading && !error && (
            <p className="text-xs text-muted-foreground">
              Not enough liquid quotes across maturities to build a surface for this ticker.
            </p>
          )}

          {surface && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="font-mono">Spot {raw?.spot.toFixed(2)}</Badge>
              <Badge variant="outline">{surface.expirations.length} maturities</Badge>
              <Badge variant="outline">{surface.stats.solved} IVs solved</Badge>
              {surface.stats.atmVol !== null && (
                <Badge variant="outline">ATM IV {surface.stats.atmVol.toFixed(1)}%</Badge>
              )}
              {surface.stats.arbitrageRejected > 0 && (
                <Badge variant="secondary">{surface.stats.arbitrageRejected} arbitrage quotes dropped</Badge>
              )}
              {surface.stats.calendarAdjusted > 0 && (
                <Badge variant="secondary">{surface.stats.calendarAdjusted} calendar fixes</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {surface ? (
        <Card>
          <CardContent className="pt-4">
            <div id="vol-surface-plot">
              <Plot
                data={plotData}
                layout={layout}
                config={config}
                style={{ width: '100%' }}
                useResizeHandler
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              Implied volatilities solved from mid-market quotes via inverse Black-Scholes. Slices are
              interpolated onto a common grid; quotes breaking ∂C/∂K ≤ 0 are discarded and total variance
              w(K,T) = σ²T is forced non-decreasing in maturity. Drag to rotate, scroll to zoom.
            </p>
          </CardContent>
        </Card>
      ) : (
        !loading && (
          <Card className="flex items-center justify-center min-h-[300px]">
            <div className="text-center text-muted-foreground">
              <Box className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Enter a ticker and build the surface</p>
            </div>
          </Card>
        )
      )}
    </div>
  );
}
