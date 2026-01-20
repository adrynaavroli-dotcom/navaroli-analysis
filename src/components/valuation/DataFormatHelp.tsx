import { useState } from 'react';
import { HelpCircle, FileSpreadsheet, AlertTriangle, CheckCircle2, Download, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { AnalysisTemplateType } from '@/types/valuation';

interface DataFormatHelpProps {
  templateType?: AnalysisTemplateType;
}

const TEMPLATE_REQUIREMENTS: Record<AnalysisTemplateType, {
  required: string[];
  optional: string[];
  description: string;
}> = {
  dcf: {
    required: [
      'Revenue (historical + projections)',
      'EBIT or Operating Income',
      'Free Cash Flow (or components: EBITDA, CapEx, D&A)',
      'Total Debt',
      'Cash & Equivalents',
      'Shares Outstanding',
    ],
    optional: [
      'Tax Rate',
      'Working Capital Changes',
      'Interest Expense',
      'Dividends',
    ],
    description: 'For DCF models, you need historical financial data to project future cash flows and calculate intrinsic value.',
  },
  comparables: {
    required: [
      'Revenue (TTM)',
      'EBITDA (TTM)',
      'Net Income',
      'Total Enterprise Value or Market Cap',
    ],
    optional: [
      'EV/Revenue',
      'EV/EBITDA',
      'P/E Ratio',
      'P/B Ratio',
    ],
    description: 'For comparable analysis, you need current financial metrics to compare against peer companies.',
  },
  lbo: {
    required: [
      'Revenue',
      'EBITDA',
      'Total Debt',
      'Cash',
      'CapEx',
      'Working Capital',
    ],
    optional: [
      'Interest Rate',
      'Debt Schedule',
      'Exit Multiple',
    ],
    description: 'LBO models require detailed cash flow and debt information to model leveraged transactions.',
  },
  sum_of_parts: {
    required: [
      'Segment Revenue (by business unit)',
      'Segment EBIT or EBITDA',
    ],
    optional: [
      'Segment Assets',
      'Segment CapEx',
    ],
    description: 'Sum-of-parts valuation requires financial data broken down by business segment.',
  },
  custom: {
    required: [
      'Revenue',
      'Net Income',
    ],
    optional: [
      'Any financial metrics relevant to your analysis',
    ],
    description: 'Custom analysis allows you to upload any financial data and map it as needed.',
  },
};

const EXAMPLE_FORMATS = [
  {
    name: 'Markets.sh Export',
    description: 'Standard financial statements export',
    structure: `
| Metric              | 2019    | 2020    | 2021    | 2022    | 2023    |
|---------------------|---------|---------|---------|---------|---------|
| Revenue             | 25,000  | 27,500  | 31,000  | 35,000  | 40,000  |
| Gross Profit        | 10,000  | 11,500  | 13,500  | 15,500  | 18,000  |
| Operating Income    | 5,000   | 5,800   | 7,000   | 8,200   | 10,000  |
| Net Income          | 3,500   | 4,100   | 5,000   | 6,000   | 7,500   |
    `.trim(),
  },
  {
    name: 'Yahoo Finance Export',
    description: 'Date-based column headers',
    structure: `
| Breakdown           | 12/31/2023 | 12/31/2022 | 12/31/2021 | 12/31/2020 |
|---------------------|------------|------------|------------|------------|
| Total Revenue       | 40,000     | 35,000     | 31,000     | 27,500     |
| Cost of Revenue     | 22,000     | 19,500     | 17,500     | 16,000     |
| Operating Expense   | 8,000      | 7,300      | 6,500      | 5,700      |
    `.trim(),
  },
  {
    name: 'QuickFS / Tikr Export',
    description: 'Fiscal year column headers',
    structure: `
| Line Item           | FY2019  | FY2020  | FY2021  | FY2022  | FY2023  |
|---------------------|---------|---------|---------|---------|---------|
| Revenues            | 25,000  | 27,500  | 31,000  | 35,000  | 40,000  |
| COGS                | 15,000  | 16,000  | 17,500  | 19,500  | 22,000  |
| EBITDA              | 6,500   | 7,500   | 9,000   | 10,500  | 12,500  |
    `.trim(),
  },
];

const TIPS = [
  {
    type: 'success',
    title: 'Years in columns',
    description: 'Place years as column headers (2019, 2020, 2021...) with metrics as row labels.',
  },
  {
    type: 'success',
    title: 'Consistent units',
    description: 'Use the same scale throughout (millions, thousands). The parser handles commas and currency symbols.',
  },
  {
    type: 'success',
    title: 'Standard naming',
    description: 'Use common metric names (Revenue, EBITDA, Net Income). The system recognizes 80+ aliases.',
  },
  {
    type: 'warning',
    title: 'Avoid merged cells',
    description: 'Merged cells in Excel can cause parsing issues. Unmerge before exporting.',
  },
  {
    type: 'warning',
    title: 'Clean headers',
    description: 'Remove extra rows above your data table (logos, titles). Keep headers in the first row.',
  },
  {
    type: 'warning',
    title: 'One statement per file',
    description: 'Upload Income Statement, Balance Sheet, and Cash Flow as separate files for best results.',
  },
];

export function DataFormatHelp({ templateType = 'dcf' }: DataFormatHelpProps) {
  const [open, setOpen] = useState(false);
  const requirements = TEMPLATE_REQUIREMENTS[templateType];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <HelpCircle className="h-4 w-4" />
          Data Format Help
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            How to Format Your Financial Data
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(85vh-100px)] pr-4">
          <Tabs defaultValue="requirements" className="w-full">
            <TabsList className="w-full grid grid-cols-3 mb-4">
              <TabsTrigger value="requirements">Requirements</TabsTrigger>
              <TabsTrigger value="examples">Examples</TabsTrigger>
              <TabsTrigger value="tips">Tips</TabsTrigger>
            </TabsList>
            
            <TabsContent value="requirements" className="space-y-4">
              <div className="p-4 border border-border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">{templateType.toUpperCase()}</Badge>
                  <span className="font-medium">Template</span>
                </div>
                <p className="text-sm text-muted-foreground">{requirements.description}</p>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Required Data
                </h4>
                <ul className="space-y-2">
                  {requirements.required.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm pl-6">
                      <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  Optional Data
                </h4>
                <ul className="space-y-2">
                  {requirements.optional.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm pl-6 text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* All template requirements */}
              <div className="pt-4 border-t mt-4">
                <h4 className="font-medium mb-3">All Template Types</h4>
                <div className="space-y-2">
                  {(Object.entries(TEMPLATE_REQUIREMENTS) as [AnalysisTemplateType, typeof requirements][])
                    .filter(([key]) => key !== templateType)
                    .map(([key, req]) => (
                      <Collapsible key={key}>
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{key.toUpperCase()}</Badge>
                            <span className="text-sm text-muted-foreground">{req.required.length} required fields</span>
                          </div>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-3 py-2">
                          <p className="text-sm text-muted-foreground mb-2">{req.description}</p>
                          <div className="flex flex-wrap gap-1">
                            {req.required.map((item, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {item.split('(')[0].trim()}
                              </Badge>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="examples" className="space-y-4">
              {EXAMPLE_FORMATS.map((example, idx) => (
                <div key={idx} className="border border-border rounded-lg overflow-hidden">
                  <div className="p-3 bg-muted/30 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{example.name}</h4>
                        <p className="text-xs text-muted-foreground">{example.description}</p>
                      </div>
                      <Badge variant="outline">Supported</Badge>
                    </div>
                  </div>
                  <div className="p-3">
                    <pre className="text-xs font-mono overflow-x-auto bg-background p-3 rounded border">
                      {example.structure}
                    </pre>
                  </div>
                </div>
              ))}
              
              <div className="p-4 border border-dashed border-border rounded-lg text-center">
                <Download className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Need a template?</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Use the JSON import feature with the provided template structure
                </p>
                <Badge variant="secondary">JSON Import Available</Badge>
              </div>
            </TabsContent>
            
            <TabsContent value="tips" className="space-y-3">
              {TIPS.map((tip, idx) => (
                <div 
                  key={idx} 
                  className={`p-4 border rounded-lg ${
                    tip.type === 'success' 
                      ? 'border-success/30 bg-success/5' 
                      : 'border-warning/30 bg-warning/5'
                  }`}
                >
                  <div className="flex gap-3">
                    {tip.type === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h4 className="font-medium text-sm">{tip.title}</h4>
                      <p className="text-sm text-muted-foreground">{tip.description}</p>
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="p-4 border border-primary/30 rounded-lg bg-primary/5 mt-4">
                <h4 className="font-medium text-sm mb-2">🧠 Auto-Detection Features</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Automatically detects year columns from headers</li>
                  <li>• Recognizes 80+ metric name variations</li>
                  <li>• Handles multiple date formats (MM/DD/YY, FY2023, etc.)</li>
                  <li>• Parses currency symbols and negative numbers in parentheses</li>
                  <li>• Detects statement type from filename and content</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
