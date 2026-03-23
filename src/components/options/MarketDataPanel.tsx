import { useState, useCallback, useMemo } from 'react';
import { Loader2, TrendingUp, TrendingDown, Activity, Download, BarChart3 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface OptionContract {
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  contractSymbol: string;
  expiration: string;
  change: number;
  percentChange: number;
}

interface OptionsChainData {
  ticker: string;
  underlyingPrice: number;
  expirationDates: string[];
  selectedExpiration: string | null;
  calls: OptionContract[];
  puts: OptionContract[];
}

interface VolatilityData {
  ticker: string;
  volatility: Record<string, number>;
  currentPrice: number | null;
  priceHistory: { date: string; price: number }[];
  dailyReturns: number[];
}

interface MarketDataPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: string;
  onApplyStrike?: (strike: number, expiration: string, iv: number) => void;
  onApplyVolatility?: (vol: number) => void;
}

export function MarketDataPanel({
  open,
  onOpenChange,
  ticker,
  onApplyStrike,
  onApplyVolatility,
}: MarketDataPanelProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'chain' | 'volatility'>('chain');
  const [loading, setLoading] = useState(false);
  const [chainData, setChainData] = useState<OptionsChainData | null>(null);
  const [volData, setVolData] = useState<VolatilityData | null>(null);
  const [selectedExpiration, setSelectedExpiration] = useState<string>('');
  const [chainType, setChainType] = useState<'calls' | 'puts'>('calls');

  const fetchChain = useCallback(async (expDate?: string) => {
    if (!ticker.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-options-chain', {
        body: { ticker: ticker.trim().toUpperCase(), expirationDate: expDate },
      });
      if (error || data?.error) {
        toast({
          title: 'Error',
          description: data?.error || 'Failed to fetch options chain',
          variant: 'destructive',
        });
      } else {
        setChainData(data);
        if (data.expirationDates?.length > 0 && !expDate) {
          setSelectedExpiration(data.expirationDates[0]);
        }
      }
    } catch (e) {
      console.error('Options chain error:', e);
      toast({ title: 'Error', description: 'Connection error', variant: 'destructive' });
    }
    setLoading(false);
  }, [ticker, toast]);

  const fetchVolatility = useCallback(async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-historical-volatility', {
        body: { ticker: ticker.trim().toUpperCase(), period: '1y' },
      });
      if (error || data?.error) {
        toast({
          title: 'Error',
          description: data?.error || 'Failed to fetch volatility data',
          variant: 'destructive',
        });
      } else {
        setVolData(data);
      }
    } catch (e) {
      console.error('Volatility error:', e);
      toast({ title: 'Error', description: 'Connection error', variant: 'destructive' });
    }
    setLoading(false);
  }, [ticker, toast]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as 'chain' | 'volatility');
    if (tab === 'chain' && !chainData) fetchChain();
    if (tab === 'volatility' && !volData) fetchVolatility();
  };

  const handleExpirationChange = (exp: string) => {
    setSelectedExpiration(exp);
    fetchChain(exp);
  };

  const handleOpen = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (isOpen && !chainData && !loading) {
      fetchChain();
    }
  };

  const contracts = chainType === 'calls' ? (chainData?.calls || []) : (chainData?.puts || []);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Market Data — {ticker.toUpperCase()}
            {chainData?.underlyingPrice && (
              <Badge variant="outline" className="font-mono ml-2">
                ${chainData.underlyingPrice.toFixed(2)}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="chain">Options Chain</TabsTrigger>
            <TabsTrigger value="volatility">Historical Volatility</TabsTrigger>
          </TabsList>

          <TabsContent value="chain" className="space-y-3 pt-2">
            {loading && !chainData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading options chain...</span>
              </div>
            ) : chainData ? (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <Select value={selectedExpiration} onValueChange={handleExpirationChange}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Expiration" />
                    </SelectTrigger>
                    <SelectContent>
                      {chainData.expirationDates.map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex border rounded-md overflow-hidden">
                    <button
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${chainType === 'calls' ? 'bg-success/20 text-success' : 'text-muted-foreground hover:bg-muted'}`}
                      onClick={() => setChainType('calls')}
                    >
                      Calls ({chainData.calls.length})
                    </button>
                    <button
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${chainType === 'puts' ? 'bg-destructive/20 text-destructive' : 'text-muted-foreground hover:bg-muted'}`}
                      onClick={() => setChainType('puts')}
                    >
                      Puts ({chainData.puts.length})
                    </button>
                  </div>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>

                <ScrollArea className="h-[400px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Strike</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Last</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Bid</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Ask</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Vol</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">OI</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">IV</th>
                        <th className="py-2 px-2"></th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-xs">
                      {contracts.map((c, i) => (
                        <tr
                          key={i}
                          className={`border-b border-border/30 hover:bg-muted/40 ${c.inTheMoney ? 'bg-accent/10' : ''}`}
                        >
                          <td className="py-1.5 px-2 font-semibold">{c.strike.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-right">{c.lastPrice.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-right">{c.bid.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-right">{c.ask.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-right text-muted-foreground">{c.volume.toLocaleString()}</td>
                          <td className="py-1.5 px-2 text-right text-muted-foreground">{c.openInterest.toLocaleString()}</td>
                          <td className="py-1.5 px-2 text-right">
                            <Badge variant="secondary" className="text-[10px] font-mono px-1">
                              {(c.impliedVolatility * 100).toFixed(1)}%
                            </Badge>
                          </td>
                          <td className="py-1.5 px-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => {
                                onApplyStrike?.(c.strike, selectedExpiration, c.impliedVolatility * 100);
                                toast({
                                  title: 'Applied',
                                  description: `Strike $${c.strike}, IV ${(c.impliedVolatility * 100).toFixed(1)}%`,
                                });
                              }}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              Use
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>

                <p className="text-[10px] text-muted-foreground text-center">
                  Data from Yahoo Finance • ~15 min delay • US equities only • Click "Use" to apply strike & IV to calculator
                </p>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Enter a ticker and fetch to see options chain</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="volatility" className="space-y-3 pt-2">
            {loading && !volData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Calculating volatility...</span>
              </div>
            ) : volData ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(volData.volatility).map(([period, vol]) => (
                    <Card key={period} className="cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => {
                        onApplyVolatility?.(vol);
                        toast({
                          title: 'Volatility applied',
                          description: `${period} realized vol: ${vol.toFixed(1)}%`,
                        });
                      }}
                    >
                      <CardContent className="p-3 text-center">
                        <p className="text-xs text-muted-foreground uppercase">{period}</p>
                        <p className="text-xl font-mono font-bold">{vol.toFixed(1)}%</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Click to apply</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Daily Returns Distribution (last 60 days)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-[2px] h-32">
                      {buildHistogram(volData.dailyReturns).map((bar, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-t-sm transition-all ${bar.value >= 0 ? 'bg-success/60' : 'bg-destructive/60'}`}
                          style={{ height: `${bar.height}%` }}
                          title={`${bar.range}: ${bar.count} days`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>Negative returns</span>
                      <span>Positive returns</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Volatility Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Data Points</p>
                        <p className="font-mono font-medium">{volData.priceHistory.length} days</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Current Price</p>
                        <p className="font-mono font-medium">${volData.currentPrice?.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Avg Daily Return</p>
                        <p className="font-mono font-medium">
                          {volData.dailyReturns.length > 0
                            ? `${(volData.dailyReturns.reduce((a, b) => a + b, 0) / volData.dailyReturns.length).toFixed(3)}%`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Max Daily Move</p>
                        <p className="font-mono font-medium">
                          {volData.dailyReturns.length > 0
                            ? `${Math.max(...volData.dailyReturns.map(Math.abs)).toFixed(2)}%`
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <p className="text-[10px] text-muted-foreground text-center">
                  Realized volatility annualized (252 trading days) • Click a period card to apply σ to calculator
                </p>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Enter a ticker to calculate historical volatility</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function buildHistogram(returns: number[]) {
  if (returns.length === 0) return [];
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const bins = 20;
  const binSize = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);

  returns.forEach(r => {
    const idx = Math.min(Math.floor((r - min) / binSize), bins - 1);
    counts[idx]++;
  });

  const maxCount = Math.max(...counts);
  return counts.map((count, i) => ({
    count,
    height: maxCount > 0 ? (count / maxCount) * 100 : 0,
    value: min + (i + 0.5) * binSize,
    range: `${(min + i * binSize).toFixed(2)}% to ${(min + (i + 1) * binSize).toFixed(2)}%`,
  }));
}
