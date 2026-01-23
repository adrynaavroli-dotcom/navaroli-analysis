-- Add more export data fields to public_thesis_data
ALTER TABLE public.public_thesis_data 
ADD COLUMN IF NOT EXISTS kpi_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS sensitivity_matrix JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS dcf_projections JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS base_fcf NUMERIC,
ADD COLUMN IF NOT EXISTS cash NUMERIC,
ADD COLUMN IF NOT EXISTS total_debt NUMERIC,
ADD COLUMN IF NOT EXISTS shares_outstanding NUMERIC;