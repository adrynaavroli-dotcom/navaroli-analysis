import { useState, useCallback } from 'react';
import { Loader2, Search, Download, Key, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { ConsolidatedYear } from '@/lib/financial-consolidator';

interface ApiProvider {
  id: string;
  name: string;
  description: string;
  freeLimit: string;
  keyRequired: boolean;
  endpoints: string[];
}

const API_PROVIDERS: ApiProvider[] = [
  {
    id: 'fmp',
    name: 'Financial Modeling Prep',
    description: 'Comprehensive financial data API with 250 free daily requests',
    freeLimit: '250 requests/day',
    keyRequired: true,
    endpoints: ['Income Statement', 'Balance Sheet', 'Cash Flow', 'Ratios'],
  },
  {
    id: 'alphavantage',
    name: 'Alpha Vantage',
    description: 'Free stock APIs with 25 requests per day on free tier',
    freeLimit: '25 requests/day',
    keyRequired: true,
    endpoints: ['Income Statement', 'Balance Sheet', 'Cash Flow'],
  },
  {
    id: 'yahoo',
    name: 'Yahoo Finance',
    description: 'Basic stock data available without API key',
    freeLimit: 'Unlimited (rate limited)',
    keyRequired: false,
    endpoints: ['Quote', 'Statistics', 'Financials'],
  },
];

interface ApiKey {
  providerId: string;
  key: string;
  addedAt: string;
  requestsUsed?: number;
}

interface AutoFetchPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: string;
  onDataFetched: (data: ConsolidatedYear[]) => void;
}

export function AutoFetchPanel({
  open,
  onOpenChange,
  ticker,
  onDataFetched,
}: AutoFetchPanelProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'fetch' | 'keys'>('fetch');
  const [selectedProvider, setSelectedProvider] = useState<string>('fmp');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<{
    success: boolean;
    message: string;
    data?: ConsolidatedYear[];
  } | null>(null);
  
  // API Keys management
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(() => {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem('financial-api-keys');
    return stored ? JSON.parse(stored) : [];
  });
  const [newKeyProvider, setNewKeyProvider] = useState<string>('fmp');
  const [newKeyValue, setNewKeyValue] = useState('');

  const saveApiKeys = useCallback((keys: ApiKey[]) => {
    setApiKeys(keys);
    localStorage.setItem('financial-api-keys', JSON.stringify(keys));
  }, []);

  const addApiKey = useCallback(() => {
    if (!newKeyValue.trim()) return;
    
    const updated = [
      ...apiKeys.filter(k => k.providerId !== newKeyProvider),
      {
        providerId: newKeyProvider,
        key: newKeyValue.trim(),
        addedAt: new Date().toISOString(),
      },
    ];
    saveApiKeys(updated);
    setNewKeyValue('');
    toast({
      title: 'API Key saved',
      description: `${API_PROVIDERS.find(p => p.id === newKeyProvider)?.name} key has been stored locally.`,
    });
  }, [apiKeys, newKeyProvider, newKeyValue, saveApiKeys, toast]);

  const removeApiKey = useCallback((providerId: string) => {
    const updated = apiKeys.filter(k => k.providerId !== providerId);
    saveApiKeys(updated);
  }, [apiKeys, saveApiKeys]);

  const getApiKey = useCallback((providerId: string): string | null => {
    return apiKeys.find(k => k.providerId === providerId)?.key || null;
  }, [apiKeys]);

  const handleFetch = useCallback(async () => {
    const provider = API_PROVIDERS.find(p => p.id === selectedProvider);
    if (!provider) return;

    if (provider.keyRequired) {
      const key = getApiKey(selectedProvider);
      if (!key) {
        toast({
          title: 'API Key required',
          description: `Please add your ${provider.name} API key first.`,
          variant: 'destructive',
        });
        setActiveTab('keys');
        return;
      }
    }

    setIsFetching(true);
    setFetchResult(null);

    try {
      // For now, we'll simulate the fetch since we need actual API implementation
      // In production, this would call a Supabase Edge Function
      
      if (selectedProvider === 'yahoo') {
        // Yahoo Finance is available through our existing edge function
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-stock-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ ticker }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch from Yahoo Finance');
        }
        
        const data = await response.json();
        
        // Yahoo Finance only returns current data, not historical
        setFetchResult({
          success: true,
          message: `Retrieved current data for ${ticker}. Note: Yahoo Finance provides limited historical data.`,
          data: [], // Would need FMP/Alpha Vantage for full historical
        });
        
        toast({
          title: 'Partial data retrieved',
          description: 'Yahoo Finance provides current data only. Use FMP or Alpha Vantage for historical statements.',
        });
      } else {
        // FMP and Alpha Vantage would need edge function implementation
        toast({
          title: 'Coming soon',
          description: `${provider.name} integration requires API key configuration in backend.`,
        });
        setFetchResult({
          success: false,
          message: `${provider.name} integration is being set up. Please configure your API key in the backend.`,
        });
      }
    } catch (error) {
      console.error('Fetch error:', error);
      setFetchResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch data',
      });
    } finally {
      setIsFetching(false);
    }
  }, [selectedProvider, ticker, getApiKey, toast]);

  const hasKeyForProvider = (providerId: string) => 
    apiKeys.some(k => k.providerId === providerId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Auto-Fetch Financial Data
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'fetch' | 'keys')}>
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="fetch">Fetch Data</TabsTrigger>
            <TabsTrigger value="keys" className="gap-2">
              API Keys
              {apiKeys.length > 0 && (
                <Badge variant="secondary" className="h-5 w-5 p-0 justify-center">
                  {apiKeys.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fetch" className="space-y-4 pt-4">
            <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-muted/30">
              <Search className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{ticker}</p>
                <p className="text-sm text-muted-foreground">Fetching financial statements</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Data Provider</Label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {API_PROVIDERS.map(provider => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <div className="flex items-center gap-2">
                        <span>{provider.name}</span>
                        {hasKeyForProvider(provider.id) && (
                          <CheckCircle2 className="h-3 w-3 text-success" />
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Provider Details */}
            {selectedProvider && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {API_PROVIDERS.find(p => p.id === selectedProvider)?.name}
                  </CardTitle>
                  <CardDescription>
                    {API_PROVIDERS.find(p => p.id === selectedProvider)?.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Free tier limit:</span>
                    <Badge variant="outline">
                      {API_PROVIDERS.find(p => p.id === selectedProvider)?.freeLimit}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">API Key:</span>
                    {hasKeyForProvider(selectedProvider) ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Configured
                      </Badge>
                    ) : API_PROVIDERS.find(p => p.id === selectedProvider)?.keyRequired ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Required
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not required</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-2">
                    {API_PROVIDERS.find(p => p.id === selectedProvider)?.endpoints.map((ep, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {ep}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Fetch Result */}
            {fetchResult && (
              <div className={`p-4 rounded-lg border ${
                fetchResult.success 
                  ? 'border-success/30 bg-success/5' 
                  : 'border-destructive/30 bg-destructive/5'
              }`}>
                <div className="flex gap-2">
                  {fetchResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                  )}
                  <p className="text-sm">{fetchResult.message}</p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="keys" className="space-y-4 pt-4">
            <div className="p-4 border border-border rounded-lg bg-muted/30">
              <div className="flex gap-2 mb-2">
                <Key className="h-5 w-5 text-muted-foreground" />
                <p className="font-medium">API Key Management</p>
              </div>
              <p className="text-sm text-muted-foreground">
                API keys are stored locally in your browser. They are used to fetch data from financial APIs.
                Configure multiple keys to balance usage across free tier limits.
              </p>
            </div>

            {/* Add new key */}
            <div className="space-y-3">
              <Label>Add API Key</Label>
              <div className="flex gap-2">
                <Select value={newKeyProvider} onValueChange={setNewKeyProvider}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {API_PROVIDERS.filter(p => p.keyRequired).map(provider => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Enter API key..."
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  type="password"
                  className="flex-1"
                />
                <Button onClick={addApiKey} disabled={!newKeyValue.trim()}>
                  Add
                </Button>
              </div>
            </div>

            {/* Existing keys */}
            <div className="space-y-2">
              <Label>Configured Keys</Label>
              {apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No API keys configured yet
                </p>
              ) : (
                <div className="space-y-2">
                  {apiKeys.map(key => {
                    const provider = API_PROVIDERS.find(p => p.id === key.providerId);
                    return (
                      <div 
                        key={key.providerId}
                        className="flex items-center justify-between p-3 border border-border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-4 w-4 text-success" />
                          <div>
                            <p className="font-medium text-sm">{provider?.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Added {new Date(key.addedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => removeApiKey(key.providerId)}
                        >
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Provider links */}
            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">Get your free API keys:</p>
              <div className="space-y-1 text-sm">
                <a 
                  href="https://site.financialmodelingprep.com/developer" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline block"
                >
                  → Financial Modeling Prep (250 free requests/day)
                </a>
                <a 
                  href="https://www.alphavantage.co/support/#api-key" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline block"
                >
                  → Alpha Vantage (25 free requests/day)
                </a>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleFetch} 
            disabled={isFetching}
          >
            {isFetching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <RefreshCw className="h-4 w-4 mr-2" />
            Fetch Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
