import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const F = ({ children }: { children: React.ReactNode }) => (
  <div className="my-2 rounded-md bg-muted px-3 py-2 font-mono text-sm">{children}</div>
);

export function Methodology() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">7. Methodology</CardTitle>
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <section><h4 className="font-semibold text-foreground">Log returns</h4>
              <F>r_t = ln(P_t / P_(t-1))</F>
              Time-additive and symmetric. Prices are daily closes from Yahoo Finance (adjusted for splits but not necessarily for dividends).</section>
            <section><h4 className="font-semibold text-foreground">Historical volatility</h4>
              <F>σ = √252 · std(r)</F>
              Sample standard deviation (n−1) over the full sample. 252 is the trading-day annualization convention, which assumes i.i.d. returns (square-root-of-time scaling).</section>
            <section><h4 className="font-semibold text-foreground">Rolling volatility</h4>
              <F>σ_t = √252 · std(r_(t−n+1) … r_t)</F>
              Trailing window that uses only information available at t. Equal weights inside the window; values are undefined until n observations exist. Shocks enter and leave the estimate abruptly ("ghost" effects).</section>
            <section><h4 className="font-semibold text-foreground">EWMA</h4>
              <F>σ²_t = λ σ²_(t−1) + (1−λ) r²_(t−1)</F>
              Initialized with the sample variance of the first 20 returns. σ_t uses returns up to t−1, so it is an ex-ante estimate. Assumes zero mean daily return and no mean reversion to a long-run variance (unlike GARCH). λ = 0.94 is the RiskMetrics daily convention.</section>
            <section><h4 className="font-semibold text-foreground">Jarque-Bera test</h4>
              <F>JB = n/6 · (S² + (K−3)²/4) ~ χ²(2)</F>
              Asymptotic test of skewness 0 and kurtosis 3. Sensitive to sample size and to volatility clustering (returns are not i.i.d.), so rejection indicates departure from normality under the i.i.d. assumption, not a specific alternative distribution.</section>
            <section><h4 className="font-semibold text-foreground">Limitations</h4>
              All estimates are descriptive and backward-looking; they are not forecasts. Results depend on sample period, data quality and the annualization convention.</section>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
