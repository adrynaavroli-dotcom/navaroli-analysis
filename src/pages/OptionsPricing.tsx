import { useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calculator, TrendingUp, TrendingDown, Activity, BarChart3, Loader2, Grid3x3, GitBranch } from 'lucide-react';
import { SensitivityChart } from '@/components/options/SensitivityChart';
import { BinomialTreeChart } from '@/components/options/BinomialTreeChart';
import { AssetTypeSelector, inferExerciseStyle, type AssetType } from '@/components/options/AssetTypeSelector';
import {
  computeValuations,
  bsGreeks,
  DEFAULT_BINOMIAL_STEPS,
  DEFAULT_MC_SIMULATIONS,
  type OptionInputs,
  type ValuationOutput,
  type OptionGreeks,
  type ExerciseStyle,
} from '@/lib/options';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

function formatPrice(v: number | null): string {
  return v === null ? '—' : v.toFixed(4);
}

function formatGreek(v: number): string {
  return v.toFixed(6);
}

export default function OptionsPricing() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [authLoading, user, navigate]);

  const [inputs, setInputs] = useState({
    spotPrice: '100',
    strikePrice: '105',
    riskFreeRate: '5',
    dividendYield: '0',
    volatility: '25',
    expiryDate: '',
    exerciseStyle: 'european' as ExerciseStyle,
    binomialSteps: String(DEFAULT_BINOMIAL_STEPS),
    monteCarloSims: String(DEFAULT_MC_SIMULATIONS),
  });

  const [result, setResult] = useState<ValuationOutput | null>(null);
  const [greeks, setGreeks] = useState<OptionGreeks | null>(null);
  const [computing, setComputing] = useState(false);
  const [autoFetching, setAutoFetching] = useState(false);
  const [ticker, setTicker] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('stock');

  const calculateTimeToExpiry = (dateStr: string): number => {
    if (!dateStr) return 0;
    const expiry = new Date(dateStr);
    const now = new Date();
    const days = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(days / 365, 0);
  };

  const handleCompute = useCallback(() => {
    const s = parseFloat(inputs.spotPrice);
    const k = parseFloat(inputs.strikePrice);
    const r = parseFloat(inputs.riskFreeRate) / 100;
    const q = parseFloat(inputs.dividendYield) / 100;
    const sigma = parseFloat(inputs.volatility) / 100;
    const t = inputs.expiryDate ? calculateTimeToExpiry(inputs.expiryDate) : 0.25;

    if (isNaN(s) || isNaN(k) || isNaN(r) || isNaN(sigma) || s <= 0 || k <= 0 || sigma <= 0 || t <= 0) {
      return;
    }

    setComputing(true);
    // Use setTimeout to avoid blocking UI during Monte Carlo
    setTimeout(() => {
      try {
        const optionInputs: OptionInputs = {
          spotPrice: s, strikePrice: k, riskFreeRate: r, dividendYield: q,
          volatility: sigma, timeToExpiry: t,
          exerciseStyle: inputs.exerciseStyle,
          binomialSteps: parseInt(inputs.binomialSteps) || DEFAULT_BINOMIAL_STEPS,
          monteCarloSims: parseInt(inputs.monteCarloSims) || DEFAULT_MC_SIMULATIONS,
        };
        const val = computeValuations(optionInputs);
        const gr = bsGreeks(s, k, r, q, sigma, t);
        setResult(val);
        setGreeks(gr);
      } catch (e) {
        console.error('Computation error:', e);
      }
      setComputing(false);
    }, 50);
  }, [inputs]);

  const [fetchError, setFetchError] = useState('');

  const handleAutoFetch = useCallback(async () => {
    if (!ticker.trim()) return;
    setAutoFetching(true);
    setFetchError('');
    try {
      const { data, error } = await supabase.functions.invoke('fetch-stock-data', {
        body: { ticker: ticker.trim().toUpperCase() },
      });
      if (error || data?.error) {
        setFetchError(data?.error || 'Ticker not found. For European stocks use Yahoo format (e.g. MC.PA for LVMH)');
      } else if (data?.currentPrice) {
        setInputs(prev => ({ ...prev, spotPrice: String(data.currentPrice) }));
        setFetchError('');
      } else {
        setFetchError('No price data returned');
      }
    } catch (e) {
      console.error('Auto-fetch error:', e);
      setFetchError('Connection error');
    }
    setAutoFetching(false);
  }, [ticker]);

  const updateInput = (key: string, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const effectiveModel = result?.models[result.effectiveMethod];

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6 md:py-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Calculator className="h-7 w-7" />
              Options Pricing Engine
            </h1>
            <p className="text-muted-foreground mt-1">
              Black-Scholes, Binomial CRR & Monte Carlo valuation
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: Inputs */}
          <div className="lg:col-span-4 space-y-4">
            {/* Auto-Fetch */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Auto-Fetch Price</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <AssetTypeSelector
                  value={assetType}
                  onChange={(type, defaultExercise) => {
                    setAssetType(type);
                    setInputs(prev => ({ ...prev, exerciseStyle: defaultExercise }));
                  }}
                  onTickerSelect={(t) => {
                    setTicker(t);
                    const style = inferExerciseStyle(t, assetType);
                    setInputs(prev => ({ ...prev, exerciseStyle: style }));
                  }}
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="AAPL, MSFT..."
                    value={ticker}
                    onChange={e => {
                      setTicker(e.target.value);
                      const style = inferExerciseStyle(e.target.value, assetType);
                      setInputs(prev => ({ ...prev, exerciseStyle: style }));
                    }}
                    onKeyDown={e => e.key === 'Enter' && handleAutoFetch()}
                    className="font-mono"
                  />
                  <Button size="sm" onClick={handleAutoFetch} disabled={autoFetching}>
                    {autoFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Fetch'}
                  </Button>
                </div>
                {fetchError && (
                  <p className="text-xs text-destructive">{fetchError}</p>
                )}
              </CardContent>
            </Card>

            {/* Parameters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Spot Price (S)</Label>
                    <Input type="number" value={inputs.spotPrice} onChange={e => updateInput('spotPrice', e.target.value)} className="font-mono h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Strike (K)</Label>
                    <Input type="number" value={inputs.strikePrice} onChange={e => updateInput('strikePrice', e.target.value)} className="font-mono h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Risk-Free Rate (%)</Label>
                    <Input type="number" value={inputs.riskFreeRate} onChange={e => updateInput('riskFreeRate', e.target.value)} className="font-mono h-9" step="0.1" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Div. Yield (%)</Label>
                    <Input type="number" value={inputs.dividendYield} onChange={e => updateInput('dividendYield', e.target.value)} className="font-mono h-9" step="0.1" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Volatility σ (%)</Label>
                    <Input type="number" value={inputs.volatility} onChange={e => updateInput('volatility', e.target.value)} className="font-mono h-9" step="0.5" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Expiry Date</Label>
                    <Input type="date" value={inputs.expiryDate} onChange={e => updateInput('expiryDate', e.target.value)} className="font-mono h-9" />
                  </div>
                </div>

                <Separator />

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Exercise Style</Label>
                  <Select value={inputs.exerciseStyle} onValueChange={v => updateInput('exerciseStyle', v)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="european">European</SelectItem>
                      <SelectItem value="american">American</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Binomial Steps</Label>
                    <Input type="number" value={inputs.binomialSteps} onChange={e => updateInput('binomialSteps', e.target.value)} className="font-mono h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">MC Simulations</Label>
                    <Input type="number" value={inputs.monteCarloSims} onChange={e => updateInput('monteCarloSims', e.target.value)} className="font-mono h-9" />
                  </div>
                </div>

                <Button onClick={handleCompute} className="w-full" disabled={computing}>
                  {computing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Computing...</> : <><Calculator className="h-4 w-4 mr-2" /> Calculate</>}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: Results */}
          <div className="lg:col-span-8 space-y-4">
            {!result ? (
              <Card className="flex items-center justify-center min-h-[400px]">
                <div className="text-center text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Enter parameters and click Calculate</p>
                </div>
              </Card>
            ) : (
              <Tabs defaultValue="summary" className="space-y-4">
                <TabsList className="grid grid-cols-5 w-full max-w-2xl">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="greeks">Greeks</TabsTrigger>
                  <TabsTrigger value="sensitivity">Sensitivity</TabsTrigger>
                  <TabsTrigger value="tree">Tree</TabsTrigger>
                  <TabsTrigger value="compare">Compare</TabsTrigger>
                </TabsList>

                {/* Summary Tab */}
                <TabsContent value="summary" className="space-y-4">
                  {/* Effective Model Result */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">
                          Effective Model
                        </CardTitle>
                        <Badge variant="outline" className="font-mono text-xs">
                          {result.effectiveLabel}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <TrendingUp className="h-3.5 w-3.5 text-success" />
                            CALL
                          </div>
                          <p className="text-3xl font-bold font-mono tracking-tight">
                            {formatPrice(effectiveModel?.call ?? null)}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                            PUT
                          </div>
                          <p className="text-3xl font-bold font-mono tracking-tight">
                            {formatPrice(effectiveModel?.put ?? null)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Quick Greeks */}
                  {greeks && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Call Δ', value: greeks.callDelta, color: 'text-success' },
                        { label: 'Put Δ', value: greeks.putDelta, color: 'text-destructive' },
                        { label: 'Γ', value: greeks.gamma },
                        { label: 'Vega', value: greeks.vega },
                      ].map(g => (
                        <Card key={g.label}>
                          <CardContent className="p-3">
                            <p className="text-xs text-muted-foreground">{g.label}</p>
                            <p className={`text-lg font-mono font-semibold ${g.color || ''}`}>
                              {formatGreek(g.value)}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Greeks Tab */}
                <TabsContent value="greeks">
                  {greeks && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <BarChart3 className="h-4 w-4" />
                          Black-Scholes Greeks
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 px-3 text-muted-foreground font-medium">Greek</th>
                                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Call</th>
                                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Put</th>
                              </tr>
                            </thead>
                            <tbody className="font-mono">
                              <tr className="border-b border-border/50">
                                <td className="py-2 px-3">Delta (Δ)</td>
                                <td className="py-2 px-3 text-right text-success">{formatGreek(greeks.callDelta)}</td>
                                <td className="py-2 px-3 text-right text-destructive">{formatGreek(greeks.putDelta)}</td>
                              </tr>
                              <tr className="border-b border-border/50">
                                <td className="py-2 px-3">Gamma (Γ)</td>
                                <td className="py-2 px-3 text-right" colSpan={2}>{formatGreek(greeks.gamma)}</td>
                              </tr>
                              <tr className="border-b border-border/50">
                                <td className="py-2 px-3">Vega (ν)</td>
                                <td className="py-2 px-3 text-right" colSpan={2}>{formatGreek(greeks.vega)}</td>
                              </tr>
                              <tr className="border-b border-border/50">
                                <td className="py-2 px-3">Theta (Θ)</td>
                                <td className="py-2 px-3 text-right text-destructive">{formatGreek(greeks.callTheta)}</td>
                                <td className="py-2 px-3 text-right text-destructive">{formatGreek(greeks.putTheta)}</td>
                              </tr>
                              <tr>
                                <td className="py-2 px-3">Rho (ρ)</td>
                                <td className="py-2 px-3 text-right">{formatGreek(greeks.callRho)}</td>
                                <td className="py-2 px-3 text-right">{formatGreek(greeks.putRho)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Sensitivity Tab */}
                <TabsContent value="sensitivity">
                  <SensitivityChart
                    spotPrice={parseFloat(inputs.spotPrice)}
                    strikePrice={parseFloat(inputs.strikePrice)}
                    riskFreeRate={parseFloat(inputs.riskFreeRate) / 100}
                    dividendYield={parseFloat(inputs.dividendYield) / 100}
                    volatility={parseFloat(inputs.volatility) / 100}
                    timeToExpiry={inputs.expiryDate ? calculateTimeToExpiry(inputs.expiryDate) : 0.25}
                  />
                </TabsContent>

                {/* Tree Tab */}
                <TabsContent value="tree">
                  <BinomialTreeChart
                    spotPrice={parseFloat(inputs.spotPrice)}
                    strikePrice={parseFloat(inputs.strikePrice)}
                    riskFreeRate={parseFloat(inputs.riskFreeRate) / 100}
                    dividendYield={parseFloat(inputs.dividendYield) / 100}
                    volatility={parseFloat(inputs.volatility) / 100}
                    timeToExpiry={inputs.expiryDate ? calculateTimeToExpiry(inputs.expiryDate) : 0.25}
                    isAmerican={inputs.exerciseStyle === 'american'}
                  />
                </TabsContent>

                <TabsContent value="compare">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">Multi-Model Comparison</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Model</th>
                              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Call</th>
                              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Put</th>
                              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Call Δ vs Effective</th>
                              <th className="text-right py-2 px-3 text-muted-foreground font-medium">Put Δ vs Effective</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono">
                            {Object.entries(result.models).map(([key, model]) => {
                              const isEffective = key === result.effectiveMethod;
                              const refCall = effectiveModel?.call ?? 0;
                              const refPut = effectiveModel?.put ?? 0;
                              const callDiff = model.call !== null && refCall ? ((model.call - refCall) / refCall * 100) : null;
                              const putDiff = model.put !== null && refPut ? ((model.put - refPut) / refPut * 100) : null;

                              return (
                                <tr key={key} className={`border-b border-border/50 ${isEffective ? 'bg-accent/30' : ''}`}>
                                  <td className="py-2 px-3">
                                    <div className="flex items-center gap-2">
                                      {model.label}
                                      {isEffective && <Badge variant="secondary" className="text-[10px] px-1.5">Primary</Badge>}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-right">{formatPrice(model.call)}</td>
                                  <td className="py-2 px-3 text-right">{formatPrice(model.put)}</td>
                                  <td className={`py-2 px-3 text-right ${isEffective ? '' : callDiff !== null ? (Math.abs(callDiff) < 1 ? 'text-success' : 'text-muted-foreground') : ''}`}>
                                    {isEffective ? '—' : callDiff !== null ? `${callDiff >= 0 ? '+' : ''}${callDiff.toFixed(2)}%` : '—'}
                                  </td>
                                  <td className={`py-2 px-3 text-right ${isEffective ? '' : putDiff !== null ? (Math.abs(putDiff) < 1 ? 'text-success' : 'text-muted-foreground') : ''}`}>
                                    {isEffective ? '—' : putDiff !== null ? `${putDiff >= 0 ? '+' : ''}${putDiff.toFixed(2)}%` : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
