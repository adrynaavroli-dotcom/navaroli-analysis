-- Create enum for template types
CREATE TYPE public.analysis_template_type AS ENUM ('dcf', 'comparables', 'lbo', 'sum_of_parts', 'custom');

-- Create analysis_workspaces table
CREATE TABLE public.analysis_workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  industry TEXT,
  template_type public.analysis_template_type NOT NULL DEFAULT 'dcf',
  raw_data JSONB DEFAULT '{}'::jsonb,
  column_mappings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.analysis_workspaces ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own workspaces" 
ON public.analysis_workspaces 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own workspaces" 
ON public.analysis_workspaces 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workspaces" 
ON public.analysis_workspaces 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workspaces" 
ON public.analysis_workspaces 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_analysis_workspaces_updated_at
BEFORE UPDATE ON public.analysis_workspaces
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();