import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { buildTreeLevels, type TreeNode } from '@/lib/options';
import { GitBranch } from 'lucide-react';

interface Props {
  spotPrice: number;
  strikePrice: number;
  riskFreeRate: number;
  dividendYield: number;
  volatility: number;
  timeToExpiry: number;
  isAmerican: boolean;
}

export function BinomialTreeChart({
  spotPrice, strikePrice, riskFreeRate, dividendYield,
  volatility, timeToExpiry, isAmerican,
}: Props) {
  const [displaySteps, setDisplaySteps] = useState('5');
  const [showValue, setShowValue] = useState<'call' | 'put'>('call');

  const steps = parseInt(displaySteps);

  const tree = useMemo(() => {
    if (spotPrice <= 0 || strikePrice <= 0 || volatility <= 0 || timeToExpiry <= 0) return null;
    try {
      return buildTreeLevels(spotPrice, strikePrice, riskFreeRate, dividendYield, volatility, timeToExpiry, steps, isAmerican);
    } catch {
      return null;
    }
  }, [spotPrice, strikePrice, riskFreeRate, dividendYield, volatility, timeToExpiry, steps, isAmerican]);

  if (!tree) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground text-sm">
          Invalid parameters for tree construction.
        </CardContent>
      </Card>
    );
  }

  const nodeW = 90;
  const nodeH = 56;
  const gapX = 24;
  const gapY = 8;
  const totalSteps = tree.length;
  const svgW = totalSteps * (nodeW + gapX);
  const maxNodes = totalSteps;
  const svgH = maxNodes * (nodeH + gapY) + 40;

  const getNodePos = (step: number, i: number) => {
    const nodesInStep = step + 1;
    const totalHeight = nodesInStep * nodeH + (nodesInStep - 1) * gapY;
    const startY = (svgH - totalHeight) / 2;
    const x = step * (nodeW + gapX) + 10;
    const y = startY + i * (nodeH + gapY);
    return { x, y };
  };

  const isITM = (node: TreeNode) =>
    showValue === 'call' ? node.spot > strikePrice : node.spot < strikePrice;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Binomial Tree ({isAmerican ? 'American' : 'European'})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={showValue} onValueChange={v => setShowValue(v as 'call' | 'put')}>
              <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="put">Put</SelectItem>
              </SelectContent>
            </Select>
            <Select value={displaySteps} onValueChange={setDisplaySteps}>
              <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 7, 8].map(n => (
                  <SelectItem key={n} value={String(n)}>{n} steps</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <ScrollArea className="w-full">
          <svg width={svgW} height={svgH} className="font-mono">
            {/* Lines */}
            {tree.map((level, step) =>
              step < totalSteps - 1
                ? level.map((_, i) => {
                    const from = getNodePos(step, i);
                    const to1 = getNodePos(step + 1, i);
                    const to2 = getNodePos(step + 1, i + 1);
                    return (
                      <g key={`line-${step}-${i}`}>
                        <line
                          x1={from.x + nodeW} y1={from.y + nodeH / 2}
                          x2={to1.x} y2={to1.y + nodeH / 2}
                          className="stroke-muted-foreground/30" strokeWidth={1}
                        />
                        <line
                          x1={from.x + nodeW} y1={from.y + nodeH / 2}
                          x2={to2.x} y2={to2.y + nodeH / 2}
                          className="stroke-muted-foreground/30" strokeWidth={1}
                        />
                      </g>
                    );
                  })
                : null
            )}
            {/* Nodes */}
            {tree.map((level, step) =>
              level.map((node, i) => {
                const { x, y } = getNodePos(step, i);
                const optionVal = showValue === 'call' ? node.call : node.put;
                const itm = isITM(node);
                return (
                  <g key={`node-${step}-${i}`}>
                    <rect
                      x={x} y={y} width={nodeW} height={nodeH} rx={6}
                      className={itm ? 'fill-primary/15 stroke-primary/40' : 'fill-muted/50 stroke-border'}
                      strokeWidth={1}
                    />
                    <text x={x + nodeW / 2} y={y + 16} textAnchor="middle"
                      className="fill-foreground text-[9px] font-semibold">
                      S={node.spot.toFixed(2)}
                    </text>
                    <text x={x + nodeW / 2} y={y + 30} textAnchor="middle"
                      className={`text-[9px] ${showValue === 'call' ? 'fill-emerald-500' : 'fill-red-500'}`}>
                      {showValue === 'call' ? 'C' : 'P'}={optionVal.toFixed(3)}
                    </text>
                    {step === totalSteps - 1 && (
                      <text x={x + nodeW / 2} y={y + 43} textAnchor="middle"
                        className="fill-muted-foreground text-[8px]">
                        {itm ? 'ITM' : 'OTM'}
                      </text>
                    )}
                  </g>
                );
              })
            )}
            {/* Step labels */}
            {tree.map((_, step) => {
              const x = step * (nodeW + gapX) + 10 + nodeW / 2;
              return (
                <text key={`label-${step}`} x={x} y={svgH - 5} textAnchor="middle"
                  className="fill-muted-foreground text-[9px]">
                  t={step}
                </text>
              );
            })}
          </svg>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
