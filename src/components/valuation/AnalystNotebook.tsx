import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pencil, Eye, Save, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AnalystNotebookProps {
  workspaceId: string;
  initialNotes?: string;
}

export function AnalystNotebook({ workspaceId, initialNotes = '' }: AnalystNotebookProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState(initialNotes);
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save with debounce
  const saveNotes = useCallback(async (content: string) => {
    if (!workspaceId) return;
    
    setIsSaving(true);
    const { error } = await supabase
      .from('analysis_workspaces')
      .update({ analyst_notes: content } as never)
      .eq('id', workspaceId);
    
    if (error) {
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setLastSaved(new Date());
    }
    setIsSaving(false);
  }, [workspaceId, toast]);

  // Debounced auto-save
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      if (notes !== initialNotes) {
        saveNotes(notes);
      }
    }, 1500); // Auto-save after 1.5s of inactivity
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [notes, initialNotes, saveNotes]);

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(e.target.value);
  };

  const placeholderText = `## Investment Thesis

### Moat Analysis
- Competitive advantages...
- Barriers to entry...

### Management Quality
- Track record...
- Capital allocation history...

### Key Risks
1. Risk factor 1
2. Risk factor 2

### Valuation Summary
My fair value estimate is...`;

  return (
    <Card className="h-full print:break-inside-avoid">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Analyst Notes
          </CardTitle>
          <div className="flex items-center gap-2">
            {isSaving && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </Badge>
            )}
            {!isSaving && lastSaved && (
              <Badge variant="outline" className="text-xs gap-1">
                <Save className="h-3 w-3" />
                Saved {lastSaved.toLocaleTimeString()}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'write' | 'preview')}>
          <TabsList className="mb-3">
            <TabsTrigger value="write" className="text-xs gap-1">
              <Pencil className="h-3 w-3" />
              Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs gap-1">
              <Eye className="h-3 w-3" />
              Preview
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="write" className="mt-0">
            <Textarea
              value={notes}
              onChange={handleNotesChange}
              placeholder={placeholderText}
              className="min-h-[300px] font-mono text-sm resize-y"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Supports Markdown. Changes are auto-saved.
            </p>
          </TabsContent>
          
          <TabsContent value="preview" className="mt-0">
            <div className="min-h-[300px] border border-border rounded-md p-4 bg-muted/20 prose prose-sm dark:prose-invert max-w-none">
              {notes ? (
                <ReactMarkdown>{notes}</ReactMarkdown>
              ) : (
                <p className="text-muted-foreground italic">No notes yet. Switch to Write tab to add your analysis.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
