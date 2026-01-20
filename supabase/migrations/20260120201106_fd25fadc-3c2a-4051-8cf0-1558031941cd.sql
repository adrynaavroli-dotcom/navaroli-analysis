-- Add analyst_notes column to analysis_workspaces for auto-save notebook
ALTER TABLE public.analysis_workspaces 
ADD COLUMN IF NOT EXISTS analyst_notes TEXT;

-- Create table for public thesis data (exported analyses)
CREATE TABLE public.public_thesis_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.analysis_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  
  -- DCF Results
  fair_value NUMERIC,
  current_price NUMERIC,
  upside_percent NUMERIC,
  wacc NUMERIC,
  terminal_growth NUMERIC,
  
  -- Reverse DCF
  implied_growth_rate NUMERIC,
  
  -- Selected charts data (JSON arrays for Recharts)
  growth_margins_data JSONB DEFAULT '[]'::jsonb,
  capital_efficiency_data JSONB DEFAULT '[]'::jsonb,
  capital_allocation_data JSONB DEFAULT '[]'::jsonb,
  valuation_context_data JSONB DEFAULT '[]'::jsonb,
  
  -- Export preferences
  export_config JSONB DEFAULT '{}'::jsonb,
  
  -- Analyst notes (markdown)
  analyst_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  published_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.public_thesis_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own thesis data" 
ON public.public_thesis_data 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own thesis data" 
ON public.public_thesis_data 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own thesis data" 
ON public.public_thesis_data 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own thesis data" 
ON public.public_thesis_data 
FOR DELETE 
USING (auth.uid() = user_id);

-- Public access policy for published theses
CREATE POLICY "Anyone can view published thesis data" 
ON public.public_thesis_data 
FOR SELECT 
USING (published_at IS NOT NULL);

-- Create trigger for auto-updating timestamps
CREATE TRIGGER update_public_thesis_data_updated_at
BEFORE UPDATE ON public.public_thesis_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();